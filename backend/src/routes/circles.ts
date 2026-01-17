import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { z } from "zod";
import {
  canCreateCircle,
  canAddCircleMember,
} from "../utils/subscriptionHelpers";
import { FREE_TIER_LIMITS } from "../shared/freemiumLimits";

export const circlesRouter = new Hono<AppType>();

// Schemas
const createCircleSchema = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().optional().default("👥"),
  memberIds: z.array(z.string()).min(1), // User IDs to add as members
});

const updateCircleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  emoji: z.string().optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional(),
});

const addMembersSchema = z.object({
  memberIds: z.array(z.string()).min(1),
});

// Helper to serialize circle (excludes relation fields that we rename in responses)
const serializeCircle = (circle: any) => {
  // Destructure to exclude fields we handle separately
  const { circle_member, circle_message, ...rest } = circle;
  return {
    ...rest,
    createdAt: circle.createdAt?.toISOString?.() ?? circle.createdAt,
    updatedAt: circle.updatedAt?.toISOString?.() ?? circle.updatedAt,
  };
};

// GET /api/circles - Get all circles user is a member of
circlesRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circles = await db.circle.findMany({
    where: {
      circle_member: {
        some: { userId: user.id },
      },
    },
    include: {
      circle_member: {
        include: {
          // We need to get the user data separately since CircleMember doesn't have a relation to User
        },
        orderBy: { joinedAt: "asc" },
      },
      _count: {
        select: { circle_message: true },
      },
    },
    orderBy: [
      { updatedAt: "desc" },
    ],
  });

  // Get all member user IDs
  const allMemberIds = circles.flatMap((c: { circle_member: { userId: string }[] }) => c.circle_member.map((m: { userId: string }) => m.userId));
  const uniqueMemberIds = [...new Set(allMemberIds)];

  // Fetch all users at once
  const users = await db.user.findMany({
    where: { id: { in: uniqueMemberIds } },
    select: { id: true, name: true, email: true, image: true },
  });

  const userMap = new Map(users.map((u: { id: string; name: string | null; email: string | null; image: string | null }) => [u.id, u]));

  // Also get pinned status for each circle for the current user
  const circlesWithUsers = await Promise.all(circles.map(async (circle: typeof circles[0]) => {
    const currentUserMember = circle.circle_member.find((m: { userId: string }) => m.userId === user.id);

    // Calculate unread messages count
    const lastReadAt = currentUserMember?.lastReadAt;
    let unreadCount = 0;

    if (lastReadAt) {
      unreadCount = await db.circle_message.count({
        where: {
          circleId: circle.id,
          createdAt: { gt: lastReadAt },
          userId: { not: user.id }, // Don't count own messages
        },
      });
    } else {
      // Never read - count all messages except own
      unreadCount = await db.circle_message.count({
        where: {
          circleId: circle.id,
          userId: { not: user.id },
        },
      });
    }

    return {
      ...serializeCircle(circle),
      isPinned: currentUserMember?.isPinned ?? false,
      unreadCount,
      members: circle.circle_member.map(m => ({
        ...m,
        joinedAt: m.joinedAt.toISOString(),
        user: userMap.get(m.userId) ?? { id: m.userId, name: null, email: "", image: null },
      })),
      messageCount: circle._count.circle_message,
    };
  }));

  // Sort pinned circles first
  circlesWithUsers.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  return c.json({ circles: circlesWithUsers });
});

