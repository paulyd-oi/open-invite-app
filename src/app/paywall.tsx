import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { devLog, devWarn } from "@/lib/devLog";
import {
  Crown,
  Check,
  X,
  Sparkles,
  Flame,
  Ticket,
  CalendarDays,
  Palette,
  Users,
  Lock,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Purchases, { type PurchasesPackage } from "react-native-purchases";

import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useRefreshProContract } from "@/lib/entitlements";
import { useSubscription } from "@/lib/SubscriptionContext";
import {
  isRevenueCatEnabled,
  getOfferingWithFallback,
  purchasePackage,
  restorePurchases,
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_MONTHLY,
  RC_PACKAGE_LIFETIME,
  getKeySource,
} from "@/lib/revenuecatClient";
import { useFounderSpots, useEarlyMemberSpots } from "@/lib/useInventory";
import { PRICING } from "@/lib/useSubscription";

// ── Feature comparison categories ──────────────────────────────────────

interface FeatureRow {
  name: string;
  icon: React.ReactNode;
  freeValue: string;
  proValue: string;
}

interface FeatureCategory {
  title: string;
  features: FeatureRow[];
}

// ── Urgency progress bar ───────────────────────────────────────────────

function SpotsCounter({
  claimed,
  total,
  label,
  themeColor,
  colors,
}: {
  claimed: number;
  total: number;
  label: string;
  themeColor: string;
  colors: any;
}) {
  const remaining = Math.max(0, total - claimed);
  const pct = Math.min(1, claimed / total);
  const isSoldOut = remaining === 0;

  return (
    <View className="mt-2">
      <View className="flex-row justify-between mb-1">
        <Text style={{ color: colors.textSecondary }} className="text-xs">
          {label}
        </Text>
        <Text
          style={{ color: isSoldOut ? "#EF4444" : themeColor }}
          className="text-xs font-semibold"
        >
          {isSoldOut ? "Sold out" : `${remaining.toLocaleString()} left`}
        </Text>
      </View>
      <View
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: colors.border }}
      >
        <View
          className="h-2 rounded-full"
          style={{
            width: `${Math.max(2, pct * 100)}%`,
            backgroundColor: pct > 0.85 ? "#EF4444" : themeColor,
          }}
        />
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PAYWALL SCREEN
// ════════════════════════════════════════════════════════════════════════

