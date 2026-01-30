/**
 * EVENT PALETTE — Single Source of Truth
 * 
 * INVARIANT: Busy and Work events MUST ALWAYS render with grey palette (#6B7280 bar, #6B728020 bg).
 * This module is the ONLY place that determines event colors.
 * All calendar renderers (month bars, dots, day list, day sheet, FeedCalendar) MUST use this.
 */

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
 * Determine if an event should use grey palette (busy or work)
 */
export function isGreyPaletteEvent(event: { isBusy?: boolean; isWork?: boolean }): boolean {
  return event.isBusy === true || event.isWork === true;
}

/**
 * INVARIANT: This is the ONLY function that should determine event colors.
 * All render paths must use this function to ensure busy/work events are ALWAYS grey.
 * 
 * @param event - Event object with optional isBusy, isWork, isBirthday, color, groupVisibility
 * @param themeColor - User's theme color (orange default)
 * @returns EventPalette with bar, bg, icon, and text colors
 */
export function getEventPalette(
  event: {
    isBusy?: boolean;
    isWork?: boolean;
    isBirthday?: boolean;
    color?: string | null;
    groupVisibility?: Array<{ group: { color: string } }> | null;
  },
  themeColor: string
): EventPalette {
  // INVARIANT: Busy/Work events ALWAYS use grey palette, regardless of any other property
  const title = (event as any)?.title;
  const isLegacyBusyTitle =
    typeof title === "string" && title.trim().toLowerCase() === "busy";

  const isLegacyBusyFlag =
    (event as any)?.busy === true ||
    (event as any)?.isBusyBlock === true ||
    (event as any)?.isBusyEvent === true ||
    (event as any)?.busyBlock === true;

  if (event.isBusy === true || event.isWork === true || isLegacyBusyTitle || isLegacyBusyFlag) {
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
 * Call this after getting palette to verify busy/work events got grey.
 */
export function assertGreyPaletteInvariant(
  event: { id?: string; isBusy?: boolean; isWork?: boolean },
  palette: EventPalette,
  source: string
): void {
  if (!__DEV__) return;

  const shouldBeGrey = event.isBusy === true || event.isWork === true;
  const isGrey = palette.bar === GREY_PALETTE.bar;

  if (shouldBeGrey && !isGrey) {
    console.error("[BUSY_GREY_INVARIANT_FAIL]", {
      eventId: event.id,
      isBusy: event.isBusy,
      isWork: event.isWork,
      actualBar: palette.bar,
      expectedBar: GREY_PALETTE.bar,
      source,
    });
  }
}

/**
 * Get just the bar color for simple use cases (month dots/bars).
 * Still respects busy/work grey invariant.
 */
export function getEventBarColor(
  event: {
    isBusy?: boolean;
    isWork?: boolean;
    isBirthday?: boolean;
    color?: string | null;
    groupVisibility?: Array<{ group: { color: string } }> | null;
  },
  themeColor: string
): string {
  return getEventPalette(event, themeColor).bar;
}
