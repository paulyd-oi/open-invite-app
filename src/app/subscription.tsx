import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
  RefreshControl,
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
  Palette,
  Users,
  Flame,
  Ticket,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { Button } from "@/ui/Button";
import {
  isRevenueCatEnabled,
  getOfferingWithFallback,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  REVENUECAT_OFFERING_ID,
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_MONTHLY,
  RC_PACKAGE_LIFETIME,
} from "@/lib/revenuecatClient";
import { safeToast } from "@/lib/safeToast";
import { useSubscription as useSubscriptionData, PRICING } from "@/lib/useSubscription";
import { useSubscription as useSubscriptionContext } from "@/lib/SubscriptionContext";
import { useRefreshProContract } from "@/lib/entitlements";
import { useLiveRefreshContract } from "@/lib/useLiveRefreshContract";
import { STATUS } from "@/ui/tokens";
import Purchases, { type PurchasesPackage } from "react-native-purchases";

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

  const [selectedPlan, setSelectedPlan] = useState<"lifetime" | "yearly" | "monthly">("yearly");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // RevenueCat packages
  const [yearlyPackage, setYearlyPackage] = useState<PurchasesPackage | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [lifetimePackage, setLifetimePackage] = useState<PurchasesPackage | null>(null);
  const [packagesLoading, setPackagesLoading] = useState(true);

  // Fetch subscription details from backend
  const { data: subscriptionData, isLoading, refetch } = useQuery({
    queryKey: qk.subscriptionDetails(),
    queryFn: () => api.get<SubscriptionDetails>("/api/subscription/details"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Pull-to-refresh + focus refresh
  const { isRefreshing, onManualRefresh } = useLiveRefreshContract({
    screenName: "subscription",
    refetchFns: [refetch],
  });

  // Fetch RevenueCat offerings with fallback
  useEffect(() => {
    const fetchOfferings = async () => {
      setPackagesLoading(true);
      if (!isRevenueCatEnabled()) {
        setPackagesLoading(false);
        return;
      }

      const result = await getOfferingWithFallback();
      if (result.ok && result.data.offering) {
        const packages = result.data.offering.availablePackages;
        setYearlyPackage(packages.find((p) => p.identifier === RC_PACKAGE_ANNUAL) ?? null);
        setMonthlyPackage(packages.find((p) => p.identifier === RC_PACKAGE_MONTHLY) ?? null);
        setLifetimePackage(packages.find((p) => p.identifier === RC_PACKAGE_LIFETIME) ?? null);
      }
      // No scary toast — if no offering found, purchase buttons stay disabled
      // and inline copy ("Subscription options unavailable") already handles it.
      setPackagesLoading(false);
    };
    fetchOfferings();
  }, []);

  // Handle purchase
  const handlePurchase = async () => {
    const packageToPurchase = selectedPlan === "lifetime" ? lifetimePackage : selectedPlan === "yearly" ? yearlyPackage : monthlyPackage;

    if (!packageToPurchase) {
      safeToast.error("Load Failed", "Unable to load subscription options. Please try again.");
      return;
    }

    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await purchasePackage(packageToPurchase);

    if (result.ok) {
      // CANONICAL: Use refreshProContract for SSOT after purchase
      const { combinedIsPro } = await refreshProContract({ reason: "purchase:subscription" });

      if (__DEV__) {
        devLog("[PRO_SOT] AFTER screen=subscription_purchase combinedIsPro=", combinedIsPro);
        devLog("[P0_RC_PURCHASE_CONFIRM]", {
          surface: "subscription",
          storekitSuccess: true,
          didRefresh: true,
          combinedIsPro,
        });
      }

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

    setIsPurchasing(false);
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

  // [P0_PREMIUM_CONTRACT] Use combined isPremium from SubscriptionContext (OR semantics: backend OR RC).
  // Do NOT derive from subscriptionData.subscription.tier — backend returns tier="pro" not "premium",
  // and RC dev-test key is empty in Simulator, so a tier-string check here would show "Free plan" falsely.
  const isPremium = subscriptionContext.isPremium;
  const isLifetime = subscriptionData?.subscription.isLifetime;
  const isTrial = subscriptionData?.subscription.type === "trial";

  if (__DEV__) {
    devLog("[PRO_SOT] subscription.tsx status", {
      isPremium,
      isLifetime: isLifetime ?? false,
      isTrial,
      backendTier: subscriptionData?.subscription.tier ?? "loading",
      rcIsPremium: subscriptionContext.isPremium,
    });
  }

  // Status-aware header content
  const getStatusContent = () => {
    if (isLifetime) {
      return {
        badge: "Lifetime Pro",
        title: "Lifetime Pro",
        subtitle: "Thanks for supporting Open Invite.",
        icon: <Heart size={20} color={STATUS.warning.fg} />,
        badgeColor: STATUS.warning.fg,
      };
    }
    if (isTrial) {
      return {
        badge: "Pro Trial",
        title: "Pro trial active",
        subtitle: "You're exploring Pro planning tools.",
        icon: <Crown size={20} color={STATUS.going.fg} />,
        badgeColor: STATUS.going.fg,
      };
    }
    if (isPremium) {
      return {
        badge: "Pro",
        title: "Pro Member",
        subtitle: `Renews ${formatDate(subscriptionData?.subscription.expiresAt ?? null)}`,
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
      case "premium_theme_upsell":
        return {
          headline: "Unlock premium themes",
          subhead: "Make every event feel special with premium collections and effects.",
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

  const featureCategories: FeatureCategory[] = [
    {
      title: "Hosting",
      features: [
        { name: "Event Hosting", icon: <CalendarDays size={16} color={themeColor} />, freeValue: "Unlimited", proValue: "Unlimited" },
      ],
    },
    {
      title: "Themes & Atmosphere",
      features: [
        { name: "Event Themes", icon: <Palette size={16} color={themeColor} />, freeValue: "5 essentials", proValue: "All 30 themes" },
        { name: "Premium Effects", icon: <Palette size={16} color={themeColor} />, freeValue: "No", proValue: "Yes" },
      ],
    },
    {
      title: "Social",
      features: [
        { name: "Friends", icon: <Users size={16} color={themeColor} />, freeValue: "Unlimited", proValue: "Unlimited" },
        { name: "Circles", icon: <Users size={16} color={themeColor} />, freeValue: "2 max", proValue: "Unlimited" },
      ],
    },
    {
      title: "Planning",
      features: [
        { name: "Who's Free", icon: <CalendarDays size={16} color={themeColor} />, freeValue: "7 days", proValue: "90 days" },
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
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onManualRefresh} tintColor={themeColor} />
        }
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
                        <Check size={14} color={STATUS.going.fg} />
                      ) : feature.proValue === "Unlimited" ? (
                        <Text style={{ color: STATUS.going.fg }} className="text-xs font-medium">
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
              {/* Founder Lifetime */}
              <Pressable
                onPress={() => { setSelectedPlan("lifetime"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                className="rounded-xl p-4 mb-3"
                style={{
                  backgroundColor: selectedPlan === "lifetime" ? `${themeColor}15` : isDark ? "#2C2C2E" : "#F3F4F6",
                  borderWidth: 2,
                  borderColor: selectedPlan === "lifetime" ? themeColor : "transparent",
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Flame size={14} color="#F59E0B" />
                      <Text style={{ color: colors.text }} className="text-base font-semibold ml-1">
                        Founder Lifetime
                      </Text>
                    </View>
                    <Text style={{ color: themeColor }} className="text-lg font-bold mt-1">
                      {lifetimePackage?.product?.priceString ?? `$${PRICING.lifetime}`}
                    </Text>
                    <Text style={{ color: colors.textTertiary }} className="text-xs mt-1">
                      One-time payment. Pro forever.
                    </Text>
                  </View>
                  <View
                    className="w-6 h-6 rounded-full border-2 items-center justify-center"
                    style={{
                      borderColor: selectedPlan === "lifetime" ? themeColor : colors.textTertiary,
                      backgroundColor: selectedPlan === "lifetime" ? themeColor : "transparent",
                    }}
                  >
                    {selectedPlan === "lifetime" && <Check size={14} color="#fff" />}
                  </View>
                </View>
              </Pressable>

              {/* Annual Pro */}
              <Pressable
                onPress={() => { setSelectedPlan("yearly"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                className="rounded-xl p-4 mb-3"
                style={{
                  backgroundColor: selectedPlan === "yearly" ? `${themeColor}15` : isDark ? "#2C2C2E" : "#F3F4F6",
                  borderWidth: 2,
                  borderColor: selectedPlan === "yearly" ? themeColor : "transparent",
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text style={{ color: colors.text }} className="text-base font-semibold">
                      Annual Pro
                    </Text>
                    <Text style={{ color: themeColor }} className="text-lg font-bold mt-1">
                      {yearlyPackage?.product?.priceString ?? `$${PRICING.proYearly}`} / year
                    </Text>
                    {yearlyPackage?.product?.introPrice ? (
                      <Text style={{ color: "#10B981" }} className="text-xs font-semibold mt-1">
                        Intro: {yearlyPackage.product.introPrice.priceString} for first year
                      </Text>
                    ) : null}
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

              {/* Monthly Pro */}
              <Pressable
                onPress={() => { setSelectedPlan("monthly"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                className="rounded-xl p-4"
                style={{
                  backgroundColor: selectedPlan === "monthly" ? `${themeColor}15` : isDark ? "#2C2C2E" : "#F3F4F6",
                  borderWidth: 2,
                  borderColor: selectedPlan === "monthly" ? themeColor : "transparent",
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text style={{ color: colors.text }} className="text-base font-semibold">
                      Monthly Pro
                    </Text>
                    <Text style={{ color: themeColor }} className="text-lg font-bold mt-1">
                      {monthlyPackage?.product?.priceString ?? `$${PRICING.proMonthly}`} / month
                    </Text>
                    <Text style={{ color: colors.textTertiary }} className="text-xs mt-1">
                      Cancel anytime
                    </Text>
                  </View>
                  <View
                    className="w-6 h-6 rounded-full border-2 items-center justify-center"
                    style={{
                      borderColor: selectedPlan === "monthly" ? themeColor : colors.textTertiary,
                      backgroundColor: selectedPlan === "monthly" ? themeColor : "transparent",
                    }}
                  >
                    {selectedPlan === "monthly" && <Check size={14} color="#fff" />}
                  </View>
                </View>
              </Pressable>

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
              {!packagesLoading && !yearlyPackage && !monthlyPackage && !lifetimePackage && Platform.OS !== "web" && (
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

        {/* Redeem Offer Code (Apple-blessed 3.1.1 mechanism) */}
        {Platform.OS === "ios" && (
          <Animated.View entering={FadeInDown.delay(450).springify()} className="mx-4 mt-4">
            <Button
              variant="secondary"
              label="Redeem Offer Code"
              onPress={async () => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await Purchases.presentCodeRedemptionSheet();
                } catch (e) {
                  if (__DEV__) devWarn("[Subscription] presentCodeRedemptionSheet error:", e);
                }
              }}
              leftIcon={<Ticket size={18} color={colors.buttonSecondaryText} />}
              style={{ borderRadius: 16, paddingVertical: 14 }}
            />
          </Animated.View>
        )}

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
