/**
 * Widget API Routes
 *
 * Provides data for iOS Home Screen Widgets
 * These endpoints are designed to be lightweight and fast for widget refresh
 */

import { Hono } from "hono";
import { type AppType } from "../types";
import { db } from "../db";

export const widgetRouter = new Hono<AppType>();

/**
 * GET /api/widget/today
 * Returns today's events for the authenticated user (for iOS widget)
 * Optimized for widget display - minimal data, fast response
 */
widgetRouter.get("/today", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Get start and end of today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Fetch user's events for today
    const myEvents = await db.event.findMany({
      where: {
        userId: user.id,
        startTime: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      select: {
        id: true,
        title: true,
        emoji: true,
        startTime: true,
        endTime: true,
        location: true,
      },
      orderBy: { startTime: "asc" },
      take: 5, // Limit for widget display
    });

    // Fetch events I'm attending today
    const attendingEvents = await db.event.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lt: endOfDay,
        },
        event_join_request: {
          some: {
            userId: user.id,
            status: "accepted",
          },
        },
      },
      select: {
        id: true,
        title: true,
        emoji: true,
        startTime: true,
        endTime: true,
        location: true,
        user: {
          select: { name: true },
        },
      },
      orderBy: { startTime: "asc" },
      take: 5,
    });

    // Combine and sort all events
    const allEvents = [
      ...myEvents.map((e) => ({
        ...e,
        isHost: true,
        hostName: "You",
        startTime: e.startTime.toISOString(),
        endTime: e.endTime?.toISOString() ?? null,
      })),
      ...attendingEvents.map((e) => ({
        ...e,
        isHost: false,
        hostName: e.user?.name ?? "Someone",
        startTime: e.startTime.toISOString(),
        endTime: e.endTime?.toISOString() ?? null,
        user: undefined,
      })),
    ]
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 5); // Ensure max 5 events for widget

    // Get friend activity count (events friends posted today)
    const friendActivityCount = await db.event.count({
      where: {
        startTime: {
          gte: startOfDay,
          lt: endOfDay,
        },
        user: {
          OR: [
            {
              friend_request_friend_request_senderIdTouser: {
                some: {
                  receiverId: user.id,
                  status: "accepted",
                },
              },
            },
            {
              friend_request_friend_request_receiverIdTouser: {
                some: {
                  senderId: user.id,
                  status: "accepted",
                },
              },
            },
          ],
        },
      },
    });

    return c.json({
      date: startOfDay.toISOString(),
      events: allEvents,
      totalCount: allEvents.length,
      friendActivityCount,
    });
  } catch (error: any) {
    console.error("Widget API error:", error);
    return c.json({ error: "Failed to fetch widget data" }, 500);
  }
});

/**
 * GET /api/widget/upcoming
 * Returns upcoming events for the next 7 days (for larger widgets)
 */
widgetRouter.get("/upcoming", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch upcoming events
    const events = await db.event.findMany({
      where: {
        OR: [
          { userId: user.id },
          {
            event_join_request: {
              some: {
                userId: user.id,
                status: "accepted",
              },
            },
          },
        ],
        startTime: {
          gte: now,
          lt: weekFromNow,
        },
      },
      select: {
        id: true,
        title: true,
        emoji: true,
        startTime: true,
        location: true,
        userId: true,
      },
      orderBy: { startTime: "asc" },
      take: 10,
    });

    return c.json({
      events: events.map((e) => ({
        ...e,
        startTime: e.startTime.toISOString(),
        isHost: e.userId === user.id,
        userId: undefined,
      })),
    });
  } catch (error: any) {
    console.error("Widget API error:", error);
    return c.json({ error: "Failed to fetch widget data" }, 500);
  }
});

/**
 * GET /api/widget/summary
 * Returns a quick summary for small widget display
 */
widgetRouter.get("/summary", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Count today's events
    const todayEventsCount = await db.event.count({
      where: {
        OR: [
          { userId: user.id },
          {
            event_join_request: {
              some: {
                userId: user.id,
                status: "accepted",
              },
            },
          },
        ],
        startTime: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });

    // Get next event
    const nextEvent = await db.event.findFirst({
      where: {
        OR: [
          { userId: user.id },
          {
            event_join_request: {
              some: {
                userId: user.id,
                status: "accepted",
              },
            },
          },
        ],
        startTime: {
          gte: now,
        },
      },
      select: {
        id: true,
        title: true,
        emoji: true,
        startTime: true,
      },
      orderBy: { startTime: "asc" },
    });

    // Count unread notifications
    const unreadNotifications = await db.notification.count({
      where: {
        userId: user.id,
        read: false,
      },
    });

    return c.json({
      todayCount: todayEventsCount,
      nextEvent: nextEvent
        ? {
            ...nextEvent,
            startTime: nextEvent.startTime.toISOString(),
          }
        : null,
      unreadNotifications,
    });
  } catch (error: any) {
    console.error("Widget API error:", error);
    return c.json({ error: "Failed to fetch widget data" }, 500);
  }
});
