/**
 * Frontend Entitlements Logic
 * Single source of truth for all plan-based feature gating
 * Must stay in sync with backend/src/lib/entitlements.ts
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { SubscriptionContext } from "./SubscriptionContext";
import { devLog, devWarn, devError } from "./devLog";

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
  activeEventsMax: 5,
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
  | "notification_nudge_dismissed"
  | "circle_mute_toggle"
  | "circle_mute_bulk";

/**
 * Track analytics events (stub - can be connected to Amplitude/Mixpanel later)
 */
export function trackAnalytics(
  event: AnalyticsEvent,
  properties: Record<string, unknown>
): void {
  // Log to console in development
  if (__DEV__) {
    devLog(`[Analytics] ${event}`, properties);
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
 * @param options.enabled - If false, prevents network fetch (defaults to true)
 */
export function useEntitlements(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  
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
    enabled, // Gate network fetch on bootStatus via caller
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    // Use cached data as placeholder while fetching
    placeholderData: () => DEFAULT_FREE_ENTITLEMENTS,
  });
}

/**
 * Hook to invalidate, refetch, and return fresh entitlements
 * Returns { isPro: boolean } after refetch completes
 */
export function useRefreshEntitlements() {
  const queryClient = useQueryClient();

  return useCallback(async (): Promise<{ isPro: boolean }> => {
    // Invalidate to mark stale
    await queryClient.invalidateQueries({ queryKey: ["entitlements"] });
    // Refetch and get fresh data
    const freshData = await queryClient.fetchQuery<EntitlementsResponse>({
      queryKey: ["entitlements"],
    });
    const backendIsPro = isPro(freshData);
    
    // [PRO_SOT] Log backend entitlements refresh result
    if (__DEV__) {
      devLog("[PRO_SOT][refreshEntitlements] BACKEND_REFRESH", {
        plan: freshData?.plan,
        isPro: backendIsPro,
      });
    }
    
    return { isPro: backendIsPro };
  }, [queryClient]);
}

/**
 * CANONICAL SSOT: Single refresh contract for Pro status.
 * 
 * Use this hook's returned function for ALL pro/premium refresh operations:
 * - Promo code redemption
 * - Purchase success
 * - Restore purchases
 * - Manual refresh button
 * 
 * CONTRACT: combinedIsPro = rcIsPro || backendIsPro
 * 
 * Returns { rcIsPro, backendIsPro, combinedIsPro }
 */
