/**
 * Loading Timeout Hook
 * 
 * Provides a degraded mode flag after a timeout period when loading takes too long.
 * Used to prevent "stuck" screens and give users escape routes.
 * 
 * Usage:
 *   const { isTimedOut, reset } = useLoadingTimeout(bootStatus === 'loading', 3000);
 *   
 *   if (bootStatus === 'loading' && !isTimedOut) return <LoadingUI />;
 *   if (bootStatus === 'loading' && isTimedOut) return <DegradedUI onRetry={reset} />;
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseLoadingTimeoutOptions {
  /** Timeout in milliseconds before showing degraded UI (default: 3000ms) */
  timeout?: number;
}

interface UseLoadingTimeoutResult {
  /** True when loading has exceeded timeout threshold */
  isTimedOut: boolean;
  /** Reset the timeout - call when retrying */
  reset: () => void;
}

export function useLoadingTimeout(
  isLoading: boolean,
  options?: UseLoadingTimeoutOptions
): UseLoadingTimeoutResult {
  const { timeout = 3000 } = options ?? {};
  const [isTimedOut, setIsTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any existing timer
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Reset timeout state and timer
  const reset = useCallback(() => {
    clearTimer();
    setIsTimedOut(false);
  }, [clearTimer]);

  useEffect(() => {
    // If loading and not already timed out, start timer
    if (isLoading && !isTimedOut) {
      clearTimer();
      timerRef.current = setTimeout(() => {
        setIsTimedOut(true);
        if (__DEV__) {
          console.log('[LoadingTimeout] Timeout reached - entering degraded mode');
        }
      }, timeout);
    }

    // If no longer loading, reset timeout state
    if (!isLoading) {
      clearTimer();
      setIsTimedOut(false);
    }

    return clearTimer;
  }, [isLoading, isTimedOut, timeout, clearTimer]);

  return { isTimedOut, reset };
}
