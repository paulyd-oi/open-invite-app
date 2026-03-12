import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { devLog, devWarn, devError } from "@/lib/devLog";
import {
  Crown,
  Check,
  X,
  Sparkles,
  Gift,
  ChevronRight,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { type PurchasesPackage } from "react-native-purchases";

import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useRefreshProContract } from "@/lib/entitlements";
import { useSubscription } from "@/lib/SubscriptionContext";
import {
  isRevenueCatEnabled,
  getOfferingWithFallback,
  purchasePackage,
  restorePurchases,
  REVENUECAT_OFFERING_ID,
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_LIFETIME,
  getKeySource,
} from "@/lib/revenuecatClient";

// Beta mode - set to false for production (payments are active)
const BETA_MODE = false;

// Free tier features - only list what is actually enforced
const FREE_FEATURES = [
  { text: "Host up to 3 events per month", included: true },
  { text: "Unlimited friends", included: true },
  { text: "RSVP to any event", included: true },
  { text: "Unlimited hosting", included: false },
];

// Founder Pro v1 features - only list what is actually enforced
const PREMIUM_FEATURES = [
  { text: "Unlimited hosting", included: true },
  { text: "Everything in Free", included: true },
];

// Future expansion note
const FOUNDER_PRO_NOTE = "More organizer tools will be added as they ship.";

