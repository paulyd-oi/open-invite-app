/**
 * Quiet Hours SSOT — src/lib/quietHours.ts
 *
 * Canonical module for quiet-hours filtering and social slot scoring.
 * All scheduling UI reads presets, filters, and scores through this file.
 *
 * INV: computeSchedule engine is NEVER modified here — we only post-filter.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SchedulingSlotResult } from "@/lib/scheduling/types";

// ---------------------------------------------------------------------------
// A) Presets
// ---------------------------------------------------------------------------

export type QuietHoursPreset = "early_bird" | "default" | "night_owl" | "late_late";

export interface QuietHoursWindow {
  startHour: number; // 0-23  (local)
  endHour: number;   // 5-26  (>24 = crosses midnight into next day)
}

const PRESET_MAP: Record<QuietHoursPreset, QuietHoursWindow> = {
  early_bird: { startHour: 5, endHour: 21 },
  default:    { startHour: 5, endHour: 22 },
  night_owl:  { startHour: 7, endHour: 24 },
  // V1: late_late clamped to endHour 24 (midnight) for safety.
  // Cross-midnight (endHour 26 = 2 AM next day) deferred to V2 — documented in HANDOFF.
  late_late:  { startHour: 9, endHour: 24 },
};

export const PRESET_LABELS: Record<QuietHoursPreset, { label: string; range: string }> = {
  early_bird: { label: "Early bird",  range: "5:00 AM \u2013 9:00 PM" },
  default:    { label: "Default",     range: "5:00 AM \u2013 10:00 PM" },
  night_owl:  { label: "Night owl",   range: "7:00 AM \u2013 12:00 AM" },
  late_late:  { label: "Late late",   range: "9:00 AM \u2013 12:00 AM" },
};

export const ALL_PRESETS: QuietHoursPreset[] = ["early_bird", "default", "night_owl", "late_late"];

export function getQuietHoursForPreset(preset: QuietHoursPreset): QuietHoursWindow {
  return PRESET_MAP[preset] ?? PRESET_MAP.default;
}

// ---------------------------------------------------------------------------
// B) Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "oi_quiet_hours_preset_v1";

export async function loadQuietHoursPreset(): Promise<QuietHoursPreset> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw && ALL_PRESETS.includes(raw as QuietHoursPreset)) {
      return raw as QuietHoursPreset;
    }
  } catch {
    // Silently fall back to default — storage read failure is non-fatal
  }
  return "default";
}

export async function saveQuietHoursPreset(preset: QuietHoursPreset): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preset);
  } catch {
    // Silently ignore — persistence failure is non-fatal
  }
}

// ---------------------------------------------------------------------------
// C) Slot filtering (clamp)
// ---------------------------------------------------------------------------

/**
 * Filter slots to those fully within the quiet-hours window.
 * A slot passes if its LOCAL start hour:minute >= startHour:00
 * AND its LOCAL end hour:minute <= endHour:00.
 *
 * For endHour == 24, we treat it as 00:00 next day (1440 minutes).
 * For endHour > 24 (V2 cross-midnight), currently clamped to 24 in PRESET_MAP.
 */
export function filterSlotsToQuietHours(
  slots: SchedulingSlotResult[],
  window: QuietHoursWindow,
): SchedulingSlotResult[] {
  const startMin = window.startHour * 60;
  // endHour 24 → 1440 minutes, which matches a slot ending at exactly midnight (00:00 next day = 24*60)
  const endMin = window.endHour * 60;

  return slots.filter((slot) => {
    const s = new Date(slot.start);
    const e = new Date(slot.end);
    const sMin = s.getHours() * 60 + s.getMinutes();
    // If end is exactly midnight (00:00), treat as 1440 minutes (end of day)
    const eH = e.getHours();
    const eM = e.getMinutes();
    const eMin = (eH === 0 && eM === 0) ? 1440 : eH * 60 + eM;
    return sMin >= startMin && eMin <= endMin;
  });
}

// ---------------------------------------------------------------------------
// D) Social scoring
// ---------------------------------------------------------------------------

/**
 * Score a slot for "socially smart" ranking.
 *
 * Combined score = availabilityWeight (0-1) * 0.6
 *                + timeOfDayWeight   (0-1) * 0.3
 *                + presetBonus       (0-0.1)
 *
 * Higher is better. Deterministic.
 */
export function scoreSlotSocial(
  slot: SchedulingSlotResult,
  preset: QuietHoursPreset,
): number {
  const slotDate = new Date(slot.start);
  const hour = slotDate.getHours();
  const dayOfWeek = slotDate.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // 1) Availability ratio — most important
  const availRatio = slot.totalMembers > 0
    ? slot.availableCount / slot.totalMembers
    : 0;

  // 2) Time-of-day preference
  let todWeight = 0.3; // baseline
  if (isWeekend) {
    if (hour >= 11 && hour < 15) todWeight = 1.0;
    else if (hour >= 15 && hour < 19) todWeight = 0.8;
    else if (hour >= 9 && hour < 11) todWeight = 0.6;
    else if (hour >= 19 && hour < 22) todWeight = 0.5;
    else todWeight = 0.2;
  } else {
    // Weekday
    if (hour >= 18 && hour < 21) todWeight = 1.0;
    else if (hour >= 12 && hour < 17) todWeight = 0.7;
    else if (hour >= 9 && hour < 12) todWeight = 0.6;
    else if (hour >= 21 && hour < 22) todWeight = 0.4;
    else todWeight = 0.2;
  }

  // 3) Preset sensitivity bonus (small, ±0.1)
  let presetBonus = 0;
  if (preset === "early_bird" && hour >= 7 && hour < 10) presetBonus = 0.1;
  else if (preset === "night_owl" && hour >= 20 && hour < 24) presetBonus = 0.1;
  else if (preset === "night_owl" && hour >= 5 && hour < 8) presetBonus = -0.05;
  else if (preset === "late_late" && hour >= 21) presetBonus = 0.1;

  return availRatio * 0.6 + todWeight * 0.3 + presetBonus;
}

/**
 * Filter + sort slots by quiet hours + social score.
 * Returns a new array (does not mutate).
 */
export function rankSlotsForPreset(
  slots: SchedulingSlotResult[],
  preset: QuietHoursPreset,
): SchedulingSlotResult[] {
  const window = getQuietHoursForPreset(preset);
  const filtered = filterSlotsToQuietHours(slots, window);
  return [...filtered].sort((a, b) => scoreSlotSocial(b, preset) - scoreSlotSocial(a, preset));
}
