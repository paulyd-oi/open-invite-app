/**
 * Loading Invariant: loadedOnce discipline
 *
 * INVARIANT: Once data has successfully loaded, the UI must never regress
 * to an empty loading state during refetch. Previous data is preserved
 * and a subtle refetch indicator is shown instead.
 *
 * Monotonic contract: empty → loaded → never empty again (unless unmount).
 *
 * Tag: [P1_LOADING_INV]
 */

import { useRef } from "react";
import { devLog } from "./devLog";

const TAG = "[P1_LOADING_INV]";

/**
 * Minimal interface matching React Query result fields.
 * Works with useQuery, useInfiniteQuery, or hand-constructed objects.
 */
interface QueryLike {
  isLoading: boolean;
  isFetching: boolean;
  isSuccess: boolean;
  data?: unknown;
}

export interface LoadedOnceResult {
  /** True only during the very first load (before any data has arrived). */
  showInitialLoading: boolean;
  /** True when refetching after first successful load — show subtle indicator. */
  showRefetchIndicator: boolean;
  /** Whether data has successfully loaded at least once in this mount. */
  hasLoadedOnce: boolean;
}

/**
 * Enforces the loadedOnce invariant for a single query result.
 *
 * Usage:
 *   const { showInitialLoading, showRefetchIndicator } = useLoadedOnce(eventQuery, "event-detail");
 *   if (showInitialLoading) return <Skeleton />;
 *   // render data — showRefetchIndicator drives subtle spinner
 */
export function useLoadedOnce(
  queryResult: QueryLike,
  debugLabel?: string,
): LoadedOnceResult {
  const hasLoadedRef = useRef(false);

  // Latch: once data has successfully loaded, never reset within this mount
  if (queryResult.isSuccess && queryResult.data !== undefined) {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      if (__DEV__) {
        devLog(TAG, "loaded_once ✓", { label: debugLabel });
      }
    }
  }

  const hasLoadedOnce = hasLoadedRef.current;

  return {
    showInitialLoading: !hasLoadedOnce && queryResult.isLoading,
    showRefetchIndicator: hasLoadedOnce && queryResult.isFetching,
    hasLoadedOnce,
  };
}
