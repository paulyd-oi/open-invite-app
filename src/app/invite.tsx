import React from "react";
import { trackInviteShared } from "@/analytics/analyticsEventsSSOT";
import { buildReferralSharePayload } from "@/lib/shareSSOT";
import {
  View,
  Text,
  Pressable,
  Share,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import {
  Share2,
  Copy,
  Users,
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
import { isAuthedForNetwork } from "@/lib/authedGate";
import { devLog } from "@/lib/devLog";
import { useLiveRefreshContract } from "@/lib/useLiveRefreshContract";
import { STACK_BOTTOM_PADDING } from "@/lib/layoutSpacing";

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

  const { data: stats, isLoading, refetch: refetchStats } = useQuery<ReferralStats>({
    queryKey: ["referralStats"],
    queryFn: () => api.get<ReferralStats>("/api/referral/stats"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Pull-to-refresh + focus refresh
  const { isRefreshing, onManualRefresh } = useLiveRefreshContract({
    screenName: "invite",
    refetchFns: [refetchStats],
  });

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!stats || !stats.referralCode) {
      safeToast.info("Complete Profile", "Finish setting up your profile to unlock your invite code.");
      return;
    }

    // [P0_SHARE_SSOT] Use SSOT builder — ignore backend shareLink
    const p = buildReferralSharePayload(stats.referralCode);

    trackInviteShared({ entity: "referral", sourceScreen: "invite" });
    await Share.share({
      message: p.message,
      title: p.title,
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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={[]}>
      <Stack.Screen
        options={{
          title: "Invite Friends",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: STACK_BOTTOM_PADDING }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onManualRefresh} tintColor={themeColor} />
        }
      >
        {/* HERO: Invite friends header */}
        <Animated.View entering={FadeInDown.delay(100)} className="px-6 pt-4 pb-6">
          <View
            className="rounded-3xl overflow-hidden"
            style={{
              backgroundColor: isDark ? "#1E293B" : "#F0FDF4",
              borderWidth: 2,
              borderColor: "#10B981",
            }}
          >
            <View className="p-6">
              <View className="flex-row items-center justify-center mb-2">
                <Users size={24} color="#10B981" />
                <Text className="text-2xl font-bold text-center ml-2" style={{ color: "#10B981" }}>
                  INVITE FRIENDS
                </Text>
                <Users size={24} color="#10B981" />
              </View>
              <Text
                className="text-base text-center"
                style={{ color: colors.textSecondary }}
              >
                The more friends on Open Invite, the easier it is to plan!
              </Text>
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
              { step: "3", text: "You can start planning together" },
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
