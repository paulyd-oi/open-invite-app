/**
 * Frontend Entitlements Logic
 * Single source of truth for all plan-based feature gating
 * Must stay in sync with backend/src/lib/entitlements.ts
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

// Plan types
export type Plan = "FREE" | "PRO" | "LIFETIME_PRO";

// Paywall context enum - matches spec exactly
export type PaywallContext =
  | "ACTIVE_EVENTS_LIMIT"
  | "RECURRING_EVENTS"
  | "WHOS_FREE_HORIZON"
  | "UPCOMING_BIRTHDAYS_HORIZON"
  | "CIRCLES_LIMIT"
  | "CIRCLE_MEMBERS_LIMIT"
  | "INSIGHTS_LOCKED"
  | "HISTORY_LIMIT"
  | "ACHIEVEMENTS_LOCKED"
  | "PRIORITY_SYNC_LOCKED";

// Feature limits
export interface PlanLimits {
  whosFreeHorizonDays: number;
  upcomingBirthdaysHorizonDays: number;
  activeEventsMax: number | null; // null = unlimited
  eventHistoryDays: number | null; // null = unlimited
  circlesMax: number | null;
  membersPerCircleMax: number | null;
  friendNotesMax: number | null;
}

// Features enabled
export interface PlanFeatures {
  recurringEvents: boolean;
  circleInsights: boolean;
  topFriendsAnalytics: boolean;
  fullAchievements: boolean;
  prioritySync: boolean;
  unlimitedEvents: boolean;
  unlimitedCircles: boolean;
  unlimitedFriendNotes: boolean;
  fullEventHistory: boolean;
}

// Usage counts
export interface UsageCounts {
  activeEventsCount: number;
  circlesCount: number;
  friendNotesCount: number;
}

// Entitlements response with source tracking
export interface EntitlementsResponse {
  plan: Plan;
  limits: PlanLimits;
  features: PlanFeatures;
  usage: UsageCounts;
  source?: "revenuecat" | "backend" | "cache";
  cachedAt?: number;
}

// Capability check result
export interface CapabilityResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
}

// Default free limits (for offline/loading state)
const FREE_LIMITS: PlanLimits = {
  whosFreeHorizonDays: 7,
  upcomingBirthdaysHorizonDays: 7,
  activeEventsMax: 3,
  eventHistoryDays: 30,
  circlesMax: 2,
  membersPerCircleMax: 15,
  friendNotesMax: 5,
};

const FREE_FEATURES: PlanFeatures = {
  recurringEvents: false,
  circleInsights: false,
  topFriendsAnalytics: false,
  fullAchievements: false,
  prioritySync: false,
  unlimitedEvents: false,
  unlimitedCircles: false,
  unlimitedFriendNotes: false,
  fullEventHistory: false,
};

const DEFAULT_FREE_ENTITLEMENTS: EntitlementsResponse = {
  plan: "FREE",
  limits: FREE_LIMITS,
  features: FREE_FEATURES,
  usage: { activeEventsCount: 0, circlesCount: 0, friendNotesCount: 0 },
  source: "cache",
};

// ============================================
// A. Client-Side Snapshot Cache
// ============================================

const ENTITLEMENTS_CACHE_KEY = "entitlements_cache";
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Load cached entitlements from AsyncStorage
 */
