/**
 * Logout Helper (SSOT)
 *
 * Single source of truth for all logout flows.
 * Screens MUST call performLogout() instead of maintaining their own logout sequences.
 *
 * Standardized sequence:
 * 1. Deactivate push token (best-effort)
 * 2. Set logout intent flag
 * 3. Reset session (clear tokens + sign out)
 * 4. Cancel queries + clear cache
 * 5. Reset boot authority singleton
 * 6. Navigate to /login
 *
 * Safe to call multiple times - idempotent via in-flight guard.
 */

import { QueryClient } from "@tanstack/react-query";
import { Router } from "expo-router";
import { resetSession } from "./authBootstrap";
import { setLogoutIntent } from "./logoutIntent";
import { deactivatePushTokenOnLogout } from "./pushTokenManager";
import { resetBootAuthority } from "@/hooks/useBootAuthority";
import { devLog, devError } from "./devLog";

export type LogoutScreen = "settings" | "account_center" | "social" | "privacy_settings" | "auth_expiry";
export type LogoutReason = "user_logout" | "account_deletion" | "auth_expired";

export interface PerformLogoutOptions {
  /** Screen initiating logout (for logging) */
  screen: LogoutScreen;
  /** Reason for logout */
  reason?: LogoutReason;
  /** React Query client for cache operations */
  queryClient: QueryClient;
  /** Expo Router instance */
  router: Router;
}

// In-flight guard to prevent concurrent logout calls
let logoutInFlight = false;

/**
 * Perform canonical logout sequence.
 * All screens MUST use this instead of their own logout logic.
 */
export async function performLogout(options: PerformLogoutOptions): Promise<void> {
  const { screen, reason = "user_logout", queryClient, router } = options;

  // DEV-only canonical log (single source of truth)
  if (__DEV__) {
    devLog(`[LOGOUT_SSOT] start screen=${screen} reason=${reason}`);
  }

  // Idempotent guard - safe to call multiple times
  if (logoutInFlight) {
    if (__DEV__) {
      devLog(`[LOGOUT_SSOT] already in progress - skipping duplicate call`);
    }
    return;
  }

  logoutInFlight = true;

  try {
    // Step 1: Deactivate push token (best-effort, never blocks)
    try {
      await deactivatePushTokenOnLogout();
    } catch (e) {
      // Push token deactivation failure does not block logout
    }

    // Step 2: Set logout intent flag (required for resetSession to clear tokens)
    setLogoutIntent();

    // Step 3: Reset session (clear tokens, sign out from backend)
    await resetSession({ reason, endpoint: screen });

    // Step 4: Cancel queries + clear cache
    await queryClient.cancelQueries();
    queryClient.clear();

    // Step 5: Reset boot authority singleton
    resetBootAuthority();

    // Step 6: Navigate to login
    router.replace("/login");
  } catch (error) {
    if (__DEV__) {
      devError(`[LOGOUT_SSOT] error during logout:`, error);
    }

    // Fallback: ensure user can still log out even if something fails
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      resetBootAuthority();
    } catch (e) {
      // ignore fallback errors
    }

    // Always navigate to login
    router.replace("/login");
  } finally {
    logoutInFlight = false;
  }
}
