import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import {
  createEventRequestSchema,
  updateEventRequestSchema,
  joinEventRequestSchema,
  updateJoinRequestSchema,
  createCommentRequestSchema,
} from "../shared/contracts";
import { getBlockedUserIds, getBlockedByUserIds } from "./blocked";
import {
  notifyInterestedUsersOnJoin,
  notifyPopularEvent,
  notifyFriendsOfNewEvent,
} from "./smartNotifications";
import { sendPushNotification } from "./notifications";
import {
  canCreateEvent,
  canCreateRecurringEvent,
  getWhosFreeLimit,
} from "../utils/subscriptionHelpers";
import { FREE_TIER_LIMITS } from "../shared/freemiumLimits";
import { toPublicUserDTO } from "../lib/validation";

export const eventsRouter = new Hono<AppType>();

// Helper to serialize dates in event objects and transform field names
const serializeEvent = (event: {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  emoji: string;
  color?: string | null; // Custom event color (hex)
  startTime: Date;
  endTime: Date | null;
  isRecurring: boolean;
  recurrence: string | null;
  visibility: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  user?: { id: string; name: string | null; email: string | null; image: string | null } | null;
  event_group_visibility?: Array<{
    groupId: string;
    friend_group: { id: string; name: string; color: string };
  }>;
  event_join_request?: Array<{
    id: string;
    userId: string;
    status: string;
    message: string | null;
    user: { id: string; name: string | null; image: string | null };
  }>;
  // Legacy field names (some queries may use these)
  groupVisibility?: Array<{
    groupId: string;
    friend_group: { id: string; name: string; color: string };
  }>;
  joinRequests?: Array<{
    id: string;
    userId: string;
    status: string;
    message: string | null;
    user: { id: string; name: string | null; image: string | null };
  }>;
}) => {
  // Transform Prisma field names to frontend-expected names
  const groupVisibilityData = event.event_group_visibility ?? event.groupVisibility ?? [];
  const joinRequestsData = event.event_join_request ?? event.joinRequests ?? [];

  // Destructure to remove Prisma-specific fields
  const { event_group_visibility, event_join_request, groupVisibility, joinRequests, ...rest } = event;

  return {
    ...rest,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    // Transform groupVisibility: friend_group -> group
    groupVisibility: groupVisibilityData.map(gv => ({
      groupId: gv.groupId,
      group: gv.friend_group, // Rename friend_group to group
    })),
    // Transform joinRequests field name
    joinRequests: joinRequestsData,
  };
};