// GET /api/circles/:id - Get circle details with recent messages
circlesRouter.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");

  const circle = await db.circle.findFirst({
    where: {
      id: circleId,
      circle_member: {
        some: { userId: user.id },
      },
    },
    include: {
      circle_member: true,
      circle_message: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      circle_event: true,
    },
  });

  if (!circle) {
    return c.json({ error: "Circle not found" }, 404);
  }

  // Get all member user data
  const memberIds = circle.circle_member.map(m => m.userId);
  const users = await db.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, name: true, email: true, image: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));

  // Get message sender data
  const messageUserIds = circle.circle_message.map(m => m.userId);
  const messageUsers = await db.user.findMany({
    where: { id: { in: messageUserIds } },
    select: { id: true, name: true, email: true, image: true },
  });
  const messageUserMap = new Map(messageUsers.map(u => [u.id, u]));

  // Get event details for circle events
  const eventIds = circle.circle_event.map(e => e.eventId);
  const events = await db.event.findMany({
    where: { id: { in: eventIds } },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
      event_join_request: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  const eventMap = new Map(events.map(e => [e.id, e]));

  // Get each member's upcoming events (for stacked calendar)
  // This includes events they created AND events they're attending
  const memberEvents = await Promise.all(
    memberIds.map(async (memberId) => {
      // Get events created by this member
      const ownEvents = await db.event.findMany({
        where: {
          userId: memberId,
          startTime: { gte: new Date() },
        },
        select: {
          id: true,
          title: true,
          emoji: true,
          startTime: true,
          endTime: true,
          location: true,
          visibility: true,
        },
        orderBy: { startTime: "asc" },
        take: 20,
      });

      // Get events this member is attending (via accepted join requests)
      const attendingJoinRequests = await db.event_join_request.findMany({
        where: {
          userId: memberId,
          status: "accepted",
          event: {
            startTime: { gte: new Date() },
          },
        },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              emoji: true,
              startTime: true,
              endTime: true,
              location: true,
              visibility: true,
            },
          },
        },
        take: 20,
      });

      const attendingEvents = attendingJoinRequests
        .map(jr => jr.event)
        .filter((e): e is NonNullable<typeof e> => e !== null);

      // Combine and dedupe events
      const allEventsMap = new Map<string, typeof ownEvents[0]>();
      for (const e of ownEvents) {
        allEventsMap.set(e.id, e);
      }
      for (const e of attendingEvents) {
        if (!allEventsMap.has(e.id)) {
          allEventsMap.set(e.id, e);
        }
      }
      const allEvents = Array.from(allEventsMap.values())
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
        .slice(0, 30);

      // Get circle events for this member (to check if they're private)
      const circleEventIds = await db.circle_event.findMany({
        where: { eventId: { in: allEvents.map(e => e.id) } },
        select: { eventId: true, isPrivate: true },
      });

      const circleEventMap = new Map(circleEventIds.map(ce => [ce.eventId, ce]));

      return {
        userId: memberId,
        events: allEvents.map(e => {
          const circleEvent = circleEventMap.get(e.id);
          const isPrivateCircleEvent = circleEvent?.isPrivate ?? false;

          // If it's a private circle event and this user is not the owner, show as "busy"
          if (isPrivateCircleEvent && e.visibility === "specific_groups") {
            return {
              id: e.id,
              title: "Busy",
              emoji: "🔒",
              startTime: e.startTime.toISOString(),
              endTime: e.endTime?.toISOString() ?? null,
              location: null,
              isPrivate: true,
            };
          }

          return {
            id: e.id,
            title: e.title,
            emoji: e.emoji,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime?.toISOString() ?? null,
            location: e.location,
            isPrivate: false,
          };
        }),
      };
    })
  );

  const currentUserMember = circle.circle_member.find(m => m.userId === user.id);

  return c.json({
    circle: {
      ...serializeCircle(circle),
      isPinned: currentUserMember?.isPinned ?? false,
      members: circle.circle_member.map(m => ({
        ...m,
        joinedAt: m.joinedAt.toISOString(),
        user: userMap.get(m.userId) ?? { id: m.userId, name: null, email: "", image: null },
      })),
      messages: circle.circle_message.reverse().map(m => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        user: messageUserMap.get(m.userId) ?? { id: m.userId, name: null, email: "", image: null },
      })),
      circleEvents: circle.circle_event.map(ce => ({
        ...ce,
        createdAt: ce.createdAt.toISOString(),
        event: eventMap.get(ce.eventId) ? {
          ...eventMap.get(ce.eventId),
          startTime: eventMap.get(ce.eventId)!.startTime.toISOString(),
          endTime: eventMap.get(ce.eventId)!.endTime?.toISOString() ?? null,
          createdAt: eventMap.get(ce.eventId)!.createdAt.toISOString(),
          updatedAt: eventMap.get(ce.eventId)!.updatedAt.toISOString(),
        } : null,
      })),
      memberEvents,
    },
  });
});

