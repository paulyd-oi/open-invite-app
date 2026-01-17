import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import {
  FREE_TIER_LIMITS,
  PRO_TIER_LIMITS,
  REFERRAL_TIERS,
  PRICING,
  PRO_FEATURES,
} from "../shared/freemiumLimits";
import {
  getUserSubscriptionStatus,
  canCreateEvent,
  canCreateCircle,
  canCreateFriendNote,
  getWhosFreeLimit,
  getBirthdaysLimit,
} from "../utils/subscriptionHelpers";

export const subscriptionRouter = new Hono<AppType>();

// Beta mode - set to false for production (subscriptions are active)
const BETA_MODE = false;

// GET /api/subscription - Get current user's subscription status with v3.0 limits
subscriptionRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const status = await getUserSubscriptionStatus(user.id);

  // Get current usage counts
  const now = new Date();
  const [activeEventCount, circleCount, friendNoteCount, friendCount] = await Promise.all([
    db.event.count({
      where: { userId: user.id, startTime: { gte: now } },
    }),
    db.circle.count({
      where: { createdById: user.id },
    }),
    db.friend_note.count({
      where: { friendship: { userId: user.id } },
    }),
    db.friendship.count({
      where: { userId: user.id },
    }),
  ]);

  // In beta mode, override to pro
  const effectiveTier = BETA_MODE ? "pro" : status.tier;
  const isPro = BETA_MODE || status.isPro;
  const limits = isPro ? PRO_TIER_LIMITS : FREE_TIER_LIMITS;

  return c.json({
    subscription: {
      tier: effectiveTier,
      isPro,
      expiresAt: status.expiresAt?.toISOString() ?? null,
      isLifetime: status.isLifetime,
      isTrial: status.isTrial,
      trialEndsAt: status.trialEndsAt?.toISOString() ?? null,
      isBeta: BETA_MODE,
    },
    limits: {
      // Events
      maxActiveEvents: isPro ? null : FREE_TIER_LIMITS.maxActiveEvents,
      currentActiveEvents: activeEventCount,
      canCreateEvent: isPro || activeEventCount < FREE_TIER_LIMITS.maxActiveEvents,
      eventsRemaining: isPro ? null : Math.max(0, FREE_TIER_LIMITS.maxActiveEvents - activeEventCount),
      recurringEventsEnabled: limits.recurringEvents,
      eventHistoryDays: limits.eventHistoryDays === Infinity ? null : limits.eventHistoryDays,

      // Who's Free
      whosFreeAheadDays: limits.whosFreeAheadDays,

      // Circles
      maxCircles: isPro ? null : FREE_TIER_LIMITS.maxCircles,
      currentCircles: circleCount,
      canCreateCircle: isPro || circleCount < FREE_TIER_LIMITS.maxCircles,
      circlesRemaining: isPro ? null : Math.max(0, FREE_TIER_LIMITS.maxCircles - circleCount),
      maxCircleMembers: isPro ? null : FREE_TIER_LIMITS.maxCircleMembers,
      circleInsightsEnabled: limits.circleInsights,

      // Friend Notes
      maxFriendNotes: isPro ? null : FREE_TIER_LIMITS.maxFriendNotes,
      currentFriendNotes: friendNoteCount,
      canCreateFriendNote: isPro || friendNoteCount < FREE_TIER_LIMITS.maxFriendNotes,
      friendNotesRemaining: isPro ? null : Math.max(0, FREE_TIER_LIMITS.maxFriendNotes - friendNoteCount),

      // Friends (unlimited for all)
      currentFriends: friendCount,

      // Birthdays
      birthdaysAheadDays: limits.birthdaysAheadDays,

      // Analytics
      topFriendsAnalyticsEnabled: limits.topFriendsAnalytics,
      detailedAnalyticsEnabled: limits.detailedAnalytics,
      fullAchievementsEnabled: limits.fullAchievements,

      // Other Pro features
      photoUploadsUnlimited: limits.photoUploadsUnlimited,
      eventMemoryTimelineEnabled: limits.eventMemoryTimeline,
      archiveAccessEnabled: limits.archiveAccess,
      prioritySyncEnabled: limits.prioritySync,
      earlyAccessEnabled: limits.earlyAccess,
    },
    pricing: PRICING,
    referralTiers: REFERRAL_TIERS,
  });
});

// GET /api/subscription/limits - Quick check of current limits and usage
subscriptionRouter.get("/limits", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [eventCheck, circleCheck, noteCheck, whosFreeLimit, birthdaysLimit] = await Promise.all([
    canCreateEvent(user.id),
    canCreateCircle(user.id),
    canCreateFriendNote(user.id),
    getWhosFreeLimit(user.id),
    getBirthdaysLimit(user.id),
  ]);

  return c.json({
    isPro: eventCheck.isPro,
    events: eventCheck,
    circles: circleCheck,
    friendNotes: noteCheck,
    whosFree: whosFreeLimit,
    birthdays: birthdaysLimit,
  });
});

