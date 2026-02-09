// useSubscription.ts
// Frontend hook for subscription status and limit checks
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useSession } from "@/lib/useSession";
import { isAuthedForNetwork } from "@/lib/authedGate";

// ============================================
// FREE TIER LIMITS (mirror of backend)
// ============================================

export const FREE_TIER_LIMITS = {
  maxActiveEvents: 5,
  eventHistoryDays: 30,
  recurringEvents: false,
  whosFreeAheadDays: 7,
  maxCircles: 2,
  maxCircleMembers: 15,
  circleInsights: false,
  maxFriendNotes: 5,
  topFriendsAnalytics: false,
  friendStreakHistory: false,
  birthdaysAheadDays: 7,
  detailedAnalytics: false,
  photoUploadsUnlimited: false,
  eventMemoryTimeline: false,
  archiveAccess: false,
  prioritySync: false,
  earlyAccess: false,
} as const;

export const PRO_TIER_LIMITS = {
  maxActiveEvents: Infinity,
  eventHistoryDays: Infinity,
  recurringEvents: true,
  whosFreeAheadDays: 90,
  maxCircles: Infinity,
  maxCircleMembers: Infinity,
  circleInsights: true,
  maxFriendNotes: Infinity,
  topFriendsAnalytics: true,
  friendStreakHistory: true,
  birthdaysAheadDays: 90,
  detailedAnalytics: true,
  photoUploadsUnlimited: true,
  eventMemoryTimeline: true,
  archiveAccess: true,
  prioritySync: true,
  earlyAccess: true,
} as const;

// ============================================
// PRICING
// ============================================

export const PRICING = {
  free: 0,
  proYearly: 10,
  proYearlyFuture: 25,
  lifetime: 199,
  trialDays: 14,
} as const;

