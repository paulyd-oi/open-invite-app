// freemiumLimits.ts
// Shared freemium model constants for Open Invite v3.0
// Product Principle: Participation is free, power users pay

// ============================================
// FREE TIER LIMITS
// ============================================

export const FREE_TIER_LIMITS = {
  // Events
  maxActiveEvents: 5,           // Max concurrent future events
  eventHistoryDays: 30,         // Days of event history visible
  recurringEvents: false,       // Can't create recurring events

  // Who's Free
  whosFreeAheadDays: 7,         // Days ahead for Who's Free

  // Circles (Planning Groups)
  maxCircles: 2,                // Max circles user can create/own
  maxCircleMembers: 15,         // Max members per circle
  circleInsights: false,        // No circle analytics

  // Friends & Social
  maxFriendNotes: 5,            // Total friend notes across all friends
  topFriendsAnalytics: false,   // No top friends insights
  friendStreakHistory: false,   // View-only streaks, no history

  // Birthdays
  birthdaysAheadDays: 7,        // Days ahead for upcoming birthdays

  // Profile & Stats
  detailedAnalytics: false,     // Basic stats only

  // Photos & Memories
  photoUploadsUnlimited: false, // Limited photo uploads
  eventMemoryTimeline: false,   // No memory timeline
  archiveAccess: false,         // No archive

  // Features
  prioritySync: false,
  earlyAccess: false,
} as const;

// ============================================
// PRO TIER LIMITS (no limits or unlocked)
// ============================================

export const PRO_TIER_LIMITS = {
  // Events
  maxActiveEvents: Infinity,    // Unlimited
  eventHistoryDays: Infinity,   // Full history
  recurringEvents: true,        // Can create recurring events

  // Who's Free
  whosFreeAheadDays: 90,        // 90 days ahead

  // Circles (Planning Groups)
  maxCircles: Infinity,         // Unlimited
  maxCircleMembers: Infinity,   // Unlimited
  circleInsights: true,         // Full analytics

  // Friends & Social
  maxFriendNotes: Infinity,     // Unlimited
  topFriendsAnalytics: true,    // Full insights
  friendStreakHistory: true,    // Full streak history

  // Birthdays
  birthdaysAheadDays: 90,       // 90 days ahead

  // Profile & Stats
  detailedAnalytics: true,      // Full analytics

  // Photos & Memories
  photoUploadsUnlimited: true,  // Unlimited uploads
  eventMemoryTimeline: true,    // Full memory timeline
  archiveAccess: true,          // Full archive access

  // Features
  prioritySync: true,
  earlyAccess: true,
} as const;

// ============================================
// REFERRAL REWARD TIERS (v3.0)
// ============================================

export const REFERRAL_TIERS = {
  MONTH_PRO: {
    count: 3,
    type: "month_pro",
    durationDays: 30,
    label: "1 Month Pro",
  },
  YEAR_PRO: {
    count: 10,
    type: "year_pro",
    durationDays: 365,
    label: "1 Year Pro",
  },
  LIFETIME_PRO: {
    count: 40,
    type: "lifetime_pro",
    durationDays: null, // Lifetime
    label: "Lifetime Pro",
  },
} as const;

// ============================================
// PRICING
// ============================================

export const PRICING = {
  free: 0,
  proYearly: 10,        // $10/year (Early Adopter pricing)
  proYearlyFuture: 25,  // $25-40/year (future)
  lifetime: 60,         // $60 one-time (limited availability)
  trialDays: 14,        // 2-week free trial
} as const;

// ============================================
// FEATURE FLAGS & KEYS
// ============================================

export type FeatureKey =
  | "unlimited_events"
  | "recurring_events"
  | "extended_whos_free"
  | "unlimited_circles"
  | "unlimited_circle_members"
  | "circle_insights"
  | "unlimited_friend_notes"
  | "top_friends_analytics"
  | "friend_streak_history"
  | "extended_birthdays"
  | "detailed_analytics"
  | "unlimited_photos"
  | "event_memory_timeline"
  | "archive_access"
  | "priority_sync"
  | "early_access";

export const PRO_FEATURES: Record<FeatureKey, { title: string; description: string }> = {
  unlimited_events: {
    title: "Unlimited Events",
    description: "Host as many events as you want",
  },
  recurring_events: {
    title: "Recurring Events",
    description: "Create weekly, monthly, or custom recurring events",
  },
  extended_whos_free: {
    title: "90-Day Who's Free",
    description: "See friend availability up to 90 days ahead",
  },
  unlimited_circles: {
    title: "Unlimited Groups",
    description: "Create unlimited planning groups",
  },
  unlimited_circle_members: {
    title: "Unlimited Group Members",
    description: "Add unlimited friends to each group",
  },
  circle_insights: {
    title: "Group Insights",
    description: "See activity and engagement analytics for your groups",
  },
  unlimited_friend_notes: {
    title: "Unlimited Friend Notes",
    description: "Keep unlimited private notes about your friends",
  },
  top_friends_analytics: {
    title: "Top Friends Analytics",
    description: "See who you hang out with most",
  },
  friend_streak_history: {
    title: "Friend Streak History",
    description: "View full history of your hangout streaks",
  },
  extended_birthdays: {
    title: "90-Day Birthday View",
    description: "See upcoming birthdays up to 90 days ahead",
  },
  detailed_analytics: {
    title: "Detailed Analytics",
    description: "Deep insights into your social patterns",
  },
  unlimited_photos: {
    title: "Unlimited Photos",
    description: "Upload unlimited photos to events",
  },
  event_memory_timeline: {
    title: "Memory Timeline",
    description: "Beautiful timeline of your event memories",
  },
  archive_access: {
    title: "Full Archive",
    description: "Access your complete event history",
  },
  priority_sync: {
    title: "Priority Sync",
    description: "Faster calendar and data synchronization",
  },
  early_access: {
    title: "Early Access",
    description: "Be first to try new features",
  },
};

// ============================================
// HELPER TYPES
// ============================================

export type SubscriptionTier = "free" | "pro";

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  isPro: boolean;
  expiresAt: Date | null;
  isLifetime: boolean;
  isTrial: boolean;
  trialEndsAt: Date | null;
  limits: typeof FREE_TIER_LIMITS | typeof PRO_TIER_LIMITS;
}

// ============================================
// VIRALITY RULE HELPER
// ============================================

// When a Pro user hosts an event or owns a circle,
// participants temporarily get Pro-level planning features
export const VIRALITY_BYPASS_FEATURES: FeatureKey[] = [
  "extended_whos_free",
  "unlimited_circle_members",
];
