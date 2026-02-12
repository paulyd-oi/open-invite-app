/**
 * Read Horizon Realtime — WS signal-only (HTTP remains source of truth)
 *
 * When the HTTP read-horizon call succeeds, broadcastReadHorizon() sends a
 * lightweight WS signal so other devices / tabs can update their unread UI
 * immediately without waiting for a push or refetch.
 *
 * On receive of circle:read_horizon:
 *   - Update the local byCircle unread cache (zero out the circle)
 *   - Do NOT write to DB — HTTP is the source of truth
 *
 * Safe if WS is off: send() is a no-op when REALTIME_WS_ENABLED is false.
 *
 * Observability tag: [P0_WS_READ_APPLY]
 */

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { send, onMessage, type RealtimeMessage } from "./wsClient";
import { circleKeys } from "@/lib/circleQueryKeys";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { devLog } from "@/lib/devLog";
import type { BootStatus } from "@/hooks/useBootAuthority";

// Minimal session shape (matches authedGate)
interface SessionForGate {
  user?: { id?: string } | null;
  effectiveUserId?: string | null;
}

// ---------------------------------------------------------------------------
// Broadcast (outbound)
// ---------------------------------------------------------------------------

/**
 * Broadcast a read horizon signal over WS after the HTTP call succeeds.
 * Safe to call when WS is off — send() is a no-op.
 *
 * @param circleId - The circle whose horizon was updated
 * @param lastReadAt - ISO timestamp of the newest read message
 */
export function broadcastReadHorizon(circleId: string, lastReadAt: string): void {
  send({ type: "circle:read_horizon", circleId, lastReadAt });
  if (__DEV__) {
    devLog("[P0_WS_READ_APPLY]", "broadcast", { circleId, lastReadAt });
  }
}

// ---------------------------------------------------------------------------
// Receiver (inbound)
// ---------------------------------------------------------------------------

/**
 * Apply an inbound read horizon signal to the unread cache.
 * Zeros out the byCircle count for the given circle and decrements totalUnread.
 */
function applyReadHorizon(queryClient: QueryClient, circleId: string): void {
  queryClient.setQueryData(
    circleKeys.unreadCount(),
    (prev: unknown) => {
      if (!prev) return prev;
      const p = prev as { totalUnread?: number; byCircle?: Record<string, number> };
      const currentCircle = p.byCircle?.[circleId] ?? 0;
      if (currentCircle === 0) return prev; // nothing to clear
      const nextTotal = Math.max(0, (p.totalUnread ?? 0) - currentCircle);
      return {
        ...p,
        totalUnread: nextTotal,
        byCircle: { ...(p.byCircle ?? {}), [circleId]: 0 },
      };
    },
  );
}

/**
 * Hook: listen for inbound circle:read_horizon WS messages and update
 * the local unread cache. No DB writes — HTTP is the source of truth.
 *
 * @param bootStatus - Current boot authority status
 * @param session - Current session object
 */
export function useReadHorizonReceiver(
  bootStatus: BootStatus,
  session: SessionForGate | null | undefined,
): void {
  const queryClient = useQueryClient();
  const bootRef = useRef(bootStatus);
  const sessionRef = useRef(session);
  bootRef.current = bootStatus;
  sessionRef.current = session;

  useEffect(() => {
    if (!isAuthedForNetwork(bootStatus, session)) return;

    const unregister = onMessage((msg: RealtimeMessage) => {
      if (msg.type !== "circle:read_horizon") return;

      // NET_GATE: ignore if logged out
      if (!isAuthedForNetwork(bootRef.current, sessionRef.current)) return;

      const circleId = msg.circleId as string | undefined;
      if (!circleId) return;

      applyReadHorizon(queryClient, circleId);

      if (__DEV__) {
        devLog("[P0_WS_READ_APPLY]", "applied", {
          circleId,
          lastReadAt: msg.lastReadAt,
        });
      }
    });

    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootStatus, session, queryClient]);
}
