/**
 * Activation Funnel — First-Time Action Tracker
 *
 * Tracks whether key activation milestones have been reached per user.
 * Fires PostHog events only on the FIRST occurrence of each action.
 * Uses AsyncStorage with user-scoped keys.
 *
 * [GROWTH_FULLPHASE_C]
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { devLog } from './devLog';
import {
  trackFirstEventCreated,
  trackFirstRsvpGoing,
  trackFirstFriendAdded,
  trackFirstCircleJoined,
} from '@/analytics/analyticsEventsSSOT';

type ActivationMilestone = 'event_created' | 'rsvp_going' | 'friend_added' | 'circle_joined';

const PREFIX = 'activation_funnel:';

/** In-memory cache to avoid repeated AsyncStorage reads within a session. */
const _firedThisSession = new Set<string>();

/**
 * Check if milestone has already been reached for this user.
 * If not, mark it and fire the corresponding PostHog event.
 */
export async function maybeTrackFirstAction(
  milestone: ActivationMilestone,
  userId: string,
  props: { sourceScreen: string; entryPoint?: string; hasFriends?: boolean },
): Promise<void> {
  const key = `${PREFIX}${milestone}:${userId}`;
  const cacheKey = `${milestone}:${userId}`;

  // Fast path: already fired this session
  if (_firedThisSession.has(cacheKey)) return;

  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored === '1') {
      _firedThisSession.add(cacheKey);
      return;
    }

    // First time — record and fire
    await AsyncStorage.setItem(key, '1');
    _firedThisSession.add(cacheKey);

    if (__DEV__) devLog(`[ACTIVATION_FUNNEL] first ${milestone}`);

    switch (milestone) {
      case 'event_created':
        trackFirstEventCreated({ sourceScreen: props.sourceScreen, hasFriends: props.hasFriends ?? false });
        break;
      case 'rsvp_going':
        trackFirstRsvpGoing({ sourceScreen: props.sourceScreen, entryPoint: props.entryPoint ?? 'unknown' });
        break;
      case 'friend_added':
        trackFirstFriendAdded({ sourceScreen: props.sourceScreen, entryPoint: props.entryPoint ?? 'unknown' });
        break;
      case 'circle_joined':
        trackFirstCircleJoined({ sourceScreen: props.sourceScreen, entryPoint: props.entryPoint ?? 'unknown' });
        break;
    }
  } catch {
    // Silent — never block user flow for telemetry
  }
}
