/**
 * Today Widget Contract (SSOT)
 *
 * Defines the payload shape shared between JS compute layer, native bridge,
 * and iOS WidgetKit / Android AppWidget renderers.
 *
 * Schema version tracks breaking changes. Widgets must silently degrade
 * if they encounter an unknown schemaVersion.
 */

// ─── Constants ───────────────────────────────────────────────────────
/** Current schema version. Bump on any breaking payload change. */
export const WIDGET_SCHEMA_VERSION = 1;

/** Maximum items to include in the widget payload (matches widget UI row count) */
export const WIDGET_MAX_ITEMS = 3;

/** UserDefaults / SharedPreferences key (platform-agnostic) */
export const WIDGET_PAYLOAD_KEY = 'todayWidgetPayload_v1';

/** iOS App Group ID — must match the App Group capability on both targets */
export const IOS_APP_GROUP = 'group.com.vibecode.openinvite.0qi5wk';

/** Android SharedPreferences file name */
export const ANDROID_PREFS_NAME = 'openinvite_widget_store';

/** WidgetKit kind identifier (must match iOS widget extension) */
export const IOS_WIDGET_KIND = 'OpenInviteTodayWidget';

/** Deep link scheme */
export const WIDGET_SCHEME = 'open-invite';

// ─── Payload Types ───────────────────────────────────────────────────

export interface TodayWidgetItemV1 {
  /** Event ID (used for deep linking and dedup) */
  id: string;
  /** Event title */
  title: string;
  /** Start time in epoch milliseconds */
  startMs: number;
  /** End time in epoch milliseconds (0 if no end time) */
  endMs: number;
  /** Human-readable time label ("All day", "3:00 PM", etc.) */
  timeLabel: string;
  /** Deep link URI: open-invite://event/<id> */
  deepLink: string;
}

export type WidgetEmptyState = 'none' | 'no_events_today';

export interface TodayWidgetPayloadV1 {
  /** Schema version for forward compatibility */
  schemaVersion: typeof WIDGET_SCHEMA_VERSION;
  /** Epoch ms when this payload was computed */
  generatedAtMs: number;
  /** Local date in YYYY-MM-DD format */
  dateKeyLocal: string;
  /** Up to WIDGET_MAX_ITEMS events for today, sorted by startMs */
  items: TodayWidgetItemV1[];
  /** Number of additional events beyond the max */
  moreCount: number;
  /** Empty state hint for widget rendering */
  emptyState: WidgetEmptyState;
}