// POST /api/circles - Create a new circle
circlesRouter.post("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = createCircleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check circle creation limit (FREE: 2 circles)
  const circleLimit = await canCreateCircle(user.id);
  if (!circleLimit.allowed) {
    return c.json({
      error: "Circle limit reached",
      message: `Free accounts can create up to ${circleLimit.limit} circles. Upgrade to Pro for unlimited circles.`,
      limit: circleLimit.limit,
      current: circleLimit.current,
      requiresUpgrade: true,
    }, 403);
  }

  // Check member limit (FREE: 15 members per circle)
  // Note: memberIds + creator = total members
  const totalMembers = parsed.data.memberIds.length + 1;
  if (!circleLimit.isPro && totalMembers > FREE_TIER_LIMITS.maxCircleMembers) {
    return c.json({
      error: "Too many members",
      message: `Free accounts can have up to ${FREE_TIER_LIMITS.maxCircleMembers} members per circle. Upgrade to Pro for unlimited members.`,
      limit: FREE_TIER_LIMITS.maxCircleMembers,
      requested: totalMembers,
      requiresUpgrade: true,
    }, 403);
  }

  // Verify all memberIds are friends with the user
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      friendId: { in: parsed.data.memberIds },
    },
  });

  const validFriendIds = friendships.map(f => f.friendId);
  const invalidIds = parsed.data.memberIds.filter(id => !validFriendIds.includes(id));

  if (invalidIds.length > 0) {
    return c.json({ error: "Some members are not your friends" }, 400);
  }

  // Create the circle with creator + selected friends as members
  const circle = await db.circle.create({
    data: {
      name: parsed.data.name,
      emoji: parsed.data.emoji,
      createdById: user.id,
      circle_member: {
        create: [
          { userId: user.id }, // Creator is always a member
          ...parsed.data.memberIds.map(id => ({ userId: id })),
        ],
      },
    },
    include: {
      circle_member: true,
    },
  });

  // Get member user data
  const memberIds = circle.circle_member.map(m => m.userId);
  const users = await db.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, name: true, email: true, image: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  return c.json({
    circle: {
      ...serializeCircle(circle),
      isPinned: false,
      members: circle.circle_member.map(m => ({
        ...m,
        joinedAt: m.joinedAt.toISOString(),
        user: userMap.get(m.userId) ?? { id: m.userId, name: null, email: "", image: null },
      })),
    },
  });
});

// PUT /api/circles/:id - Update circle
circlesRouter.put("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateCircleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check user is a member
  const membership = await db.circle_member.findUnique({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Circle not found" }, 404);
  }

  const circle = await db.circle.update({
    where: { id: circleId },
    data: parsed.data,
    include: { circle_member: true },
  });

  return c.json({ circle: serializeCircle(circle) });
});

// DELETE /api/circles/:id - Delete/leave circle
circlesRouter.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");

  const circle = await db.circle.findFirst({
    where: {
      id: circleId,
      circle_member: { some: { userId: user.id } },
    },
    include: {
      circle_member: true,
    },
  });

  if (!circle) {
    return c.json({ error: "Circle not found" }, 404);
  }

  // If user is the creator and there are other members, they can't delete
  // Just remove themselves
  if (circle.createdById === user.id && circle.circle_member.length > 1) {
    // Transfer ownership to next member
    const nextOwner = circle.circle_member.find(m => m.userId !== user.id);
    if (nextOwner) {
      await db.circle.update({
        where: { id: circleId },
        data: { createdById: nextOwner.userId },
      });
    }
  }

  // Remove user from circle
  await db.circle_member.delete({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
  });

  // If no members left, delete the circle
  const remainingMembers = await db.circle_member.count({
    where: { circleId },
  });

  if (remainingMembers === 0) {
    await db.circle.delete({ where: { id: circleId } });
  }

  return c.json({ success: true });
});

