/**
 * Sync Today Widget
 *
 * Orchestrates: compute payload → serialize → write to native → reload widget.
 *
 * Designed to be called from mutation onSuccess callbacks and foreground handlers.
 * Safe to call frequently — fast compute, native writes are idempotent.
 */

import type { Event } from '../../shared/contracts';
import { computeTodayWidgetPayload } from './computeTodayWidgetPayload';
import { setTodayWidgetPayload, reloadTodayWidget } from '@/native/WidgetBridge';
import { devLog } from '@/lib/devLog';

/**
 * Compute the widget payload from events and push to native widget.
 *
 * @param events - Merged array of created + going events (canonical calendar data)
 */
export async function syncTodayWidget(events: Event[]): Promise<void> {
  try {
    // 1. Compute payload
    const payload = computeTodayWidgetPayload(events);

    // 2. Serialize to JSON
    const json = JSON.stringify(payload);

    // 3. Write to native storage
    await setTodayWidgetPayload(json);

    // 4. Reload widget timelines
    await reloadTodayWidget();

    // DEV proof log
    if (__DEV__) {
      devLog('[P0_TODAY_WIDGET_WRITE]', {
        status: 'ok',
        dateKeyLocal: payload.dateKeyLocal,
        itemCount: payload.items.length,
      });
    }
  } catch (error) {
    // Widget sync is never critical — swallow errors to protect app stability
    if (__DEV__) {
      devLog('[P0_TODAY_WIDGET_WRITE]', { status: 'error', error });
    }
  }
}
