/**
 * P0_CIRCLE_LIST_SSOT_REFETCH_CONTRACT
 *
 * Single Source of Truth for circle list freshness.
 * All circle-list invalidation triggers must route through this function.
 *
 * Behavior:
 * - Always invalidates circleKeys.all() (marks circle list stale)
 * - Always invalidates circleKeys.unreadCount() (marks unread stale)
 * - Calls opts.refetchCircles() ONLY when reason="friends_focus"
 * - Emits ALWAYS-ON DEV log: [P0_CIRCLE_LIST_REFRESH]
 */

import type { QueryClient } from "@tanstack/react-query";
import { circleKeys } from "@/lib/circleQueryKeys";
import { devLog } from "@/lib/devLog";
import { recordQueryInvalidateReceipt, recordQueryRefetchReceipt } from "@/lib/devQueryReceipt";
import { markTimeline } from "@/lib/devConvergenceTimeline";

export type CircleRefreshReason =
  | "app_active"
  | "friends_focus"
  | "push_member_left"
  | "push_circle_message"
  | "system_member_left_render";

export function refreshCircleListContract(opts: {
  reason: CircleRefreshReason;
  circleId?: string | null;
  queryClient: QueryClient;
  refetchCircles?: (() => void) | null;
}): void {
  const { reason, circleId = null, queryClient, refetchCircles = null } = opts;

  // Always invalidate circle list + unread count
  queryClient.invalidateQueries({ queryKey: circleKeys.all() });
  queryClient.invalidateQueries({ queryKey: circleKeys.unreadCount() });

  // DEV receipts for each invalidation
  if (__DEV__) {
    recordQueryInvalidateReceipt({ queryKeyName: "circleKeys.all", reason, circleId });
    recordQueryInvalidateReceipt({ queryKeyName: "circleKeys.unreadCount", reason, circleId });
    // [P0_TIMELINE] Mark query invalidation
    markTimeline(circleId ?? "circle_list", "query_invalidated");
  }

  // Only actively refetch when on Friends tab focus
  const didRefetch = reason === "friends_focus" && typeof refetchCircles === "function";
  if (didRefetch) {
    refetchCircles!();
    if (__DEV__) {
      recordQueryRefetchReceipt({ queryKeyName: "circleKeys.all", reason: "friends_focus", circleId });
      // [P0_TIMELINE] Mark query refetch
      markTimeline("circle_list", "query_refetched");
    }
  }

  // ALWAYS-ON proof log (not gated by __DEV__ — tag is in ALWAYS_ON_TAG_PREFIXES)
  devLog("[P0_CIRCLE_LIST_REFRESH]", {
    reason,
    circleId,
    didInvalidateAll: true,
    didInvalidateUnread: true,
    didRefetch,
  });
}
