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
  // Growth instrumentation events
  RSVP_SHARE_CLICKED: "rsvp_share_clicked",
  CREATE_SHARE_CLICKED: "create_share_clicked",
  DEEP_LINK_LANDED: "deep_link_landed",
  // Canonical VALUE events (retention measurement)
  RSVP_COMPLETED: "rsvp_completed",
  VALUE_EVENT_CREATED: "value_event_created",
  // Safety / observability events
  API_ERROR: "api_error",
  OFFLINE_ACTION_QUEUED: "offline_action_queued",
  FEED_LOAD_TIME: "feed_load_time",
  APP_CRASH: "app_crash",
  FRIENDS_PAGE_LOADED: "friends_page_loaded",
  OFFLINE_QUEUE_REPLAY_RESULT: "offline_queue_replay_result",
  NOTIFICATIONS_PAGE_LOADED: "notifications_page_loaded",
  NOTIFICATION_MARK_READ: "notification_mark_read",
  API_REQUEST: "api_request",
  FEED_PAGE_LOADED: "feed_page_loaded",
  PUSH_TOKEN_REGISTER_RESULT: "push_token_register_result",
  PUSH_NOTIFICATION_OPENED: "push_notification_opened",
  // Growth instrumentation — Apple Sign In
  APPLE_SIGNIN_TAP: "apple_signin_tap",
  APPLE_SIGNIN_RESULT: "apple_signin_result",
  // Growth instrumentation — Contacts import
  CONTACTS_PERMISSION_RESULT: "contacts_permission_result",
  CONTACTS_IMPORT_RESULT: "contacts_import_result",
  // Growth instrumentation — RSVP before signup
  RSVP_INTENT_PREAUTH: "rsvp_intent_preauth",
  RSVP_INTENT_APPLIED_POSTAUTH: "rsvp_intent_applied_postauth",
  // Phase 11 — Referral attribution telemetry
  REFERRAL_LINK_CREATED: "referral_link_created",
  REFERRAL_OPENED: "referral_opened",
  // Phase 12 — Notification engagement telemetry
  NOTIFS_ENGAGEMENT: "notifs_engagement",
  // Phase 14 — Weekly digest surface telemetry
  WEEKLY_DIGEST_CARD_SHOWN: "weekly_digest_card_shown",
  WEEKLY_DIGEST_CARD_TAP: "weekly_digest_card_tap",
  // Fullphase A — Growth loop telemetry
  CIRCLE_INVITE_INTENT_PREAUTH: "circle_invite_intent_preauth",
  CIRCLE_INVITE_CLAIM_POSTAUTH: "circle_invite_claim_postauth",
  // Fullphase C — Activation funnel events
  FIRST_EVENT_CREATED: "first_event_created",
  FIRST_RSVP_GOING: "first_rsvp_going",
  FIRST_FRIEND_ADDED: "first_friend_added",
  FIRST_CIRCLE_JOINED: "first_circle_joined",
  // RSVP friction phase — success momentum + error clarity
  RSVP_SUCCESS_PROMPT_SHOWN: "rsvp_success_prompt_shown",
  RSVP_SUCCESS_PROMPT_TAP: "rsvp_success_prompt_tap",
  RSVP_ERROR: "rsvp_error",

  // Activation audit — empty state CTAs
  SOCIAL_EMPTY_CTA_TAP: "social_empty_cta_tap",
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

// ---------------------------------------------------------------------------
// Canonical VALUE events (retention measurement)
// ---------------------------------------------------------------------------

/**
 * rsvp_completed — canonical value event for retention.
 * Fires once per successful RSVP action (mutation onSuccess).
 * [P0_POSTHOG_VALUE]
 */
export function trackRsvpCompleted(props: {
  eventId: string;
  rsvpStatus: "going" | "interested" | "not_going";
  isOpenInvite: boolean;
  source: "feed" | "calendar" | "event_detail" | "circle" | "unknown";
  hasGuests: number;
  ts: string;
}): void {
  track(AnalyticsEvent.RSVP_COMPLETED, props);
}

/**
 * value_event_created — canonical value event for retention.
 * Fires once per successful event creation (mutation onSuccess).
 * [P0_POSTHOG_VALUE]
 */
export function trackValueEventCreated(props: {
  eventId: string;
  isOpenInvite: boolean;
  source: "calendar" | "circle" | "create" | "unknown";
  hasLocation: boolean;
  hasCoverImage: boolean;
  hasGuests: number;
  ts: string;
}): void {
  track(AnalyticsEvent.VALUE_EVENT_CREATED, props);
}

