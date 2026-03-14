import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useSession } from "./useSession";
import { devLog, devWarn, devError } from "./devLog";
import { useBootAuthority } from "../hooks/useBootAuthority";
import { qk } from "./queryKeys";
import {
  getCustomerInfo,
  isRevenueCatEnabled,
  getOfferings,
  purchasePackage,
  restorePurchases,
  REVENUECAT_ENTITLEMENT_ID,
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_MONTHLY,
  getKeySource,
} from "./revenuecatClient";
import type { PurchasesPackage, PurchasesOfferings } from "react-native-purchases";
import Purchases from "react-native-purchases";

interface SubscriptionFeatures {
  unlimitedFriends: boolean;
  friendGroups: boolean;
  whosFree: boolean;
  workSchedule: boolean;
  friendNotes: boolean;
}

interface SubscriptionLimits {
  maxFriends: number | null;
  currentFriends: number;
  canAddMoreFriends: boolean;
  friendsRemaining: number | null;
}

interface SubscriptionInfo {
  tier: "free" | "premium";
  expiresAt: string | null;
  purchasedAt: string | null;
}

interface SubscriptionContextType {
  subscription: SubscriptionInfo | null;
  limits: SubscriptionLimits | null;
  features: SubscriptionFeatures | null;
  isPremium: boolean;
  isLoading: boolean;
  refresh: () => Promise<{ isPro: boolean }>;
  canUseFeature: (feature: keyof SubscriptionFeatures) => boolean;
  purchase: (packageOrProduct: PurchasesPackage) => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
  restore: () => Promise<{ ok: boolean; isPro?: boolean; error?: string }>;
  getOfferings: () => Promise<PurchasesOfferings | null>;
  openPaywall: (options?: { source?: string; preferred?: "yearly" | "monthly" }) => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
  offerings: PurchasesOfferings | null;
  offeringsStatus: "idle" | "loading" | "ready" | "error";
}

// Export context for direct access in entitlements.ts (avoids circular deps)
export const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  limits: null,
  features: null,
  isPremium: false,
  isLoading: true,
  refresh: async () => ({ isPro: false }),
  canUseFeature: () => true,
  purchase: async () => ({ ok: false, error: "Not initialized" }),
  restore: async () => ({ ok: false, error: "Not initialized" }),
  getOfferings: async () => null,
  openPaywall: async () => ({ ok: false, error: "Not initialized" }),
  offerings: null,
  offeringsStatus: "idle",
});

