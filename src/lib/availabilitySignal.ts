/**
 * availabilitySignal.ts — Shared availability/conflict detection for event cards.
 *
 * Extracted from social.tsx getAvailabilityStatus() for reuse across:
 *   - Social feed (existing green/red border treatment)
 *   - Discover cards (future lightweight chips)
 *   - Event detail (future conflict indicator)
 *
 * SSOT for the overlap formula: eventStart < otherEnd AND eventEnd > otherStart
 *
 * [P0_AVAILABILITY_SIGNAL]
 */

// ─── Normalized availability states ─────────────────────────────────────────

/**
 * V1 availability signal — 4 states + unknown.
 *
 * | State             | Meaning                                        | Confidence |
 * |-------------------|------------------------------------------------|------------|
 * | free              | No calendar events overlap this time window    | High       |
 * | likely_free       | Calendar loaded but sparse — no overlap found  | Medium     |
 * | possible_conflict | Partial overlap (< 50% of event duration)      | Medium     |
 * | conflict          | Full or majority overlap with a calendar event | High       |
 * | unknown           | Calendar data not available                    | None       |
 */
export type AvailabilitySignal =
  | "free"
  | "likely_free"
  | "possible_conflict"
  | "conflict"
  | "unknown";

// ─── Chip copy mapping ──────────────────────────────────────────────────────

export interface AvailabilityChip {
  /** User-facing label */
  label: string;
  /** Semantic tone for color mapping (maps to STATUS tokens) */
  tone: "going" | "warning" | "destructive" | null;
}

/**
 * Map an availability signal to chip copy and tone.
 * Returns null chip for "unknown" — no chip should render.
 */
export function getAvailabilityChip(signal: AvailabilitySignal): AvailabilityChip | null {
  switch (signal) {
    case "free":
      return { label: "Looks clear", tone: "going" };
    case "likely_free":
      return { label: "Looks clear", tone: "going" };
    case "possible_conflict":
      return { label: "Might conflict", tone: "warning" };
    case "conflict":
      return { label: "Conflicts", tone: "destructive" };
    case "unknown":
      return null;
  }
}

// ─── Core overlap detection ─────────────────────────────────────────────────

/** Default duration when endTime is missing (1 hour). */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/** Minimum duration for point events in conflict check (1 minute). */
const MIN_DURATION_MS = 60 * 1000;

interface TimeWindow {
  startMs: number;
  endMs: number;
}

/**
 * Parse an event into a time window.
 * Returns null if startTime is missing or invalid.
 */
function parseEventWindow(event: { startTime: string; endTime?: string | null }): TimeWindow | null {
  if (!event.startTime) return null;
  const startMs = new Date(event.startTime).getTime();
  if (isNaN(startMs)) return null;

  let endMs: number;
  if (event.endTime) {
    endMs = new Date(event.endTime).getTime();
    if (isNaN(endMs) || endMs <= startMs) {
      endMs = startMs + DEFAULT_DURATION_MS;
    }
  } else {
    endMs = startMs + DEFAULT_DURATION_MS;
  }

  return { startMs, endMs };
}

/**
 * Compute overlap in milliseconds between two time windows.
 * Returns 0 if no overlap.
 */
function overlapMs(a: TimeWindow, b: TimeWindow): number {
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(a.endMs, b.endMs);
  return Math.max(0, end - start);
}

// ─── Main signal computation ────────────────────────────────────────────────

/**
 * Compute the availability signal for a candidate event against the user's
 * calendar events.
 *
 * @param candidateEvent  The event to check availability for (e.g. a Discover card).
 * @param calendarEvents  The user's own calendar events (created + RSVP'd).
 *                        Pass undefined if calendar data hasn't loaded yet.
 * @returns AvailabilitySignal
 *
 * Logic:
 * 1. No calendar data → "unknown"
 * 2. No valid time on candidate → "unknown"
 * 3. Check each calendar event for overlap:
 *    - Full/majority overlap (≥50% of candidate duration) → "conflict"
 *    - Partial overlap (<50%) → "possible_conflict"
 * 4. Calendar loaded but empty (no events at all) → "likely_free" (lower confidence)
 * 5. Calendar loaded with events, no overlap → "free"
 */
export function computeAvailabilitySignal(
  candidateEvent: { id: string; startTime: string; endTime?: string | null },
  calendarEvents: Array<{ id: string; startTime: string; endTime?: string | null }> | undefined,
): AvailabilitySignal {
  // No calendar data → unknown
  if (!calendarEvents) return "unknown";

  // Parse candidate time window
  const candidate = parseEventWindow(candidateEvent);
  if (!candidate) return "unknown";

  const candidateDuration = Math.max(candidate.endMs - candidate.startMs, MIN_DURATION_MS);

  // Track worst overlap ratio across all calendar events
  let worstOverlapRatio = 0;

  for (const calEvent of calendarEvents) {
    // Skip self-reference
    if (calEvent.id === candidateEvent.id) continue;

    const calWindow = parseEventWindow(calEvent);
    if (!calWindow) continue;

    const overlap = overlapMs(candidate, calWindow);
    if (overlap > 0) {
      const ratio = overlap / candidateDuration;
      worstOverlapRatio = Math.max(worstOverlapRatio, ratio);
    }
  }

  // Classify based on worst overlap
  if (worstOverlapRatio >= 0.5) return "conflict";
  if (worstOverlapRatio > 0) return "possible_conflict";

  // No overlap — confidence depends on whether calendar has any events
  if (calendarEvents.length === 0) return "likely_free";
  return "free";
}

// ─── Batch computation (for list views) ─────────────────────────────────────

/**
 * Compute availability signals for a batch of events.
 * Returns a Map of eventId → AvailabilitySignal.
 *
 * Efficient for list views: parses calendar windows once.
 */
export function computeAvailabilityBatch(
  candidateEvents: Array<{ id: string; startTime: string; endTime?: string | null }>,
  calendarEvents: Array<{ id: string; startTime: string; endTime?: string | null }> | undefined,
): Map<string, AvailabilitySignal> {
  const result = new Map<string, AvailabilitySignal>();

  if (!calendarEvents) {
    for (const event of candidateEvents) {
      result.set(event.id, "unknown");
    }
    return result;
  }

  // Pre-parse calendar windows once
  const calWindows: Array<{ id: string; window: TimeWindow }> = [];
  for (const calEvent of calendarEvents) {
    const window = parseEventWindow(calEvent);
    if (window) {
      calWindows.push({ id: calEvent.id, window });
    }
  }

  for (const candidate of candidateEvents) {
    const candidateWindow = parseEventWindow(candidate);
    if (!candidateWindow) {
      result.set(candidate.id, "unknown");
      continue;
    }

    const candidateDuration = Math.max(
      candidateWindow.endMs - candidateWindow.startMs,
      MIN_DURATION_MS,
    );

    let worstOverlapRatio = 0;

    for (const { id: calId, window: calWindow } of calWindows) {
      if (calId === candidate.id) continue;
      const overlap = overlapMs(candidateWindow, calWindow);
      if (overlap > 0) {
        worstOverlapRatio = Math.max(worstOverlapRatio, overlap / candidateDuration);
      }
    }

    if (worstOverlapRatio >= 0.5) {
      result.set(candidate.id, "conflict");
    } else if (worstOverlapRatio > 0) {
      result.set(candidate.id, "possible_conflict");
    } else if (calendarEvents.length === 0) {
      result.set(candidate.id, "likely_free");
    } else {
      result.set(candidate.id, "free");
    }
  }

  return result;
}
