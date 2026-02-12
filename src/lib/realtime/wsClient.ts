/**
 * WebSocket Client SSOT
 *
 * Manages a single WebSocket connection to the backend realtime endpoint.
 *
 * Lifecycle:
 *   connect()    — open WS when authed (bootStatus === "authed" | "onboarding")
 *   disconnect() — close WS on logout (or manual teardown)
 *   reconnect    — exponential backoff (cap 30 s), auto-resubscribes rooms
 *
 * Rooms:
 *   subscribe(room)   — add to desiredRooms; send join if connected
 *   unsubscribe(room) — remove from desiredRooms; send leave if connected
 *   On reconnect: all desiredRooms are re-joined automatically.
 *
 * Heartbeat:
 *   Server sends { type: "ping" } → we reply { type: "pong" }
 *
 * Backpressure:
 *   Outgoing queue capped at SEND_QUEUE_CAP (200). Excess messages are dropped
 *   with a [P0_WS_CLIENT] backpressure proof log.
 *
 * Auth:
 *   Cookie-based session (credentials: "include" on the HTTP upgrade).
 *   NO Bearer auth — the cookie jar handles it.
 *
 * Feature flag:
 *   Gated by REALTIME_WS_ENABLED (EXPO_PUBLIC_REALTIME_WS=1). When OFF, every
 *   public method is a no-op so callers don't need conditional checks.
 *
 * Observability tag: [P0_WS_CLIENT]
 */

import { devLog, devError } from "../devLog";
import {
  REALTIME_WS_ENABLED,
  REALTIME_WS_URL,
  RECONNECT_CAP_MS,
  SEND_QUEUE_CAP,
} from "./realtimeConfig";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Inbound message shape (at minimum has `type`). */
export interface RealtimeMessage {
  type: string;
  [key: string]: unknown;
}

/** Callback registered via onMessage(). */
export type MessageHandler = (msg: RealtimeMessage) => void;

/** Connection state exposed to callers. */
export type WsConnectionState = "disconnected" | "connecting" | "connected";

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let state: WsConnectionState = "disconnected";

/** Rooms the caller wants to be in. Survives reconnects. */
const desiredRooms = new Set<string>();

/** Outgoing queue for messages when WS isn't open yet. */
const sendQueue: string[] = [];

/** Registered message handlers. */
const messageHandlers = new Set<MessageHandler>();

/** Current retry attempt counter (reset on successful open). */
let retryAttempt = 0;

/** Timer id for scheduled reconnect. */
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Whether the client was intentionally disconnected (don't auto-reconnect). */
let intentionalClose = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TAG = "[P0_WS_CLIENT]";

function setState(next: WsConnectionState) {
  if (state === next) return;
  const prev = state;
  state = next;
  devLog(TAG, `state ${prev} → ${next}`);
}

/** Exponential backoff: min(2^attempt * 500, RECONNECT_CAP_MS) + jitter. */
function backoffMs(): number {
  const base = Math.min(Math.pow(2, retryAttempt) * 500, RECONNECT_CAP_MS);
  const jitter = Math.random() * 500;
  return base + jitter;
}

/**
 * Flush the outgoing queue into the live socket.
 * Drops anything beyond SEND_QUEUE_CAP before flushing.
 */
function flushQueue() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Backpressure: drop excess
  if (sendQueue.length > SEND_QUEUE_CAP) {
    const dropped = sendQueue.length - SEND_QUEUE_CAP;
    sendQueue.splice(0, dropped); // keep the newest
    devLog(TAG, `backpressure: dropped ${dropped} queued messages`);
  }

  while (sendQueue.length > 0) {
    const payload = sendQueue.shift()!;
    ws.send(payload);
  }
}

/** Send a JSON message, or queue it. */
function safeSend(msg: Record<string, unknown>) {
  const payload = JSON.stringify(msg);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(payload);
    return;
  }

  // Queue it
  if (sendQueue.length >= SEND_QUEUE_CAP) {
    devLog(TAG, "backpressure: send queue full, dropping message", msg.type);
    return;
  }
  sendQueue.push(payload);
}

