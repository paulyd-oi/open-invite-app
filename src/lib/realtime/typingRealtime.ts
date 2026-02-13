/**
 * Typing Realtime Hook — WebSocket typing indicator for circle chat
 *
 * Sends "circle:typing" events (throttled ≤ 5/sec) and receives typing
 * state from other users with an 8-second TTL auto-expiry.
 *
 * Falls back gracefully when REALTIME_WS_ENABLED is false — callers
 * get an empty typingUserIds array and setTyping is a no-op.
 *
 * Observability tag: [P0_WS_TYPING_UI]
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { send, onMessage, type RealtimeMessage } from "./wsClient";
import { REALTIME_WS_ENABLED, isRealtimeDegraded } from "./realtimeConfig";
import { devLog } from "../devLog";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum interval between outgoing typing events (ms). 5/sec = 200ms. */
const SEND_THROTTLE_MS = 200;

/** Typing state TTL: expire a user after 8 seconds of no "typing" event. */
const TYPING_TTL_MS = 8_000;

/** Tick interval for expiry sweep (ms). */
const EXPIRY_TICK_MS = 2_000;

const TAG = "[P0_WS_TYPING_UI]";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TypingEntry {
  /** User ID of the remote typer. */
  userId: string;
  /** Timestamp (Date.now()) when we last received a typing=true event. */
  lastSeen: number;
}

export interface UseTypingRealtimeResult {
  /** User IDs currently typing (excludes self). */
  typingUserIds: string[];
  /** Signal typing start/stop. Throttled internally. */
  setTyping: (isTyping: boolean) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to typing events for a circle and expose send/receive API.
 *
 * @param circleId  Circle to track (null/undefined = no-op)
 * @param selfId    Current user's ID (to exclude from typingUserIds)
 */
export function useTypingRealtime(
  circleId: string | undefined,
  selfId: string | undefined,
): UseTypingRealtimeResult {
  // Map of userId → TypingEntry (kept in a ref to avoid re-render on every
  // inbound event; we batch-flush to state on the expiry tick).
  const entriesRef = useRef<Map<string, TypingEntry>>(new Map());
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const lastSendRef = useRef<number>(0);

  // ── Receive: update entries on inbound "circle:typing" events ──
  useEffect(() => {
    if (!REALTIME_WS_ENABLED || !circleId) return;

    const unregister = onMessage((msg: RealtimeMessage) => {
      if (msg.type !== "circle:typing") return;

      const msgCircleId = (msg.circleId ?? msg.circle_id) as string | undefined;
      if (msgCircleId !== circleId) return;

      const userId = msg.userId as string | undefined;
      if (!userId || userId === selfId) return;

      const isTyping = msg.isTyping as boolean | undefined;

      if (isTyping) {
        entriesRef.current.set(userId, { userId, lastSeen: Date.now() });
        if (__DEV__) devLog(TAG, "recv typing=true", { circleId, userId });
      } else {
        entriesRef.current.delete(userId);
        if (__DEV__) devLog(TAG, "recv typing=false", { circleId, userId });
      }

      // Immediate state sync so UI is responsive
      flushToState();
    });

    return () => {
      unregister();
      entriesRef.current.clear();
      setTypingUserIds([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId, selfId]);

  // ── Expiry sweep: remove stale entries every EXPIRY_TICK_MS ──
  useEffect(() => {
    if (!REALTIME_WS_ENABLED || !circleId) return;

    const timer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [uid, entry] of entriesRef.current) {
        if (now - entry.lastSeen > TYPING_TTL_MS) {
          entriesRef.current.delete(uid);
          changed = true;
          if (__DEV__) devLog(TAG, "expired", { circleId, userId: uid });
        }
      }
      if (changed) flushToState();
    }, EXPIRY_TICK_MS);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId]);

  // ── Flush entries map → state array ──
  const flushToState = useCallback(() => {
    const ids = Array.from(entriesRef.current.keys());
    setTypingUserIds((prev) => {
      // Shallow-equal check to avoid unnecessary renders
      if (
        prev.length === ids.length &&
        prev.every((id, i) => id === ids[i])
      ) {
        return prev;
      }
      return ids;
    });
  }, []);

  // ── Send: throttled typing signal ──
  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!REALTIME_WS_ENABLED || !circleId) return;
      // FRONT-6: skip WS send when degraded (fall back to HTTP-based typing)
      if (isRealtimeDegraded()) return;

      // Throttle "typing=true" sends to max 5/sec (200ms)
      if (isTyping) {
        const now = Date.now();
        if (now - lastSendRef.current < SEND_THROTTLE_MS) return;
        lastSendRef.current = now;
      }

      send({ type: "circle:typing", circleId, isTyping });
      if (__DEV__) devLog(TAG, "send", { circleId, isTyping });
    },
    [circleId],
  );

  return { typingUserIds, setTyping };
}
