/**
 * Suggested Hours SSOT — src/lib/quietHours.ts
 *
 * Canonical module for suggested-hours filtering and social slot scoring.
 * "Suggested hours" = the allowed scheduling window shown to users.
 * "Quiet hours" = the inverse (outside the window) — hidden from suggestions.
 * All scheduling UI reads presets, filters, and scores through this file.
 *
 * INV: computeSchedule engine is NEVER modified here — we only post-filter.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SchedulingSlotResult } from "@/lib/scheduling/types";

// ---------------------------------------------------------------------------
// A) Presets
// ---------------------------------------------------------------------------

export type SuggestedHoursPreset = "early_bird" | "default" | "night_owl" | "late_late";
/** @deprecated Use SuggestedHoursPreset — kept for call-site compat during migration */
export type QuietHoursPreset = SuggestedHoursPreset;

export interface SuggestedHoursWindow {
  startHour: number; // 0-23  (local)
  endHour: number;   // 5-26  (>24 = crosses midnight into next day)
}

const PRESET_MAP: Record<SuggestedHoursPreset, SuggestedHoursWindow> = {
  early_bird: { startHour: 6, endHour: 21 },   // 6 AM – 9 PM
  default:    { startHour: 8, endHour: 22 },   // 8 AM – 10 PM
  night_owl:  { startHour: 12, endHour: 24 },  // 12 PM – 12 AM
  late_late:  { startHour: 15, endHour: 26 },  // 3 PM – 2 AM (overnight)
};

/** True when the window crosses midnight (startHour's minutes > endHour's minutes in mod-1440 terms). */
export function isOvernightWindow(w: SuggestedHoursWindow): boolean {
  return w.endHour > 24;
}

export const PRESET_LABELS: Record<SuggestedHoursPreset, { label: string; range: string }> = {
  early_bird: { label: "Early bird",  range: "6:00 AM \u2013 9:00 PM" },
  default:    { label: "Default",     range: "8:00 AM \u2013 10:00 PM" },
  night_owl:  { label: "Night owl",   range: "12:00 PM \u2013 12:00 AM" },
  late_late:  { label: "Late late",   range: "3:00 PM \u2013 2:00 AM (overnight)" },
};

export const ALL_PRESETS: SuggestedHoursPreset[] = ["early_bird", "default", "night_owl", "late_late"];

export function getSuggestedHoursForPreset(preset: SuggestedHoursPreset): SuggestedHoursWindow {
  return PRESET_MAP[preset] ?? PRESET_MAP.default;
}
/** @deprecated Use getSuggestedHoursForPreset */
export const getQuietHoursForPreset = getSuggestedHoursForPreset;

// ---------------------------------------------------------------------------
// B) Persistence
// ---------------------------------------------------------------------------

// Legacy-named key — kept stable for V1 so existing users retain their preference.
const STORAGE_KEY = "oi_quiet_hours_preset_v1";

export async function loadSuggestedHoursPreset(): Promise<SuggestedHoursPreset> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw && ALL_PRESETS.includes(raw as SuggestedHoursPreset)) {
      return raw as SuggestedHoursPreset;
    }
  } catch {
    // Silently fall back to default — storage read failure is non-fatal
  }
  return "default";
}
/** @deprecated Use loadSuggestedHoursPreset */
export const loadQuietHoursPreset = loadSuggestedHoursPreset;

export async function saveSuggestedHoursPreset(preset: SuggestedHoursPreset): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preset);
  } catch {
    // Silently ignore — persistence failure is non-fatal
  }
}
/** @deprecated Use saveSuggestedHoursPreset */
export const saveQuietHoursPreset = saveSuggestedHoursPreset;

// ---------------------------------------------------------------------------
// C) Slot filtering (clamp)
// ---------------------------------------------------------------------------

/**
 * Filter slots to those fully within the suggested-hours window.
 *
 * Normal window (endHour <= 24): slot passes if localStart >= startMin AND localEnd <= endMin.
 * Overnight window (endHour > 24): slot passes if it falls in the evening portion
 *   (localStart >= startMin, before midnight) OR the morning portion (localEnd <= overflowMin,
 *   starting from midnight). This avoids accidentally including mid-morning times.
 *
 * For endHour == 24, treat as 1440 (midnight boundary).
 * For endHour > 24, overflowMin = (endHour - 24) * 60 (e.g. 26 → 120 = 2:00 AM).
 */
export function filterSlotsToSuggestedHours(
  slots: SchedulingSlotResult[],
  window: SuggestedHoursWindow,
): SchedulingSlotResult[] {
  const startMin = window.startHour * 60;
  const overnight = window.endHour > 24;
  // For normal windows and the evening portion of overnight: cap at 1440 (midnight)
  const endMinCapped = overnight ? 1440 : window.endHour * 60;
  // For overnight windows: the morning overflow cap (e.g. 2 AM = 120 min)
  const overflowMin = overnight ? (window.endHour - 24) * 60 : 0;

  return slots.filter((slot) => {
    const s = new Date(slot.start);
    const e = new Date(slot.end);
    const sMin = s.getHours() * 60 + s.getMinutes();
    // If end is exactly midnight (00:00), treat as 1440 minutes (end of day)
    const eH = e.getHours();
    const eM = e.getMinutes();
    const eMin = (eH === 0 && eM === 0) ? 1440 : eH * 60 + eM;

    // Case A: Normal window (no midnight crossing)
    if (!overnight) {
      return sMin >= startMin && eMin <= endMinCapped;
    }
    // Case B: Overnight — evening portion (slot starts at/after startMin, ends at/before midnight)
    if (sMin >= startMin && eMin <= 1440) return true;
    // Case C: Overnight — morning overflow (slot starts at/after midnight, ends at/before overflowMin)
    if (sMin >= 0 && sMin < overflowMin && eMin <= overflowMin) return true;
    return false;
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
  preset: SuggestedHoursPreset,
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
 * Filter + sort slots by suggested hours + social score.
 * Returns a new array (does not mutate).
 */
export function rankSlotsForPreset(
  slots: SchedulingSlotResult[],
  preset: SuggestedHoursPreset,
): SchedulingSlotResult[] {
  const window = getSuggestedHoursForPreset(preset);
  const filtered = filterSlotsToSuggestedHours(slots, window);
  return [...filtered].sort((a, b) => scoreSlotSocial(b, preset) - scoreSlotSocial(a, preset));
}
