/**
 * Scheduling Engine v1
 *
 * SSOT for circle availability computation.
 * INV-S1: Single Source of Truth — UI must render engine output only.
 * INV-S2: Deterministic — same inputs → same ranked results.
 * INV-S3: Always returns at least 1 slot when valid range.
 * INV-S4: Transparent participation fields on every slot.
 *
 * DEV proof tag: [SCHED_INVAR_V1]
 */
import { devLog } from "@/lib/devLog";
import type {
  SchedulingComputeInput,
  SchedulingSlotResult,
  SchedulingEngineResult,
  BusyWindow,
} from "./types";

const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_SLOT_DURATION_MINUTES = 60;
const MAX_TOP_SLOTS = 3;

/** Safety clamp: max range the engine will scan (30 days). */
const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Safety clamp: minimum interval to prevent runaway slot generation. */
const MIN_INTERVAL_MINUTES = 5;

/**
 * Check if a time window [slotStart, slotEnd) overlaps with a busy window.
 */
function overlaps(slotStartMs: number, slotEndMs: number, bStartMs: number, bEndMs: number): boolean {
  return slotStartMs < bEndMs && slotEndMs > bStartMs;
}

/** Pre-parsed busy window with ms timestamps for perf. */
interface ParsedBusyWindow {
  startMs: number;
  endMs: number;
}

/**
 * Check if a user is busy during a given slot.
 * Busy windows must be sorted by startMs for early-exit optimisation.
 */
function isUserBusy(
  slotStartMs: number,
  slotEndMs: number,
  windows: ParsedBusyWindow[],
): boolean {
  for (const bw of windows) {
    // Early exit: if busy window starts at or after slot end, all remaining are later
    if (bw.startMs >= slotEndMs) break;
    if (overlaps(slotStartMs, slotEndMs, bw.startMs, bw.endMs)) return true;
  }
  return false;
}

/**
 * Parse and sort busy windows into pre-parsed form.
 * Returns a NEW array — never mutates the caller's data.
 */
