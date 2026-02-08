/**
 * Scheduling Adapter — events → busy windows
 *
 * Canonical helper that converts Open Invite member-event objects
 * into BusyWindow[] for the scheduling engine.
 *
 * SSOT: UI must not shape event data into busy windows itself.
 * This adapter is the single mapping layer between domain events
 * and the scheduling engine input contract.
 */
import type { BusyWindow } from "./types";

/** Default busy duration when endTime is missing (1 hour in ms). */
const DEFAULT_BUSY_DURATION_MS = 60 * 60 * 1000;

/**
 * Minimal event shape the adapter accepts.
 * Matches the memberEventSchema fields used for scheduling.
 */
export interface AdapterMemberEvent {
  startTime: string;
  endTime: string | null;
}

/**
 * Minimal member-events grouping shape.
 * Matches the memberEventsSchema from contracts.
 */
export interface AdapterMemberEvents {
  userId: string;
  events: AdapterMemberEvent[];
}

/**
 * Convert an array of member-event groups into busyWindowsByUserId
 * suitable for computeSchedule().
 *
 * - Does NOT mutate the input array or event objects.
 * - Defensively ignores events with invalid/NaN timestamps or end <= start.
 * - If endTime is null/missing, defaults to startTime + 1 hour.
 */
export function buildBusyWindowsFromMemberEvents(
  memberEvents: AdapterMemberEvents[],
): Record<string, BusyWindow[]> {
  const result: Record<string, BusyWindow[]> = {};

  for (const group of memberEvents) {
    const windows: BusyWindow[] = [];

    for (const evt of group.events) {
      const startMs = new Date(evt.startTime).getTime();
      if (isNaN(startMs)) continue;

      const endIso = evt.endTime ?? new Date(startMs + DEFAULT_BUSY_DURATION_MS).toISOString();
      const endMs = new Date(endIso).getTime();
      if (isNaN(endMs)) continue;

      // Skip invalid window: end must be after start
      if (endMs <= startMs) continue;

      windows.push({ start: evt.startTime, end: endIso });
    }

    result[group.userId] = windows;
  }

  return result;
}
