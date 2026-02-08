/**
 * Event Query Keys SSOT Module
 * 
 * INVARIANT: No hardcoded event query keys in event-related files.
 * All event query keys must come from this single helper module.
 * 
 * INVARIANT: No wildcard invalidations for events (e.g., invalidateQueries({queryKey:["events"]}))
 * Only specific keys may be invalidated using these SSOT helpers.
 * 
 * INVARIANT: [P0_RSVP_SOT] Attendee count derivation:
 *   effectiveAttendeeCount(event) = host (1) + joinRequests where status === "accepted"
 *   This is the canonical derivation everywhere UI shows attendee counts.
 */

import type { QueryClient } from "@tanstack/react-query";
import { devLog } from "./devLog";

// ============================================================================
// RSVP SSOT HELPER
// ============================================================================

/**
 * [P0_RSVP_SOT] Canonical attendee count derivation.
 * 
 * effectiveAttendeeCount(event) = host (1) + accepted joinRequests
 * 
 * This MUST be used everywhere attendee counts are displayed.
 * No screen may compute its own variant logic.
 * 
 * @param event - Event object with joinRequests array
 * @returns Total attendee count including host
 */
export function deriveAttendeeCount(event: {
  joinRequests?: Array<{ status: string }> | null;
} | null | undefined): number {
  if (!event) return 0;
  
  const host = 1;
  const accepted = (event.joinRequests ?? []).filter((r) => r.status === "accepted").length;
  
  return host + accepted;
}

/**
 * [P0_RSVP_SOT] DEV-only mismatch detection helper.
 * Logs when different count sources disagree.
 * 
 * @param eventId - Event ID prefix for logging
 * @param derivedCount - Count from deriveAttendeeCount
 * @param endpointCount - Count from API endpoint (goingCount or totalGoing)
 * @param source - Which screen/component is checking
 */
export function logRsvpMismatch(
  eventId: string,
  derivedCount: number,
  endpointCount: number | null | undefined,
  source: string
): void {
  if (!__DEV__) return;
  
  // Skip if endpoint count not available
  if (endpointCount == null) return;
  
  const match = derivedCount === endpointCount;
  
  if (!match) {
    devLog(`[P0_RSVP_SOT] MISMATCH source=${source} eventId=${eventId.slice(0, 6)} derivedCount=${derivedCount} endpointCount=${endpointCount} match=${match}`);
  }
}

// ============================================================================
// QUERY KEY BUILDERS
// ============================================================================

/**
 * SSOT event query keys - all event-related React Query keys must use these.
 */
export const eventKeys = {
  // Base key for all events
  all: () => ["events"] as const,
  
  // Single event by ID
  single: (id: string) => ["events", "single", id] as const,
  
  // Event-specific sub-resources
  interests: (id: string) => ["events", id, "interests"] as const,
  comments: (id: string) => ["events", id, "comments"] as const,
  // INVARIANT [P0_RSVP]: This key is the SOLE owner of viewer RSVP status for display.
  // event/[id].tsx derives myRsvpStatus exclusively from this query.
  // No screen may read event.viewerRsvpStatus for RSVP display.
  rsvp: (id: string) => ["events", id, "rsvp"] as const,
  mute: (id: string) => ["events", id, "mute"] as const,
  attendees: (id: string) => ["events", "attendees", id] as const, // [P0_RSVP_SOT] Who's Coming list
  
  // Generic event detail (used for capacity refetch)
  detail: (id: string) => ["events", id] as const,
  
  // Feed/list keys
  feed: () => ["events", "feed"] as const,
  feedPaginated: () => ["events", "feed", "paginated"] as const, // For useInfiniteQuery
  mine: () => ["events", "mine"] as const,
  myEvents: () => ["events", "my-events"] as const,
  calendar: () => ["events", "calendar"] as const,
  attending: () => ["events", "attending"] as const,
} as const;

// ============================================================================
// DEV LOGGING HELPER
// ============================================================================

/**
 * Log query key operations in DEV mode with canonical [P0_EVENT_QK] tag.
 */
export function logEventKey(label: string, key: readonly string[] | string[]): void {
  if (__DEV__) {
    devLog(`[P0_EVENT_QK] ${label} keys=${JSON.stringify(key)}`);
  }
}

/**
 * Log multiple query keys in DEV mode.
 */
