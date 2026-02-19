/**
 * Compute Today Widget Payload
 *
 * Transforms the canonical Event[] (from calendar query or local cache)
 * into a TodayWidgetPayloadV1 suitable for native widget rendering.
 *
 * Pure function — no side effects, no hooks, no network calls.
 */

import type { Event } from '../../shared/contracts';
import type { TodayWidgetPayloadV1, TodayWidgetItemV1 } from './todayWidgetContract';
import {
  WIDGET_SCHEMA_VERSION,
  WIDGET_MAX_ITEMS,
  WIDGET_SCHEME,
} from './todayWidgetContract';
import { devLog } from '@/lib/devLog';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Get local date key YYYY-MM-DD for a Date */
function toDateKeyLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Compute local today start/end bounds */
function getTodayBounds(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

/** Check if an event intersects with today (starts today, ends today, or spans today) */
function eventIntersectsToday(event: Event, todayStart: number, todayEnd: number): boolean {
  const eventStart = new Date(event.startTime).getTime();
  const eventEnd = event.endTime
    ? new Date(event.endTime).getTime()
    : eventStart; // Point event if no endTime

  // Event intersects today if it starts before today ends AND ends after today starts
  return eventStart <= todayEnd && eventEnd >= todayStart;
}

/** Format a short local time label */
function formatTimeLabel(event: Event): string {
  const startMs = new Date(event.startTime).getTime();
  const endMs = event.endTime ? new Date(event.endTime).getTime() : 0;

  // Heuristic: treat events spanning 23+ hours as "All day"
  if (endMs > 0 && endMs - startMs >= 23 * 60 * 60 * 1000) {
    return 'All day';
  }

  // Format start time in local short format
  const d = new Date(event.startTime);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  const m = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;
  return `${h}${m} ${ampm}`;
}

/** Build deep link for an event */
function buildDeepLink(eventId: string): string {
  return `${WIDGET_SCHEME}://event/${eventId}`;
}

// ─── Main Compute ────────────────────────────────────────────────────

/**
 * Compute the Today Widget payload from a list of events.
 *
 * @param events - Canonical Event[] (typically createdEvents + goingEvents merged)
 * @returns TodayWidgetPayloadV1 ready for JSON serialization
 */
export function computeTodayWidgetPayload(
  events: Event[],
): TodayWidgetPayloadV1 {
  const now = Date.now();
  const dateKeyLocal = toDateKeyLocal(new Date());
  const { start: todayStart, end: todayEnd } = getTodayBounds();

  // Filter to events intersecting today, exclude busy/private blocks
  const todayEvents = events.filter((e) => {
    // Skip busy blocks — they are private work schedule markers
    if (e.isBusy) return false;
    return eventIntersectsToday(e, todayStart, todayEnd);
  });

  // Sort by startMs ascending
  todayEvents.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  // Slice to max items
  const displayEvents = todayEvents.slice(0, WIDGET_MAX_ITEMS);
  const moreCount = Math.max(0, todayEvents.length - WIDGET_MAX_ITEMS);

  // Map to widget items
  const items: TodayWidgetItemV1[] = displayEvents.map((e) => ({
    id: e.id,
    title: e.title,
    startMs: new Date(e.startTime).getTime(),
    endMs: e.endTime ? new Date(e.endTime).getTime() : 0,
    timeLabel: formatTimeLabel(e),
    deepLink: buildDeepLink(e.id),
  }));

  const payload: TodayWidgetPayloadV1 = {
    schemaVersion: WIDGET_SCHEMA_VERSION,
    generatedAtMs: now,
    dateKeyLocal,
    items,
    moreCount,
    emptyState: items.length === 0 ? 'no_events_today' : 'none',
  };

  // DEV proof log
  if (__DEV__) {
    const jsonSize = JSON.stringify(payload).length;
    devLog('[P0_TODAY_WIDGET_COMPUTE]', {
      dateKeyLocal,
      itemCount: items.length,
      moreCount,
      sizeBytes: jsonSize,
    });
  }

  return payload;
}
