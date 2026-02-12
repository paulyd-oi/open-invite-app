/**
 * Central Query Key Registry (SSOT)
 *
 * INVARIANT: All React Query keys should be sourced from this module (or the
 * domain-specific modules it re-exports). No new inline string-array keys.
 *
 * Existing domain modules (eventQueryKeys, circleQueryKeys, hostingQueryKeys,
 * refreshAfterMutation/friendKeys) are re-exported here for convenience.
 * New keys that don't have their own domain module live directly below.
 *
 * Usage:
 *   import { qk } from "@/lib/queryKeys";
 *   queryKey: qk.profile()
 *   queryClient.invalidateQueries({ queryKey: qk.entitlements() })
 */

import { eventKeys } from "./eventQueryKeys";
import { circleKeys } from "./circleQueryKeys";
import { hostingKeys } from "./hostingQueryKeys";
import { friendKeys } from "./refreshAfterMutation";

// ============================================================================
// CENTRAL REGISTRY
// ============================================================================

export const qk = {
  // ── Re-exported domain factories ──────────────────────────────────────
  event: eventKeys,
  circle: circleKeys,
  hosting: hostingKeys,
  friend: friendKeys,

  // ── Session / Profile ─────────────────────────────────────────────────
  profile: () => ["profile"] as const,
  profiles: () => ["profiles"] as const,

  // ── Entitlements / Subscription ────────────────────────────────────────
  entitlements: () => ["entitlements"] as const,
  subscription: () => ["subscription"] as const,
  subscriptionDetails: () => ["subscriptionDetails"] as const,

  // ── Notifications ─────────────────────────────────────────────────────
  notifications: () => ["notifications"] as const,
  notificationPreferences: () => ["notificationPreferences"] as const,

  // ── Feed / Discovery ──────────────────────────────────────────────────
  referralStats: () => ["referralStats"] as const,
  appConfig: () => ["app-config"] as const,

  // ── Admin ─────────────────────────────────────────────────────────────
  adminStatus: () => ["adminStatus"] as const,
} as const;

// ============================================================================
// DEV-ONLY INLINE KEY CHECKER
// ============================================================================

/**
 * DEV-only: Warn if a queryKey looks like a raw inline string array that
 * should be using qk.* instead.
 *
 * Intended for future use in a QueryClient defaultOptions.queries.queryKeyHashFn
 * wrapper, or as a manual grep-based audit tool.
 *
 * Known qk-owned roots — if a key starts with one of these strings AND was
 * not produced by a qk.* builder, something is wrong.
 */
const QK_OWNED_ROOTS = new Set([
  "profile",
  "profiles",
  "entitlements",
  "subscription",
  "subscriptionDetails",
  "notifications",
  "notificationPreferences",
  "referralStats",
  "app-config",
  "adminStatus",
]);

/**
 * DEV-only: check if a query key's root is owned by the registry.
 * Returns the root string if it should use qk.*, or null if it's fine.
 *
 * Usage (e.g., in a DEV-only wrapper):
 *   const owned = checkInlineKey(queryKey);
 *   if (owned) console.warn(`[QK_LINT] Use qk.${owned}() instead of inline ["${owned}"]`);
 */
export function checkInlineKey(queryKey: readonly unknown[]): string | null {
  if (!__DEV__) return null;
  if (!queryKey.length) return null;
  const root = String(queryKey[0]);
  return QK_OWNED_ROOTS.has(root) ? root : null;
}