// ---------------------------------------------------------------------------
// Growth instrumentation events
// ---------------------------------------------------------------------------

/**
 * rsvp_share_clicked — user tapped "Share with friends" after RSVP going.
 */
export function trackRsvpShareClicked(props: {
  eventId: string;
  surface: "rsvp_confirmation";
  visibility: string;
  hasCircleId: boolean;
}): void {
  track(AnalyticsEvent.RSVP_SHARE_CLICKED, props);
}

/**
 * create_share_clicked — user tapped share CTA in post-create prompt.
 */
export function trackCreateShareClicked(props: {
  surface: "create_success";
  bypassCooldown: boolean;
}): void {
  track(AnalyticsEvent.CREATE_SHARE_CLICKED, props);
}

/**
 * deep_link_landed — user successfully routed via a deep link.
 */
export function trackDeepLinkLanded(props: {
  type: "event" | "invite" | "circle";
  id?: string;
  source: "scheme" | "universal";
}): void {
  track(AnalyticsEvent.DEEP_LINK_LANDED, props);
}

// ---------------------------------------------------------------------------
// Safety / observability events
// ---------------------------------------------------------------------------

/**
 * api_error — fires on HTTP 4xx/5xx responses (not network errors).
 * No secrets, no payload bodies.
 * [P1_POSTHOG_API_ERROR]
 */
export function trackApiError(props: {
  path: string;
  method: string;
  status: number;
  errorCode?: string;
}): void {
  track(AnalyticsEvent.API_ERROR, props);
}

/**
 * offline_action_queued — fires when an action is enqueued for offline sync.
 * [P1_POSTHOG_OFFLINE_QUEUED]
 */
export function trackOfflineActionQueued(props: {
  actionType: string;
  queueSizeAfter: number;
  retryCount: number;
}): void {
  track(AnalyticsEvent.OFFLINE_ACTION_QUEUED, props);
}

/**
 * feed_load_time — fires once per Social screen mount when first data settles.
 * [P1_POSTHOG_FEED_LOAD]
 */
export function trackFeedLoadTime(props: {
  ms: number;
  itemCount: number;
}): void {
  track(AnalyticsEvent.FEED_LOAD_TIME, props);
}

/**
 * app_crash — fires when ErrorBoundary catches an unhandled error.
 * No PII: error_message is truncated, component_stack is trimmed.
 */
export function trackAppCrash(props: {
  route: string;
  error_message: string;
  component_stack: string;
  timestamp: string;
}): void {
  track(AnalyticsEvent.APP_CRASH, props);
}

/**
 * offline_queue_replay_result — fires after manual queue replay completes.
 * [P0_OFFLINE_QUEUE_REPLAY]
 */
export function trackOfflineQueueReplayResult(props: {
  success: boolean;
  processed: number;
  failed: number;
  durationMs: number;
}): void {
  track(AnalyticsEvent.OFFLINE_QUEUE_REPLAY_RESULT, props);
}

/**
 * notifications_page_loaded — fires after each notifications page fetch.
 * [P1_NOTIFS_PAGINATED]
 */
export function trackNotificationsPageLoaded(props: {
  pageSize: number;
  countLoaded: number;
  hasNextPage: boolean;
}): void {
  track(AnalyticsEvent.NOTIFICATIONS_PAGE_LOADED, props);
}

/**
 * notification_mark_read — fires when a notification is marked read.
 * [P1_NOTIF_OPTIMISTIC_READ]
 */
export function trackNotificationMarkRead(props: {
  sourceScreen: string;
  optimisticApplied: boolean;
  rollbackUsed: boolean;
}): void {
  track(AnalyticsEvent.NOTIFICATION_MARK_READ, props);
}

/**
 * push_token_register_result — fires after push token registration attempt.
 * [P1_PUSH_CLIENT]
 */
export function trackPushTokenRegisterResult(props: {
  success: boolean;
  durationMs: number;
  errorCode?: string;
}): void {
  track(AnalyticsEvent.PUSH_TOKEN_REGISTER_RESULT, props);
}

/**
 * push_notification_opened — fires when user opens a push notification.
 * [P1_PUSH_CLIENT]
 */
export function trackPushNotificationOpened(props: {
  source: "foreground" | "background";
  hasRouteTarget: boolean;
}): void {
  track(AnalyticsEvent.PUSH_NOTIFICATION_OPENED, props);
}