// GET /api/events - Get user's own events
eventsRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const events = await db.event.findMany({
    where: { userId: user.id },
    include: {
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
      event_join_request: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return c.json({ events: events.map(serializeEvent) });
});

// GET /api/events/feed - Get activity feed (friends' open events)
eventsRouter.get("/feed", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get blocked user IDs (both directions)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Get user's friendships (where they are friends, not blocked)
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      isBlocked: false,
      friendId: { notIn: allBlockedIds }, // Exclude blocked users
    },
    include: {
      friend_group_membership: true,
    },
  });

  const friendIds = friendships.map((f) => f.friendId);

  // Get all friend events that are either:
  // 1. visibility = "all_friends" OR
  // 2. visibility = "specific_groups" AND the user is in one of those groups
  // Note: We include ALL events (past and future) so they show on the calendar

  const events = await db.event.findMany({
    where: {
      userId: { in: friendIds },
      OR: [
        { visibility: "all_friends" },
        {
          visibility: "specific_groups",
          event_group_visibility: {
            some: {
              groupId: {
                in: friendships.flatMap((f) =>
                  f.friend_group_membership.map((m) => m.groupId)
                ),
              },
            },
          },
        },
      ],
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
      // Include ALL join requests so we can show attendee count in Popular tab
      event_join_request: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return c.json({ events: events.map(serializeEvent) });
});

// GET /api/events/attending - Get events user is attending (RSVP "going" events)
eventsRouter.get("/attending", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get events where user has RSVP status = "going" (not their own events)
  const goingRsvps = await db.event_interest.findMany({
    where: {
      userId: user.id,
      status: "going",
      event: {
        userId: { not: user.id }, // Exclude own events
      },
    },
    include: {
      event: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          event_group_visibility: {
            include: {
              friend_group: { select: { id: true, name: true, color: true } },
            },
          },
          event_join_request: {
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
  });

  const goingEvents = goingRsvps
    .map((rsvp) => rsvp.event)
    .filter((event) => event !== null);

  // Also get events where user has an accepted join request (legacy system, backwards compatibility)
  const joinRequests = await db.event_join_request.findMany({
    where: {
      userId: user.id,
      status: "accepted",
      event: {
        userId: { not: user.id },
      },
    },
    include: {
      event: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          event_group_visibility: {
            include: {
              friend_group: { select: { id: true, name: true, color: true } },
            },
          },
          event_join_request: {
            where: { userId: user.id },
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
  });

  const joinedEvents = joinRequests
    .map((jr) => jr.event)
    .filter((event) => event !== null);

  // Merge goingEvents and joinedEvents, removing duplicates
  const goingEventIds = new Set(goingEvents.map((e) => e.id));
  const allAttendingEvents = [
    ...goingEvents,
    ...joinedEvents.filter((e) => !goingEventIds.has(e.id)),
  ];

  return c.json({ events: allAttendingEvents.map(serializeEvent) });
});

// ============================================
// Calendar Events API
// ============================================

// GET /api/events/calendar-events - Get events for calendar view (created + going)
// Query params:
//   - start: ISO date string (required) - range start
//   - end: ISO date string (required) - range end
// Returns separate arrays for created events and going events
eventsRouter.get("/calendar-events", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const start = c.req.query("start");
  const end = c.req.query("end");

  if (!start || !end) {
    return c.json({ error: "start and end query parameters are required" }, 400);
  }

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return c.json({ error: "Invalid date format for start or end" }, 400);
  }

  // Query events that overlap with the date range:
  // event.startTime < rangeEnd AND (event.endTime > rangeStart OR event.startTime >= rangeStart)
  const dateRangeFilter = {
    startTime: { lt: rangeEnd },
    OR: [
      { endTime: { gt: rangeStart } },
      { startTime: { gte: rangeStart } },
    ],
  };

  // 1. Get user's own created events in the date range
  const createdEvents = await db.event.findMany({
    where: {
      userId: user.id,
      ...dateRangeFilter,
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
      event_join_request: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  // 2. Get events where user has RSVP status = "going" (not their own events)
  const goingRsvps = await db.event_interest.findMany({
    where: {
      userId: user.id,
      status: "going",
      event: {
        userId: { not: user.id }, // Exclude own events (already in createdEvents)
        ...dateRangeFilter,
      },
    },
    include: {
      event: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          event_group_visibility: {
            include: {
              friend_group: { select: { id: true, name: true, color: true } },
            },
          },
          event_join_request: {
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
  });

  const goingEvents = goingRsvps
    .map((rsvp) => rsvp.event)
    .filter((event) => event !== null)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // 3. Also get events where user has an accepted join request (joined events)
  // This covers the old join system for backwards compatibility
  const joinedRequests = await db.event_join_request.findMany({
    where: {
      userId: user.id,
      status: "accepted",
      event: {
        userId: { not: user.id },
        ...dateRangeFilter,
      },
    },
    include: {
      event: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          event_group_visibility: {
            include: {
              friend_group: { select: { id: true, name: true, color: true } },
            },
          },
          event_join_request: {
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
  });

  const joinedEvents = joinedRequests
    .map((jr) => jr.event)
    .filter((event) => event !== null)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Merge goingEvents and joinedEvents, removing duplicates
  const goingEventIds = new Set(goingEvents.map((e) => e.id));
  const allGoingEvents = [
    ...goingEvents,
    ...joinedEvents.filter((e) => !goingEventIds.has(e.id)),
  ].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return c.json({
    createdEvents: createdEvents.map(serializeEvent),
    goingEvents: allGoingEvents.map(serializeEvent),
  });
});

// POST /api/events - Create new event
eventsRouter.post("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = createEventRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  const { groupIds, sendNotification, circleId, isPrivateCircleEvent, ...eventData } = parsed.data;

  // Check event creation limit (FREE: 3 active events)
  const eventLimit = await canCreateEvent(user.id);
  if (!eventLimit.allowed) {
    return c.json({
      error: "Event limit reached",
      message: `Free accounts can have up to ${eventLimit.limit} active events. Upgrade to Pro for unlimited events.`,
      limit: eventLimit.limit,
      current: eventLimit.current,
      requiresUpgrade: true,
    }, 403);
  }

  // Check recurring event permission (Pro only)
  if (eventData.isRecurring) {
    const recurringAllowed = await canCreateRecurringEvent(user.id);
    if (!recurringAllowed.allowed) {
      return c.json({
        error: "Recurring events require Pro",
        message: "Upgrade to Pro to create recurring events.",
        requiresUpgrade: true,
      }, 403);
    }
  }

  // Validate circle membership if creating a circle event
  if (circleId) {
    const circleMember = await db.circle_member.findFirst({
      where: { circleId, userId: user.id },
    });
    if (!circleMember) {
      return c.json({ error: "You are not a member of this circle" }, 403);
    }
  }

  const startTime = new Date(eventData.startTime);
  // Default endTime to startTime + 1 hour if not provided
  const endTime = eventData.endTime ? new Date(eventData.endTime) : new Date(startTime.getTime() + 60 * 60 * 1000);

  // Validate endTime > startTime
  if (endTime <= startTime) {
    return c.json({ error: "End time must be after start time" }, 400);
  }

  const createdEvents: Array<typeof event> = [];

  // Helper to create a single event
  const createSingleEvent = async (eventStartTime: Date, eventEndTime: Date) => {
    return await db.event.create({
      data: {
        ...eventData,
        emoji: eventData.emoji ?? "📅",
        startTime: eventStartTime,
        endTime: eventEndTime,
        userId: user.id,
        event_group_visibility:
          eventData.visibility === "specific_groups" && groupIds
            ? {
                create: groupIds.map((groupId) => ({ groupId })),
              }
            : undefined,
      },
      include: {
        event_group_visibility: {
          include: {
            friend_group: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });
  };

  // Calculate event duration for recurring events
  const eventDuration = endTime.getTime() - startTime.getTime();

  // Create the first event
  const event = await createSingleEvent(startTime, endTime);
  createdEvents.push(event);

  // Create CircleEvent entry if this is a circle event
  if (circleId) {
    await db.circle_event.create({
      data: {
        circleId,
        eventId: event.id,
        isPrivate: isPrivateCircleEvent ?? true, // Default to private for circle events
      },
    });

    // Get circle for notifications (but DO NOT auto-RSVP members - spec requires explicit RSVP)
    const circle = await db.circle.findUnique({
      where: { id: circleId },
      include: { circle_member: true },
    });

    if (circle) {
      // Send notifications to circle members (excluding creator)
      const memberIds = circle.circle_member
        .map(m => m.userId)
        .filter(id => id !== user.id);

      if (memberIds.length > 0) {
        const notificationBody = `New Open Invite in ${circle.name}: ${eventData.title}`;
        
        // Create in-app notifications
        await db.notification.createMany({
          data: memberIds.map((userId) => ({
            userId,
            type: "circle_event",
            title: "New Circle Event",
            body: notificationBody,
            data: JSON.stringify({ eventId: event.id, circleId }),
          })),
        });

        // Send push notifications asynchronously
        for (const memberId of memberIds) {
          sendPushNotification(memberId, {
            title: "New Circle Event",
            body: notificationBody,
            data: { eventId: event.id, circleId, type: "circle_event", screen: "event" },
          }).catch(err => console.error("Error sending circle event push notification:", err));
        }
      }
    }

    // Also create a system message in the circle about the new event
    const eventDateStr = startTime.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    await db.circle_message.create({
      data: {
        circleId,
        userId: user.id,
        content: `📅 Created event: ${eventData.title} on ${eventDateStr}`,
      },
    });
  }

  // If weekly recurring, create events for each week of the month (4 weeks total)
  if (eventData.isRecurring && eventData.recurrence === "weekly") {
    const weeksToCreate = 3; // Create 3 more weeks (4 total including the first)

    for (let week = 1; week <= weeksToCreate; week++) {
      const nextWeekDate = new Date(startTime);
      nextWeekDate.setDate(nextWeekDate.getDate() + (week * 7));
      const nextWeekEndDate = new Date(nextWeekDate.getTime() + eventDuration);

      const recurringEvent = await createSingleEvent(nextWeekDate, nextWeekEndDate);
      createdEvents.push(recurringEvent);
    }
  }

  // If monthly recurring, create events for the next 2 months (3 total including the first)
  if (eventData.isRecurring && eventData.recurrence === "monthly") {
    const monthsToCreate = 2; // Create 2 more months (3 total)

    for (let month = 1; month <= monthsToCreate; month++) {
      const nextMonthDate = new Date(startTime);
      nextMonthDate.setMonth(nextMonthDate.getMonth() + month);
      const nextMonthEndDate = new Date(nextMonthDate.getTime() + eventDuration);

      const recurringEvent = await createSingleEvent(nextMonthDate, nextMonthEndDate);
      createdEvents.push(recurringEvent);
    }
  }

  // Create notifications for friends who can see this event (only for the first event)
  // Only send notifications if sendNotification is true (defaults to true if not specified)
  const shouldNotify = sendNotification !== false;

  if (shouldNotify) {
    const friendships = await db.friendship.findMany({
      where: {
        friendId: user.id, // People who have user as friend
        isBlocked: false,
      },
      include: {
        friend_group_membership: true,
      },
    });

    // Filter to friends who can see this event
    const notifyUserIds = friendships
      .filter((f) => {
        if (eventData.visibility === "all_friends") return true;
        if (eventData.visibility === "specific_groups" && groupIds) {
          return f.friend_group_membership.some((m) => groupIds.includes(m.groupId));
        }
        return false;
      })
      .map((f) => f.userId);

    // Create notifications
    if (notifyUserIds.length > 0) {
      const notificationBody = eventData.isRecurring && eventData.recurrence === "weekly"
        ? `${user.name ?? user.email} is planning: ${eventData.title} (Weekly)`
        : eventData.isRecurring && eventData.recurrence === "monthly"
        ? `${user.name ?? user.email} is planning: ${eventData.title} (Monthly)`
        : `${user.name ?? user.email} is planning: ${eventData.title}`;

      await db.notification.createMany({
        data: notifyUserIds.map((userId) => ({
          userId,
          type: "new_event",
          title: "New Event",
          body: notificationBody,
          data: JSON.stringify({ eventId: event.id }),
        })),
      });

      // Send push notifications for new event (async, don't wait)
      notifyFriendsOfNewEvent(event.id, user.id, user.name ?? user.email).catch(
        (err) => console.error("Error sending new event notifications:", err)
      );
    }
  }

  return c.json({ event: serializeEvent(event) });
});

// GET /api/events/:id - Get single event by ID
// This fetches any event the user has access to (own event, friend's event, or attending)
eventsRouter.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  // Get blocked user IDs (both directions)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // First, try to find the event
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
      event_join_request: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
      circle_event: {
        include: {
          circle: {
            include: {
              circle_member: true,
            },
          },
        },
      },
    },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  // Check if the event creator is blocked
  if (allBlockedIds.includes(event.userId)) {
    return c.json({ error: "Event not found" }, 404);
  }

  // Check if this is a circle event - enforce circle membership
  if (event.circle_event) {
    const isMember = event.circle_event.circle.circle_member.some(
      (m) => m.userId === user.id
    );
    if (!isMember) {
      return c.json({ error: "Event not found" }, 404);
    }
    // Member has access, return event
    return c.json({ event: serializeEvent(event) });
  }

  // Check access:
  // 1. User owns the event
  if (event.userId === user.id) {
    return c.json({ event: serializeEvent(event) });
  }

  // 2. User is attending the event
  const isAttending = event.event_join_request?.some(
    (jr) => jr.userId === user.id && jr.status === "accepted"
  );
  if (isAttending) {
    return c.json({ event: serializeEvent(event) });
  }

  // 3. User is friends with the event creator and can see it
  const friendship = await db.friendship.findFirst({
    where: {
      userId: user.id,
      friendId: event.userId,
      isBlocked: false,
    },
    include: {
      friend_group_membership: true,
    },
  });

  if (friendship) {
    // Check visibility
    if (event.visibility === "all_friends") {
      return c.json({ event: serializeEvent(event) });
    }

    if (event.visibility === "specific_groups") {
      const userGroupIds = friendship.friend_group_membership.map((m) => m.groupId);
      const eventGroupIds = event.event_group_visibility?.map((gv) => gv.groupId) ?? [];
      const hasAccess = eventGroupIds.some((gid) => userGroupIds.includes(gid));
      if (hasAccess) {
        return c.json({ event: serializeEvent(event) });
      }
    }
  }

  // No access
  return c.json({ error: "Event not found" }, 404);
});

// PUT /api/events/:id - Update event
eventsRouter.put("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");
  const body = await c.req.json();
  console.log("[Event Update] Raw body:", JSON.stringify(body));

  const parsed = updateEventRequestSchema.safeParse(body);

  if (!parsed.success) {
    console.log("[Event Update] Validation failed:", parsed.error);
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  console.log("[Event Update] Parsed data:", JSON.stringify(parsed.data));

  // Check if user owns the event
  const existingEvent = await db.event.findFirst({
    where: { id: eventId, userId: user.id },
  });

  if (!existingEvent) {
    return c.json({ error: "Event not found" }, 404);
  }

  const { groupIds, ...updateData } = parsed.data;
  console.log("[Event Update] Update data (after removing groupIds):", JSON.stringify(updateData));

  // Update event and group visibility
  const event = await db.event.update({
    where: { id: eventId },
    data: {
      ...updateData,
      startTime: updateData.startTime
        ? new Date(updateData.startTime)
        : undefined,
      endTime: updateData.endTime ? new Date(updateData.endTime) : undefined,
    },
    include: {
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  // Update group visibility if provided
  if (groupIds !== undefined) {
    await db.event_group_visibility.deleteMany({ where: { eventId } });
    if (groupIds.length > 0) {
      await db.event_group_visibility.createMany({
        data: groupIds.map((groupId) => ({ eventId, groupId })),
      });
    }
  }

  const updatedEvent = await db.event.findUnique({
    where: { id: eventId },
    include: {
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  return c.json({ event: serializeEvent(updatedEvent!) });
});

// DELETE /api/events/:id - Delete event
eventsRouter.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  // Check if user owns the event
  const existingEvent = await db.event.findFirst({
    where: { id: eventId, userId: user.id },
  });

  if (!existingEvent) {
    return c.json({ error: "Event not found" }, 404);
  }

  await db.event.delete({ where: { id: eventId } });

  return c.json({ success: true });
});

// POST /api/events/:id/join - Request to join event (auto-accepts)
eventsRouter.post("/:id/join", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");
  const body = await c.req.json();
  const parsed = joinEventRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check if event exists and user can see it
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { user: true },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  // Check if already requested
  const existingRequest = await db.event_join_request.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
  });

  if (existingRequest) {
    // If already exists but not accepted, update to accepted
    if (existingRequest.status !== "accepted") {
      const updatedRequest = await db.event_join_request.update({
        where: { id: existingRequest.id },
        data: { status: "accepted" },
      });
      return c.json({
        success: true,
        joinRequest: { id: updatedRequest.id, status: updatedRequest.status },
        autoAccepted: true,
      });
    }
    return c.json({ error: "Already attending this event" }, 400);
  }

  // Create join request with auto-accepted status
  const joinRequest = await db.event_join_request.create({
    data: {
      eventId,
      userId: user.id,
      message: parsed.data.message,
      status: "accepted", // Auto-accept
    },
  });

  // Notify event owner that someone is attending
  await db.notification.create({
    data: {
      userId: event.userId,
      type: "join_request",
      title: "New Attendee",
      body: `${user.name ?? user.email} is attending: ${event.title}`,
      data: JSON.stringify({ eventId, requestId: joinRequest.id }),
    },
  });

  // Smart notifications: notify interested users and check for popular event
  notifyInterestedUsersOnJoin(eventId, user.id, user.name ?? "Someone").catch(
    (err) => console.error("Error sending FOMO notifications:", err)
  );
  notifyPopularEvent(eventId).catch((err) =>
    console.error("Error checking popular event:", err)
  );

  return c.json({
    success: true,
    joinRequest: { id: joinRequest.id, status: joinRequest.status },
    autoAccepted: true,
  });
});

// PUT /api/events/:eventId/join/:requestId - Accept/reject join request
eventsRouter.put("/:eventId/join/:requestId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("eventId");
  const requestId = c.req.param("requestId");
  const body = await c.req.json();
  const parsed = updateJoinRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check if user owns the event
  const event = await db.event.findFirst({
    where: { id: eventId, userId: user.id },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  const joinRequest = await db.event_join_request.update({
    where: { id: requestId },
    data: { status: parsed.data.status },
    include: { user: true },
  });

  // Notify requester
  await db.notification.create({
    data: {
      userId: joinRequest.userId,
      type: "request_accepted",
      title: parsed.data.status === "accepted" ? "Request Accepted" : "Request Declined",
      body:
        parsed.data.status === "accepted"
          ? `You're in! ${user.name ?? user.email} accepted your request to join: ${event.title}`
          : `${user.name ?? user.email} declined your request to join: ${event.title}`,
      data: JSON.stringify({ eventId }),
    },
  });

  return c.json({ success: true });
});

// ============================================
// Event Comments
// ============================================

// Helper to serialize comment
const serializeComment = (comment: {
  id: string;
  eventId: string;
  userId: string;
  content: string;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string | null; image: string | null };
}) => ({
  ...comment,
  createdAt: comment.createdAt.toISOString(),
  updatedAt: comment.updatedAt.toISOString(),
});

// GET /api/events/:id/comments - Get event comments
eventsRouter.get("/:id/comments", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  // Check if event exists
  const event = await db.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  const comments = await db.event_comment.findMany({
    where: { eventId },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return c.json({ comments: comments.map(serializeComment) });
});

// POST /api/events/:id/comments - Create comment
eventsRouter.post("/:id/comments", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");
  const body = await c.req.json();
  const parsed = createCommentRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check if event exists
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { user: true },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  const comment = await db.event_comment.create({
    data: {
      eventId,
      userId: user.id,
      content: parsed.data.content,
      imageUrl: parsed.data.imageUrl,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  // Notify event owner if someone else commented
  if (event.userId !== user.id) {
    await db.notification.create({
      data: {
        userId: event.userId,
        type: "new_comment",
        title: "New Comment",
        body: `${user.name ?? user.email} commented on your event: ${event.title}`,
        data: JSON.stringify({ eventId, commentId: comment.id }),
      },
    });
  }

  return c.json({ comment: serializeComment(comment) });
});

// DELETE /api/events/:eventId/comments/:commentId - Delete comment
eventsRouter.delete("/:eventId/comments/:commentId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("eventId");
  const commentId = c.req.param("commentId");

  // Check if comment exists and belongs to user or event owner
  const comment = await db.event_comment.findUnique({
    where: { id: commentId },
    include: { event: true },
  });

  if (!comment) {
    return c.json({ error: "Comment not found" }, 404);
  }

  // Only allow deletion by comment author or event owner
  if (comment.userId !== user.id && comment.event.userId !== user.id) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  await db.event_comment.delete({ where: { id: commentId } });

  return c.json({ success: true });
});

// ============================================
// Event Interest (Quick Reactions)
// ============================================

// POST /api/events/:id/interest - Mark interest in event
eventsRouter.post("/:id/interest", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  // Check if event exists
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { user: true },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  // Check if already interested
  const existingInterest = await db.event_interest.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
  });

  if (existingInterest) {
    return c.json({ error: "Already interested" }, 400);
  }

  // Create interest
  const interest = await db.event_interest.create({
    data: {
      eventId,
      userId: user.id,
    },
  });

  // Notify event owner
  if (event.userId !== user.id) {
    await db.notification.create({
      data: {
        userId: event.userId,
        type: "event_interest",
        title: "Someone's Interested",
        body: `${user.name ?? user.email} is interested in: ${event.title}`,
        data: JSON.stringify({ eventId }),
      },
    });
  }

  return c.json({ success: true, interestId: interest.id });
});

// DELETE /api/events/:id/interest - Remove interest in event
eventsRouter.delete("/:id/interest", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  await db.event_interest.deleteMany({
    where: { eventId, userId: user.id },
  });

  return c.json({ success: true });
});

// GET /api/events/:id/interests - Get interested users for event
eventsRouter.get("/:id/interests", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  const interests = await db.event_interest.findMany({
    where: { eventId },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    event_interest: interests.map((i) => ({
      id: i.id,
      userId: i.userId,
      user: i.user,
      status: (i as any).status ?? "interested",
      createdAt: i.createdAt.toISOString(),
    })),
  });
});

// ============================================
// Unified RSVP System (Soft RSVP)
// ============================================

// POST /api/events/:id/rsvp - Set RSVP status (going, interested, maybe, not_going)
eventsRouter.post("/:id/rsvp", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");
  const body = await c.req.json();
  const { status } = body as { status: "going" | "interested" | "maybe" | "not_going" };

  // Validate status
  const validStatuses = ["going", "interested", "maybe", "not_going"];
  if (!validStatuses.includes(status)) {
    return c.json({ error: "Invalid status. Must be: going, interested, maybe, or not_going" }, 400);
  }

  // Check if event exists
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { user: true },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  // Upsert the RSVP status
  const rsvp = await db.event_interest.upsert({
    where: { eventId_userId: { eventId, userId: user.id } },
    create: {
      eventId,
      userId: user.id,
      status,
    },
    update: {
      status,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  // Notify event owner for positive responses (not for "not_going")
  if (event.userId !== user.id && status !== "not_going") {
    const statusLabels: Record<string, string> = {
      going: "is going to",
      interested: "is interested in",
      maybe: "might attend",
    };

    await db.notification.create({
      data: {
        userId: event.userId,
        type: "event_rsvp",
        title: status === "going" ? "New Attendee!" : "Someone's Interested",
        body: `${user.name ?? user.email} ${statusLabels[status]} ${event.title}`,
        data: JSON.stringify({ eventId, status }),
      },
    });
  }

  return c.json({
    success: true,
    rsvp: {
      id: rsvp.id,
      status: rsvp.status,
      userId: rsvp.userId,
      user: rsvp.user,
      createdAt: rsvp.createdAt.toISOString(),
    },
  });
});

// GET /api/events/:id/rsvp - Get current user's RSVP status
eventsRouter.get("/:id/rsvp", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  const rsvp = await db.event_interest.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
  });

  return c.json({
    status: rsvp?.status ?? null,
    rsvpId: rsvp?.id ?? null,
  });
});

// DELETE /api/events/:id/rsvp - Remove RSVP
eventsRouter.delete("/:id/rsvp", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  await db.event_interest.deleteMany({
    where: { eventId, userId: user.id },
  });

  return c.json({ success: true });
});

// GET /api/events/:id/rsvps - Get all RSVPs for event (for host)
eventsRouter.get("/:id/rsvps", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  const rsvps = await db.event_interest.findMany({
    where: { eventId },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Group by status
  const grouped = {
    going: rsvps.filter((r) => r.status === "going").map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      createdAt: r.createdAt.toISOString(),
    })),
    interested: rsvps.filter((r) => r.status === "interested").map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      createdAt: r.createdAt.toISOString(),
    })),
    maybe: rsvps.filter((r) => r.status === "maybe").map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      createdAt: r.createdAt.toISOString(),
    })),
    not_going: rsvps.filter((r) => r.status === "not_going").map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      createdAt: r.createdAt.toISOString(),
    })),
  };

  return c.json({
    rsvps: grouped,
    counts: {
      going: grouped.going.length,
      interested: grouped.interested.length,
      maybe: grouped.maybe.length,
      not_going: grouped.not_going.length,
      total: rsvps.length,
    },
  });
});

