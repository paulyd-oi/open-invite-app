// subscriptionHelpers.ts
// Backend helpers for subscription status and limit checks
import { db } from "../db";
import {
  FREE_TIER_LIMITS,
  PRO_TIER_LIMITS,
  type SubscriptionTier,
  type SubscriptionStatus,
} from "../shared/freemiumLimits";

// ============================================
// GET USER SUBSCRIPTION STATUS
// ============================================

export async function getUserSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const subscription = await db.subscription.findUnique({
    where: { userId },
  });

  const now = new Date();

  // Default to free tier
  if (!subscription) {
    return {
      tier: "free",
      isPro: false,
      expiresAt: null,
      isLifetime: false,
      isTrial: false,
      trialEndsAt: null,
      limits: FREE_TIER_LIMITS,
    };
  }

  // Check if premium is active
  const isPremiumActive = Boolean(
    subscription.tier === "premium" &&
    subscription.expiresAt &&
    new Date(subscription.expiresAt) > now
  );

  // Check if lifetime (expiry after 2090)
  const isLifetime = Boolean(
    isPremiumActive &&
    subscription.expiresAt &&
    new Date(subscription.expiresAt).getFullYear() > 2090
  );

  // Check if in trial period (first 14 days after purchase)
  let isTrial = false;
  let trialEndsAt: Date | null = null;
  if (isPremiumActive && subscription.purchasedAt && !isLifetime) {
    const purchaseDate = new Date(subscription.purchasedAt);
    trialEndsAt = new Date(purchaseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    isTrial = now < trialEndsAt;
  }

  const tier: SubscriptionTier = isPremiumActive ? "pro" : "free";

  return {
    tier,
    isPro: isPremiumActive,
    expiresAt: subscription.expiresAt,
    isLifetime,
    isTrial,
    trialEndsAt,
    limits: isPremiumActive ? PRO_TIER_LIMITS : FREE_TIER_LIMITS,
  };
}

// ============================================
// LIMIT CHECK HELPERS
// ============================================

/**
 * Check if user can create more events (active future events)
 */
export async function canCreateEvent(userId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  isPro: boolean;
}> {
  const status = await getUserSubscriptionStatus(userId);

  if (status.isPro) {
    return { allowed: true, current: 0, limit: Infinity, isPro: true };
  }

  // Count active future events
  const now = new Date();
  const activeEventCount = await db.event.count({
    where: {
      userId,
      startTime: { gte: now },
    },
  });

  return {
    allowed: activeEventCount < FREE_TIER_LIMITS.maxActiveEvents,
    current: activeEventCount,
    limit: FREE_TIER_LIMITS.maxActiveEvents,
    isPro: false,
  };
}

/**
 * Check if user can create more circles
 */
export async function canCreateCircle(userId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  isPro: boolean;
}> {
  const status = await getUserSubscriptionStatus(userId);

  if (status.isPro) {
    return { allowed: true, current: 0, limit: Infinity, isPro: true };
  }

  // Count circles user created
  const circleCount = await db.circle.count({
    where: { createdById: userId },
  });

  return {
    allowed: circleCount < FREE_TIER_LIMITS.maxCircles,
    current: circleCount,
    limit: FREE_TIER_LIMITS.maxCircles,
    isPro: false,
  };
}

/**
 * Check if user can add more members to a circle
 * Also checks virality rule: if circle owner is Pro, bypass limit
 */
export async function canAddCircleMember(
  userId: string,
  circleId: string
): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  isPro: boolean;
  bypassedByOwner: boolean;
}> {
  // First check the circle owner's status (virality rule)
  const circle = await db.circle.findUnique({
    where: { id: circleId },
    select: { createdById: true },
  });

  if (!circle) {
    return { allowed: false, current: 0, limit: 0, isPro: false, bypassedByOwner: false };
  }

  const ownerStatus = await getUserSubscriptionStatus(circle.createdById);
  const userStatus = await getUserSubscriptionStatus(userId);

  // Count current members
  const memberCount = await db.circle_member.count({
    where: { circleId },
  });

  // Virality rule: if owner is Pro, allow unlimited members
  if (ownerStatus.isPro) {
    return {
      allowed: true,
      current: memberCount,
      limit: Infinity,
      isPro: userStatus.isPro,
      bypassedByOwner: true,
    };
  }

  // User's own status
  if (userStatus.isPro) {
    return {
      allowed: true,
      current: memberCount,
      limit: Infinity,
      isPro: true,
      bypassedByOwner: false,
    };
  }

  return {
    allowed: memberCount < FREE_TIER_LIMITS.maxCircleMembers,
    current: memberCount,
    limit: FREE_TIER_LIMITS.maxCircleMembers,
    isPro: false,
    bypassedByOwner: false,
  };
}

