/**
 * Logout Intent Gate
 * 
 * In-memory flag to distinguish explicit user-initiated logout from automatic resets.
 * Prevents accidental token deletion during normal app flow.
 * 
 * Usage:
 * 1. User taps logout button → call setLogoutIntent()
 * 2. resetSession() → check consumeLogoutIntent() before clearing tokens
 * 3. If no intent set, block destructive reset
 */

let logoutIntentActive = false;

/**
 * Set logout intent flag (call this when user taps logout button)
 */
export function setLogoutIntent(): void {
  logoutIntentActive = true;
  if (__DEV__) {
    console.log('[LogoutIntent] Intent set - user initiated logout');
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
    console.log('[LogoutIntent] Intent consumed - proceeding with logout');
  }
  return wasActive;
}

/**
 * Peek at logout intent without consuming it (for debugging)
 */
export function peekLogoutIntent(): boolean {
  return logoutIntentActive;
}
