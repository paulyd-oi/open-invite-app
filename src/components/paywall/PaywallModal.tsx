/**
 * PaywallModal - Shows upgrade prompts when users hit feature limits
 * Copy and context match spec exactly
 */

import React, { useEffect } from "react";
import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInUp, SlideInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { X, Check, Sparkles, Crown } from "@/ui/icons";
import { useRouter } from "expo-router";

import { useTheme } from "@/lib/ThemeContext";
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
  ACTIVE_EVENTS_LIMIT: {
    title: "Upgrade to Pro",
    subtitle: "You're hosting the maximum number of active events on Free.",
    bullets: [
      "Unlimited active events",
      "Full event history",
      "Plan farther ahead with Who's Free (90 days)",
    ],
    primaryCta: "Upgrade to Pro",
    secondaryCta: "Not now",
  },
  RECURRING_EVENTS: {
    title: "Recurring events are Pro",
    subtitle: "Set weekly or monthly plans so your group stays consistent.",
    bullets: [
      "Unlimited recurring events",
      "Auto-reminders and RSVP tracking",
      "Keep groups connected",
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
      "Full achievements",
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
  ACHIEVEMENTS_LOCKED: {
    title: "Unlock all achievements",
    subtitle: "Pro reveals every badge and milestone.",
    bullets: [
      "All badges",
      "Progress tracking",
      "Motivation to stay consistent",
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
        <Pressable className="flex-1" onPress={handleSecondary} />
        <Animated.View
          entering={SlideInUp.springify().damping(15)}
          className="rounded-t-3xl overflow-hidden"
          style={{ backgroundColor: colors.background }}
        >
          <SafeAreaView edges={["bottom"]}>
            {/* Header with gradient */}
            <LinearGradient
              colors={[`${themeColor}30`, "transparent"]}
              style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 16 }}
            >
              {/* Close button */}
              <Pressable
                onPress={handleSecondary}
                className="absolute top-4 right-4 w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.surface }}
                hitSlop={12}
              >
                <X size={18} color={colors.textSecondary} />
              </Pressable>

              {/* Icon */}
              <Animated.View
                entering={FadeIn.delay(100)}
                className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Sparkles size={32} color={themeColor} />
              </Animated.View>

              {/* Title */}
              <Animated.Text
                entering={FadeInUp.delay(150)}
                className="text-2xl font-bold"
                style={{ color: colors.text }}
              >
                {copy.title}
              </Animated.Text>

              {/* Subtitle */}
              <Animated.Text
                entering={FadeInUp.delay(200)}
                className="text-base mt-2"
                style={{ color: colors.textSecondary }}
              >
                {copy.subtitle}
              </Animated.Text>
            </LinearGradient>

            {/* Bullets */}
            <ScrollView
              className="px-6"
              style={{ maxHeight: 200 }}
              showsVerticalScrollIndicator={false}
            >
              {copy.bullets.map((bullet, index) => (
                <Animated.View
                  key={index}
                  entering={FadeInUp.delay(250 + index * 50)}
                  className="flex-row items-center py-3"
                  style={{
                    borderBottomWidth: index < copy.bullets.length - 1 ? 1 : 0,
                    borderBottomColor: colors.separator,
                  }}
                >
                  <View
                    className="w-6 h-6 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: `${themeColor}20` }}
                  >
                    <Check size={14} color={themeColor} />
                  </View>
                  <Text
                    className="flex-1 text-base"
                    style={{ color: colors.text }}
                  >
                    {bullet}
                  </Text>
                </Animated.View>
              ))}
            </ScrollView>

            {/* CTAs */}
            <View className="px-6 pt-4 pb-2">
              {/* Primary CTA */}
              <Pressable
                onPress={handlePrimary}
                className="py-4 rounded-2xl flex-row items-center justify-center"
                style={{ backgroundColor: themeColor }}
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
                  style={{ color: colors.textSecondary }}
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
                    style={{ color: colors.textTertiary }}
                  >
                    Restore purchases
                  </Text>
                </Pressable>
              )}
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default PaywallModal;
