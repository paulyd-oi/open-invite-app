/**
 * DEV-only query invalidation/refetch receipt helpers.
 * Wraps recordPushReceipt with kind="query_invalidate" | "query_refetch".
 *
 * Tag: [P0_PUSH_TWO_ENDED]
 * NO-OP in production builds.
 */

import { recordPushReceipt } from "@/lib/push/pushReceiptStore";

interface QueryReceiptOpts {
  queryKeyName: string;
  reason: string;
  circleId?: string | null;
  eventId?: string | null;
  extra?: Record<string, unknown>;
}

export function recordQueryInvalidateReceipt(opts: QueryReceiptOpts): void {
  if (!__DEV__) return;
  const { queryKeyName, reason, circleId = null, eventId = null, extra } = opts;
  recordPushReceipt("query_invalidate", "system", {
    queryKeyName,
    reason,
    ...(circleId ? { circleId } : {}),
    ...(eventId ? { eventId } : {}),
    ...extra,
  });
}

export function recordQueryRefetchReceipt(opts: QueryReceiptOpts): void {
  if (!__DEV__) return;
  const { queryKeyName, reason, circleId = null, eventId = null, extra } = opts;
  recordPushReceipt("query_refetch", "system", {
    queryKeyName,
    reason,
    ...(circleId ? { circleId } : {}),
    ...(eventId ? { eventId } : {}),
    ...extra,
  });
}
