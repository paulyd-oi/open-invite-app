/**
 * usePaginatedFriends — cursor-based paginated friends hook
 *
 * Uses useInfiniteQuery to fetch friends with cursor pagination.
 * Currently the backend returns all friends in a single response (no cursor),
 * so the hook gracefully treats the full response as page 1 with no next page.
 * When the backend adds cursor support (`?cursor=X&limit=Y` returning
 * `{ friends, nextCursor }`), this hook will automatically paginate.
 *
 * Tag: [PAGINATION_GROUNDWORK]
 */

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useMemo } from "react";
import { friendKeys } from "@/lib/refreshAfterMutation";
import { api } from "@/lib/api";
import type { GetFriendsResponse, Friendship } from "@/shared/contracts";

// ── Response type with optional cursor field ─────────────────────
type PaginatedFriendsResponse = GetFriendsResponse & {
  nextCursor?: string;
};

// ── Hook params ──────────────────────────────────────────────────
interface UsePaginatedFriendsParams {
  /** Pass false to disable the query (e.g. not yet authed) */
  enabled: boolean;
  /** Items per page — forwarded to backend when cursor support lands */
  pageSize?: number;
}

// ── Hook ─────────────────────────────────────────────────────────
export function usePaginatedFriends({
  enabled,
  pageSize = 20,
}: UsePaginatedFriendsParams) {
  const query = useInfiniteQuery<
    PaginatedFriendsResponse,
    Error,
    InfiniteData<PaginatedFriendsResponse>,
    ReturnType<typeof friendKeys.paginated>,
    string | undefined
  >({
    queryKey: friendKeys.paginated(pageSize),
    queryFn: async ({ pageParam }) => {
      // Build URL with cursor/limit params (backend ignores them until it supports pagination)
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      if (pageParam) {
        params.set("cursor", pageParam);
      }
      const qs = params.toString();
      return api.get<PaginatedFriendsResponse>(
        `/api/friends${qs ? `?${qs}` : ""}`,
      );
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
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

  return {
    /** Flattened friends array across all loaded pages */
    data,
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
