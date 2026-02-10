/**
 * Scheduling Engine v1 — Types
 *
 * SSOT types for circle availability computation.
 * INV-S1: UI must not compute availability counts itself.
 * INV-S4: Each slot returns transparent participation fields.
 */

/** A busy window for one user (ISO-8601 strings). */
export interface BusyWindow {
  start: string; // ISOString
  end: string;   // ISOString
}

/** Input to the scheduling engine. */
export interface SchedulingComputeInput {
  /** Circle members (only id needed). */
  members: { id: string }[];
  /** Busy windows keyed by userId. Users with no entry are treated as fully free. */
  busyWindowsByUserId: Record<string, BusyWindow[]>;
  /** Start of the date range to scan (ISOString). */
  rangeStart: string;
  /** End of the date range to scan (ISOString). */
  rangeEnd: string;
  /** Slot interval in minutes (default 30). */
  intervalMinutes?: number;
  /** Duration of each candidate slot in minutes (default 60). */
  slotDurationMinutes?: number;
  /** Optional quorum: minimum people needed for a slot to count. */
  quorumCount?: number;
  /** Max top-ranked slots to return (default 3). */
  maxTopSlots?: number;
}

/** A single ranked availability slot. */
export interface SchedulingSlotResult {
  start: string; // ISOString
  end: string;   // ISOString
  availableCount: number;
  totalMembers: number;
  availabilityPercent: number;
  quorumMet: boolean;
  score: number;
  /** User IDs available during this slot (for future "Details" expansion). */
  availableUserIds: string[];
  /** User IDs unavailable during this slot (for future "Details" expansion). */
  unavailableUserIds: string[];
}

/** Output of the scheduling engine. */
export interface SchedulingEngineResult {
  /** Best slot overall. */
  bestSlot: SchedulingSlotResult;
  /** Top 3 ranked slots. */
  topSlots: SchedulingSlotResult[];
  /** True if the best slot has 100% availability. */
  hasPerfectOverlap: boolean;
}
