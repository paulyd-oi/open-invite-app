/**
 * useWidgetSync — Foreground-triggered widget sync hook
 *
 * Listens for app returning to foreground and triggers a widget sync
 * using the latest calendar data from the React Query cache.
 *
 * Debounced to avoid spamming on rapid background/foreground cycles.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { eventKeys } from '@/lib/eventQueryKeys';
import { syncTodayWidget } from './syncTodayWidget';
import { devLog } from '@/lib/devLog';
import type { GetCalendarEventsResponse } from '../../shared/contracts';

/** Minimum ms between foreground syncs (30 seconds) */
const FOREGROUND_DEBOUNCE_MS = 30_000;

/**
 * Read the latest calendar events from React Query cache (no fetch).
 * Returns merged createdEvents + goingEvents, deduplicated by ID.
 */
function getCalendarEventsFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
): import('../../shared/contracts').Event[] {
  // Try to find a cached calendar range query (any range)
  const queries = queryClient.getQueriesData<GetCalendarEventsResponse>({
    queryKey: eventKeys.calendar(),
  });

  const seen = new Set<string>();
  const merged: import('../../shared/contracts').Event[] = [];

  for (const [, data] of queries) {
    if (!data) continue;
    for (const event of data.createdEvents ?? []) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        merged.push(event);
      }
    }
    for (const event of data.goingEvents ?? []) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        merged.push(event);
      }
    }
  }

  return merged;
}

/**
 * Hook: sync the Today Widget on app foreground.
 *
 * @param enabled - Gate (e.g., bootStatus === 'authed')
 */
export function useWidgetSync(enabled: boolean): void {
  const queryClient = useQueryClient();
  const lastSyncRef = useRef<number>(0);

  const doSync = useCallback(() => {
    const now = Date.now();
    if (now - lastSyncRef.current < FOREGROUND_DEBOUNCE_MS) {
      if (__DEV__) {
        devLog('[WIDGET_SYNC]', 'foreground sync debounced');
      }
      return;
    }
    lastSyncRef.current = now;

    const events = getCalendarEventsFromCache(queryClient);
    if (__DEV__) {
      devLog('[WIDGET_SYNC]', 'foreground sync triggered', {
        cachedEventCount: events.length,
      });
    }
    // Fire and forget — never blocks UI
    syncTodayWidget(events);
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        doSync();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Also sync once on mount (when hook first becomes enabled)
    doSync();

    return () => {
      subscription.remove();
    };
  }, [enabled, doSync]);
}
