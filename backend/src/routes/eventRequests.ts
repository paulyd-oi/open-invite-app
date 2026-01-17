import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import {
  createEventRequestInputSchema,
  respondEventRequestSchema,
  suggestTimeSchema,
} from "../shared/contracts";
import { sendPushNotification } from "./notifications";

export const eventRequestsRouter = new Hono<AppType>();

// Helper to serialize event request
const serializeEventRequest = (request: {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  emoji: string;
  startTime: Date;
  endTime: Date | null;
  status: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string | null; email: string | null; image: string | null };
  event_request_member: Array<{
    id: string;
    userId: string;
    status: string;
    respondedAt: Date | null;
    user: { id: string; name: string | null; email: string | null; image: string | null };
  }>;
}) => ({
  ...request,
  startTime: request.startTime.toISOString(),
  endTime: request.endTime?.toISOString() ?? null,
  createdAt: request.createdAt.toISOString(),
  updatedAt: request.updatedAt.toISOString(),
  event_request_member: request.event_request_member.map((m) => ({
    ...m,
    respondedAt: m.respondedAt?.toISOString() ?? null,
  })),
});

// GET /api/event-requests - Get all event requests user is part of
eventRequestsRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get event requests where user is creator OR a member
  const eventRequests = await db.event_request.findMany({
    where: {
      OR: [
        { creatorId: user.id },
        { event_request_member: { some: { userId: user.id } } },
      ],
      status: { not: "cancelled" },
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      event_request_member: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  // Count pending requests where user hasn't responded yet
  const pendingCount = eventRequests.filter((req) => {
    // Only count if status is pending and user is a member who hasn't responded
    if (req.status !== "pending") return false;
    const userMember = req.event_request_member.find((m) => m.userId === user.id);
    return userMember && userMember.status === "pending";
  }).length;

  return c.json({
    eventRequests: eventRequests.map(serializeEventRequest),
    pendingCount,
  });
});

// GET /api/event-requests/:id - Get single event request
eventRequestsRouter.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { id } = c.req.param();

  const eventRequest = await db.event_request.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      event_request_member: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  if (!eventRequest) {
    return c.json({ error: "Event request not found" }, 404);
  }

  // Check if user is creator or member
  const isCreator = eventRequest.creatorId === user.id;
  const isMember = eventRequest.event_request_member.some((m) => m.userId === user.id);
  if (!isCreator && !isMember) {
    return c.json({ error: "Not authorized to view this event request" }, 403);
  }

  return c.json({ eventRequest: serializeEventRequest(eventRequest) });
});

