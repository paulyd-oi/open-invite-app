import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";
import { useSession } from "./useSession";

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
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  limits: null,
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
  const [isLoading, setIsLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (!session) {
      setSubscription(null);
      setLimits(null);
      setFeatures(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await api.get<SubscriptionResponse>("/api/subscription");
      setSubscription(data.subscription);
      setLimits(data.limits);
      setFeatures(data.features);
    } catch (error) {
      if (__DEV__) {
        console.error("Failed to fetch subscription:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const isPremium = subscription?.tier === "premium";

  const canUseFeature = useCallback(
    (feature: keyof SubscriptionFeatures): boolean => {
      if (!features) return true; // Allow during loading
      return isPremium || !features[feature];
    },
    [features, isPremium]
  );

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
  friendGroups: "Friend Groups",
  whosFree: "Who's Free",
  workSchedule: "Work Schedule",
  friendNotes: "Notes to Remember",
};
