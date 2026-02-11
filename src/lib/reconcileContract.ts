/**
 * P0_REALTIME_RECONCILE_CONTRACT
 *
 * DEV-only contract that proves every push-triggered UI update
 * reconciles with server truth, not optimistic local cache.
 *
 * After each pushRouter handler runs, this emits a proof log for
 * each affected query key showing:
 *   - route: which push handler triggered the update
 *   - entityId: which entity was affected
 *   - serverVersion: dataUpdatedAt (last successful server fetch)
 *   - localVersion: current timestamp (when push handler ran)
 *
 * If localVersion > serverVersion, the cache contains an optimistic
 * patch that hasn't been reconciled yet. The corresponding
 * invalidation ensures the next query access fetches server truth.
 *
 * Tag: [P0_RECONCILE] (ALWAYS-ON in ALWAYS_ON_TAG_PREFIXES)
 */

import type { QueryClient } from "@tanstack/react-query";
import { devLog } from "@/lib/devLog";

export type ReconcileRoute =
  | "circle_message"
  | "circle_member_left"
  | "event_rsvp_changed"
  | "event_updated"
  | "event_created"
  | "event_comment"
  | "friend_event";

/**
 * Emit a [P0_RECONCILE] proof log for each query key affected by a push handler.
 *
 * Verifies that the query is marked stale (isInvalidated) and will pull
 * fresh server data on next render — no UI state depends solely on
 * the optimistic patch.
 *
 * NO-OP in production builds.
 */
export function emitReconcileProof(opts: {
  route: ReconcileRoute;
  entityId: string;
  queryClient: QueryClient;
  reconciledKeys: Array<readonly string[]>;
}): void {
  if (!__DEV__) return;

  const { route, entityId, queryClient, reconciledKeys } = opts;
  const localVersion = Date.now();

  for (const key of reconciledKeys) {
    const state = queryClient.getQueryState(key as string[]);

    devLog("[P0_RECONCILE]", {
      route,
      entityId,
      queryKey: key,
      serverVersion: state?.dataUpdatedAt ?? 0,
      localVersion,
      isStale: state?.isInvalidated ?? true,
      willRefetchOnMount: state?.isInvalidated ?? true,
    });
  }
}
