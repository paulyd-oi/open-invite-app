/**
 * Shared cache updater: bumps lastMessageAt for a circle in the circle list cache.
 *
 * Used by both the WS receive handler (circleRealtime.ts) and the push
 * receive handler (pushRouter.ts) so the chat list sorts correctly
 * without waiting for a full refetch.
 *
 * Also patches lastMessageText + lastMessageSenderName for inbox preview.
 *
 * DEV tag: [P0_CHAT_BUMP_UI]
 */

import type { QueryClient } from "@tanstack/react-query";
import { circleKeys } from "@/lib/circleQueryKeys";
import { devLog } from "@/lib/devLog";

/**
 * Optimistically set `lastMessageAt` (and optionally message preview)
 * on a circle in the list cache.
 *
 * @param circleId - The circle whose timestamp should bump
 * @param messageCreatedAt - ISO string of the message timestamp (falls back to now)
 * @param source - "ws" | "push" — used for the DEV proof log
 * @param queryClient - React Query client
 * @param preview - Optional message preview data for inbox display
 */
export function bumpCircleLastMessage(
  circleId: string,
  messageCreatedAt: string | undefined,
  source: "ws" | "push",
  queryClient: QueryClient,
  preview?: { text?: string; senderName?: string },
): void {
  const ts = messageCreatedAt || new Date().toISOString();

  queryClient.setQueryData(
    circleKeys.all(),
    (prev: unknown) => {
      if (!prev) return prev;
      const p = prev as { circles?: Array<Record<string, unknown>> };
      if (!Array.isArray(p.circles)) return prev;

      let found = false;
      const updated = p.circles.map((c) => {
        if (c.id !== circleId) return c;
        found = true;
        // Only bump if the new timestamp is actually newer
        const existing = c.lastMessageAt as string | null | undefined;
        if (existing && existing >= ts) return c;
        return {
          ...c,
          lastMessageAt: ts,
          ...(preview?.text != null ? { lastMessageText: preview.text } : {}),
          ...(preview?.senderName != null ? { lastMessageSenderName: preview.senderName } : {}),
        };
      });

      if (!found) return prev; // circle not in cache; no-op
      return { ...p, circles: updated };
    },
  );

  if (__DEV__) {
    devLog("[P0_CHAT_BUMP_UI]", { circleId, lastMessageAt: ts, source, preview: !!preview });
  }
}
