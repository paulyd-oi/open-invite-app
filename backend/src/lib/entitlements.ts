/**
 * Backend Entitlements Logic
 * Single source of truth for all plan-based feature gating
 */

// Plan types
export type Plan = "FREE" | "PRO" | "LIFETIME_PRO";

// Subscription tiers from DB
export type SubscriptionTier = "free" | "trial" | "yearly" | "lifetime";

// Feature limits by plan
export interface PlanLimits {
  WHOS_FREE_HORIZON_DAYS: number;
  UPCOMING_BIRTHDAYS_HORIZON_DAYS: number;
  RECURRING_EVENTS_ENABLED: boolean;
  ACTIVE_EVENTS_MAX: number;
  EVENT_HISTORY_DAYS: number;
  CIRCLES_MAX: number;
  MEMBERS_PER_CIRCLE_MAX: number;
  CIRCLE_INSIGHTS_ENABLED: boolean;
  FRIEND_NOTES_MAX: number;
  TOP_FRIENDS_ANALYTICS_ENABLED: boolean;
  FULL_ACHIEVEMENTS_ENABLED: boolean;
  PRIORITY_SYNC_ENABLED: boolean;
}

// Limits for each plan
const FREE_LIMITS: PlanLimits = {
  WHOS_FREE_HORIZON_DAYS: 7,
  UPCOMING_BIRTHDAYS_HORIZON_DAYS: 7,
  RECURRING_EVENTS_ENABLED: false,
  ACTIVE_EVENTS_MAX: 3,
  EVENT_HISTORY_DAYS: 30,
  CIRCLES_MAX: 2,
  MEMBERS_PER_CIRCLE_MAX: 15,
  CIRCLE_INSIGHTS_ENABLED: false,
  FRIEND_NOTES_MAX: 5,
  TOP_FRIENDS_ANALYTICS_ENABLED: false,
  FULL_ACHIEVEMENTS_ENABLED: false,
  PRIORITY_SYNC_ENABLED: false,
};

const PRO_LIMITS: PlanLimits = {
  WHOS_FREE_HORIZON_DAYS: 90,
  UPCOMING_BIRTHDAYS_HORIZON_DAYS: 90,
  RECURRING_EVENTS_ENABLED: true,
  ACTIVE_EVENTS_MAX: Infinity,
  EVENT_HISTORY_DAYS: Infinity,
  CIRCLES_MAX: Infinity,
  MEMBERS_PER_CIRCLE_MAX: Infinity,
  CIRCLE_INSIGHTS_ENABLED: true,
  FRIEND_NOTES_MAX: Infinity,
  TOP_FRIENDS_ANALYTICS_ENABLED: true,
  FULL_ACHIEVEMENTS_ENABLED: true,
  PRIORITY_SYNC_ENABLED: true,
};

// User subscription info (minimal interface)
interface UserSubscription {
  tier?: string | null;
  expiresAt?: Date | null;
}

interface UserWithSubscription {
  subscription?: UserSubscription | null;
}

/**
 * Get the plan type from user's subscription
 */
export function getPlan(user: UserWithSubscription): Plan {
  const subscription = user.subscription;

  if (!subscription) {
    return "FREE";
  }

  const tier = subscription.tier;
  const expiresAt = subscription.expiresAt;

  // Lifetime is always active
  if (tier === "lifetime") {
    return "LIFETIME_PRO";
  }

  // Check if subscription is expired
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return "FREE";
  }

  // Active subscription (trial, yearly)
  if (tier === "yearly" || tier === "trial") {
    return "PRO";
  }

  return "FREE";
}

/**
 * Get limits for a plan
 */
export function getLimits(plan: Plan): PlanLimits {
  if (plan === "PRO" || plan === "LIFETIME_PRO") {
    return PRO_LIMITS;
  }
  return FREE_LIMITS;
}

/**
 * Get limits directly from user
 */
export function getUserLimits(user: UserWithSubscription): PlanLimits {
  return getLimits(getPlan(user));
}

// Capability check result
interface CapabilityResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
}

/**
 * Check if user can create an event
 */
