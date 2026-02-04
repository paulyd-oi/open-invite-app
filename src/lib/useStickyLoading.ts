/**
 * useStickyBoolean - Prevent loading state flicker
 *
 * Delays false→true transitions to avoid rapid toggles that cause visual jitter.
 * Use for isLoading states that control skeleton/spinner visibility.
 *
 * IMPORTANT: Only apply to visible UX elements (spinners, skeletons).
 * Do NOT use for query enabled conditions or data gates.
 */

import { useState, useEffect, useRef } from "react";
import { devLog } from "./devLog";

// Default sticky duration (ms) - prevents flicker on fast refetches
const DEFAULT_STICKY_MS = 300;

/**
 * Hook that delays false→true transitions on a boolean value.
 * 
 * When input goes false→true quickly (within stickyMs), the output stays true
 * to prevent visual flicker. When input goes true→false, output follows immediately.
 *
 * @param value - The raw boolean (e.g., isLoading from react-query)
 * @param stickyMs - Minimum time (ms) to hold false before allowing true
 * @param debugTag - Optional tag for DEV logging
 */
export function useStickyLoading(
  value: boolean,
  stickyMs: number = DEFAULT_STICKY_MS,
  debugTag?: string
): boolean {
  const [stickyValue, setStickyValue] = useState(value);
  const lastFalseTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (value) {
      // value is true (loading started)
      // Check if we should delay showing loading state
      const timeSinceLastFalse = Date.now() - lastFalseTimeRef.current;
      
      if (lastFalseTimeRef.current > 0 && timeSinceLastFalse < stickyMs) {
        // Too soon after last false - delay the transition
        const remainingMs = stickyMs - timeSinceLastFalse;
        
        if (__DEV__ && debugTag) {
          devLog(`[P1_JITTER] ${debugTag} sticky: delaying true by ${remainingMs}ms`);
        }
        
        timerRef.current = setTimeout(() => {
          setStickyValue(true);
          timerRef.current = null;
        }, remainingMs);
      } else {
        // Enough time has passed or first render - show loading immediately
        setStickyValue(true);
      }
    } else {
      // value is false (loading ended)
      // Transition immediately and record the time
      lastFalseTimeRef.current = Date.now();
      setStickyValue(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, stickyMs, debugTag]);

  return stickyValue;
}

/**
 * Combine multiple loading states with sticky behavior.
 * Returns true if ANY input is true, with sticky delay on false→true.
 */
export function useStickyLoadingCombined(
  values: boolean[],
  stickyMs: number = DEFAULT_STICKY_MS,
  debugTag?: string
): boolean {
  const combinedValue = values.some(Boolean);
  return useStickyLoading(combinedValue, stickyMs, debugTag);
}
