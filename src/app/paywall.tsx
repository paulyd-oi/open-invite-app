import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
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
  Ticket,
  ChevronRight,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { type PurchasesPackage } from "react-native-purchases";

import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useRefreshProContract } from "@/lib/entitlements";
import { useSubscription } from "@/lib/SubscriptionContext";
import {
  isRevenueCatEnabled,
  getOfferings,
  purchasePackage,
  restorePurchases,
  hasEntitlement,
  REVENUECAT_OFFERING_ID,
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
  const [yearlyPackage, setYearlyPackage] = useState<PurchasesPackage | null>(null);
  const [revenueCatEnabled, setRevenueCatEnabled] = useState(false);

  // Discount code state
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [isRedeemingCode, setIsRedeemingCode] = useState(false);

  // Modal state
  const [showPremiumSuccessModal, setShowPremiumSuccessModal] = useState(false);
  const [showRestoreSuccessModal, setShowRestoreSuccessModal] = useState(false);
  const [showCodeRedeemedModal, setShowCodeRedeemedModal] = useState(false);
  const [redeemedBenefit, setRedeemedBenefit] = useState("");

  useEffect(() => {
    loadOfferings();
  }, []);

  // Redirect premium users back - they shouldn't see paywall
  // Guard: skip redirect while code-redeemed modal is showing (let user see success first)
  useEffect(() => {
    if (isPremium && !isLoading && !showCodeRedeemedModal) {
      if (__DEV__) devLog("[Paywall] Premium user detected, redirecting back");
      router.back();
    }
  }, [isPremium, isLoading, showCodeRedeemedModal, router]);

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

    const result = await getOfferings();

    if (result.ok && result.data.current) {
      const packages = result.data.current.availablePackages;
      const yearly = packages.find((p) => p.identifier === "$rc_annual");
      
      if (!yearly) {
        safeToast.info(
          "Founder Pro Unavailable",
          "Founder Pro is temporarily unavailable. Try again in a moment."
        );
      }
      
      setYearlyPackage(yearly ?? null);
    } else {
      // Offering fetch failed
      safeToast.info(
        "Founder Pro Unavailable",
        "Founder Pro is temporarily unavailable. Try again in a moment."
      );
    }

    setIsLoading(false);
  };

  const handlePurchase = async () => {
    if (!yearlyPackage) {
      safeToast.error("Load Failed", "Unable to load subscription. Please try again.");
      return;
    }

    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await purchasePackage(yearlyPackage);

    if (result.ok) {
      const entitlementResult = await hasEntitlement("premium");

      if (entitlementResult.ok && entitlementResult.data) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowPremiumSuccessModal(true);
      }
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

  // CANONICAL SSOT: Use refreshProContract for promo code redemption
  const handleRedeemCode = async () => {
    if (!discountCode.trim()) {
      safeToast.warning("Error", "Please enter a discount code");
      return;
    }

    setIsRedeemingCode(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // [PRO_SOT] Log BEFORE state
    if (__DEV__) {
      devLog("[PRO_SOT] BEFORE screen=paywall_promo isPremium=", isPremium);
    }

    try {
      const data = await api.post<{ success: boolean; benefit: string }>("/api/discount/redeem", {
        code: discountCode.trim().toUpperCase(),
      });

      // [P0_DISCOUNT_APPLY] Guard: backend may return 200 with success=false
      if (!data.success) {
        if (__DEV__) {
          devLog("[P0_DISCOUNT_APPLY] ERROR screen=paywall success=false");
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        safeToast.error("Invalid Code", "This code is not valid.");
        return;
      }

      // [P0_DISCOUNT_APPLY] Code accepted — refresh pro state
      // Wrap in its own try/catch so refresh failures don't show "Invalid Code"
      try {
        const { rcIsPro, backendIsPro, combinedIsPro } = await refreshProContract({ reason: "promo_redeem:paywall" });

        // [PRO_SOT] Log AFTER state
        if (__DEV__) {
          devLog("[PRO_SOT] AFTER screen=paywall_promo combinedIsPro=", combinedIsPro);
          devLog("[P0_DISCOUNT_APPLY] OK screen=paywall combinedIsPro=", combinedIsPro);
        }
      } catch (refreshErr) {
        if (__DEV__) {
          devLog("[P0_DISCOUNT_APPLY] REFRESH_ERROR screen=paywall (code was accepted)", refreshErr);
        }
      }

      // Invalidate subscription queries for UI sync across screens
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptionDetails"] });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRedeemedBenefit(data.benefit);
      setShowCodeRedeemedModal(true);
    } catch (error: any) {
      if (__DEV__) {
        devLog("[PRO_SOT] ERROR screen=paywall_promo", error?.message);
        devLog("[P0_DISCOUNT_APPLY] ERROR screen=paywall", error?.message);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Parse the error message from the API error format
      let errorMessage = "This code is not valid.";
      if (error.message) {
        try {
          const match = error.message.match(/\{.*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            errorMessage = parsed.error || errorMessage;
          }
        } catch {
          // Use default error message
        }
      }
      safeToast.error("Invalid Code", errorMessage);
    } finally {
      setIsRedeemingCode(false);
    }
  };

  const getYearlyPrice = () => {
    if (yearlyPackage?.product?.priceString) {
      return yearlyPackage.product.priceString;
    }
    return "$9.99";
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={themeColor} />
        <Text style={{ color: colors.textSecondary }} className="mt-4">
          Loading...
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

        {/* Discount Code Card */}
        <Animated.View entering={FadeInUp.delay(150)}>
          <Pressable
            onPress={() => setShowDiscountInput(!showDiscountInput)}
            className="rounded-2xl p-4 mb-6"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: showDiscountInput ? themeColor : colors.border,
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: `${themeColor}20` }}
                >
                  <Ticket size={20} color={themeColor} />
                </View>
                <View>
                  <Text style={{ color: colors.text }} className="font-semibold">
                    Have a discount code?
                  </Text>
                  <Text style={{ color: colors.textSecondary }} className="text-sm">
                    Tap to enter your code
                  </Text>
                </View>
              </View>
              <ChevronRight
                size={20}
                color={colors.textTertiary}
                style={{ transform: [{ rotate: showDiscountInput ? "90deg" : "0deg" }] }}
              />
            </View>

            {showDiscountInput && (
              <View className="mt-4">
                <View
                  className="flex-row items-center rounded-xl px-4"
                  style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}
                >
                  <TextInput
                    value={discountCode}
                    onChangeText={(text) => setDiscountCode(text.toUpperCase())}
                    placeholder="Enter code (e.g., MONTH1FREE)"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    className="flex-1 py-3"
                    style={{ color: colors.text, fontSize: 16, fontWeight: "600", letterSpacing: 1 }}
                  />
                </View>
                <Pressable
                  onPress={handleRedeemCode}
                  disabled={isRedeemingCode || !discountCode.trim()}
                  className="mt-3 rounded-xl py-3 items-center"
                  style={{
                    backgroundColor: isRedeemingCode || !discountCode.trim() ? colors.border : themeColor,
                  }}
                >
                  {isRedeemingCode ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-semibold">Redeem Code</Text>
                  )}
                </Pressable>
              </View>
            )}
          </Pressable>
        </Animated.View>

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
              <Text className="text-white text-xs font-semibold">Best Value</Text>
            </View>

            <Text style={{ color: colors.text }} className="text-lg font-bold text-center mb-1 mt-2">
              Premium
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-center text-sm mb-4">
              All features
            </Text>

            <View className="items-center mb-4">
              <Text style={{ color: themeColor }} className="text-2xl font-bold">
                {getYearlyPrice()}
              </Text>
              <Text style={{ color: colors.textTertiary }} className="text-xs">
                per year
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
                disabled={isPurchasing || !revenueCatEnabled || !yearlyPackage}
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
                ) : (
                  <Text className="text-white text-lg font-semibold">
                    Get Premium - {getYearlyPrice()}/year
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
                Cancel anytime. Subscription auto-renews unless cancelled at least 24 hours before the end of the current period.
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

      {/* Code Redeemed Modal */}
      <ConfirmModal
        visible={showCodeRedeemedModal}
        title="Code Redeemed!"
        message={`You've unlocked ${redeemedBenefit}! Enjoy your premium features.`}
        confirmText="Awesome!"
        onConfirm={() => {
          setShowCodeRedeemedModal(false);
          router.back();
        }}
        onCancel={() => {
          setShowCodeRedeemedModal(false);
          router.back();
        }}
      />
    </View>
  );
}
