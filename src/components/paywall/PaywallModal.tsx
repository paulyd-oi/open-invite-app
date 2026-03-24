/**
 * PaywallModal - Shows upgrade prompts when users hit feature limits
 * Copy and context match spec exactly
 */

import React, { useEffect } from "react";
import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInUp, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { X, Check, Sparkles, Crown } from "@/ui/icons";
import { useRouter } from "expo-router";

import { useTheme } from "@/lib/ThemeContext";
import { SCRIM } from "@/ui/tokens";
import {
  type PaywallContext,
  markPaywallShown,
  trackAnalytics,
  isPremiumFromSubscription,
} from "@/lib/entitlements";
import { goToSubscription } from "@/lib/nav";
import { useSubscription } from "@/lib/SubscriptionContext";
import { devWarn } from "@/lib/devLog";

interface PaywallModalProps {
  visible: boolean;
  context: PaywallContext;
  onClose: () => void;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onRestore?: () => void;
}

// Paywall copy mapping - EXACT as specified
const PAYWALL_COPY: Record<
  PaywallContext,
  {
    title: string;
    subtitle: string;
    bullets: string[];
    primaryCta: string;
    secondaryCta: string;
  }
> = {
  PREMIUM_THEME: {
    title: "Make your event unforgettable",
    subtitle: "Premium themes with stunning animated effects your guests will love.",
    bullets: [
      "Premium themes with unique vibes",
      "Animated page effects — confetti, snow, sparkles",
      "Every invite stands out",
    ],
    primaryCta: "Upgrade to Pro",
    secondaryCta: "Not now",
  },
  RECURRING_EVENTS: {
    title: "Set it and forget it",
    subtitle: "Your group meets every week — automatically.",
    bullets: [
      "Weekly, monthly, or custom repeats",
      "Auto-reminders for every occurrence",
      "Never plan the same event twice",
    ],
    primaryCta: "Upgrade to Pro",
    secondaryCta: "Not now",
  },
  WHOS_FREE_HORIZON: {
    title: "Plan farther ahead",
    subtitle: "Free shows 7 days of availability. Pro unlocks 90 days.",
    bullets: [
      "See 90 days of Who's Free",
      "Find best times faster",
      "Reduce back-and-forth",
    ],
    primaryCta: "Unlock Pro",
    secondaryCta: "Not now",
  },
  UPCOMING_BIRTHDAYS_HORIZON: {
    title: "Never miss birthdays",
    subtitle: "Free shows 7 days ahead. Pro unlocks 90 days.",
    bullets: [
      "90-day birthday view",
      "Better planning prompts",
      "Stronger relationships",
    ],
    primaryCta: "Unlock Pro",
    secondaryCta: "Not now",
  },
  CIRCLES_LIMIT: {
    title: "More groups with Pro",
    subtitle: "Free supports up to 2 groups.",
    bullets: [
      "Unlimited groups",
      "Better planning for each group",
      "Group insights",
    ],
    primaryCta: "Upgrade to Pro",
    secondaryCta: "Not now",
  },
  CIRCLE_MEMBERS_LIMIT: {
    title: "Bigger groups with Pro",
    subtitle: "Free supports up to 15 members per group.",
    bullets: [
      "Unlimited members",
      "Better RSVP coordination",
      "Easier group planning",
    ],
    primaryCta: "Upgrade to Pro",
    secondaryCta: "Not now",
  },
  INSIGHTS_LOCKED: {
    title: "Insights are Pro",
    subtitle: "See who you're connecting with and build consistency.",
    bullets: [
      "Top friends analytics",
      "Group insights",
    ],
    primaryCta: "Unlock Pro",
    secondaryCta: "Not now",
  },
  HISTORY_LIMIT: {
    title: "Unlock full history",
    subtitle: "Free shows the last 30 days. Pro saves everything.",
    bullets: [
      "Full event history",
      "Reflections over time",
      "Track your social momentum",
    ],
    primaryCta: "Unlock Pro",
    secondaryCta: "Not now",
  },
  PRIORITY_SYNC_LOCKED: {
    title: "Priority Sync is Pro",
    subtitle: "Prioritize important events and keep your calendar clean.",
    bullets: [
      "Priority sync controls",
      "Smarter planning",
      "Less noise",
    ],
    primaryCta: "Unlock Pro",
    secondaryCta: "Not now",
  },
};