function parseSortBusyWindows(windows: BusyWindow[]): ParsedBusyWindow[] {
  return windows
    .map((w) => ({
      startMs: new Date(w.start).getTime(),
      endMs: new Date(w.end).getTime(),
    }))
    .filter((w) => !isNaN(w.startMs) && !isNaN(w.endMs) && w.endMs > w.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * Compute ranked availability slots for a circle.
 *
 * Returns `null` if the input range is invalid or produces zero slots
 * (e.g. rangeEnd <= rangeStart). UI should not render the section in that case.
 *
 * Safety clamps applied:
 * - Range clamped to MAX_RANGE_MS (30 days) to prevent pathological generation.
 * - NaN dates → null.
 * - intervalMinutes floored to MIN_INTERVAL_MINUTES.
 */
export function computeSchedule(
  input: SchedulingComputeInput,
): SchedulingEngineResult | null {
  const {
    members,
    busyWindowsByUserId,
    rangeStart,
    rangeEnd,
    intervalMinutes: rawInterval = DEFAULT_INTERVAL_MINUTES,
    slotDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES,
    quorumCount,
  } = input;

  const rangeStartMs = new Date(rangeStart).getTime();
  let rangeEndMs = new Date(rangeEnd).getTime();
  const intervalMinutes = Math.max(rawInterval, MIN_INTERVAL_MINUTES);
  const intervalMs = intervalMinutes * 60 * 1000;
  const durationMs = slotDurationMinutes * 60 * 1000;
  const totalMembers = members.length;

  // Guard: NaN dates or empty members
  if (isNaN(rangeStartMs) || isNaN(rangeEndMs) || totalMembers === 0) {
    if (__DEV__) devLog('[SCHED_INVAR_V1]', 'FAIL input_guard', { rangeStartNaN: isNaN(rangeStartMs), rangeEndNaN: isNaN(rangeEndMs), totalMembers });
    return null;
  }

  // Guard: invalid range
  if (rangeEndMs <= rangeStartMs) {
    if (__DEV__) devLog('[SCHED_INVAR_V1]', 'FAIL range_inverted', { rangeStart, rangeEnd });
    return null;
  }

  // DEV: validate remaining inputs
  if (__DEV__) {
    if (intervalMinutes <= 0) devLog('[SCHED_INVAR_V1]', 'FAIL intervalMinutes<=0', { intervalMinutes });
    if (slotDurationMinutes <= 0) devLog('[SCHED_INVAR_V1]', 'FAIL slotDurationMinutes<=0', { slotDurationMinutes });
    if (slotDurationMinutes < intervalMinutes) devLog('[SCHED_INVAR_V1]', 'WARN slotDuration<interval', { slotDurationMinutes, intervalMinutes });
    const rawMax = input.maxTopSlots;
    if (rawMax != null && (!Number.isInteger(rawMax) || rawMax < 1)) devLog('[SCHED_INVAR_V1]', 'WARN maxTopSlots_invalid', { rawMax });
  }

  // Sanitize maxTopSlots (NaN, 0, negative => default)
  const maxTopSlotsUsed = (input.maxTopSlots != null && Number.isInteger(input.maxTopSlots) && input.maxTopSlots >= 1)
    ? input.maxTopSlots
    : MAX_TOP_SLOTS;

  // Safety clamp: cap range to MAX_RANGE_MS
  if (rangeEndMs - rangeStartMs > MAX_RANGE_MS) {
    rangeEndMs = rangeStartMs + MAX_RANGE_MS;
  }

  // Pre-parse and sort busy windows per user (new arrays — no caller mutation)
  const sortedBusy: Record<string, ParsedBusyWindow[]> = {};
  for (const m of members) {
    const windows = busyWindowsByUserId[m.id];
    sortedBusy[m.id] = windows ? parseSortBusyWindows(windows) : [];
  }

  // Generate slots
  const slots: SchedulingSlotResult[] = [];
  for (let t = rangeStartMs; t + durationMs <= rangeEndMs; t += intervalMs) {
    const slotEnd = t + durationMs;
    const availableIds: string[] = [];
    const unavailableIds: string[] = [];

    for (const m of members) {
      if (isUserBusy(t, slotEnd, sortedBusy[m.id])) {
        unavailableIds.push(m.id);
      } else {
        availableIds.push(m.id);
      }
    }

    const availableCount = availableIds.length;
    const score = totalMembers > 0 ? availableCount / totalMembers : 0;
    const quorumMet = quorumCount != null ? availableCount >= quorumCount : true;

    slots.push({
      start: new Date(t).toISOString(),
      end: new Date(slotEnd).toISOString(),
      availableCount,
      totalMembers,
      availabilityPercent: Math.round(score * 100),
      quorumMet,
      score,
      availableUserIds: availableIds,
      unavailableUserIds: unavailableIds,
    });
  }

  // INV-S3: If no slots generated (very narrow range), return null
  if (slots.length === 0) {
    return null;
  }

  // Deterministic sort: score DESC, availableCount DESC, start ASC
  slots.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  // DEV: aggregate slot validation (no per-slot logging)
  if (__DEV__) {
    let countOutsideRange = 0;
    let countInvalidOrder = 0;
    for (const s of slots) {
      const sMs = new Date(s.start).getTime();
      const eMs = new Date(s.end).getTime();
      if (sMs < rangeStartMs || sMs > rangeEndMs) countOutsideRange++;
      if (eMs <= sMs) countInvalidOrder++;
    }
    if (countOutsideRange > 0 || countInvalidOrder > 0) {
      devLog('[SCHED_INVAR_V1]', 'FAIL slot_sanity', {
        totalSlots: slots.length,
        countOutsideRange,
        countInvalidOrder,
        rangeStart,
        rangeEnd,
      });
    }
  }

  const topSlots = slots.slice(0, maxTopSlotsUsed);
  const bestSlot = topSlots[0];
  const hasPerfectOverlap = bestSlot.score === 1;

  const result: SchedulingEngineResult = {
    bestSlot,
    topSlots,
    hasPerfectOverlap,
  };

  // [SCHED_INVAR_V1] Aggregate proof log: once per computeSchedule call
  if (__DEV__) {
    devLog('[SCHED_INVAR_V1]', 'compute_ok', {
      rangeStart,
      rangeEnd,
      intervalMinutes,
      slotDurationMinutes,
      memberCount: totalMembers,
      maxTopSlotsUsed,
      totalSlotsGenerated: slots.length,
      topSlotsReturned: topSlots.length,
      hasPerfectOverlap,
    });
  }

  return result;
}
