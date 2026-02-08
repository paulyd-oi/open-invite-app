/**
 * Active Circle Tracker — lightweight module-level state
 *
 * INVARIANT: Only one circle can be "active" (focused) at a time.
 * Used by pushRouter to decide whether incoming messages should increment
 * unread or be treated as already-read.
 *
 * No deps, no React context — pure getter/setter for cross-module use.
 */

let _activeCircleId: string | null = null;

/** Set the currently-viewed circle (call on focus). Pass null on blur/unmount. */
export function setActiveCircle(circleId: string | null): void {
  _activeCircleId = circleId;
}

/** Get the currently-viewed circle id, or null if none is active. */
export function getActiveCircle(): string | null {
  return _activeCircleId;
}