// POST /api/subscription/upgrade - Upgrade to premium (placeholder for RevenueCat integration)
subscriptionRouter.post("/upgrade", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { transactionId, plan } = body; // plan: "yearly" or "lifetime"

  // Calculate expiration based on plan
  const now = new Date();
  let expiresAt: Date;

  if (plan === "lifetime") {
    expiresAt = new Date("2099-12-31");
  } else {
    // Yearly with 2-week trial
    expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  }

  const subscription = await db.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      tier: "premium",
      expiresAt,
      purchasedAt: now,
      transactionId,
    },
    update: {
      tier: "premium",
      expiresAt,
      purchasedAt: now,
      transactionId,
    },
  });

  return c.json({
    success: true,
    subscription: {
      tier: "pro",
      expiresAt: subscription.expiresAt?.toISOString(),
      purchasedAt: subscription.purchasedAt?.toISOString(),
      isLifetime: plan === "lifetime",
    },
  });
});

// POST /api/subscription/restore - Restore purchases
subscriptionRouter.post("/restore", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // This would integrate with RevenueCat to restore purchases
  // For now, just return current subscription status
  const status = await getUserSubscriptionStatus(user.id);

  if (!status.isPro) {
    return c.json({
      success: false,
      message: "No active subscription found",
    });
  }

  return c.json({
    success: true,
    subscription: {
      tier: status.tier,
      expiresAt: status.expiresAt?.toISOString() ?? null,
      isLifetime: status.isLifetime,
    },
  });
});

// GET /api/subscription/check-feature/:feature - Check if user can use a feature
subscriptionRouter.get("/check-feature/:feature", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const feature = c.req.param("feature");
  const status = await getUserSubscriptionStatus(user.id);

  // In beta mode, everyone has access to all features
  if (BETA_MODE) {
    return c.json({
      feature,
      hasAccess: true,
      isPro: true,
      isBeta: true,
    });
  }

  // Check if feature is a Pro-only feature
  const proFeatureInfo = PRO_FEATURES[feature as keyof typeof PRO_FEATURES];
  const requiresPro = !!proFeatureInfo;

  return c.json({
    feature,
    hasAccess: status.isPro || !requiresPro,
    isPro: status.isPro,
    requiresPro,
    featureInfo: proFeatureInfo ?? null,
    isBeta: false,
  });
});

// GET /api/subscription/details - Get detailed subscription info including discount codes used
subscriptionRouter.get("/details", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const status = await getUserSubscriptionStatus(user.id);

  // Get discount code redemptions for this user
  const redemptions = await db.discount_code_redemption.findMany({
    where: { userId: user.id },
    include: {
      discount_code: {
        select: {
          code: true,
          type: true,
        },
      },
    },
    orderBy: { redeemedAt: "desc" },
  });

  // Check if user has used a lifetime code
  const hasUsedLifetimeCode = redemptions.some(
    (r) => r.discount_code.type === "lifetime"
  );

  // Determine subscription type
  let subscriptionType: "free" | "trial" | "yearly" | "lifetime" = "free";
  if (status.isPro) {
    if (status.isLifetime) {
      subscriptionType = "lifetime";
    } else if (status.isTrial) {
      subscriptionType = "trial";
    } else {
      subscriptionType = "yearly";
    }
  }

  return c.json({
    subscription: {
      tier: BETA_MODE ? "pro" : status.tier,
      type: subscriptionType,
      isPro: BETA_MODE || status.isPro,
      isLifetime: status.isLifetime,
      isTrial: status.isTrial,
      expiresAt: status.expiresAt?.toISOString() ?? null,
      trialEndsAt: status.trialEndsAt?.toISOString() ?? null,
      isBeta: BETA_MODE,
    },
    discountCodes: {
      redemptions: redemptions.map((r) => ({
        code: r.discount_code.code,
        type: r.discount_code.type,
        redeemedAt: r.redeemedAt.toISOString(),
      })),
      hasUsedLifetimeCode,
      canUseDiscountCode: !hasUsedLifetimeCode,
    },
    pricing: PRICING,
    referralTiers: REFERRAL_TIERS,
  });
});

// GET /api/subscription/pro-features - Get list of all Pro features
subscriptionRouter.get("/pro-features", async (c) => {
  return c.json({
    features: PRO_FEATURES,
    freeLimits: FREE_TIER_LIMITS,
    proLimits: PRO_TIER_LIMITS,
    pricing: PRICING,
    referralTiers: REFERRAL_TIERS,
  });
});
