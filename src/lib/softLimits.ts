/**
 * Soft Limits for Free Tier
 * 
 * These are non-blocking limits that prompt users to upgrade
 * but still allow them to proceed after dismissing the modal.
 */

// Maximum active events for free users before showing upgrade prompt
export const MAX_ACTIVE_EVENTS_FREE = 5;

/**
 * Count active events from the user's event list
 * An event is "active" if it's in the future or currently ongoing
 * 
 * @param events - Array of events from calendar/feed queries
 * @returns Count of active events
 */
export function getActiveEventCount(
  events: Array<{ startTime: string; endTime?: string | null }>
): number {
  if (!events || events.length === 0) return 0;

  const now = new Date();

  return events.filter((event) => {
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

/**
 * Session-scoped tracking for upgrade prompts
 * Prevents spamming the user with multiple prompts per session
 */
let activeEventsPromptShownThisSession = false;

export function hasShownActiveEventsPrompt(): boolean {
  return activeEventsPromptShownThisSession;
}

export function markActiveEventsPromptShown(): void {
  activeEventsPromptShownThisSession = true;
}

export function resetActiveEventsPromptTracking(): void {
  activeEventsPromptShownThisSession = false;
}