export function PaywallModal({
  visible,
  context,
  onClose,
  onPrimary,
  onSecondary,
  onRestore,
}: PaywallModalProps) {
  const router = useRouter();
  const { themeColor, colors } = useTheme();
  const { subscription, isPremium } = useSubscription();
  const copy = PAYWALL_COPY[context];

  // Log when shown and mark session
  useEffect(() => {
    if (visible) {
      markPaywallShown();
      trackAnalytics("paywall_shown", { context });

      // DEV: Log subscription state when paywall is shown
      // This helps debug cases where Lifetime users see paywalls
      if (__DEV__) {
        const computedPremium = isPremiumFromSubscription(
          subscription as any,
          `PaywallModal(${context})`
        );
        devWarn(
          `[PaywallModal] PAYWALL SHOWN for context "${context}"\n` +
          `  subscription.tier: ${subscription?.tier}\n` +
          `  context isPremium: ${isPremium}\n` +
          `  computed isPremium: ${computedPremium}\n` +
          `  MISMATCH: ${isPremium !== computedPremium ? "YES - INVESTIGATE!" : "No"}`
        );
      }

      // Dev warning: onPrimary should be provided for explicit CTA handling
      if (__DEV__ && !onPrimary) {
        devWarn(
          `[PaywallModal] onPrimary not provided for context "${context}". ` +
          `Using default navigation to /subscription. Consider providing explicit onPrimary.`
        );
      }
    }
  }, [visible, context, onPrimary, subscription, isPremium]);

  const handlePrimary = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackAnalytics("paywall_purchase_started", { context });
    onClose();
    if (onPrimary) {
      onPrimary();
    } else {
      // Default: navigate to subscription screen using nav helper
      goToSubscription(router);
    }
  };

  const handleSecondary = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackAnalytics("paywall_dismissed", { context });
    if (onSecondary) {
      onSecondary();
    }
    onClose();
  };

  const handleRestore = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onRestore) {
      onRestore();
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        className="flex-1"
      >
        {/* Blurred backdrop */}
        <Pressable className="absolute inset-0" onPress={handleSecondary}>
          <BlurView
            intensity={30}
            tint="dark"
            style={{ flex: 1, backgroundColor: SCRIM.medium }}
          />
        </Pressable>

        {/* Bottom-aligned glass card */}
        <View className="flex-1 justify-end">
          <Animated.View
            entering={SlideInDown.springify().damping(20)}
            exiting={SlideOutDown.springify().damping(20)}
          >
            <View
              className="mx-4 rounded-3xl overflow-hidden"
              style={{
                marginBottom: Math.max(insets.bottom, 8) + 8,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.4,
                shadowRadius: 24,
              }}
            >
              {/* Dark gradient base */}
              <LinearGradient
                colors={["#1a1a2e", "#16213e", "#0f0f23"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: "absolute", width: "100%", height: "100%" }}
              />

              {/* Glass blur overlay */}
              <BlurView
                intensity={40}
                tint="dark"
                style={{ position: "absolute", width: "100%", height: "100%" }}
              />

              <View className="p-6 relative">
                {/* Close button */}
                <Pressable
                  onPress={handleSecondary}
                  className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                  hitSlop={12}
                >
                  <X size={18} color="rgba(255,255,255,0.6)" />
                </Pressable>

                {/* Icon */}
                <Animated.View
                  entering={FadeIn.delay(100)}
                  className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                  style={{ backgroundColor: `${themeColor}30` }}
                >
                  <Sparkles size={32} color={themeColor} />
                </Animated.View>

                {/* Title */}
                <Animated.Text
                  entering={FadeInUp.delay(150)}
                  className="text-2xl font-bold"
                  style={{ color: "#FFFFFF" }}
                >
                  {copy.title}
                </Animated.Text>

                {/* Subtitle */}
                <Animated.Text
                  entering={FadeInUp.delay(200)}
                  className="text-base mt-2"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  {copy.subtitle}
                </Animated.Text>

                {/* Bullets */}
                <ScrollView
                  style={{ maxHeight: 200, marginTop: 16 }}
                  showsVerticalScrollIndicator={false}
                >
                  {copy.bullets.map((bullet, index) => (
                    <Animated.View
                      key={index}
                      entering={FadeInUp.delay(250 + index * 50)}
                      className="flex-row items-center py-3 px-4 rounded-xl mb-2"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.04)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.06)",
                      }}
                    >
                      <View
                        className="w-6 h-6 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: `${themeColor}25` }}
                      >
                        <Check size={14} color={themeColor} />
                      </View>
                      <Text
                        className="flex-1 text-base"
                        style={{ color: "rgba(255,255,255,0.9)" }}
                      >
                        {bullet}
                      </Text>
                    </Animated.View>
                  ))}
                </ScrollView>

                {/* CTAs */}
                <View className="pt-4">
                  {/* Primary CTA */}
                  <Pressable
                    onPress={handlePrimary}
                    className="py-4 rounded-2xl flex-row items-center justify-center overflow-hidden"
                    style={{
                      backgroundColor: themeColor,
                      shadowColor: themeColor,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 16,
                    }}
                  >
                    <Crown size={20} color="#FFFFFF" />
                    <Text className="text-white text-lg font-semibold ml-2">
                      {copy.primaryCta}
                    </Text>
                  </Pressable>

                  {/* Secondary CTA */}
                  <Pressable
                    onPress={handleSecondary}
                    className="py-4 items-center mt-2"
                  >
                    <Text
                      className="text-base"
                      style={{ color: "rgba(255,255,255,0.45)" }}
                    >
                      {copy.secondaryCta}
                    </Text>
                  </Pressable>

                  {/* Restore purchases (optional) */}
                  {onRestore && (
                    <Pressable
                      onPress={handleRestore}
                      className="py-2 items-center"
                    >
                      <Text
                        className="text-sm"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        Restore purchases
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

export default PaywallModal;