// ============================================
// Who's Free Discovery
// ============================================

// GET /api/events/whos-free?date=YYYY-MM-DD - Get friends who are free on a date
eventsRouter.get("/whos-free", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dateStr = c.req.query("date");
  if (!dateStr) {
    return c.json({ error: "Date parameter required" }, 400);
  }

  const targetDate = new Date(dateStr);

  // Check Who's Free date limit (FREE: 7 days, PRO: 90 days)
  const whosFreeLimit = await getWhosFreeLimit(user.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + whosFreeLimit.daysAhead);

  if (targetDate > maxDate) {
    return c.json({
      error: "Date too far ahead",
      message: `Free accounts can check Who's Free up to ${FREE_TIER_LIMITS.whosFreeAheadDays} days ahead. Upgrade to Pro for ${whosFreeLimit.daysAhead > 30 ? "90" : whosFreeLimit.daysAhead} days.`,
      maxDaysAhead: whosFreeLimit.daysAhead,
      isPro: whosFreeLimit.isPro,
      requiresUpgrade: !whosFreeLimit.isPro,
    }, 403);
  }

  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Get blocked user IDs
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Get all friends
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      isBlocked: false,
      friendId: { notIn: allBlockedIds },
    },
    include: {
      user_friendship_friendIdTouser: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          shareCalendarAvailability: true,
        }
      },
      friend_group_membership: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  // Filter out friends who have disabled sharing their availability
  const shareableFriendships = friendships.filter(
    (f) => f.user_friendship_friendIdTouser.shareCalendarAvailability !== false
  );

  // Get all friends who have events on this date
  const friendIds = shareableFriendships.map((f) => f.friendId);
  const busyFriendEvents = await db.event.findMany({
    where: {
      userId: { in: friendIds },
      startTime: { gte: startOfDay, lte: endOfDay },
    },
    select: { userId: true },
  });

  const busyFriendIds = new Set(busyFriendEvents.map((e) => e.userId));

  // Also check work schedules for friends
  const dayOfWeek = targetDate.getDay();
  const workSchedules = await db.work_schedule.findMany({
    where: {
      userId: { in: friendIds },
      dayOfWeek,
      isEnabled: true,
    },
    select: { userId: true, label: true },
  });

  // Track which friends are busy due to work
  const workingFriendIds = new Set(workSchedules.map((ws) => ws.userId));
  const workLabels = new Map(workSchedules.map((ws) => [ws.userId, ws.label]));

  // Add friends with work schedules to busy set
  workSchedules.forEach((ws) => busyFriendIds.add(ws.userId));

  // Categorize friends
  const freeFriends = shareableFriendships.filter((f) => !busyFriendIds.has(f.friendId));
  const busyFriends = shareableFriendships.filter((f) => busyFriendIds.has(f.friendId));

  return c.json({
    date: dateStr,
    freeFriends: freeFriends.map((f) => ({
      friendshipId: f.id,
      friend: toPublicUserDTO(f.user_friendship_friendIdTouser),
      groups: f.friend_group_membership.map((gm) => gm.friend_group),
    })),
    busyFriends: busyFriends.map((f) => ({
      friendshipId: f.id,
      friend: toPublicUserDTO(f.user_friendship_friendIdTouser),
      groups: f.friend_group_membership.map((gm) => gm.friend_group),
      isWorking: workingFriendIds.has(f.friendId),
      workLabel: workLabels.get(f.friendId) ?? null,
    })),
  });
});

