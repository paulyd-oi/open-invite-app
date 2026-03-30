/**
 * Attribution Context — Same-Session Campaign Tracking
 *
 * Captures and persists attribution context from tracked deep links
 * (Operator Engine campaign links) so it can be forwarded to the backend
 * on meaningful product actions (signup, RSVP).
 *
 * Pattern mirrors referral.ts — SecureStore with expiry.
 *
 * URL params captured:
 * - t=<tracking_slug>   (from /api/t/[slug] redirect)
 * - c=<campaign_id>     (optional campaign identifier)
 * - v=<visitor_id>      (optional visitor identifier)
 */

import * as SecureStore from 'expo-secure-store';
import { devLog } from './devLog';

// ─── Storage Keys ───────────────────────────────────────────────────

const KEY_TRACKING_SLUG = 'oi_attr_tracking_slug';
const KEY_CAMPAIGN_ID = 'oi_attr_campaign_id';
const KEY_VISITOR_ID = 'oi_attr_visitor_id';
const KEY_SOURCE_PATH = 'oi_attr_source_path';
const KEY_FIRST_SEEN = 'oi_attr_first_seen';

// Attribution context expires after 24 hours (same-session scope)
const ATTRIBUTION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ─── Types ──────────────────────────────────────────────────────────

export interface AttributionContext {
  tracking_slug?: string;
  campaign_id?: string;
  visitor_id?: string;
  source_path?: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  first_seen_at?: string;
}

// ─── URL Parsing ────────────────────────────────────────────────────

/**
 * Extract attribution params from a URL.
 * Looks for ?t=, ?c=, ?v= query params.
 * Returns null if no attribution params found.
 */
export function parseAttributionFromUrl(url: string): Partial<AttributionContext> | null {
  try {
    const trackingMatch = url.match(/[?&]t=([a-zA-Z0-9_-]+)/);
    const campaignMatch = url.match(/[?&]c=([a-zA-Z0-9_-]+)/);
    const visitorMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);

    if (!trackingMatch && !campaignMatch) {
      return null;
    }

    return {
      tracking_slug: trackingMatch?.[1],
      campaign_id: campaignMatch?.[1],
      visitor_id: visitorMatch?.[1],
    };
  } catch {
    return null;
  }
}

// ─── Persistence ────────────────────────────────────────────────────

/**
 * Store attribution context from an incoming tracked link.
 * Only overwrites if new context has a tracking_slug or campaign_id.
 */
export async function setAttributionContext(
  ctx: Partial<AttributionContext> & { source_path?: string }
): Promise<void> {
  try {
    if (ctx.tracking_slug) {
      await SecureStore.setItemAsync(KEY_TRACKING_SLUG, ctx.tracking_slug);
    }
    if (ctx.campaign_id) {
      await SecureStore.setItemAsync(KEY_CAMPAIGN_ID, ctx.campaign_id);
    }
    if (ctx.visitor_id) {
      await SecureStore.setItemAsync(KEY_VISITOR_ID, ctx.visitor_id);
    }
    if (ctx.source_path) {
      await SecureStore.setItemAsync(KEY_SOURCE_PATH, ctx.source_path);
    }
    await SecureStore.setItemAsync(KEY_FIRST_SEEN, Date.now().toString());

    if (__DEV__) {
      devLog('[Attribution] Stored context:', ctx);
    }
  } catch (error) {
    if (__DEV__) {
      devLog('[Attribution] Failed to store context:', error);
    }
  }
}

/**
 * Retrieve current attribution context if it exists and hasn't expired.
 * Returns null if no context or expired.
 */
export async function getAttributionContext(): Promise<AttributionContext | null> {
  try {
    const firstSeen = await SecureStore.getItemAsync(KEY_FIRST_SEEN);
    if (!firstSeen) return null;

    const age = Date.now() - parseInt(firstSeen, 10);
    if (age > ATTRIBUTION_EXPIRY_MS) {
      if (__DEV__) devLog('[Attribution] Context expired, clearing');
      await clearAttributionContext();
      return null;
    }

    const tracking_slug = await SecureStore.getItemAsync(KEY_TRACKING_SLUG);
    const campaign_id = await SecureStore.getItemAsync(KEY_CAMPAIGN_ID);

    // Contract: at least one of tracking_slug or campaign_id must be present
    if (!tracking_slug && !campaign_id) {
      return null;
    }

    const visitor_id = await SecureStore.getItemAsync(KEY_VISITOR_ID);
    const source_path = await SecureStore.getItemAsync(KEY_SOURCE_PATH);

    return {
      tracking_slug: tracking_slug ?? undefined,
      campaign_id: campaign_id ?? undefined,
      visitor_id: visitor_id ?? undefined,
      source_path: source_path ?? undefined,
      platform: 'ios',
      first_seen_at: new Date(parseInt(firstSeen, 10)).toISOString(),
    };
  } catch (error) {
    if (__DEV__) {
      devLog('[Attribution] Failed to get context:', error);
    }
    return null;
  }
}

/**
 * Clear attribution context (after expiry or if needed).
 */
export async function clearAttributionContext(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_TRACKING_SLUG);
    await SecureStore.deleteItemAsync(KEY_CAMPAIGN_ID);
    await SecureStore.deleteItemAsync(KEY_VISITOR_ID);
    await SecureStore.deleteItemAsync(KEY_SOURCE_PATH);
    await SecureStore.deleteItemAsync(KEY_FIRST_SEEN);
  } catch {
    // best-effort
  }
}
