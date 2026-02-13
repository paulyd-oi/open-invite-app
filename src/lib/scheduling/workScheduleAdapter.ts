/**
 * Work Schedule → BusyWindow adapter
 *
 * SSOT: Converts a user's work schedule (recurring weekly blocks)
 * into BusyWindow[] for a given date range so the scheduling engine
 * treats work hours identically to any other busy block.
 *
 * DEV proof tag: [P0_WORK_HOURS_BLOCK]
 */
import { devLog } from "@/lib/devLog";
import type { BusyWindow } from "./types";

/** Minimal shape of one work-schedule day (matches settings + calendar usage). */
export interface WorkScheduleDay {
  dayOfWeek: number; // 0=Sun … 6=Sat
  isEnabled: boolean;
  startTime: string | null; // "HH:MM"
  endTime: string | null;   // "HH:MM"
  label?: string;
  block2StartTime?: string | null;
  block2EndTime?: string | null;
}

/**
 * Build BusyWindow[] from a work schedule for every day inside
 * [rangeStart, rangeEnd).
 *
 * - Each enabled day of the week generates one (or two, if block2) busy
 *   windows per calendar day within the range.
 * - Times are interpreted in the device's local timezone (same convention
 *   used by calendar.tsx when generating pseudo-events).
 * - Returns windows with source = "work_schedule".
 */
export function buildWorkScheduleBusyWindows(
  schedules: WorkScheduleDay[],
  rangeStart: string,
  rangeEnd: string,
): BusyWindow[] {
  if (!schedules || schedules.length === 0) return [];

  const windows: BusyWindow[] = [];
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return [];

  // Build a lookup by dayOfWeek for O(1) access
  const byDay = new Map<number, WorkScheduleDay>();
  for (const s of schedules) {
    if (s.isEnabled && s.startTime && s.endTime) {
      byDay.set(s.dayOfWeek, s);
    }
  }
  if (byDay.size === 0) return [];

  // Walk each calendar day in the range
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < end) {
    const dow = cursor.getDay();
    const sched = byDay.get(dow);
    if (sched && sched.startTime && sched.endTime) {
      // Block 1
      const b1 = parseTimeBlock(cursor, sched.startTime, sched.endTime);
      if (b1) windows.push(b1);

      // Block 2 (split schedule)
      if (sched.block2StartTime && sched.block2EndTime) {
        const b2 = parseTimeBlock(cursor, sched.block2StartTime, sched.block2EndTime);
        if (b2) windows.push(b2);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (__DEV__) {
    devLog("[P0_WORK_HOURS_BLOCK]", "buildWorkScheduleBusyWindows", {
      scheduleDays: byDay.size,
      rangeStart,
      rangeEnd,
      windowsGenerated: windows.length,
    });
  }

  return windows;
}

/** Parse "HH:MM" time strings into a BusyWindow on a given date. */
function parseTimeBlock(
  date: Date,
  startTimeStr: string,
  endTimeStr: string,
): BusyWindow | null {
  const [sh, sm] = startTimeStr.split(":").map(Number);
  const [eh, em] = endTimeStr.split(":").map(Number);
  if ([sh, sm, eh, em].some((v) => isNaN(v))) return null;

  const s = new Date(date);
  s.setHours(sh, sm, 0, 0);
  const e = new Date(date);
  e.setHours(eh, em, 0, 0);

  if (e <= s) return null;

  return { start: s.toISOString(), end: e.toISOString(), source: "work_schedule" };
}

/**
 * Merge work-schedule busy windows into an existing busyWindowsByUserId map.
 * Only adds windows for userIds present in the map (or adds the key if missing).
 *
 * @param existing - mutable map that will be enriched in-place
 * @param userId - the user whose work schedule this represents
 * @param workWindows - output of buildWorkScheduleBusyWindows()
 */
export function mergeWorkScheduleWindows(
  existing: Record<string, BusyWindow[]>,
  userId: string,
  workWindows: BusyWindow[],
): void {
  if (workWindows.length === 0) return;
  if (!existing[userId]) {
    existing[userId] = [];
  }
  existing[userId] = existing[userId].concat(workWindows);
}
