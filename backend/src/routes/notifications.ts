import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { updateNotificationPreferencesInputSchema } from "../shared/contracts";
import { sendPushToUser, type NotificationType } from "../lib/expoPush";

export const notificationsRouter = new Hono<AppType>();

// GET /api/notifications - Get all notifications
notificationsRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await db.notification.count({
    where: { userId: user.id, read: false },
  });

  return c.json({
    notifications: notifications.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
});

// GET /api/notifications/preferences - Get notification preferences
notificationsRouter.get("/preferences", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Get or create preferences with defaults
    let preferences = await db.notification_preferences.findUnique({
      where: { userId: user.id },
    });

    if (!preferences) {
      preferences = await db.notification_preferences.create({
        data: { userId: user.id },
      });
    }

    return c.json({
      preferences: {
        ...preferences,
        createdAt: preferences.createdAt.toISOString(),
        updatedAt: preferences.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return c.json({ error: "Failed to fetch preferences" }, 500);
  }
});

// PUT /api/notifications/preferences - Update notification preferences
notificationsRouter.put("/preferences", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const validated = updateNotificationPreferencesInputSchema.parse(body);

    // Upsert preferences
    const preferences = await db.notification_preferences.upsert({
      where: { userId: user.id },
      update: validated,
      create: {
        userId: user.id,
        ...validated,
      },
    });

    return c.json({
      preferences: {
        ...preferences,
        createdAt: preferences.createdAt.toISOString(),
        updatedAt: preferences.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return c.json({ error: "Failed to update preferences" }, 500);
  }
});

// POST /api/notifications/register-token - Register push token
notificationsRouter.post("/register-token", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { token, platform = "expo" } = body;

    if (!token) {
      return c.json({ error: "Token is required" }, 400);
    }

    // Upsert the push token with active status and lastSeenAt
    await db.push_token.upsert({
      where: {
        userId_token: {
          userId: user.id,
          token,
        },
      },
      update: {
        platform,
        isActive: true,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        token,
        platform,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Error registering push token:", error);
    return c.json({ error: "Failed to register push token" }, 500);
  }
});

// POST /api/notifications/status - Update push permission status and nudge state
notificationsRouter.post("/status", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { pushPermissionStatus } = body;

    if (!pushPermissionStatus || !["granted", "denied", "unknown"].includes(pushPermissionStatus)) {
      return c.json({ error: "Invalid pushPermissionStatus" }, 400);
    }

    // Calculate nudge state based on permission status
    let notifNudgeState: string;
    const notifLastNudgedAt = new Date();

    if (pushPermissionStatus === "granted") {
      notifNudgeState = "granted";
    } else if (pushPermissionStatus === "denied") {
      notifNudgeState = "denied_once";
    } else {
      // For "unknown" or "not now", mark as nudged once
      notifNudgeState = "nudged_once";
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        pushPermissionStatus,
        notifNudgeState,
        notifLastNudgedAt,
      },
    });

    return c.json({
      success: true,
      pushPermissionStatus,
      notifNudgeState,
    });
  } catch (error) {
    console.error("Error updating notification status:", error);
    return c.json({ error: "Failed to update notification status" }, 500);
  }
});

// GET /api/notifications/nudge-eligibility - Check if user should see notification nudge
notificationsRouter.get("/nudge-eligibility", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        pushPermissionStatus: true,
        notifNudgeState: true,
        notifLastNudgedAt: true,
      },
    });

    if (!fullUser) {
      return c.json({ error: "User not found" }, 404);
    }

    const { pushPermissionStatus, notifNudgeState, notifLastNudgedAt } = fullUser;

    // Already granted - never show nudge
    if (pushPermissionStatus === "granted" || notifNudgeState === "granted") {
      return c.json({ eligible: false, reason: "already_granted" });
    }

    // Check cooldown periods
    if (notifLastNudgedAt) {
      const now = new Date();
      const daysSinceLastNudge = (now.getTime() - notifLastNudgedAt.getTime()) / (1000 * 60 * 60 * 24);

      // Denied - 14 day cooldown
      if (notifNudgeState === "denied_once" && daysSinceLastNudge < 14) {
        return c.json({
          eligible: false,
          reason: "cooldown_denied",
          cooldownDaysRemaining: Math.ceil(14 - daysSinceLastNudge),
        });
      }

      // Nudged once (not now) - 7 day cooldown
      if (notifNudgeState === "nudged_once" && daysSinceLastNudge < 7) {
        return c.json({
          eligible: false,
          reason: "cooldown_nudged",
          cooldownDaysRemaining: Math.ceil(7 - daysSinceLastNudge),
        });
      }
    }

    // Eligible to show nudge
    return c.json({ eligible: true });
  } catch (error) {
    console.error("Error checking nudge eligibility:", error);
    return c.json({ error: "Failed to check nudge eligibility" }, 500);
  }
});

