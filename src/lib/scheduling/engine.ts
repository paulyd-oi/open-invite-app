/**
 * Scheduling Engine v1
 *
 * SSOT for circle availability computation.
 * INV-S1: Single Source of Truth — UI must render engine output only.
 * INV-S2: Deterministic — same inputs → same ranked results.
 * INV-S3: Always returns at least 1 slot when valid range.
 * INV-S4: Transparent participation fields on every slot.
 *
 * DEV proof tag: [SCHED_ENGINE_V1]
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

/**
 * Check if a time window [slotStart, slotEnd) overlaps with a busy window.
 */
function overlaps(slotStartMs: number, slotEndMs: number, busy: BusyWindow): boolean {
  const bStart = new Date(busy.start).getTime();
  const bEnd = new Date(busy.end).getTime();
  return slotStartMs < bEnd && slotEndMs > bStart;
}

/**
 * Check if a user is busy during a given slot.
 * Busy windows should be sorted by start for early-exit optimisation.
 */
function isUserBusy(
  slotStartMs: number,
  slotEndMs: number,
  busyWindows: BusyWindow[],
): boolean {
  for (const bw of busyWindows) {
    // Early exit: if busy window starts after slot ends, remaining are later too
    const bStart = new Date(bw.start).getTime();
    if (bStart >= slotEndMs) break;
    if (overlaps(slotStartMs, slotEndMs, bw)) return true;
  }
  return false;
}

/**
 * Sort busy windows by start time (mutates in-place for perf).
 */
function sortBusyWindows(windows: BusyWindow[]): BusyWindow[] {
  return windows.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/**
 * Compute ranked availability slots for a circle.
 *
 * Returns `null` if the input range is invalid or produces zero slots
 * (e.g. rangeEnd <= rangeStart). UI should not render the section in that case.
 */
export function computeSchedule(
  input: SchedulingComputeInput,
): SchedulingEngineResult | null {
  const {
    members,
    busyWindowsByUserId,
    rangeStart,
    rangeEnd,
    intervalMinutes = DEFAULT_INTERVAL_MINUTES,
    slotDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES,
    quorumCount,
  } = input;

  const rangeStartMs = new Date(rangeStart).getTime();
  const rangeEndMs = new Date(rangeEnd).getTime();
  const intervalMs = intervalMinutes * 60 * 1000;
  const durationMs = slotDurationMinutes * 60 * 1000;
  const totalMembers = members.length;

  // Guard: invalid range
  if (rangeEndMs <= rangeStartMs || totalMembers === 0) {
    return null;
  }

  // Pre-sort busy windows per user for early-exit optimisation
  const sortedBusy: Record<string, BusyWindow[]> = {};
  for (const m of members) {
    const windows = busyWindowsByUserId[m.id];
    sortedBusy[m.id] = windows ? sortBusyWindows([...windows]) : [];
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

  const topSlots = slots.slice(0, MAX_TOP_SLOTS);
  const bestSlot = topSlots[0];
  const hasPerfectOverlap = bestSlot.score === 1;

  const result: SchedulingEngineResult = {
    bestSlot,
    topSlots,
    hasPerfectOverlap,
  };

  // [SCHED_ENGINE_V1] Proof log: once per compute
  if (__DEV__) {
    devLog("[SCHED_ENGINE_V1]", "compute", {
      memberCount: totalMembers,
      rangeStart,
      rangeEnd,
      intervalMinutes,
      slotDurationMinutes,
      totalSlotsGenerated: slots.length,
      bestSlot: {
        start: bestSlot.start,
        available: bestSlot.availableCount,
        total: bestSlot.totalMembers,
        pct: bestSlot.availabilityPercent,
      },
      top3: topSlots.map((s) => ({
        start: s.start,
        available: s.availableCount,
        pct: s.availabilityPercent,
      })),
      hasPerfectOverlap,
    });
  }

  return result;
}