/**
 * feed_page_loaded — fires after each feed page fetch completes.
 * [P1_FEED_PAGE_LOADED]
 */
export function trackFeedPageLoaded(props: {
  pageIndex: number;
  itemCount: number;
  hasCursor: boolean;
  hasNextPage: boolean;
}): void {
  track(AnalyticsEvent.FEED_PAGE_LOADED, props);
}

/**
 * api_request — fires after each API request completes (success or error).
 * Used for client-side latency observability. No PII.
 * [P1_API_TIMING]
 */
export function trackApiRequest(props: {
  route: string;
  durationMs: number;
  success: boolean;
  requestId?: string;
  routeGroup?: string;
}): void {
  track(AnalyticsEvent.API_REQUEST, props);
}

// ---------------------------------------------------------------------------
// Growth instrumentation — Apple Sign In
// ---------------------------------------------------------------------------

/**
 * apple_signin_tap — fires when user taps Apple Sign In button.
 * [GROWTH_APPLE_SIGNIN]
 */
export function trackAppleSignInTap(): void {
  track(AnalyticsEvent.APPLE_SIGNIN_TAP);
}

/**
 * apple_signin_result — fires after Apple Sign In attempt completes.
 * No PII. [GROWTH_APPLE_SIGNIN]
 */
export function trackAppleSignInResult(props: {
  success: boolean;
  durationMs: number;
  errorCode?: string;
}): void {
  track(AnalyticsEvent.APPLE_SIGNIN_RESULT, props);
}

// ---------------------------------------------------------------------------
// Growth instrumentation — Contacts import
// ---------------------------------------------------------------------------

/**
 * contacts_permission_result — fires after contacts permission prompt.
 * No PII. [GROWTH_CONTACTS]
 */
export function trackContactsPermissionResult(props: {
  granted: boolean;
  source: "onboarding" | "settings" | "unknown";
}): void {
  track(AnalyticsEvent.CONTACTS_PERMISSION_RESULT, props);
}

/**
 * contacts_import_result — fires after batch friend requests from contacts.
 * No PII. [GROWTH_CONTACTS]
 */
export function trackContactsImportResult(props: {
  existingUsersCount: number;
  requestsSentCount: number;
  source: "onboarding" | "settings" | "unknown";
}): void {
  track(AnalyticsEvent.CONTACTS_IMPORT_RESULT, props);
}

// ---------------------------------------------------------------------------
// Growth instrumentation — RSVP before signup
// ---------------------------------------------------------------------------

/**
 * rsvp_intent_preauth — fires when unauthenticated user opens event deep link.
 * Intent is stored for post-auth claim. No PII. [GROWTH_P3]
 */
export function trackRsvpIntentPreauth(props: {
  hasEvent: boolean;
  source: "scheme" | "universal";
}): void {
  track(AnalyticsEvent.RSVP_INTENT_PREAUTH, props);
}

/**
 * rsvp_intent_applied_postauth — fires after auto-applying stored RSVP intent.
 * No PII. [GROWTH_P3]
 */
export function trackRsvpIntentAppliedPostauth(props: {
  success: boolean;
  durationMs: number;
  failureCode?: string;
}): void {
  track(AnalyticsEvent.RSVP_INTENT_APPLIED_POSTAUTH, props);
}

// ---------------------------------------------------------------------------
// Phase 11 — Referral attribution telemetry
// ---------------------------------------------------------------------------

/**
 * referral_link_created — fires when a share payload includes a referral param.
 * No PII. [GROWTH_P11]
 */
export function trackReferralLinkCreated(props: {
  source: "event_share" | "circle_invite" | "referral_screen" | "app_share";
  hasCode: boolean;
}): void {
  track(AnalyticsEvent.REFERRAL_LINK_CREATED, props);
}

/**
 * referral_opened — fires when incoming deep link contains a referral code.
 * No PII. [GROWTH_P11]
 */
export function trackReferralOpened(props: {
  source: "scheme" | "universal";
  hasCode: boolean;
}): void {
  track(AnalyticsEvent.REFERRAL_OPENED, props);
}

// ---------------------------------------------------------------------------
// Phase 12 — Notification engagement telemetry
// ---------------------------------------------------------------------------

/**
 * notifs_engagement — fires on notification list view or item tap.
 * No PII. [GROWTH_P12]
 */