// DELETE /api/notifications/unregister-token - Unregister push token (mark inactive)
notificationsRouter.delete("/unregister-token", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { token } = body;

    if (!token) {
      return c.json({ error: "Token is required" }, 400);
    }

    // Mark token as inactive instead of deleting
    await db.push_token.updateMany({
      where: {
        userId: user.id,
        token,
      },
      data: {
        isActive: false,
      },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Error unregistering push token:", error);
    return c.json({ error: "Failed to unregister push token" }, 500);
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
notificationsRouter.put("/:id/read", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const notificationId = c.req.param("id");

  await db.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { read: true },
  });

  return c.json({ success: true });
});

// PUT /api/notifications/read-all - Mark all notifications as read
notificationsRouter.put("/read-all", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await db.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });

  return c.json({ success: true });
});

// Helper function to send push notifications to a user's devices
// Now uses the new sendPushToUser from expoPush library
export async function sendPushNotification(
  userId: string,
  notification: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
  notificationType: NotificationType = "test"
) {
  await sendPushToUser(userId, notification, notificationType);
}

// ============================================
// Event Summary Notification Trigger
// ============================================

// POST /api/notifications/trigger-event-summaries - Send notifications for events needing summaries
// This should be called by a cron job every hour
notificationsRouter.post("/trigger-event-summaries", async (c) => {
  // Validate cron API key for security
  const cronApiKey = c.req.header("X-Cron-Api-Key");
  const expectedKey = process.env.CRON_API_KEY;

  if (!expectedKey || cronApiKey !== expectedKey) {
    console.log("[Notifications] Unauthorized cron request - missing or invalid API key");
    return c.json({ error: "Unauthorized" }, 401);
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  // Find events that:
  // 1. Ended between 1-2 hours ago (the sweet spot for reflection)
  // 2. Don't have a summary yet (null, not empty string which means dismissed)
  // 3. Haven't been notified yet
  // 4. Have reflectionEnabled = true (default)
  const eventsNeedingSummary = await db.event.findMany({
    where: {
      summary: null,
      summaryNotifiedAt: null,
      reflectionEnabled: true, // Only prompt if reflection is enabled for this event
      // Events with endTime between 1-2 hours ago (endTime is now required)
      endTime: {
        gte: twoHoursAgo,
        lt: oneHourAgo,
      },
    },
    include: {
      user: { select: { id: true, name: true } },
      event_join_request: {
        where: { status: "accepted" },
        select: { id: true },
      },
    },
  });

  let notificationsSent = 0;

  for (const event of eventsNeedingSummary) {
    // Create in-app notification
    await db.notification.create({
      data: {
        userId: event.userId,
        type: "event_summary_reminder",
        title: "How did it go?",
        body: `Your event "${event.title}" has ended. Take a moment to reflect on how it went!`,
        data: JSON.stringify({
          eventId: event.id,
          eventTitle: event.title,
          eventEmoji: event.emoji,
          attendeeCount: event.event_join_request.length,
        }),
      },
    });

    // Send push notification
    await sendPushNotification(
      event.userId,
      {
        title: `${event.emoji} How did "${event.title}" go?`,
        body: "Take a moment to reflect and add notes before you forget!",
        data: {
          type: "event_summary_reminder",
          eventId: event.id,
          screen: "event-summary",
        },
      },
      "event_reflection_prompt"
    );

    // Mark event as notified
    await db.event.update({
      where: { id: event.id },
      data: { summaryNotifiedAt: now },
    });

    notificationsSent++;
  }

  console.log(`[Notifications] Sent ${notificationsSent} event summary reminders`);

  return c.json({
    success: true,
    notificationsSent,
    eventsProcessed: eventsNeedingSummary.length,
  });
});

// POST /api/notifications/test-push - Send a test push notification (dev only)
notificationsRouter.post("/test-push", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { title, message } = body;

    // Send test push notification using new sendPushToUser
    const sent = await sendPushToUser(
      user.id,
      {
        title: title || "Test Notification",
        body: message || "This is a test push notification from Open Invite!",
        data: {
          type: "test",
          screen: "home",
        },
      },
      "test"
    );

    if (!sent) {
      return c.json({
        success: false,
        message: "Failed to send - check that notifications are enabled and token is registered",
      });
    }

    return c.json({ success: true, message: "Test notification sent" });
  } catch (error) {
    console.error("Error sending test push notification:", error);
    return c.json({ error: "Failed to send test notification" }, 500);
  }
});

