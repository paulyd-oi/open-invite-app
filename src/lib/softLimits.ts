/**
 * Soft Limits for Free Tier
 *
 * Event creation is unlimited for all users.
 * Premium features (recurring events, premium themes, co-hosting,
 * analytics) are gated behind Pro.
 */

/**
 * Count active events from the user's event list
 * An event is "active" if it's in the future or currently ongoing
 *
 * Retained for analytics/display — no longer used for gating.
 *
 * @param events - Array of events from calendar/feed queries
 * @returns Count of active events
 */
export function getActiveEventCount(
  events: Array<{ startTime: string; endTime?: string | null; isImported?: boolean }>
): number {
  if (!events || events.length === 0) return 0;

  const now = new Date();

  return events.filter((event) => {
    // Imported calendar events are separate from app-created events
    if (event.isImported) return false;

    const startTime = new Date(event.startTime);
    const endTime = event.endTime ? new Date(event.endTime) : null;

    // Event is active if:
    // 1. Start time is in the future, OR
    // 2. Event is currently ongoing (now is between start and end)
    if (startTime > now) {
      return true; // Future event
    }

    if (endTime && endTime > now) {
      return true; // Currently ongoing
    }

    return false;
  }).length;
}
