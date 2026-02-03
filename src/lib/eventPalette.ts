/**
 * EVENT PALETTE — Single Source of Truth
 * 
 * INVARIANT: Busy and Work events MUST ALWAYS render with grey palette (#6B7280 bar, #6B728020 bg).
 * This module is the ONLY place that determines event colors.
 * All calendar renderers (month bars, dots, day list, day sheet, FeedCalendar) MUST use this.
 */

import { devLog, devError } from "./devLog";

export interface EventPalette {
  bar: string;    // Left bar / primary color / dot color
  bg: string;     // Background tint (20% alpha)
  icon: string;   // Icon color
  text: string;   // Text color for overlays
}

// Canonical grey palette for busy/work events - NEVER use theme color
const GREY_PALETTE: EventPalette = {
  bar: "#6B7280",
  bg: "#6B728020",
  icon: "#6B7280",
  text: "#6B7280",
};

// Pink palette for birthdays
const BIRTHDAY_PALETTE: EventPalette = {
  bar: "#FF69B4",
  bg: "#FF69B420",
  icon: "#FF69B4",
  text: "#FF69B4",
};

/**
 * Determine if an event should use grey palette (busy, work, or imported)
 */
export function isGreyPaletteEvent(event: { isBusy?: boolean; isWork?: boolean; isImported?: boolean; deviceCalendarId?: string | null }): boolean {
  return event.isBusy === true || event.isWork === true || event.isImported === true || (event.deviceCalendarId != null && event.deviceCalendarId !== "");
}

/**
 * INVARIANT: This is the ONLY function that should determine event colors.
 * All render paths must use this function to ensure busy/work/imported events are ALWAYS grey.
 * 
 * @param event - Event object with optional isBusy, isWork, isImported, deviceCalendarId, isBirthday, color, groupVisibility
 * @param themeColor - User's theme color (orange default)
 * @param overrideColor - Optional user-specified color override (takes precedence over default)
 * @returns EventPalette with bar, bg, icon, and text colors
 */
export function getEventPalette(
  event: {
    isBusy?: boolean;
    isWork?: boolean;
    isImported?: boolean;
    deviceCalendarId?: string | null;
    isBirthday?: boolean;
    color?: string | null;
    groupVisibility?: Array<{ group: { color: string } }> | null;
  },
  themeColor: string,
  overrideColor?: string | null
): EventPalette {
  // If user has set a color override, use that (allows customizing ANY event including busy/work)
  if (overrideColor) {
    if (__DEV__) {
      devLog("[EventPalette] Using override color:", { overrideColor, eventTitle: (event as any)?.title });
    }
    return {
      bar: overrideColor,
      bg: `${overrideColor}20`,
      icon: overrideColor,
      text: overrideColor,
    };
  }

  // INVARIANT: Busy/Work/Imported events ALWAYS use grey palette, regardless of any other property
  const title = (event as any)?.title;
  const isLegacyBusyTitle =
    typeof title === "string" && title.trim().toLowerCase() === "busy";

  const isLegacyBusyFlag =
    (event as any)?.busy === true ||
    (event as any)?.isBusyBlock === true ||
    (event as any)?.isBusyEvent === true ||
    (event as any)?.busyBlock === true;

  // Imported events (from Apple/Google Calendar) should render as grey busy blocks
  const isImportedEvent = event.isImported === true || (event.deviceCalendarId != null && event.deviceCalendarId !== "");

  if (event.isBusy === true || event.isWork === true || isLegacyBusyTitle || isLegacyBusyFlag || isImportedEvent) {
    // DEV assertion - this should never fail if called correctly
    if (__DEV__) {
      // Log will be added at call sites for more context
    }
    return GREY_PALETTE;
  }

  // Birthday events get pink
  if (event.isBirthday) {
    return BIRTHDAY_PALETTE;
  }

  // Determine base color from event properties
  let baseColor = themeColor;
  if (event.color) {
    baseColor = event.color;
  } else if (event.groupVisibility && event.groupVisibility.length > 0) {
    baseColor = event.groupVisibility[0].group.color;
  }

  return {
    bar: baseColor,
    bg: `${baseColor}20`,
    icon: baseColor,
    text: baseColor,
  };
}

/**
 * DEV-only assertion for grey palette invariant.
 * Call this after getting palette to verify busy/work/imported events got grey.
 */
export function assertGreyPaletteInvariant(
  event: { id?: string; isBusy?: boolean; isWork?: boolean; isImported?: boolean; deviceCalendarId?: string | null },
  palette: EventPalette,
  source: string
): void {
  if (!__DEV__) return;

  const isImportedEvent = event.isImported === true || (event.deviceCalendarId != null && event.deviceCalendarId !== "");
  const shouldBeGrey = event.isBusy === true || event.isWork === true || isImportedEvent;
  const isGrey = palette.bar === GREY_PALETTE.bar;

  if (shouldBeGrey && !isGrey) {
    devError("[BUSY_GREY_INVARIANT_FAIL]", {
      eventId: event.id,
      isBusy: event.isBusy,
      isWork: event.isWork,
      isImported: event.isImported,
      deviceCalendarId: event.deviceCalendarId,
      actualBar: palette.bar,
      expectedBar: GREY_PALETTE.bar,
      source,
    });
  }
}

/**
 * Get just the bar color for simple use cases (month dots/bars).
 * Still respects busy/work/imported grey invariant unless override is provided.
 */
export function getEventBarColor(
  event: {
    isBusy?: boolean;
    isWork?: boolean;
    isImported?: boolean;
    deviceCalendarId?: string | null;
    isBirthday?: boolean;
    color?: string | null;
    groupVisibility?: Array<{ group: { color: string } }> | null;
  },
  themeColor: string,
  overrideColor?: string | null
): string {
  return getEventPalette(event, themeColor, overrideColor).bar;
}