// GET /api/events/friends-availability - Get availability for multiple friends across multiple dates
eventsRouter.get("/friends-availability", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const friendIds = c.req.queries("friendIds") ?? [];
  const dates = c.req.queries("dates") ?? [];

  if (friendIds.length === 0 || dates.length === 0) {
    return c.json({ availability: {} });
  }

  // Get blocked user IDs
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Verify these are actually friends
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      friendId: { in: friendIds, notIn: allBlockedIds },
      isBlocked: false,
    },
  });

  const validFriendIds = friendships.map((f) => f.friendId);

  // Build availability map: { friendId: { date: isFree } }
  const availability: Record<string, Record<string, boolean>> = {};

  for (const friendId of validFriendIds) {
    availability[friendId] = {};

    for (const dateStr of dates) {
      const targetDate = new Date(dateStr);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Check if friend has events on this date
      const hasEvents = await db.event.findFirst({
        where: {
          userId: friendId,
          startTime: { gte: startOfDay, lte: endOfDay },
        },
        select: { id: true },
      });

      // Check if friend is working on this date
      const dayOfWeek = targetDate.getDay();
      const hasWorkSchedule = await db.work_schedule.findFirst({
        where: {
          userId: friendId,
          dayOfWeek,
          isEnabled: true,
        },
        select: { id: true },
      });

      // Friend is free if they have no events and no work schedule
      availability[friendId][dateStr] = !hasEvents && !hasWorkSchedule;
    }
  }

  return c.json({ availability });
});

// ============================================
// Shared Availability View
// ============================================

// POST /api/events/shared-availability - Find overlapping free times
eventsRouter.post("/shared-availability", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { friendIds, startDate, endDate } = body as {
    friendIds: string[];
    startDate: string;
    endDate: string;
  };

  if (!friendIds || friendIds.length === 0) {
    return c.json({ error: "Friend IDs required" }, 400);
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  // Get blocked user IDs
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Verify these are actually friends
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      friendId: { in: friendIds, notIn: allBlockedIds },
      isBlocked: false,
    },
  });

  const validFriendIds = friendships.map((f) => f.friendId);

  // Get all events for user and friends in the date range
  const allUserIds = [user.id, ...validFriendIds];
  const events = await db.event.findMany({
    where: {
      userId: { in: allUserIds },
      startTime: { gte: start, lte: end },
    },
    select: {
      userId: true,
      startTime: true,
      endTime: true,
      title: true,
    },
  });

  // Group events by date
  const eventsByDate: Record<string, { userId: string; title: string }[]> = {};

  events.forEach((event) => {
    const dateKey = event.startTime.toISOString().split("T")[0] ?? "";
    if (!eventsByDate[dateKey]) {
      eventsByDate[dateKey] = [];
    }
    eventsByDate[dateKey]!.push({ userId: event.userId, title: event.title });
  });

  // Find dates where everyone is free
  const freeDates: string[] = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const dateKey = currentDate.toISOString().split("T")[0] ?? "";
    const eventsOnDate = eventsByDate[dateKey] || [];
    const busyUserIds = new Set(eventsOnDate.map((e: { userId: string; title: string }) => e.userId));

    // Check if all users (including current user) are free
    const allFree = !allUserIds.some((id) => busyUserIds.has(id));

    if (allFree && dateKey) {
      freeDates.push(dateKey);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return c.json({
    freeDates,
    eventsByDate,
  });
});

