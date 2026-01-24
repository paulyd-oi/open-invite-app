import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Share,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft, Users, Gift, Copy, Share2, Check, Clock, Crown } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { safeToast } from "@/lib/safeToast";
import { REFERRAL_TIERS } from "@/lib/freemiumLimits";

interface ReferralHistoryItem {
  id: string;
  status: string;
  createdAt: string;
  referredUser: { id: string; name: string | null; image: string | null } | null;
  referredEmail: string | null;
}

interface ReferralReward {
  id: string;
  rewardType: string;
  referralCount: number;
  claimedAt: string;
  expiresAt: string | null;
}

interface ReferralHistoryResponse {
  referrals: ReferralHistoryItem[];
  rewards: ReferralReward[];
  summary: {
    successful: number;
    pending: number;
    totalRewards: number;
  };
}

interface ReferralStatsResponse {
  referralCode: string;
  shareLink: string;
  successfulReferrals: number;
  pendingReferrals: number;
  totalInvites: number;
  hasReferrer: boolean;
  nextReward: { type: string; count: number; remaining: number } | null;
  rewardTiers: typeof REFERRAL_TIERS;
}

function RewardTierCard({
  title,
  count,
  currentCount,
  emoji,
  isDark,
  colors,
  themeColor,
}: {
  title: string;
  count: number;
  currentCount: number;
  emoji: string;
  isDark: boolean;
  colors: any;
  themeColor: string;
}) {
  const isUnlocked = currentCount >= count;
  const progress = Math.min((currentCount / count) * 100, 100);

  return (
    <View
      className="rounded-xl p-4 mb-3"
      style={{
        backgroundColor: isUnlocked ? "#10B98115" : colors.surface,
        borderWidth: 1,
        borderColor: isUnlocked ? "#10B981" : colors.border,
      }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <Text className="text-2xl mr-2">{emoji}</Text>
          <View>
            <Text className="font-semibold" style={{ color: isUnlocked ? "#10B981" : colors.text }}>
              {title}
            </Text>
            <Text className="text-xs" style={{ color: colors.textSecondary }}>
              {count} referrals needed
            </Text>
          </View>
        </View>
        {isUnlocked && (
          <View className="px-2 py-1 rounded-full" style={{ backgroundColor: "#10B98125" }}>
            <Text className="text-xs font-bold" style={{ color: "#10B981" }}>UNLOCKED</Text>
          </View>
        )}
      </View>
      <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
        <View
          className="h-full rounded-full"
          style={{ width: `${progress}%`, backgroundColor: isUnlocked ? "#10B981" : themeColor }}
        />
      </View>
      <Text className="text-xs mt-1 text-right" style={{ color: colors.textTertiary }}>
        {currentCount}/{count}
      </Text>
    </View>
  );
}

function ReferralHistoryCard({
  item,
  index,
  isDark,
  colors,
}: {
  item: ReferralHistoryItem;
  index: number;
  isDark: boolean;
  colors: any;
}) {
  const isSuccess = item.status === "signed_up" || item.status === "rewarded";
  const isPending = item.status === "pending";
  const date = new Date(item.createdAt);
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <View
        className="flex-row items-center p-3 rounded-xl mb-2"
        style={{ backgroundColor: colors.surface }}
      >
        {/* Avatar or Initial */}
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: isSuccess ? "#10B98120" : isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          {item.referredUser?.image ? (
            <Image source={{ uri: item.referredUser.image }} className="w-10 h-10 rounded-full" />
          ) : (
            <Users size={18} color={isSuccess ? "#10B981" : colors.textSecondary} />
          )}
        </View>

        {/* Name/Email */}
        <View className="flex-1">
          <Text className="font-medium" style={{ color: colors.text }}>
            {item.referredUser?.name || item.referredEmail || "Invited Friend"}
          </Text>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            {dateStr}
          </Text>
        </View>

        {/* Status Badge */}
        <View
          className="px-2 py-1 rounded-full flex-row items-center"
          style={{ backgroundColor: isSuccess ? "#10B98120" : "#F59E0B20" }}
        >
          {isSuccess ? (
            <Check size={12} color="#10B981" />
          ) : (
            <Clock size={12} color="#F59E0B" />
          )}
          <Text
            className="text-xs font-medium ml-1"
            style={{ color: isSuccess ? "#10B981" : "#F59E0B" }}
          >
            {isSuccess ? "Joined" : "Pending"}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function ReferralsScreen() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["referralStats"],
    queryFn: () => api.get<ReferralStatsResponse>("/api/referral/stats"),
    enabled: bootStatus === 'authed',
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["referralHistory"],
    queryFn: () => api.get<ReferralHistoryResponse>("/api/referral/history"),
    enabled: bootStatus === 'authed',
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["referralStats"] }),
      queryClient.invalidateQueries({ queryKey: ["referralHistory"] }),
    ]);
    setRefreshing(false);
  };

  const handleCopyCode = async () => {
    if (!stats?.referralCode) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(stats.referralCode);
    safeToast.success("Copied!", "Your referral code has been copied");
  };

  const handleShare = async () => {
    if (!stats?.referralCode) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Include both the deep link for auto-capture and plain code for manual entry
      const deepLink = `openinvite://?ref=${stats.referralCode}`;
      const message = `Join me on Open Invite! Use my code ${stats.referralCode} or tap ${deepLink}`;
      
      await Share.share({
        message,
        title: "Invite friends to Open Invite",
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const successfulCount = stats?.successfulReferrals ?? 0;
  const isLoading = statsLoading || historyLoading;

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
        <Text className="text-xl font-bold" style={{ color: colors.text }}>
          Referrals & Rewards
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={themeColor} />
        }
      >
        {/* Your Code Card */}
        <View
          className="rounded-2xl p-5 mb-5"
          style={{
            backgroundColor: isDark ? "#1C2127" : "#F0FDF4",
            borderWidth: 1,
            borderColor: "#10B98140",
          }}
        >
          <Text className="text-sm font-medium mb-2" style={{ color: "#10B981" }}>
            YOUR REFERRAL CODE
          </Text>
          <Text className="text-3xl font-black tracking-widest mb-3" style={{ color: colors.text }}>
            {isLoading ? "..." : stats?.referralCode ?? "---"}
          </Text>

          <View className="flex-row">
            <Pressable
              onPress={handleCopyCode}
              className="flex-1 flex-row items-center justify-center py-3 rounded-xl mr-2"
              style={{ backgroundColor: "#10B98120" }}
            >
              <Copy size={18} color="#10B981" />
              <Text className="ml-2 font-semibold" style={{ color: "#10B981" }}>
                Copy Code
              </Text>
            </Pressable>
            <Pressable
              onPress={handleShare}
              className="flex-1 flex-row items-center justify-center py-3 rounded-xl"
              style={{ backgroundColor: themeColor }}
            >
              <Share2 size={18} color="#FFFFFF" />
              <Text className="ml-2 font-semibold text-white">Share</Text>
            </Pressable>
          </View>
        </View>

        {/* Reward Tiers */}
        <Text className="text-lg font-bold mb-3" style={{ color: colors.text }}>
          Reward Tiers
        </Text>
        <RewardTierCard
          title="1 Month Free"
          count={REFERRAL_TIERS.MONTH_PRO.count}
          currentCount={successfulCount}
          emoji="🎁"
          isDark={isDark}
          colors={colors}
          themeColor={themeColor}
        />
        <RewardTierCard
          title="1 Year Free"
          count={REFERRAL_TIERS.YEAR_PRO.count}
          currentCount={successfulCount}
          emoji="⭐"
          isDark={isDark}
          colors={colors}
          themeColor={themeColor}
        />
        <RewardTierCard
          title="Lifetime Free"
          count={REFERRAL_TIERS.LIFETIME_PRO.count}
          currentCount={successfulCount}
          emoji="👑"
          isDark={isDark}
          colors={colors}
          themeColor={themeColor}
        />

        {/* Referral History */}
        <Text className="text-lg font-bold mt-4 mb-3" style={{ color: colors.text }}>
          Referral History
        </Text>

        {history?.referrals && history.referrals.length > 0 ? (
          history.referrals.map((item, index) => (
            <ReferralHistoryCard
              key={item.id}
              item={item}
              index={index}
              isDark={isDark}
              colors={colors}
            />
          ))
        ) : (
          <View
            className="items-center py-8 rounded-xl"
            style={{ backgroundColor: colors.surface }}
          >
            <Users size={40} color={colors.textTertiary} />
            <Text className="text-base font-medium mt-3" style={{ color: colors.text }}>
              No referrals yet
            </Text>
            <Text className="text-sm text-center mt-1 px-4" style={{ color: colors.textSecondary }}>
              Share your code with friends to start earning rewards
            </Text>
          </View>
        )}

        {/* Earned Rewards */}
        {history?.rewards && history.rewards.length > 0 && (
          <>
            <Text className="text-lg font-bold mt-6 mb-3" style={{ color: colors.text }}>
              Earned Rewards
            </Text>
            {history.rewards.map((reward, index) => (
              <Animated.View
                key={reward.id}
                entering={FadeInDown.delay(index * 50).springify()}
              >
                <View
                  className="flex-row items-center p-4 rounded-xl mb-2"
                  style={{ backgroundColor: "#10B98115", borderWidth: 1, borderColor: "#10B98140" }}
                >
                  <Crown size={24} color="#10B981" />
                  <View className="flex-1 ml-3">
                    <Text className="font-semibold" style={{ color: "#10B981" }}>
                      {reward.rewardType === "month_premium"
                        ? "1 Month Free"
                        : reward.rewardType === "year_premium"
                        ? "1 Year Free"
                        : "Lifetime Free"}
                    </Text>
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      Earned with {reward.referralCount} referrals
                    </Text>
                  </View>
                  <Text className="text-xs" style={{ color: colors.textTertiary }}>
                    {new Date(reward.claimedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
