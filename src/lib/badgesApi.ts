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
// Canonical Query Keys (SSOT)
// ============================================

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
    ["profile"], // Also invalidate profile for header badge display
  ];
}
