/**
 * Expo Push Notifications Library
 * Handles sending push notifications via Expo Push Notification service
 */

import { db } from "../db";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100; // Expo recommends max 100 messages per request

/**
 * Expo push token format: ExpoToken[...]
 */
export function isExpoPushToken(token: string): boolean {
  return token.startsWith("ExpoToken[") || token.startsWith("ExpoPushToken[");
}

/**
 * Expo push message structure
 */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
}

/**
 * Expo push receipt/error response
 */
export interface ExpoPushResponse {
  data?: Array<{
    status: "ok" | "error";
    id?: string;
    message?: string;
    details?: {
      error?: "DeviceNotRegistered" | "InvalidCredentials" | "MessageTooBig" | "MessageRateExceeded";
    };
  }>;
}

/**
 * Send push notifications via Expo Push API
 * Automatically chunks messages into batches of 100
 * Handles DeviceNotRegistered errors by marking tokens inactive
 */
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  // Filter out invalid tokens
  const validMessages = messages.filter((msg) => isExpoPushToken(msg.to));

  if (validMessages.length === 0) {
    console.log("[ExpoPush] No valid Expo tokens to send to");
    return;
  }

  // Chunk messages into batches of 100
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < validMessages.length; i += CHUNK_SIZE) {
    chunks.push(validMessages.slice(i, i + CHUNK_SIZE));
  }

  console.log(`[ExpoPush] Sending ${validMessages.length} messages in ${chunks.length} chunk(s)`);

  // Send each chunk
  for (const chunk of chunks) {
    try {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ExpoPush] HTTP error ${response.status}:`, errorText);
        continue;
      }

      const result: ExpoPushResponse = await response.json();

      // Process receipts for errors
      if (result.data) {
        for (let i = 0; i < result.data.length; i++) {
          const receipt = result.data[i];
          const message = chunk[i];

          if (receipt.status === "error") {
            console.error(`[ExpoPush] Error for token ${message.to}:`, receipt.message, receipt.details);

            // Handle DeviceNotRegistered - mark token as inactive
            if (receipt.details?.error === "DeviceNotRegistered") {
              console.log(`[ExpoPush] Marking token as inactive: ${message.to}`);
              await db.push_token.updateMany({
                where: { token: message.to },
                data: { isActive: false },
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("[ExpoPush] Error sending chunk:", error);
    }
  }
}

/**
 * Notification type for conditional logic
 */
export type NotificationType =
  | "new_event"
  | "event_update"
  | "event_cancellation"
  | "event_reminder"
  | "event_starting_soon"
  | "new_attendee"
  | "attendee_declined"
  | "someone_interested"
  | "rsvp_reminder"
  | "event_request_invite"
  | "event_request_response"
  | "event_request_confirmed"
  | "event_request_nudge"
  | "event_comment"
  | "event_photo"
  | "comment_reply"
  | "friend_request"
  | "friend_request_accepted"
  | "friend_birthday"
  | "circle_message"
  | "circle_event"
  | "circle_invite"
  | "fomo_friend_joined"
  | "fomo_popular_event"
  | "weekly_summary"
  | "reconnect_suggestion"
  | "business_event"
  | "event_reflection_prompt"
  | "test";

/**
 * Check if notification type is enabled in user preferences
 */
function isNotificationTypeEnabled(
  prefs: any,
  notificationType: NotificationType
): boolean {
  const prefMap: Record<NotificationType, string> = {
    new_event: "newFriendEvents",
    event_update: "eventUpdates",
    event_cancellation: "eventCancellations",
    event_reminder: "eventReminders",
    event_starting_soon: "eventStartingSoon",
    new_attendee: "newAttendee",
    attendee_declined: "attendeeDeclined",
    someone_interested: "someoneInterested",
    rsvp_reminder: "rsvpReminders",
    event_request_invite: "eventRequestInvites",
    event_request_response: "eventRequestResponses",
    event_request_confirmed: "eventRequestConfirmed",
    event_request_nudge: "eventRequestNudges",
    event_comment: "eventComments",
    event_photo: "eventPhotos",
    comment_reply: "commentReplies",
    friend_request: "friendRequests",
    friend_request_accepted: "friendRequestAccepted",
    friend_birthday: "friendBirthdays",
    circle_message: "circleMessages",
    circle_event: "circleEvents",
    circle_invite: "circleInvites",
    fomo_friend_joined: "fomoFriendJoined",
    fomo_popular_event: "fomoPopularEvents",
    weekly_summary: "weeklySummary",
    reconnect_suggestion: "reconnectSuggestions",
    business_event: "businessEvents",
    event_reflection_prompt: "eventReflectionPrompts",
    test: "pushEnabled", // Test notifications respect global push setting
  };

  const prefKey = prefMap[notificationType];
  if (!prefKey) {
    return true; // Default to enabled for unknown types
  }

  return prefs[prefKey] !== false; // Allow if not explicitly disabled
}

/**
 * Check if current time is within quiet hours
 */
function isWithinQuietHours(prefs: any): boolean {
  if (!prefs.quietHoursEnabled) {
    return false;
  }

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const start = prefs.quietHoursStart || "22:00";
  const end = prefs.quietHoursEnd || "08:00";

  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }

  // Handle same-day quiet hours (e.g., 13:00 to 14:00)
  return currentTime >= start && currentTime < end;
}

/**
 * Send push notification to a specific user with all conditional checks
 *
 * Checks performed:
 * 1. User preferences allow this notification type
 * 2. OS permission granted (pushPermissionStatus === "granted")
 * 3. Active tokens exist
 * 4. Not within quiet hours
 * 5. Deduplication (if dedupeKey provided)
 *
 * @param userId - Target user ID
 * @param notification - Notification content
 * @param notificationType - Type for preference checking
 * @param dedupeKey - Optional key for deduplication (e.g., "event_reminder:event123")
 */
export async function sendPushToUser(
  userId: string,
  notification: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    channelId?: string;
  },
  notificationType: NotificationType,
  dedupeKey?: string
): Promise<boolean> {
  try {
    // 1. Get user with OS permission status
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { pushPermissionStatus: true },
    });

    if (!user) {
      console.log(`[sendPushToUser] User ${userId} not found`);
      return false;
    }

    // 2. Check OS permission granted
    if (user.pushPermissionStatus !== "granted") {
      console.log(`[sendPushToUser] User ${userId} has not granted OS permission (status: ${user.pushPermissionStatus})`);
      return false;
    }

    // 3. Get user preferences
    let prefs = await db.notification_preferences.findUnique({
      where: { userId },
    });

    // Create default preferences if none exist
    if (!prefs) {
      prefs = await db.notification_preferences.create({
        data: { userId },
      });
    }

    // 4. Check if push is globally enabled
    if (!prefs.pushEnabled) {
      console.log(`[sendPushToUser] User ${userId} has disabled all push notifications`);
      return false;
    }

    // 5. Check if this notification type is enabled
    if (!isNotificationTypeEnabled(prefs, notificationType)) {
      console.log(`[sendPushToUser] User ${userId} has disabled '${notificationType}' notifications`);
      return false;
    }

    // 6. Check quiet hours
    if (isWithinQuietHours(prefs)) {
      console.log(`[sendPushToUser] User ${userId} is in quiet hours, skipping notification`);
      return false;
    }

    // 7. Check deduplication
    if (dedupeKey) {
      const existing = await db.notification_delivery_log.findUnique({
        where: {
          userId_dedupeKey: {
            userId,
            dedupeKey,
          },
        },
      });

      if (existing) {
        console.log(`[sendPushToUser] Duplicate notification for user ${userId}, dedupeKey: ${dedupeKey}`);
        return false;
      }
    }

    // 8. Get active tokens
    const tokens = await db.push_token.findMany({
      where: {
        userId,
        isActive: true,
      },
    });

    if (tokens.length === 0) {
      console.log(`[sendPushToUser] No active tokens for user ${userId}`);
      return false;
    }

    // 9. Prepare messages
    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token.token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: "default",
      channelId: notification.channelId,
    }));

    // 10. Send via Expo
    await sendExpoPush(messages);

    // 11. Record delivery for deduplication
    if (dedupeKey) {
      await db.notification_delivery_log.create({
        data: {
          userId,
          dedupeKey,
        },
      });
    }

    // 12. Update token lastSeenAt
    await db.push_token.updateMany({
      where: {
        userId,
        isActive: true,
      },
      data: {
        lastSeenAt: new Date(),
      },
    });

    console.log(`[sendPushToUser] Sent '${notificationType}' notification to user ${userId} (${tokens.length} device(s))`);
    return true;
  } catch (error) {
    console.error(`[sendPushToUser] Error sending to user ${userId}:`, error);
    return false;
  }
}
