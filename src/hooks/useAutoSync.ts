/**
 * useAutoSync Hook
 *
 * Automatically triggers daily calendar sync for Pro users when the app becomes active.
 * Non-blocking: runs in background, won't disrupt user experience.
 */

import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { performAutoSync, isAutoSyncDue } from "@/lib/autoSync";
import { devLog, devWarn, devError } from "@/lib/devLog";

interface UseAutoSyncOptions {
  enabled?: boolean; // Default: true
  isPro?: boolean; // Pro status (required)
}

/**
 * Auto-sync hook for Pro users
 *
 * Usage:
 * ```tsx
 * const { isPro } = useSubscription();
 * useAutoSync({ isPro });
 * ```
 *
 * Behavior:
 * - Only runs for Pro users
 * - Checks if sync is due (24 hours since last sync)
 * - Triggers sync when app becomes active
 * - Non-blocking: doesn't show loading states
 * - Silently handles errors (logs to console)
 */
export function useAutoSync(options: UseAutoSyncOptions = {}) {
  const { enabled = true, isPro = false } = options;
  const appState = useRef(AppState.currentState);
  const syncInProgress = useRef(false);

  useEffect(() => {
    // Only set up listener if enabled and user is Pro
    if (!enabled || !isPro) {
      return;
    }

    // Check if sync is needed when hook mounts (app just opened)
    checkAndSync();

    // Listen for app state changes (background → active)
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [enabled, isPro]);

  async function checkAndSync() {
    // Don't sync if already in progress
    if (syncInProgress.current) {
      return;
    }

    try {
      // Check if sync is due before attempting
      const isDue = await isAutoSyncDue();
      if (!isDue) {
        return;
      }

      syncInProgress.current = true;

      // Perform sync in background (non-blocking)
      const result = await performAutoSync({ isPro });

      if (result.synced && result.success) {
        devLog(
          `[AutoSync] Synced successfully: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`
        );
      } else if (result.error) {
        devLog(`[AutoSync] Skipped: ${result.error}`);
      }
    } catch (error) {
      devError("[AutoSync] Error during sync check:", error);
    } finally {
      syncInProgress.current = false;
    }
  }

  function handleAppStateChange(nextAppState: AppStateStatus) {
    // Only trigger sync when coming back to foreground
    if (appState.current.match(/inactive|background/) && nextAppState === "active") {
      checkAndSync();
    }
    appState.current = nextAppState;
  }

  return {
    // Expose manual trigger in case user wants to force sync
    triggerSync: () => performAutoSync({ isPro, forceSync: true }),
  };
}