export function logEventKeys(label: string, keys: Array<readonly string[] | string[]>): void {
  if (__DEV__) {
    devLog(`[P0_EVENT_QK] ${label} keys=${JSON.stringify(keys)}`);
  }
}

// ============================================================================
// INVALIDATION CONTRACT HELPERS
// ============================================================================

/**
 * Keys to invalidate after RSVP join/going action.
 * [P0_RSVP_SOT] Covers: event details, attendees, interests, RSVP status, feeds, calendar, attending list.
 */
export function getInvalidateAfterRsvpJoin(eventId: string): Array<readonly string[]> {
  return [
    eventKeys.single(eventId),
    eventKeys.attendees(eventId), // [P0_RSVP_SOT] Who's Coming list
    eventKeys.interests(eventId),
    eventKeys.rsvp(eventId),
    eventKeys.detail(eventId),
    eventKeys.feed(),
    eventKeys.feedPaginated(),
    eventKeys.myEvents(),
    eventKeys.calendar(),
    eventKeys.attending(),
  ];
}

/**
 * Keys to invalidate after RSVP leave/remove action.
 * [P0_RSVP_SOT] Same as join - need to update all views that show RSVP state.
 */
export function getInvalidateAfterRsvpLeave(eventId: string): Array<readonly string[]> {
  return [
    eventKeys.single(eventId),
    eventKeys.attendees(eventId), // [P0_RSVP_SOT] Who's Coming list
    eventKeys.interests(eventId),
    eventKeys.rsvp(eventId),
    eventKeys.detail(eventId),
    eventKeys.feed(),
    eventKeys.feedPaginated(),
    eventKeys.myEvents(),
    eventKeys.calendar(),
    eventKeys.attending(),
  ];
}
/**
 * Keys to invalidate after join request approval/rejection.
 * Updates event details and feeds but not user's own RSVP.
 */
export function getInvalidateAfterJoinRequestAction(eventId: string): Array<readonly string[]> {
  return [
    eventKeys.single(eventId),
    eventKeys.interests(eventId),
    eventKeys.feed(),
    eventKeys.feedPaginated(),
    eventKeys.myEvents(),
  ];
}

/**
 * Keys to invalidate after posting a comment.
 * Only need to refresh comments for this event.
 */
export function getInvalidateAfterComment(eventId: string): Array<readonly string[]> {
  return [
    eventKeys.comments(eventId),
  ];
}

/**
 * Keys to refetch on focus return to event details.
 * Core event data that may have changed while user was away.
 */
export function getRefetchOnEventFocus(eventId: string): Array<readonly string[]> {
  return [
    eventKeys.single(eventId),
    eventKeys.interests(eventId),
    eventKeys.comments(eventId),
    eventKeys.rsvp(eventId),
  ];
}

/**
 * Keys to invalidate after event creation.
 * Updates all feed views.
 */
export function getInvalidateAfterEventCreate(): Array<readonly string[]> {
  return [
    eventKeys.feed(),
    eventKeys.feedPaginated(),
    eventKeys.mine(),
    eventKeys.myEvents(),
    eventKeys.calendar(),
  ];
}

/**
 * Keys to invalidate after event edit.
 */
export function getInvalidateAfterEventEdit(eventId: string): Array<readonly string[]> {
  return [
    eventKeys.single(eventId),
    eventKeys.feed(),
    eventKeys.feedPaginated(),
    eventKeys.mine(),
    eventKeys.myEvents(),
    eventKeys.calendar(),
  ];
}

/**
 * Keys to invalidate after event delete.
 */
export function getInvalidateAfterEventDelete(): Array<readonly string[]> {
  return [
    eventKeys.feed(),
    eventKeys.feedPaginated(),
    eventKeys.mine(),
    eventKeys.myEvents(),
    eventKeys.calendar(),
  ];
}

// ============================================================================
// BATCH INVALIDATION HELPER
// ============================================================================

/**
 * Invalidate multiple query keys in a single call.
 * Use this instead of multiple queryClient.invalidateQueries() calls.
 */
export function invalidateEventKeys(
  queryClient: QueryClient,
  keys: Array<readonly string[]>,
  logLabel?: string
): void {
  if (logLabel) {
    logEventKeys(logLabel, keys);
  }
  
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: key as string[] });
  }
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type EventQueryKey = ReturnType<typeof eventKeys[keyof typeof eventKeys]>;