export default function PaywallScreen() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const refreshProContract = useRefreshProContract();
  const queryClient = useQueryClient();
  const { isPremium, refresh: refreshSubscription } = useSubscription();

  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"yearly" | "lifetime">("yearly");
  const [yearlyPackage, setYearlyPackage] = useState<PurchasesPackage | null>(null);
  const [lifetimePackage, setLifetimePackage] = useState<PurchasesPackage | null>(null);
  const [revenueCatEnabled, setRevenueCatEnabled] = useState(false);

  // Modal state
  const [showPremiumSuccessModal, setShowPremiumSuccessModal] = useState(false);
  const [showRestoreSuccessModal, setShowRestoreSuccessModal] = useState(false);

  useEffect(() => {
    loadOfferings();
  }, []);

  // Redirect premium users back - they shouldn't see paywall
  useEffect(() => {
    if (isPremium && !isLoading) {
      if (__DEV__) devLog("[Paywall] Premium user detected, redirecting back");
      router.back();
    }
  }, [isPremium, isLoading, router]);

  // Refresh subscription status on mount to ensure fresh premium check
  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  const loadOfferings = async () => {
    setIsLoading(true);

    const enabled = isRevenueCatEnabled();
    setRevenueCatEnabled(enabled);

    if (!enabled) {
      setIsLoading(false);
      return;
    }

    const result = await getOfferingWithFallback();

    if (result.ok && result.data.offering) {
      const packages = result.data.offering.availablePackages;
      const yearly = packages.find((p) => p.identifier === RC_PACKAGE_ANNUAL) ?? null;
      const lifetime = packages.find((p) => p.identifier === RC_PACKAGE_LIFETIME) ?? null;
      setYearlyPackage(yearly);
      setLifetimePackage(lifetime);

      // [P0_RC_STATE] Offering loaded snapshot
      if (__DEV__) {
        devLog("[P0_RC_STATE] OFFERING_LOADED", {
          keySource: getKeySource(),
          offeringId: result.data.usedId,
          foundRequested: result.data.foundRequested,
          packagesTotal: packages.length,
          hasAnnual: !!yearly,
          hasLifetime: !!lifetime,
          packageIds: packages.map((p) => p.identifier),
        });
      }
    } else if (!result.ok) {
      // SDK-level failure — calm inline message, no modal
      if (__DEV__) {
        devWarn("[Paywall] Offering load failed:", result.reason);
        devLog("[P0_RC_STATE] OFFERING_FAILED", { keySource: getKeySource(), reason: result.reason });
      }
    }
    // If result.ok but offering is null → no offerings at all;
    // purchase button stays disabled, no scary toast.

    setIsLoading(false);
  };

  const handlePurchase = async () => {
    const packageToPurchase = selectedPlan === "lifetime" ? lifetimePackage : yearlyPackage;
    if (!packageToPurchase) {
      safeToast.error("Load Failed", "Unable to load subscription. Please try again.");
      return;
    }

    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await purchasePackage(packageToPurchase);

    if (result.ok) {
      // CANONICAL: Use refreshProContract for SSOT after purchase
      const { combinedIsPro } = await refreshProContract({ reason: "purchase:paywall" });

      if (__DEV__) {
        devLog("[PRO_SOT] AFTER screen=paywall_purchase combinedIsPro=", combinedIsPro);
        devLog("[P0_RC_PURCHASE_CONFIRM]", {
          surface: "paywall",
          storekitSuccess: true,
          didRefresh: true,
          combinedIsPro,
        });
      }

      // Show success regardless — purchase succeeded at StoreKit level.
      // combinedIsPro may lag in simulator; trust the purchase result.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowPremiumSuccessModal(true);
    } else if (result.reason === "sdk_error") {
      // Purchase cancelled or failed silently
    }

    setIsPurchasing(false);
  };

  const handleRestore = async () => {
    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // [PRO_SOT] Log BEFORE state
    if (__DEV__) {
      devLog("[PRO_SOT] BEFORE screen=paywall_restore isPremium=", isPremium);
    }

    const result = await restorePurchases();

    if (result.ok) {
      // CANONICAL: Use refreshProContract for SSOT after restore
      const { rcIsPro, backendIsPro, combinedIsPro } = await refreshProContract({ reason: "restore:paywall" });
      
      // [PRO_SOT] Log AFTER state
      if (__DEV__) {
        devLog("[PRO_SOT] AFTER screen=paywall_restore combinedIsPro=", combinedIsPro);
      }

      if (combinedIsPro) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowRestoreSuccessModal(true);
      } else {
        safeToast.info(
          "No Purchases Found",
          "We couldn't find any previous purchases to restore."
        );
      }
    } else {
      safeToast.error("Restore Failed", "Failed to restore purchases. Please try again.");
    }

    setIsPurchasing(false);
  };


  const getSelectedPrice = () => {
    if (selectedPlan === "lifetime") {
      return lifetimePackage?.product?.priceString ?? "–";
    }
    return yearlyPackage?.product?.priceString ?? "–";
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <View className="w-16 h-16 rounded-full items-center justify-center mb-4" style={{ backgroundColor: `${themeColor}20` }}>
          <Crown size={32} color={themeColor} />
        </View>
        <ActivityIndicator size="large" color={themeColor} />
        <Text style={{ color: colors.textSecondary }} className="mt-4 text-base">
          Loading plans…
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* Header with gradient */}
      <LinearGradient
        colors={[themeColor, `${themeColor}CC`]}
        style={{
          paddingTop: 60,
          paddingBottom: 32,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
        }}
      >
        {/* Close button */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/");
            }
          }}
          className="absolute top-14 right-5 w-8 h-8 rounded-full bg-white/20 items-center justify-center"
          style={{ zIndex: 10 }}
        >
          <X size={20} color="#fff" />
        </Pressable>

        <Animated.View entering={FadeInDown.delay(100)} className="items-center">
          <View className="w-20 h-20 rounded-full bg-white/20 items-center justify-center mb-4">
            <Crown size={40} color="#fff" />
          </View>
          <Text className="text-white text-3xl font-bold text-center">
            Choose Your Plan
          </Text>
          <Text className="text-white/80 text-center mt-2 text-base">
            Unlock all features and connect with everyone
          </Text>
        </Animated.View>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Beta Banner */}
        {BETA_MODE && (
          <Animated.View entering={FadeInUp.delay(150)}>
            <View
              className="rounded-2xl p-4 mb-6 flex-row items-center"
              style={{ backgroundColor: "#10B98120", borderWidth: 1, borderColor: "#10B981" }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#10B981" }}>
                <Gift size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold" style={{ color: "#10B981" }}>
                  Beta Launch Special!
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Enjoy all premium features free for the first month
                </Text>
              </View>
            </View>
          </Animated.View>
        )}


        {/* Plans Side by Side */}
        <Animated.View entering={FadeInUp.delay(200)} className="flex-row gap-3 mb-6">
          {/* Free Plan */}
          <View
            className="flex-1 rounded-2xl p-4"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text }} className="text-lg font-bold text-center mb-1">
              Free
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-center text-sm mb-4">
              Basic features
            </Text>

            <View className="items-center mb-4">
              <Text style={{ color: colors.text }} className="text-2xl font-bold">
                $0
              </Text>
              <Text style={{ color: colors.textTertiary }} className="text-xs">
                forever
              </Text>
            </View>

            <View className="space-y-2">
              {FREE_FEATURES.map((feature, index) => (
                <View key={index} className="flex-row items-center mb-2">
                  {feature.included ? (
                    <Check size={14} color="#10B981" />
                  ) : (
                    <X size={14} color={colors.textTertiary} />
                  )}
                  <Text
                    className="text-xs ml-2 flex-1"
                    style={{ color: feature.included ? colors.text : colors.textTertiary }}
                  >
                    {feature.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Premium Plan */}
          <View
            className="flex-1 rounded-2xl p-4"
            style={{
              backgroundColor: `${themeColor}10`,
              borderWidth: 2,
              borderColor: themeColor,
            }}
          >
            {/* Best Value Badge */}
            <View
              className="absolute -top-3 left-1/2 px-3 py-1 rounded-full"
              style={{
                backgroundColor: themeColor,
                transform: [{ translateX: -40 }],
              }}
            >
              <Text className="text-white text-xs font-semibold">Most Popular</Text>
            </View>

            <Text style={{ color: colors.text }} className="text-lg font-bold text-center mb-1 mt-2">
              Premium
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-center text-sm mb-4">
              All features
            </Text>

            <View className="items-center mb-4">
              <Text style={{ color: themeColor }} className="text-2xl font-bold">
                {getSelectedPrice()}
              </Text>
              <Text style={{ color: colors.textTertiary }} className="text-xs">
                {selectedPlan === "lifetime" ? "one-time" : "per year"}
              </Text>
            </View>

            <View className="space-y-2">
              {PREMIUM_FEATURES.map((feature, index) => (
                <View key={index} className="flex-row items-center mb-2">
                  <Sparkles size={14} color={themeColor} />
                  <Text
                    className="text-xs ml-2 flex-1"
                    style={{ color: colors.text }}
                  >
                    {feature.text}
                  </Text>
                </View>
              ))}
            </View>
            
            {/* Founder Pro Note */}
            <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text
                className="text-xs text-center italic"
                style={{ color: colors.textTertiary }}
              >
                {FOUNDER_PRO_NOTE}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Plan Selector — only shown if lifetime package exists in current offering */}
        {lifetimePackage && (
          <Animated.View entering={FadeInUp.delay(260)} className="mb-4">
            <View
              className="flex-row rounded-xl overflow-hidden"
              style={{ borderWidth: 1, borderColor: colors.border }}
            >
              <Pressable
                onPress={() => setSelectedPlan("yearly")}
                className="flex-1 py-2 items-center"
                style={{ backgroundColor: selectedPlan === "yearly" ? themeColor : colors.surface }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: selectedPlan === "yearly" ? "#fff" : colors.text }}
                >
                  Annual
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedPlan("lifetime")}
                className="flex-1 py-2 items-center"
                style={{ backgroundColor: selectedPlan === "lifetime" ? themeColor : colors.surface }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: selectedPlan === "lifetime" ? "#fff" : colors.text }}
                >
                  Lifetime
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* Value Proposition */}
        <Animated.View entering={FadeInUp.delay(300)}>
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.text }} className="font-semibold text-center mb-2">
              Why Go Premium?
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm text-center leading-5">
              Connect with unlimited friends, create unlimited events, and never miss when your friends are free.
              That's less than $1/month!
            </Text>
          </View>
        </Animated.View>

        {/* Not configured message */}
        {!revenueCatEnabled && !BETA_MODE && (
          <View
            className="rounded-2xl p-4 mt-6"
            style={{ backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#F59E0B" }}
          >
            <Text className="text-amber-800 text-center">
              Payments are being set up. Please check back soon!
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background }}>
        <View className="px-5 pb-4">
          {BETA_MODE ? (
            <>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.back();
                }}
                className="rounded-2xl py-4 items-center"
                style={{
                  backgroundColor: "#10B981",
                  shadowColor: "#10B981",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                }}
              >
                <Text className="text-white text-lg font-semibold">
                  Continue with Free Beta
                </Text>
              </Pressable>
              <Text
                style={{ color: colors.textTertiary }}
                className="text-xs text-center mt-3 px-4"
              >
                All premium features are free during beta! We'll notify you before the beta period ends.
              </Text>
            </>
          ) : (
            <>
              <Pressable
                onPress={handlePurchase}
                disabled={
                  isPurchasing ||
                  !revenueCatEnabled ||
                  (selectedPlan === "lifetime" ? !lifetimePackage : !yearlyPackage)
                }
                className="rounded-2xl py-4 items-center"
                style={{
                  backgroundColor: isPurchasing || !revenueCatEnabled ? colors.border : themeColor,
                  shadowColor: themeColor,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                }}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#fff" />
                ) : selectedPlan === "lifetime" ? (
                  <Text className="text-white text-lg font-semibold">
                    Get Lifetime — {getSelectedPrice()}
                  </Text>
                ) : (
                  <Text className="text-white text-lg font-semibold">
                    Get Premium — {getSelectedPrice()}/year
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={handleRestore}
                disabled={isPurchasing || !revenueCatEnabled}
                className="py-3 items-center mt-2"
              >
                <Text style={{ color: colors.textSecondary }}>
                  Restore Purchases
                </Text>
              </Pressable>

              <Text
                style={{ color: colors.textTertiary }}
                className="text-xs text-center mt-2 px-4"
              >
                Cancel anytime in Settings. Subscription auto-renews unless cancelled at least 24 hours before the end of the current period.
              </Text>
            </>
          )}
        </View>
      </SafeAreaView>

      {/* Premium Success Modal */}
      <ConfirmModal
        visible={showPremiumSuccessModal}
        title="Welcome to Premium!"
        message="You now have access to all premium features."
        confirmText="Let's Go!"
        onConfirm={() => {
          setShowPremiumSuccessModal(false);
          router.back();
        }}
        onCancel={() => {
          setShowPremiumSuccessModal(false);
          router.back();
        }}
      />

      {/* Restore Success Modal */}
      <ConfirmModal
        visible={showRestoreSuccessModal}
        title="Purchases Restored!"
        message="Your premium subscription has been restored."
        confirmText="Great!"
        onConfirm={() => {
          setShowRestoreSuccessModal(false);
          router.back();
        }}
        onCancel={() => {
          setShowRestoreSuccessModal(false);
          router.back();
        }}
      />

    </View>
  );
}
