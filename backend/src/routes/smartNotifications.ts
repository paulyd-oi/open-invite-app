/**
 * Smart Notifications Service
 *
 * FOMO triggers and intelligent notification helpers
 * - Friend joined an event you're interested in
 * - Popular events (high attendance)
 * - Events starting soon
 * - Friends nearby have events
 */

import { db } from "../db";
import { sendPushNotification } from "./notifications";

/**
 * Notify users who are interested in an event when someone joins
 */
export async function notifyInterestedUsersOnJoin(
  eventId: string,
  joiningUserId: string,
  joiningUserName: string
) {
  try {
    // Get the event
    const event = await db.event.findUnique({
      where: { id: eventId },
      include: {
        event_interest: {
          select: { userId: true },
        },
        event_join_request: {
          where: { status: "accepted" },
          select: { userId: true },
        },
        user: {
          select: { name: true },
        },
      },
    });

    if (!event) return;

    // Get users who are interested but haven't joined
    const interestedUserIds = event.event_interest
      .map((i) => i.userId)
      .filter(
        (id) =>
          id !== joiningUserId &&
          id !== event.userId &&
          !event.event_join_request.some((jr) => jr.userId === id)
      );

    if (interestedUserIds.length === 0) return;

    // Calculate FOMO factor (more attendees = more FOMO)
    const attendeeCount = event.event_join_request.length;
    const fomoMessage =
      attendeeCount >= 5
        ? `${joiningUserName} and ${attendeeCount} others are going!`
        : `${joiningUserName} just joined!`;

    // Send notifications to interested users
    for (const userId of interestedUserIds) {
      // Create in-app notification
      await db.notification.create({
        data: {
          userId,
          type: "fomo_friend_joined",
          title: `👀 ${event.emoji} ${event.title}`,
          body: fomoMessage,
          data: JSON.stringify({ eventId, type: "fomo_friend_joined" }),
        },
      });

      // Send push notification
      await sendPushNotification(userId, {
        title: `👀 ${event.emoji} ${event.title}`,
        body: fomoMessage,
        data: { eventId, type: "fomo_friend_joined", screen: "event" },
      });
    }
  } catch (error) {
    console.error("Error sending interested user notifications:", error);
  }
}

/**
 * Notify when an event becomes popular (reaches threshold of attendees)
 */
export async function notifyPopularEvent(eventId: string) {
  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      include: {
        event_join_request: {
          where: { status: "accepted" },
          include: {
            user: { select: { id: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
    });

    if (!event) return;

    const attendeeCount = event.event_join_request.length;

    // Popular thresholds: 5, 10, 20 attendees
    const thresholds = [5, 10, 20];
    if (!thresholds.includes(attendeeCount)) return;

    // Get friends of attendees who aren't already attending
    const attendeeIds = event.event_join_request.map((jr) => jr.user.id);
    attendeeIds.push(event.userId);

    // Find friends of attendees
    const friendsOfAttendees = await db.friendship.findMany({
      where: {
        OR: attendeeIds.flatMap((id) => [
          { userId: id, isBlocked: false },
          { friendId: id, isBlocked: false },
        ]),
      },
      select: {
        userId: true,
        friendId: true,
      },
    });

    // Get unique friend IDs who aren't already attending
    const friendIds = new Set<string>();
    friendsOfAttendees.forEach((f) => {
      if (!attendeeIds.includes(f.userId)) friendIds.add(f.userId);
      if (!attendeeIds.includes(f.friendId)) friendIds.add(f.friendId);
    });

    // Notify friends (limit to avoid spam)
    const friendsToNotify = Array.from(friendIds).slice(0, 20);

    for (const friendId of friendsToNotify) {
      await sendPushNotification(friendId, {
        title: `🔥 Popular Event: ${event.emoji} ${event.title}`,
        body: `${attendeeCount} of your friends are going!`,
        data: { eventId, type: "fomo_popular", screen: "event" },
      });
    }
  } catch (error) {
    console.error("Error sending popular event notifications:", error);
  }
}

/**
 * Notify event attendees when event is starting soon (called by cron job)
 */
export async function notifyEventStartingSoon(
  eventId: string,
  minutesUntilStart: number
) {
  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      include: {
        event_join_request: {
          where: { status: "accepted" },
          select: { userId: true },
        },
        user: { select: { id: true } },
      },
    });

    if (!event) return;

    const allAttendeeIds = [
      event.userId,
      ...event.event_join_request.map((jr) => jr.userId),
    ];

    const timeLabel =
      minutesUntilStart <= 15
        ? "starting soon!"
        : minutesUntilStart <= 60
        ? `starts in ${minutesUntilStart} minutes`
        : `starts in ${Math.round(minutesUntilStart / 60)} hour${
            minutesUntilStart >= 120 ? "s" : ""
          }`;

    for (const userId of allAttendeeIds) {
      await sendPushNotification(userId, {
        title: `⏰ ${event.emoji} ${event.title}`,
        body: `Your event ${timeLabel}`,
        data: { eventId, type: "event_reminder", screen: "event" },
      });
    }
  } catch (error) {
    console.error("Error sending event starting notifications:", error);
  }
}

