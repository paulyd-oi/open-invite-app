/**
 * infiniteQuerySSOT — SSOT constants and helpers for infinite queries.
 *
 * All infinite-scroll screens MUST import page-cap and debounce values
 * from here so behaviour stays consistent and tuneable from one place.
 *
 * Tag: [INFINITE_QUERY_SSOT]
 */

import type { InfiniteData } from "@tanstack/react-query";

// ── Tuning knobs (change here, applies everywhere) ──────────────
/** Maximum pages kept in React-Query cache per infinite query. */
export const DEFAULT_MAX_PAGES = 5;

/** Minimum interval (ms) between onEndReached / scroll-triggered fetches. */
export const DEFAULT_ENDREACHED_DEBOUNCE_MS = 800;

// ── Page-cap helper ─────────────────────────────────────────────
/**
 * Returns a new InfiniteData with only the last `maxPages` pages retained.
 * Use inside `select` of useInfiniteQuery to prevent unbounded memory growth.
 *
 * @example
 * select: (data) => capInfinitePages(data, DEFAULT_MAX_PAGES),
 */
export function capInfinitePages<TData, TPageParam>(
  data: InfiniteData<TData, TPageParam>,
  maxPages: number = DEFAULT_MAX_PAGES,
): InfiniteData<TData, TPageParam> {
  return {
    ...data,
    pages: data.pages.slice(-maxPages),
    pageParams: data.pageParams.slice(-maxPages),
  };
}
