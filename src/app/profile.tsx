import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Modal,
  RefreshControl,
} from "react-native";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Settings,
  Users,
  Plus,
  Trash2,
  UserPlus,
  X,
  Check,
  Calendar,
  Flame,
  Trophy,
  Star,
  Heart,
  ChevronRight,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import BottomNavigation from "@/components/BottomNavigation";
import { StreakCounter } from "@/components/StreakCounter";
import { MonthlyRecap, MonthlyRecapButton, type MonthlyRecapData } from "@/components/MonthlyRecap";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { api } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { useTheme } from "@/lib/ThemeContext";
import { resolveImageUrl } from "@/lib/imageUrl";
import {
  type GetGroupsResponse,
  type GetFriendsResponse,
  type GetProfileResponse,
  type GetProfilesResponse,
  type FriendGroup,
  type Friendship,
  type GetEventsResponse,
  type GetProfileStatsResponse,
  type GetAchievementsResponse,
  EVENT_CATEGORIES,
  TIER_COLORS,
} from "../../shared/contracts";

const GROUP_COLORS = [
  "#FF6B4A", "#4ECDC4", "#45B7D1", "#96CEB4", "#E6A700",
  "#DDA0DD", "#98D8C8", "#D4A017", "#BB8FCE", "#85C1E9",
];