// ============================================
// Location-Based Events
// ============================================

// GET /api/events/nearby?location=string - Get friends with events near a location
eventsRouter.get("/nearby", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const locationQuery = c.req.query("location")?.toLowerCase() || "";

  // Get blocked user IDs
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Get friendships
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      isBlocked: false,
      friendId: { notIn: allBlockedIds },
    },
  });

  const friendIds = friendships.map((f) => f.friendId);

  // Get today's date range
  const now = new Date();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // Get events from friends today that match location
  const events = await db.event.findMany({
    where: {
      userId: { in: friendIds },
      startTime: { gte: now, lte: endOfDay },
      location: { not: null },
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  // Filter by location if query provided, otherwise return all
  const filteredEvents = locationQuery
    ? events.filter((e) => e.location?.toLowerCase().includes(locationQuery))
    : events;

  // Group by location
  const eventsByLocation: Record<
    string,
    Array<{
      id: string;
      title: string;
      startTime: string;
      user: { id: string; name: string | null; image: string | null };
    }>
  > = {};

  filteredEvents.forEach((event) => {
    const loc = event.location || "Unknown";
    if (!eventsByLocation[loc]) {
      eventsByLocation[loc] = [];
    }
    eventsByLocation[loc].push({
      id: event.id,
      title: event.title,
      startTime: event.startTime.toISOString(),
      user: event.user,
    });
  });

  return c.json({ eventsByLocation });
});

// ============================================
// Smart Suggestions
// ============================================

// GET /api/events/suggestions - Get friend reconnection suggestions
eventsRouter.get("/suggestions", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get blocked user IDs
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Get all friendships with group info
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      isBlocked: false,
      friendId: { notIn: allBlockedIds },
    },
    include: {
      user_friendship_friendIdTouser: { select: { id: true, name: true, image: true } },
      friend_group_membership: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  // Get hangout history for the last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const hangoutHistory = await db.hangout_history.findMany({
    where: {
      userId: user.id,
      hangoutDate: { gte: ninetyDaysAgo },
    },
  });

  // Get events where user and friends both attended (proxy for hangouts)
  const userJoinRequests = await db.event_join_request.findMany({
    where: {
      userId: user.id,
      status: "accepted",
      event: {
        startTime: { gte: ninetyDaysAgo },
      },
    },
    include: {
      event: {
        include: {
          event_join_request: {
            where: { status: "accepted" },
            select: { userId: true },
          },
        },
      },
    },
  });

  // Count hangouts per friend
  const hangoutCounts: Record<string, { count: number; lastHangout: Date | null }> = {};

  friendships.forEach((f) => {
    hangoutCounts[f.friendId] = { count: 0, lastHangout: null };
  });

  hangoutHistory.forEach((h) => {
    const friendCount = hangoutCounts[h.friendId];
    if (friendCount) {
      friendCount.count++;
      if (!friendCount.lastHangout || h.hangoutDate > friendCount.lastHangout) {
        friendCount.lastHangout = h.hangoutDate;
      }
    }
  });

  // Also count shared event attendance
  userJoinRequests.forEach((jr) => {
    jr.event.event_join_request.forEach((otherJr) => {
      const otherCount = hangoutCounts[otherJr.userId];
      if (otherJr.userId !== user.id && otherCount) {
        otherCount.count++;
        const eventDate = jr.event.startTime;
        if (!otherCount.lastHangout || eventDate > otherCount.lastHangout) {
          otherCount.lastHangout = eventDate;
        }
      }
    });
  });

  // Find friends who haven't been seen in a while (no hangouts in 3+ weeks)
  const threeWeeksAgo = new Date();
  threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

  const suggestions = friendships
    .map((f) => {
      const hangoutInfo = hangoutCounts[f.friendId] ?? { count: 0, lastHangout: null };
      const daysSinceHangout = hangoutInfo.lastHangout
        ? Math.floor((Date.now() - hangoutInfo.lastHangout.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        friend: f.user_friendship_friendIdTouser,
        friendshipId: f.id,
        groups: f.friend_group_membership.map((gm) => gm.friend_group),
        hangoutCount: hangoutInfo.count,
        lastHangout: hangoutInfo.lastHangout?.toISOString() || null,
        daysSinceHangout,
        needsReconnection: !hangoutInfo.lastHangout || hangoutInfo.lastHangout < threeWeeksAgo,
      };
    })
    .filter((s) => s.needsReconnection)
    .sort((a, b) => b.daysSinceHangout - a.daysSinceHangout)
    .slice(0, 5);

  return c.json({ suggestions });
});

// ============================================
// Event Templates
// ============================================

// GET /api/events/templates - Get user's event templates
eventsRouter.get("/templates", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get user's custom templates
  let templates = await db.event_template.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
  });

  // If no templates, seed with defaults
  if (templates.length === 0) {
    const defaultTemplates = [
      { name: "Coffee", emoji: "☕", duration: 60, description: "Quick coffee catch-up" },
      { name: "Lunch", emoji: "🍽️", duration: 90, description: "Lunch hangout" },
      { name: "Workout", emoji: "💪", duration: 60, description: "Gym or workout session" },
      { name: "Movie Night", emoji: "🎬", duration: 180, description: "Movie time" },
      { name: "Game Night", emoji: "🎮", duration: 180, description: "Gaming session" },
      { name: "Walk", emoji: "🚶", duration: 45, description: "Walk and talk" },
      { name: "Drinks", emoji: "🍻", duration: 120, description: "Drinks at a bar" },
      { name: "Dinner", emoji: "🍝", duration: 120, description: "Dinner together" },
    ];

    await db.event_template.createMany({
      data: defaultTemplates.map((t) => ({
        ...t,
        userId: user.id,
        isDefault: true,
      })),
    });

    templates = await db.event_template.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
    });
  }

  return c.json({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      emoji: t.emoji,
      duration: t.duration,
      description: t.description,
      isDefault: t.isDefault,
    })),
  });
});

// POST /api/events/templates - Create custom template
eventsRouter.post("/templates", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { name, emoji, duration, description } = body as {
    name: string;
    emoji: string;
    duration?: number;
    description?: string;
  };

  if (!name || !emoji) {
    return c.json({ error: "Name and emoji required" }, 400);
  }

  const template = await db.event_template.create({
    data: {
      name,
      emoji,
      duration: duration || 60,
      description,
      userId: user.id,
      isDefault: false,
    },
  });

  return c.json({
    template: {
      id: template.id,
      name: template.name,
      emoji: template.emoji,
      duration: template.duration,
      description: template.description,
      isDefault: template.isDefault,
    },
  });
});

// DELETE /api/events/templates/:id - Delete custom template
eventsRouter.delete("/templates/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const templateId = c.req.param("id");

  const template = await db.event_template.findFirst({
    where: { id: templateId, userId: user.id },
  });

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  await db.event_template.delete({ where: { id: templateId } });

  return c.json({ success: true });
});

// ============================================
// Hangout Streaks
// ============================================