export function useRefreshProContract() {
  const queryClient = useQueryClient();
  const subscriptionContext = useContext(SubscriptionContext);

  return useCallback(async (opts?: { reason: string }): Promise<{
    rcIsPro: boolean;
    backendIsPro: boolean;
    combinedIsPro: boolean;
  }> => {
    const reason = opts?.reason ?? "unknown";
    
    // [PRO_SOT] Log BEFORE state
    if (__DEV__) {
      devLog(`[PRO_SOT] REFRESH_START reason=${reason}`);
    }

    let rcIsPro = false;
    let backendIsPro = false;

    try {
      // Step 1: Refresh RevenueCat via SubscriptionContext
      if (subscriptionContext?.refresh) {
        const rcResult = await subscriptionContext.refresh();
        rcIsPro = rcResult?.isPro ?? false;
      }
      
      // [PRO_SOT] Log RC result
      if (__DEV__) {
        devLog(`[PRO_SOT] RC_REFRESH reason=${reason} rcIsPro=${rcIsPro}`);
      }
    } catch (rcErr) {
      if (__DEV__) {
        devLog(`[PRO_SOT] RC_ERROR reason=${reason} error=${rcErr}`);
      }
    }

    try {
      // Step 2: Refresh backend entitlements
      await queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      const freshData = await queryClient.fetchQuery<EntitlementsResponse>({
        queryKey: ["entitlements"],
      });
      backendIsPro = isPro(freshData);
      
      // [PRO_SOT] Log backend result
      if (__DEV__) {
        devLog(`[PRO_SOT] BACKEND_REFRESH reason=${reason} backendIsPro=${backendIsPro} plan=${freshData?.plan}`);
      }
    } catch (beErr) {
      if (__DEV__) {
        devLog(`[PRO_SOT] BACKEND_ERROR reason=${reason} error=${beErr}`);
      }
    }

    // SSOT: Combined result
    const combinedIsPro = rcIsPro || backendIsPro;

    // [PRO_SOT] Log FINAL combined result
    if (__DEV__) {
      devLog(`[PRO_SOT] REFRESH_COMPLETE reason=${reason} rcIsPro=${rcIsPro} backendIsPro=${backendIsPro} combinedIsPro=${combinedIsPro}`);
    }

    return { rcIsPro, backendIsPro, combinedIsPro };
  }, [queryClient, subscriptionContext]);
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

/**
 * SINGLE SOURCE OF TRUTH for Pro/Premium status.
 * Use this hook in ALL gating logic.
 * 
 * Checks BOTH:
 * 1. Backend entitlements (plan === PRO or LIFETIME_PRO)
 * 2. RevenueCat entitlements (entitlements.active.premium)
 * 
 * Returns:
 * - isPro: true if EITHER backend OR RevenueCat says Pro
 * - isLoading: true while entitlements are being fetched (DO NOT show gates while loading)
 * - entitlements: raw entitlements data for advanced checks
 * 
 * CRITICAL: Never show upgrade gates/modals while isLoading is true.
 */
export function useIsPro(): {
  isPro: boolean;
  isLoading: boolean;
  entitlements: EntitlementsResponse | undefined;
  // [P0_PRO_TRIO_UNLOCK] Expose source values for debugging at component level
  rcIsPro: boolean;
  backendIsPro: boolean;
  combinedIsPro: boolean;
} {
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements();
  
  // Check RevenueCat via SubscriptionContext (single source for RC state)
  // Use useContext directly to avoid circular dependency with useSubscription()
  const subscriptionContext = useContext(SubscriptionContext);
  const revenueCatIsPremium = subscriptionContext?.isPremium ?? false;
  const revenueCatLoading = subscriptionContext?.isLoading ?? true;
  
  // Backend says Pro if plan is PRO or LIFETIME_PRO
  const backendIsPro = isPro(entitlements);
  
  // Combined loading state: loading if either is loading
  const isLoading = entitlementsLoading || revenueCatLoading;
  
  // MERGED: User is Pro if EITHER backend OR RevenueCat says so
  // This ensures instant UI update when RevenueCat purchase completes
  const userIsPro = backendIsPro || revenueCatIsPremium;
  
  // [PRO_SOT] Log combined check for debugging
  if (__DEV__) {
    devLog("[PRO_SOT][useIsPro] ENTITLEMENT_CHECK", {
      source_backend_plan: entitlements?.plan,
      source_backend_isPro: backendIsPro,
      source_revenueCat_isPremium: revenueCatIsPremium,
      combined_isPro: userIsPro,
      loading_backend: entitlementsLoading,
      loading_revenueCat: revenueCatLoading,
    });
  }
  
  return {
    isPro: userIsPro,
    isLoading,
    entitlements,
    // [P0_PRO_TRIO_UNLOCK] Expose source values for component-level debugging
    rcIsPro: revenueCatIsPremium,
    backendIsPro,
    combinedIsPro: userIsPro,
  };
}

/**
 * CANONICAL premium check function.
 * Use this ONE function for all premium/paywall gating decisions.
 * 
 * Checks multiple signals to catch all premium states:
 * - plan === "PRO" or "LIFETIME_PRO"
 * - isLifetime flag (backend may send this separately)
 * - isPro flag (backend may send this separately)
 * - tier === "premium" or "pro" or "lifetime"
 * - productId contains "lifetime" (RevenueCat)
 * 
 * @param payload - Raw subscription/entitlements payload from backend or RevenueCat
 * @param source - Where this check is being called from (for logging)
 * @returns true if user should have premium access
 */
export function isPremiumFromSubscription(
  payload: {
    plan?: Plan | string;
    tier?: string;
    isLifetime?: boolean;
    isPro?: boolean;
    productId?: string;
    entitlements?: { active?: { premium?: unknown } };
  } | undefined,
  source?: string
): boolean {
  if (!payload) {
    if (__DEV__) {
      devLog(`[isPremiumFromSubscription] No payload, returning false. Source: ${source ?? "unknown"}`);
    }
    return false;
  }

  const {
    plan,
    tier,
    isLifetime,
    isPro: isPropFlag,
    productId,
    entitlements,
  } = payload;

  // Check all possible premium indicators
  const planIsPremium = plan === "PRO" || plan === "LIFETIME_PRO";
  const tierIsPremium = tier === "premium" || tier === "pro" || tier === "lifetime";
  const lifetimeFlag = isLifetime === true;
  const proFlag = isPropFlag === true;
  const productIsLifetime = productId?.toLowerCase().includes("lifetime") ?? false;
  const revenueCatPremium = !!entitlements?.active?.premium;

  const result = planIsPremium || tierIsPremium || lifetimeFlag || proFlag || productIsLifetime || revenueCatPremium;

  if (__DEV__) {
    devLog(`[isPremiumFromSubscription] Source: ${source ?? "unknown"}`, {
      plan,
      tier,
      isLifetime,
      isPro: isPropFlag,
      productId,
      hasRevenueCatPremium: revenueCatPremium,
      computed: {
        planIsPremium,
        tierIsPremium,
        lifetimeFlag,
        proFlag,
        productIsLifetime,
      },
      result,
    });
  }

  return result;
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
