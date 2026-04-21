/**
 * shareSSOT.ts — Single Source of Truth for ALL share links & messages.
 *
 * RULES (NON-NEGOTIABLE):
 * 1. Every share entrypoint in the app MUST call these helpers.
 * 2. No share message may contain the API host or legacy OnRender host.
 * 3. The App Store URL from config.ts is the ONE canonical download link.
 * 4. Deep links use the custom scheme "open-invite://".
 *
 * [P0_SHARE_SSOT]
 */

import { devLog, devWarn } from "./devLog";
import { api } from "./api";
import { APP_STORE_ID, APP_STORE_URL, SHARE_DOMAIN } from "./config";

export { APP_STORE_ID, APP_STORE_URL, SHARE_DOMAIN } from "./config";

// ── Constants ────────────────────────────────────────────────────────────────

/** Custom URL scheme registered in app.json */
const SCHEME = "open-invite";

/**
 * Branded share domain for universal links.
 * Imported from config.ts so release/runtime constants stay in one place.
 * [P0_SHARE_DOMAIN_SSOT]
 */

/**
 * Domains that must NEVER appear in user-facing share text.
 * Share links now use www.openinvite.cloud (matches AASA universal-link domain).
 * go.openinvite.cloud was the legacy bridge domain (backend-served blank page).
 */
const FORBIDDEN_DOMAINS = [
  "api.openinvite.cloud",
  "open-invite-api.onrender.com",
  "go.openinvite.cloud",
] as const;

// ── Referral param SSOT ──────────────────────────────────────────────────────

/**
 * Append ?ref=CODE to a URL if a referral code is provided.
 * Safe for URLs that already have query params (uses & in that case).
 * Returns the URL unchanged if code is null/undefined/empty.
 * [P0_REFERRAL_PARAM_SSOT]
 */
export function appendReferralParam(url: string, referralCode: string | null | undefined): string {
  if (!referralCode) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}ref=${encodeURIComponent(referralCode)}`;
}

// ── Share slug generation ────────────────────────────────────────────────────

export type ShareMethod = "copy_link" | "sms" | "whatsapp" | "instagram" | "airdrop" | "other";

/**
 * Generate a share slug via the backend. Returns null on failure (graceful degradation).
 * The slug is used in the ?ref= param for attribution tracking.
 */
export async function generateShareSlug(
  eventId: string,
  shareMethod: ShareMethod
): Promise<string | null> {
  try {
    const res = await api.post<{ slug: string }>("/api/share/create-slug", {
      eventId,
      shareMethod,
    });
    return res?.slug ?? null;
  } catch {
    return null;
  }
}

/**
 * Build event universal link with share slug attribution.
 * Falls back to plain link if slug is null.
 */
export function getEventShareLink(eventId: string, slug: string | null): string {
  const base = getEventUniversalLink(eventId);
  if (!slug) return base;
  return `${base}?ref=${encodeURIComponent(slug)}`;
}

// ── Deep link builders ───────────────────────────────────────────────────────

/** Build a deep link to an event: open-invite://event/<id> */
export function getEventDeepLink(eventId: string): string {
  return `${SCHEME}://event/${eventId}`;
}

/** Build a deep link to accept a referral: open-invite://invite/<code> */
export function getInviteDeepLink(referralCode: string): string {
  return `${SCHEME}://invite/${referralCode}`;
}

/** Build a deep link to a user profile: open-invite://user/<userId> */
export function getUserDeepLink(userId: string): string {
  return `${SCHEME}://user/${userId}`;
}

/** Build a deep link to a circle: open-invite://circle/<id> */
export function getCircleDeepLink(circleId: string): string {
  return `${SCHEME}://circle/${circleId}`;
}

// ── Share-text builders ──────────────────────────────────────────────────────

interface EventShareInput {
  id: string;
  title: string;
  emoji?: string;
  dateStr: string;
  timeStr: string;
  location?: string | null;
  description?: string | null;
}

/**
 * Build a universal link for an event (works in browsers AND deep-links into the app).
 * Format: ${SHARE_DOMAIN}/event/<id>
 * Points directly to the website event page — serves OG metadata, human-readable content,
 * and triggers AASA universal-link interception on iOS when app is installed.
 * [P0_SHARE_ULINK]
 */
export function getEventUniversalLink(eventId: string): string {
  return `${SHARE_DOMAIN}/event/${eventId}`;
}

/**
 * Build the share payload for an event (native share sheet).
 * Returns { message, url } ready for Share.share().
 *
 * [P0_SHARE_ULINK] Universal link is the single destination.
 * The Share.share() `url` field provides rich iMessage/social previews.
 */
export function buildEventSharePayload(event: EventShareInput, referralCode?: string | null): {
  message: string;
  url: string;
} {
  const universalLink = appendReferralParam(getEventUniversalLink(event.id), referralCode);

  const msg = `${event.title} ${event.dateStr} at ${event.timeStr}\n\nJoin us\n\n${universalLink}`;

  assertNoForbiddenDomains(msg, "buildEventSharePayload");

  if (__DEV__) {
    devLog("[P0_SHARE_ULINK] event share", {
      eventId: event.id,
      universalLink,
    });
  }

  return { message: msg, url: universalLink };
}

/**
 * Build the SMS body for an event invite.
 * Concise, context-rich, single universal link on its own line.
 * [P0_SHARE_SSOT]
 */