// ============================================
// Dev-Only Diagnostic Endpoints
// ============================================

// GET /api/notifications/device-tokens - List user's device tokens (dev only)
notificationsRouter.get("/device-tokens", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const tokens = await db.push_token.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        token: true,
        platform: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });

    // Mask tokens for security (show first 20 and last 5 chars)
    const maskedTokens = tokens.map((t) => ({
      id: t.id,
      token: t.token.length > 30
        ? `${t.token.substring(0, 20)}...${t.token.slice(-5)}`
        : t.token,
      platform: t.platform,
      isActive: t.isActive,
      lastSeenAt: t.lastSeenAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    }));

    return c.json({
      tokens: maskedTokens,
      totalCount: tokens.length,
      activeCount: tokens.filter((t) => t.isActive).length,
    });
  } catch (error) {
    console.error("Error fetching device tokens:", error);
    return c.json({ error: "Failed to fetch device tokens" }, 500);
  }
});

// GET /api/notifications/snapshot - Full notification state snapshot (dev only)
notificationsRouter.get("/snapshot", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Get user's push permission status
    const userData = await db.user.findUnique({
      where: { id: user.id },
      select: {
        pushPermissionStatus: true,
        notifNudgeState: true,
        notifLastNudgedAt: true,
      },
    });

    // Get notification preferences
    const prefs = await db.notification_preferences.findUnique({
      where: { userId: user.id },
    });

    // Get token stats
    const tokens = await db.push_token.findMany({
      where: { userId: user.id },
      select: {
        isActive: true,
        lastSeenAt: true,
        platform: true,
      },
    });

    // Get recent delivery log count
    const recentDeliveries = await db.notification_delivery_log.count({
      where: {
        userId: user.id,
        sentAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    // Calculate nudge eligibility
    let nudgeEligible = false;
    let nudgeReason = "unknown";

    if (userData?.pushPermissionStatus === "granted" || userData?.notifNudgeState === "granted") {
      nudgeEligible = false;
      nudgeReason = "already_granted";
    } else if (userData?.notifLastNudgedAt) {
      const daysSinceLastNudge =
        (Date.now() - userData.notifLastNudgedAt.getTime()) / (1000 * 60 * 60 * 24);

      if (userData.notifNudgeState === "denied_once" && daysSinceLastNudge < 14) {
        nudgeEligible = false;
        nudgeReason = `cooldown_denied (${Math.ceil(14 - daysSinceLastNudge)} days left)`;
      } else if (userData.notifNudgeState === "nudged_once" && daysSinceLastNudge < 7) {
        nudgeEligible = false;
        nudgeReason = `cooldown_nudged (${Math.ceil(7 - daysSinceLastNudge)} days left)`;
      } else {
        nudgeEligible = true;
        nudgeReason = "eligible";
      }
    } else {
      nudgeEligible = true;
      nudgeReason = "never_nudged";
    }

    return c.json({
      user: {
        pushPermissionStatus: userData?.pushPermissionStatus || "unknown",
        notifNudgeState: userData?.notifNudgeState || "none",
        notifLastNudgedAt: userData?.notifLastNudgedAt?.toISOString() || null,
      },
      preferences: prefs
        ? {
            pushEnabled: prefs.pushEnabled,
            quietHoursEnabled: prefs.quietHoursEnabled,
            quietHoursStart: prefs.quietHoursStart,
            quietHoursEnd: prefs.quietHoursEnd,
          }
        : null,
      tokens: {
        total: tokens.length,
        active: tokens.filter((t) => t.isActive).length,
        platforms: [...new Set(tokens.map((t) => t.platform))],
        mostRecent: tokens.length > 0
          ? Math.max(...tokens.map((t) => t.lastSeenAt.getTime()))
          : null,
      },
      nudge: {
        eligible: nudgeEligible,
        reason: nudgeReason,
      },
      recentDeliveries24h: recentDeliveries,
    });
  } catch (error) {
    console.error("Error fetching notification snapshot:", error);
    return c.json({ error: "Failed to fetch snapshot" }, 500);
  }
});


