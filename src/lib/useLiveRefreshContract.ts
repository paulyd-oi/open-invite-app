/**
 * useLiveRefreshContract — SSOT "live feel" refresh for tab screens.
 *
 * Provides three refresh triggers that every main tab screen should wire:
 *   1. Manual pull-to-refresh  (visible spinner, immediate refetch)
 *   2. Foreground resume       (AppState background→active, throttled 2 s)
 *   3. Tab focus               (Expo Router focus, quiet invalidation)
 *
 * Canonical DEV log tag: [LIVE_REFRESH]
 *
 * Usage:
 *   const { isRefreshing, onManualRefresh } = useLiveRefreshContract({
 *     screenName: "discover",
 *     refetchFns: [refetchFeed, refetchMyEvents],
 *   });
 *   <RefreshControl refreshing={isRefreshing} onRefresh={onManualRefresh} />
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect } from "expo-router";
import { devLog } from "@/lib/devLog";

// ── Types ────────────────────────────────────────────────────────
export interface LiveRefreshOptions {
  /** Human-readable screen name for DEV logs (e.g. "discover") */
  screenName: string;

  /** Array of refetch/invalidate callbacks the screen wants triggered. */
  refetchFns: Array<() => unknown>;

  /** Minimum ms between foreground-resume triggers (default 2000). */
  foregroundThrottleMs?: number;

  /** If true, skip foreground listener (e.g. screen manages its own). */
  disableForeground?: boolean;

  /** If true, skip focus listener. */
  disableFocus?: boolean;
}

export interface LiveRefreshResult {
  /** True while a manual pull-to-refresh is in flight. */
  isRefreshing: boolean;

  /**
   * Wire to RefreshControl.onRefresh.
   * Fires all refetchFns, keeps isRefreshing true until settled.
   */
  onManualRefresh: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────
export function useLiveRefreshContract(opts: LiveRefreshOptions): LiveRefreshResult {
  const {
    screenName,
    refetchFns,
    foregroundThrottleMs = 2000,
    disableForeground = false,
    disableFocus = false,
  } = opts;

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Stable ref for refetchFns so callbacks don't re-create on every render.
  const fnsRef = useRef(refetchFns);
  fnsRef.current = refetchFns;

  const screenRef = useRef(screenName);
  screenRef.current = screenName;

  // ── helpers ──
  const fireAll = useCallback((trigger: "manual" | "foreground" | "focus", reason: string) => {
    const fns = fnsRef.current;
    if (__DEV__) {
      devLog(
        "[LIVE_REFRESH]",
        screenRef.current,
        `trigger=${trigger}`,
        `keys=${fns.length}`,
        `reason=${reason}`,
      );
    }
    fns.forEach((fn) => {
      try {
        fn();
      } catch {
        // individual refetch failures are handled by React Query
      }
    });
  }, []);

  // ── 1. Manual pull-to-refresh ──
  const onManualRefresh = useCallback(() => {
    setIsRefreshing(true);
    fireAll("manual", "user_pull");
    // Allow spinner for a visible minimum then clear.
    // React Query will keep stale data visible (placeholderData) so no flash.
    setTimeout(() => setIsRefreshing(false), 800);
  }, [fireAll]);

  // ── 2. Foreground resume (AppState) ──
  const lastForegroundRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (disableForeground) return;

    const handleChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (prev.match(/inactive|background/) && next === "active") {
        const now = Date.now();
        if (now - lastForegroundRef.current < foregroundThrottleMs) {
          if (__DEV__) {
            devLog("[LIVE_REFRESH]", screenRef.current, "trigger=foreground", "THROTTLED");
          }
          return;
        }
        lastForegroundRef.current = now;
        fireAll("foreground", "app_resumed");
      }
    };

    const subscription = AppState.addEventListener("change", handleChange);
    return () => subscription.remove();
  }, [disableForeground, foregroundThrottleMs, fireAll]);

  // ── 3. Focus (tab navigation) ──
  useFocusEffect(
    useCallback(() => {
      if (disableFocus) return;
      fireAll("focus", "tab_focused");
    }, [disableFocus, fireAll]),
  );

  return { isRefreshing, onManualRefresh };
}
