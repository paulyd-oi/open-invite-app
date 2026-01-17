import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { setSelectedBadgeRequestSchema } from "../shared/contracts";

export const achievementsRouter = new Hono<AppType>();

// Tier colors
const tierColors = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#E5E4E2",
  diamond: "#B9F2FF",
} as const;

type TierType = "bronze" | "silver" | "gold" | "platinum" | "diamond";
type CategoryType = "hosting" | "attending" | "crowd" | "streak" | "social";

// Categories to show for launch (simplified to 3 core categories)
const ACTIVE_CATEGORIES: CategoryType[] = ["hosting", "attending", "streak"];

// Achievement definitions with creative tiered names
const ACHIEVEMENT_DEFINITIONS: Array<{
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: CategoryType;
  tier: TierType;
  target: number;
  metricType: "hosted" | "attended" | "max_attendees" | "streak" | "friends";
}> = [
  // Hosting achievements (5, 25, 50, 100, 250)
  {
    id: "host_bronze",
    name: "First Steps",
    description: "Host 5 completed events",
    emoji: "🎈",
    category: "hosting",
    tier: "bronze",
    target: 5,
    metricType: "hosted",
  },
  {
    id: "host_silver",
    name: "Party Planner",
    description: "Host 25 completed events",
    emoji: "🎊",
    category: "hosting",
    tier: "silver",
    target: 25,
    metricType: "hosted",
  },
  {
    id: "host_gold",
    name: "Social Architect",
    description: "Host 50 completed events",
    emoji: "🎪",
    category: "hosting",
    tier: "gold",
    target: 50,
    metricType: "hosted",
  },
  {
    id: "host_platinum",
    name: "Event Maestro",
    description: "Host 100 completed events",
    emoji: "🎭",
    category: "hosting",
    tier: "platinum",
    target: 100,
    metricType: "hosted",
  },
  {
    id: "host_diamond",
    name: "Legendary Host",
    description: "Host 250 completed events",
    emoji: "👑",
    category: "hosting",
    tier: "diamond",
    target: 250,
    metricType: "hosted",
  },

  // Attending achievements (10, 50, 100, 200, 500)
  {
    id: "attend_bronze",
    name: "Good Sport",
    description: "Attend 10 completed events",
    emoji: "🙌",
    category: "attending",
    tier: "bronze",
    target: 10,
    metricType: "attended",
  },
  {
    id: "attend_silver",
    name: "Social Butterfly",
    description: "Attend 50 completed events",
    emoji: "🦋",
    category: "attending",
    tier: "silver",
    target: 50,
    metricType: "attended",
  },
  {
    id: "attend_gold",
    name: "Life of the Party",
    description: "Attend 100 completed events",
    emoji: "⭐",
    category: "attending",
    tier: "gold",
    target: 100,
    metricType: "attended",
  },
  {
    id: "attend_platinum",
    name: "VIP Regular",
    description: "Attend 200 completed events",
    emoji: "💫",
    category: "attending",
    tier: "platinum",
    target: 200,
    metricType: "attended",
  },
  {
    id: "attend_diamond",
    name: "Event Legend",
    description: "Attend 500 completed events",
    emoji: "🌟",
    category: "attending",
    tier: "diamond",
    target: 500,
    metricType: "attended",
  },

  // Crowd size achievements (10, 25, 50, 100, 200 attendees)
  {
    id: "crowd_bronze",
    name: "Gathering Host",
    description: "Host a completed event with 10+ attendees",
    emoji: "👥",
    category: "crowd",
    tier: "bronze",
    target: 10,
    metricType: "max_attendees",
  },
  {
    id: "crowd_silver",
    name: "Crowd Pleaser",
    description: "Host a completed event with 25+ attendees",
    emoji: "🎉",
    category: "crowd",
    tier: "silver",
    target: 25,
    metricType: "max_attendees",
  },
  {
    id: "crowd_gold",
    name: "Big Bash",
    description: "Host a completed event with 50+ attendees",
    emoji: "🔥",
    category: "crowd",
    tier: "gold",
    target: 50,
    metricType: "max_attendees",
  },
  {
    id: "crowd_platinum",
    name: "Mega Party",
    description: "Host a completed event with 100+ attendees",
    emoji: "🚀",
    category: "crowd",
    tier: "platinum",
    target: 100,
    metricType: "max_attendees",
  },
  {
    id: "crowd_diamond",
    name: "Festival King",
    description: "Host a completed event with 200+ attendees",
    emoji: "💯",
    category: "crowd",
    tier: "diamond",
    target: 200,
    metricType: "max_attendees",
  },

  // Streak achievements (4, 8, 16, 26, 52 weeks)
  {
    id: "streak_bronze",
    name: "Getting Started",
    description: "4-week hosting streak",
    emoji: "🔄",
    category: "streak",
    tier: "bronze",
    target: 4,
    metricType: "streak",
  },
  {
    id: "streak_silver",
    name: "Consistent",
    description: "8-week hosting streak",
    emoji: "🔁",
    category: "streak",
    tier: "silver",
    target: 8,
    metricType: "streak",
  },
  {
    id: "streak_gold",
    name: "Dedicated Host",
    description: "16-week hosting streak",
    emoji: "💪",
    category: "streak",
    tier: "gold",
    target: 16,
    metricType: "streak",
  },
  {
    id: "streak_platinum",
    name: "Half Year Hero",
    description: "26-week hosting streak",
    emoji: "🏆",
    category: "streak",
    tier: "platinum",
    target: 26,
    metricType: "streak",
  },
  {
    id: "streak_diamond",
    name: "Year-Long Legend",
    description: "52-week hosting streak",
    emoji: "🎖️",
    category: "streak",
    tier: "diamond",
    target: 52,
    metricType: "streak",
  },

  // Social/Friends achievements (5, 15, 30, 50, 100 friends)
  {
    id: "social_bronze",
    name: "Making Friends",
    description: "Connect with 5 friends",
    emoji: "🤝",
    category: "social",
    tier: "bronze",
    target: 5,
    metricType: "friends",
  },
  {
    id: "social_silver",
    name: "Circle Builder",
    description: "Connect with 15 friends",
    emoji: "👋",
    category: "social",
    tier: "silver",
    target: 15,
    metricType: "friends",
  },
  {
    id: "social_gold",
    name: "Connector",
    description: "Connect with 30 friends",
    emoji: "🌐",
    category: "social",
    tier: "gold",
    target: 30,
    metricType: "friends",
  },
  {
    id: "social_platinum",
    name: "Networker",
    description: "Connect with 50 friends",
    emoji: "🌍",
    category: "social",
    tier: "platinum",
    target: 50,
    metricType: "friends",
  },
  {
    id: "social_diamond",
    name: "Social Maven",
    description: "Connect with 100 friends",
    emoji: "✨",
    category: "social",
    tier: "diamond",
    target: 100,
    metricType: "friends",
  },
];

