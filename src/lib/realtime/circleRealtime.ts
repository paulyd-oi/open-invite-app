/**
 * Circle Realtime Hook — WebSocket subscription for circle chat messages
 *
 * Subscribes to room "circle:<id>" on mount, unsubscribes on unmount.
 * Handles inbound "circle_message:new" events by patching the React Query
 * cache with the same safeAppendMessage helper used by pushRouter.
 *
 * NET_GATE: Subscription is no-op when not authed (wsClient already no-ops
 * when REALTIME_WS_ENABLED is false, and we skip handler work when not authed).
 *
 * Observability tag: [P0_WS_MSG_APPLY]
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribe, unsubscribe, onMessage, type RealtimeMessage } from "./wsClient";
import { circleKeys } from "@/lib/circleQueryKeys";
import { safeAppendMessage } from "@/lib/pushRouter";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { getActiveCircle } from "@/lib/activeCircle";
import { refreshCircleListContract } from "@/lib/circleRefreshContract";
import { bumpCircleLastMessage } from "@/lib/bumpCircleLastMessage";
import { devLog } from "@/lib/devLog";
import type { BootStatus } from "@/hooks/useBootAuthority";

// Minimal session shape (matches authedGate)
interface SessionForGate {
  user?: { id?: string } | null;
  effectiveUserId?: string | null;
}

/**
 * Subscribe to realtime circle messages via WebSocket.
 *
 * @param circleId - The circle to subscribe to (null/undefined = no-op)
 * @param bootStatus - Current boot authority status
 * @param session - Current session object
 */
export function useCircleRealtime(
  circleId: string | undefined,
  bootStatus: BootStatus,
  session: SessionForGate | null | undefined,
): void {
  const queryClient = useQueryClient();
  // Keep latest refs so the message handler never captures stale closures
  const bootRef = useRef(bootStatus);
  const sessionRef = useRef(session);
  bootRef.current = bootStatus;
  sessionRef.current = session;

  // Track seen message ids to avoid duplicates within this session
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!circleId) return;

    // NET_GATE: only subscribe when authed
    if (!isAuthedForNetwork(bootStatus, session)) {
      if (__DEV__) {
        devLog("[P0_WS_MSG_APPLY]", "skip_subscribe — not authed", { circleId });
      }
      return;
    }

    const room = `circle:${circleId}`;
    subscribe(room);

    if (__DEV__) {
      devLog("[P0_WS_MSG_APPLY]", "subscribed", { room });
    }

    // Reset seen-set when circleId changes
    seenIdsRef.current.clear();

    const unregister = onMessage((msg: RealtimeMessage) => {
      // Only handle circle_message:new events
      if (msg.type !== "circle_message:new") return;

      // NET_GATE: ignore events arriving while logged out
      if (!isAuthedForNetwork(bootRef.current, sessionRef.current)) {
        if (__DEV__) {
          devLog("[P0_WS_MSG_APPLY]", "blocked — not authed", { circleId });
        }
        return;
      }

      const msgCircleId = (msg.circleId ?? msg.circle_id) as string | undefined;
      if (msgCircleId !== circleId) return; // not for this circle

      const message = msg.message as
        | { id: string; createdAt: string; clientMessageId?: string; [k: string]: unknown }
        | undefined;
      if (!message?.id || !message?.createdAt) return;

      // Dedupe within this WS session
      if (seenIdsRef.current.has(message.id)) return;
      seenIdsRef.current.add(message.id);

      // ── Patch circle detail cache (same helper as pushRouter) ──
      queryClient.setQueryData(
        circleKeys.single(circleId),
        (prev: unknown) => safeAppendMessage(prev, message as Parameters<typeof safeAppendMessage>[1]),
      );

      // ── Background reconcile: inactive only (no active refetch storm) ──
      queryClient.invalidateQueries({
        queryKey: circleKeys.single(circleId),
        refetchType: "inactive",
      });
      queryClient.invalidateQueries({
        queryKey: circleKeys.messages(circleId),
        refetchType: "inactive",
      });

      // ── Unread count: only bump if viewer is NOT in this circle ──
      const activeCircle = getActiveCircle();
      if (activeCircle !== circleId) {
        queryClient.setQueryData(
          circleKeys.unreadCount(),
          (prev: unknown) => {
            if (!prev) return prev;
            const p = prev as { totalUnread?: number; byCircle?: Record<string, number> };
            const prevCircle = p.byCircle?.[circleId] ?? 0;
            return {
              ...p,
              totalUnread: (p.totalUnread ?? 0) + 1,
              byCircle: { ...(p.byCircle ?? {}), [circleId]: prevCircle + 1 },
            };
          },
        );
      }

      // ── Bump lastMessageAt in circle list cache (sort key for chat list) ──
      bumpCircleLastMessage(circleId, message.createdAt, "ws", queryClient);

      // ── Circle list refresh (SSOT contract) ──
      refreshCircleListContract({ reason: "push_circle_message", circleId, queryClient });

      // ── Proof log ──
      if (__DEV__) {
        devLog("[P0_WS_MSG_APPLY]", "applied", {
          circleId,
          messageId: message.id,
        });
      }
    });

    return () => {
      unsubscribe(room);
      unregister();
      if (__DEV__) {
        devLog("[P0_WS_MSG_APPLY]", "unsubscribed", { room });
      }
    };
    // Re-subscribe when circleId or auth state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId, bootStatus, session, queryClient]);
}
