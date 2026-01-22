/**
 * Referrals API
 * 
 * API helpers for referral-related endpoints.
 * Uses existing api wrapper patterns.
 */

import { api } from './api';

/**
 * Response from GET /api/referrals/me
 */
export interface MyReferralResponse {
  referralCode: string;
  stats: {
    invited: number;
    claimed: number;
    rewarded: number;
  };
}

/**
 * Response from POST /api/referrals/claim
 */
export interface ClaimReferralResponse {
  ok: boolean;
  message?: string;
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
 * Get current user's referral info (code + stats)
 * GET /api/referrals/me
 */
export async function getMyReferral(): Promise<MyReferralResponse | null> {
  try {
    return await api.get<MyReferralResponse>('/api/referrals/me');
  } catch (error) {
    console.log('[ReferralsApi] getMyReferral error:', error);
    return null;
  }
}

/**
 * Claim a referral code
 * POST /api/referrals/claim
 * 
 * Returns { ok: true } on success
 * Returns error with code on failure (SELF_REFERRAL, INVALID_CODE, ALREADY_CLAIMED)
 */
export async function claimReferral(code: string): Promise<{
  success: boolean;
  errorCode?: ClaimErrorCode;
  message?: string;
}> {
  try {
    const response = await api.post<ClaimReferralResponse>('/api/referrals/claim', { code });
    
    if (response?.ok) {
      return { success: true };
    }
    
    return { success: false, errorCode: 'UNKNOWN', message: 'Unexpected response' };
  } catch (error: any) {
    // Parse error response for specific error codes
    const errorMessage = error?.message || '';
    const errorBody = error?.body || {};
    
    let errorCode: ClaimErrorCode = 'UNKNOWN';
    
    if (errorMessage.includes('SELF_REFERRAL') || errorBody.code === 'SELF_REFERRAL') {
      errorCode = 'SELF_REFERRAL';
    } else if (errorMessage.includes('INVALID_CODE') || errorBody.code === 'INVALID_CODE') {
      errorCode = 'INVALID_CODE';
    } else if (errorMessage.includes('ALREADY_CLAIMED') || errorBody.code === 'ALREADY_CLAIMED') {
      errorCode = 'ALREADY_CLAIMED';
    } else if (errorMessage.includes('EXPIRED') || errorBody.code === 'EXPIRED_CODE') {
      errorCode = 'EXPIRED_CODE';
    }
    
    console.log('[ReferralsApi] claimReferral error:', errorCode, errorMessage);
    
    return {
      success: false,
      errorCode,
      message: errorMessage,
    };
  }
}
