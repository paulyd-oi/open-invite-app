/**
 * Shared utility for formatting event times consistently across the app.
 * Used to display event time ranges like "9:00 AM – 10:00 AM"
 */

/**
 * Format a single time for display
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format an event time range for display.
 * Returns format like "9:00 AM – 10:00 AM"
 * If times span different days, includes date info.
 */
export function formatEventTimeRange(
  startTime: Date | string,
  endTime: Date | string | null | undefined
): string {
  const start = typeof startTime === "string" ? new Date(startTime) : startTime;
  const end = endTime
    ? typeof endTime === "string"
      ? new Date(endTime)
      : endTime
    : null;

  const startStr = formatTime(start);

  if (!end) {
    return startStr;
  }

  const endStr = formatTime(end);

  // Check if times are on different days
  const startDate = start.toDateString();
  const endDate = end.toDateString();

  if (startDate !== endDate) {
    // Cross-day event: show dates too
    const endDateFormatted = end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${startStr} – ${endDateFormatted} ${endStr}`;
  }

  return `${startStr} – ${endStr}`;
}

/**
 * Format time for a compact display (e.g., event cards)
 * Returns just the time part like "9:00 AM"
 */
export function formatEventTime(time: Date | string): string {
  return formatTime(time);
}

/**
 * Format date + time range for compact displays (e.g., Circles availability pills).
 * Returns format like "Sat 1/28 9:00 AM–10:00 AM"
 */
export function formatDateTimeRange(
  startTime: Date | string,
  endTime: Date | string | null | undefined
): string {
  const start = typeof startTime === "string" ? new Date(startTime) : startTime;
  const end = endTime
    ? typeof endTime === "string"
      ? new Date(endTime)
      : endTime
    : null;

  const dayOfWeek = start.toLocaleDateString("en-US", { weekday: "short" });
  const dateStr = start.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  const startTimeStr = formatTime(start);
  const endTimeStr = end ? formatTime(end) : null;

  if (endTimeStr) {
    return `${dayOfWeek} ${dateStr} ${startTimeStr}–${endTimeStr}`;
  }
  return `${dayOfWeek} ${dateStr} ${startTimeStr}`;
}

/**
 * Sort events chronologically by startTime, then by createdAt as tiebreaker.
 * Use this for day views and event lists.
 */
export function sortEventsChronologically<
  T extends { startTime: string | Date; createdAt?: string | Date; id?: string }
>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const aStart =
      typeof a.startTime === "string"
        ? new Date(a.startTime).getTime()
        : a.startTime.getTime();
    const bStart =
      typeof b.startTime === "string"
        ? new Date(b.startTime).getTime()
        : b.startTime.getTime();

    // Primary sort: startTime ascending
    if (aStart !== bStart) {
      return aStart - bStart;
    }

    // Tiebreaker: createdAt ascending, then id
    if (a.createdAt && b.createdAt) {
      const aCreated =
        typeof a.createdAt === "string"
          ? new Date(a.createdAt).getTime()
          : a.createdAt.getTime();
      const bCreated =
        typeof b.createdAt === "string"
          ? new Date(b.createdAt).getTime()
          : b.createdAt.getTime();
      if (aCreated !== bCreated) {
        return aCreated - bCreated;
      }
    }

    // Final tiebreaker: id (deterministic)
    if (a.id && b.id) {
      return a.id.localeCompare(b.id);
    }

    return 0;
  });
}
