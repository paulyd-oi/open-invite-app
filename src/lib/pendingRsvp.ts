/**
 * Pending RSVP Intent — Capture & Persist
 *
 * Stores a pending RSVP intent (eventId + status) when a non-authed user
 * opens a shared event link. After signup/login the intent is auto-applied
 * by useRsvpIntentClaim.
 *
 * Mirrors the referral.ts pattern: SecureStore + 7-day expiry.
 * [GROWTH_P3]
 */

import * as SecureStore from 'expo-secure-store';
import { devLog } from './devLog';

const KEY_EVENT_ID = 'pending_rsvp_event_id';
const KEY_STATUS = 'pending_rsvp_status';
const KEY_TIMESTAMP = 'pending_rsvp_timestamp';

// Pending RSVP intents expire after 7 days
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingRsvpStatus = 'going' | 'interested';

export interface PendingRsvpIntent {
  eventId: string;
  status: PendingRsvpStatus;
}

/**
 * Store a pending RSVP intent for later claim after auth.
 */
export async function setPendingRsvpIntent(intent: PendingRsvpIntent): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_EVENT_ID, intent.eventId);
    await SecureStore.setItemAsync(KEY_STATUS, intent.status);
    await SecureStore.setItemAsync(KEY_TIMESTAMP, Date.now().toString());
    if (__DEV__) {
      devLog('[PendingRsvp] stored', intent.eventId, intent.status);
    }
  } catch {
    if (__DEV__) devLog('[PendingRsvp] store failed');
  }
}

/**
 * Retrieve a pending RSVP intent if it exists and hasn't expired.
 */
export async function getPendingRsvpIntent(): Promise<PendingRsvpIntent | null> {
  try {
    const eventId = await SecureStore.getItemAsync(KEY_EVENT_ID);
    const status = await SecureStore.getItemAsync(KEY_STATUS);
    const ts = await SecureStore.getItemAsync(KEY_TIMESTAMP);

    if (!eventId || !status || !ts) return null;

    if (Date.now() - parseInt(ts, 10) > EXPIRY_MS) {
      if (__DEV__) devLog('[PendingRsvp] expired, clearing');
      await clearPendingRsvpIntent();
      return null;
    }

    return { eventId, status: status as PendingRsvpStatus };
  } catch {
    return null;
  }
}

/**
 * Clear the pending RSVP intent (after claim or expiry).
 */
export async function clearPendingRsvpIntent(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_EVENT_ID);
    await SecureStore.deleteItemAsync(KEY_STATUS);
    await SecureStore.deleteItemAsync(KEY_TIMESTAMP);
  } catch {
    // no-op
  }
}