export function trackNotifsEngagement(props: {
  action: "view_list" | "tap_item";
  routeTargeted: boolean;
}): void {
  track(AnalyticsEvent.NOTIFS_ENGAGEMENT, props);
}

/**
 * weekly_digest_card_shown — fires once per session when digest card renders.
 * No PII. [GROWTH_P14]
 */
export function trackWeeklyDigestCardShown(props: {
  hasDigest: boolean;
  sourceScreen: "social";
}): void {
  track(AnalyticsEvent.WEEKLY_DIGEST_CARD_SHOWN, props);
}

/**
 * weekly_digest_card_tap — fires when user taps the digest card.
 * No PII. [GROWTH_P14]
 */
export function trackWeeklyDigestCardTap(props: {
  sourceScreen: "social";
  target: "notifications";
  hadPreviewText: boolean;
}): void {
  track(AnalyticsEvent.WEEKLY_DIGEST_CARD_TAP, props);
}

// ---------------------------------------------------------------------------
// Fullphase A — Growth loop telemetry
// ---------------------------------------------------------------------------

/** circle_invite_intent_preauth — fires when circle invite stored pre-auth. [GROWTH_FULLPHASE_A] */
export function trackCircleInviteIntentPreauth(props: {
  hasCircle: boolean;
  source: "scheme" | "universal";
}): void {
  track(AnalyticsEvent.CIRCLE_INVITE_INTENT_PREAUTH, props);
}

/** circle_invite_claim_postauth — fires when circle intent is claimed post-auth. [GROWTH_FULLPHASE_A] */
export function trackCircleInviteClaimPostauth(props: {
  success: boolean;
  durationMs: number;
  errorCode?: string;
}): void {
  track(AnalyticsEvent.CIRCLE_INVITE_CLAIM_POSTAUTH, props);
}


// ---------------------------------------------------------------------------
// Fullphase C — Activation funnel events
// ---------------------------------------------------------------------------

/** first_event_created — fires on very first event creation per user. [GROWTH_FULLPHASE_C] */
export function trackFirstEventCreated(props: {
  sourceScreen: string;
  hasFriends: boolean;
}): void {
  track(AnalyticsEvent.FIRST_EVENT_CREATED, props);
}

/** first_rsvp_going — fires on very first "going" RSVP per user. [GROWTH_FULLPHASE_C] */
export function trackFirstRsvpGoing(props: {
  sourceScreen: string;
  entryPoint: string;
}): void {
  track(AnalyticsEvent.FIRST_RSVP_GOING, props);
}

/** first_friend_added — fires on first friend request sent. [GROWTH_FULLPHASE_C] */
export function trackFirstFriendAdded(props: {
  sourceScreen: string;
  entryPoint: string;
}): void {
  track(AnalyticsEvent.FIRST_FRIEND_ADDED, props);
}

/** first_circle_joined — fires on first circle joined. [GROWTH_FULLPHASE_C] */
export function trackFirstCircleJoined(props: {
  sourceScreen: string;
  entryPoint: string;
}): void {
  track(AnalyticsEvent.FIRST_CIRCLE_JOINED, props);
}

// ---------------------------------------------------------------------------
// RSVP friction phase — success momentum + error clarity
// ---------------------------------------------------------------------------

/** rsvp_success_prompt_shown — fires when inline "Want to bring someone?" shows. No PII. */
export function trackRsvpSuccessPromptShown(props: {
  source: "event";
}): void {
  track(AnalyticsEvent.RSVP_SUCCESS_PROMPT_SHOWN, props);
}

/** rsvp_success_prompt_tap — fires when user taps invite CTA in success prompt. No PII. */
export function trackRsvpSuccessPromptTap(props: {
  source: "event";
}): void {
  track(AnalyticsEvent.RSVP_SUCCESS_PROMPT_TAP, props);
}

/** rsvp_error — fires on RSVP failure for diagnostics. No PII. */
export function trackRsvpError(props: {
  errorCode: string;
  network: boolean;
}): void {
  track(AnalyticsEvent.RSVP_ERROR, props);
}

// ---------------------------------------------------------------------------
// Activation audit — empty state CTAs
// ---------------------------------------------------------------------------

/** social_empty_cta_tap — fires when user taps a CTA in the social empty state. No PII. */
export function trackSocialEmptyCtaTap(props: {
  cta: "find_friends" | "create_plan";
  source: "social_empty";
}): void {
  track(AnalyticsEvent.SOCIAL_EMPTY_CTA_TAP, props);
}
