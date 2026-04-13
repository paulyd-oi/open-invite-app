/**
 * discoverFilters.ts — SSOT for Discover event classification.
 *
 * Two-layer model:
 *   Layer A — Discover pool eligibility (isEventEligibleForDiscoverPool)
 *     Determines whether a raw event belongs in the discover pool at all.
 *   Layer B — Surface visibility/classification (isResponded, isVisibleInMap, isVisibleInFeed)
 *     Determines where an eligible event appears across Discover surfaces.
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
  startTime: string;
  isRecurring?: boolean;
  nextOccurrence?: string | null;
  /** Host user id — used for own-event bypass in public surfaces. */
  userId?: string | null;
}

export interface DiscoverVisibility {
  isResponded: boolean;
  isVisibleInMap: boolean;
  isVisibleInFeed: boolean;
}

// ── Constants ──

/** Distance cap (miles) for public event discovery surfaces. */
export const PUBLIC_NEARBY_MILES = 50;

/** RSVP statuses that classify an event as "responded". */
export const RESPONDED_STATUSES: ReadonlyArray<string> = [
  "going",
  "not_going",
  "interested",
  "maybe",
];

/** Visibility values allowed on the map. */
const MAP_VISIBLE_VISIBILITIES = new Set(["public", "open_invite", "all_friends"]);

/** Visibility values blocked from the discover pool entirely. */
export const POOL_BLOCKED_VISIBILITIES = new Set(["circle_only", "specific_groups", "private"]);

// ── Layer A: Discover pool eligibility ──

/**
 * Returns the effective display time for an event (nextOccurrence for recurring, startTime otherwise).
 */
export function getEffectiveTime(event: ClassifiableEvent): number {
  return new Date(
    event.isRecurring && event.nextOccurrence ? event.nextOccurrence : event.startTime,
  ).getTime();
}

/**
 * Returns true when an event belongs in the discover pool.
 *
 * Rules:
 * - Visibility must NOT be circle_only, specific_groups, or private
 * - Event must not be in the past (effective time >= now)
 *
 * @param now - current timestamp in ms (pass Date.now() from caller for testability)
 */
export function isEventEligibleForDiscoverPool(
  event: ClassifiableEvent,
  now: number = Date.now(),
): boolean {
  if (event.visibility && POOL_BLOCKED_VISIBILITIES.has(event.visibility)) return false;
  if (getEffectiveTime(event) < now) return false;
  return true;
}

// ── Layer B: Surface visibility/classification ──

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
 * (Soon, Popular, Friends, Saved, Group, Public).
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

// ── Layer C: Public event discovery helpers ──

/** Minimal location shape for distance calculations. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Returns true when an event has visibility === "public".
 */
export function isPublicEvent(event: ClassifiableEvent): boolean {
  return event.visibility === "public";
}

/**
 * Haversine distance between two points in miles.
 */
export function distanceMiles(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

/**
 * Returns true when an event is within `miles` of `userLocation`.
 * Returns true (no cap) when the event has no coordinates.
 */
export function isWithinMiles(
  userLocation: GeoPoint,
  event: ClassifiableEvent,
  miles: number,
): boolean {
  const lat = event.lat ?? event.latitude;
  const lng = event.lng ?? event.longitude;
  if (lat == null || lng == null || lat === 0 || lng === 0) return true; // no coords → don't exclude
  return distanceMiles(userLocation, { latitude: lat, longitude: lng }) <= miles;
}

/**
 * Sort comparator for the Public feed.
 * When userLocation is available: nearby coord events first (by distance ASC),
 * then no-coord events (by time ASC). When no location: time ASC only.
 */
export function comparePublicFeedOrder(
  a: ClassifiableEvent,
  b: ClassifiableEvent,
  userLocation?: GeoPoint | null,
): number {
  if (userLocation) {
    const aHasCoords = hasValidCoordinates(a);
    const bHasCoords = hasValidCoordinates(b);
    // Coord events rank above no-coord events
    if (aHasCoords && !bHasCoords) return -1;
    if (!aHasCoords && bHasCoords) return 1;
    // Both have coords: sort by distance, then time
    if (aHasCoords && bHasCoords) {
      const aLat = a.lat ?? a.latitude ?? 0;
      const aLng = a.lng ?? a.longitude ?? 0;
      const bLat = b.lat ?? b.latitude ?? 0;
      const bLng = b.lng ?? b.longitude ?? 0;
      const distA = distanceMiles(userLocation, { latitude: aLat, longitude: aLng });
      const distB = distanceMiles(userLocation, { latitude: bLat, longitude: bLng });
      if (distA !== distB) return distA - distB;
    }
  }
  // Fallback: soonest first
  return getEffectiveTime(a) - getEffectiveTime(b);
}

/**
 * Returns true when an event should appear in the Public discovery feed.
 *
 * Rules:
 * - visibility === "public"
 * - Must pass discover pool eligibility (not past, not blocked visibility)
 * - Must not be responded (follows Events-pane responded exclusion invariant)
 * - If userLocation provided, must be within PUBLIC_NEARBY_MILES
 *
 * [PUBLIC_LANE_OWN_EVENTS_V1] When `viewerUserId` is provided and matches the
 * event host (`event.userId`), the `isEventResponded` check is bypassed. A host
 * is typically auto-"going" for their own event, and we don't want their newly
 * created public event to be hidden from their own Public discovery surfaces
 * (Events Public pill, Discover Map Public, Social Public Invite).
 */
export function isVisibleInPublicFeed(
  event: ClassifiableEvent,
  userLocation?: GeoPoint | null,
  now: number = Date.now(),
  viewerUserId?: string | null,
): boolean {
  if (!isPublicEvent(event)) return false;
  if (!isEventEligibleForDiscoverPool(event, now)) return false;
  const isOwn = !!viewerUserId && !!event.userId && event.userId === viewerUserId;
  if (!isOwn && isEventResponded(event)) return false;
  if (userLocation) {
    if (!isWithinMiles(userLocation, event, PUBLIC_NEARBY_MILES)) return false;
  }
  return true;
}
