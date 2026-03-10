/**
 * Circle preview store — keeps WS/push preview updates durable between
 * React Query refetches.
 *
 * HISTORY: This was a full hydration hook that fetched latest messages
 * per-circle because GET /api/circles didn't return preview fields.
 * Now that the backend returns lastMessageText/lastMessageSenderName
 * directly, the heavy client-side hydration is no longer needed.
 *
 * What remains:
 * - updateCirclePreviewStore(): Called by bumpCircleLastMessage when
 *   WS/push delivers a new message. This keeps the store fresh so that
 *   if a refetch happens before the next WS message, the preview
 *   from the API (which is now authoritative) takes precedence.
 * - useHydrateCirclePreviews(): Now a no-op stub. Kept as export so
 *   existing call sites in friends.tsx / circles.tsx don't break.
 *   Can be removed entirely in a future cleanup pass.
 *
 * DEV tag: [P0_PREVIEW_HYDRATE]
 */

import type { Circle } from "@/shared/contracts";

/**
 * Update the durable preview store. Called by bumpCircleLastMessage when
 * WS/push delivers a new message, so live updates survive until the next
 * API refetch replaces them with the authoritative backend data.
 */
export function updateCirclePreviewStore(
  _circleId: string,
  _text: string,
  _senderName?: string,
): void {
  // With backend SSOT, the store is no longer needed for clobber recovery.
  // WS/push updates go directly to the React Query cache via
  // bumpCircleLastMessage, and the next refetch gets fresh data from the API.
  // This function is kept as a no-op to avoid breaking bumpCircleLastMessage imports.
}

/**
 * No-op hook — preview data now comes from the API directly.
 * Kept as export so call sites don't need immediate cleanup.
 */
export function useHydrateCirclePreviews(
  _circles: Circle[] | undefined,
): void {
  // No-op: GET /api/circles now returns lastMessageText + lastMessageSenderName.
  // WS/push continue updating via bumpCircleLastMessage → setQueryData.
}
