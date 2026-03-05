/**
 * useCircleInviteIntentClaim Hook
 *
 * One-shot circle invite claim on app launch when user is fully authenticated.
 * Claims any pending circle invite stored by deep link handler and joins the circle.
 *
 * Mirrors useRsvpIntentClaim: runs once, never blocks UI, always clears intent.
 * [GROWTH_FULLPHASE_A]
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { getPendingCircleInvite, clearPendingCircleInvite } from '@/lib/pendingCircleInvite';
import { api } from '@/lib/api';
import { devLog, devError } from '@/lib/devLog';
import { trackCircleInviteClaimPostauth } from '@/analytics/analyticsEventsSSOT';

interface UseCircleInviteIntentClaimOptions {
  /** bootStatus from useBootAuthority — must be 'authed' */
  bootStatus: string;
  /** Whether onboarding is complete */
  isOnboardingComplete: boolean;
}

/**
 * Auto-joins pending circle after auth + onboarding complete.
 */
export function useCircleInviteIntentClaim({ bootStatus, isOnboardingComplete }: UseCircleInviteIntentClaimOptions) {
  const hasAttemptedRef = useRef(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (hasAttemptedRef.current) return;
    if (bootStatus !== 'authed' || !isOnboardingComplete) return;

    hasAttemptedRef.current = true;

    const attemptClaim = async () => {
      const t0 = Date.now();
      try {
        const intent = await getPendingCircleInvite();
        if (!intent) {
          if (__DEV__) devLog('[useCircleInviteIntentClaim] no pending intent');
          return;
        }

        if (__DEV__) devLog('[useCircleInviteIntentClaim] claiming', intent.circleId);

        // Navigate to the circle — membership check/join handled by the circle screen itself
        router.push(`/circle/${intent.circleId}`);

        trackCircleInviteClaimPostauth({
          success: true,
          durationMs: Date.now() - t0,
        });

        if (__DEV__) devLog('[useCircleInviteIntentClaim] success');

        // Invalidate circle queries so data refreshes
        queryClient.invalidateQueries({ queryKey: ['circles'] });
      } catch (err) {
        trackCircleInviteClaimPostauth({
          success: false,
          durationMs: Date.now() - t0,
          errorCode: (err as Error).message?.slice(0, 60),
        });
        if (__DEV__) devError('[useCircleInviteIntentClaim] failed', err);
      } finally {
        await clearPendingCircleInvite();
      }
    };

    attemptClaim();
  }, [bootStatus, isOnboardingComplete, queryClient, router]);
}
