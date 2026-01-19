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
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Crown,
  Check,
  X,
  Clock,
  Gift,
  Sparkles,
  RotateCcw,
  ExternalLink,
  Users,
  CalendarDays,
  UserPlus,
  Cake,
  BarChart3,
  Trophy,
  Zap,
  Star,
  Heart,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import {
  isRevenueCatEnabled,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
} from "@/lib/revenuecatClient";
import { safeToast } from "@/lib/safeToast";
import { useSubscription, FREE_TIER_LIMITS, PRO_TIER_LIMITS, PRICING } from "@/lib/useSubscription";
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
  const subscription = useSubscription();

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
    queryKey: ["subscriptionDetails"],
    queryFn: () => api.get<SubscriptionDetails>("/api/subscription/details"),
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
      }
      setPackagesLoading(false);
    };
    fetchOfferings();
  }, []);

  // Handle purchase
  const handlePurchase = async () => {
    const packageToPurchase = selectedPlan === "yearly" ? yearlyPackage : lifetimePackage;

    if (!packageToPurchase) {
      safeToast.error("Error", "Unable to load subscription options. Please try again.");
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
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
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

  // Handle restore purchases
  const handleRestorePurchases = async () => {
    setIsRestoring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await restorePurchases();
    setIsRestoring(false);

    if (result.ok) {
      const customerInfo = await getCustomerInfo();
      if (customerInfo.ok && Object.keys(customerInfo.data.entitlements.active || {}).length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success("Restored!", "Your subscription has been restored.");
        refetch();
        queryClient.invalidateQueries({ queryKey: ["subscription"] });
      } else {
        safeToast.info("No Purchases Found", "We couldn't find any previous purchases.");
      }
    } else {
      safeToast.error("Error", "Failed to restore purchases. Please try again.");
    }
  };

  // Handle promo code redemption
  const handleApplyPromoCode = async () => {
    if (!promoCode.trim()) return;

    setIsPromoLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const response = await api.post<{ success: boolean; benefit?: string; error?: string }>(
        "/api/discount/redeem",
        { code: promoCode.trim().toUpperCase() }
      );

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success("Success!", response.benefit || "Promo code applied!");
        setPromoCode("");
        refetch();
        queryClient.invalidateQueries({ queryKey: ["subscription"] });
        queryClient.invalidateQueries({ queryKey: ["subscriptionDetails"] });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        safeToast.error("Invalid Code", response.error || "This code is not valid.");
      }
    } catch (error: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorMessage = error instanceof Error ? error.message : "Could not validate code.";
      safeToast.error("Error", errorMessage);
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

  // Grouped comparison features
  const featureCategories: FeatureCategory[] = [
    {
      title: "Planning",
      features: [
        {
          name: "Who's Free?",
          icon: <Users size={16} color={themeColor} />,
          freeValue: `${FREE_TIER_LIMITS.whosFreeAheadDays} days`,
          proValue: `${PRO_TIER_LIMITS.whosFreeAheadDays} days`,
        },
        {
          name: "Upcoming Birthdays",
          icon: <Cake size={16} color={themeColor} />,
          freeValue: `${FREE_TIER_LIMITS.birthdaysAheadDays} days`,
          proValue: `${PRO_TIER_LIMITS.birthdaysAheadDays} days`,
        },
        {
          name: "Recurring Events",
          icon: <RotateCcw size={16} color={themeColor} />,
          freeValue: "No",
          proValue: "Unlimited",
        },
      ],
    },
    {
      title: "Hosting",
      features: [
        {
          name: "Active Events",
          icon: <CalendarDays size={16} color={themeColor} />,
          freeValue: `${FREE_TIER_LIMITS.maxActiveEvents} max`,
          proValue: "Unlimited",
        },
        {
          name: "Event History",
          icon: <Clock size={16} color={themeColor} />,
          freeValue: `${FREE_TIER_LIMITS.eventHistoryDays} days`,
          proValue: "Full history",
        },
      ],
    },
    {
      title: "Circles",
      features: [
        {
          name: "Create Circles",
          icon: <UserPlus size={16} color={themeColor} />,
          freeValue: `${FREE_TIER_LIMITS.maxCircles} max`,
          proValue: "Unlimited",
        },
        {
          name: "Members per Circle",
          icon: <Users size={16} color={themeColor} />,
          freeValue: `${FREE_TIER_LIMITS.maxCircleMembers} max`,
          proValue: "Unlimited",
        },
        {
          name: "Circle Insights",
          icon: <BarChart3 size={16} color={themeColor} />,
          freeValue: "No",
          proValue: "Yes",
        },
      ],
    },
    {
      title: "Insights",
      features: [
        {
          name: "Friend Notes",
          icon: <Sparkles size={16} color={themeColor} />,
          freeValue: `${FREE_TIER_LIMITS.maxFriendNotes} max`,
          proValue: "Unlimited",
        },
        {
          name: "Top Friends Analytics",
          icon: <BarChart3 size={16} color={themeColor} />,
          freeValue: "No",
          proValue: "Yes",
        },
        {
          name: "Full Achievements",
          icon: <Trophy size={16} color={themeColor} />,
          freeValue: "Basic only",
          proValue: "All badges",
        },
        {
          name: "Priority Sync",
          icon: <Zap size={16} color={themeColor} />,
          freeValue: "No",
          proValue: "Yes",
        },
        {
          name: "Early Access",
          icon: <Star size={16} color={themeColor} />,
          freeValue: "No",
          proValue: "Yes",
        },
      ],
    },
  ];

  // Get CTA button text
  const getCTAText = () => {
    if (isLifetime) return "Lifetime Pro Active";
    if (isPremium && !isTrial) return "Manage Subscription";
    return "Start Pro Trial";
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
                  Pro is for organizers
                </Text>
              </View>
              <Text style={{ color: colors.textSecondary }} className="text-sm leading-5">
                Designed for the people who bring friends together. Friends can always join and participate for free.
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
                      {PRICING.trialDays}-day free trial
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
              <Pressable
                onPress={handlePurchase}
                disabled={isPurchasing || packagesLoading || (isPremium && !isTrial)}
                className="mt-4 py-4 rounded-xl items-center flex-row justify-center"
                style={{
                  backgroundColor: (isPremium && !isTrial) ? colors.textTertiary : themeColor,
                  opacity: isPurchasing || packagesLoading ? 0.7 : 1
                }}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#fff" />
                ) : packagesLoading ? (
                  <Text className="text-white font-semibold text-base">Loading...</Text>
                ) : (
                  <>
                    <Crown size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text className="text-white font-semibold text-base">
                      {getCTAText()}
                    </Text>
                  </>
                )}
              </Pressable>

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
          <Pressable
            onPress={handleRestorePurchases}
            disabled={isRestoring}
            style={{ backgroundColor: colors.surface }}
            className="rounded-2xl p-4 flex-row items-center justify-center"
          >
            {isRestoring ? (
              <ActivityIndicator color={colors.textSecondary} size="small" />
            ) : (
              <>
                <RotateCcw size={18} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary }} className="ml-2 font-medium">
                  Restore Purchases
                </Text>
              </>
            )}
          </Pressable>
        </Animated.View>

        {/* Manage Subscription Link */}
        {isPremium && !isLifetime && Platform.OS === "ios" && (
          <Animated.View entering={FadeInDown.delay(500).springify()} className="mx-4 mt-4">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL("https://apps.apple.com/account/subscriptions");
              }}
              style={{ backgroundColor: colors.surface }}
              className="rounded-2xl p-4 flex-row items-center justify-center"
            >
              <ExternalLink size={18} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary }} className="ml-2 font-medium">
                Manage in App Store
              </Text>
            </Pressable>
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
