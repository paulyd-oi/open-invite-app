/**
 * Hook to track unseen notification count.
 * Used for badge display on Activity pill in Friends screen.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";
import { useBootAuthority } from "@/hooks/useBootAuthority";

// Query keys
export const UNSEEN_COUNT_QUERY_KEY = ["notifications", "unseenCount"];
export const NOTIFICATIONS_QUERY_KEY = ["notifications"];

interface UnseenCountResponse {
  count: number;
}

interface MarkAllSeenResponse {
  ok: boolean;
  marked: number;
}

/**
 * Fetch unseen notification count.
 * Lightweight endpoint for badge display.
 */
export function useUnseenNotificationCount() {
  const { status: bootStatus } = useBootAuthority();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: UNSEEN_COUNT_QUERY_KEY,
    queryFn: () => api.get<UnseenCountResponse>("/api/notifications/unseen-count"),
    enabled: bootStatus === "authed",
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every 60 seconds for badge freshness
    refetchIntervalInBackground: false, // Only refetch when app is active
  });

  const unseenCount = data?.count ?? 0;

  // Optimistic setter for immediate badge clear
  const setUnseenCountOptimistic = useCallback((count: number) => {
    queryClient.setQueryData<UnseenCountResponse>(UNSEEN_COUNT_QUERY_KEY, { count });
  }, [queryClient]);

  return {
    unseenCount,
    isLoading,
    refetch,
    setUnseenCountOptimistic,
  };
}

/**
 * Hook to mark all notifications as seen.
 * Returns a function that optimistically clears the badge and calls backend.
 */
export function useMarkAllNotificationsSeen() {
  const queryClient = useQueryClient();

  const markAllSeen = useCallback(async () => {
    // Optimistically set count to 0 immediately (Instagram-style)
    queryClient.setQueryData<UnseenCountResponse>(UNSEEN_COUNT_QUERY_KEY, { count: 0 });

    // Optimistically update notifications list to mark all as seen
    queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, (old: any) => {
      if (!old?.notifications) return old;
      return {
        ...old,
        notifications: old.notifications.map((n: any) => ({ ...n, seen: true })),
        unreadCount: 0,
      };
    });

    try {
      // Call backend to mark all as seen
      await api.post<MarkAllSeenResponse>("/api/notifications/mark-all-seen", {});
      
      // Invalidate both queries to refresh data from server
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNSEEN_COUNT_QUERY_KEY });
    } catch (error) {
      // On error, re-invalidate to restore true state (no scary error shown)
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNSEEN_COUNT_QUERY_KEY });
      if (__DEV__) {
        console.log("[useMarkAllNotificationsSeen] Failed to mark all seen:", error);
      }
    }
  }, [queryClient]);

  return { markAllSeen };
}
