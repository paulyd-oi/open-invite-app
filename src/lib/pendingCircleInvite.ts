/**
 * Pending Circle Invite Intent — Capture & Persist
 *
 * Stores a pending circle-join intent (circleId) when a non-authed user
 * opens a shared circle link. After signup/login the intent is auto-applied
 * by useCircleInviteIntentClaim.
 *
 * Mirrors the pendingRsvp.ts pattern: SecureStore + 7-day expiry.
 * [GROWTH_FULLPHASE_A]
 */

import * as SecureStore from 'expo-secure-store';
import { devLog } from './devLog';

const KEY_CIRCLE_ID = 'pending_circle_invite_id';
const KEY_TIMESTAMP = 'pending_circle_invite_ts';

// Pending circle intents expire after 7 days
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingCircleInviteIntent {
  circleId: string;
}

/**
 * Store a pending circle-join intent for later claim after auth.
 */
export async function setPendingCircleInvite(intent: PendingCircleInviteIntent): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_CIRCLE_ID, intent.circleId);
    await SecureStore.setItemAsync(KEY_TIMESTAMP, Date.now().toString());
    if (__DEV__) {
      devLog('[PendingCircleInvite] stored', intent.circleId);
    }
  } catch {
    if (__DEV__) devLog('[PendingCircleInvite] store failed');
  }
}

/**
 * Retrieve a pending circle-join intent if it exists and hasn't expired.
 */
export async function getPendingCircleInvite(): Promise<PendingCircleInviteIntent | null> {
  try {
    const circleId = await SecureStore.getItemAsync(KEY_CIRCLE_ID);
    const ts = await SecureStore.getItemAsync(KEY_TIMESTAMP);

    if (!circleId || !ts) return null;

    if (Date.now() - parseInt(ts, 10) > EXPIRY_MS) {
      if (__DEV__) devLog('[PendingCircleInvite] expired, clearing');
      await clearPendingCircleInvite();
      return null;
    }

    return { circleId };
  } catch {
    return null;
  }
}

/**
 * Clear the pending circle-join intent (after claim or expiry).
 */
export async function clearPendingCircleInvite(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_CIRCLE_ID);
    await SecureStore.deleteItemAsync(KEY_TIMESTAMP);
  } catch {
    // no-op
  }
}
