/**
 * Analytics Event Catalog — SSOT
 *
 * Every PostHog event name used by the app MUST be defined here.
 * Call sites import `track()` and an event constant — never raw strings.
 *
 * track() is a safe no-op when PostHog is disabled (missing env key).
 *
 * [P0_ANALYTICS_EVENT] proof tag
 */

import { devLog } from "@/lib/devLog";
import { POSTHOG_ENABLED, getPostHogRef, posthogCapture } from "@/analytics/posthogSSOT";
import { Platform } from "react-native";
import Constants from "expo-constants";

// ---------------------------------------------------------------------------
// Event name catalog (snake_case, as const)
// ---------------------------------------------------------------------------

export const AnalyticsEvent = {
  APP_OPENED: "app_opened",
  SIGNUP_COMPLETED: "signup_completed",
  EMAIL_VERIFIED: "email_verified",
  CIRCLE_CREATED: "circle_created",
  CIRCLE_JOINED: "circle_joined",
  EVENT_CREATED: "event_created",
  EVENT_RSVP: "event_rsvp",
  MESSAGE_SENT: "message_sent",
  INVITE_SHARED: "invite_shared",
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip undefined values from a props object so PostHog gets clean JSON. */
function cleanProps(props?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Classify message length into a privacy-safe bucket.
 * Returns "0" | "1_20" | "21_80" | "81_plus"
 */
export function lengthBucket(len: number): string {
  if (len === 0) return "0";
  if (len <= 20) return "1_20";
  if (len <= 80) return "21_80";
  return "81_plus";
}

/**
 * Infer build channel from Constants.
 * Returns "dev" | "testflight" | "prod" | "unknown"
 */
function getBuildChannel(): string {
  if (__DEV__) return "dev";
  const channel =
    (Constants.expoConfig?.extra?.eas?.updateUrl ? "prod" : undefined) ??
    (Constants.expoConfig?.ios?.buildNumber ? "testflight" : "unknown");
  return channel;
}

// ---------------------------------------------------------------------------
// Dedupe guards (module-level — survive across re-renders, reset on process)
// ---------------------------------------------------------------------------

let _appOpenedFired = false;

// ---------------------------------------------------------------------------
// Core track() function
// ---------------------------------------------------------------------------

/**
 * Fire a PostHog event through the SSOT.
 * Safe no-op when PostHog is disabled or instance is not yet stored.
 */
export function track(
  eventName: AnalyticsEventName,
  properties?: Record<string, unknown>,
): void {
  if (!POSTHOG_ENABLED) return;
  const ph = getPostHogRef();
  if (!ph) return;

  const cleaned = cleanProps(properties);

  if (__DEV__) {
    devLog("[P0_ANALYTICS_EVENT]", eventName, cleaned ?? {});
  }

  posthogCapture(ph, eventName, cleaned);
}

// ---------------------------------------------------------------------------
// Typed event helpers (one per funnel event)
// ---------------------------------------------------------------------------

/**
 * app_opened — fire once per cold start (module-level dedup).
 */
export function trackAppOpened(): void {
  if (_appOpenedFired) return;
  _appOpenedFired = true;

  track(AnalyticsEvent.APP_OPENED, {
    buildChannel: getBuildChannel(),
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? "unknown",
  });
}

/**
 * signup_completed — fire when user completes signup / first auth.
 */
export function trackSignupCompleted(props: {
  authProvider: "email" | "apple";
  isEmailVerified: boolean;
}): void {
  track(AnalyticsEvent.SIGNUP_COMPLETED, props);
}

/**
 * email_verified — fire on edge transition to verified = true.
 * Caller must guard against repeat fires (e.g. ref-based edge detection).
 */
export function trackEmailVerified(props?: {
  method?: "deep_link" | "in_app";
}): void {
  track(AnalyticsEvent.EMAIL_VERIFIED, props);
}

/**
 * circle_created — fire on successful circle creation.
 */
export function trackCircleCreated(props?: {
  memberCount?: number;
  source?: "circles" | "friends" | "unknown";
}): void {
  track(AnalyticsEvent.CIRCLE_CREATED, props);
}

/**
 * circle_joined — fire when user joins a circle via add-members or invite.
 */
export function trackCircleJoined(props?: {
  source?: "invite_link" | "search" | "unknown";
}): void {
  track(AnalyticsEvent.CIRCLE_JOINED, props);
}

/**
 * event_created — fire on successful event creation.
 */
export function trackEventCreated(props?: {
  visibility?: string;
  hasLocation?: 0 | 1;
  hasPhoto?: 0 | 1;
  inviteeCount?: number;
  isOpenInvite?: 0 | 1;
}): void {
  track(AnalyticsEvent.EVENT_CREATED, props);
}

/**
 * event_rsvp — fire on successful RSVP.
 */
export function trackEventRsvp(props: {
  rsvpStatus: string;
  sourceScreen?: "event_detail" | "feed" | "calendar" | "unknown";
}): void {
  track(AnalyticsEvent.EVENT_RSVP, props);
}

/**
 * message_sent — fire on successful message send.
 */
export function trackMessageSent(props?: {
  hasMedia?: 0 | 1;
  lengthBucket?: string;
  sourceScreen?: "circle" | "dm" | "unknown";
}): void {
  track(AnalyticsEvent.MESSAGE_SENT, props);
}

/**
 * invite_shared — fire when user taps Share (system sheet).
 */
export function trackInviteShared(props?: {
  shareTarget?: "system_sheet";
  entity?: "circle" | "event" | "app" | "referral";
  sourceScreen?: string;
}): void {
  track(AnalyticsEvent.INVITE_SHARED, props);
}