// POST /api/circles/:id/pin - Pin/unpin circle
circlesRouter.post("/:id/pin", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");

  const membership = await db.circle_member.findUnique({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Circle not found" }, 404);
  }

  await db.circle_member.update({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
    data: { isPinned: !membership.isPinned },
  });

  return c.json({ isPinned: !membership.isPinned });
});

// POST /api/circles/:id/members - Add members to circle
circlesRouter.post("/:id/members", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");
  const body = await c.req.json();
  const parsed = addMembersSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check user is a member of the circle
  const membership = await db.circle_member.findUnique({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Circle not found" }, 404);
  }

  // Check member limit with virality rule (Pro owner bypasses limit)
  const memberLimit = await canAddCircleMember(user.id, circleId);
  const newMemberCount = memberLimit.current + parsed.data.memberIds.length;

  if (!memberLimit.allowed || (!memberLimit.isPro && !memberLimit.bypassedByOwner && newMemberCount > FREE_TIER_LIMITS.maxCircleMembers)) {
    return c.json({
      error: "Member limit reached",
      message: `Free accounts can have up to ${FREE_TIER_LIMITS.maxCircleMembers} members per circle. Upgrade to Pro for unlimited members.`,
      limit: FREE_TIER_LIMITS.maxCircleMembers,
      current: memberLimit.current,
      requiresUpgrade: true,
    }, 403);
  }

  // Verify all memberIds are friends with the user
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      friendId: { in: parsed.data.memberIds },
    },
  });

  const validFriendIds = friendships.map(f => f.friendId);

  // Add valid members
  for (const friendId of validFriendIds) {
    try {
      await db.circle_member.create({
        data: { circleId, userId: friendId },
      });
    } catch {
      // Already a member, ignore
    }
  }

  return c.json({ success: true, addedCount: validFriendIds.length });
});

// DELETE /api/circles/:id/members/:userId - Remove member from circle
circlesRouter.delete("/:id/members/:userId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");
  const targetUserId = c.req.param("userId");

  // Check user is a member of the circle
  const membership = await db.circle_member.findUnique({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Circle not found" }, 404);
  }

  // Can only remove yourself or if you're the creator
  const circle = await db.circle.findUnique({ where: { id: circleId } });

  if (targetUserId !== user.id && circle?.createdById !== user.id) {
    return c.json({ error: "Cannot remove other members" }, 403);
  }

  await db.circle_member.delete({
    where: {
      circleId_userId: { circleId, userId: targetUserId },
    },
  });

  return c.json({ success: true });
});

// GET /api/circles/:id/messages - Get messages (with pagination)
circlesRouter.get("/:id/messages", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");
  const before = c.req.query("before"); // Message ID for pagination
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 100);

  // Check user is a member
  const membership = await db.circle_member.findUnique({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Circle not found" }, 404);
  }

  const messages = await db.circle_message.findMany({
    where: {
      circleId,
      ...(before && {
        createdAt: {
          lt: (await db.circle_message.findUnique({ where: { id: before } }))?.createdAt,
        },
      }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Get user data for messages
  const userIds = messages.map(m => m.userId);
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, image: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  return c.json({
    circle_message: messages.reverse().map(m => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      user: userMap.get(m.userId) ?? { id: m.userId, name: null, email: "", image: null },
    })),
    hasMore: messages.length === limit,
  });
});

// POST /api/circles/:id/messages - Send a message
circlesRouter.post("/:id/messages", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");
  const body = await c.req.json();
  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check user is a member
  const membership = await db.circle_member.findUnique({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Circle not found" }, 404);
  }

  const message = await db.circle_message.create({
    data: {
      circleId,
      userId: user.id,
      content: parsed.data.content,
      imageUrl: parsed.data.imageUrl,
    },
  });

  // Update circle's updatedAt
  await db.circle.update({
    where: { id: circleId },
    data: { updatedAt: new Date() },
  });

  // Get user data
  const userData = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, image: true },
  });

  return c.json({
    message: {
      ...message,
      createdAt: message.createdAt.toISOString(),
      user: userData,
    },
  });
});

