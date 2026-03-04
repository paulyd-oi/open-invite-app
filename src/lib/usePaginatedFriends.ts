/**
 * usePaginatedFriends — cursor-based paginated friends hook
 *
 * Uses useInfiniteQuery with GET /api/friends/paginated (cursor + limit).
 * Backend returns { friends, nextCursor } with friendship.id desc ordering.
 *
 * Tag: [P1_FRIENDS_PAGINATION]
 */

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useMemo, useRef, useCallback } from "react";
import { friendKeys } from "@/lib/refreshAfterMutation";
import { api } from "@/lib/api";
import { track, AnalyticsEvent } from "@/analytics/analyticsEventsSSOT";
import { capInfinitePages, DEFAULT_MAX_PAGES, DEFAULT_ENDREACHED_DEBOUNCE_MS } from "@/lib/infiniteQuerySSOT";
import type { GetFriendsResponse, Friendship } from "@/shared/contracts";

// ── Response type with cursor field from /api/friends/paginated ──
type PaginatedFriendsResponse = GetFriendsResponse & {
  nextCursor?: string | null;
};

// ── Hook params ──────────────────────────────────────────────────
interface UsePaginatedFriendsParams {
  /** Pass false to disable the query (e.g. not yet authed) */
  enabled: boolean;
  /** Items per page — forwarded to GET /api/friends/paginated */
  pageSize?: number;
}

// ── Hook ─────────────────────────────────────────────────────────
export function usePaginatedFriends({
  enabled,
  pageSize = 50,
}: UsePaginatedFriendsParams) {
  const lastEndReachedRef = useRef(0);

  const query = useInfiniteQuery<
    PaginatedFriendsResponse,
    Error,
    InfiniteData<PaginatedFriendsResponse>,
    ReturnType<typeof friendKeys.paginated>,
    string | undefined
  >({
    queryKey: friendKeys.paginated(pageSize),
    queryFn: async ({ pageParam }) => {
      // [P1_FRIENDS_PAGINATION] Cursor-paginated friends endpoint
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      if (pageParam) {
        params.set("cursor", pageParam);
      }
      const qs = params.toString();
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(`[P1_FRIENDS_PAGINATION] fetch page cursor=${pageParam ?? "initial"} limit=${pageSize}`);
      }
      const result = await api.get<PaginatedFriendsResponse>(
        `/api/friends/paginated?${qs}`,
      );
      track(AnalyticsEvent.FRIENDS_PAGE_LOADED, {
        pageSize,
        hasNextPage: !!result.nextCursor,
        countLoaded: result.friends?.length ?? 0,
      });
      return result;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // [INFINITE_QUERY_SSOT] Cap in-memory pages via SSOT helper
    select: (data) => capInfinitePages(data, DEFAULT_MAX_PAGES),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min — friends list is stable
    gcTime: 10 * 60 * 1000, // 10 min garbage collection
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Flatten all pages into a single friends array
  const data = useMemo((): Friendship[] => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((page) => page.friends ?? []);
  }, [query.data?.pages]);

  // Debounced onEndReached handler for FlatList
  const onEndReached = useCallback(() => {
    const now = Date.now();
    if (now - lastEndReachedRef.current < DEFAULT_ENDREACHED_DEBOUNCE_MS) return;
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    lastEndReachedRef.current = now;
    query.fetchNextPage();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  return {
    /** Flattened friends array across all loaded pages */
    data,
    /** Debounced end-reached handler — wire to FlatList.onEndReached */
    onEndReached,
    /** Fetch the next page (no-op if !hasNextPage) */
    fetchNextPage: query.fetchNextPage,
    /** Whether more pages are available */
    hasNextPage: query.hasNextPage ?? false,
    /** True during initial load (no data yet) */
    isLoading: query.isLoading,
    /** True while fetching the next page */
    isFetchingNextPage: query.isFetchingNextPage,
    /** Refetch all pages from scratch */
    refetch: query.refetch,
    /** True while any refetch is in-flight */
    isRefetching: query.isRefetching,
  };
}
