import { Hono } from "hono";
import { db } from "../db";
import type { AppType } from "../types";
import {
  getPlan,
  getLimits,
  getFeatures,
  capabilityCheckers,
  type Plan,
} from "../lib/entitlements";

export const entitlementsRouter = new Hono<AppType>();

/**
 * GET /api/entitlements
 * Get current user's entitlements, limits, and features
 */
entitlementsRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Get user with subscription
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      include: { subscription: true },
    });

    if (!fullUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Get counts for current limits
    const now = new Date();

    // Count active events (startTime >= now)
    const activeEventsCount = await db.event.count({
      where: {
        userId: user.id,
        startTime: { gte: now },
      },
    });

    // Count circles user created
    const circlesCount = await db.circle.count({
      where: { createdById: user.id },
    });

    // Count total friend notes
    const friendNotesCount = await db.friend_note.count({
      where: {
        friendship: { userId: user.id },
      },
    });

    const plan = getPlan(fullUser);
    const limits = getLimits(plan);
    const features = getFeatures(plan);

    return c.json({
      plan,
      limits: {
        whosFreeHorizonDays: limits.WHOS_FREE_HORIZON_DAYS,
        upcomingBirthdaysHorizonDays: limits.UPCOMING_BIRTHDAYS_HORIZON_DAYS,
        activeEventsMax: limits.ACTIVE_EVENTS_MAX === Infinity ? null : limits.ACTIVE_EVENTS_MAX,
        eventHistoryDays: limits.EVENT_HISTORY_DAYS === Infinity ? null : limits.EVENT_HISTORY_DAYS,
        circlesMax: limits.CIRCLES_MAX === Infinity ? null : limits.CIRCLES_MAX,
        membersPerCircleMax: limits.MEMBERS_PER_CIRCLE_MAX === Infinity ? null : limits.MEMBERS_PER_CIRCLE_MAX,
        friendNotesMax: limits.FRIEND_NOTES_MAX === Infinity ? null : limits.FRIEND_NOTES_MAX,
      },
      features,
      usage: {
        activeEventsCount,
        circlesCount,
        friendNotesCount,
      },
    });
  } catch (error) {
    console.error("[Entitlements] Error fetching entitlements:", error);
    return c.json({ error: "Failed to fetch entitlements" }, 500);
  }
});

/**
 * POST /api/capabilities/check
 * Check if user can perform a specific action
 */
entitlementsRouter.post("/check", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { action, params = {} } = body;

    if (!action || typeof action !== "string") {
      return c.json({ error: "Missing action parameter" }, 400);
    }

    // Get user with subscription
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      include: { subscription: true },
    });

    if (!fullUser) {
      return c.json({ error: "User not found" }, 404);
    }

    const plan = getPlan(fullUser);

    // Check if action is supported
    const checker = capabilityCheckers[action];
    if (!checker) {
      return c.json({ error: `Unknown action: ${action}` }, 400);
    }

    // For actions that need counts, fetch them if not provided
    const enrichedParams: Record<string, unknown> = { ...params, plan };

    // Auto-fetch counts if not provided
    if (action === "create_event" && enrichedParams.activeEventsCount === undefined) {
      enrichedParams.activeEventsCount = await db.event.count({
        where: {
          userId: user.id,
          startTime: { gte: new Date() },
        },
      });
    }

    if (action === "create_circle" && enrichedParams.circlesCount === undefined) {
      enrichedParams.circlesCount = await db.circle.count({
        where: { createdById: user.id },
      });
    }

    if (action === "add_friend_note" && enrichedParams.notesCount === undefined) {
      enrichedParams.notesCount = await db.friend_note.count({
        where: {
          friendship: { userId: user.id },
        },
      });
    }

    const result = checker(enrichedParams as { plan: Plan; [key: string]: unknown });
    return c.json(result);
  } catch (error) {
    console.error("[Capabilities] Error checking capability:", error);
    return c.json({ error: "Failed to check capability" }, 500);
  }
});

/**
 * GET /api/events/active/count
 * Get count of user's active events
 */
entitlementsRouter.get("/events/active/count", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const count = await db.event.count({
      where: {
        userId: user.id,
        startTime: { gte: new Date() },
      },
    });

    return c.json({ count });
  } catch (error) {
    console.error("[Entitlements] Error counting active events:", error);
    return c.json({ error: "Failed to count active events" }, 500);
  }
});
