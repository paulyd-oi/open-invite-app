/**
 * Hook to fetch personalized suggestions feed.
 * Used for the Suggestions tab in Friends screen and suggestions screen.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { type GetSuggestionsFeedResponse } from "@/shared/contracts";

// Query keys
export const SUGGESTIONS_FEED_QUERY_KEY = ["suggestions", "feed"];

/**
 * Fetch personalized suggestions feed.
 * Returns various suggestion types: JOIN_EVENT, NUDGE_CREATE, NUDGE_INVITE, RECONNECT_FRIEND, HOT_AREA
 * 
 * Features:
 * - 60s staleTime for reasonable freshness
 * - Refetch on window focus
 * - Graceful error handling (returns empty array on error)
 */
export function useSuggestionsFeed() {
  const { status: bootStatus } = useBootAuthority();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: SUGGESTIONS_FEED_QUERY_KEY,
    queryFn: async () => {
      try {
        return await api.get<GetSuggestionsFeedResponse>("/api/suggestions/feed");
      } catch (err) {
        // Graceful fallback - return empty suggestions on error
        console.warn("[useSuggestionsFeed] Error fetching suggestions:", err);
        return { suggestions: [] };
      }
    },
    enabled: bootStatus === "authed",
    staleTime: 60000, // 60 seconds
    refetchOnWindowFocus: true,
  });

  return {
    suggestions: data?.suggestions ?? [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
}
