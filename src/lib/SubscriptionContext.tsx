import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";
import { useSession } from "./useSession";
import {
  getCustomerInfo,
  isRevenueCatEnabled,
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "./revenuecatClient";
import type { PurchasesPackage } from "react-native-purchases";

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
  getOfferings: () => Promise<{ ok: boolean; data?: any; error?: string }>;
  selectDefaultPackage: () => Promise<PurchasesPackage | null>;
  openPaywall: () => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  limits: null,
  purchase: async () => ({ ok: false, error: "Not initialized" }),
  restore: async () => ({ ok: false, error: "Not initialized" }),
  getOfferings: async () => ({ ok: false, error: "Not initialized" }),
  selectDefaultPackage: async () => null,
  openPaywall: async () => ({ ok: false, error: "Not initialized" }),
  features: null,
  isPremium: false,
  isLoading: true,
  refresh: async () => {},
  canUseFeature: () => true,
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
      if (!isRevenueCatEnabled()) {
        setIsPremium(data.subscription?.tier === "premium");
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

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

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

    const result = await purchasePackage(packageOrProduct);

    if (result.ok) {
      // Refresh subscription state
      await fetchSubscription();
      return { ok: true };
    } else {
      const errorMsg = typeof result.error === "string" ? result.error : "Purchase failed";
      const isCancelled = errorMsg.toLowerCase().includes("cancel");
      return { ok: false, cancelled: isCancelled, error: errorMsg };
    }
  }, [fetchSubscription]);

  // Restore purchases
  const restore = useCallback(async () => {
    if (!isRevenueCatEnabled()) {
      return { ok: false, error: "RevenueCat not configured" };
    }

    const result = await restorePurchases();

    if (result.ok) {
      // Refresh subscription state
      await fetchSubscription();
      return { ok: true };
    } else {
      const errorMsg = typeof result.error === "string" ? result.error : "Restore failed";
      return { ok: false, error: errorMsg };
    }
  }, [fetchSubscription]);

  // Get offerings wrapper
  const getOfferingsWrapper = useCallback(async () => {
    if (!isRevenueCatEnabled()) {
      return { ok: false, error: "RevenueCat not configured" };
    }

    const result = await getOfferings();

    if (result.ok) {
      return { ok: true, data: result.data };
    } else {
      return { ok: false, error: "Failed to load offerings" };
    }
  }, []);

  // Select default package (prefer annual)
  const selectDefaultPackage = useCallback(async (): Promise<PurchasesPackage | null> => {
    if (!isRevenueCatEnabled()) {
      return null;
    }

    const result = await getOfferings();

    if (result.ok && result.data.current) {
      const packages = result.data.current.availablePackages;
      // Prefer annual, then monthly, then any
      const annual = packages.find((p) => p.identifier === "$rc_annual");
      if (annual) return annual;

      const monthly = packages.find((p) => p.identifier === "$rc_monthly");
      if (monthly) return monthly;

      return packages[0] ?? null;
    }

    return null;
  }, []);

  // Open paywall - trigger purchase flow directly
  const openPaywall = useCallback(async () => {
    const packageToPurchase = await selectDefaultPackage();

    if (!packageToPurchase) {
      return { ok: false, error: "No packages available" };
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
        selectDefaultPackage,
        openPaywall,
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
