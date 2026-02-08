/**
 * Circle API helpers — typed wrappers around api.get/api.post for circle-specific endpoints.
 *
 * INVARIANT: All calls go through the shared `api` client (authClient-backed).
 * No new deps. No direct fetch.
 */

import { api } from "@/lib/api";
import type { GetCircleMessagesResponse } from "@/shared/contracts";

/**
 * Fetch paginated circle messages.
 *
 * @param circleId          - Circle to fetch messages for
 * @param beforeCreatedAt   - ISO timestamp cursor (exclusive) — omit for latest
 * @param beforeId          - Message-id tie-breaker (sent only when beforeCreatedAt is present)
 * @param limit             - Page size (default 30)
 * @returns { messages, hasMore }
 */
export async function getCircleMessages(params: {
  circleId: string;
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
  limit?: number;
}): Promise<GetCircleMessagesResponse> {
  const { circleId, beforeCreatedAt, beforeId, limit = 30 } = params;
  const qs = new URLSearchParams({ limit: String(limit) });
  if (beforeCreatedAt) {
    qs.set("beforeCreatedAt", beforeCreatedAt);
    if (beforeId) qs.set("beforeId", beforeId);
  }

  return api.get<GetCircleMessagesResponse>(
    `/api/circles/${circleId}/messages?${qs.toString()}`,
  );
}

/** Response from POST /api/circles/:id/read-horizon */
export interface SetCircleReadHorizonResponse {
  ok: true;
  circleId: string;
  lastReadAt: string;
}

/**
 * Send a read-horizon update so the server knows the newest message this device has seen.
 *
 * @param circleId   - Circle to mark
 * @param lastReadAt - ISO timestamp of the newest message the user has seen (monotonic)
 */
export async function setCircleReadHorizon(params: {
  circleId: string;
  lastReadAt: string;
}): Promise<SetCircleReadHorizonResponse> {
  const { circleId, lastReadAt } = params;
  return api.post<SetCircleReadHorizonResponse>(
    `/api/circles/${circleId}/read-horizon`,
    { lastReadAt },
  );
}
