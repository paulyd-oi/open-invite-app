/**
 * useRsvpIntentClaim Hook
 *
 * One-shot RSVP intent claim on app launch when user is fully authenticated.
 * Claims any pending RSVP intent stored by deep link handler and applies it.
 *
 * Mirrors useReferralClaim: runs once, never blocks UI, always clears intent.
 * [GROWTH_P3]
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getPendingRsvpIntent, clearPendingRsvpIntent } from '@/lib/pendingRsvp';
import { postIdempotent } from '@/lib/idempotencyKey';
import { devLog, devError } from '@/lib/devLog';
import { safeToast } from '@/lib/safeToast';
import { trackRsvpIntentAppliedPostauth } from '@/analytics/analyticsEventsSSOT';

interface UseRsvpIntentClaimOptions {
  /** bootStatus from useBootAuthority — must be 'authed' */
  bootStatus: string;
  /** Whether onboarding is complete */
  isOnboardingComplete: boolean;
}

/**
 * Auto-applies pending RSVP intent after auth + onboarding complete.
 */
export function useRsvpIntentClaim({ bootStatus, isOnboardingComplete }: UseRsvpIntentClaimOptions) {
  const hasAttemptedRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (hasAttemptedRef.current) return;
    if (bootStatus !== 'authed' || !isOnboardingComplete) return;

    hasAttemptedRef.current = true;

    const attemptClaim = async () => {
      const t0 = Date.now();
      try {
        const intent = await getPendingRsvpIntent();
        if (!intent) {
          if (__DEV__) devLog('[useRsvpIntentClaim] no pending intent');
          return;
        }

        if (__DEV__) devLog('[useRsvpIntentClaim] claiming', intent.eventId, intent.status);

        await postIdempotent(`/api/events/${intent.eventId}/rsvp`, { status: intent.status });

        trackRsvpIntentAppliedPostauth({
          success: true,
          durationMs: Date.now() - t0,
        });

        if (__DEV__) devLog('[useRsvpIntentClaim] success');

        // Invalidate event queries so the RSVP shows up
        queryClient.invalidateQueries({ queryKey: ['event', intent.eventId] });
        queryClient.invalidateQueries({ queryKey: ['events'] });
      } catch (err: any) {
        const msg = err?.message ?? '';
        const is409 = msg.includes('409') || msg.toLowerCase().includes('full') || msg.toLowerCase().includes('capacity');
        if (is409) {
          safeToast.info('Event Full', 'This event has reached capacity.');
        } else {
          safeToast.error('RSVP Failed', 'Something went wrong. Try again from the event page.');
        }
        trackRsvpIntentAppliedPostauth({
          success: false,
          durationMs: Date.now() - t0,
          failureCode: msg.slice(0, 60),
        });
        if (__DEV__) devError('[useRsvpIntentClaim] failed', err);
      } finally {
        await clearPendingRsvpIntent();
      }
    };

    attemptClaim();
  }, [bootStatus, isOnboardingComplete, queryClient]);
}
