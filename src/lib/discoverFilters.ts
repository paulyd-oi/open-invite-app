/**
 * discoverFilters.ts — SSOT for Discover event classification.
 *
 * Pure functions that determine event visibility across Discover surfaces:
 * - Responded pane (isResponded)
 * - Map tab (isVisibleInMap)
 * - Events tab pills (isVisibleInFeed)
 *
 * Also exports hasValidCoordinates for reuse (Discover map + event detail mini map).
 */

// ── Types ──

/** Minimal event shape required for classification. */
export interface ClassifiableEvent {
  id: string;
  visibility?: string | null;
  viewerRsvpStatus?: "going" | "not_going" | "interested" | "maybe" | null;
  hideDetailsUntilRsvp?: boolean | null;
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DiscoverVisibility {
  isResponded: boolean;
  isVisibleInMap: boolean;
  isVisibleInFeed: boolean;
}

// ── Constants ──

/** RSVP statuses that classify an event as "responded". */
export const RESPONDED_STATUSES: ReadonlyArray<string> = [
  "going",
  "not_going",
  "interested",
  "maybe",
];

/** Visibility values allowed on the map. */
const MAP_VISIBLE_VISIBILITIES = new Set(["public", "open_invite", "all_friends"]);

/** Visibility values blocked from the base enriched feed. */
export const FEED_BLOCKED_VISIBILITIES = new Set(["circle_only", "specific_groups", "private"]);

// ── Pure functions ──

/**
 * Returns true when the viewer has any RSVP status on the event.
 * Responded events belong in the Responded pane and are excluded from Events tab pills.
 */
export function isEventResponded(event: ClassifiableEvent): boolean {
  return (
    event.viewerRsvpStatus != null &&
    RESPONDED_STATUSES.includes(event.viewerRsvpStatus)
  );
}

/**
 * Returns true when an event has non-zero lat/lng coordinates.
 * Handles both `lat/lng` and `latitude/longitude` field variants.
 *
 * Used by: Discover map pins, event detail mini map.
 */
export function hasValidCoordinates(event: ClassifiableEvent): boolean {
  const lat = event.lat ?? event.latitude;
  const lng = event.lng ?? event.longitude;
  return lat != null && lng != null && lat !== 0 && lng !== 0;
}

/**
 * Returns true when an event should appear as a map pin.
 *
 * Rules:
 * - Must have valid coordinates
 * - Visibility must be public, open_invite, or all_friends
 * - Must NOT have hideDetailsUntilRsvp enabled
 */
export function isEventVisibleInMap(event: ClassifiableEvent): boolean {
  return (
    hasValidCoordinates(event) &&
    MAP_VISIBLE_VISIBILITIES.has(event.visibility ?? "") &&
    !event.hideDetailsUntilRsvp
  );
}

/**
 * Returns true when an event should appear in Events tab pills
 * (Soon, Popular, Friends, Saved, Group).
 *
 * Rule: event must NOT be responded. Responded events live exclusively
 * in the top-level Responded pane.
 */
export function isEventVisibleInFeed(event: ClassifiableEvent): boolean {
  return !isEventResponded(event);
}

/**
 * Canonical classifier — returns all three visibility booleans from one call.
 * Use this when you need multiple flags to avoid re-deriving.
 */
export function getDiscoverVisibility(event: ClassifiableEvent): DiscoverVisibility {
  const isResponded = isEventResponded(event);
  return {
    isResponded,
    isVisibleInMap: isEventVisibleInMap(event),
    isVisibleInFeed: !isResponded,
  };
}
