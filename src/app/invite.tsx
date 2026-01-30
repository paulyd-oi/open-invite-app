import React from "react";
import {
  View,
  Text,
  Pressable,
  Share,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import {
  Gift,
  Share2,
  Copy,
  Users,
  Award,
  ChevronRight,
  Crown,
  Sparkles,
  Star,
  Check,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { safeToast } from "@/lib/safeToast";
import { useBootAuthority } from "@/hooks/useBootAuthority";

interface ReferralStats {
  referralCode: string | null;
  shareLink: string;
  successfulReferrals: number;
  pendingReferrals: number;
  totalInvites: number;
  hasReferrer: boolean;
  nextReward: {
    type: string;
    count: number;
    remaining: number;
  } | null;
  rewardTiers: {
    MONTH_PREMIUM: { count: number; type: string };
    YEAR_PREMIUM: { count: number; type: string };
    LIFETIME_PREMIUM: { count: number; type: string };
  };
}

export default function InviteScreen() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  const { data: stats, isLoading } = useQuery<ReferralStats>({
    queryKey: ["referralStats"],
    queryFn: () => api.get<ReferralStats>("/api/referral/stats"),
    enabled: bootStatus === 'authed',
  });

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!stats || !stats.referralCode) {
      safeToast.info("Complete Profile", "Finish setting up your profile to unlock your invite code.");
      return;
    }

    const message = `Join me on Open Invite! See what your friends are up to and make plans together.\n\nUse my invite code: ${stats.referralCode}\n\nDownload: ${stats.shareLink}`;

    await Share.share({
      message,
      title: "Join Open Invite!",
    });
  };

  const handleCopyCode = async () => {
    if (!stats || !stats.referralCode) {
      safeToast.info("Complete Profile", "Finish setting up your profile to unlock your invite code.");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(stats.referralCode);
    safeToast.success("Copied!", "Referral code copied to clipboard");
  };

  const getRewardLabel = (type: string) => {
    switch (type) {
      case "week_premium":
        return "1 Week Premium";
      case "month_premium":
        return "1 Month Premium";
      case "year_premium":
        return "1 Year Premium";
      case "lifetime_premium":
        return "Lifetime Premium";
      default:
        return type;
    }
  };

  const rewardTiers = [
    { count: 3, reward: "1 Month FREE", icon: Gift, color: "#10B981" },
    { count: 10, reward: "1 Year FREE", icon: Award, color: "#8B5CF6" },
    { count: 20, reward: "Lifetime FREE", icon: Crown, color: "#EC4899" },
  ];

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen
          options={{
            title: "Invite Friends",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
          }}
        />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      </SafeAreaView>
    );
  }

  const successCount = stats?.successfulReferrals ?? 0;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Invite Friends",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* HERO: Big Reward Tiers Section - THE MAIN ATTRACTION */}
        <Animated.View entering={FadeInDown.delay(100)} className="px-6 pt-4 pb-6">
          <View
            className="rounded-3xl overflow-hidden"
            style={{
              backgroundColor: isDark ? "#1E293B" : "#F0FDF4",
              borderWidth: 2,
              borderColor: "#10B981",
            }}
          >
            {/* Header */}
            <View className="p-6 pb-4">
              <View className="flex-row items-center justify-center mb-2">
                <Sparkles size={24} color="#10B981" />
                <Text className="text-2xl font-bold text-center ml-2" style={{ color: "#10B981" }}>
                  EARN FREE PREMIUM
                </Text>
                <Sparkles size={24} color="#10B981" />
              </View>
              <Text
                className="text-base text-center"
                style={{ color: colors.textSecondary }}
              >
                The more friends on Open Invite, the easier it is to plan!
              </Text>
            </View>

            {/* Big Reward Cards */}
            <View className="px-4 pb-4">
              <View className="flex-row justify-between">
                {rewardTiers.map((tier, index) => {
                  const Icon = tier.icon;
                  const isUnlocked = successCount >= tier.count;
                  const isNextTarget = !isUnlocked && (index === 0 || successCount >= rewardTiers[index - 1].count);

                  return (
                    <View
                      key={tier.count}
                      className="flex-1 items-center mx-1"
                    >
                      <View
                        className="w-full rounded-2xl p-4 items-center"
                        style={{
                          backgroundColor: isUnlocked
                            ? tier.color
                            : isDark ? "#0F172A" : "#FFFFFF",
                          borderWidth: 2,
                          borderColor: tier.color,
                          opacity: isUnlocked ? 1 : isNextTarget ? 1 : 0.6,
                        }}
                      >
                        <View
                          className="w-14 h-14 rounded-full items-center justify-center mb-2"
                          style={{
                            backgroundColor: isUnlocked ? "#FFFFFF30" : `${tier.color}20`,
                          }}
                        >
                          <Icon size={28} color={isUnlocked ? "#FFFFFF" : tier.color} />
                        </View>
                        <Text
                          className="text-3xl font-black"
                          style={{
                            color: isUnlocked ? "#FFFFFF" : tier.color,
                            textDecorationLine: isUnlocked ? "line-through" : "none",
                          }}
                        >
                          {tier.count}
                        </Text>
                        <Text
                          className="text-xs font-medium text-center"
                          style={{ color: isUnlocked ? "#FFFFFF" : colors.textSecondary }}
                        >
                          {tier.reward.split(' ')[0]} {tier.reward.split(' ')[1]}
                        </Text>
                        <Text
                          className="text-xs font-bold"
                          style={{ color: isUnlocked ? "#FFFFFF" : tier.color }}
                        >
                          {tier.reward.split(' ')[2]}
                        </Text>
                        {isUnlocked && (
                          <View className="mt-2 px-2 py-1 rounded-full bg-white/30 flex-row items-center">
                            <Check size={12} color="#FFFFFF" />
                            <Text className="text-xs font-bold text-white ml-1">EARNED</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Progress Indicator */}
            <View className="px-6 pb-6">
              <View className="flex-row items-center justify-center">
                <Users size={18} color={themeColor} />
                <Text className="ml-2 text-base font-semibold" style={{ color: colors.text }}>
                  {successCount} friend{successCount !== 1 ? "s" : ""} joined
                </Text>
              </View>
              {successCount < 20 && (
                <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                  {successCount < 3
                    ? `${3 - successCount} more to unlock 1 month FREE`
                    : successCount < 10
                    ? `${10 - successCount} more to unlock 1 year FREE`
                    : `${20 - successCount} more to unlock Lifetime FREE`}
                </Text>
              )}
              {successCount >= 20 && (
                <Text className="text-sm text-center mt-1" style={{ color: "#10B981" }}>
                  You've earned Lifetime FREE!
                </Text>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Your Code Section */}
        <Animated.View entering={FadeInDown.delay(200)} className="px-6 mb-6">
          <Text className="text-sm font-medium mb-3 uppercase tracking-wide" style={{ color: colors.textSecondary }}>
            Your Invite Code
          </Text>
          <View
            className="rounded-2xl p-4"
            style={{
              backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
              borderWidth: 1,
              borderColor: isDark ? "#334155" : "#E2E8F0",
            }}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-bold tracking-widest" style={{ color: themeColor }}>
                {stats?.referralCode ?? "---"}
              </Text>
              <Pressable
                onPress={handleCopyCode}
                className="flex-row items-center px-4 py-2 rounded-xl"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Copy size={16} color={themeColor} />
                <Text className="ml-2 font-medium" style={{ color: themeColor }}>
                  Copy
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* Share Button */}
        <Animated.View entering={FadeInDown.delay(300)} className="px-6 mb-8">
          <Pressable
            onPress={handleShare}
            className="flex-row items-center justify-center py-4 rounded-2xl"
            style={{ backgroundColor: themeColor }}
          >
            <Share2 size={20} color="#fff" />
            <Text className="text-white text-lg font-semibold ml-2">
              Share Invite Link
            </Text>
          </Pressable>
        </Animated.View>

        {/* How it works */}
        <Animated.View entering={FadeInUp.delay(500)} className="px-6 pb-8">
          <Text className="text-sm font-medium mb-3 uppercase tracking-wide" style={{ color: colors.textSecondary }}>
            How It Works
          </Text>
          <View
            className="rounded-2xl p-4"
            style={{
              backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
              borderWidth: 1,
              borderColor: isDark ? "#334155" : "#E2E8F0",
            }}
          >
            {[
              { step: "1", text: "Share your unique invite code with friends" },
              { step: "2", text: "They sign up using your code" },
              { step: "3", text: "You both get rewards! They get 1 week free trial" },
            ].map((item, index) => (
              <View
                key={item.step}
                className="flex-row items-start"
                style={{ marginBottom: index < 2 ? 16 : 0 }}
              >
                <View
                  className="w-7 h-7 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: themeColor }}
                >
                  <Text className="text-white font-bold text-sm">{item.step}</Text>
                </View>
                <Text className="flex-1 text-base leading-6 pt-0.5" style={{ color: colors.text }}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
