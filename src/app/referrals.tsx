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
import { ChevronLeft, Users, Copy, Share2, Check, Clock } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { safeToast } from "@/lib/safeToast";
import { buildReferralSharePayload } from "@/lib/shareSSOT";
import { EntityAvatar } from "@/components/EntityAvatar";
import { devError, devLog } from "@/lib/devLog";
import { qk } from "@/lib/queryKeys";

interface ReferralHistoryItem {
  id: string;
  status: string;
  createdAt: string;
  referredUser: { id: string; name: string | null; image: string | null } | null;
  referredEmail: string | null;
}

interface ReferralHistoryResponse {
  referrals: ReferralHistoryItem[];
  rewards?: unknown[];
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
        {/* Avatar — SSOT via EntityAvatar */}
        <View className="mr-3">
          <EntityAvatar
            photoUrl={item.referredUser?.image}
            initials={item.referredUser?.name?.[0]?.toUpperCase()}
            size={40}
            borderRadius={20}
            backgroundColor={isSuccess ? "#10B98120" : isDark ? "#2C2C2E" : "#F3F4F6"}
            foregroundColor={isSuccess ? "#10B981" : colors.textSecondary}
            fallbackIcon="people-outline"
          />
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
    queryKey: qk.referralStats(),
    queryFn: () => api.get<ReferralStatsResponse>("/api/referral/stats"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["referralHistory"],
    queryFn: () => api.get<ReferralHistoryResponse>("/api/referral/history"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.referralStats() }),
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
      // [P0_SHARE_SSOT] Use SSOT builder
      const p = buildReferralSharePayload(stats.referralCode);
      await Share.share({ message: p.message, title: p.title });
    } catch (error) {
      devError("Error sharing:", error);
    }
  };

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
          Referrals
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
              Share your code with friends so they can join you on Open Invite
            </Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