export default function ProfileScreen() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [showMonthlyRecap, setShowMonthlyRecap] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { status: bootStatus } = useBootAuthority();

  // Redirect to appropriate auth screen based on bootStatus (aligns with BootRouter)
  useEffect(() => {
    if (bootStatus === 'onboarding') {
      router.replace("/welcome");
    } else if (bootStatus === 'loggedOut' || bootStatus === 'error') {
      router.replace("/login");
    }
  }, [bootStatus, router]);

  // Fetch profiles to check if user is in business mode
  const { data: profilesData, refetch: refetchProfiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profile"),
    enabled: !!session,
  });

  const activeProfile = profilesData?.activeProfile;

  const { data: profileData, refetch: refetchProfile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<GetProfileResponse>("/api/profile"),
    enabled: !!session,
  });

  const { data: friendsData, refetch: refetchFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: !!session,
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: !!session,
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["profileStats"],
    queryFn: () => api.get<GetProfileStatsResponse>("/api/profile/stats"),
    enabled: !!session,
  });

  const { data: achievementsData, refetch: refetchAchievements } = useQuery({
    queryKey: ["achievements"],
    queryFn: () => api.get<GetAchievementsResponse>("/api/profile/achievements"),
    enabled: !!session,
  });

  // Pull to refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Promise.all([
        refetchProfiles(),
        refetchProfile(),
        refetchFriends(),
        refetchEvents(),
        refetchStats(),
        refetchAchievements(),
        // Also invalidate session to get updated user image
        queryClient.invalidateQueries({ queryKey: ["session"] }),
      ]);
    } catch (error) {
      console.error("Error refreshing profile:", error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfiles, refetchProfile, refetchFriends, refetchEvents, refetchStats, refetchAchievements, queryClient]);

  const friends = (friendsData?.friends ?? []).filter(f => f.friend != null);
  const eventsCount = eventsData?.events?.length ?? 0;
  const friendsCount = friends.length;
  const calendarBio = profileData?.profile?.calendarBio;

  // Stats data
  const stats = statsData?.stats;
  const topFriends = statsData?.topFriends ?? [];

  // Get achievements from the new achievements endpoint
  const achievements = achievementsData?.achievements ?? [];
  const unlockedAchievements = achievements.filter(a => a.unlocked);
  const lockedAchievements = achievements.filter(a => !a.unlocked);
  const selectedBadgeId = achievementsData?.selectedBadgeId ?? null;
  const selectedBadge = selectedBadgeId ? achievements.find(a => a.id === selectedBadgeId) : null;

  // Build monthly recap data
  const now = new Date();

  // Check if we should show the monthly recap (last 2 days of month or first 2 days of next month)
  const currentDay = now.getDate();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const isEndOfMonth = currentDay >= lastDayOfMonth - 1; // Last 2 days
  const isStartOfMonth = currentDay <= 2; // First 2 days
  const shouldShowMonthlyRecap = isEndOfMonth || isStartOfMonth;

  // For the recap, use previous month if we're at the start of a new month
  const recapMonth = isStartOfMonth
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : now;

  const monthlyRecapData: MonthlyRecapData | null = stats && shouldShowMonthlyRecap ? {
    month: recapMonth.toLocaleString("en-US", { month: "long" }),
    year: recapMonth.getFullYear(),
    totalEvents: stats.hostedCount + stats.attendedCount,
    totalHangouts: stats.attendedCount,
    uniqueFriendsMetWith: topFriends.length,
    topCategory: stats.categoryBreakdown && Object.keys(stats.categoryBreakdown).length > 0
      ? (() => {
          const sorted = Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]);
          const [category, count] = sorted[0];
          const catInfo = EVENT_CATEGORIES.find(c => c.value === category);
          return { name: catInfo?.label ?? category, emoji: catInfo?.emoji ?? "📅", count };
        })()
      : null,
    topFriend: topFriends[0]
      ? { name: topFriends[0].name ?? "Friend", image: topFriends[0].image, count: topFriends[0].eventsCount }
      : null,
    topLocation: null,
    busiestDay: null,
    averagePerWeek: Math.round((stats.attendedCount + stats.hostedCount) / 4),
    streak: stats.currentStreak,
    rank: stats.currentStreak >= 8 ? "social_butterfly"
        : stats.currentStreak >= 4 ? "connector"
        : stats.currentStreak >= 2 ? "rising_star"
        : "getting_started",
  } : null;

  // Get category info
  const getCategoryInfo = (category: string) => {
    return EVENT_CATEGORIES.find(c => c.value === category) ?? { emoji: "📅", label: "Other", color: "#78909C" };
  };

  // Only render Profile for fully authenticated users ('authed' status)
  if (bootStatus === 'loading' || bootStatus === 'loggedOut' || bootStatus === 'error' || bootStatus === 'onboarding') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }} />
    );
  }

  // Derive user safely - user may be null/undefined in some auth states
  const user = session?.user ?? null;

  // Get display name with proper fallback chain - displayName should be primary
  const displayName = user?.displayName?.trim()
    || user?.name?.trim()
    || ((user as any)?.email ? (user as any).email.split('@')[0] : null)
    || "Account";

  // Get handle for secondary display (Instagram-style)
  const userHandle = user?.handle || profileData?.profile?.handle;

  // Business mode is hidden for now - will be re-enabled in a future update
  // if (isBusinessMode && activeProfile) { ... }

  return (
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
      <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
        <Text className="text-3xl font-sora-bold" style={{ color: colors.text }}>Profile</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/settings");
          }}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
        >
          <Settings size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColor}
            colors={[themeColor]}
          />
        }
      >
        {/* Profile Card */}
        <Animated.View entering={FadeInDown.delay(0).springify()}>
          <View className="rounded-2xl p-5 border mb-4" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <View className="flex-row items-center">
              <View className="relative">
                <View className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden">
                  {resolveImageUrl((user as any)?.image) ? (
                    <Image source={{ uri: resolveImageUrl((user as any)?.image)! }} className="w-full h-full" />
                  ) : (
                    <View className="w-full h-full items-center justify-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFEDD5" }}>
                      <Text className="text-2xl font-bold" style={{ color: themeColor }}>
                        {user?.name?.[0] ?? (user as any)?.email?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                  )}
                </View>
                {/* Selected Badge */}
                {selectedBadge && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/achievements");
                    }}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: selectedBadge.tierColor,
                      borderWidth: 2,
                      borderColor: colors.surface,
                    }}
                  >
                    <Text className="text-sm">{selectedBadge.emoji}</Text>
                  </Pressable>
                )}
              </View>
              <View className="flex-1 ml-4">
                <View className="flex-row items-center">
                  <Text className="text-xl font-sora-bold" style={{ color: colors.text }}>
                    {displayName}
                  </Text>
                </View>
                {userHandle && (
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    @{userHandle}
                  </Text>
                )}
                <View className="flex-row items-center mt-1">
                  <Calendar size={14} color={colors.textSecondary} />
                  <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>
                    My calendar looks like...
                  </Text>
                </View>
                {calendarBio ? (
                  <Text className="text-sm mt-1" style={{ color: colors.text }} numberOfLines={2}>
                    {calendarBio}
                  </Text>
                ) : (
                  <Text className="text-sm mt-1 italic" style={{ color: colors.textTertiary }}>
                    Not set yet
                  </Text>
                )}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Monthly Recap Button (Spotify Wrapped style) */}
        {monthlyRecapData && monthlyRecapData.totalEvents > 0 && (
          <Animated.View entering={FadeInDown.delay(25).springify()}>
            <MonthlyRecapButton
              data={monthlyRecapData}
              onPress={() => setShowMonthlyRecap(true)}
            />
          </Animated.View>
        )}

        {/* Stats Overview */}
        <Animated.View entering={FadeInDown.delay(50).springify()} className="mb-4">
          <View className="flex-row">
            {/* Hosted Events */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/calendar");
              }}
              className="flex-1 rounded-xl p-4 mr-2 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-3xl font-bold" style={{ color: themeColor }}>
                  {stats?.hostedCount ?? 0}
                </Text>
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: themeColor + "20" }}>
                  <Star size={16} color={themeColor} />
                </View>
              </View>
              <Text className="text-sm font-medium" style={{ color: colors.text }}>Hosted</Text>
              <Text className="text-xs" style={{ color: colors.textTertiary }}>events</Text>
            </Pressable>

            {/* Attended Events */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="flex-1 rounded-xl p-4 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-3xl font-bold" style={{ color: "#4ECDC4" }}>
                  {stats?.attendedCount ?? 0}
                </Text>
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: "#4ECDC420" }}>
                  <Heart size={16} color="#4ECDC4" />
                </View>
              </View>
              <Text className="text-sm font-medium" style={{ color: colors.text }}>Attended</Text>
              <Text className="text-xs" style={{ color: colors.textTertiary }}>events</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Streak Counter - Full Width */}
        {(stats?.currentStreak ?? 0) > 0 && (
          <Animated.View entering={FadeInDown.delay(75).springify()} className="mb-4">
            <StreakCounter
              currentStreak={stats?.currentStreak ?? 0}
              longestStreak={stats?.currentStreak ?? 0}
              totalHangouts={stats?.attendedCount ?? 0}
            />
          </Animated.View>
        )}

        {/* Event Types Breakdown */}
        {stats?.categoryBreakdown && Object.keys(stats.categoryBreakdown).length > 0 && (
          <Animated.View entering={FadeInDown.delay(100).springify()} className="mb-4">
            <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              Types of Events Hosted
            </Text>
            <View className="rounded-xl p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <View className="flex-row flex-wrap">
                {Object.entries(stats.categoryBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, count]) => {
                    const catInfo = getCategoryInfo(category);
                    return (
                      <View
                        key={category}
                        className="flex-row items-center mr-4 mb-2 px-3 py-1.5 rounded-full"
                        style={{ backgroundColor: catInfo.color + "20" }}
                      >
                        <Text className="text-base mr-1">{catInfo.emoji}</Text>
                        <Text className="text-sm font-medium" style={{ color: catInfo.color }}>
                          {count}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            </View>
          </Animated.View>
        )}

        {/* Top 3 Friends */}
        {topFriends.length > 0 && (
          <Animated.View entering={FadeInDown.delay(150).springify()} className="mb-4">
            <View className="flex-row items-center mb-2">
              <Heart size={16} color="#FF6B6B" />
              <Text className="text-sm font-medium ml-2" style={{ color: colors.textSecondary }}>
                Top Friends
              </Text>
            </View>
            <View className="rounded-xl p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              {topFriends.map((friend, index) => (
                <View
                  key={friend.id}
                  className={`flex-row items-center ${index < topFriends.length - 1 ? "mb-3 pb-3 border-b" : ""}`}
                  style={{ borderBottomColor: colors.border }}
                >
                  <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: index === 0 ? "#FFD70030" : index === 1 ? "#C0C0C030" : "#CD7F3230" }}>
                    <Text className="text-lg">{index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}</Text>
                  </View>
                  <View className="w-10 h-10 rounded-full mr-3 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                    {friend.image ? (
                      <Image source={{ uri: friend.image }} className="w-full h-full" />
                    ) : (
                      <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor + "20" }}>
                        <Text style={{ color: themeColor }} className="text-sm font-medium">
                          {friend.name?.[0] ?? "?"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold" style={{ color: colors.text }}>
                      {friend.name ?? "Unknown"}
                    </Text>
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>
                      {friend.eventsCount} events together
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Achievements */}
        <Animated.View entering={FadeInDown.delay(200).springify()} className="mb-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/achievements");
            }}
          >
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <Trophy size={16} color="#FFD700" />
                <Text className="text-sm font-medium ml-2" style={{ color: colors.textSecondary }}>
                  Achievements
                </Text>
                <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FFD70020" }}>
                  <Text className="text-xs font-medium" style={{ color: "#FFD700" }}>
                    {unlockedAchievements.length}/{achievements.length}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <Text className="text-sm mr-1" style={{ color: themeColor }}>View All</Text>
                <ChevronRight size={16} color={themeColor} />
              </View>
            </View>
            <View className="rounded-xl p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              {achievements.length === 0 ? (
                <Text className="text-center py-4" style={{ color: colors.textTertiary }}>
                  Start hosting events to unlock achievements!
                </Text>
              ) : (
                <View>
                  {/* Top row: first 4-5 achievements */}
                  <View className="flex-row flex-wrap">
                    {achievements.slice(0, 5).map((achievement) => (
                      <View
                        key={achievement.id}
                        className="items-center mb-2 mr-3"
                        style={{ opacity: achievement.unlocked ? 1 : 0.4 }}
                      >
                        <View
                          className="w-11 h-11 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: achievement.unlocked ? achievement.tierColor + "30" : colors.surface,
                            borderWidth: achievement.unlocked ? 2 : 1,
                            borderColor: achievement.unlocked ? achievement.tierColor : colors.border,
                          }}
                        >
                          <Text className="text-lg">{achievement.emoji}</Text>
                        </View>
                      </View>
                    ))}
                    {achievements.length > 5 && (
                      <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                        <Text className="text-xs font-medium" style={{ color: colors.textTertiary }}>
                          +{achievements.length - 5}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Tip */}
                  <View className="mt-3 pt-3 border-t flex-row items-center" style={{ borderTopColor: colors.border }}>
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>
                      Tap to select a badge for your profile
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </Pressable>
        </Animated.View>

        {/* Quick Stats Row */}
        <Animated.View entering={FadeInDown.delay(250).springify()} className="mb-4">
          <View className="flex-row">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/friends");
              }}
              className="flex-1 rounded-xl p-4 border items-center"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center">
                <Users size={18} color="#4ECDC4" />
                <Text className="text-2xl font-bold ml-2 text-teal-500">{friendsCount}</Text>
              </View>
              <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>Friends</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Monthly Recap Modal */}
      {monthlyRecapData && (
        <MonthlyRecap
          data={monthlyRecapData}
          visible={showMonthlyRecap}
          onClose={() => setShowMonthlyRecap(false)}
        />
      )}

      <BottomNavigation />
    </SafeAreaView>
  );
}