// GET /api/circles/:id/availability - Get free time slots for all members
circlesRouter.get("/:id/availability", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");
  const startDate = new Date(c.req.query("startDate") ?? new Date().toISOString());
  const endDate = new Date(c.req.query("endDate") ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

  // Check user is a member
  const circle = await db.circle.findFirst({
    where: {
      id: circleId,
      circle_member: { some: { userId: user.id } },
    },
    include: { circle_member: true },
  });

  if (!circle) {
    return c.json({ error: "Circle not found" }, 404);
  }

  const memberIds = circle.circle_member.map(m => m.userId);

  // Get all events for all members in the date range
  const allEvents = await db.event.findMany({
    where: {
      userId: { in: memberIds },
      OR: [
        {
          startTime: { gte: startDate, lte: endDate },
        },
        {
          endTime: { gte: startDate, lte: endDate },
        },
      ],
    },
    select: {
      userId: true,
      startTime: true,
      endTime: true,
    },
  });

  // Get work schedules for all members
  const workSchedules = await db.work_schedule.findMany({
    where: {
      userId: { in: memberIds },
      isEnabled: true,
    },
  });

  // Build busy times for each member
  const busyTimes = new Map<string, Array<{ start: Date; end: Date }>>();

  for (const event of allEvents) {
    if (!busyTimes.has(event.userId)) {
      busyTimes.set(event.userId, []);
    }
    busyTimes.get(event.userId)!.push({
      start: event.startTime,
      end: event.endTime ?? new Date(event.startTime.getTime() + 60 * 60 * 1000), // Default 1 hour
    });
  }

  // Add work schedule busy times
  for (const schedule of workSchedules) {
    if (!schedule.startTime || !schedule.endTime) continue;

    const startParts = schedule.startTime.split(":").map(Number);
    const endParts = schedule.endTime.split(":").map(Number);
    const startHour = startParts[0] ?? 0;
    const startMin = startParts[1] ?? 0;
    const endHour = endParts[0] ?? 0;
    const endMin = endParts[1] ?? 0;

    // Add work times for each day in range that matches the day of week
    const current = new Date(startDate);
    while (current <= endDate) {
      if (current.getDay() === schedule.dayOfWeek) {
        const workStart = new Date(current);
        workStart.setHours(startHour, startMin, 0, 0);

        const workEnd = new Date(current);
        workEnd.setHours(endHour, endMin, 0, 0);

        if (!busyTimes.has(schedule.userId)) {
          busyTimes.set(schedule.userId, []);
        }
        busyTimes.get(schedule.userId)!.push({
          start: workStart,
          end: workEnd,
        });
      }
      current.setDate(current.getDate() + 1);
    }
  }

  // Find common free times
  // For simplicity, we'll return busy periods per member and let client calculate overlap
  const memberBusyTimes = memberIds.map(id => ({
    userId: id,
    busyTimes: (busyTimes.get(id) ?? []).map(t => ({
      start: t.start.toISOString(),
      end: t.end.toISOString(),
    })),
  }));

  return c.json({
    availability: memberBusyTimes,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
});

// POST /api/circles/:id/events - Create a circle event
circlesRouter.post("/:id/events", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");
  const body = await c.req.json();

  // Check user is a member
  const circle = await db.circle.findFirst({
    where: {
      id: circleId,
      circle_member: { some: { userId: user.id } },
    },
    include: { circle_member: true },
  });

  if (!circle) {
    return c.json({ error: "Circle not found" }, 404);
  }

  const eventSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    location: z.string().max(500).optional(),
    emoji: z.string().optional().default("📅"),
    startTime: z.string(),
    endTime: z.string().optional(),
    isPrivate: z.boolean().optional().default(true),
  });

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  const circleEventStartTime = new Date(parsed.data.startTime);
  // Default endTime to startTime + 1 hour if not provided
  const circleEventEndTime = parsed.data.endTime ? new Date(parsed.data.endTime) : new Date(circleEventStartTime.getTime() + 60 * 60 * 1000);

  // Validate endTime > startTime
  if (circleEventEndTime <= circleEventStartTime) {
    return c.json({ error: "End time must be after start time" }, 400);
  }

  // Create the event
  const event = await db.event.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      emoji: parsed.data.emoji,
      startTime: circleEventStartTime,
      endTime: circleEventEndTime,
      userId: user.id,
      visibility: parsed.data.isPrivate ? "specific_groups" : "all_friends",
    },
  });

  // Create circle event link
  await db.circle_event.create({
    data: {
      circleId,
      eventId: event.id,
      isPrivate: parsed.data.isPrivate,
    },
  });

  // Auto-add all circle members as attendees (with accepted status)
  for (const member of circle.circle_member) {
    if (member.userId !== user.id) {
      try {
        await db.event_join_request.create({
          data: {
            eventId: event.id,
            userId: member.userId,
            status: "accepted",
          },
        });
      } catch {
        // Ignore if already exists
      }
    }
  }

  // Send system message to circle
  await db.circle_message.create({
    data: {
      circleId,
      userId: user.id,
      content: `📅 Created event: ${parsed.data.title}`,
    },
  });

  return c.json({
    event: {
      ...event,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime?.toISOString() ?? null,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    },
  });
});