/** Send room join/leave for all desiredRooms (used on connect/reconnect). */
function resubscribeAll() {
  for (const room of desiredRooms) {
    safeSend({ type: "subscribe", room });
  }
  if (desiredRooms.size > 0) {
    devLog(TAG, `resubscribed ${desiredRooms.size} rooms`);
  }
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (intentionalClose) return;
  clearReconnectTimer();
  const delay = backoffMs();
  retryAttempt += 1;
  devLog(TAG, `reconnect scheduled in ${Math.round(delay)}ms (attempt ${retryAttempt})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, delay);
}

// ---------------------------------------------------------------------------
// Socket lifecycle (internal)
// ---------------------------------------------------------------------------

function openSocket() {
  if (!REALTIME_WS_ENABLED) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return; // already open or connecting
  }

  setState("connecting");
  devLog(TAG, `connecting to ${REALTIME_WS_URL}`);

  try {
    ws = new WebSocket(REALTIME_WS_URL);
  } catch (err) {
    devError(TAG, "WebSocket constructor threw", err);
    setState("disconnected");
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    setState("connected");
    retryAttempt = 0;
    devLog(TAG, "connected");
    resubscribeAll();
    flushQueue();
  };

  ws.onmessage = (event) => {
    let parsed: RealtimeMessage;
    try {
      parsed = JSON.parse(event.data as string) as RealtimeMessage;
    } catch {
      devError(TAG, "failed to parse inbound message", event.data);
      return;
    }

    // Heartbeat: server sends ping, we respond with pong
    if (parsed.type === "ping") {
      safeSend({ type: "pong" });
      return;
    }

    // Fan out to handlers
    for (const handler of messageHandlers) {
      try {
        handler(parsed);
      } catch (err) {
        devError(TAG, "message handler threw", err);
      }
    }
  };

  ws.onerror = (event) => {
    devError(TAG, "socket error", event);
  };

  ws.onclose = (event) => {
    const { code, reason } = event;
    devLog(TAG, `disconnected code=${code} reason="${reason ?? ""}"`);
    ws = null;
    setState("disconnected");

    if (!intentionalClose) {
      scheduleReconnect();
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect the WebSocket (call when bootStatus is "authed" or "onboarding").
 * No-op if feature flag is off or already connected/connecting.
 */
export function connect(): void {
  if (!REALTIME_WS_ENABLED) return;
  intentionalClose = false;
  devLog(TAG, "connect requested");
  openSocket();
}

/**
 * Intentionally disconnect (e.g. on logout).
 * Clears reconnect timers and the send queue.
 */
export function disconnect(): void {
  if (!REALTIME_WS_ENABLED) return;
  intentionalClose = true;
  clearReconnectTimer();
  sendQueue.length = 0;
  desiredRooms.clear();
  retryAttempt = 0;

  if (ws) {
    devLog(TAG, "disconnect requested, closing socket");
    ws.onclose = null; // prevent auto-reconnect from firing
    ws.close();
    ws = null;
  }
  setState("disconnected");
}

/**
 * Subscribe to a room. If connected, sends immediately; otherwise queued.
 * Room survives reconnects (persisted in desiredRooms).
 */
export function subscribe(room: string): void {
  if (!REALTIME_WS_ENABLED) return;
  if (desiredRooms.has(room)) return; // already subscribed
  desiredRooms.add(room);
  safeSend({ type: "subscribe", room });
  devLog(TAG, `subscribed room="${room}"`);
}

/**
 * Unsubscribe from a room. Sends leave message and removes from desiredRooms.
 */
export function unsubscribe(room: string): void {
  if (!REALTIME_WS_ENABLED) return;
  if (!desiredRooms.has(room)) return;
  desiredRooms.delete(room);
  safeSend({ type: "unsubscribe", room });
  devLog(TAG, `unsubscribed room="${room}"`);
}

/**
 * Register a handler for inbound messages.
 * Returns an unsubscribe function.
 */
export function onMessage(handler: MessageHandler): () => void {
  if (!REALTIME_WS_ENABLED) return () => {};
  messageHandlers.add(handler);
  return () => {
    messageHandlers.delete(handler);
  };
}

/**
 * Current connection state (reactive callers should poll or subscribe to messages).
 */
export function getState(): WsConnectionState {
  return state;
}

/**
 * Number of rooms currently in the desired set.
 */
export function getDesiredRoomCount(): number {
  return desiredRooms.size;
}