interface SubscriptionResponse {
  subscription: SubscriptionInfo;
  limits: SubscriptionLimits;
  features: SubscriptionFeatures;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const queryClient = useQueryClient();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);
  const [features, setFeatures] = useState<SubscriptionFeatures | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [offeringsStatus, setOfferingsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const listenerRegistered = useRef(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P0 INVARIANT: Loading must never stay true indefinitely - add timeout fallback
  useEffect(() => {
    // If loading is still true after 5 seconds, force it to false
    // This prevents UI from being stuck in "Loading..." state forever
    loadingTimeoutRef.current = setTimeout(() => {
      if (isLoading) {
        if (__DEV__) {
          devWarn("[SubscriptionContext] Loading timeout - forcing to false (showing Free)");
        }
        setIsLoading(false);
      }
    }, 5000);
    
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []); // Only run once on mount

  // Helper to invalidate all subscription-related queries for instant UI sync
  const invalidateAllSubscriptionQueries = useCallback(() => {
    if (__DEV__) {
      devLog("[SubscriptionContext] Invalidating all subscription queries");
    }
    queryClient.invalidateQueries({ queryKey: qk.entitlements() });
    queryClient.invalidateQueries({ queryKey: qk.subscription() });
    queryClient.invalidateQueries({ queryKey: qk.subscriptionDetails() });
    queryClient.invalidateQueries({ queryKey: qk.profile() });
  }, [queryClient]);

  const fetchSubscription = useCallback(async (): Promise<{ isPro: boolean }> => {
    // [P0_SUB_FETCH_GATE] Only fetch subscription when fully authenticated
    if (!session?.user?.id || bootStatus === 'loggedOut' || bootStatus === 'loading') {
      if (__DEV__) {
        devLog("[P0_SUB_FETCH_GATE] bootStatus=" + bootStatus + " allowed=false reason=" +
          (!session?.user?.id ? "no_session_user" : "boot_state_guard"));
      }
      // Settle as Free without hitting backend
      setIsPremium(false);
      setIsLoading(false);
      return { isPro: false };
    }
    
    // Track computed isPro to return to caller (avoids stale React state issue)
    let computedIsPro = false;

    // [P0_SUB_FETCH_GATE] fetchSubscription entry — session present
    if (__DEV__) {
      devLog("[P0_SUB_FETCH_GATE] allowed=true reason=session_present userId=" + session.user.id.slice(0, 8));
    }

    try {
      // [PRO_SOT] Log source decision
      if (__DEV__) {
        devLog("[PRO_SOT] source=RevenueCat enabled=", isRevenueCatEnabled());
      }
      
      // Step 1: Check RevenueCat (if enabled). Failure means rcIsPro stays false.
      let rcIsPro = false;
      if (isRevenueCatEnabled()) {
        const customerInfoResult = await getCustomerInfo();
        if (customerInfoResult.ok) {
          rcIsPro = !!customerInfoResult.data.entitlements?.active?.[REVENUECAT_ENTITLEMENT_ID];

          if (__DEV__) {
            const activeEntitlements = customerInfoResult.data.entitlements?.active || {};
            const activeKeys = Object.keys(activeEntitlements);
            const premiumEntitlement = activeEntitlements[REVENUECAT_ENTITLEMENT_ID];
            const isLifetime =
              premiumEntitlement?.productIdentifier?.toLowerCase().includes("lifetime") ?? false;

            devLog("[P0_RC_STATE] ENTITLEMENT_CHECK", {
              keySource: getKeySource(),
              entitlementId: REVENUECAT_ENTITLEMENT_ID,
              entitlementActive: rcIsPro,
              expiresDate: premiumEntitlement?.expirationDate ?? null,
              isLifetime,
              activeKeys,
            });
          }
        } else {
          if (__DEV__) {
            devLog("[P0_RC_STATE] ENTITLEMENT_CHECK_FAILED", {
              keySource: getKeySource(),
              reason: customerInfoResult.reason,
            });
          }
        }
      }

      // Step 2: Always fetch backend subscription data
      const data = await api.get<SubscriptionResponse>("/api/subscription");
      setSubscription(data.subscription);
      setLimits(data.limits);
      setFeatures(data.features);

      // Step 3: Always compute backend isPro — never skip this based on RC state.
      // Backend is the source of truth for promo codes, gifted Pro, lifetime, etc.
      const tier = data.subscription?.tier as string | undefined;
      const backendIsPro = tier === "premium" ||
        tier === "pro" ||
        (data.subscription as any)?.isLifetime === true ||
        (data.subscription as any)?.isPro === true;

      // Step 4: OR semantics — Pro if EITHER backend OR RevenueCat says so.
      // This ensures backend PRO (promo/gift/lifetime) is never masked by RC dev-test failures.
      computedIsPro = rcIsPro || backendIsPro;
      setIsPremium(computedIsPro);

      // [PRO_SOT] Canonical combined result — always-on proof log
      if (__DEV__) {
        devLog("[PRO_SOT] COMBINED_RESULT", {
          rcIsPro,
          backendIsPro,
          backendTier: tier,
          backendIsLifetime: (data.subscription as any)?.isLifetime ?? false,
          combinedIsPro: computedIsPro,
          source: rcIsPro && backendIsPro ? "both" : rcIsPro ? "revenuecat" : backendIsPro ? "backend" : "none",
        });
      }
      
      return { isPro: computedIsPro };
    } catch (error: any) {
      if (__DEV__) {
        // [P0_SUB_FETCH_GATE] Use devLog (not devError) for all subscription errors on logged-out screens — no red overlay
        const status = error?.status || error?.response?.status;
        if (status === 401 || status === 403) {
          devLog("[P0_SUB_FETCH_GATE] fetchSubscription auth_expected:", status);
        } else {
          devLog("[PRO_SOT] fetchSubscription non_auth_error (logged_out_suppress):", error);
        }
      }
      // On error, set to free tier defaults
      setSubscription(null);
      setLimits(null);
      setFeatures(null);
      setIsPremium(false);
      return { isPro: false };
    } finally {
      setIsLoading(false);
    }
  }, [session, bootStatus]);

  // Register customerInfo update listener (handles promo codes + purchases from external sources)
  useEffect(() => {
    if (!isRevenueCatEnabled() || listenerRegistered.current) {
      return;
    }

    try {
      const listenerCallback = (customerInfo: any) => {
        // [P0_ENTITLEMENT_REFRESH_TRACE] RC LIVE UPDATE event
        if (__DEV__) {
          devLog("[P0_ENTITLEMENT_REFRESH_TRACE] RC_LIVE_UPDATE received");
        }
        // Use canonical entitlement ID
        const hasPremium = !!customerInfo.entitlements?.active?.[REVENUECAT_ENTITLEMENT_ID];
        
        if (__DEV__) {
          const activeKeys = Object.keys(customerInfo.entitlements?.active || {});
          devLog("[SubscriptionContext] CustomerInfo LIVE UPDATE:", {
            activeKeys,
            hasPremium,
            expectedId: REVENUECAT_ENTITLEMENT_ID,
          });
        }
        
        setIsPremium(hasPremium);
        
        // CRITICAL: Invalidate all queries to ensure UI syncs immediately
        invalidateAllSubscriptionQueries();
        
        // Also refresh backend subscription data
        fetchSubscription();
      };

      Purchases.addCustomerInfoUpdateListener(listenerCallback);
      listenerRegistered.current = true;

      return () => {
        Purchases.removeCustomerInfoUpdateListener(listenerCallback);
        listenerRegistered.current = false;
      };
    } catch (error) {
      if (__DEV__) {
        devError("[SubscriptionContext] Failed to register listener:", error);
      }
    }
  }, [fetchSubscription, invalidateAllSubscriptionQueries]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Load offerings
  useEffect(() => {
    const loadOfferings = async () => {
      if (!isRevenueCatEnabled() || offeringsStatus !== "idle") {
        return;
      }

      setOfferingsStatus("loading");
      const result = await getOfferings();

      if (result.ok) {
        setOfferings(result.data);
        setOfferingsStatus("ready");
      } else {
        setOfferingsStatus("error");
      }
    };

    loadOfferings();
  }, [offeringsStatus]);

  const canUseFeature = useCallback(
    (feature: keyof SubscriptionFeatures): boolean => {
      if (!features) return true; // Allow during loading
      return isPremium || !features[feature];
    },
    [features, isPremium]
  );

  // Purchase a package
  const purchase = useCallback(async (packageOrProduct: PurchasesPackage) => {
    if (!isRevenueCatEnabled()) {
      return { ok: false, error: "RevenueCat not configured" };
    }

    try {
      const result = await purchasePackage(packageOrProduct);

      if (result.ok) {
        if (__DEV__) {
          devLog("[SubscriptionContext][P0_ENTITLEMENT_REFRESH_TRACE] Purchase SUCCESS - updating state immediately");
        }
        
        // Immediately set isPremium for instant UI feedback
        setIsPremium(true);
        
        // CRITICAL: Invalidate all queries for instant UI sync
        invalidateAllSubscriptionQueries();
        
        // Also refresh backend subscription data
        await fetchSubscription();
        
        return { ok: true as const };
      } else {
        // Handle SDK errors
        const error = result.error;
        if (typeof error === "object" && error !== null && "message" in error) {
          const message = (error as any).message?.toLowerCase() || "";
          if (message.includes("cancel") || message.includes("user cancelled")) {
            return { ok: false as const, cancelled: true };
          }
        }
        const errorMsg = typeof error === "string" ? error : "Purchase failed";
        return { ok: false as const, error: errorMsg };
      }
    } catch (error) {
      if (__DEV__) {
        devError("[SubscriptionContext] Purchase error:", error);
      }
      return { ok: false as const, error: "Purchase failed" };
    }
  }, [fetchSubscription, invalidateAllSubscriptionQueries]);

  // Restore purchases
  const restore = useCallback(async (): Promise<{ ok: boolean; isPro?: boolean; error?: string }> => {
    if (!isRevenueCatEnabled()) {
      return { ok: false, error: "RevenueCat not configured" };
    }

    try {
      const result = await restorePurchases();

      if (result.ok) {
        if (__DEV__) {
          devLog("[SubscriptionContext][P0_ENTITLEMENT_REFRESH_TRACE] Restore SUCCESS - checking entitlements");
        }
        
        // Check if restore found active entitlements
        const customerInfo = await getCustomerInfo();
        let hasPremium = false;
        if (customerInfo.ok) {
          hasPremium = !!customerInfo.data.entitlements?.active?.[REVENUECAT_ENTITLEMENT_ID];
          setIsPremium(hasPremium);
          
          if (__DEV__) {
            devLog("[SubscriptionContext] Restore found premium:", hasPremium);
          }
        }
        
        // CRITICAL: Invalidate all queries for instant UI sync
        invalidateAllSubscriptionQueries();
        
        // Also refresh backend subscription data (returns computed isPro)
        const refreshResult = await fetchSubscription();
        // Use the fresher value from fetchSubscription
        const finalIsPro = refreshResult.isPro || hasPremium;
        
        return { ok: true as const, isPro: finalIsPro };
      } else {
        const errorMsg = typeof result.error === "string" ? result.error : "Restore failed";
        return { ok: false as const, error: errorMsg };
      }
    } catch (error) {
      if (__DEV__) {
        devError("[SubscriptionContext] Restore error:", error);
      }
      return { ok: false as const, error: "Restore failed" };
    }
  }, [fetchSubscription, invalidateAllSubscriptionQueries]);

  // Get offerings wrapper
  const getOfferingsWrapper = useCallback(async (): Promise<PurchasesOfferings | null> => {
    if (!isRevenueCatEnabled()) {
      return null;
    }

    // Return cached offerings if available
    if (offerings) {
      return offerings;
    }

    // Otherwise fetch fresh
    const result = await getOfferings();

    if (result.ok) {
      setOfferings(result.data);
      setOfferingsStatus("ready");
      return result.data;
    } else {
      setOfferingsStatus("error");
      return null;
    }
  }, [offerings]);

  // Retry loading offerings (for error recovery)
  const retryOfferings = useCallback(async () => {
    setOfferingsStatus("loading");
    const result = await getOfferings();

    if (result.ok) {
      setOfferings(result.data);
      setOfferingsStatus("ready");
    } else {
      setOfferingsStatus("error");
    }
  }, []);

  // Select default package (prefer annual or user preference)
  const selectDefaultPackage = useCallback(async (preferred?: "yearly" | "monthly"): Promise<PurchasesPackage | null> => {
    if (!isRevenueCatEnabled()) {
      return null;
    }

    // Use cached offerings if available
    let currentOfferings = offerings;

    // If not cached, fetch
    if (!currentOfferings) {
      const result = await getOfferings();
      if (result.ok && result.data.current) {
        currentOfferings = result.data;
        setOfferings(currentOfferings);
        setOfferingsStatus("ready");
      }
    }

    if (currentOfferings?.current) {
      const packages = currentOfferings.current.availablePackages;

      // If user has preference, try that first
      if (preferred === "yearly") {
        const annual = packages.find((p) => p.identifier === RC_PACKAGE_ANNUAL);
        if (annual) return annual;
      } else if (preferred === "monthly") {
        const monthly = packages.find((p) => p.identifier === RC_PACKAGE_MONTHLY);
        if (monthly) return monthly;
      }

      // Default preference: annual > monthly > any
      const annual = packages.find((p) => p.identifier === RC_PACKAGE_ANNUAL);
      if (annual) return annual;

      const monthly = packages.find((p) => p.identifier === RC_PACKAGE_MONTHLY);
      if (monthly) return monthly;

      return packages[0] ?? null;
    }

    return null;
  }, [offerings]);

  // Open paywall - trigger purchase flow directly with options
  const openPaywall = useCallback(async (options?: { source?: string; preferred?: "yearly" | "monthly" }) => {
    const packageToPurchase = await selectDefaultPackage(options?.preferred);

    if (!packageToPurchase) {
      return { ok: false as const, error: "No packages available" };
    }

    return await purchase(packageToPurchase);
  }, [selectDefaultPackage, purchase]);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        limits,
        features,
        isPremium,
        isLoading,
        refresh: fetchSubscription,
        canUseFeature,
        purchase,
        restore,
        getOfferings: getOfferingsWrapper,
        openPaywall,
        offerings,
        offeringsStatus,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
}

// Premium feature names for display
export const PREMIUM_FEATURE_NAMES: Record<keyof SubscriptionFeatures, string> = {
  unlimitedFriends: "Unlimited Friends",
  friendGroups: "Groups",
  whosFree: "Who's Free",
  workSchedule: "Work Schedule",
  friendNotes: "Notes to Remember",
};
