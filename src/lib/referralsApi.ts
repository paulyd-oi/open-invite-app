/**
 * Referrals API
 * 
 * API helpers for referral-related endpoints.
 * Uses existing api wrapper patterns.
 */

import { api } from './api';

/**
 * Response from POST /api/referral/apply
 */
export interface ClaimReferralResponse {
  success?: boolean;
  referrerName?: string;
  welcomeBonus?: string;
  error?: string;
}

/**
 * Error codes from claim endpoint
 */
export type ClaimErrorCode = 
  | 'SELF_REFERRAL' 
  | 'INVALID_CODE' 
  | 'ALREADY_CLAIMED'
  | 'EXPIRED_CODE'
  | 'UNKNOWN';

/**
 * Claim a referral code
 * POST /api/referral/apply
 * 
 * Returns { success: true, referrerName, welcomeBonus } on success
 * Returns error with code on failure (SELF_REFERRAL, INVALID_CODE, ALREADY_CLAIMED)
 */
export async function claimReferral(code: string): Promise<{
  success: boolean;
  errorCode?: ClaimErrorCode;
  message?: string;
}> {
  try {
    const response = await api.post<ClaimReferralResponse>('/api/referral/apply', { referralCode: code });
    
    if (response?.success || response?.referrerName) {
      return { success: true };
    }
    
    return { success: false, errorCode: 'UNKNOWN', message: 'Unexpected response' };
  } catch (error: any) {
    // Parse error response for specific error codes
    // Backend returns { error: "message" } format
    const errorMessage = error?.message || error?.body?.error || '';
    const errorBody = error?.body || {};
    
    let errorCode: ClaimErrorCode = 'UNKNOWN';
    
    // Check for self-referral
    if (errorMessage.toLowerCase().includes('your own') || errorBody.code === 'SELF_REFERRAL') {
      errorCode = 'SELF_REFERRAL';
    } 
    // Check for invalid code
    else if (errorMessage.toLowerCase().includes('invalid') || errorBody.code === 'INVALID_CODE') {
      errorCode = 'INVALID_CODE';
    } 
    // Check for already claimed
    else if (errorMessage.toLowerCase().includes('already') || errorBody.code === 'ALREADY_CLAIMED') {
      errorCode = 'ALREADY_CLAIMED';
    } 
    // Check for expired
    else if (errorMessage.toLowerCase().includes('expired') || errorBody.code === 'EXPIRED_CODE') {
      errorCode = 'EXPIRED_CODE';
    }
    
    if (__DEV__) {
      console.log('[ReferralsApi] claimReferral error:', errorCode, errorMessage);
    }
    
    return {
      success: false,
      errorCode,
      message: errorMessage,
    };
  }
}