// POST /api/event-requests - Create new event request
eventRequestsRouter.post("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = createEventRequestInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  const { title, description, location, emoji, startTime, endTime, memberIds } = parsed.data;

  // Validate that all memberIds are friends of the user
  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      friendId: { in: memberIds },
      isBlocked: false,
    },
    select: { friendId: true },
  });

  const validFriendIds = friendships.map((f) => f.friendId);
  const invalidIds = memberIds.filter((id) => !validFriendIds.includes(id));
  if (invalidIds.length > 0) {
    return c.json({ error: "Some member IDs are not your friends", invalidIds }, 400);
  }

  // Create the event request with members
  const eventRequest = await db.event_request.create({
    data: {
      title,
      description: description ?? null,
      location: location ?? null,
      emoji: emoji ?? "📅",
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
      creatorId: user.id,
      status: "pending",
      event_request_member: {
        create: memberIds.map((userId) => ({
          userId,
          status: "pending",
        })),
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      event_request_member: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  // Create notifications and send push for each member
  const startDate = new Date(startTime);
  const dateStr = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  for (const memberId of memberIds) {
    // Create in-app notification
    await db.notification.create({
      data: {
        userId: memberId,
        type: "event_request",
        title: "Event Request",
        body: `${user.name ?? "Someone"} invited you to "${title}" on ${dateStr}`,
        data: JSON.stringify({ eventRequestId: eventRequest.id }),
      },
    });

    // Send push notification
    sendPushNotification(memberId, {
      title: "Event Request 📅",
      body: `${user.name ?? "Someone"} invited you to "${title}"`,
      data: { type: "event_request", eventRequestId: eventRequest.id },
    });
  }

  return c.json({ eventRequest: serializeEventRequest(eventRequest) }, 201);
});

// PUT /api/event-requests/:id/respond - Respond to event request
eventRequestsRouter.put("/:id/respond", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = respondEventRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  const { status } = parsed.data;

  // Find the event request
  const eventRequest = await db.event_request.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      event_request_member: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  if (!eventRequest) {
    return c.json({ error: "Event request not found" }, 404);
  }

  // Check if user is a member (not creator)
  const memberRecord = eventRequest.event_request_member.find((m) => m.userId === user.id);
  if (!memberRecord) {
    return c.json({ error: "You are not invited to this event request" }, 403);
  }

  if (eventRequest.status !== "pending") {
    return c.json({ error: "This event request is no longer pending" }, 400);
  }

  // Update member's response
  await db.event_request_member.update({
    where: { id: memberRecord.id },
    data: {
      status,
      respondedAt: new Date(),
    },
  });

  // Notify the creator about the response
  await db.notification.create({
    data: {
      userId: eventRequest.creatorId,
      type: "event_request_response",
      title: `Event Request ${status === "accepted" ? "Accepted" : "Declined"}`,
      body: `${user.name ?? "Someone"} ${status} your event request "${eventRequest.title}"`,
      data: JSON.stringify({ eventRequestId: eventRequest.id }),
    },
  });

  sendPushNotification(eventRequest.creatorId, {
    title: `Event Request ${status === "accepted" ? "Accepted ✅" : "Declined ❌"}`,
    body: `${user.name ?? "Someone"} ${status} "${eventRequest.title}"`,
    data: { type: "event_request_response", eventRequestId: eventRequest.id },
  });

  // If declined, just mark the member as declined but DON'T cancel the whole event request
  // This is more inclusive - one person declining shouldn't ruin it for everyone
  if (status === "declined") {
    // Check if all members have now responded (accepted or declined)
    const updatedRequest = await db.event_request.findUnique({
      where: { id },
      include: {
        event_request_member: true,
      },
    });

    const allResponded = updatedRequest?.event_request_member.every(
      (m) => m.status !== "pending"
    );

    const acceptedMembers = updatedRequest?.event_request_member.filter(m => m.status === "accepted") ?? [];

    // If all responded and at least one accepted, create the event
    if (allResponded && acceptedMembers.length > 0) {
      // Create the actual event for the creator
      // Default endTime to startTime + 1 hour if not provided in event request
      const confirmedEndTime = eventRequest.endTime ?? new Date(eventRequest.startTime.getTime() + 60 * 60 * 1000);

      const event = await db.event.create({
        data: {
          title: eventRequest.title,
          description: eventRequest.description,
          location: eventRequest.location,
          emoji: eventRequest.emoji,
          startTime: eventRequest.startTime,
          endTime: confirmedEndTime,
          userId: eventRequest.creatorId,
          visibility: "all_friends",
        },
      });

      // Create join requests (pre-approved) for accepted members only
      for (const member of acceptedMembers) {
        await db.event_join_request.create({
          data: {
            eventId: event.id,
            userId: member.userId,
            status: "accepted",
          },
        });
      }

      // Update event request status to confirmed
      await db.event_request.update({
        where: { id },
        data: { status: "confirmed" },
      });

      // Notify accepted members that the event is confirmed
      const notifyUserIds = [eventRequest.creatorId, ...acceptedMembers.map((m) => m.userId)];
      for (const userId of notifyUserIds) {
        await db.notification.create({
          data: {
            userId,
            type: "event_confirmed",
            title: "Event Confirmed! 🎉",
            body: `"${eventRequest.title}" is happening!`,
            data: JSON.stringify({ eventId: event.id, eventRequestId: eventRequest.id }),
          },
        });

        sendPushNotification(userId, {
          title: "Event Confirmed! 🎉",
          body: `"${eventRequest.title}" is happening!`,
          data: { type: "event_confirmed", eventId: event.id },
        });
      }

      return c.json({ success: true, eventCreated: true, eventId: event.id });
    }

    // If all declined, cancel the request
    if (allResponded && acceptedMembers.length === 0) {
      await db.event_request.update({
        where: { id },
        data: { status: "cancelled" },
      });

      // Notify creator
      await db.notification.create({
        data: {
          userId: eventRequest.creatorId,
          type: "event_request_cancelled",
          title: "Event Request Declined",
          body: `Everyone declined "${eventRequest.title}"`,
          data: JSON.stringify({ eventRequestId: eventRequest.id }),
        },
      });
    }

    return c.json({ success: true, eventCreated: false });
  }

  // Check if all members have accepted
  const updatedRequest = await db.event_request.findUnique({
    where: { id },
    include: {
      event_request_member: true,
    },
  });

  const allAccepted = updatedRequest?.event_request_member.every(
    (m) => m.status === "accepted" || m.userId === user.id && status === "accepted"
  );

  if (allAccepted) {
    // Create the actual event for the creator
    // Default endTime to startTime + 1 hour if not provided in event request
    const allAcceptedEndTime = eventRequest.endTime ?? new Date(eventRequest.startTime.getTime() + 60 * 60 * 1000);

    const event = await db.event.create({
      data: {
        title: eventRequest.title,
        description: eventRequest.description,
        location: eventRequest.location,
        emoji: eventRequest.emoji,
        startTime: eventRequest.startTime,
        endTime: allAcceptedEndTime,
        userId: eventRequest.creatorId,
        visibility: "all_friends",
      },
    });

    // Create join requests (pre-approved) for all members
    for (const member of eventRequest.event_request_member) {
      await db.event_join_request.create({
        data: {
          eventId: event.id,
          userId: member.userId,
          status: "accepted",
        },
      });
    }

    // Update event request status to confirmed
    await db.event_request.update({
      where: { id },
      data: { status: "confirmed" },
    });

    // Notify everyone that the event is confirmed
    const allUserIds = [eventRequest.creatorId, ...eventRequest.event_request_member.map((m) => m.userId)];
    for (const userId of allUserIds) {
      await db.notification.create({
        data: {
          userId,
          type: "event_confirmed",
          title: "Event Confirmed! 🎉",
          body: `"${eventRequest.title}" is happening! Everyone accepted.`,
          data: JSON.stringify({ eventId: event.id, eventRequestId: eventRequest.id }),
        },
      });

      sendPushNotification(userId, {
        title: "Event Confirmed! 🎉",
        body: `"${eventRequest.title}" is happening! Everyone accepted.`,
        data: { type: "event_confirmed", eventId: event.id },
      });
    }

    return c.json({ success: true, eventCreated: true, eventId: event.id });
  }

  return c.json({ success: true, eventCreated: false });
});

// DELETE /api/event-requests/:id - Cancel event request (creator only)
eventRequestsRouter.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { id } = c.req.param();

  const eventRequest = await db.event_request.findUnique({
    where: { id },
    include: { event_request_member: true },
  });

  if (!eventRequest) {
    return c.json({ error: "Event request not found" }, 404);
  }

  if (eventRequest.creatorId !== user.id) {
    return c.json({ error: "Only the creator can cancel this event request" }, 403);
  }

  // Update status to cancelled
  await db.event_request.update({
    where: { id },
    data: { status: "cancelled" },
  });

  // Notify all members
  for (const member of eventRequest.event_request_member) {
    await db.notification.create({
      data: {
        userId: member.userId,
        type: "event_request_cancelled",
        title: "Event Request Cancelled",
        body: `${user.name ?? "The host"} cancelled "${eventRequest.title}"`,
        data: JSON.stringify({ eventRequestId: eventRequest.id }),
      },
    });

    sendPushNotification(member.userId, {
      title: "Event Request Cancelled",
      body: `"${eventRequest.title}" was cancelled`,
      data: { type: "event_request_cancelled", eventRequestId: eventRequest.id },
    });
  }

  return c.json({ success: true });
});