// GET /api/events/streaks - Get hangout streaks with friends
eventsRouter.get("/streaks", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get blocked user IDs
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Get all friendships
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      isBlocked: false,
      friendId: { notIn: allBlockedIds },
    },
    include: {
      user_friendship_friendIdTouser: { select: { id: true, name: true, image: true } },
    },
  });

  // Get hangout history
  const hangoutHistory = await db.hangout_history.findMany({
    where: { userId: user.id },
    orderBy: { hangoutDate: "desc" },
  });

  // Calculate streaks per friend
  const streaksByFriend: Record<
    string,
    {
      totalHangouts: number;
      lastHangout: Date | null;
      currentStreak: number; // consecutive weeks with at least one hangout
      longestStreak: number;
    }
  > = {};

  friendships.forEach((f) => {
    const friendHangouts = hangoutHistory
      .filter((h) => h.friendId === f.friendId)
      .sort((a, b) => b.hangoutDate.getTime() - a.hangoutDate.getTime());

    const totalHangouts = friendHangouts.length;
    const lastHangout = friendHangouts[0]?.hangoutDate || null;

    // Calculate weekly streak
    let currentStreak = 0;
    let longestStreak = 0;

    if (friendHangouts.length > 0) {
      const now = new Date();
      const weekMs = 7 * 24 * 60 * 60 * 1000;

      // Group hangouts by week
      const weeklyHangouts = new Set<number>();
      friendHangouts.forEach((h) => {
        const weekNumber = Math.floor(h.hangoutDate.getTime() / weekMs);
        weeklyHangouts.add(weekNumber);
      });

      const currentWeek = Math.floor(now.getTime() / weekMs);
      const sortedWeeks = Array.from(weeklyHangouts).sort((a, b) => b - a);

      // Count consecutive weeks from current/last week
      let streak = 0;
      let expectedWeek: number = sortedWeeks[0] === currentWeek ? currentWeek : (sortedWeeks[0] ?? 0);

      for (const week of sortedWeeks) {
        if (week === expectedWeek || week === expectedWeek - 1) {
          streak++;
          expectedWeek = week - 1;
        } else {
          break;
        }
      }

      currentStreak = streak;

      // Calculate longest streak
      let tempStreak = 1;
      for (let i = 1; i < sortedWeeks.length; i++) {
        const prev = sortedWeeks[i - 1];
        const curr = sortedWeeks[i];
        if (prev !== undefined && curr !== undefined && prev - curr === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
    }

    streaksByFriend[f.friendId] = {
      totalHangouts,
      lastHangout,
      currentStreak,
      longestStreak,
    };
  });

  const streaks = friendships
    .map((f) => {
      const streak = streaksByFriend[f.friendId] ?? { totalHangouts: 0, lastHangout: null, currentStreak: 0, longestStreak: 0 };
      return {
        friend: f.user_friendship_friendIdTouser,
        friendshipId: f.id,
        ...streak,
        lastHangout: streak.lastHangout?.toISOString() || null,
      };
    })
    .filter((s) => (s.totalHangouts ?? 0) > 0)
    .sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0));

  return c.json({ streaks });
});

// POST /api/events/hangout - Record a hangout
eventsRouter.post("/hangout", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { friendId, eventId, eventTitle, hangoutDate } = body as {
    friendId: string;
    eventId?: string;
    eventTitle?: string;
    hangoutDate?: string;
  };

  if (!friendId) {
    return c.json({ error: "Friend ID required" }, 400);
  }

  // Verify friendship exists
  const friendship = await db.friendship.findFirst({
    where: {
      userId: user.id,
      friendId,
      isBlocked: false,
    },
  });

  if (!friendship) {
    return c.json({ error: "Friendship not found" }, 404);
  }

  const hangout = await db.hangout_history.create({
    data: {
      userId: user.id,
      friendId,
      eventId,
      eventTitle,
      hangoutDate: hangoutDate ? new Date(hangoutDate) : new Date(),
    },
  });

  return c.json({
    success: true,
    hangout: {
      id: hangout.id,
      friendId: hangout.friendId,
      eventTitle: hangout.eventTitle,
      hangoutDate: hangout.hangoutDate.toISOString(),
    },
  });
});

// ============================================
// Event Photos / Memories
// ============================================

// GET /api/events/:id/photos - Get event photos
eventsRouter.get("/:id/photos", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  // Check if event exists
  const event = await db.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  const photos = await db.event_photo.findMany({
    where: { eventId },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    photos: photos.map((p) => ({
      id: p.id,
      eventId: p.eventId,
      userId: p.userId,
      imageUrl: p.imageUrl,
      caption: p.caption,
      createdAt: p.createdAt.toISOString(),
      user: p.user,
    })),
  });
});

