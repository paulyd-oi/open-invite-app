/**
 * Auth Expiry Event Emitter
 *
 * Simple pub/sub for auth expiry events.
 * Used by authClient.ts to signal 401/403 to the React tree.
 *
 * CRITICAL: One-shot per session - prevents spam on cascading 401s.
 */

import { devLog } from "./devLog";

type AuthExpiryListener = (info: { endpoint: string; method: string; status: number }) => void;

const listeners = new Set<AuthExpiryListener>();

// One-shot guard: only emit once per app lifecycle until reset
let hasEmittedThisSession = false;

/**
 * Emit auth expiry event (one-shot per session).
 * Called from authClient.$fetch when 401/403 detected on an authenticated endpoint.
 */
export function emitAuthExpiry(info: { endpoint: string; method: string; status: number }): void {
  // One-shot guard - prevent spam from cascading 401s
  if (hasEmittedThisSession) {
    return;
  }
  hasEmittedThisSession = true;

  // DEV-only canonical log (single emit per session)
  if (__DEV__) {
    devLog(
      "[AUTH_EXPIRED]",
      `status=${info.status} endpoint=${info.endpoint} method=${info.method} action=logout_ssot`
    );
  }

  // Notify all listeners
  listeners.forEach((listener) => {
    try {
      listener(info);
    } catch (e) {
      // Never let listener errors break the emitter
    }
  });
}

/**
 * Subscribe to auth expiry events.
 * Returns cleanup function.
 */
export function subscribeToAuthExpiry(listener: AuthExpiryListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reset the one-shot guard.
 * Called after successful login to allow re-detection in new session.
 */
export function resetAuthExpiryGuard(): void {
  hasEmittedThisSession = false;
}
