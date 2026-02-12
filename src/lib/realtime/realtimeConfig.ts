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
