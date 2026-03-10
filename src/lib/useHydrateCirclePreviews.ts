/**
 * useHydrateCirclePreviews — Ensures lastMessageText / lastMessageSenderName
 * are present in the circles list cache for inbox preview display.
 *
 * PROBLEM: GET /api/circles returns lastMessageAt but NOT message text/sender.
 * Any refetch or invalidation of circleKeys.all() replaces the cache with the
 * incomplete API payload, wiping any previously hydrated preview fields.
 *
 * FIX: A module-level Map (circlePreviewStore) acts as a durable preview store
 * that survives React Query cache clobbers. On every circles-data change:
 *   1. For circles missing preview text, check the store first (instant, no network)
 *   2. If not in store, check the circle detail cache (free)
 *   3. If not cached, fetch the latest message (limit=1) from the messages API
 *   4. Patch the list cache and store the result for future clobber recovery
 *
 * The store is also updated by bumpCircleLastMessage (WS/push) via
 * updateCirclePreviewStore(), so it always has the freshest known preview.
 *
 * DEV tag: [P0_PREVIEW_HYDRATE]
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { circleKeys } from "@/lib/circleQueryKeys";
import { getCircleMessages } from "@/lib/circlesApi";
import type { Circle, GetCircleDetailResponse } from "@/shared/contracts";
import { devLog } from "@/lib/devLog";

// ── Module-level preview store (survives React Query cache clobbers) ──
interface PreviewEntry {
  text: string;
  senderName?: string;
}
const circlePreviewStore = new Map<string, PreviewEntry>();

/**
 * Update the durable preview store. Called by bumpCircleLastMessage when
 * WS/push delivers a new message, so the store always has the freshest data.
 */
export function updateCirclePreviewStore(
  circleId: string,
  text: string,
  senderName?: string,
): void {
  circlePreviewStore.set(circleId, { text, senderName });
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useHydrateCirclePreviews(
  circles: Circle[] | undefined,
): void {
  const queryClient = useQueryClient();
  // Track in-flight fetches to avoid duplicate concurrent requests
  const pendingRef = useRef(new Set<string>());

  useEffect(() => {
    if (!circles?.length) return;

    // Circles that have messages but no preview text in the current cache
    const needsHydration = circles.filter(
      (c) =>
        (c.messageCount ?? 0) > 0 &&
        !c.lastMessageText &&
        !pendingRef.current.has(c.id),
    );

    if (needsHydration.length === 0) return;

    if (__DEV__) {
      devLog("[P0_PREVIEW_HYDRATE]", "hydrating", {
        count: needsHydration.length,
        ids: needsHydration.map((c) => c.id.slice(0, 6)),
      });
    }

    for (const circle of needsHydration) {
      // 1) Check module-level store first (instant, survives clobber)
      const stored = circlePreviewStore.get(circle.id);
      if (stored) {
        patchCirclePreview(queryClient, circle.id, stored.text, stored.senderName);
        if (__DEV__) {
          devLog("[P0_PREVIEW_HYDRATE]", "from_store", {
            circleId: circle.id.slice(0, 6),
            text: stored.text.slice(0, 30),
          });
        }
        continue;
      }

      // 2) Check detail cache (free — no network)
      const detail = queryClient.getQueryData(
        circleKeys.single(circle.id),
      ) as GetCircleDetailResponse | undefined;

      if (detail?.circle?.messages?.length) {
        const msgs = detail.circle.messages;
        const latest = msgs[msgs.length - 1];
        const senderName = latest.user?.name ?? undefined;
        circlePreviewStore.set(circle.id, { text: latest.content, senderName });
        patchCirclePreview(queryClient, circle.id, latest.content, senderName);
        if (__DEV__) {
          devLog("[P0_PREVIEW_HYDRATE]", "from_detail_cache", {
            circleId: circle.id.slice(0, 6),
            text: latest.content.slice(0, 30),
          });
        }
        continue;
      }

      // 3) Fetch latest message (limit=1, no cursor = newest)
      pendingRef.current.add(circle.id);

      getCircleMessages({ circleId: circle.id, limit: 1 })
        .then((res) => {
          if (res.messages?.length) {
            const msg = res.messages[0];
            const senderName = msg.user?.name ?? undefined;
            circlePreviewStore.set(circle.id, { text: msg.content, senderName });
            patchCirclePreview(queryClient, circle.id, msg.content, senderName);
            if (__DEV__) {
              devLog("[P0_PREVIEW_HYDRATE]", "from_fetch", {
                circleId: circle.id.slice(0, 6),
                text: msg.content.slice(0, 30),
              });
            }
          }
        })
        .catch(() => {
          // Silently ignore — preview stays as fallback
        })
        .finally(() => {
          pendingRef.current.delete(circle.id);
        });
    }
  }, [circles, queryClient]);
}

/** Patch a single circle's preview fields in the list cache */
function patchCirclePreview(
  queryClient: ReturnType<typeof useQueryClient>,
  circleId: string,
  text: string,
  senderName: string | undefined,
): void {
  queryClient.setQueryData(circleKeys.all(), (prev: unknown) => {
    if (!prev) return prev;
    const p = prev as { circles?: Array<Record<string, unknown>> };
    if (!Array.isArray(p.circles)) return prev;

    return {
      ...p,
      circles: p.circles.map((c) =>
        c.id === circleId
          ? {
              ...c,
              lastMessageText: text,
              ...(senderName != null ? { lastMessageSenderName: senderName } : {}),
            }
          : c,
      ),
    };
  });
}