/**
 * Send weekly activity summary (FOMO for inactive users)
 */
export async function sendWeeklyFOMOSummary(userId: string) {
  try {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get user's friends
    const friendships = await db.friendship.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
        isBlocked: false,
      },
    });

    const friendIds = friendships.map((f) =>
      f.userId === userId ? f.friendId : f.userId
    );

    // Count events friends created this week
    const friendEventsCount = await db.event.count({
      where: {
        userId: { in: friendIds },
        createdAt: { gte: oneWeekAgo },
      },
    });

    // Count events friends attended this week
    const friendAttendedCount = await db.event_join_request.count({
      where: {
        userId: { in: friendIds },
        status: "accepted",
        createdAt: { gte: oneWeekAgo },
      },
    });

    if (friendEventsCount === 0 && friendAttendedCount === 0) return;

    // Check if user was active this week
    const userEventsCount = await db.event.count({
      where: {
        userId,
        createdAt: { gte: oneWeekAgo },
      },
    });

    const userAttendedCount = await db.event_join_request.count({
      where: {
        userId,
        status: "accepted",
        createdAt: { gte: oneWeekAgo },
      },
    });

    // Only send FOMO if user was less active than friends
    if (userEventsCount + userAttendedCount >= friendEventsCount / 2) return;

    let fomoMessage = "";
    if (friendEventsCount > 0 && friendAttendedCount > 0) {
      fomoMessage = `Your friends created ${friendEventsCount} events and attended ${friendAttendedCount} hangouts this week!`;
    } else if (friendEventsCount > 0) {
      fomoMessage = `Your friends created ${friendEventsCount} events this week!`;
    } else {
      fomoMessage = `Your friends attended ${friendAttendedCount} hangouts this week!`;
    }

    await sendPushNotification(userId, {
      title: "📅 Weekly Activity",
      body: fomoMessage + " Don't miss out!",
      data: { type: "weekly_summary", screen: "calendar" },
    });
  } catch (error) {
    console.error("Error sending weekly FOMO summary:", error);
  }
}

/**
 * Notify friends when someone creates an exciting event
 */
export async function notifyFriendsOfNewEvent(
  eventId: string,
  creatorId: string,
  creatorName: string
) {
  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      include: {
        event_group_visibility: {
          select: { groupId: true },
        },
      },
    });

    if (!event) return;

    // Get friends who should see this event
    let friendIdsToNotify: string[] = [];

    if (event.visibility === "all_friends") {
      // Get all friends
      const friendships = await db.friendship.findMany({
        where: {
          OR: [{ userId: creatorId }, { friendId: creatorId }],
          isBlocked: false,
        },
      });
      friendIdsToNotify = friendships.map((f) =>
        f.userId === creatorId ? f.friendId : f.userId
      );
    } else if (event.visibility === "specific_groups") {
      // Get friends in the visible groups
      const groupIds = event.event_group_visibility.map((gv) => gv.groupId);
      const memberships = await db.friend_group_membership.findMany({
        where: { groupId: { in: groupIds } },
        include: {
          friendship: {
            select: { userId: true, friendId: true },
          },
        },
      });

      const friendIdSet = new Set<string>();
      memberships.forEach((m) => {
        const friendId =
          m.friendship.userId === creatorId
            ? m.friendship.friendId
            : m.friendship.userId;
        friendIdSet.add(friendId);
      });
      friendIdsToNotify = Array.from(friendIdSet);
    }

    // Send notifications
    for (const friendId of friendIdsToNotify) {
      // Create in-app notification
      await db.notification.create({
        data: {
          userId: friendId,
          type: "new_event",
          title: `${event.emoji} New Event`,
          body: `${creatorName} posted "${event.title}"`,
          data: JSON.stringify({ eventId }),
        },
      });

      // Send push notification
      await sendPushNotification(friendId, {
        title: `${event.emoji} ${creatorName} posted an event`,
        body: event.title,
        data: { eventId, type: "new_event", screen: "event" },
      });
    }
  } catch (error) {
    console.error("Error notifying friends of new event:", error);
  }
}
