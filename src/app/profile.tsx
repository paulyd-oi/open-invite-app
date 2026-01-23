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
  Crown,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import BottomNavigation from "@/components/BottomNavigation";
import { StreakCounter } from "@/components/StreakCounter";
import { MonthlyRecap, MonthlyRecapButton, type MonthlyRecapData } from "@/components/MonthlyRecap";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { api } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { useTheme } from "@/lib/ThemeContext";
import { resolveImageUrl } from "@/lib/imageUrl";
import { getProfileDisplay, getProfileInitial } from "@/lib/profileDisplay";
import { getImageSource } from "@/lib/imageSource";
import { useEntitlements, isPro } from "@/lib/entitlements";
import {
  type GetGroupsResponse,
  type GetFriendsResponse,
  type GetProfileResponse,
  type GetProfilesResponse,
  type FriendGroup,
  type Friendship,
  type GetEventsResponse,
  type GetProfileStatsResponse,
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
  const { status: bootStatus, retry: retryBootstrap } = useBootAuthority();

  // Entitlements for premium badge
  const { data: entitlements } = useEntitlements();
  const userIsPremium = isPro(entitlements);

  // Timeout for graceful degraded mode when loading takes too long
  const isBootLoading = bootStatus === 'loading';
  const { isTimedOut, reset: resetTimeout } = useLoadingTimeout(isBootLoading, { timeout: 3000 });
  const [isRetrying, setIsRetrying] = useState(false);

  // Handle retry from timeout UI
  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    resetTimeout();
    retryBootstrap();
    setTimeout(() => setIsRetrying(false), 1500);
  }, [resetTimeout, retryBootstrap]);

  // Avatar source with auth headers
  const [avatarSource, setAvatarSource] = useState<{ uri: string; headers?: { Authorization: string } } | null>(null);

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

  // Load avatar source with auth headers
  useEffect(() => {
    const loadAvatar = async () => {
      const { avatarUri } = getProfileDisplay({ profileData, session });
      const source = await getImageSource(avatarUri);
      setAvatarSource(source);
    };
    loadAvatar();
  }, [profileData, session]);

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
        // Also invalidate session to get updated user image
        queryClient.invalidateQueries({ queryKey: ["session"] }),
      ]);
    } catch (error) {
      console.error("Error refreshing profile:", error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfiles, refetchProfile, refetchFriends, refetchEvents, refetchStats, queryClient]);

  const friends = (friendsData?.friends ?? []).filter(f => f.friend != null);
  const eventsCount = eventsData?.events?.length ?? 0;
  const friendsCount = friends.length;
  const calendarBio = profileData?.profile?.calendarBio;

  // Stats data
  const stats = statsData?.stats;
  const topFriends = statsData?.topFriends ?? [];

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
    // If loading has timed out, show user-friendly timeout UI with escape routes
    if (isTimedOut || bootStatus === 'error') {
      return (
        <LoadingTimeoutUI
          context="profile"
          onRetry={handleRetry}
          isRetrying={isRetrying}
          showBottomNav={true}
        />
      );
    }

    // Still within timeout window - show minimal loading state with navigation
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Loading profile...</Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  // Derive user safely - user may be null/undefined in some auth states
  const user = session?.user ?? null;

  // Use shared helper for consistent precedence across app
  const { displayName } = getProfileDisplay({
    profileData,
    session,
    fallbackName: "Account",
    includeEmailPrefix: true,
  });

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
        {/* Profile Card - Premium users get gold border */}
        <Animated.View entering={FadeInDown.delay(0).springify()}>
          <View 
            className="rounded-2xl p-5 border mb-4" 
            style={{ 
              backgroundColor: colors.surface, 
              borderColor: userIsPremium ? "#FFD700" : colors.border,
              borderWidth: userIsPremium ? 2 : 1,
            }}
          >
            <View className="flex-row items-center">
              <View className="relative">
                <View className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden">
                  {avatarSource ? (
                    <Image source={avatarSource} className="w-full h-full" />
                  ) : (
                    <View className="w-full h-full items-center justify-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFEDD5" }}>
                      <Text className="text-2xl font-bold" style={{ color: themeColor }}>
                        {getProfileInitial({ profileData, session })}
                      </Text>
                    </View>
                  )}
                </View>
                {/* Premium badge on avatar */}
                {userIsPremium && (
                  <View 
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full items-center justify-center"
                    style={{ backgroundColor: "#FFD700" }}
                  >
                    <Crown size={12} color="#FFFFFF" />
                  </View>
                )}
              </View>
              <View className="flex-1 ml-4">
                <View className="flex-row items-center">
                  <Text className="text-xl font-sora-bold" style={{ color: colors.text }}>
                    {displayName}
                  </Text>
                  {/* Premium badge next to name */}
                  {userIsPremium && (
                    <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FFD70020" }}>
                      <Text className="text-xs font-semibold" style={{ color: "#B8860B" }}>PRO</Text>
                    </View>
                  )}
                </View>
                {userHandle && (
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    @{userHandle}
                  </Text>
                )}
                {/* User Badges */}
                {profileData?.badges && profileData.badges.length > 0 && (
                  <View className="flex-row flex-wrap gap-1.5 mt-2">
                    {profileData.badges.map((badge) => (
                      <View
                        key={badge.achievementId}
                        className="px-2 py-1 rounded-full flex-row items-center"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
                      >
                        <Text className="text-xs">{badge.emoji}</Text>
                        <Text className="text-xs font-medium ml-1" style={{ color: colors.text }}>
                          {badge.name}
                        </Text>
                      </View>
                    ))}
                  </View>
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
                    Coming Soon
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <Text className="text-sm mr-1" style={{ color: themeColor }}>View All</Text>
                <ChevronRight size={16} color={themeColor} />
              </View>
            </View>
            <View className="rounded-xl p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <Text className="text-center py-4" style={{ color: colors.textTertiary }}>
                Coming Soon
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        {/* Social Insights - Premium Feature */}
        <Animated.View entering={FadeInDown.delay(225).springify()} className="mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <Flame size={16} color="#FF6B4A" />
              <Text className="text-sm font-medium ml-2" style={{ color: colors.textSecondary }}>
                Social Insights
              </Text>
              {!userIsPremium && (
                <View className="ml-2 px-2 py-0.5 rounded-full flex-row items-center" style={{ backgroundColor: "#FFD70020" }}>
                  <Crown size={10} color="#B8860B" />
                  <Text className="text-xs font-medium ml-1" style={{ color: "#B8860B" }}>PRO</Text>
                </View>
              )}
            </View>
          </View>
          <View 
            className="rounded-xl p-4 border" 
            style={{ 
              backgroundColor: colors.surface, 
              borderColor: userIsPremium ? colors.border : "#FFD70040",
              borderWidth: userIsPremium ? 1 : 1.5,
            }}
          >
            {userIsPremium ? (
              // Unlocked content for premium users
              <View>
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="font-medium" style={{ color: colors.text }}>Activity Score</Text>
                  <Text className="text-lg font-bold" style={{ color: themeColor }}>
                    {Math.min(100, (stats?.hostedCount ?? 0) * 10 + (stats?.attendedCount ?? 0) * 5)}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="font-medium" style={{ color: colors.text }}>Social Reach</Text>
                  <Text className="text-lg font-bold" style={{ color: "#4ECDC4" }}>
                    {friendsCount * 2 + (stats?.hostedCount ?? 0)}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="font-medium" style={{ color: colors.text }}>Host Ratio</Text>
                  <Text className="text-lg font-bold" style={{ color: "#FF6B4A" }}>
                    {stats?.hostedCount && stats?.attendedCount 
                      ? Math.round((stats.hostedCount / (stats.hostedCount + stats.attendedCount)) * 100) 
                      : 0}%
                  </Text>
                </View>
              </View>
            ) : (
              // Locked content for free users
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/paywall");
                }}
                className="items-center py-4"
              >
                <View 
                  className="w-12 h-12 rounded-full items-center justify-center mb-3"
                  style={{ backgroundColor: "#FFD70020" }}
                >
                  <Crown size={24} color="#FFD700" />
                </View>
                <Text className="font-semibold mb-1" style={{ color: colors.text }}>
                  Unlock Social Insights
                </Text>
                <Text className="text-sm text-center mb-3" style={{ color: colors.textSecondary }}>
                  See your activity score, social reach, and hosting patterns
                </Text>
                <View className="px-4 py-2 rounded-full" style={{ backgroundColor: themeColor }}>
                  <Text className="text-white font-medium text-sm">Upgrade to Pro</Text>
                </View>
              </Pressable>
            )}
          </View>
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
