/**
 * Logout Intent Gate & Transient Guard
 *
 * In-memory flag to distinguish explicit user-initiated logout from automatic resets.
 * Prevents accidental token deletion during normal app flow.
 *
 * EXTENDED: Hard transient guard to prevent post-logout authed effects during logout sequence.
 *
 * Usage:
 * 1. User taps logout button → call setLogoutIntent()
 * 2. resetSession() → check consumeLogoutIntent() before clearing tokens
 * 3. If no intent set, block destructive reset
 * 4. ALL authed effects MUST check isLogoutInProgress() and abort if true
 */

import { devLog } from "./devLog";

let logoutIntentActive = false;
// [P0_POST_LOGOUT_NET] Hard transient guard - prevents authed effects during logout
let logoutInProgress = false;

/**
 * Set logout intent flag (call this when user taps logout button)
 */
export function setLogoutIntent(): void {
  logoutIntentActive = true;
  logoutInProgress = true; // [P0_POST_LOGOUT_NET] Start transient guard
  if (__DEV__) {
    devLog('[LOGOUT_SOT] start - logout intent and progress flags set');
  }
}

/**
 * Check and consume logout intent flag (returns true if intent was set, then resets to false)
 * This is a one-time check - calling this clears the flag.
 */
export function consumeLogoutIntent(): boolean {
  const wasActive = logoutIntentActive;
  logoutIntentActive = false;
  if (__DEV__ && wasActive) {
    devLog('[LogoutIntent] Intent consumed - proceeding with logout');
  }
  return wasActive;
}

/**
 * Peek at logout intent without consuming it (for debugging)
 */
export function peekLogoutIntent(): boolean {
  return logoutIntentActive;
}

/**
 * [P0_POST_LOGOUT_NET] Check if logout is currently in progress.
 * ALL authed effects MUST call this and abort if true.
 */
export function isLogoutInProgress(): boolean {
  return logoutInProgress;
}

/**
 * [P0_POST_LOGOUT_NET] Clear logout in progress flag.
 * Called when logout sequence completes (success or failure).
 */
export function clearLogoutInProgress(): void {
  logoutInProgress = false;
  if (__DEV__) {
    devLog('[LOGOUT_SOT] routed_to_logged_out_surface - logout progress flag cleared');
  }
}
