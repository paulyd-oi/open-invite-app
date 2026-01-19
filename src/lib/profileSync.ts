/**
 * Profile Sync Helper
 *
 * Centralized logic for syncing profile mutations across:
 * - Better Auth session (session.user.name, session.user.image)
 * - React Query ['profile'] cache (handle, bio, avatarUrl)
 *
 * Usage: Call updateProfileAndSync() after any profile mutation
 * to ensure UI updates immediately without app restart.
 */

import { QueryClient } from "@tanstack/react-query";
import { authClient } from "./authClient";
import { forceRefreshSession } from "./sessionCache";
import { isRateLimited, getRateLimitRemaining } from "./rateLimitState";

/**
 * Refresh both Better Auth session AND React Query profile cache
 * after a profile mutation.
 *
 * Call this after:
 * - Onboarding name/avatar save
 * - Settings profile update
 * - Any POST /api/profile mutation
 */
export async function updateProfileAndSync(queryClient: QueryClient): Promise<void> {
  const errors: string[] = [];

  // Step 1: Refetch Better Auth session to update session.user fields (name, image)
  // Skip if rate-limited
  if (isRateLimited()) {
    const remaining = getRateLimitRemaining();
    console.log(`[ProfileSync] Skipping session refresh: rate-limited for ${remaining} more seconds`);
    errors.push("session (rate-limited)");
  } else {
    try {
      console.log("[ProfileSync] Force refreshing cached session...");
      await forceRefreshSession();
      console.log("[ProfileSync] ✓ Session cache refreshed");
    } catch (error) {
      console.log("[ProfileSync] ⚠️ Session refresh error:", error);
      errors.push("session");
    }
  }

  // Step 2: Invalidate React Query ['profile'] cache to refetch handle/bio/avatarUrl
  try {
    console.log("[ProfileSync] Invalidating ['profile'] query cache...");
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    console.log("[ProfileSync] ✓ ['profile'] cache invalidated");
  } catch (error) {
    console.log("[ProfileSync] ⚠️ ['profile'] invalidation error:", error);
    errors.push("profile");
  }

  if (errors.length > 0) {
    console.log(`[ProfileSync] ⚠️ Partial sync (failed: ${errors.join(", ")})`);
  } else {
    console.log("[ProfileSync] ✅ Full sync complete");
  }
}

/**
 * Convenience wrapper for profile mutations that need syncing.
 *
 * @param mutation - The async mutation function (e.g., api.post)
 * @param queryClient - React Query client instance
 * @returns Result of the mutation
 */
export async function mutateProfileWithSync<T>(
  mutation: () => Promise<T>,
  queryClient: QueryClient
): Promise<T> {
  console.log("[ProfileSync] Starting mutation with auto-sync...");
  const result = await mutation();
  await updateProfileAndSync(queryClient);
  return result;
}