// Helper function to calculate user's achievement metrics
async function calculateUserMetrics(userId: string) {
  const now = new Date();

  // Get all COMPLETED hosted events (startTime is in the past)
  const completedHostedEvents = await db.event.findMany({
    where: {
      userId,
      startTime: { lt: now },
    },
    select: {
      id: true,
      startTime: true,
      event_join_request: {
        where: { status: "accepted" },
        select: { userId: true },
      },
    },
    orderBy: { startTime: "desc" },
  });

  // Get all COMPLETED attended events (accepted join requests for past events)
  const completedAttendedEvents = await db.event_join_request.findMany({
    where: {
      userId,
      status: "accepted",
      event: {
        startTime: { lt: now },
      },
    },
    include: {
      event: {
        select: { id: true, startTime: true },
      },
    },
  });

  // Calculate metrics
  const completedEventsHosted = completedHostedEvents.length;
  const completedEventsAttended = completedAttendedEvents.length;

  // Max attendees at any completed event
  let maxAttendeesAtCompletedEvent = 0;
  for (const event of completedHostedEvents) {
    const attendees = event.event_join_request.length;
    if (attendees > maxAttendeesAtCompletedEvent) {
      maxAttendeesAtCompletedEvent = attendees;
    }
  }

  // Calculate hosting streak (consecutive weeks with at least one hosted event)
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  let currentStreak = 0;

  if (completedHostedEvents.length > 0) {
    let checkWeekStart = new Date(now);
    checkWeekStart.setDate(checkWeekStart.getDate() - checkWeekStart.getDay());
    checkWeekStart.setHours(0, 0, 0, 0);

    while (true) {
      const weekEnd = new Date(checkWeekStart.getTime() + weekMs);
      const hasEventThisWeek = completedHostedEvents.some((e) => {
        const eventTime = new Date(e.startTime);
        return eventTime >= checkWeekStart && eventTime < weekEnd;
      });

      if (hasEventThisWeek) {
        currentStreak++;
        checkWeekStart = new Date(checkWeekStart.getTime() - weekMs);
      } else {
        break;
      }
    }
  }

  // Count friends
  const friendCount = await db.friendship.count({
    where: { userId },
  });

  return {
    completedEventsHosted,
    completedEventsAttended,
    maxAttendeesAtCompletedEvent,
    currentStreak,
    friendsMade: friendCount,
  };
}

