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
 * 6. Clear admin unlock + entitlements + user-scoped local state
 * 7. Navigate to /welcome
 *
 * Safe to call multiple times - idempotent via in-flight guard.
 */

import { QueryClient } from "@tanstack/react-query";
import { Router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { resetSession } from "./authBootstrap";
import { setLogoutIntent } from "./logoutIntent";
import { deactivatePushTokenOnLogout } from "./pushTokenManager";
import { resetPushRegistrationState } from "@/hooks/useNotifications";
import { resetBootAuthority } from "@/hooks/useBootAuthority";
import { devLog, devError } from "./devLog";
import { disableAuthedNetwork } from "./networkAuthGate";
import { resetSessionPaywallTracking } from "./entitlements";
import { clearQueue as clearOfflineQueue } from "./offlineQueue";
import { useOfflineStore } from "./offlineStore";

// Entitlements AsyncStorage cache key (must match entitlements.ts)
const ENTITLEMENTS_CACHE_KEY = "entitlements_cache";

// Admin unlock storage key (must match settings.tsx)
const ADMIN_UNLOCK_KEY = "@oi_admin_unlocked_v1";

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
    devLog(`[P12_NAV_INVAR] action="to_welcome" reason="${reason}" from="${screen}"`);
    devLog("[P0_LOGOUT_DEACTIVATE_ORDER]", { step: 1, label: "start_logout", screen, reason });
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
    // [P0_POST_LOGOUT_NET] IMMEDIATELY disable authed network calls.
    // This is the FIRST action — before any async work — so that
    // still-mounted queries cannot fire /api/entitlements or
    // /api/referral/stats while tokens are being cleared.
    disableAuthedNetwork();

    // Step 1: Deactivate push token (best-effort, never blocks)
    if (__DEV__) {
      devLog("[P0_LOGOUT_DEACTIVATE_ORDER]", { step: 2, label: "deactivate_attempt" });
    }
    let deactivateOk = false;
    try {
      await deactivatePushTokenOnLogout();
      deactivateOk = true;
    } catch (e) {
      // Push token deactivation failure does not block logout
    }
    if (__DEV__) {
      devLog("[P0_LOGOUT_DEACTIVATE_ORDER]", { step: 3, label: "deactivate_done", success: deactivateOk });
    }

    // Step 1b: Reset push registration state so next login re-registers deterministically
    // [P0_PUSH_TWO_ENDED] Clears lastRegisteredUserId + throttle stamp
    try {
      await resetPushRegistrationState();
    } catch (e) {
      // Non-fatal, continue logout
    }

    // Step 2: Set logout intent flag (required for resetSession to clear tokens)
    if (__DEV__) {
      devLog("[P0_LOGOUT_DEACTIVATE_ORDER]", { step: 4, label: "auth_clear_begin" });
    }
    setLogoutIntent();

    // Step 3: Reset session (clear tokens, sign out from backend)
    await resetSession({ reason, endpoint: screen });
    if (__DEV__) {
      devLog("[P0_LOGOUT_DEACTIVATE_ORDER]", { step: 5, label: "auth_cleared" });
    }

    // Step 4: Cancel queries + clear cache
    await queryClient.cancelQueries();
    queryClient.clear();

    // Step 5: Reset boot authority singleton
    resetBootAuthority();

    // Step 6: Clear admin unlock state
    try {
      await AsyncStorage.removeItem(ADMIN_UNLOCK_KEY);
      if (__DEV__) {
        devLog(`[P0_ADMIN_UNLOCK] cleared on logout`);
      }
    } catch (e) {
      // Non-fatal, continue logout
    }

    // Step 6b: Reset entitlements session state
    resetSessionPaywallTracking();
    try {
      await AsyncStorage.removeItem(ENTITLEMENTS_CACHE_KEY);
    } catch (e) {
      // Non-fatal, continue logout
    }

    // Step 6c: Clear user-scoped local state to prevent cross-user leakage.
    // [P7_USER_SCOPING] Offline queue/store, scheduled notifications, nudge flags,
    // ideas personalization, engagement tracking, and dismissal state.
    try {
      // Cancel all scheduled local notifications (event reminders etc.)
      await Notifications.cancelAllScheduledNotificationsAsync();

      // [P9_NOTIF] Clear OS badge count so stale badge doesn't persist for next user
      await Notifications.setBadgeCountAsync(0);

      // Clear offline action queue + local placeholder events/RSVPs
      await clearOfflineQueue();
      useOfflineStore.getState().clearLocalEvents();
      useOfflineStore.getState().clearLocalRsvps();

      // Bulk-remove user-scoped AsyncStorage keys
      await AsyncStorage.multiRemove([
        // Offline
        "offlineQueue:deadLetterCount:v1",
        // Notification reminders map
        "event_reminders",
        // Nudge / dismissal flags
        "firstValueNudge:v1",
        "firstRsvpNudge:v1",
        "secondOrderSocialNudge:v1",
        "postEventRepeatNudge:v2",
        "notification_nudge_count",
        "oi:first_time_hint_dismissed",
        "oi:app_open_count",
        "postValueInvite:lastShownAt",
        "@oi_circle_notif_info_dismissed",
        // Ideas personalization
        "ideasExposureMap",
        "ideasAcceptStats",
        "ideasStatsResetMonth",
        "ideasPatternMemory",
        // User preferences
        "oi_quiet_hours_preset_v1",
        "oi:workSkipDateKeys",
        // Calendar sync
        "calendarSync:calendarId",
        // Engagement tracking
        "app_review_data",
        // Ephemeral state
        "oi:bestTimePick",
      ]);

      if (__DEV__) {
        devLog("[P7_USER_SCOPING] user-scoped local state cleared");
      }
    } catch (e) {
      // Non-fatal, continue logout
      if (__DEV__) {
        devError("[P7_USER_SCOPING] error clearing user state:", e);
      }
    }

    // Step 7: Allow PostHog reset to complete, then navigate to welcome
    if (__DEV__) {
      devLog("[P0_LOGOUT_DEACTIVATE_ORDER]", { step: 7, label: "waiting_for_analytics_reset" });
    }

    // Small delay to ensure PostHog reset useEffect runs before navigation
    await new Promise(resolve => setTimeout(resolve, 50));

    if (__DEV__) {
      devLog("[P0_LOGOUT_DEACTIVATE_ORDER]", { step: 8, label: "routed_to_welcome" });
    }
    router.replace("/welcome");
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

    // Always navigate to welcome
    router.replace("/welcome");
  } finally {
    logoutInFlight = false;
  }
}
