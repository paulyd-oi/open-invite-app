import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api } from "./api";
import { useSession } from "./useSession";
import {
  getCustomerInfo,
  isRevenueCatEnabled,
  getOfferings,
  purchasePackage,
  restorePurchases,
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
  refresh: () => Promise<void>;
  canUseFeature: (feature: keyof SubscriptionFeatures) => boolean;
  purchase: (packageOrProduct: PurchasesPackage) => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
  restore: () => Promise<{ ok: boolean; error?: string }>;
  getOfferings: () => Promise<PurchasesOfferings | null>;
  openPaywall: (options?: { source?: string; preferred?: "yearly" | "monthly" }) => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
  offerings: PurchasesOfferings | null;
  offeringsStatus: "idle" | "loading" | "ready" | "error";
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  limits: null,
  features: null,
  isPremium: false,
  isLoading: true,
  refresh: async () => {},
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
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);
  const [features, setFeatures] = useState<SubscriptionFeatures | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [offeringsStatus, setOfferingsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const listenerRegistered = useRef(false);

  const fetchSubscription = useCallback(async () => {
    // Note: session is optional enrichment - subscription endpoint validates via Bearer token
    // If session is null but token is valid, subscription fetch will still work

    try {
      // Check RevenueCat first if enabled
      if (isRevenueCatEnabled()) {
        const customerInfoResult = await getCustomerInfo();
        if (customerInfoResult.ok) {
          const hasPremium = !!customerInfoResult.data.entitlements?.active?.premium;
          setIsPremium(hasPremium);
        }
      }

      // Fetch backend subscription data
      const data = await api.get<SubscriptionResponse>("/api/subscription");
      setSubscription(data.subscription);
      setLimits(data.limits);
      setFeatures(data.features);

      // If RevenueCat not enabled, fall back to backend tier
      // IMPORTANT: Lifetime users must always be treated as premium
      if (!isRevenueCatEnabled()) {
        // Cast tier to string for flexible comparison (backend may return various values)
        const tier = data.subscription?.tier as string | undefined;
        const backendIsPremium = tier === "premium" || 
          tier === "pro" ||
          (data.subscription as any)?.isLifetime === true ||
          (data.subscription as any)?.isPro === true;
        setIsPremium(backendIsPremium);
        if (__DEV__) {
          console.log("[SubscriptionContext] Backend tier:", tier, 
            "isLifetime:", (data.subscription as any)?.isLifetime,
            "isPro:", (data.subscription as any)?.isPro,
            "=> isPremium:", backendIsPremium);
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.error("Failed to fetch subscription:", error);
      }
      // On error, set to free tier defaults
      setSubscription(null);
      setLimits(null);
      setFeatures(null);
      setIsPremium(false);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  // Register customerInfo update listener
  useEffect(() => {
    if (!isRevenueCatEnabled() || listenerRegistered.current) {
      return;
    }

    try {
      const listenerCallback = (customerInfo: any) => {
        if (__DEV__) {
          console.log("[SubscriptionContext] CustomerInfo updated:", !!customerInfo.entitlements?.active?.premium);
        }
        const hasPremium = !!customerInfo.entitlements?.active?.premium;
        setIsPremium(hasPremium);
        // Optionally refresh full subscription data
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
        console.error("[SubscriptionContext] Failed to register listener:", error);
      }
    }
  }, [fetchSubscription]);

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
        // Force refresh subscription state
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
        console.error("[SubscriptionContext] Purchase error:", error);
      }
      return { ok: false as const, error: "Purchase failed" };
    }
  }, [fetchSubscription]);

  // Restore purchases
  const restore = useCallback(async () => {
    if (!isRevenueCatEnabled()) {
      return { ok: false, error: "RevenueCat not configured" };
    }

    try {
      const result = await restorePurchases();

      if (result.ok) {
        // Force refresh subscription state
        await fetchSubscription();
        return { ok: true as const };
      } else {
        const errorMsg = typeof result.error === "string" ? result.error : "Restore failed";
        return { ok: false as const, error: errorMsg };
      }
    } catch (error) {
      if (__DEV__) {
        console.error("[SubscriptionContext] Restore error:", error);
      }
      return { ok: false as const, error: "Restore failed" };
    }
  }, [fetchSubscription]);

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
        const annual = packages.find((p) => p.identifier === "$rc_annual");
        if (annual) return annual;
      } else if (preferred === "monthly") {
        const monthly = packages.find((p) => p.identifier === "$rc_monthly");
        if (monthly) return monthly;
      }

      // Default preference: annual > monthly > any
      const annual = packages.find((p) => p.identifier === "$rc_annual");
      if (annual) return annual;

      const monthly = packages.find((p) => p.identifier === "$rc_monthly");
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
