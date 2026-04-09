/**
 * Hook to sync RevenueCat user ID with authentication
 *
 * This hook should be called after a user logs in to link their
 * RevenueCat purchases with their account. This enables:
 * - Cross-device purchase restoration
 * - Server-side purchase verification
 * - Accurate subscription tracking
 *
 * After logIn, it calls restorePurchases() to pull in any
 * pre-existing Apple subscriptions (e.g., offer codes redeemed
 * before account creation).
 */
import { useEffect, useRef } from "react";
import {
  setUserId,
  logoutUser,
  restorePurchases,
  isRevenueCatEnabled,
  REVENUECAT_ENTITLEMENT_ID,
} from "@/lib/revenuecatClient";
import { devLog } from "@/lib/devLog";

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

          // Check if logIn transferred any existing entitlements
          const hasTransferredPremium =
            !!result.data.entitlements?.active?.[REVENUECAT_ENTITLEMENT_ID];

          if (__DEV__) {
            devLog("[RevenueCatSync] logIn complete", {
              userId: userId.slice(0, 8),
              hasTransferredPremium,
              activeEntitlements: Object.keys(result.data.entitlements?.active || {}),
            });
          }

          // Always restore purchases after login to catch offer codes,
          // promo codes, or subscriptions purchased before account creation.
          // This is idempotent and safe to call every time.
          const restoreResult = await restorePurchases();
          if (__DEV__) {
            if (restoreResult.ok) {
              const restoredPremium =
                !!restoreResult.data.entitlements?.active?.[REVENUECAT_ENTITLEMENT_ID];
              devLog("[RevenueCatSync] restorePurchases complete", {
                restoredPremium,
                activeEntitlements: Object.keys(restoreResult.data.entitlements?.active || {}),
              });
            } else {
              devLog("[RevenueCatSync] restorePurchases failed", {
                reason: restoreResult.reason,
              });
            }
          }
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
