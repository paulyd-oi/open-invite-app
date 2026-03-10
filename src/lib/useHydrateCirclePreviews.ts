/**
 * useHydrateCirclePreviews — Hydrates lastMessageText / lastMessageSenderName
 * into the circles list cache on initial load.
 *
 * ROOT CAUSE: GET /api/circles returns lastMessageAt (for sort) but NOT the
 * message text or sender. The WS/push pipeline (bumpCircleLastMessage) only
 * patches the cache for NEW messages arriving after mount. So on cold load,
 * every row falls back to "Start the conversation" even when real messages exist.
 *
 * FIX: After circles load, for each circle that has messageCount > 0 but no
 * lastMessageText, fetch the latest message (limit=1) and patch the list cache.
 * Detail caches are checked first to avoid unnecessary network calls.
 *
 * DEV tag: [P0_PREVIEW_HYDRATE]
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { circleKeys } from "@/lib/circleQueryKeys";
import { getCircleMessages } from "@/lib/circlesApi";
import type { Circle, GetCircleDetailResponse } from "@/shared/contracts";
import { devLog } from "@/lib/devLog";

export function useHydrateCirclePreviews(
  circles: Circle[] | undefined,
): void {
  const queryClient = useQueryClient();
  // Track which circles we've already attempted hydration for
  const hydratedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!circles?.length) return;

    // Circles that have messages but no preview text yet
    const needsHydration = circles.filter(
      (c) =>
        (c.messageCount ?? 0) > 0 &&
        !c.lastMessageText &&
        !hydratedRef.current.has(c.id),
    );

    if (needsHydration.length === 0) return;

    if (__DEV__) {
      devLog("[P0_PREVIEW_HYDRATE]", "hydrating", {
        count: needsHydration.length,
        ids: needsHydration.map((c) => c.id.slice(0, 6)),
      });
    }

    for (const circle of needsHydration) {
      hydratedRef.current.add(circle.id);

      // 1) Check detail cache first (free — no network)
      const detail = queryClient.getQueryData(
        circleKeys.single(circle.id),
      ) as GetCircleDetailResponse | undefined;

      if (detail?.circle?.messages?.length) {
        const msgs = detail.circle.messages;
        // Messages in detail are typically chronological; last = newest
        const latest = msgs[msgs.length - 1];
        patchCirclePreview(
          queryClient,
          circle.id,
          latest.content,
          latest.user?.name ?? undefined,
        );
        if (__DEV__) {
          devLog("[P0_PREVIEW_HYDRATE]", "from_cache", {
            circleId: circle.id.slice(0, 6),
            text: latest.content.slice(0, 30),
          });
        }
        continue;
      }

      // 2) Fetch latest message (limit=1, no cursor = newest page)
      getCircleMessages({ circleId: circle.id, limit: 1 })
        .then((res) => {
          if (res.messages?.length) {
            const msg = res.messages[0];
            patchCirclePreview(
              queryClient,
              circle.id,
              msg.content,
              msg.user?.name ?? undefined,
            );
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
              ...(senderName ? { lastMessageSenderName: senderName } : {}),
            }
          : c,
      ),
    };
  });
}
