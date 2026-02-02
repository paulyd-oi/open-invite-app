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

/**
 * Generate a series key for grouping recurring events.
 * Uses recurrence field if available, otherwise derives from event properties.
 */
function getSeriesKey(event: Event): string {
  // If backend provides recurrence identifier, use it
  if (event.recurrence) {
    return `recurrence:${event.recurrence}`;
  }

  // Otherwise derive key from normalized properties
  const titleNorm = normalize(event.title);
  const locationNorm = normalize(event.location);
  const hostId = event.userId;
  
  // Extract day of week and time from startTime
  const startDate = new Date(event.startTime);
  const dayOfWeek = startDate.getDay(); // 0-6
  const timeStr = startDate.toTimeString().substring(0, 5); // HH:MM
  
  return `derived:${hostId}:${titleNorm}:${dayOfWeek}:${timeStr}:${locationNorm}`;
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

  // Filter to upcoming events only (use endTime if available, otherwise startTime)
  // An event that has started but not yet ended should still be shown
  const futureEvents = events
    .filter((e) => {
      const relevantTime = e.endTime ? new Date(e.endTime) : new Date(e.startTime);
      return relevantTime >= now;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

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
      // Keep the earliest event as nextEvent
      if (new Date(event.startTime) < new Date(series.nextEvent.startTime)) {
        series.nextEvent = event;
      }
    }
  }

  // Convert map to array and sort by next occurrence
  return Array.from(seriesMap.values())
    .sort((a, b) => new Date(a.nextEvent.startTime).getTime() - new Date(b.nextEvent.startTime).getTime());
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
