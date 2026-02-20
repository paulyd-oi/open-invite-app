/**
 * widgetBridge.ts — Lightweight bridge to iOS Lock Screen widget
 *
 * Writes today-events to App Group shared UserDefaults so the
 * WidgetKit extension can display them without network calls.
 *
 * SSOT: Only store contract-aligned fields (id, title, startAt,
 * viewerRsvpStatus, visibility, circleName). No new fields invented.
 */

import { Platform, NativeModules } from "react-native";
import { devLog } from "@/lib/devLog";

/** Minimal event shape for widget — matches WidgetEvent Swift struct */
interface WidgetEventPayload {
  id: string;
  title: string;
  startAt: string; // ISO 8601
  viewerRsvpStatus?: string | null;
  visibility?: string | null;
  circleName?: string | null;
}

/** Source event shape — matches DisplayEvent / Event from feed */
interface WidgetSourceEvent {
  id: string;
  title: string;
  startTime: string;
  viewerRsvpStatus?: string | null;
  visibility?: string | null;
  circleName?: string | null;
  isBusy?: boolean;
}

/**
 * Filter and write today's events to the widget shared store.
 * Call this whenever the social feed loads, calendar loads, or RSVP changes.
 *
 * Safe to call on non-iOS (no-op).
 */
export function updateWidgetEventsCache(events: WidgetSourceEvent[]): void {
  if (Platform.OS !== "ios") return;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Filter: today only, future, not busy, not declined
    const todayEvents: WidgetEventPayload[] = events
      .filter((e) => {
        if (e.isBusy) return false;
        if (e.viewerRsvpStatus === "not_going") return false;
        const start = new Date(e.startTime);
        return start >= todayStart && start < todayEnd;
      })
      .map((e) => ({
        id: e.id,
        title: e.title,
        startAt: new Date(e.startTime).toISOString(),
        viewerRsvpStatus: e.viewerRsvpStatus ?? null,
        visibility: e.visibility ?? null,
        circleName: e.circleName ?? null,
      }))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));

    const json = JSON.stringify(todayEvents);

    // Call native bridge
    const bridge = NativeModules.WidgetBridge;
    if (bridge?.updateEvents) {
      bridge.updateEvents(json);
      if (__DEV__) {
        devLog("[WIDGET_BRIDGE]", { eventCount: todayEvents.length });
      }
    }
  } catch (error) {
    if (__DEV__) {
      devLog("[WIDGET_BRIDGE] Error:", error);
    }
    // Silent fail in production — widget is non-critical
  }
}
