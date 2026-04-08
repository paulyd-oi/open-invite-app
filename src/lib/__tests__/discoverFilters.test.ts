import {
  isEventResponded,
  isEventVisibleInMap,
  isEventVisibleInFeed,
  hasValidCoordinates,
  getDiscoverVisibility,
  type ClassifiableEvent,
} from "../discoverFilters";

// ── Factory ──

function makeEvent(overrides: Partial<ClassifiableEvent> = {}): ClassifiableEvent {
  return {
    id: "evt-1",
    visibility: "public",
    viewerRsvpStatus: null,
    hideDetailsUntilRsvp: false,
    latitude: 32.7157,
    longitude: -117.1611,
    ...overrides,
  };
}

// ── isEventResponded ──

describe("isEventResponded", () => {
  it("returns true for going", () => {
    expect(isEventResponded(makeEvent({ viewerRsvpStatus: "going" }))).toBe(true);
  });

  it("returns true for not_going", () => {
    expect(isEventResponded(makeEvent({ viewerRsvpStatus: "not_going" }))).toBe(true);
  });

  it("returns true for interested", () => {
    expect(isEventResponded(makeEvent({ viewerRsvpStatus: "interested" }))).toBe(true);
  });

  it("returns true for maybe", () => {
    expect(isEventResponded(makeEvent({ viewerRsvpStatus: "maybe" }))).toBe(true);
  });

  it("returns false for null status", () => {
    expect(isEventResponded(makeEvent({ viewerRsvpStatus: null }))).toBe(false);
  });

  it("returns false for undefined status", () => {
    expect(isEventResponded(makeEvent({ viewerRsvpStatus: undefined }))).toBe(false);
  });
});

// ── hasValidCoordinates ──

describe("hasValidCoordinates", () => {
  it("returns true for valid latitude/longitude", () => {
    expect(hasValidCoordinates(makeEvent())).toBe(true);
  });

  it("returns true for valid lat/lng shorthand", () => {
    expect(hasValidCoordinates(makeEvent({ latitude: null, longitude: null, lat: 32.7, lng: -117.1 }))).toBe(true);
  });

  it("returns false when both null", () => {
    expect(hasValidCoordinates(makeEvent({ latitude: null, longitude: null }))).toBe(false);
  });

  it("returns false for zero coordinates", () => {
    expect(hasValidCoordinates(makeEvent({ latitude: 0, longitude: 0 }))).toBe(false);
  });

  it("prefers lat/lng over latitude/longitude when both present", () => {
    // lat/lng takes precedence via ?? fallback order
    expect(hasValidCoordinates(makeEvent({ lat: 33, lng: -117, latitude: null, longitude: null }))).toBe(true);
  });
});

// ── isEventVisibleInMap ──

describe("isEventVisibleInMap", () => {
  it("shows public event with coordinates", () => {
    expect(isEventVisibleInMap(makeEvent({ visibility: "public" }))).toBe(true);
  });

  it("shows open_invite event", () => {
    expect(isEventVisibleInMap(makeEvent({ visibility: "open_invite" }))).toBe(true);
  });

  it("shows all_friends event", () => {
    expect(isEventVisibleInMap(makeEvent({ visibility: "all_friends" }))).toBe(true);
  });

  it("hides circle_only event", () => {
    expect(isEventVisibleInMap(makeEvent({ visibility: "circle_only" }))).toBe(false);
  });

  it("hides private event", () => {
    expect(isEventVisibleInMap(makeEvent({ visibility: "private" }))).toBe(false);
  });

  it("hides specific_groups event", () => {
    expect(isEventVisibleInMap(makeEvent({ visibility: "specific_groups" }))).toBe(false);
  });

  it("hides hideDetailsUntilRsvp event", () => {
    expect(isEventVisibleInMap(makeEvent({ hideDetailsUntilRsvp: true }))).toBe(false);
  });

  it("hides event without coordinates", () => {
    expect(isEventVisibleInMap(makeEvent({ latitude: null, longitude: null }))).toBe(false);
  });
});

// ── isEventVisibleInFeed ──

describe("isEventVisibleInFeed", () => {
  it("shows non-responded event", () => {
    expect(isEventVisibleInFeed(makeEvent({ viewerRsvpStatus: null }))).toBe(true);
  });

  it("hides responded (going) event from feed", () => {
    expect(isEventVisibleInFeed(makeEvent({ viewerRsvpStatus: "going" }))).toBe(false);
  });

  it("hides responded (not_going) event from feed", () => {
    expect(isEventVisibleInFeed(makeEvent({ viewerRsvpStatus: "not_going" }))).toBe(false);
  });

  it("hides responded (interested/saved) event from feed", () => {
    expect(isEventVisibleInFeed(makeEvent({ viewerRsvpStatus: "interested" }))).toBe(false);
  });
});

// ── getDiscoverVisibility (classifier) ──

describe("getDiscoverVisibility", () => {
  it("classifies a non-responded public event with coords", () => {
    const result = getDiscoverVisibility(makeEvent());
    expect(result).toEqual({
      isResponded: false,
      isVisibleInMap: true,
      isVisibleInFeed: true,
    });
  });

  it("classifies a responded private event without coords", () => {
    const result = getDiscoverVisibility(
      makeEvent({ viewerRsvpStatus: "going", visibility: "private", latitude: null, longitude: null }),
    );
    expect(result).toEqual({
      isResponded: true,
      isVisibleInMap: false,
      isVisibleInFeed: false,
    });
  });

  it("classifies a non-responded hideDetailsUntilRsvp event", () => {
    const result = getDiscoverVisibility(makeEvent({ hideDetailsUntilRsvp: true }));
    expect(result).toEqual({
      isResponded: false,
      isVisibleInMap: false,
      isVisibleInFeed: true,
    });
  });
});