// ============================================
// PRO FEATURES INFO
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
    title: "Unlimited Circles",
    description: "Create unlimited planning groups",
  },
  unlimited_circle_members: {
    title: "Unlimited Circle Members",
    description: "Add unlimited friends to each circle",
  },
  circle_insights: {
    title: "Circle Insights",
    description: "See activity and engagement analytics for your circles",
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
// TYPES
// ============================================

export interface SubscriptionData {
  subscription: {
    tier: "free" | "pro";
    isPro: boolean;
    expiresAt: string | null;
    isLifetime: boolean;
    isTrial: boolean;
    trialEndsAt: string | null;
    isBeta: boolean;
  };
  limits: {
    maxActiveEvents: number | null;
    currentActiveEvents: number;
    canCreateEvent: boolean;
    eventsRemaining: number | null;
    recurringEventsEnabled: boolean;
    eventHistoryDays: number | null;
    whosFreeAheadDays: number;
    maxCircles: number | null;
    currentCircles: number;
    canCreateCircle: boolean;
    circlesRemaining: number | null;
    maxCircleMembers: number | null;
    circleInsightsEnabled: boolean;
    maxFriendNotes: number | null;
    currentFriendNotes: number;
    canCreateFriendNote: boolean;
    friendNotesRemaining: number | null;
    currentFriends: number;
    birthdaysAheadDays: number;
    topFriendsAnalyticsEnabled: boolean;
    detailedAnalyticsEnabled: boolean;
    photoUploadsUnlimited: boolean;
    eventMemoryTimelineEnabled: boolean;
    archiveAccessEnabled: boolean;
    prioritySyncEnabled: boolean;
    earlyAccessEnabled: boolean;
  };
  pricing: typeof PRICING;
  referralTiers: {
    MONTH_PRO: { count: number; type: string; durationDays: number; label: string };
    YEAR_PRO: { count: number; type: string; durationDays: number; label: string };
    LIFETIME_PRO: { count: number; type: string; durationDays: number | null; label: string };
  };
}

// ============================================
// HOOK
// ============================================

export function useSubscription() {
  const { status: bootStatus } = useBootAuthority();
  const { data: session } = useSession();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.get<SubscriptionData>("/api/subscription"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const isPro = data?.subscription?.isPro ?? false;
  const isTrial = data?.subscription?.isTrial ?? false;
  const isLifetime = data?.subscription?.isLifetime ?? false;
  const tier = data?.subscription?.tier ?? "free";

  // Helper functions for checking limits
  const canCreateEvent = () => data?.limits?.canCreateEvent ?? true;
  const canCreateCircle = () => data?.limits?.canCreateCircle ?? true;
  const canCreateFriendNote = () => data?.limits?.canCreateFriendNote ?? true;
  const canCreateRecurringEvent = () => data?.limits?.recurringEventsEnabled ?? false;

  // Get remaining counts
  const eventsRemaining = data?.limits?.eventsRemaining ?? null;
  const circlesRemaining = data?.limits?.circlesRemaining ?? null;
  const friendNotesRemaining = data?.limits?.friendNotesRemaining ?? null;

  // Get current counts
  const currentActiveEvents = data?.limits?.currentActiveEvents ?? 0;
  const currentCircles = data?.limits?.currentCircles ?? 0;
  const currentFriendNotes = data?.limits?.currentFriendNotes ?? 0;

  // Check if a specific feature is available
  const hasFeature = (feature: FeatureKey): boolean => {
    if (isPro) return true;

    switch (feature) {
      case "unlimited_events":
        return false;
      case "recurring_events":
        return data?.limits?.recurringEventsEnabled ?? false;
      case "extended_whos_free":
        return false;
      case "unlimited_circles":
        return false;
      case "unlimited_circle_members":
        return false;
      case "circle_insights":
        return data?.limits?.circleInsightsEnabled ?? false;
      case "unlimited_friend_notes":
        return false;
      case "top_friends_analytics":
        return data?.limits?.topFriendsAnalyticsEnabled ?? false;
      case "friend_streak_history":
        return false;
      case "extended_birthdays":
        return false;
      case "detailed_analytics":
        return data?.limits?.detailedAnalyticsEnabled ?? false;
      case "unlimited_photos":
        return data?.limits?.photoUploadsUnlimited ?? false;
      case "event_memory_timeline":
        return data?.limits?.eventMemoryTimelineEnabled ?? false;
      case "archive_access":
        return data?.limits?.archiveAccessEnabled ?? false;
      case "priority_sync":
        return data?.limits?.prioritySyncEnabled ?? false;
      case "early_access":
        return data?.limits?.earlyAccessEnabled ?? false;
      default:
        return false;
    }
  };

  // Get the max days ahead for Who's Free
  const getWhosFreeMaxDays = () => data?.limits?.whosFreeAheadDays ?? FREE_TIER_LIMITS.whosFreeAheadDays;

  // Get the max days ahead for birthdays
  const getBirthdaysMaxDays = () => data?.limits?.birthdaysAheadDays ?? FREE_TIER_LIMITS.birthdaysAheadDays;

  // Get trial end date
  const getTrialEndDate = (): Date | null => {
    if (!data?.subscription?.trialEndsAt) return null;
    return new Date(data.subscription.trialEndsAt);
  };

  // Get subscription expiry date
  const getExpiryDate = (): Date | null => {
    if (!data?.subscription?.expiresAt) return null;
    return new Date(data.subscription.expiresAt);
  };

  // Format subscription status for display
  const getStatusLabel = (): string => {
    if (isLifetime) return "Lifetime Pro";
    if (isTrial) return "Pro Trial";
    if (isPro) return "Pro";
    return "Free";
  };

  return {
    // Raw data
    data,
    isLoading,
    error,
    refetch,

    // Subscription status
    isPro,
    isTrial,
    isLifetime,
    tier,
    getStatusLabel,
    getTrialEndDate,
    getExpiryDate,

    // Limit checks
    canCreateEvent,
    canCreateCircle,
    canCreateFriendNote,
    canCreateRecurringEvent,

    // Remaining counts
    eventsRemaining,
    circlesRemaining,
    friendNotesRemaining,

    // Current counts
    currentActiveEvents,
    currentCircles,
    currentFriendNotes,

    // Feature checks
    hasFeature,
    getWhosFreeMaxDays,
    getBirthdaysMaxDays,

    // Limits (for display)
    limits: data?.limits,
    pricing: data?.pricing ?? PRICING,
    referralTiers: data?.referralTiers,

    // Constants
    FREE_TIER_LIMITS,
    PRO_TIER_LIMITS,
    PRO_FEATURES,
  };
}

export default useSubscription;
