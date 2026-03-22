/**
 * Recurring Events Grouping Utility
 *
 * Collapses recurring events into series tiles for cleaner list views.
 * Used by social feed and friend profile screens.
 */

import { type Event } from "@/shared/contracts";

export interface EventSeries {
  seriesKey: string;
  title: string;
  emoji: string;
  nextEvent: Event;
  occurrenceCount: number;
  allEvents: Event[];
  isRecurring: boolean;
}

/**
 * Normalize a string for comparison (lowercase, trim, remove extra spaces)
 */
function normalize(str: string | null | undefined): string {
  if (!str) return "";
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Effective upcoming time for an event: nextOccurrence for recurring, startTime otherwise. */
function getEffectiveTime(event: Event): Date {
  if (event.isRecurring && event.nextOccurrence) {
    return new Date(event.nextOccurrence);
  }
  return new Date(event.startTime);
}

/**
 * Generate a series key for grouping recurring events.
 * Uses userId + recurrence + normalized title so unrelated users' events stay separate.
 */
function getSeriesKey(event: Event): string {
  const titleNorm = normalize(event.title);
  const hostId = event.userId;
  const recurrence = event.recurrence ?? "unknown";
  return `series:${hostId}:${recurrence}:${titleNorm}`;
}

/**
 * Group events into series, collapsing recurring events into single tiles.
 * Non-recurring events get their own series.
 *
 * @param events - Array of events to group
 * @returns Array of event series, sorted by next occurrence
 */
export function groupEventsIntoSeries(events: Event[]): EventSeries[] {
  const seriesMap = new Map<string, EventSeries>();
  const now = new Date();

  // Filter to upcoming events only
  // For recurring events, use nextOccurrence; for one-time, use endTime or startTime
  const futureEvents = events
    .filter((e) => {
      if (e.isRecurring && e.nextOccurrence) {
        return new Date(e.nextOccurrence) >= now;
      }
      const relevantTime = e.endTime ? new Date(e.endTime) : new Date(e.startTime);
      return relevantTime >= now;
    })
    .sort((a, b) => getEffectiveTime(a).getTime() - getEffectiveTime(b).getTime());

  for (const event of futureEvents) {
    const seriesKey = event.isRecurring ? getSeriesKey(event) : `single:${event.id}`;

    if (!seriesMap.has(seriesKey)) {
      // Create new series
      seriesMap.set(seriesKey, {
        seriesKey,
        title: event.title,
        emoji: event.emoji,
        nextEvent: event,
        occurrenceCount: 1,
        allEvents: [event],
        isRecurring: event.isRecurring,
      });
    } else {
      // Add to existing series
      const series = seriesMap.get(seriesKey)!;
      series.occurrenceCount++;
      series.allEvents.push(event);
      // Keep the event with the nearest upcoming occurrence as nextEvent
      if (getEffectiveTime(event) < getEffectiveTime(series.nextEvent)) {
        series.nextEvent = event;
      }
    }
  }

  // Convert map to array and sort by effective upcoming time
  return Array.from(seriesMap.values())
    .sort((a, b) => getEffectiveTime(a.nextEvent).getTime() - getEffectiveTime(b.nextEvent).getTime());
}

/**
 * Format the recurrence label for display
 */
export function getRecurrenceLabel(series: EventSeries): string | null {
  if (!series.isRecurring || series.occurrenceCount === 1) {
    return null;
  }

  // Simple "Weekly" label for now - could be enhanced based on recurrence pattern
  return "Weekly";
}

/**
 * Format the occurrence count display
 */
export function getOccurrenceCountLabel(series: EventSeries): string | null {
  if (!series.isRecurring || series.occurrenceCount === 1) {
    return null;
  }

  const remaining = series.occurrenceCount - 1;
  if (remaining === 0) return null;
  return `+${remaining} more`;
}