// Pin/unpin friendship
circlesRouter.post("/friends/:friendshipId/pin", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const friendshipId = c.req.param("friendshipId");

  // Verify friendship belongs to user
  const friendship = await db.friendship.findFirst({
    where: { id: friendshipId, userId: user.id },
  });

  if (!friendship) {
    return c.json({ error: "Friendship not found" }, 404);
  }

  // Check if already pinned
  const existing = await db.pinned_friendship.findUnique({
    where: {
      userId_friendshipId: { userId: user.id, friendshipId },
    },
  });

  if (existing) {
    // Unpin
    await db.pinned_friendship.delete({
      where: { id: existing.id },
    });
    return c.json({ isPinned: false });
  } else {
    // Pin
    await db.pinned_friendship.create({
      data: { userId: user.id, friendshipId },
    });
    return c.json({ isPinned: true });
  }
});

// Get pinned friendships
circlesRouter.get("/friends/pinned", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const pinned = await db.pinned_friendship.findMany({
    where: { userId: user.id },
    select: { friendshipId: true, pinnedAt: true },
  });

  return c.json({
    pinnedFriendshipIds: pinned.map(p => p.friendshipId),
  });
});

// POST /api/circles/:id/read - Mark circle messages as read
circlesRouter.post("/:id/read", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const circleId = c.req.param("id");

  // Check user is a member
  const membership = await db.circle_member.findUnique({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Circle not found" }, 404);
  }

  // Update lastReadAt
  await db.circle_member.update({
    where: {
      circleId_userId: { circleId, userId: user.id },
    },
    data: { lastReadAt: new Date() },
  });

  return c.json({ success: true });
});

// GET /api/circles/unread/count - Get total unread count across all circles
circlesRouter.get("/unread/count", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get all circles user is a member of
  const memberships = await db.circle_member.findMany({
    where: { userId: user.id },
    select: { circleId: true, lastReadAt: true },
  });

  if (memberships.length === 0) {
    return c.json({ totalUnread: 0 });
  }

  // Calculate total unread
  let totalUnread = 0;

  for (const membership of memberships) {
    if (membership.lastReadAt) {
      const count = await db.circle_message.count({
        where: {
          circleId: membership.circleId,
          createdAt: { gt: membership.lastReadAt },
          userId: { not: user.id },
        },
      });
      totalUnread += count;
    } else {
      // Never read - count all messages except own
      const count = await db.circle_message.count({
        where: {
          circleId: membership.circleId,
          userId: { not: user.id },
        },
      });
      totalUnread += count;
    }
  }

  return c.json({ totalUnread });
});
