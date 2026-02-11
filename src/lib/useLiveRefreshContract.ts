/**
 * useLiveRefreshContract — SSOT "live feel" refresh for tab screens.
 *
 * Provides three refresh triggers that every main tab screen should wire:
 *   1. Manual pull-to-refresh  (visible spinner, immediate refetch)
 *   2. Foreground resume       (AppState background→active, throttled 2 s)
 *   3. Tab focus               (Expo Router focus, quiet invalidation)
 *
 * Storm guard:
 *   - Per-screen inFlight latch prevents foreground/focus from stacking.
 *   - 10 s max-duration fail-safe auto-releases the latch.
 *   - Manual refresh always wins: clears the latch & fires immediately.
 *
 * Canonical DEV log tag: [LIVE_REFRESH]  [LIVE_REFRESH_GUARD]
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
import { devLog, devWarn } from "@/lib/devLog";
import {
  reportRefresh,
  registerScreenRefetchFns,
  resetFocusCounter,
} from "@/lib/liveRefreshProofStore";

// ── Constants ────────────────────────────────────────────────────
/** Max time (ms) the inFlight latch can stay locked before auto-release. */
const IN_FLIGHT_MAX_MS = 10_000;

/** Min ms between focus triggers on the same screen. */
const FOCUS_THROTTLE_MS = 2000;

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

  // ── Storm guard: per-screen inFlight latch ──
  const inFlightRef = useRef(false);
  const inFlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Mark in-flight with a fail-safe auto-release after IN_FLIGHT_MAX_MS. */
  const setInFlight = useCallback(() => {
    inFlightRef.current = true;
    // Clear any prior fail-safe timer
    if (inFlightTimerRef.current) clearTimeout(inFlightTimerRef.current);
    inFlightTimerRef.current = setTimeout(() => {
      if (__DEV__ && inFlightRef.current) {
        devLog("[LIVE_REFRESH_GUARD]", screenRef.current, "failsafe_release", `after=${IN_FLIGHT_MAX_MS}ms`);
      }
      inFlightRef.current = false;
      inFlightTimerRef.current = null;
    }, IN_FLIGHT_MAX_MS);
  }, []);

  /** Clear in-flight latch and cancel fail-safe timer. */
  const clearInFlight = useCallback(() => {
    inFlightRef.current = false;
    if (inFlightTimerRef.current) {
      clearTimeout(inFlightTimerRef.current);
      inFlightTimerRef.current = null;
    }
  }, []);

  // Focus throttle
  const lastFocusRef = useRef(0);

  // Cleanup fail-safe timer on unmount
  useEffect(() => {
    return () => {
      if (inFlightTimerRef.current) clearTimeout(inFlightTimerRef.current);
    };
  }, []);

  // ── helpers ──
  const fireAll = useCallback((trigger: "manual" | "foreground" | "focus", reason: string) => {
    const fns = fnsRef.current;
    if (__DEV__) {
      devLog(
        "[LIVE_REFRESH_GUARD]",
        `screen=${screenRef.current}`,
        `trigger=${trigger}`,
        `outcome=run`,
        `keys=${fns.length}`,
      );
      // Report into proof store + check anti-storm
      const { stormWarning } = reportRefresh(screenRef.current, trigger);
      if (stormWarning) {
        devWarn("[LIVE_REFRESH]", stormWarning);
      }
    }
    fns.forEach((fn) => {
      try {
        fn();
      } catch {
        // individual refetch failures are handled by React Query
      }
    });
  }, []);

  // ── DEV proof harness: register refetch fns for "Force refresh all" button ──
  useEffect(() => {
    if (__DEV__) {
      registerScreenRefetchFns(screenRef.current, fnsRef.current);
    }
  });

  // ── 1. Manual pull-to-refresh (always wins) ──
  const onManualRefresh = useCallback(() => {
    // Manual always wins: clear any in-flight latch and fire immediately
    clearInFlight();
    setIsRefreshing(true);
    setInFlight();
    fireAll("manual", "user_pull");
    // Allow spinner for a visible minimum then clear.
    // React Query will keep stale data visible (placeholderData) so no flash.
    setTimeout(() => {
      setIsRefreshing(false);
      clearInFlight();
    }, 800);
  }, [fireAll, setInFlight, clearInFlight]);

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
            devLog("[LIVE_REFRESH_GUARD]", `screen=${screenRef.current}`, "trigger=foreground", "outcome=skip_throttle");
          }
          return;
        }
        // Storm guard: skip if a refresh is already in-flight
        if (inFlightRef.current) {
          if (__DEV__) {
            devLog("[LIVE_REFRESH_GUARD]", `screen=${screenRef.current}`, "trigger=foreground", "outcome=skip_inflight");
          }
          return;
        }
        lastForegroundRef.current = now;
        setInFlight();
        fireAll("foreground", "app_resumed");
        // Release latch after a short window (queries are async but fire-and-forget)
        setTimeout(() => clearInFlight(), 3000);
      }
    };

    const subscription = AppState.addEventListener("change", handleChange);
    return () => subscription.remove();
  }, [disableForeground, foregroundThrottleMs, fireAll, setInFlight, clearInFlight]);

  // ── 3. Focus (tab navigation) ──
  useFocusEffect(
    useCallback(() => {
      if (disableFocus) return;

      const now = Date.now();
      // Throttle focus triggers (prevents spam on rapid tab switching)
      if (now - lastFocusRef.current < FOCUS_THROTTLE_MS) {
        if (__DEV__) {
          devLog("[LIVE_REFRESH_GUARD]", `screen=${screenRef.current}`, "trigger=focus", "outcome=skip_throttle");
        }
        return;
      }
      // Storm guard: skip if a refresh is already in-flight
      if (inFlightRef.current) {
        if (__DEV__) {
          devLog("[LIVE_REFRESH_GUARD]", `screen=${screenRef.current}`, "trigger=focus", "outcome=skip_inflight");
        }
        return;
      }
      lastFocusRef.current = now;
      setInFlight();
      fireAll("focus", "tab_focused");
      // Release latch after a short window
      setTimeout(() => clearInFlight(), 3000);

      // Cleanup: reset focus counter when screen blurs
      return () => {
        if (__DEV__) resetFocusCounter(screenRef.current);
      };
    }, [disableFocus, fireAll, setInFlight, clearInFlight]),
  );

  return { isRefreshing, onManualRefresh };
}
