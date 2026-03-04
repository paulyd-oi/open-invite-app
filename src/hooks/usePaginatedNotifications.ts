/**
 * usePaginatedNotifications — cursor-based paginated notifications hook
 *
 * Uses useInfiniteQuery to fetch notifications with cursor pagination.
 * Currently the backend returns all notifications in a single response (no cursor),
 * so the hook gracefully treats the full response as page 1 with no next page.
 * When the backend adds cursor support (`?cursor=X&limit=Y` returning
 * `{ nextCursor }`), this hook will automatically paginate.
 *
 * Tag: [PAGINATION_GROUNDWORK]
 */

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useMemo, useRef, useCallback } from "react";
import { qk } from "@/lib/queryKeys";
import { api } from "@/lib/api";
import type { GetNotificationsResponse, Notification } from "@/shared/contracts";

// ── Response type with optional cursor field ─────────────────────
type PaginatedNotificationsResponse = GetNotificationsResponse & {
  nextCursor?: string;
};

// ── Cap in-memory pages to prevent unbounded growth ──────────────
const MAX_PAGES = 5;

// ── Debounce interval for onEndReached (ms) ──────────────────────
const END_REACHED_DEBOUNCE = 800;

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
      // Build URL with cursor/limit params (backend ignores them until it supports pagination)
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      if (pageParam) {
        params.set("cursor", pageParam);
      }
      const qs = params.toString();
      return api.get<PaginatedNotificationsResponse>(
        `/api/notifications${qs ? `?${qs}` : ""}`,
      );
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // [PERF_SWEEP] Cap in-memory pages to MAX_PAGES to prevent unbounded growth
    select: (data: InfiniteData<PaginatedNotificationsResponse, string | undefined>) => ({
      ...data,
      pages: data.pages.slice(-MAX_PAGES),
      pageParams: data.pageParams.slice(-MAX_PAGES),
    }),
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
    if (now - lastEndReachedRef.current < END_REACHED_DEBOUNCE) return;
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
  };
}
