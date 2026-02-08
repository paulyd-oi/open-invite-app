/**
 * Badge SSOT Adapter
 * 
 * [P0_BADGE_SOT] Single source of truth for badge-related API calls and query keys.
 * All screens must import badge operations from this module rather than calling
 * endpoints directly.
 * 
 * Endpoints (internally use achievements naming for backwards compat):
 * - GET /api/badges/catalog - Badge catalog with unlock status
 * - GET /api/achievements/user/{userId}/badge - User's featured badge
 * - PUT /api/profile/featured-badge - Set featured badge
 */

import { api } from "./api";
import { devLog } from "./devLog";
import type { ProfileBadge } from "@/shared/contracts";

// ============================================
// Types
// ============================================

export interface BadgeCatalogItem {
  badgeKey: string;
  name: string;
  description: string;
  tierColor: string;
  unlockTarget: number | null;
  progressCurrent: number;
  unlocked: boolean;
  featured: boolean;
}

export interface BadgeCatalogResponse {
  badges: BadgeCatalogItem[];
}

export interface FeaturedBadgeResponse {
  badge: ProfileBadge | null;
}

export interface SetFeaturedBadgeResponse {
  success: boolean;
  badge?: ProfileBadge | null;
}

// ============================================
// Pro Trio Badge SSOT Constants
// ============================================

/**
 * [P0_BADGE_SOT] The three badge keys that unlock automatically for Pro subscribers.
 * This is the SINGLE SOURCE OF TRUTH for which badges are Pro-gated.
 * Any code checking Pro trio membership MUST import this constant.
 */
export const PRO_TRIO_BADGE_KEYS = [
  "pro_includer",
  "pro_organizer",
  "pro_initiator",
] as const;

export type ProTrioBadgeKey = (typeof PRO_TRIO_BADGE_KEYS)[number];

/**
 * [P0_BADGE_SOT] Check if a badge key is a Pro trio badge.
 * SSOT — do not duplicate this check inline.
 */
export function isProTrioBadgeKey(key: string): key is ProTrioBadgeKey {
  return (PRO_TRIO_BADGE_KEYS as readonly string[]).includes(key);
}

/**
 * [P0_BADGE_SOT] Deterministic badge derivation with Pro trio override.
 *
 * When isPro is true, Pro trio badges are ALWAYS marked unlocked regardless
 * of the API response. This ensures the client never shows them as locked
 * for entitled users, even if the backend hasn't synced RevenueCat state.
 *
 * Returns a NEW array — does not mutate input.
 */
export function deriveBadgesWithProOverride(
  badges: BadgeCatalogItem[],
  isPro: boolean,
): BadgeCatalogItem[] {
  if (!isPro) return badges;

  return badges.map((badge) => {
    if (isProTrioBadgeKey(badge.badgeKey) && !badge.unlocked) {
      if (__DEV__) {
        devLog("[P0_BADGE_SOT] pro_override applied", {
          badgeKey: badge.badgeKey,
          apiUnlocked: false,
          derivedUnlocked: true,
        });
      }
      return { ...badge, unlocked: true };
    }
    return badge;
  });
}

// ============================================
// Canonical Query Keys (SSOT)
// ============================================

/** [P0_FEATURED_BADGE_UI] SSOT query key for the viewer's profile. */
export const PROFILE_QUERY_KEY = ["profile"] as const;

export const BADGE_QUERY_KEYS = {
  /** Query key for the full badge catalog (all badges with unlock status) */
  catalog: ["badgeCatalog"] as const,
  
  /** Query key for a user's featured badge */
  featured: (userId: string) => ["featuredBadge", userId] as const,
} as const;

// ============================================
// API Functions
// ============================================

/**
 * Fetch the badge catalog (all badges with unlock/progress status for current user)
 */
export async function getBadgeCatalog(): Promise<BadgeCatalogResponse> {
  const endpoint = "/api/badges/catalog";
  
  if (__DEV__) {
    devLog(`[P0_BADGE_SOT] catalog queryKey=${JSON.stringify(BADGE_QUERY_KEYS.catalog)} endpoint=${endpoint}`);
  }
  
  return api.get<BadgeCatalogResponse>(endpoint);
}

/**
 * Fetch a user's featured badge
 * @param userId - The user ID to fetch featured badge for
 */
export async function getFeaturedBadge(userId: string): Promise<FeaturedBadgeResponse> {
  const endpoint = `/api/achievements/user/${userId}/badge`;
  
  if (__DEV__) {
    devLog(`[P0_BADGE_SOT] featured queryKey=${JSON.stringify(BADGE_QUERY_KEYS.featured(userId))} userIdPrefix=${userId.slice(0, 6)} endpoint=${endpoint}`);
  }
  
  return api.get<FeaturedBadgeResponse>(endpoint);
}

/**
 * Set the current user's featured badge
 * @param badgeKey - The badge key to feature, or null to clear
 */
export async function setFeaturedBadge(badgeKey: string | null): Promise<SetFeaturedBadgeResponse> {
  const endpoint = "/api/profile/featured-badge";
  
  if (__DEV__) {
    devLog(`[P0_BADGE_SOT] setFeatured badgeKey=${badgeKey ?? "null"} endpoint=${endpoint}`);
  }
  
  return api.put<SetFeaturedBadgeResponse>(endpoint, { badgeKey });
}

// ============================================
// Invalidation Helpers
// ============================================

/**
 * Get all query keys that should be invalidated after setting featured badge
 * @param userId - The user whose featured badge was updated
 */
export function getSetFeaturedInvalidationKeys(userId: string) {
  return [
    BADGE_QUERY_KEYS.catalog,
    BADGE_QUERY_KEYS.featured(userId),
    PROFILE_QUERY_KEY, // Also invalidate profile for header badge display
  ];
}
