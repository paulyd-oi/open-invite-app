import { BASE_HEIGHTS } from "@/components/calendar/CalendarDayCells";
import type { ViewMode } from "@/components/calendar/CalendarHeaderChrome";

export { type ViewMode };

export const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
export const DAYS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const CALENDAR_VIEW_HEIGHT_KEY = "@openinvite_calendar_view_height";
export const GUIDE_SEEN_KEY_PREFIX = "guide_seen::";

// Unified height system - continuous scale from compact through details
// compact: 40-64, stacked: 64-80, details: 80-160
export const UNIFIED_MIN_HEIGHT = 40;  // Compact minimum
export const UNIFIED_MAX_HEIGHT = 160; // Details maximum (2x)

// Thresholds for view mode transitions (based on unified height)
export const COMPACT_TO_STACKED_THRESHOLD = 64;  // When height reaches stacked base
export const STACKED_TO_DETAILS_THRESHOLD = 80;  // When height reaches details base

export function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
export function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// Format date as "Jan. 4th"
export function formatDateShort(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = date.getDate();
  return `${months[date.getMonth()]}. ${day}${getOrdinalSuffix(day)}`;
}

// Get current view mode based on unified height
export function getViewModeFromHeight(height: number): ViewMode {
  if (height < COMPACT_TO_STACKED_THRESHOLD) return "compact";
  if (height < STACKED_TO_DETAILS_THRESHOLD) return "stacked";
  return "details";
}

// Get height multiplier for a specific view mode given the unified height
export function getHeightMultiplierForMode(unifiedHeight: number, mode: ViewMode): number {
  const baseHeight = BASE_HEIGHTS[mode];

  switch (mode) {
    case "compact":
      // Compact range: 40-64, multiplier 1.0-1.6
      return Math.min(unifiedHeight / baseHeight, 1.6);
    case "stacked":
      // Stacked range: 64-80, multiplier 1.0-1.25
      return Math.max(0.75, Math.min(unifiedHeight / baseHeight, 1.25));
    case "details":
      // Details range: 80-160, multiplier 1.0-2.0
      return Math.max(0.75, unifiedHeight / baseHeight);
    default:
      return 1;
  }
}
