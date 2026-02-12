/**
 * Realtime Configuration (SSOT)
 *
 * Feature flag + URL derivation for the WebSocket realtime client.
 * The WS client is OFF by default; set EXPO_PUBLIC_REALTIME_WS=1 to enable.
 */

import { BACKEND_URL } from "../config";

/**
 * Feature flag: enable the WebSocket realtime client.
 * Default OFF. Set EXPO_PUBLIC_REALTIME_WS=1 in env to enable.
 */
export const REALTIME_WS_ENABLED =
  process.env.EXPO_PUBLIC_REALTIME_WS === "1";

/**
 * Derive the WebSocket URL from the BACKEND_URL.
 * https:// → wss://, http:// → ws://
 */
function deriveWsUrl(baseUrl: string): string {
  return baseUrl
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://") + "/realtime/ws";
}

/** Full WebSocket endpoint URL */
export const REALTIME_WS_URL = deriveWsUrl(BACKEND_URL);

/** Reconnect backoff cap in ms */
export const RECONNECT_CAP_MS = 30_000;

/** Heartbeat: we respond to server pings, no client-side interval needed */

/** Outgoing send queue cap (backpressure) */
export const SEND_QUEUE_CAP = 200;

// ---------------------------------------------------------------------------
// Kill-switch / degraded mode (FRONT-6)
// ---------------------------------------------------------------------------

/** Max disconnects within the flap window before entering degraded mode. */
export const FLAP_DISCONNECT_LIMIT = 5;

/** Time window (ms) for counting disconnects (2 minutes). */
export const FLAP_WINDOW_MS = 2 * 60 * 1000;

/** Duration (ms) to stay in degraded mode (10 minutes). */
export const DEGRADED_COOLDOWN_MS = 10 * 60 * 1000;

// Module-level degraded state
let degradedUntil = 0;

/**
 * Mark the client as degraded until `Date.now() + DEGRADED_COOLDOWN_MS`.
 * Called by wsClient when flap threshold is exceeded.
 */
export function enterDegradedMode(): void {
  degradedUntil = Date.now() + DEGRADED_COOLDOWN_MS;
}

/**
 * Returns true when realtime is in degraded mode (kill switch active).
 * Callers should fall back to push + refetch while degraded.
 */
export function isRealtimeDegraded(): boolean {
  if (degradedUntil === 0) return false;
  if (Date.now() >= degradedUntil) {
    degradedUntil = 0; // cooldown expired
    return false;
  }
  return true;
}

/**
 * Reset degraded state (e.g. on explicit reconnect or logout).
 */
export function resetDegradedMode(): void {
  degradedUntil = 0;
}
