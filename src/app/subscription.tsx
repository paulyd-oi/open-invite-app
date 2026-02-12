import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { qk } from "@/lib/queryKeys";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import {
  ChevronLeft,
  Crown,
  Check,
  X,
  Gift,
  ExternalLink,
  CalendarDays,
  Heart,
  RotateCcw,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { Button } from "@/ui/Button";
import {
  isRevenueCatEnabled,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  REVENUECAT_OFFERING_ID,
} from "@/lib/revenuecatClient";
import { safeToast } from "@/lib/safeToast";
import { useSubscription as useSubscriptionData, PRICING } from "@/lib/useSubscription";
import { useSubscription as useSubscriptionContext } from "@/lib/SubscriptionContext";
import { useRefreshProContract } from "@/lib/entitlements";
import type { PurchasesPackage } from "react-native-purchases";

// Types for subscription details from backend
interface SubscriptionDetails {
  subscription: {
    tier: "free" | "premium";
    type: "free" | "trial" | "yearly" | "lifetime";
    isLifetime: boolean;
    expiresAt: string | null;
    purchasedAt: string | null;
    trialEndDate: string | null;
    transactionId: string | null;
    isBeta: boolean;
  };
  discountCodes: {
    redemptions: Array<{
      code: string;
      type: string;
      redeemedAt: string;
    }>;
    hasUsedLifetimeCode: boolean;
    canUseDiscountCode: boolean;
  };
}

// Grouped comparison features
interface FeatureCategory {
  title: string;
  features: Array<{
    name: string;
    icon: React.ReactNode;
    freeValue: string;
    proValue: string;
  }>;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const subscriptionData_ = useSubscriptionData();
  const subscriptionContext = useSubscriptionContext();
  const refreshProContract = useRefreshProContract();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  const [selectedPlan, setSelectedPlan] = useState<"yearly" | "lifetime">("yearly");
  const [promoCode, setPromoCode] = useState("");
  const [isPromoLoading, setIsPromoLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // RevenueCat packages
  const [yearlyPackage, setYearlyPackage] = useState<PurchasesPackage | null>(null);
  const [lifetimePackage, setLifetimePackage] = useState<PurchasesPackage | null>(null);
  const [packagesLoading, setPackagesLoading] = useState(true);

  // Fetch subscription details from backend
  const { data: subscriptionData, isLoading, refetch } = useQuery({
    queryKey: qk.subscriptionDetails(),
    queryFn: () => api.get<SubscriptionDetails>("/api/subscription/details"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Fetch RevenueCat offerings
  useEffect(() => {
    const fetchOfferings = async () => {
      setPackagesLoading(true);
      if (!isRevenueCatEnabled()) {
        setPackagesLoading(false);
        return;
      }

      const result = await getOfferings();
      if (result.ok && result.data.current) {
        const packages = result.data.current.availablePackages;
        setYearlyPackage(packages.find((p) => p.identifier === "$rc_annual") ?? null);
        setLifetimePackage(packages.find((p) => p.identifier === "$rc_lifetime") ?? null);
      } else {
        // Offering fetch failed - show calm message
        safeToast.info(
          "Founder Pro Unavailable",
          "Founder Pro is temporarily unavailable. Try again in a moment."
        );
      }
      setPackagesLoading(false);
    };
    fetchOfferings();
  }, []);

  // Handle purchase
  const handlePurchase = async () => {
    const packageToPurchase = selectedPlan === "yearly" ? yearlyPackage : lifetimePackage;

    if (!packageToPurchase) {
      safeToast.error("Load Failed", "Unable to load subscription options. Please try again.");
      return;
    }

    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await purchasePackage(packageToPurchase);
    setIsPurchasing(false);

    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Welcome to Pro!", "You now have access to all premium features.");
      refetch();
      queryClient.invalidateQueries({ queryKey: qk.subscription() });
    } else {
      if (result.error) {
        const errorMessage = typeof result.error === "string"
          ? result.error
          : "Purchase could not be completed";
        // Don't show error for user cancellation
        if (!errorMessage.includes("cancel")) {
          safeToast.error("Purchase Failed", errorMessage);
        }
      }
    }
  };

  // Handle restore purchases - CANONICAL SSOT
  const handleRestorePurchases = async () => {
    setIsRestoring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // [PRO_SOT] Log BEFORE state
    if (__DEV__) {
      devLog("[PRO_SOT] BEFORE screen=subscription_restore isPremium=", subscriptionContext.isPremium);
    }

    const result = await restorePurchases();

    if (result.ok) {
      // CANONICAL: Use refreshProContract for SSOT after restore
      const { rcIsPro, backendIsPro, combinedIsPro } = await refreshProContract({ reason: "restore:subscription" });
      
      // [PRO_SOT] Log AFTER state
      if (__DEV__) {
        devLog("[PRO_SOT] AFTER screen=subscription_restore combinedIsPro=", combinedIsPro);
      }
      
      setIsRestoring(false);
      
      if (combinedIsPro) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success("Restored!", "Your subscription has been restored.");
        refetch();
        queryClient.invalidateQueries({ queryKey: qk.subscription() });
      } else {
        safeToast.info("No Purchases Found", "We couldn't find any previous purchases.");
      }
    } else {
      setIsRestoring(false);
      safeToast.error("Restore Failed", "Failed to restore purchases. Please try again.");
    }
  };

  // Handle promo code redemption - CANONICAL SSOT
  const handleApplyPromoCode = async () => {
    if (!promoCode.trim()) return;

    setIsPromoLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // [PRO_SOT] Log BEFORE state
    if (__DEV__) {
      devLog("[PRO_SOT] BEFORE screen=subscription_promo isPremium=", subscriptionContext.isPremium);
      devLog("[P0_DISCOUNT_APPLY] START screen=subscription code=", promoCode.trim().toUpperCase().slice(0, 4) + "…");
    }

    try {
      const response = await api.post<{ success: boolean; benefit?: string; error?: string }>(
        "/api/discount/redeem",
        { code: promoCode.trim().toUpperCase() }
      );

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPromoCode("");
        
        // CANONICAL: Use refreshProContract for SSOT after promo redemption
        const { rcIsPro, backendIsPro, combinedIsPro } = await refreshProContract({ reason: "promo_redeem:subscription" });
        
        // [PRO_SOT] Log AFTER state
        if (__DEV__) {
          devLog("[PRO_SOT] AFTER screen=subscription_promo combinedIsPro=", combinedIsPro);
          devLog("[P0_DISCOUNT_APPLY] OK screen=subscription combinedIsPro=", combinedIsPro);
        }
        
        // Invalidate queries for UI refresh
        refetch();
        queryClient.invalidateQueries({ queryKey: qk.subscription() });
        queryClient.invalidateQueries({ queryKey: qk.subscriptionDetails() });
        
        // Show toast based on combined result
        if (combinedIsPro) {
          safeToast.success("Pro Active!", response.benefit || "Promo code applied!");
        } else {
          safeToast.success("Success!", response.benefit || "Promo code applied!");
        }
      } else {
        if (__DEV__) {
          devLog("[PRO_SOT] ERROR screen=subscription_promo invalid_code");
          devLog("[P0_DISCOUNT_APPLY] ERROR screen=subscription invalid_code");
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        safeToast.error("Invalid Code", response.error || "This code is not valid.");
      }
    } catch (error: unknown) {
      if (__DEV__) {
        devLog("[PRO_SOT] ERROR screen=subscription_promo", error);
        devLog("[P0_DISCOUNT_APPLY] ERROR screen=subscription", error);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorMessage = error instanceof Error ? error.message : "Could not validate code.";
      safeToast.error("Redeem Failed", errorMessage);
    } finally {
      setIsPromoLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const isPremium = subscriptionData?.subscription.tier === "premium";
  const isLifetime = subscriptionData?.subscription.isLifetime;
  const isTrial = subscriptionData?.subscription.type === "trial";
  const canUseDiscountCode = subscriptionData?.discountCodes.canUseDiscountCode ?? true;

  // Status-aware header content
  const getStatusContent = () => {
    if (isLifetime) {
      return {
        badge: "Lifetime Pro",
        title: "Lifetime Pro",
        subtitle: "Thanks for supporting Open Invite.",
        icon: <Heart size={20} color="#F59E0B" />,
        badgeColor: "#F59E0B",
      };
    }
    if (isTrial) {
      return {
        badge: "Pro Trial",
        title: "Pro trial active",
        subtitle: "You're exploring Pro planning tools.",
        icon: <Crown size={20} color="#10B981" />,
        badgeColor: "#10B981",
      };
    }
    if (isPremium) {
      return {
        badge: "Pro",
        title: "Pro Member",
        subtitle: `Renews ${formatDate(subscriptionData?.subscription.expiresAt)}`,
        icon: <Crown size={20} color={themeColor} />,
        badgeColor: themeColor,
      };
    }
    // Free user
    return {
      badge: "Free",
      title: "Free plan",
      subtitle: "Upgrade anytime for advanced planning features.",
      icon: null,
      badgeColor: colors.textTertiary,
    };
  };

  const statusContent = getStatusContent();

  // Get source-aware messaging
  const getSourceCopy = () => {
    switch (source) {
      case "soft_limit_active_events":
        return {
          headline: "Founder Pro for organizers",
          subhead: "Unlimited active events and smarter reminders.",
        };
      case "poll_attempt":
        return {
          headline: "Decide faster with polls",
          subhead: "Get instant RSVP commitments with Pro polls.",
        };
      case "nudge_attempt":
        return {
          headline: "Increase attendance with nudges",
          subhead: "Send smart reminders to boost turnout.",
        };
      case "templates_attempt":
        return {
          headline: "Save time with templates",
          subhead: "Duplicate events and reuse successful setups.",
        };
      case "settings":
        return {
          headline: "Founder Pro for organizers",
          subhead: "Unlock all features and remove limits.",
        };
      default:
        return {
          headline: "Pro is for organizers",
          subhead: "Designed for the people who bring friends together. Friends can always join and participate for free.",
        };
    }
  };

  const sourceCopy = getSourceCopy();

  // Grouped comparison features - ONLY show what's actually enforced today
  // Currently enforced: hosting limits (3 events / 30 days for free, unlimited for Pro)
  const featureCategories: FeatureCategory[] = [
    {
      title: "Hosting",
      features: [
        {
          name: "Events per Month",
          icon: <CalendarDays size={16} color={themeColor} />,
          freeValue: "3 max",
          proValue: "Unlimited",
        },
      ],
    },
  ];

  // Get CTA button text
  const getCTAText = () => {
    if (isLifetime) return "Lifetime Pro Active";
    if (isPremium && !isTrial) return "Manage Subscription";
    return "Subscribe Now";
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text }} className="text-xl font-bold">
          Subscription
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Hero Section */}
        <Animated.View entering={FadeIn.delay(0).duration(400)} className="mx-4 mt-2">
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: 24,
              borderWidth: isPremium ? 2 : 1,
              borderColor: isPremium ? statusContent.badgeColor : colors.separator,
            }}
          >
            <View className="items-center">
              {/* Status Badge */}
              <View
                className="flex-row items-center px-4 py-2 rounded-full mb-4"
                style={{ backgroundColor: `${statusContent.badgeColor}20` }}
              >
                {statusContent.icon}
                <Text
                  style={{ color: statusContent.badgeColor }}
                  className={`font-semibold ${statusContent.icon ? "ml-2" : ""}`}
                >
                  {statusContent.badge}
                </Text>
              </View>

              <Text style={{ color: colors.text }} className="text-2xl font-bold text-center">
                {statusContent.title}
              </Text>
              <Text style={{ color: colors.textSecondary }} className="text-sm mt-2 text-center px-4">
                {statusContent.subtitle}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Value Statement - Only show for non-lifetime users */}
        {!isLifetime && (
          <Animated.View entering={FadeInDown.delay(50).springify()} className="mx-4 mt-6">
            <View
              style={{ backgroundColor: isDark ? "#1C1C1E" : "#F9FAFB" }}
              className="rounded-2xl p-5"
            >
              <View className="flex-row items-center mb-2">
                <Crown size={18} color={themeColor} />
                <Text style={{ color: colors.text }} className="ml-2 font-semibold">
                  {sourceCopy.headline}
                </Text>
              </View>
              <Text style={{ color: colors.textSecondary }} className="text-sm leading-5">
                {sourceCopy.subhead}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Feature Comparison - Grouped */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-3 ml-2">
            COMPARE PLANS
          </Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            {/* Table Header */}
            <View className="flex-row py-3 px-4" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="font-semibold">Feature</Text>
              </View>
              <View className="w-20 items-center">
                <Text style={{ color: colors.textSecondary }} className="font-medium text-xs">FREE</Text>
              </View>
              <View className="w-20 items-center">
                <View className="flex-row items-center">
                  <Crown size={12} color={themeColor} />
                  <Text style={{ color: themeColor }} className="font-bold text-xs ml-1">PRO</Text>
                </View>
              </View>
            </View>

            {/* Grouped Features */}
            {featureCategories.map((category, catIndex) => (
              <View key={category.title}>
                {/* Category Header */}
                <View
                  className="px-4 py-2"
                  style={{
                    backgroundColor: isDark ? "#1A1A1C" : "#FAFAFA",
                    borderTopWidth: catIndex > 0 ? 1 : 0,
                    borderTopColor: colors.separator,
                  }}
                >
                  <Text style={{ color: colors.textTertiary }} className="text-xs font-semibold uppercase">
                    {category.title}
                  </Text>
                </View>

                {/* Category Features */}
                {category.features.map((feature, index) => (
                  <View
                    key={feature.name}
                    className="flex-row py-3 px-4 items-center"
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: colors.separator,
                    }}
                  >
                    <View className="flex-1 flex-row items-center">
                      {feature.icon}
                      <Text style={{ color: colors.text }} className="ml-2 text-sm" numberOfLines={1}>
                        {feature.name}
                      </Text>
                    </View>
                    <View className="w-20 items-center">
                      {feature.freeValue === "No" ? (
                        <X size={16} color={colors.textTertiary} />
                      ) : (
                        <Text style={{ color: colors.textSecondary }} className="text-xs text-center">
                          {feature.freeValue}
                        </Text>
                      )}
                    </View>
                    <View className="w-20 items-center">
                      {feature.proValue === "Yes" ? (
                        <Check size={14} color="#10B981" />
                      ) : feature.proValue === "Unlimited" ? (
                        <Text style={{ color: "#10B981" }} className="text-xs font-medium">
                          Unlimited
                        </Text>
                      ) : (
                        <Text style={{ color: themeColor }} className="text-xs font-medium text-center">
                          {feature.proValue}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Upgrade Options - Show if not lifetime */}
        {!isLifetime && (
          <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-4 mt-6">
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-3 ml-2">
              {isPremium && !isTrial ? "YOUR PLAN" : "CHOOSE A PLAN"}
            </Text>
            <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden p-4">
              {/* Yearly Option - Primary */}
              <Pressable
                onPress={() => {
                  setSelectedPlan("yearly");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className="rounded-xl p-4 mb-3"
                style={{
                  backgroundColor: selectedPlan === "yearly" ? `${themeColor}15` : isDark ? "#2C2C2E" : "#F3F4F6",
                  borderWidth: 2,
                  borderColor: selectedPlan === "yearly" ? themeColor : "transparent",
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Text style={{ color: colors.text }} className="text-base font-semibold">
                        Yearly Pro
                      </Text>
                    </View>
                    <Text style={{ color: themeColor }} className="text-lg font-bold mt-1">
                      ${PRICING.proYearly} / year
                    </Text>
                    <Text style={{ color: "#10B981" }} className="text-xs mt-1">
                      Unlimited hosting
                    </Text>
                  </View>
                  <View
                    className="w-6 h-6 rounded-full border-2 items-center justify-center"
                    style={{
                      borderColor: selectedPlan === "yearly" ? themeColor : colors.textTertiary,
                      backgroundColor: selectedPlan === "yearly" ? themeColor : "transparent",
                    }}
                  >
                    {selectedPlan === "yearly" && <Check size={14} color="#fff" />}
                  </View>
                </View>
              </Pressable>

              {/* Lifetime Option - Secondary */}
              {lifetimePackage && (
                <Pressable
                  onPress={() => {
                    setSelectedPlan("lifetime");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: selectedPlan === "lifetime" ? `${colors.textTertiary}15` : isDark ? "#2C2C2E" : "#F3F4F6",
                    borderWidth: 2,
                    borderColor: selectedPlan === "lifetime" ? colors.textTertiary : "transparent",
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text style={{ color: colors.textSecondary }} className="text-sm font-medium">
                        Founding Member – Limited
                      </Text>
                      <Text style={{ color: colors.text }} className="text-base font-semibold mt-0.5">
                        ${PRICING.lifetime}
                      </Text>
                      <Text style={{ color: colors.textTertiary }} className="text-xs mt-1">
                        One-time payment. Long-term access.
                      </Text>
                    </View>
                    <View
                      className="w-6 h-6 rounded-full border-2 items-center justify-center"
                      style={{
                        borderColor: selectedPlan === "lifetime" ? colors.textTertiary : colors.textTertiary,
                        backgroundColor: selectedPlan === "lifetime" ? colors.textTertiary : "transparent",
                      }}
                    >
                      {selectedPlan === "lifetime" && <Check size={14} color="#fff" />}
                    </View>
                  </View>
                </Pressable>
              )}

              {/* Purchase Button */}
              <Button
                variant="primary"
                label={isPurchasing ? "" : packagesLoading ? "Loading..." : getCTAText()}
                onPress={handlePurchase}
                disabled={isPurchasing || packagesLoading || (isPremium && !isTrial)}
                loading={isPurchasing}
                leftIcon={!isPurchasing && !packagesLoading ? <Crown size={18} color="#fff" style={{ marginRight: 2 }} /> : undefined}
                style={{ marginTop: 16, borderRadius: 12, paddingVertical: 14, opacity: isPurchasing || packagesLoading ? 0.7 : 1 }}
              />

              {/* Microcopy */}
              {!isPremium && (
                <Text style={{ color: colors.textTertiary }} className="text-xs text-center mt-3">
                  Cancel anytime. No commitment.
                </Text>
              )}

              {/* No packages warning */}
              {!packagesLoading && !yearlyPackage && !lifetimePackage && Platform.OS !== "web" && (
                <Text style={{ color: colors.textTertiary }} className="text-xs text-center mt-3">
                  Subscription options unavailable. Please try again later.
                </Text>
              )}

              {/* Web warning */}
              {Platform.OS === "web" && (
                <Text style={{ color: colors.textTertiary }} className="text-xs text-center mt-3">
                  Purchases are only available in the mobile app.
                </Text>
              )}
            </View>
          </Animated.View>
        )}

        {/* Discount Code Section */}
        <Animated.View entering={FadeInDown.delay(300).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-3 ml-2">
            DISCOUNT CODE
          </Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden p-4">
            {!canUseDiscountCode ? (
              <View className="items-center py-4">
                <View
                  className="w-12 h-12 rounded-full items-center justify-center mb-3"
                  style={{ backgroundColor: "#10B98120" }}
                >
                  <Check size={24} color="#10B981" />
                </View>
                <Text style={{ color: colors.text }} className="text-base font-semibold mb-1">
                  Lifetime Member
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm text-center">
                  You already have the best deal!{"\n"}No more discount codes needed.
                </Text>
              </View>
            ) : (
              <>
                <View className="flex-row items-center mb-3">
                  <Gift size={18} color={themeColor} />
                  <Text style={{ color: colors.text }} className="ml-2 text-sm font-medium">
                    Have a promo code?
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <TextInput
                    value={promoCode}
                    onChangeText={(text) => setPromoCode(text.toUpperCase())}
                    placeholder="Enter code"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="characters"
                    style={{
                      flex: 1,
                      backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                      borderRadius: 12,
                      padding: 14,
                      color: colors.text,
                      fontSize: 16,
                      fontWeight: "600",
                      letterSpacing: 1,
                    }}
                  />
                  <Pressable
                    onPress={handleApplyPromoCode}
                    disabled={isPromoLoading || !promoCode.trim()}
                    className="ml-3 px-5 py-3.5 rounded-xl"
                    style={{
                      backgroundColor: promoCode.trim() ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB",
                      opacity: isPromoLoading ? 0.7 : 1,
                    }}
                  >
                    {isPromoLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text
                        className="font-semibold"
                        style={{ color: promoCode.trim() ? "#fff" : colors.textTertiary }}
                      >
                        Apply
                      </Text>
                    )}
                  </Pressable>
                </View>

                {/* Previously used codes */}
                {subscriptionData?.discountCodes.redemptions &&
                 subscriptionData.discountCodes.redemptions.length > 0 && (
                  <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
                    <Text style={{ color: colors.textSecondary }} className="text-xs font-medium mb-2">
                      PREVIOUSLY USED CODES
                    </Text>
                    {subscriptionData.discountCodes.redemptions.map((redemption, i) => (
                      <View key={i} className="flex-row items-center justify-between py-2">
                        <View className="flex-row items-center">
                          <Check size={14} color="#10B981" />
                          <Text style={{ color: colors.text }} className="ml-2 font-medium">
                            {redemption.code}
                          </Text>
                        </View>
                        <Text style={{ color: colors.textTertiary }} className="text-xs">
                          {new Date(redemption.redeemedAt).toLocaleDateString()}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </Animated.View>

        {/* Restore Purchases */}
        <Animated.View entering={FadeInDown.delay(400).springify()} className="mx-4 mt-6">
          <Button
            variant="secondary"
            label="Restore Purchases"
            onPress={handleRestorePurchases}
            disabled={isRestoring}
            loading={isRestoring}
            leftIcon={!isRestoring ? <RotateCcw size={18} color={colors.buttonSecondaryText} /> : undefined}
            style={{ borderRadius: 16, paddingVertical: 14 }}
          />
        </Animated.View>

        {/* Manage Subscription Link */}
        {isPremium && !isLifetime && Platform.OS === "ios" && (
          <Animated.View entering={FadeInDown.delay(500).springify()} className="mx-4 mt-4">
            <Button
              variant="secondary"
              label="Manage in App Store"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL("https://apps.apple.com/account/subscriptions");
              }}
              leftIcon={<ExternalLink size={18} color={colors.buttonSecondaryText} />}
              style={{ borderRadius: 16, paddingVertical: 14 }}
            />
          </Animated.View>
        )}

        {/* Legal note */}
        <Text style={{ color: colors.textTertiary }} className="text-xs text-center mx-8 mt-6">
          Subscriptions auto-renew unless cancelled 24 hours before the end of the current period.
          Manage your subscription in your device settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