export function buildEventSmsBody(event: EventShareInput, referralCode?: string | null): string {
  const universalLink = appendReferralParam(getEventUniversalLink(event.id), referralCode);
  const msg = `${event.emoji ?? "📅"} ${event.title} ${event.dateStr} at ${event.timeStr} — you in?\n\n${universalLink}`;

  assertNoForbiddenDomains(msg, "buildEventSmsBody");
  return msg;
}

/**
 * Build host reminder text for an event (pasteable into SMS/DM/group chat).
 * Concise personal nudge with universal link.
 * [P0_SHARE_SSOT]
 */
export function buildEventReminderText(event: EventShareInput): string {
  const universalLink = getEventUniversalLink(event.id);
  const msg = `${event.title} ${event.dateStr} at ${event.timeStr} — coming up\n\n${universalLink}`;

  assertNoForbiddenDomains(msg, "buildEventReminderText");
  return msg;
}

/**
 * Build the share payload for a referral invite.
 * Returns { message, title } ready for Share.share().
 */
export function buildReferralSharePayload(referralCode: string): {
  message: string;
  title: string;
} {
  const deepLink = getInviteDeepLink(referralCode);

  const msg =
    `Join me on Open Invite! See what your friends are up to and make plans together.\n\n` +
    `Invite code: ${referralCode}\n` +
    `Open in app: ${deepLink}\n` +
    `Download: ${APP_STORE_URL}`;

  assertNoForbiddenDomains(msg, "buildReferralSharePayload");

  if (__DEV__) {
    devLog("[SHARE_SSOT] referral share", { referralCode, deepLink, appStore: APP_STORE_URL });
  }

  return { message: msg, title: "Join Open Invite!" };
}

/**
 * Build the share payload for a generic "invite a friend" prompt (no referral code).
 * Returns { message, url } ready for Share.share().
 */
export function buildAppSharePayload(customMessage?: string): {
  message: string;
  url: string;
} {
  const msg = customMessage
    ? `${customMessage}\n\n${APP_STORE_URL}`
    : `Check out Open Invite - the easiest way to share plans with friends!\n\n${APP_STORE_URL}`;

  assertNoForbiddenDomains(msg, "buildAppSharePayload");

  if (__DEV__) {
    devLog("[SHARE_SSOT] app share", { appStore: APP_STORE_URL });
  }

  return { message: msg, url: APP_STORE_URL };
}

/**
 * Build the share payload for a profile share.
 * Returns { message } ready for Share.share().
 */
export function buildProfileSharePayload(handle: string): {
  message: string;
} {
  const msg = `Join ${handle} on Open Invite — turning plans into memories.\n\n${APP_STORE_URL}`;

  assertNoForbiddenDomains(msg, "buildProfileSharePayload");

  if (__DEV__) {
    devLog("[SHARE_SSOT] profile share", { handle, appStore: APP_STORE_URL });
  }

  return { message: msg };
}

/**
 * Build the share payload for a circle/group share.
 * Returns { message, title } ready for Share.share().
 */
export function buildCircleSharePayload(circleName: string, circleId?: string, referralCode?: string | null): {
  message: string;
  title: string;
} {
  const deepLink = circleId ? getCircleDeepLink(circleId) : null;

  let msg = `Join my group "${circleName}" on Open Invite!`;
  if (deepLink) {
    msg += `\n\nOpen in app: ${deepLink}`;
  }
  msg += `\nDownload: ${APP_STORE_URL}`;

  assertNoForbiddenDomains(msg, "buildCircleSharePayload");

  if (__DEV__) {
    devLog("[SHARE_SSOT] circle share", { circleName, circleId, deepLink, appStore: APP_STORE_URL });
  }

  return { message: msg, title: circleName };
}

/**
 * Build the share payload for monthly recap (no URL needed per existing behavior,
 * but we add App Store link for discoverability).
 */
export function buildRecapSharePayload(parts: {
  month: string;
  year: number;
  totalHangouts: number;
  uniqueFriendsMetWith: number;
  topCategory?: { emoji: string; name: string } | null;
  rankEmoji: string;
  rankTitle: string;
}): { message: string } {
  let msg =
    `📅 My ${parts.month} ${parts.year} Recap on Open Invite!\n\n` +
    `🎉 ${parts.totalHangouts} hangouts\n` +
    `👥 ${parts.uniqueFriendsMetWith} friends met with\n`;
  if (parts.topCategory) {
    msg += `${parts.topCategory.emoji} Favorite: ${parts.topCategory.name}\n`;
  }
  msg += `\nI'm a ${parts.rankEmoji} ${parts.rankTitle}!\n`;
  msg += `\n${APP_STORE_URL}\n#OpenInvite #MonthlyRecap`;

  assertNoForbiddenDomains(msg, "buildRecapSharePayload");

  return { message: msg };
}

// ── Guard ────────────────────────────────────────────────────────────────────

/**
 * DEV-only assertion: throws if share text leaks a forbidden domain.
 * In production it only warns (never crashes the user).
 */
export function assertNoForbiddenDomains(text: string, caller: string): void {
  for (const domain of FORBIDDEN_DOMAINS) {
    if (text.includes(domain)) {
      const msg = `[SHARE_SSOT] FORBIDDEN domain "${domain}" found in share text from ${caller}`;
      if (__DEV__) {
        devWarn(msg);
        // Throw in dev so it's impossible to miss
        throw new Error(msg);
      } else {
        devWarn(msg);
      }
    }
  }
}