// GET /api/achievements - Get user's achievements with progress
achievementsRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Calculate metrics
  const metrics = await calculateUserMetrics(user.id);

  // Get already unlocked achievements
  const unlockedAchievements = await db.unlocked_achievement.findMany({
    where: { userId: user.id },
  });
  const unlockedIds = new Set(unlockedAchievements.map((u) => u.achievementId));

  // Get selected badge
  const userBadge = await db.user_badge.findUnique({
    where: { userId: user.id },
  });

  // Build achievements with progress - only for active categories
  const allAchievements = ACHIEVEMENT_DEFINITIONS.map((def) => {
    let progress = 0;
    switch (def.metricType) {
      case "hosted":
        progress = metrics.completedEventsHosted;
        break;
      case "attended":
        progress = metrics.completedEventsAttended;
        break;
      case "max_attendees":
        progress = metrics.maxAttendeesAtCompletedEvent;
        break;
      case "streak":
        progress = metrics.currentStreak;
        break;
      case "friends":
        progress = metrics.friendsMade;
        break;
    }

    const unlocked = progress >= def.target;
    const existingUnlock = unlockedAchievements.find(
      (u) => u.achievementId === def.id
    );

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      emoji: def.emoji,
      category: def.category,
      tier: def.tier,
      tierColor: tierColors[def.tier],
      unlocked,
      unlockedAt: existingUnlock?.unlockedAt?.toISOString() ?? null,
      progress: Math.min(progress, def.target),
      target: def.target,
    };
  });

  // Filter to only active categories for the response
  const achievements = allAchievements.filter((a) =>
    ACTIVE_CATEGORIES.includes(a.category as CategoryType)
  );

  // Auto-unlock newly earned achievements
  const newlyUnlocked = achievements.filter(
    (a) => a.unlocked && !unlockedIds.has(a.id)
  );

  if (newlyUnlocked.length > 0) {
    await db.unlocked_achievement.createMany({
      data: newlyUnlocked.map((a) => ({
        userId: user.id,
        achievementId: a.id,
        progress: a.progress,
      })),
      skipDuplicates: true,
    });

    // Update unlockedAt for newly unlocked
    const nowStr = new Date().toISOString();
    for (const a of achievements) {
      if (newlyUnlocked.find((n) => n.id === a.id)) {
        a.unlockedAt = nowStr;
      }
    }
  }

  const totalUnlocked = achievements.filter((a) => a.unlocked).length;
  const totalAchievements = achievements.length;

  return c.json({
    achievements,
    stats: {
      totalUnlocked,
      totalAchievements,
      ...metrics,
    },
    selectedBadgeId: userBadge?.achievementId ?? null,
  });
});

// GET /api/achievements/:id - Get single achievement definition
achievementsRouter.get("/:id", async (c) => {
  const achievementId = c.req.param("id");
  const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === achievementId);

  if (!def) {
    return c.json({ error: "Achievement not found" }, 404);
  }

  return c.json({
    achievement: {
      ...def,
      tierColor: tierColors[def.tier],
    },
  });
});

// PUT /api/profile/badge - Set selected badge (also add to profile router)
achievementsRouter.put("/badge", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = setSelectedBadgeRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  const { achievementId } = parsed.data;

  // If clearing badge
  if (achievementId === null) {
    await db.user_badge.deleteMany({
      where: { userId: user.id },
    });
    return c.json({ success: true });
  }

  // Check if achievement exists
  const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === achievementId);
  if (!def) {
    return c.json({ error: "Achievement not found" }, 404);
  }

  // Check if user has unlocked this achievement
  const unlocked = await db.unlocked_achievement.findUnique({
    where: {
      userId_achievementId: {
        userId: user.id,
        achievementId,
      },
    },
  });

  if (!unlocked) {
    return c.json({ error: "Achievement not unlocked" }, 403);
  }

  // Upsert the badge
  await db.user_badge.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      achievementId,
    },
    update: {
      achievementId,
    },
  });

  return c.json({ success: true });
});

// GET /api/users/:id/badge - Get user's selected badge (public)
achievementsRouter.get("/user/:id/badge", async (c) => {
  const userId = c.req.param("id");

  const userBadge = await db.user_badge.findUnique({
    where: { userId },
  });

  if (!userBadge) {
    return c.json({ badge: null });
  }

  const def = ACHIEVEMENT_DEFINITIONS.find(
    (d) => d.id === userBadge.achievementId
  );

  if (!def) {
    return c.json({ badge: null });
  }

  return c.json({
    badge: {
      achievementId: def.id,
      name: def.name,
      emoji: def.emoji,
      tier: def.tier,
      tierColor: tierColors[def.tier],
    },
  });
});

export { ACHIEVEMENT_DEFINITIONS };