// POST /api/event-requests/:id/nudge - Send a nudge reminder to pending members
eventRequestsRouter.post("/:id/nudge", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { id } = c.req.param();

  const eventRequest = await db.event_request.findUnique({
    where: { id },
    include: {
      event_request_member: {
        include: {
          user: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!eventRequest) {
    return c.json({ error: "Event request not found" }, 404);
  }

  if (eventRequest.creatorId !== user.id) {
    return c.json({ error: "Only the creator can send nudges" }, 403);
  }

  if (eventRequest.status !== "pending") {
    return c.json({ error: "This event request is no longer pending" }, 400);
  }

  // Find pending members
  const pendingMembers = eventRequest.event_request_member.filter((m) => m.status === "pending");

  if (pendingMembers.length === 0) {
    return c.json({ error: "No pending members to nudge" }, 400);
  }

  // Send nudge notification to each pending member
  for (const member of pendingMembers) {
    await db.notification.create({
      data: {
        userId: member.userId,
        type: "event_request_nudge",
        title: "Reminder: RSVP Needed! 👋",
        body: `${user.name ?? "Someone"} is waiting for your response to "${eventRequest.title}"`,
        data: JSON.stringify({ eventRequestId: eventRequest.id }),
      },
    });

    sendPushNotification(member.userId, {
      title: "Reminder: RSVP Needed! 👋",
      body: `${user.name ?? "Someone"} is waiting for your response to "${eventRequest.title}"`,
      data: { type: "event_request_nudge", eventRequestId: eventRequest.id },
    });
  }

  return c.json({ success: true, nudgedCount: pendingMembers.length });
});

// POST /api/event-requests/:id/suggest-time - Suggest alternative time when declining
eventRequestsRouter.post("/:id/suggest-time", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = suggestTimeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  const { suggestedTime, message } = parsed.data;

  const eventRequest = await db.event_request.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true } },
      event_request_member: true,
    },
  });

  if (!eventRequest) {
    return c.json({ error: "Event request not found" }, 404);
  }

  // Check if user is a member
  const isMember = eventRequest.event_request_member.some((m) => m.userId === user.id);
  if (!isMember && eventRequest.creatorId !== user.id) {
    return c.json({ error: "You are not part of this event request" }, 403);
  }

  const suggestedDate = new Date(suggestedTime);
  const dateStr = suggestedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Notify the creator about the suggested time
  const notificationBody = message
    ? `${user.name ?? "Someone"} suggested ${dateStr} for "${eventRequest.title}": "${message}"`
    : `${user.name ?? "Someone"} suggested ${dateStr} for "${eventRequest.title}"`;

  await db.notification.create({
    data: {
      userId: eventRequest.creatorId,
      type: "event_request_suggestion",
      title: "New Time Suggested",
      body: notificationBody,
      data: JSON.stringify({
        eventRequestId: eventRequest.id,
        suggestedTime,
        suggesterId: user.id,
        suggesterName: user.name,
        message,
      }),
    },
  });

  sendPushNotification(eventRequest.creatorId, {
    title: "New Time Suggested 📅",
    body: notificationBody,
    data: {
      type: "event_request_suggestion",
      eventRequestId: eventRequest.id,
      suggestedTime,
    },
  });

  return c.json({ success: true });
});
