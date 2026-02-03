/**
 * useReferralClaim Hook
 * 
 * One-shot referral claim on app launch when user is fully authenticated.
 * Claims any pending referral code and clears it regardless of outcome.
 * 
 * - Runs at most once per app launch
 * - Never blocks UI
 * - Never creates loops
 * - Clears pending code on success or known errors (SELF_REFERRAL, INVALID_CODE, ALREADY_CLAIMED)
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getPendingReferralCode, clearPendingReferralCode } from '@/lib/referral';
import { devLog, devWarn, devError } from '@/lib/devLog';
import { claimReferral, type ClaimErrorCode } from '@/lib/referralsApi';

interface UseReferralClaimOptions {
  /** bootStatus from useBootAuthority - must be 'authed' */
  bootStatus: string;
  /** Whether onboarding is complete (user is fully ready) */
  isOnboardingComplete: boolean;
}

/**
 * Hook to automatically claim pending referral codes after auth + onboarding complete.
 * 
 * Usage:
 * ```tsx
 * useReferralClaim({ bootStatus, isOnboardingComplete: true });
 * ```
 */
export function useReferralClaim({ bootStatus, isOnboardingComplete }: UseReferralClaimOptions) {
  const hasAttemptedRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Guard: Only run once per app launch
    if (hasAttemptedRef.current) {
      return;
    }

    // Guard: Must be fully authenticated AND onboarding complete
    if (bootStatus !== 'authed' || !isOnboardingComplete) {
      return;
    }

    // Mark as attempted immediately to prevent duplicate runs
    hasAttemptedRef.current = true;

    const attemptClaim = async () => {
      try {
        // Check for pending referral code
        const pendingCode = await getPendingReferralCode();
        
        if (!pendingCode) {
          // No pending code - nothing to do
          if (__DEV__) {
            devLog('[useReferralClaim] No pending referral code');
          }
          return;
        }

        if (__DEV__) {
          devLog('[useReferralClaim] Attempting to claim referral code:', pendingCode);
        }

        // Attempt to claim
        const result = await claimReferral(pendingCode);

        if (result.success) {
          // Success - clear pending code and invalidate referral stats
          if (__DEV__) {
            devLog('[useReferralClaim] Successfully claimed referral code');
          }
          await clearPendingReferralCode();
          queryClient.invalidateQueries({ queryKey: ['referralStats'] });
          return;
        }

        // Handle known error cases - all should clear the pending code
        // (user can't fix these easily, no point keeping the code)
        const clearableErrors: ClaimErrorCode[] = [
          'SELF_REFERRAL',
          'INVALID_CODE', 
          'ALREADY_CLAIMED',
          'EXPIRED_CODE',
        ];

        if (result.errorCode && clearableErrors.includes(result.errorCode)) {
          if (__DEV__) {
            devLog(`[useReferralClaim] Clearing code due to: ${result.errorCode}`);
          }
          await clearPendingReferralCode();
          return;
        }

        // Unknown error - log but still clear (to prevent retry loops)
        if (__DEV__) {
          devLog('[useReferralClaim] Unknown error, clearing code:', result.message);
        }
        await clearPendingReferralCode();

      } catch (error) {
        // Unexpected error - log once and clear to prevent loops
        if (__DEV__) {
          devError('[useReferralClaim] Unexpected error during claim:', error);
        }
        await clearPendingReferralCode();
      }
    };

    // Run async claim without blocking
    attemptClaim();
  }, [bootStatus, isOnboardingComplete, queryClient]);
}