// POST /api/events/:id/photos - Add photo to event
eventsRouter.post("/:id/photos", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");
  const body = await c.req.json();
  const { imageUrl, caption } = body as { imageUrl: string; caption?: string };

  if (!imageUrl) {
    return c.json({ error: "Image URL is required" }, 400);
  }

  // Check if event exists
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { user: true },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  // Only allow photos for past events or events happening today
  const now = new Date();
  const eventDate = new Date(event.startTime);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

  if (eventDay > today) {
    return c.json({ error: "Cannot add photos to future events" }, 400);
  }

  const photo = await db.event_photo.create({
    data: {
      eventId,
      userId: user.id,
      imageUrl,
      caption,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  // Notify event owner if someone else added a photo
  if (event.userId !== user.id) {
    await db.notification.create({
      data: {
        userId: event.userId,
        type: "new_photo",
        title: "New Photo",
        body: `${user.name ?? user.email} added a photo to: ${event.title}`,
        data: JSON.stringify({ eventId, photoId: photo.id }),
      },
    });
  }

  return c.json({
    photo: {
      id: photo.id,
      eventId: photo.eventId,
      userId: photo.userId,
      imageUrl: photo.imageUrl,
      caption: photo.caption,
      createdAt: photo.createdAt.toISOString(),
      user: photo.user,
    },
  });
});

// DELETE /api/events/:eventId/photos/:photoId - Delete photo
eventsRouter.delete("/:eventId/photos/:photoId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("eventId");
  const photoId = c.req.param("photoId");

  // Check if photo exists and belongs to user or event owner
  const photo = await db.event_photo.findUnique({
    where: { id: photoId },
    include: { event: true },
  });

  if (!photo) {
    return c.json({ error: "Photo not found" }, 404);
  }

  // Only allow deletion by photo uploader or event owner
  if (photo.userId !== user.id && photo.event.userId !== user.id) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  await db.event_photo.delete({ where: { id: photoId } });

  return c.json({ success: true });
});

// ============================================
// Suggested Times
// ============================================

// POST /api/events/suggested-times - Get suggested times when friends are free
eventsRouter.post("/suggested-times", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { friendIds, dateRange, duration = 60 } = body as {
    friendIds: string[];
    dateRange: { start: string; end: string };
    duration?: number;
  };

  if (!friendIds || friendIds.length === 0 || !dateRange) {
    return c.json({ error: "Friend IDs and date range are required" }, 400);
  }

  const rangeStart = new Date(dateRange.start);
  const rangeEnd = new Date(dateRange.end);

  // Get blocked user IDs
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Verify these are actually friends and get their info
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      friendId: { in: friendIds, notIn: allBlockedIds },
      isBlocked: false,
    },
    include: {
      user_friendship_friendIdTouser: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  const validFriends = friendships.map((f) => f.user_friendship_friendIdTouser);
  const validFriendIds = validFriends.map((f) => f.id);
  const allUserIds = [user.id, ...validFriendIds];

  // Get all events in the date range for all users
  const events = await db.event.findMany({
    where: {
      userId: { in: allUserIds },
      startTime: { gte: rangeStart, lte: rangeEnd },
    },
  });

  // Get work schedules for all users
  const workSchedules = await db.work_schedule.findMany({
    where: {
      userId: { in: allUserIds },
      isEnabled: true,
    },
  });

  // Build busy times per user per day
  // Key: "userId-YYYY-MM-DD", Value: array of busy periods in minutes from midnight
  interface BusyPeriod {
    start: number; // minutes from midnight
    end: number;
  }
  const busyTimesMap: Record<string, BusyPeriod[]> = {};

  const getKey = (userId: string, date: Date) => {
    return `${userId}-${date.toISOString().split("T")[0]}`;
  };

  // Initialize busy times for all users for all days in range
  const currentDate = new Date(rangeStart);
  while (currentDate <= rangeEnd) {
    for (const userId of allUserIds) {
      const key = getKey(userId, currentDate);
      busyTimesMap[key] = [];
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Add work schedules as busy times
  for (const ws of workSchedules) {
    if (!ws.startTime || !ws.endTime) continue;
    const timeParts = ws.startTime.split(":").map(Number);
    const endParts = ws.endTime.split(":").map(Number);
    const startHour = timeParts[0] ?? 0;
    const startMin = timeParts[1] ?? 0;
    const endHour = endParts[0] ?? 0;
    const endMin = endParts[1] ?? 0;
    const startMins = startHour * 60 + startMin;
    const endMins = endHour * 60 + endMin;

    // Apply to all matching days in the range
    const checkDate = new Date(rangeStart);
    while (checkDate <= rangeEnd) {
      if (checkDate.getDay() === ws.dayOfWeek) {
        const key = getKey(ws.userId, checkDate);
        if (busyTimesMap[key]) {
          busyTimesMap[key].push({ start: startMins, end: endMins });
        }
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
  }

  // Add events as busy times
  for (const event of events) {
    const eventStart = new Date(event.startTime);
    const eventEnd = event.endTime
      ? new Date(event.endTime)
      : new Date(eventStart.getTime() + 60 * 60 * 1000); // Default 1 hour

    const key = getKey(event.userId, eventStart);
    if (busyTimesMap[key]) {
      const startMins = eventStart.getHours() * 60 + eventStart.getMinutes();
      const endMins = eventEnd.getHours() * 60 + eventEnd.getMinutes();
      busyTimesMap[key].push({ start: startMins, end: Math.max(endMins, startMins + 30) });
    }
  }

  // Find available time slots
  const slots: Array<{
    start: string;
    end: string;
    availableFriends: Array<{ id: string; name: string | null; image: string | null }>;
    totalAvailable: number;
  }> = [];

  const dayStart = 9 * 60; // 9 AM
  const dayEnd = 21 * 60; // 9 PM
  const slotDuration = duration; // minutes

  // Check each day in the range
  const iterDate = new Date(rangeStart);
  while (iterDate <= rangeEnd) {
    // Skip past dates
    const now = new Date();
    if (iterDate < new Date(now.toDateString())) {
      iterDate.setDate(iterDate.getDate() + 1);
      continue;
    }

    const dateStr = iterDate.toISOString().split("T")[0];

    // Check time slots throughout the day
    for (let slotStart = dayStart; slotStart + slotDuration <= dayEnd; slotStart += 60) {
      const slotEnd = slotStart + slotDuration;

      // Find which friends are available during this slot
      const availableFriends: Array<{ id: string; name: string | null; image: string | null }> = [];

      for (const friend of validFriends) {
        const key = getKey(friend.id, iterDate);
        const busyPeriods = busyTimesMap[key] || [];

        // Check if this slot overlaps with any busy period
        const isBusy = busyPeriods.some(
          (busy) => !(slotEnd <= busy.start || slotStart >= busy.end)
        );

        if (!isBusy) {
          availableFriends.push(friend);
        }
      }

      // Only include slots where at least one friend is available
      if (availableFriends.length > 0) {
        const slotStartDate = new Date(iterDate);
        slotStartDate.setHours(Math.floor(slotStart / 60), slotStart % 60, 0, 0);
        const slotEndDate = new Date(iterDate);
        slotEndDate.setHours(Math.floor(slotEnd / 60), slotEnd % 60, 0, 0);

        // Skip if this slot is in the past
        if (slotStartDate <= now) continue;

        slots.push({
          start: slotStartDate.toISOString(),
          end: slotEndDate.toISOString(),
          availableFriends,
          totalAvailable: availableFriends.length,
        });
      }
    }

    iterDate.setDate(iterDate.getDate() + 1);
  }

  // Sort by most friends available, then by date
  slots.sort((a, b) => {
    if (b.totalAvailable !== a.totalAvailable) {
      return b.totalAvailable - a.totalAvailable;
    }
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  // Return top 20 slots
  return c.json({ slots: slots.slice(0, 20) });
});

// ============================================
// Activity Feed (Social Activity)
// ============================================

// GET /api/events/activity-feed - Get friend activity feed
eventsRouter.get("/activity-feed", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const limit = parseInt(c.req.query("limit") || "30");
  const offset = parseInt(c.req.query("offset") || "0");

  // Get blocked user IDs (both directions)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Get user's friendships
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      isBlocked: false,
      friendId: { notIn: allBlockedIds },
    },
    include: {
      friend_group_membership: true,
    },
  });
  const friendIds = friendships.map((f) => f.friendId);

  // Get all groups that the current user is a member of (through friendships)
  const userGroupIds = friendships.flatMap((f) =>
    f.friend_group_membership?.map((m) => m.groupId) || []
  );

  if (friendIds.length === 0) {
    return c.json({ activities: [], hasMore: false });
  }

  // Get recent activities from friends:
  // 1. Events created by friends (visible to user)
  // 2. Friends joining events
  // 3. Friends commenting on events
  // 4. Friends adding photos to events

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 1. Events created by friends - only show events user can see
  // This includes "all_friends" events OR "specific_groups" events where user is in the group
  const friendEvents = await db.event.findMany({
    where: {
      userId: { in: friendIds },
      createdAt: { gte: thirtyDaysAgo },
      OR: [
        { visibility: "all_friends" },
        {
          visibility: "specific_groups",
          event_group_visibility: {
            some: {
              groupId: { in: userGroupIds.length > 0 ? userGroupIds : ["__none__"] },
            },
          },
        },
      ],
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // 2. Friends joining events (accepted join requests)
  // Filter to only show join activities for events the user can see
  const friendJoinRequests = await db.event_join_request.findMany({
    where: {
      userId: { in: friendIds },
      status: "accepted",
      createdAt: { gte: thirtyDaysAgo },
      event: {
        OR: [
          { visibility: "all_friends" },
          {
            visibility: "specific_groups",
            event_group_visibility: {
              some: {
                groupId: { in: userGroupIds.length > 0 ? userGroupIds : ["__none__"] },
              },
            },
          },
        ],
      },
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      event: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // 3. Friends commenting on events - filter by group visibility
  const friendComments = await db.event_comment.findMany({
    where: {
      userId: { in: friendIds },
      createdAt: { gte: thirtyDaysAgo },
      event: {
        OR: [
          { visibility: "all_friends" },
          {
            visibility: "specific_groups",
            event_group_visibility: {
              some: {
                groupId: { in: userGroupIds.length > 0 ? userGroupIds : ["__none__"] },
              },
            },
          },
        ],
      },
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      event: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // 4. Friends adding photos - filter by group visibility
  const friendPhotos = await db.event_photo.findMany({
    where: {
      userId: { in: friendIds },
      createdAt: { gte: thirtyDaysAgo },
      event: {
        OR: [
          { visibility: "all_friends" },
          {
            visibility: "specific_groups",
            event_group_visibility: {
              some: {
                groupId: { in: userGroupIds.length > 0 ? userGroupIds : ["__none__"] },
              },
            },
          },
        ],
      },
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      event: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Combine into activity items
  type ActivityItem = {
    id: string;
    type: "event_created" | "event_joined" | "event_commented" | "photo_added";
    timestamp: string;
    user: { id: string; name: string | null; image: string | null };
    event: {
      id: string;
      title: string;
      emoji: string;
      startTime: string;
      host: { id: string; name: string | null; image: string | null };
    };
    content?: string; // For comments
    imageUrl?: string; // For photos
  };

  const activities: ActivityItem[] = [];

  // Add event creation activities
  for (const event of friendEvents) {
    activities.push({
      id: `event-${event.id}`,
      type: "event_created",
      timestamp: event.createdAt.toISOString(),
      user: {
        id: event.user?.id || event.userId,
        name: event.user?.name || null,
        image: event.user?.image || null,
      },
      event: {
        id: event.id,
        title: event.title,
        emoji: event.emoji,
        startTime: event.startTime.toISOString(),
        host: {
          id: event.user?.id || event.userId,
          name: event.user?.name || null,
          image: event.user?.image || null,
        },
      },
    });
  }

  // Add join activities
  for (const jr of friendJoinRequests) {
    if (!jr.event) continue;
    activities.push({
      id: `join-${jr.id}`,
      type: "event_joined",
      timestamp: jr.createdAt.toISOString(),
      user: {
        id: jr.user.id,
        name: jr.user.name,
        image: jr.user.image,
      },
      event: {
        id: jr.event.id,
        title: jr.event.title,
        emoji: jr.event.emoji,
        startTime: jr.event.startTime.toISOString(),
        host: {
          id: jr.event.user?.id || jr.event.userId,
          name: jr.event.user?.name || null,
          image: jr.event.user?.image || null,
        },
      },
    });
  }

  // Add comment activities
  for (const comment of friendComments) {
    if (!comment.event) continue;
    activities.push({
      id: `comment-${comment.id}`,
      type: "event_commented",
      timestamp: comment.createdAt.toISOString(),
      user: {
        id: comment.user.id,
        name: comment.user.name,
        image: comment.user.image,
      },
      event: {
        id: comment.event.id,
        title: comment.event.title,
        emoji: comment.event.emoji,
        startTime: comment.event.startTime.toISOString(),
        host: {
          id: comment.event.user?.id || comment.event.userId,
          name: comment.event.user?.name || null,
          image: comment.event.user?.image || null,
        },
      },
      content: comment.content,
    });
  }

  // Add photo activities
  for (const photo of friendPhotos) {
    if (!photo.event) continue;
    activities.push({
      id: `photo-${photo.id}`,
      type: "photo_added",
      timestamp: photo.createdAt.toISOString(),
      user: {
        id: photo.user.id,
        name: photo.user.name,
        image: photo.user.image,
      },
      event: {
        id: photo.event.id,
        title: photo.event.title,
        emoji: photo.event.emoji,
        startTime: photo.event.startTime.toISOString(),
        host: {
          id: photo.event.user?.id || photo.event.userId,
          name: photo.event.user?.name || null,
          image: photo.event.user?.image || null,
        },
      },
      imageUrl: photo.imageUrl,
    });
  }

  // Sort by timestamp descending
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply pagination
  const paginatedActivities = activities.slice(offset, offset + limit);
  const hasMore = offset + limit < activities.length;

  return c.json({ activities: paginatedActivities, hasMore });
});

// ============================================
// Event Summary / Host Reflection Routes
// ============================================

// GET /api/events/pending-summaries - Get past events that need summaries
eventsRouter.get("/pending-summaries", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Find events that:
  // 1. Belong to this user (they're the host)
  // 2. Have ended (endTime is in the past)
  // 3. Don't have a summary yet
  // 4. Were not notified in the last hour (to avoid spam)
  const events = await db.event.findMany({
    where: {
      userId: user.id,
      summary: null,
      endTime: { lt: oneHourAgo },
    },
    include: {
      event_join_request: {
        where: { status: "accepted" },
      },
    },
    orderBy: { startTime: "desc" },
    take: 10, // Limit to last 10 events
  });

  return c.json({
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      emoji: event.emoji,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      location: event.location,
      attendeeCount: event.event_join_request.length,
    })),
  });
});

// PUT /api/events/:id/summary - Update event summary (host only)
eventsRouter.put("/:id/summary", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  // Check if user is the host
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, userId: true },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  if (event.userId !== user.id) {
    return c.json({ error: "Only the event host can add a summary" }, 403);
  }

  const body = await c.req.json();
  const { summary, rating } = body;

  // Validate rating if provided
  if (rating !== undefined && (rating < 1 || rating > 5)) {
    return c.json({ error: "Rating must be between 1 and 5" }, 400);
  }

  // Update the event with summary
  const updatedEvent = await db.event.update({
    where: { id: eventId },
    data: {
      summary: summary ?? null,
      summaryRating: rating ?? null,
    },
    select: {
      id: true,
      summary: true,
      summaryRating: true,
    },
  });

  return c.json({
    success: true,
    event: updatedEvent,
  });
});

// POST /api/events/:id/summary/dismiss - Dismiss summary notification
eventsRouter.post("/:id/summary/dismiss", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");

  // Check if user is the host
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, userId: true },
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  if (event.userId !== user.id) {
    return c.json({ error: "Only the event host can dismiss this" }, 403);
  }

  // Mark as notified so it won't show again
  await db.event.update({
    where: { id: eventId },
    data: {
      summaryNotifiedAt: new Date(),
      summary: "", // Empty string means dismissed/skipped
    },
  });

  return c.json({ success: true });
});

// ============================================
// Calendar Import
// ============================================

import {
  importCalendarEventsRequestSchema,
  updateEventVisibilityRequestSchema,
} from "../shared/contracts";

// POST /api/events/import - Import events from device calendar
eventsRouter.post("/import", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = importCalendarEventsRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  const { events: importEvents, defaultVisibility = "all_friends" } = parsed.data;

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const resultEvents: Array<{
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    emoji: string;
    startTime: Date;
    endTime: Date | null;
    isRecurring: boolean;
    recurrence: string | null;
    visibility: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    event_group_visibility?: Array<{
      groupId: string;
      friend_group: { id: string; name: string; color: string };
    }>;
  }> = [];

  for (const importEvent of importEvents) {
    try {
      // Check if this device event already exists (by deviceCalendarId)
      const existingEvent = await db.event.findFirst({
        where: {
          userId: user.id,
          deviceCalendarId: importEvent.deviceEventId,
        },
        include: {
          event_group_visibility: {
            include: {
              friend_group: { select: { id: true, name: true, color: true } },
            },
          },
        },
      });

      if (existingEvent) {
        // Update existing event if it has changed
        const startTime = new Date(importEvent.startTime);
        // Default endTime to startTime + 1 hour if not provided
        const endTime = importEvent.endTime ? new Date(importEvent.endTime) : new Date(startTime.getTime() + 60 * 60 * 1000);

        // Check if anything has changed
        const hasChanged =
          existingEvent.title !== importEvent.title ||
          existingEvent.startTime.getTime() !== startTime.getTime() ||
          existingEvent.endTime.getTime() !== endTime.getTime() ||
          existingEvent.location !== (importEvent.location ?? null);

        if (hasChanged) {
          const updatedEvent = await db.event.update({
            where: { id: existingEvent.id },
            data: {
              title: importEvent.title,
              startTime,
              endTime,
              location: importEvent.location ?? null,
              description: importEvent.notes ?? existingEvent.description,
              deviceCalendarName: importEvent.calendarName ?? existingEvent.deviceCalendarName,
            },
            include: {
              event_group_visibility: {
                include: {
                  friend_group: { select: { id: true, name: true, color: true } },
                },
              },
            },
          });
          resultEvents.push(updatedEvent);
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Create new imported event
        const importStartTime = new Date(importEvent.startTime);
        // Default endTime to startTime + 1 hour if not provided
        const importEndTime = importEvent.endTime ? new Date(importEvent.endTime) : new Date(importStartTime.getTime() + 60 * 60 * 1000);

        const newEvent = await db.event.create({
          data: {
            title: importEvent.title,
            startTime: importStartTime,
            endTime: importEndTime,
            location: importEvent.location ?? null,
            description: importEvent.notes ?? null,
            emoji: "📅",
            userId: user.id,
            visibility: defaultVisibility === "private" ? "private" : defaultVisibility,
            isImported: true,
            deviceCalendarId: importEvent.deviceEventId,
            deviceCalendarName: importEvent.calendarName ?? null,
            importedAt: new Date(),
          },
          include: {
            event_group_visibility: {
              include: {
                friend_group: { select: { id: true, name: true, color: true } },
              },
            },
          },
        });
        resultEvents.push(newEvent);
        imported++;
      }
    } catch (error) {
      console.error("Error importing event:", error);
      skipped++;
    }
  }

  return c.json({
    success: true,
    imported,
    updated,
    skipped,
    events: resultEvents.map(e => serializeEvent(e)),
  });
});

// GET /api/events/imported - Get user's imported events
eventsRouter.get("/imported", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const events = await db.event.findMany({
    where: {
      userId: user.id,
      isImported: true,
    },
    include: {
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return c.json({
    events: events.map((event) => ({
      ...serializeEvent(event),
      isImported: event.isImported,
      deviceCalendarId: event.deviceCalendarId,
      deviceCalendarName: event.deviceCalendarName,
      importedAt: event.importedAt?.toISOString() ?? null,
    })),
  });
});

// DELETE /api/events/imported/clear - Clear all imported events
eventsRouter.delete("/imported/clear", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const result = await db.event.deleteMany({
    where: {
      userId: user.id,
      isImported: true,
    },
  });

  return c.json({ success: true, deleted: result.count });
});

// PUT /api/events/:id/visibility - Update event visibility
eventsRouter.put("/:id/visibility", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const eventId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateEventVisibilityRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check if user owns the event
  const existingEvent = await db.event.findFirst({
    where: { id: eventId, userId: user.id },
  });

  if (!existingEvent) {
    return c.json({ error: "Event not found" }, 404);
  }

  const { visibility, groupIds } = parsed.data;

  // Update event visibility
  const event = await db.event.update({
    where: { id: eventId },
    data: {
      visibility,
    },
    include: {
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  // Update group visibility if switching to specific_groups
  if (visibility === "specific_groups") {
    // Delete existing group visibility
    await db.event_group_visibility.deleteMany({ where: { eventId } });

    // Create new group visibility entries
    if (groupIds && groupIds.length > 0) {
      await db.event_group_visibility.createMany({
        data: groupIds.map((groupId) => ({ eventId, groupId })),
      });
    }
  } else {
    // Clear group visibility if not using specific_groups
    await db.event_group_visibility.deleteMany({ where: { eventId } });
  }

  // Refetch with updated group visibility
  const updatedEvent = await db.event.findUnique({
    where: { id: eventId },
    include: {
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  return c.json({
    success: true,
    event: serializeEvent(updatedEvent!),
  });
});
