/**
 * Network Auth Gate — SSOT
 *
 * Module-level kill-switch for authed network calls.
 * When disabled, fetchFn in api.ts will throw immediately (no fetch)
 * for paths in the GATED_PATHS list.
 *
 * Lifecycle:
 *   - Default: enabled (true)
 *   - performLogout() → disableAuthedNetwork() (FIRST step, before resetSession)
 *   - bootStatus becomes 'authed' → enableAuthedNetwork()
 *
 * DEV proof tag: [P0_POST_LOGOUT_NET]
 */

import { devLog } from "./devLog";
import { DEV_PROBES_ENABLED } from "./devFlags";

// ── Gate state ──────────────────────────────────────────
let _enabled = true;

// ── Gated paths ─────────────────────────────────────────
// Only these authed endpoint prefixes are checked by the gate.
// Do NOT broaden this list without explicit approval.
const GATED_PATHS: readonly string[] = [
  "/api/entitlements",
  "/api/referral/stats",
];

// ── Public API ──────────────────────────────────────────

/** Disable authed network calls. Called at the VERY START of logout. */
export function disableAuthedNetwork(): void {
  _enabled = false;
  if (DEV_PROBES_ENABLED) {
    const payload = { phase: "logout_begin", networkAuthEnabled: false };
    devLog("[P0_POST_LOGOUT_NET]", payload);
  }
}

/** Re-enable authed network calls. Called when bootStatus = 'authed'. */
export function enableAuthedNetwork(): void {
  _enabled = true;
  if (DEV_PROBES_ENABLED) {
    const payload = { phase: "auth_confirmed", networkAuthEnabled: true };
    devLog("[P0_POST_LOGOUT_NET]", payload);
  }
}

/** Read current gate state (for testing / external checks). */
export function isNetworkAuthEnabled(): boolean {
  return _enabled;
}

/**
 * Check whether a request to `path` should be blocked.
 * Returns true if the request should proceed, false if it should be blocked.
 *
 * When blocked, logs a DEV proof line and returns false.
 * The caller (fetchFn) should throw a typed error that React Query won't retry.
 */
export function shouldAllowAuthedRequest(path: string): boolean {
  if (_enabled) return true;

  // Only block paths in the gated list
  const isGated = GATED_PATHS.some((gp) => path.startsWith(gp));
  if (!isGated) return true;

  // Blocked
  if (DEV_PROBES_ENABLED) {
    const payload = { phase: "blocked_request", path };
    devLog("[P0_POST_LOGOUT_NET]", payload);
  }
  return false;
}
