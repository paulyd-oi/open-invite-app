/**
 * usePaginatedNotifications — cursor-based paginated notifications hook
 *
 * Uses useInfiniteQuery to fetch notifications from
 * GET /api/notifications/paginated with cursor + limit params.
 * Backend returns { notifications, nextCursor, unreadCount }.
 *
 * Tag: [P1_NOTIFS_PAGINATED]
 */

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useMemo, useRef, useCallback } from "react";
import { qk } from "@/lib/queryKeys";
import { api } from "@/lib/api";
import { capInfinitePages, DEFAULT_MAX_PAGES, DEFAULT_ENDREACHED_DEBOUNCE_MS } from "@/lib/infiniteQuerySSOT";
import type { GetNotificationsResponse, Notification } from "@/shared/contracts";
import { devLog } from "@/lib/devLog";
import { trackNotificationsPageLoaded } from "@/analytics/analyticsEventsSSOT";

// ── Response type with optional cursor field ─────────────────────
type PaginatedNotificationsResponse = GetNotificationsResponse & {
  nextCursor?: string;
};

// ── Hook params ──────────────────────────────────────────────────
interface UsePaginatedNotificationsParams {
  /** Pass false to disable the query (e.g. not yet authed) */
  enabled: boolean;
  /** Items per page — forwarded to backend when cursor support lands */
  pageSize?: number;
}

// ── Hook ─────────────────────────────────────────────────────────
export function usePaginatedNotifications({
  enabled,
  pageSize = 30,
}: UsePaginatedNotificationsParams) {
  const lastEndReachedRef = useRef(0);

  const queryKey = useMemo(
    () => [...qk.notifications(), { pageSize }] as const,
    [pageSize],
  );

  const query = useInfiniteQuery<
    PaginatedNotificationsResponse,
    Error,
    InfiniteData<PaginatedNotificationsResponse>,
    readonly ["notifications", { pageSize: number }],
    string | undefined
  >({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      if (pageParam) {
        params.set("cursor", pageParam);
      }
      const qs = params.toString();
      const result = await api.get<PaginatedNotificationsResponse>(
        `/api/notifications/paginated${qs ? `?${qs}` : ""}`,
      );
      // [P1_NOTIFS_PAGINATED] telemetry after each page fetch
      const count = result.notifications?.length ?? 0;
      const hasNext = !!result.nextCursor;
      if (__DEV__) devLog("[P1_NOTIFS_PAGINATED]", { pageSize, count, hasNext });
      trackNotificationsPageLoaded({ pageSize, countLoaded: count, hasNextPage: hasNext });
      return result;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // [INFINITE_QUERY_SSOT] Cap in-memory pages via SSOT helper
    select: (data) => capInfinitePages(data, DEFAULT_MAX_PAGES),
    enabled,
    staleTime: 30_000, // 30s — match existing staleTime
  });

  // Flatten + deduplicate all pages into a single notifications array
  const notifications = useMemo((): Notification[] => {
    if (!query.data?.pages) return [];
    const all = query.data.pages.flatMap((page) => page.notifications ?? []);
    // Defensive de-dupe (same as ActivityFeed)
    return Array.from(new Map(all.map((n) => [n.id, n])).values());
  }, [query.data?.pages]);

  // Unread count from the first (most recent) page
  const unreadCount = query.data?.pages?.[0]?.unreadCount ?? 0;

  // Debounced onEndReached handler for FlatList
  const onEndReached = useCallback(() => {
    const now = Date.now();
    if (now - lastEndReachedRef.current < DEFAULT_ENDREACHED_DEBOUNCE_MS) return;
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    lastEndReachedRef.current = now;
    query.fetchNextPage();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  return {
    /** Flattened + deduplicated notifications array across all loaded pages */
    notifications,
    /** Unread count from the latest page */
    unreadCount,
    /** Debounced end-reached handler — wire to FlatList.onEndReached */
    onEndReached,
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
    /** True if initial fetch failed */
    isError: query.isError,
  };
}