async function loadCachedEntitlements(): Promise<EntitlementsResponse | null> {
  try {
    const cached = await AsyncStorage.getItem(ENTITLEMENTS_CACHE_KEY);
    if (!cached) return null;

    const data = JSON.parse(cached) as EntitlementsResponse;

    // Check if cache is still valid
    if (data.cachedAt && Date.now() - data.cachedAt < CACHE_TTL_MS) {
      return { ...data, source: "cache" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save entitlements to AsyncStorage cache
 */
async function cacheEntitlements(data: EntitlementsResponse): Promise<void> {
  try {
    await AsyncStorage.setItem(
      ENTITLEMENTS_CACHE_KEY,
      JSON.stringify({ ...data, cachedAt: Date.now() })
    );
  } catch {
    // Silently fail
  }
}

// ============================================
// B. Session-Based Paywall Tracking
// ============================================

// Track paywall shown this session (prevents over-monetization)
let paywallShownThisSession = false;

/**
 * Check if paywall was already shown this session
 */
export function wasPaywallShownThisSession(): boolean {
  return paywallShownThisSession;
}

/**
 * Mark paywall as shown for this session
 */
export function markPaywallShown(): void {
  paywallShownThisSession = true;
  trackAnalytics("paywall_shown", {});
}

/**
 * Reset session paywall tracking (call on app foreground/logout)
 */
export function resetSessionPaywallTracking(): void {
  paywallShownThisSession = false;
}

/**
 * Check if automatic paywall can be shown
 * Returns false if already shown this session (manual taps still allowed)
 */
export function canShowAutomaticPaywall(): boolean {
  return !paywallShownThisSession;
}

// ============================================
// D. Analytics Stubs
// ============================================

export type AnalyticsEvent =
  | "paywall_shown"
  | "paywall_dismissed"
  | "paywall_purchase_started"
  | "paywall_purchase_completed"
  | "notification_permission_granted"
  | "notification_permission_denied"
  | "notification_nudge_shown"
  | "notification_nudge_dismissed";

/**
 * Track analytics events (stub - can be connected to Amplitude/Mixpanel later)
 */
export function trackAnalytics(
  event: AnalyticsEvent,
  properties: Record<string, unknown>
): void {
  // Log to console in development
  if (__DEV__) {
    console.log(`[Analytics] ${event}`, properties);
  }

  // TODO: Connect to real analytics provider
  // Examples:
  // - Amplitude.logEvent(event, properties);
  // - Mixpanel.track(event, properties);
  // - PostHog.capture(event, properties);
}

// ============================================
// Hooks
// ============================================

/**
 * Hook to fetch user entitlements with caching
 */
export function useEntitlements() {
  return useQuery({
    queryKey: ["entitlements"],
    queryFn: async () => {
      try {
        const response = await api.get<EntitlementsResponse>("/api/entitlements");
        // Cache the response
        await cacheEntitlements(response);
        return { ...response, source: "backend" as const };
      } catch (error) {
        // Fall back to cache on error
        const cached = await loadCachedEntitlements();
        if (cached) return cached;
        throw error;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    // Use cached data as placeholder while fetching
    placeholderData: () => DEFAULT_FREE_ENTITLEMENTS,
  });
}

/**
 * Hook to invalidate and refetch entitlements
 */
export function useRefreshEntitlements() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["entitlements"] });
  }, [queryClient]);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get current plan from entitlements data
 */
export function getPlan(entitlements: EntitlementsResponse | undefined): Plan {
  return entitlements?.plan ?? "FREE";
}

/**
 * Get limits from entitlements data
 */
export function getLimits(entitlements: EntitlementsResponse | undefined): PlanLimits {
  return entitlements?.limits ?? FREE_LIMITS;
}

/**
 * Get features from entitlements data
 */
export function getFeatures(entitlements: EntitlementsResponse | undefined): PlanFeatures {
  return entitlements?.features ?? FREE_FEATURES;
}

/**
 * Check if user is on a pro plan
 */
export function isPro(entitlements: EntitlementsResponse | undefined): boolean {
  const plan = getPlan(entitlements);
  return plan === "PRO" || plan === "LIFETIME_PRO";
}

// ============================================
// Capability Checks
// ============================================

/**
 * Check if user can create an event
 */
export function canCreateEvent(
  entitlements: EntitlementsResponse | undefined,
  isRecurring?: boolean
): { allowed: boolean; context?: PaywallContext } {
  const features = getFeatures(entitlements);
  const limits = getLimits(entitlements);
  const usage = entitlements?.usage ?? { activeEventsCount: 0, circlesCount: 0, friendNotesCount: 0 };

  // Check recurring
  if (isRecurring && !features.recurringEvents) {
    return { allowed: false, context: "RECURRING_EVENTS" };
  }

  // Check active events limit
  if (limits.activeEventsMax !== null && usage.activeEventsCount >= limits.activeEventsMax) {
    return { allowed: false, context: "ACTIVE_EVENTS_LIMIT" };
  }

  return { allowed: true };
}

/**
 * Check if user can view Who's Free for a range
 */
export function canViewWhosFree(
  entitlements: EntitlementsResponse | undefined,
  requestedDays: number
): { allowed: boolean; context?: PaywallContext; limit?: number } {
  const limits = getLimits(entitlements);

  if (requestedDays > limits.whosFreeHorizonDays) {
    return {
      allowed: false,
      context: "WHOS_FREE_HORIZON",
      limit: limits.whosFreeHorizonDays,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can view birthdays for a range
 */
export function canViewBirthdays(
  entitlements: EntitlementsResponse | undefined,
  requestedDays: number
): { allowed: boolean; context?: PaywallContext; limit?: number } {
  const limits = getLimits(entitlements);

  if (requestedDays > limits.upcomingBirthdaysHorizonDays) {
    return {
      allowed: false,
      context: "UPCOMING_BIRTHDAYS_HORIZON",
      limit: limits.upcomingBirthdaysHorizonDays,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can create a circle
 */
export function canCreateCircle(
  entitlements: EntitlementsResponse | undefined
): { allowed: boolean; context?: PaywallContext } {
  const limits = getLimits(entitlements);
  const usage = entitlements?.usage ?? { activeEventsCount: 0, circlesCount: 0, friendNotesCount: 0 };

  if (limits.circlesMax !== null && usage.circlesCount >= limits.circlesMax) {
    return { allowed: false, context: "CIRCLES_LIMIT" };
  }

  return { allowed: true };
}

/**
 * Check if user can add a member to a circle
 */
export function canAddCircleMember(
  entitlements: EntitlementsResponse | undefined,
  currentMembersCount: number
): { allowed: boolean; context?: PaywallContext } {
  const limits = getLimits(entitlements);

  if (limits.membersPerCircleMax !== null && currentMembersCount >= limits.membersPerCircleMax) {
    return { allowed: false, context: "CIRCLE_MEMBERS_LIMIT" };
  }

  return { allowed: true };
}

/**
 * Check if user can use insights
 */
export function canUseInsights(
  entitlements: EntitlementsResponse | undefined
): { allowed: boolean; context?: PaywallContext } {
  const features = getFeatures(entitlements);

  if (!features.topFriendsAnalytics) {
    return { allowed: false, context: "INSIGHTS_LOCKED" };
  }

  return { allowed: true };
}

/**
 * Check if user can view full achievements
 */
export function canViewFullAchievements(
  entitlements: EntitlementsResponse | undefined
): { allowed: boolean; context?: PaywallContext } {
  const features = getFeatures(entitlements);

  if (!features.fullAchievements) {
    return { allowed: false, context: "ACHIEVEMENTS_LOCKED" };
  }

  return { allowed: true };
}

/**
 * Check if user can view full event history
 */
export function canViewFullHistory(
  entitlements: EntitlementsResponse | undefined,
  requestedDays: number
): { allowed: boolean; context?: PaywallContext } {
  const limits = getLimits(entitlements);

  if (limits.eventHistoryDays !== null && requestedDays > limits.eventHistoryDays) {
    return { allowed: false, context: "HISTORY_LIMIT" };
  }

  return { allowed: true };
}

/**
 * Map reason to PaywallContext
 */
export function reasonToContext(reason: string): PaywallContext {
  const mapping: Record<string, PaywallContext> = {
    RECURRING_EVENTS: "RECURRING_EVENTS",
    ACTIVE_EVENTS_LIMIT: "ACTIVE_EVENTS_LIMIT",
    WHOS_FREE_HORIZON: "WHOS_FREE_HORIZON",
    UPCOMING_BIRTHDAYS_HORIZON: "UPCOMING_BIRTHDAYS_HORIZON",
    CIRCLES_LIMIT: "CIRCLES_LIMIT",
    CIRCLE_MEMBERS_LIMIT: "CIRCLE_MEMBERS_LIMIT",
    INSIGHTS_LOCKED: "INSIGHTS_LOCKED",
    HISTORY_LIMIT: "HISTORY_LIMIT",
    ACHIEVEMENTS_LOCKED: "ACHIEVEMENTS_LOCKED",
    PRIORITY_SYNC_LOCKED: "PRIORITY_SYNC_LOCKED",
  };
  return mapping[reason] ?? "ACTIVE_EVENTS_LIMIT";
}
