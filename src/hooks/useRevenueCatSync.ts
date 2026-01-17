/**
 * Hook to sync RevenueCat user ID with authentication
 *
 * This hook should be called after a user logs in to link their
 * RevenueCat purchases with their account. This enables:
 * - Cross-device purchase restoration
 * - Server-side purchase verification
 * - Accurate subscription tracking
 */
import { useEffect, useRef } from "react";
import { setUserId, logoutUser, isRevenueCatEnabled } from "@/lib/revenuecatClient";

interface UseRevenueCatSyncOptions {
  userId: string | undefined | null;
  isLoggedIn: boolean;
}

export function useRevenueCatSync({ userId, isLoggedIn }: UseRevenueCatSyncOptions) {
  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    const syncRevenueCat = async () => {
      // Skip if RevenueCat is not configured
      if (!isRevenueCatEnabled()) {
        return;
      }

      // User logged in - sync their ID
      if (isLoggedIn && userId && userId !== lastSyncedUserId.current) {
        const result = await setUserId(userId);
        if (result.ok) {
          lastSyncedUserId.current = userId;
        }
      }

      // User logged out - clear RevenueCat user
      if (!isLoggedIn && lastSyncedUserId.current) {
        await logoutUser();
        lastSyncedUserId.current = null;
      }
    };

    syncRevenueCat();
  }, [userId, isLoggedIn]);
}