/**
 * Check if user can create more friend notes
 */
export async function canCreateFriendNote(userId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  isPro: boolean;
}> {
  const status = await getUserSubscriptionStatus(userId);

  if (status.isPro) {
    return { allowed: true, current: 0, limit: Infinity, isPro: true };
  }

  // Count total friend notes across all friendships
  const noteCount = await db.friend_note.count({
    where: {
      friendship: {
        userId,
      },
    },
  });

  return {
    allowed: noteCount < FREE_TIER_LIMITS.maxFriendNotes,
    current: noteCount,
    limit: FREE_TIER_LIMITS.maxFriendNotes,
    isPro: false,
  };
}

/**
 * Get the Who's Free lookahead days based on subscription
 * Also checks virality rule for event hosts
 */
export async function getWhosFreeLimit(
  userId: string,
  eventHostId?: string
): Promise<{
  daysAhead: number;
  isPro: boolean;
  bypassedByHost: boolean;
}> {
  const userStatus = await getUserSubscriptionStatus(userId);

  // Check virality rule: if viewing in context of a Pro host's event
  if (eventHostId && eventHostId !== userId) {
    const hostStatus = await getUserSubscriptionStatus(eventHostId);
    if (hostStatus.isPro) {
      return {
        daysAhead: PRO_TIER_LIMITS.whosFreeAheadDays,
        isPro: userStatus.isPro,
        bypassedByHost: true,
      };
    }
  }

  return {
    daysAhead: userStatus.isPro
      ? PRO_TIER_LIMITS.whosFreeAheadDays
      : FREE_TIER_LIMITS.whosFreeAheadDays,
    isPro: userStatus.isPro,
    bypassedByHost: false,
  };
}

/**
 * Get birthday lookahead days based on subscription
 */
export async function getBirthdaysLimit(userId: string): Promise<{
  daysAhead: number;
  isPro: boolean;
}> {
  const status = await getUserSubscriptionStatus(userId);

  return {
    daysAhead: status.isPro
      ? PRO_TIER_LIMITS.birthdaysAheadDays
      : FREE_TIER_LIMITS.birthdaysAheadDays,
    isPro: status.isPro,
  };
}

/**
 * Get event history limit based on subscription
 */
export async function getEventHistoryLimit(userId: string): Promise<{
  daysBack: number;
  isPro: boolean;
}> {
  const status = await getUserSubscriptionStatus(userId);

  return {
    daysBack: status.isPro
      ? PRO_TIER_LIMITS.eventHistoryDays
      : FREE_TIER_LIMITS.eventHistoryDays,
    isPro: status.isPro,
  };
}

/**
 * Check if user can create recurring events
 */
export async function canCreateRecurringEvent(userId: string): Promise<{
  allowed: boolean;
  isPro: boolean;
}> {
  const status = await getUserSubscriptionStatus(userId);

  return {
    allowed: status.isPro,
    isPro: status.isPro,
  };
}

/**
 * Check if user has access to a Pro feature (boolean features only)
 */
export async function hasFeatureAccess(
  userId: string,
  feature: keyof typeof FREE_TIER_LIMITS
): Promise<{
  allowed: boolean;
  isPro: boolean;
}> {
  const status = await getUserSubscriptionStatus(userId);

  // For boolean features, check if it's enabled in free tier or user is pro
  // Free tier has all boolean features set to false, so only pro users have access
  const freeValue = FREE_TIER_LIMITS[feature];
  const isFeatureEnabledInFree = typeof freeValue === "boolean" ? freeValue : false;
  const allowed = status.isPro || isFeatureEnabledInFree;

  return {
    allowed,
    isPro: status.isPro,
  };
}
