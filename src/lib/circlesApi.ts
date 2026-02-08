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
