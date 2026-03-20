/**
 * Network Auth Gate — SSOT
 *
 * Module-level kill-switch for authed network calls.
 * When disabled, fetchFn in api.ts will throw immediately (no fetch)
 * for ALL /api/ paths except the explicit PUBLIC_PATHS allow-list.
 *
 * Lifecycle:
 *   - Default: enabled (true)
 *   - performLogout() → disableAuthedNetwork() (FIRST step, before resetSession)
 *   - bootStatus becomes 'authed' or 'onboarding' → enableAuthedNetwork()
 *   - Session barrier passes in auth bootstrap → enableAuthedNetwork() (immediate)
 *
 * DEV proof tag: [P0_POST_LOGOUT_NET]
 */

import { devLog } from "./devLog";
import { DEV_PROBES_ENABLED } from "./devFlags";

// ── Gate state ──────────────────────────────────────────
let _enabled = true;

// ── Public paths (never blocked, even post-logout) ──────
// These endpoints do not require authentication and must remain
// reachable after logout (sign-in, public event view, health).
const PUBLIC_PATHS: readonly string[] = [
  "/api/auth",                  // Better Auth sign-in, sign-out, get-session
  "/api/email-verification/",   // Resend/verify code during welcome/login flow
  "/api/events/public/",        // Public event detail (unauthenticated share links)
  "/health",                    // Health check
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
 * Post-logout (disabled): allows only PUBLIC_PATHS; blocks everything else.
 * The caller (fetchFn) should throw a typed error that React Query won't retry.
 */
export function shouldAllowAuthedRequest(path: string): boolean {
  if (_enabled) return true;

  // Post-logout: always allow public paths (sign-in, public events, health)
  const isPublic = PUBLIC_PATHS.some((pp) => path.startsWith(pp));
  if (isPublic) return true;

  // Block all other paths
  if (DEV_PROBES_ENABLED) {
    const payload = { phase: "blocked_request", path };
    devLog("[P0_POST_LOGOUT_NET]", payload);
  }
  return false;
}