export default function PaywallScreen() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const refreshProContract = useRefreshProContract();
  const queryClient = useQueryClient();
  const { isPremium, refresh: refreshSubscription } = useSubscription();

  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"lifetime" | "yearly" | "monthly">("lifetime");
  const [yearlyPackage, setYearlyPackage] = useState<PurchasesPackage | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [lifetimePackage, setLifetimePackage] = useState<PurchasesPackage | null>(null);
  const [revenueCatEnabled, setRevenueCatEnabled] = useState(false);

  // Modals
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showRestoreSuccessModal, setShowRestoreSuccessModal] = useState(false);

  // Inventory counters
  const founderSpots = useFounderSpots();
  const earlyMemberSpots = useEarlyMemberSpots();

  useEffect(() => {
    loadOfferings();
  }, []);

  // Redirect premium users
  useEffect(() => {
    if (isPremium && !isLoading) {
      if (__DEV__) devLog("[Paywall] Premium user detected, redirecting back");
      router.back();
    }
  }, [isPremium, isLoading, router]);

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
      setYearlyPackage(packages.find((p) => p.identifier === RC_PACKAGE_ANNUAL) ?? null);
      setMonthlyPackage(packages.find((p) => p.identifier === RC_PACKAGE_MONTHLY) ?? null);
      setLifetimePackage(packages.find((p) => p.identifier === RC_PACKAGE_LIFETIME) ?? null);

      if (__DEV__) {
        devLog("[P0_RC_STATE] OFFERING_LOADED", {
          keySource: getKeySource(),
          offeringId: result.data.usedId,
          foundRequested: result.data.foundRequested,
          packagesTotal: packages.length,
          hasAnnual: !!packages.find((p) => p.identifier === RC_PACKAGE_ANNUAL),
          hasMonthly: !!packages.find((p) => p.identifier === RC_PACKAGE_MONTHLY),
          hasLifetime: !!packages.find((p) => p.identifier === RC_PACKAGE_LIFETIME),
          packageIds: packages.map((p) => p.identifier),
        });
      }
    } else if (!result.ok) {
      if (__DEV__) {
        devWarn("[Paywall] Offering load failed:", result.reason);
        devLog("[P0_RC_STATE] OFFERING_FAILED", { keySource: getKeySource(), reason: result.reason });
      }
    }

    setIsLoading(false);
  };

  // ── Purchase handler ────────────────────────────────────────────────

  const getPackageForPlan = (): PurchasesPackage | null => {
    switch (selectedPlan) {
      case "lifetime": return lifetimePackage;
      case "yearly": return yearlyPackage;
      case "monthly": return monthlyPackage;
    }
  };

  const handlePurchase = async () => {
    const packageToPurchase = getPackageForPlan();
    if (!packageToPurchase) {
      safeToast.error("Load Failed", "Unable to load subscription. Please try again.");
      return;
    }

    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await purchasePackage(packageToPurchase);

    if (result.ok) {
      const { combinedIsPro } = await refreshProContract({ reason: "purchase:paywall" });

      if (__DEV__) {
        devLog("[PRO_SOT] AFTER screen=paywall_purchase combinedIsPro=", combinedIsPro);
        devLog("[P0_RC_PURCHASE_CONFIRM]", {
          surface: "paywall",
          plan: selectedPlan,
          storekitSuccess: true,
          didRefresh: true,
          combinedIsPro,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccessModal(true);
    } else if (result.reason === "sdk_error") {
      // Purchase cancelled or failed silently
    }

    setIsPurchasing(false);
  };

  const handleRestore = async () => {
    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (__DEV__) {
      devLog("[PRO_SOT] BEFORE screen=paywall_restore isPremium=", isPremium);
    }

    const result = await restorePurchases();

    if (result.ok) {
      const { combinedIsPro } = await refreshProContract({ reason: "restore:paywall" });

      if (__DEV__) {
        devLog("[PRO_SOT] AFTER screen=paywall_restore combinedIsPro=", combinedIsPro);
      }

      if (combinedIsPro) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowRestoreSuccessModal(true);
      } else {
        safeToast.info("No Purchases Found", "We couldn't find any previous purchases to restore.");
      }
    } else {
      safeToast.error("Restore Failed", "Failed to restore purchases. Please try again.");
    }

    setIsPurchasing(false);
  };

  // ── Offer code redemption (Apple-blessed Guideline 3.1.1) ──────────

  const handleRedeemOfferCode = async () => {
    if (Platform.OS !== "ios") return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Purchases.presentCodeRedemptionSheet();
      // Listener in SubscriptionContext will auto-detect entitlement changes
    } catch (e) {
      if (__DEV__) devWarn("[Paywall] presentCodeRedemptionSheet error:", e);
    }
  };

  // ── Feature comparison ──────────────────────────────────────────────

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

  // ── Price helpers ───────────────────────────────────────────────────

  const getSelectedPrice = (): string => {
    switch (selectedPlan) {
      case "lifetime": return lifetimePackage?.product?.priceString ?? `$${PRICING.lifetime}`;
      case "yearly": return yearlyPackage?.product?.priceString ?? `$${PRICING.proYearly}`;
      case "monthly": return monthlyPackage?.product?.priceString ?? `$${PRICING.proMonthly}`;
    }
  };

  const getPlanCTALabel = (): string => {
    if (isPurchasing) return "";
    switch (selectedPlan) {
      case "lifetime": return `Get Founder Lifetime — ${getSelectedPrice()}`;
      case "yearly": return `Get Annual Pro — ${getSelectedPrice()}/yr`;
      case "monthly": return `Get Monthly Pro — ${getSelectedPrice()}/mo`;
    }
  };

  // ── Loading state ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <View className="w-16 h-16 rounded-full items-center justify-center mb-4" style={{ backgroundColor: `${themeColor}20` }}>
          <Crown size={32} color={themeColor} />
        </View>
        <ActivityIndicator size="large" color={themeColor} />
        <Text style={{ color: colors.textSecondary }} className="mt-4 text-base">
          Loading plans...
        </Text>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* Header — frosted atmospheric gradient */}
      <View style={{ borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden" }}>
        <LinearGradient
          colors={isDark ? ["#1a1a2e", `${themeColor}40`, "#0f0f23"] : [`${themeColor}18`, `${themeColor}30`, `${themeColor}10`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: 60,
            paddingBottom: 28,
            paddingHorizontal: 20,
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.canGoBack() ? router.back() : router.replace("/");
            }}
            className="absolute top-14 right-5 w-8 h-8 rounded-full items-center justify-center"
            style={{ zIndex: 10, backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" }}
          >
            <X size={20} color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.4)"} />
          </Pressable>

          <Animated.View entering={FadeInDown.delay(100)} className="items-center">
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: `${themeColor}25` }}
            >
              <Crown size={40} color={themeColor} />
            </View>
            <Text style={{ color: isDark ? "#FFFFFF" : colors.text }} className="text-3xl font-bold text-center">
              Upgrade to Pro
            </Text>
            <Text style={{ color: isDark ? "rgba(255,255,255,0.6)" : colors.textSecondary }} className="text-center mt-2 text-base">
              Premium themes, effects, and event atmosphere
            </Text>
          </Animated.View>
        </LinearGradient>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Plan Cards ──────────────────────────────────────────── */}

        {/* Founder Lifetime */}
        <Animated.View entering={FadeInUp.delay(150)}>
          <Pressable
            onPress={() => { setSelectedPlan("lifetime"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            className="rounded-2xl p-4 mb-3 overflow-hidden"
            style={{
              backgroundColor: selectedPlan === "lifetime"
                ? isDark ? `${themeColor}18` : `${themeColor}0C`
                : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
              borderWidth: selectedPlan === "lifetime" ? 1.5 : 1,
              borderColor: selectedPlan === "lifetime"
                ? `${themeColor}80`
                : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
              ...(selectedPlan === "lifetime" && {
                shadowColor: themeColor,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
              }),
            }}
          >
            {/* Badge */}
            <View
              className="absolute -top-3 left-4 px-3 py-1 rounded-full flex-row items-center"
              style={{ backgroundColor: "#F59E0B" }}
            >
              <Flame size={12} color="#fff" />
              <Text className="text-white text-xs font-bold ml-1">Founder</Text>
            </View>

            <View className="flex-row items-center justify-between mt-2">
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-bold">
                  Founder Lifetime
                </Text>
                <Text style={{ color: themeColor }} className="text-xl font-bold mt-1">
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

            {/* Urgency counter */}
            {founderSpots.data && !founderSpots.data.isSoldOut && (
              <SpotsCounter
                claimed={founderSpots.data.claimed}
                total={founderSpots.data.total}
                label={`${founderSpots.data.total.toLocaleString()} founder spots`}
                themeColor="#F59E0B"
                colors={colors}
              />
            )}
            {founderSpots.data?.isSoldOut && (
              <Text style={{ color: "#EF4444" }} className="text-xs font-semibold mt-2">
                All founder spots claimed
              </Text>
            )}
          </Pressable>
        </Animated.View>

        {/* Annual Pro */}
        <Animated.View entering={FadeInUp.delay(200)}>
          <Pressable
            onPress={() => { setSelectedPlan("yearly"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            className="rounded-2xl p-4 mb-3 overflow-hidden"
            style={{
              backgroundColor: selectedPlan === "yearly"
                ? isDark ? `${themeColor}18` : `${themeColor}0C`
                : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
              borderWidth: selectedPlan === "yearly" ? 1.5 : 1,
              borderColor: selectedPlan === "yearly"
                ? `${themeColor}80`
                : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
              ...(selectedPlan === "yearly" && {
                shadowColor: themeColor,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
              }),
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-bold">
                  Annual Pro
                </Text>
                <Text style={{ color: themeColor }} className="text-xl font-bold mt-1">
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

            {/* Early member urgency counter */}
            {earlyMemberSpots.data && !earlyMemberSpots.data.isSoldOut && (
              <SpotsCounter
                claimed={earlyMemberSpots.data.claimed}
                total={earlyMemberSpots.data.total}
                label={`${earlyMemberSpots.data.total.toLocaleString()} early member spots`}
                themeColor={themeColor}
                colors={colors}
              />
            )}
          </Pressable>
        </Animated.View>

        {/* Monthly Pro */}
        <Animated.View entering={FadeInUp.delay(250)}>
          <Pressable
            onPress={() => { setSelectedPlan("monthly"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            className="rounded-2xl p-4 mb-6 overflow-hidden"
            style={{
              backgroundColor: selectedPlan === "monthly"
                ? isDark ? `${themeColor}18` : `${themeColor}0C`
                : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
              borderWidth: selectedPlan === "monthly" ? 1.5 : 1,
              borderColor: selectedPlan === "monthly"
                ? `${themeColor}80`
                : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
              ...(selectedPlan === "monthly" && {
                shadowColor: themeColor,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
              }),
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-bold">
                  Monthly Pro
                </Text>
                <Text style={{ color: themeColor }} className="text-xl font-bold mt-1">
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
        </Animated.View>

        {/* ── Feature Comparison ────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(300)}>
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-3 ml-1">
            COMPARE PLANS
          </Text>
          <View
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)",
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
            }}
          >
            {/* Header row */}
            <View
              className="flex-row py-3 px-4"
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }}
            >
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="font-semibold">Feature</Text>
              </View>
              <View className="w-16 items-center">
                <Text style={{ color: colors.textSecondary }} className="font-medium text-xs">FREE</Text>
              </View>
              <View className="w-16 items-center">
                <View className="flex-row items-center">
                  <Crown size={12} color={themeColor} />
                  <Text style={{ color: themeColor }} className="font-bold text-xs ml-1">PRO</Text>
                </View>
              </View>
            </View>

            {featureCategories.map((category, catIdx) => (
              <View key={category.title}>
                <View
                  className="px-4 py-2"
                  style={{
                    backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                    borderTopWidth: catIdx > 0 ? 1 : 0,
                    borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  }}
                >
                  <Text style={{ color: colors.textTertiary }} className="text-xs font-semibold uppercase">
                    {category.title}
                  </Text>
                </View>
                {category.features.map((f) => (
                  <View
                    key={f.name}
                    className="flex-row py-3 px-4 items-center"
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                    }}
                  >
                    <View className="flex-1 flex-row items-center">
                      {f.icon}
                      <Text style={{ color: colors.text }} className="ml-2 text-sm" numberOfLines={1}>{f.name}</Text>
                    </View>
                    <View className="w-16 items-center">
                      {f.freeValue === "No" ? (
                        <X size={14} color={colors.textTertiary} />
                      ) : (
                        <Text style={{ color: colors.textSecondary }} className="text-xs text-center">{f.freeValue}</Text>
                      )}
                    </View>
                    <View className="w-16 items-center">
                      {f.proValue === "Yes" ? (
                        <Check size={14} color="#10B981" />
                      ) : f.proValue === "Unlimited" ? (
                        <Text style={{ color: "#10B981" }} className="text-xs font-medium">Unlimited</Text>
                      ) : (
                        <Text style={{ color: themeColor }} className="text-xs font-medium text-center">{f.proValue}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Not configured message */}
        {!revenueCatEnabled && (
          <View
            className="rounded-2xl p-4 mt-6"
            style={{
              backgroundColor: isDark ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.08)",
              borderWidth: 1,
              borderColor: isDark ? "rgba(245,158,11,0.3)" : "rgba(245,158,11,0.25)",
            }}
          >
            <Text style={{ color: isDark ? "#FBBF24" : "#92400E" }} className="text-center">
              Payments are being set up. Please check back soon!
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Bottom CTA ──────────────────────────────────────────── */}
      <SafeAreaView
        edges={["bottom"]}
        style={{
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
        }}
      >
        <View className="px-5 pb-4 pt-3">
          <Pressable
            onPress={handlePurchase}
            disabled={isPurchasing || !revenueCatEnabled || !getPackageForPlan()}
            className="rounded-2xl py-4 items-center overflow-hidden"
            style={{
              backgroundColor: isPurchasing || !revenueCatEnabled
                ? isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
                : themeColor,
              shadowColor: isPurchasing || !revenueCatEnabled ? "transparent" : themeColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 16,
            }}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-lg font-semibold">{getPlanCTALabel()}</Text>
            )}
          </Pressable>

          {/* Secondary actions row */}
          <View className="flex-row justify-center mt-3">
            <Pressable
              onPress={handleRestore}
              disabled={isPurchasing || !revenueCatEnabled}
              className="py-2 px-4"
            >
              <Text style={{ color: colors.textSecondary }} className="text-sm">
                Restore Purchases
              </Text>
            </Pressable>

            {Platform.OS === "ios" && (
              <>
                <Text style={{ color: colors.textTertiary }} className="py-2">|</Text>
                <Pressable
                  onPress={handleRedeemOfferCode}
                  disabled={isPurchasing}
                  className="py-2 px-4"
                >
                  <Text style={{ color: colors.textSecondary }} className="text-sm">
                    Redeem Code
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          <Text
            style={{ color: colors.textTertiary }}
            className="text-xs text-center mt-2 px-4"
          >
            Cancel anytime in Settings. Subscription auto-renews unless cancelled at least 24 hours before the end of the current period.
          </Text>
        </View>
      </SafeAreaView>

      {/* Success Modal */}
      <ConfirmModal
        visible={showSuccessModal}
        title="Welcome to Pro!"
        message="You now have access to all premium features."
        confirmText="Let's Go!"
        onConfirm={() => { setShowSuccessModal(false); router.back(); }}
        onCancel={() => { setShowSuccessModal(false); router.back(); }}
      />

      {/* Restore Modal */}
      <ConfirmModal
        visible={showRestoreSuccessModal}
        title="Purchases Restored!"
        message="Your premium subscription has been restored."
        confirmText="Great!"
        onConfirm={() => { setShowRestoreSuccessModal(false); router.back(); }}
        onCancel={() => { setShowRestoreSuccessModal(false); router.back(); }}
      />
    </View>
  );
}
