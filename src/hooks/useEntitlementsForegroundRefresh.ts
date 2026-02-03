/**
 * Entitlements Foreground Refresh Hook
 * 
 * Automatically refreshes entitlements when app comes to foreground.
 * Includes 10-minute guard to prevent spam.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRefreshEntitlements } from '@/lib/entitlements';
import { devLog } from '@/lib/devLog';

const REFRESH_THROTTLE_MS = 1000 * 60 * 10; // 10 minutes

export function useEntitlementsForegroundRefresh(props: {
  isLoggedIn: boolean;
}) {
  const { isLoggedIn } = props;
  const refreshEntitlements = useRefreshEntitlements();
  const lastRefreshTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isLoggedIn) {
      return; // Only refresh when logged in
    }

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTimeRef.current;

        // Only refresh if more than 10 minutes since last refresh
        if (timeSinceLastRefresh > REFRESH_THROTTLE_MS) {
          if (__DEV__) {
            devLog('[useEntitlementsForegroundRefresh] Refreshing entitlements on foreground');
          }
          refreshEntitlements();
          lastRefreshTimeRef.current = now;
        } else {
          if (__DEV__) {
            const remainingMs = REFRESH_THROTTLE_MS - timeSinceLastRefresh;
            const remainingMin = Math.ceil(remainingMs / 1000 / 60);
            devLog(
              `[useEntitlementsForegroundRefresh] Skipping refresh (throttled, ${remainingMin}min remaining)`
            );
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isLoggedIn, refreshEntitlements]);
}