export function canCreateEvent(params: {
  plan: Plan;
  activeEventsCount: number;
  isRecurring?: boolean;
}): CapabilityResult {
  const { plan, activeEventsCount, isRecurring } = params;
  const limits = getLimits(plan);

  // Check recurring events
  if (isRecurring && !limits.RECURRING_EVENTS_ENABLED) {
    return {
      allowed: false,
      reason: "RECURRING_EVENTS",
    };
  }

  // Check active events limit
  if (activeEventsCount >= limits.ACTIVE_EVENTS_MAX) {
    return {
      allowed: false,
      reason: "ACTIVE_EVENTS_LIMIT",
      limit: limits.ACTIVE_EVENTS_MAX,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can view Who's Free for a date range
 */
export function canViewWhosFree(params: {
  plan: Plan;
  requestedRangeDays: number;
}): CapabilityResult {
  const { plan, requestedRangeDays } = params;
  const limits = getLimits(plan);

  if (requestedRangeDays > limits.WHOS_FREE_HORIZON_DAYS) {
    return {
      allowed: false,
      reason: "WHOS_FREE_HORIZON",
      limit: limits.WHOS_FREE_HORIZON_DAYS,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can view birthdays for a date range
 */
export function canViewBirthdays(params: {
  plan: Plan;
  requestedRangeDays: number;
}): CapabilityResult {
  const { plan, requestedRangeDays } = params;
  const limits = getLimits(plan);

  if (requestedRangeDays > limits.UPCOMING_BIRTHDAYS_HORIZON_DAYS) {
    return {
      allowed: false,
      reason: "UPCOMING_BIRTHDAYS_HORIZON",
      limit: limits.UPCOMING_BIRTHDAYS_HORIZON_DAYS,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can create a circle
 */
export function canCreateCircle(params: {
  plan: Plan;
  circlesCount: number;
}): CapabilityResult {
  const { plan, circlesCount } = params;
  const limits = getLimits(plan);

  if (circlesCount >= limits.CIRCLES_MAX) {
    return {
      allowed: false,
      reason: "CIRCLES_LIMIT",
      limit: limits.CIRCLES_MAX,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can add a member to a circle
 */
export function canAddCircleMember(params: {
  plan: Plan;
  membersCount: number;
}): CapabilityResult {
  const { plan, membersCount } = params;
  const limits = getLimits(plan);

  if (membersCount >= limits.MEMBERS_PER_CIRCLE_MAX) {
    return {
      allowed: false,
      reason: "CIRCLE_MEMBERS_LIMIT",
      limit: limits.MEMBERS_PER_CIRCLE_MAX,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can add a friend note
 */
export function canAddFriendNote(params: {
  plan: Plan;
  notesCount: number;
}): CapabilityResult {
  const { plan, notesCount } = params;
  const limits = getLimits(plan);

  if (notesCount >= limits.FRIEND_NOTES_MAX) {
    return {
      allowed: false,
      reason: "FRIEND_NOTES_LIMIT",
      limit: limits.FRIEND_NOTES_MAX,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can use insights features
 */
export function canUseInsights(plan: Plan): CapabilityResult {
  const limits = getLimits(plan);

  if (!limits.TOP_FRIENDS_ANALYTICS_ENABLED) {
    return {
      allowed: false,
      reason: "INSIGHTS_LOCKED",
    };
  }

  return { allowed: true };
}

/**
 * Check if user can use circle insights
 */
export function canUseCircleInsights(plan: Plan): CapabilityResult {
  const limits = getLimits(plan);

  if (!limits.CIRCLE_INSIGHTS_ENABLED) {
    return {
      allowed: false,
      reason: "INSIGHTS_LOCKED",
    };
  }

  return { allowed: true };
}

/**
 * Check if user can view full achievements
 */
export function canViewFullAchievements(plan: Plan): CapabilityResult {
  const limits = getLimits(plan);

  if (!limits.FULL_ACHIEVEMENTS_ENABLED) {
    return {
      allowed: false,
      reason: "ACHIEVEMENTS_LOCKED",
    };
  }

  return { allowed: true };
}

/**
 * Check if user can view event history beyond limit
 */
export function canViewEventHistory(params: {
  plan: Plan;
  requestedDays: number;
}): CapabilityResult {
  const { plan, requestedDays } = params;
  const limits = getLimits(plan);

  if (requestedDays > limits.EVENT_HISTORY_DAYS) {
    return {
      allowed: false,
      reason: "HISTORY_LIMIT",
      limit: limits.EVENT_HISTORY_DAYS,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can use priority sync
 */
export function canUsePrioritySync(plan: Plan): CapabilityResult {
  const limits = getLimits(plan);

  if (!limits.PRIORITY_SYNC_ENABLED) {
    return {
      allowed: false,
      reason: "PRIORITY_SYNC_LOCKED",
    };
  }

  return { allowed: true };
}

/**
 * Get features object for API response
 */
export function getFeatures(plan: Plan) {
  const limits = getLimits(plan);
  return {
    recurringEvents: limits.RECURRING_EVENTS_ENABLED,
    circleInsights: limits.CIRCLE_INSIGHTS_ENABLED,
    topFriendsAnalytics: limits.TOP_FRIENDS_ANALYTICS_ENABLED,
    fullAchievements: limits.FULL_ACHIEVEMENTS_ENABLED,
    prioritySync: limits.PRIORITY_SYNC_ENABLED,
    unlimitedEvents: limits.ACTIVE_EVENTS_MAX === Infinity,
    unlimitedCircles: limits.CIRCLES_MAX === Infinity,
    unlimitedFriendNotes: limits.FRIEND_NOTES_MAX === Infinity,
    fullEventHistory: limits.EVENT_HISTORY_DAYS === Infinity,
  };
}

// Export all capability checkers for capability check route
export const capabilityCheckers: Record<
  string,
  (params: { plan: Plan; [key: string]: unknown }) => CapabilityResult
> = {
  create_event: (params) =>
    canCreateEvent({
      plan: params.plan,
      activeEventsCount: (params.activeEventsCount as number) ?? 0,
      isRecurring: params.isRecurring as boolean,
    }),
  view_whos_free: (params) =>
    canViewWhosFree({
      plan: params.plan,
      requestedRangeDays: (params.requestedRangeDays as number) ?? 7,
    }),
  view_birthdays: (params) =>
    canViewBirthdays({
      plan: params.plan,
      requestedRangeDays: (params.requestedRangeDays as number) ?? 7,
    }),
  create_circle: (params) =>
    canCreateCircle({
      plan: params.plan,
      circlesCount: (params.circlesCount as number) ?? 0,
    }),
  add_circle_member: (params) =>
    canAddCircleMember({
      plan: params.plan,
      membersCount: (params.membersCount as number) ?? 0,
    }),
  add_friend_note: (params) =>
    canAddFriendNote({
      plan: params.plan,
      notesCount: (params.notesCount as number) ?? 0,
    }),
  use_insights: (params) => canUseInsights(params.plan),
  use_circle_insights: (params) => canUseCircleInsights(params.plan),
  view_achievements: (params) => canViewFullAchievements(params.plan),
  view_history: (params) =>
    canViewEventHistory({
      plan: params.plan,
      requestedDays: (params.requestedDays as number) ?? 30,
    }),
  use_priority_sync: (params) => canUsePrioritySync(params.plan),
};
