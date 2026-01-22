/**
 * Referral Deep Link Capture
 * 
 * Handles capturing and persisting referral codes from deep links
 * so they can be claimed after user completes signup/login.
 */

import * as SecureStore from 'expo-secure-store';

const PENDING_REFERRAL_CODE_KEY = 'pending_referral_code';
const PENDING_REFERRAL_TIMESTAMP_KEY = 'pending_referral_timestamp';

// Referral codes expire after 7 days
const REFERRAL_CODE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Parse referral code from a URL
 * Supports:
 * - ?ref=CODE query param (works with any scheme: https://, openinvite://, etc.)
 * - /invite/CODE path
 * - vibecode://invite/CODE scheme (legacy)
 */
export function parseReferralCodeFromUrl(url: string): string | null {
  try {
    // Check for ?ref=CODE query param
    const refMatch = url.match(/[?&]ref=([a-zA-Z0-9_-]+)/i);
    if (refMatch?.[1]) {
      return refMatch[1];
    }

    // Check for /invite/CODE path
    const inviteMatch = url.match(/\/invite\/([a-zA-Z0-9_-]+)/i);
    if (inviteMatch?.[1]) {
      return inviteMatch[1];
    }

    // Check for vibecode://invite/CODE scheme
    const schemeMatch = url.match(/vibecode:\/\/invite\/([a-zA-Z0-9_-]+)/i);
    if (schemeMatch?.[1]) {
      return schemeMatch[1];
    }

    return null;
  } catch (error) {
    console.log('[Referral] Error parsing URL:', error);
    return null;
  }
}

/**
 * Store a pending referral code
 * Will be retrieved after user completes signup to claim the referral
 */
export async function setPendingReferralCode(code: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_REFERRAL_CODE_KEY, code);
    await SecureStore.setItemAsync(PENDING_REFERRAL_TIMESTAMP_KEY, Date.now().toString());
    console.log('[Referral] Stored pending referral code:', code);
  } catch (error) {
    console.log('[Referral] Failed to store referral code:', error);
  }
}

/**
 * Get the pending referral code if one exists and hasn't expired
 */
export async function getPendingReferralCode(): Promise<string | null> {
  try {
    const code = await SecureStore.getItemAsync(PENDING_REFERRAL_CODE_KEY);
    const timestampStr = await SecureStore.getItemAsync(PENDING_REFERRAL_TIMESTAMP_KEY);

    if (!code || !timestampStr) {
      return null;
    }

    const timestamp = parseInt(timestampStr, 10);
    const age = Date.now() - timestamp;

    // Check if expired
    if (age > REFERRAL_CODE_EXPIRY_MS) {
      console.log('[Referral] Pending referral code expired, clearing');
      await clearPendingReferralCode();
      return null;
    }

    return code;
  } catch (error) {
    console.log('[Referral] Failed to get referral code:', error);
    return null;
  }
}

/**
 * Clear the pending referral code (after successful claim or expiry)
 */
export async function clearPendingReferralCode(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_REFERRAL_CODE_KEY);
    await SecureStore.deleteItemAsync(PENDING_REFERRAL_TIMESTAMP_KEY);
    console.log('[Referral] Cleared pending referral code');
  } catch (error) {
    console.log('[Referral] Failed to clear referral code:', error);
  }
}

/**
 * Handle an incoming URL that may contain a referral code
 * Returns true if a referral code was found and stored
 */
export async function handleReferralUrl(url: string): Promise<boolean> {
  const code = parseReferralCodeFromUrl(url);
  if (code) {
    await setPendingReferralCode(code);
    return true;
  }
  return false;
}
