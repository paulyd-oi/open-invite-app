import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Modal,
  RefreshControl,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import BottomNavigation from "@/components/BottomNavigation";
import { StreakCounter } from "@/components/StreakCounter";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { BadgePill } from "@/components/BadgePill";

import { getBadgePillVariantForBadge } from "@/lib/badges";
import { normalizeFeaturedBadge } from "@/lib/normalizeBadge";
import { PROFILE_QUERY_KEY, getFeaturedBadge, BADGE_QUERY_KEYS } from "@/lib/badgesApi";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { getProfileDisplay, getProfileInitial } from "@/lib/profileDisplay";
import { getImageSource } from "@/lib/imageSource";
import { useIsPro } from "@/lib/entitlements";
import { devLog } from "@/lib/devLog";

import {
  type GetFriendsResponse,
  type GetProfileResponse,
  type GetProfilesResponse,
  type GetEventsResponse,
  type GetProfileStatsResponse,
  EVENT_CATEGORIES,
} from "../../shared/contracts";

import {
  Settings,
  Users,
  Calendar,
  Award,
  Star,
  Heart,
  ChevronRight,
  X,
  Crown,
} from "@/ui/icons";

/**
 * INVARIANT: Crash-proof string coercion.
 * Never render unknown values directly inside <Text>.
 * Always coerce via StringSafe().
 */
function StringSafe(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export default function ProfileScreen() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  const [refreshing, setRefreshing] = useState(false);

  const { status: bootStatus, retry: retryBootstrap } = useBootAuthority();

  const { isPro: userIsPremium } = useIsPro();

  // Timeout safety
  const isBootLoading = bootStatus === "loading";
  const { isTimedOut, reset: resetTimeout } = useLoadingTimeout(isBootLoading, {
    timeout: 3000,
  });

  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    resetTimeout();
    retryBootstrap();
    setTimeout(() => setIsRetrying(false), 1500);
  }, [resetTimeout, retryBootstrap]);

  // Avatar source with auth headers
  const [avatarSource, setAvatarSource] = useState<any>(null);

  // Badge modal state
  const [selectedBadge, setSelectedBadge] = useState<{
    achievementId: string;
    name: string;
    description: string | null;
    emoji: string;
    tier: string;
    tierColor: string;
    grantedAt: string;
  } | null>(null);

  // Redirects
  useEffect(() => {
    if (bootStatus === "onboarding") router.replace("/welcome");
    if (bootStatus === "loggedOut" || bootStatus === "error")
      router.replace("/login");
  }, [bootStatus, router]);

  // Queries (authed only)
  const { data: profilesData, refetch: refetchProfiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const { data: profileData, refetch: refetchProfile } = useQuery({
    queryKey: PROFILE_QUERY_KEY as unknown as string[],
    queryFn: () => api.get<GetProfileResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
    refetchOnMount: "always",
  });

  const { data: friendsData, refetch: refetchFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["profileStats"],
    queryFn: () => api.get<GetProfileStatsResponse>("/api/profile/stats"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // [P0_VIEWER_BADGE] Dedicated featured badge query — same pattern as user/[id].tsx
  const viewerUserId = session?.user?.id;
  const { data: viewerBadgeData, refetch: refetchViewerBadge } = useQuery({
    queryKey: BADGE_QUERY_KEYS.featured(viewerUserId!),
    queryFn: () => getFeaturedBadge(viewerUserId!),
    enabled: isAuthedForNetwork(bootStatus, session) && !!viewerUserId,
  });

  // Load avatar source with auth headers (must be after profileData query)
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const { avatarUri } = getProfileDisplay({ profileData, session });
        const safeUri = typeof avatarUri === "string" ? avatarUri : undefined;
        const source = await getImageSource(safeUri);
        setAvatarSource(source ?? null);
      } catch {
        setAvatarSource(null);
      }
    };
    loadAvatar();
  }, [profileData, session]);

  // Pull to refresh
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
        refetchViewerBadge(),
        queryClient.invalidateQueries({ queryKey: ["session"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    refetchProfiles,
    refetchProfile,
    refetchFriends,
    refetchEvents,
    refetchStats,
    refetchViewerBadge,
    queryClient,
  ]);

  // Loading gate
  if (
    bootStatus === "loading" ||
    bootStatus === "loggedOut" ||
    bootStatus === "error" ||
    bootStatus === "onboarding"
  ) {
    if (isTimedOut || bootStatus === "error") {
      return (
        <LoadingTimeoutUI
          context="profile"
          onRetry={handleRetry}
          isRetrying={isRetrying}
          showBottomNav={true}
        />
      );
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>
            Loading profile...
          </Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  // Safe derived values
  const friends = (friendsData?.friends ?? []).filter((f) => f.friend != null);
  const friendsCount = friends.length;

  const stats = statsData?.stats;

  const profileDisplay = getProfileDisplay({
    profileData,
    session,
    fallbackName: "Account",
    includeEmailPrefix: true,
  });

  const displayName = StringSafe(profileDisplay.displayName, "Account");

  const rawHandle =
    session?.user?.handle || profileData?.profile?.handle || "";
  const userHandle =
    typeof rawHandle === "string" && rawHandle.length > 0
      ? rawHandle
      : undefined;

  const rawBio = profileData?.profile?.calendarBio;
  const calendarBio =
    typeof rawBio === "string" && rawBio.length > 0 ? rawBio : undefined;

  // Category helper
  const getCategoryInfo = (category: string) => {
    return (
      EVENT_CATEGORIES.find((c) => c.value === category) ?? {
        emoji: "📅",
        label: "Other",
        color: "#78909C",
      }
    );
  };

  // [P0_VIEWER_BADGE] INVARIANT: Featured badge is derived ONLY from the dedicated
  // featured badge query (BADGE_QUERY_KEYS.featured). NEVER from profileData.
  // If GET /api/profile returns featuredBadge, it is intentionally ignored.
  const featuredBadge = normalizeFeaturedBadge(viewerBadgeData?.badge);

  if (__DEV__) {
    const rawBadge = viewerBadgeData?.badge as Record<string, unknown> | null | undefined;
    devLog("[P0_VIEWER_BADGE] profile render", {
      dataSource: "featuredBadgeQuery",
      viewerUserId: viewerUserId ?? "none",
      queryKey: viewerUserId ? BADGE_QUERY_KEYS.featured(viewerUserId) : "disabled",
      hasData: !!viewerBadgeData,
      badgeKey: rawBadge?.badgeKey ?? rawBadge?.achievementId ?? "none",
      name: rawBadge?.name ?? "none",
      normalized: featuredBadge ?? "null",
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
        <Text
          className="text-3xl font-sora-bold"
          style={{ color: colors.text }}
        >
          Profile
        </Text>

        <Pressable
          onPress={() => router.push("/settings")}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
        >
          <Settings size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColor}
          />
        }
      >
        {/* Profile Card - Premium users get gold border */}
        <Animated.View entering={FadeInDown.springify()}>
          <View
            className="rounded-2xl p-5 border mb-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: userIsPremium ? "#FFD700" : colors.border,
              borderWidth: userIsPremium ? 2 : 1,
            }}
          >
            <View className="flex-row items-center">
              {/* Avatar with premium crown overlay */}
              <View className="relative">
                <View className="w-16 h-16 rounded-full overflow-hidden">
                  {avatarSource ? (
                    <Image source={avatarSource} className="w-full h-full" />
                  ) : (
                    <View
                      className="w-full h-full items-center justify-center"
                      style={{
                        backgroundColor: isDark ? "#2C2C2E" : "#FFEDD5",
                      }}
                    >
                      <Text style={{ color: themeColor, fontSize: 22 }}>
                        {StringSafe(getProfileInitial({ profileData, session }))}
                      </Text>
                    </View>
                  )}
                </View>
                {/* Premium crown on avatar */}
                {userIsPremium && (
                  <View
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full items-center justify-center"
                    style={{ backgroundColor: "#FFD700" }}
                  >
                    <Crown size={12} color="#FFFFFF" />
                  </View>
                )}
              </View>

              {/* Name + Handle + Badge */}
              <View className="flex-1 ml-4">
                <View className="flex-row items-center">
                  <Text
                    className="text-xl font-sora-bold"
                    style={{ color: colors.text }}
                  >
                    {displayName}
                  </Text>
                  {/* PRO pill next to name */}
                  {userIsPremium && (
                    <View
                      className="ml-2 px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#FFD70020" }}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: "#B8860B" }}
                      >
                        PRO
                      </Text>
                    </View>
                  )}
                </View>

                {userHandle && (
                  <Text style={{ color: colors.textSecondary }}>
                    {`@${StringSafe(userHandle)}`}
                  </Text>
                )}

                {/* Featured Badge */}
                {featuredBadge && (
                  <View className="mt-2">
                    <BadgePill
                      name={StringSafe(featuredBadge.name)}
                      tierColor={StringSafe(featuredBadge.tierColor, "#78909C")}
                      size="medium"
                      variant={getBadgePillVariantForBadge(featuredBadge)}
                    />
                  </View>
                )}

                {/* Bio */}
                <View className="flex-row items-center mt-2">
                  <Calendar size={14} color={colors.textSecondary} />
                  <Text
                    className="ml-2 text-sm"
                    style={{ color: colors.textSecondary }}
                  >
                    My calendar looks like...
                  </Text>
                </View>

                <Text style={{ marginTop: 4, color: colors.text }}>
                  {calendarBio ? StringSafe(calendarBio) : "Not set yet"}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

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
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text
                  className="text-3xl font-bold"
                  style={{ color: themeColor }}
                >
                  {StringSafe(stats?.hostedCount ?? 0)}
                </Text>
                <View
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${themeColor}20` }}
                >
                  <Star size={16} color={themeColor} />
                </View>
              </View>
              <Text className="text-sm font-medium" style={{ color: colors.text }}>
                Hosted
              </Text>
              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                events
              </Text>
            </Pressable>

            {/* Attended Events - Info display only (no action/navigation target exists) */}
            <View
              className="flex-1 rounded-xl p-4 border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-3xl font-bold" style={{ color: "#4ECDC4" }}>
                  {StringSafe(stats?.attendedCount ?? 0)}
                </Text>
                <View
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: "#4ECDC420" }}
                >
                  <Heart size={16} color="#4ECDC4" />
                </View>
              </View>
              <Text className="text-sm font-medium" style={{ color: colors.text }}>
                Attended
              </Text>
              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                events
              </Text>
            </View>
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
        {stats?.categoryBreakdown &&
          Object.keys(stats.categoryBreakdown).length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(100).springify()}
              className="mb-4"
            >
              <Text
                className="text-sm font-medium mb-2"
                style={{ color: colors.textSecondary }}
              >
                Types of Events Hosted
              </Text>
              <View
                className="rounded-xl p-4 border"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View className="flex-row flex-wrap">
                  {Object.entries(stats.categoryBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, count]) => {
                      const catInfo = getCategoryInfo(category);
                      return (
                        <View
                          key={category}
                          className="flex-row items-center mr-4 mb-2 px-3 py-1.5 rounded-full"
                          style={{ backgroundColor: `${catInfo.color}20` }}
                        >
                          <Text className="text-base mr-1">
                            {StringSafe(catInfo.emoji)}
                          </Text>
                          <Text
                            className="text-sm font-medium"
                            style={{ color: catInfo.color }}
                          >
                            {StringSafe(count)}
                          </Text>
                        </View>
                      );
                    })}
                </View>
              </View>
            </Animated.View>
          )}

        {/* Badges - INVARIANT: Use Award icon, NOT Trophy */}
        <Animated.View entering={FadeInDown.delay(150).springify()} className="mb-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/achievements");
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Award size={16} color="#FFD700" />
                <Text
                  className="text-sm font-medium ml-2"
                  style={{ color: colors.textSecondary }}
                >
                  Badges
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-sm mr-1" style={{ color: themeColor }}>
                  View All
                </Text>
                <ChevronRight size={16} color={themeColor} />
              </View>
            </View>
          </Pressable>
        </Animated.View>

        {/* Quick Stats Row - Friends */}
        <Animated.View entering={FadeInDown.delay(200).springify()} className="mb-4">
          <View className="flex-row">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/friends");
              }}
              className="flex-1 rounded-xl p-4 border items-center"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center">
                <Users size={18} color="#4ECDC4" />
                <Text className="text-2xl font-bold ml-2" style={{ color: "#4ECDC4" }}>
                  {StringSafe(friendsCount)}
                </Text>
              </View>
              <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                Friends
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Badge Details Modal */}
      <Modal
        visible={selectedBadge !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center"
          onPress={() => setSelectedBadge(null)}
        >
          <Pressable
            className="rounded-2xl p-6 mx-6 w-80 max-w-full"
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: colors.surface }}
          >
            <Pressable
              className="absolute top-4 right-4 w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              onPress={() => setSelectedBadge(null)}
            >
              <X size={16} color={colors.textSecondary} />
            </Pressable>
            {selectedBadge && (
              <View className="items-center">
                <Text className="text-5xl mb-3">
                  {StringSafe(selectedBadge.emoji)}
                </Text>
                <Text
                  className="text-xl font-sora-bold text-center mb-2"
                  style={{ color: colors.text }}
                >
                  {StringSafe(selectedBadge.name)}
                </Text>
                <View
                  className="px-3 py-1 rounded-full mb-4"
                  style={{
                    backgroundColor: `${StringSafe(selectedBadge.tierColor, "#78909C")}20`,
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: StringSafe(selectedBadge.tierColor, "#78909C") }}
                  >
                    {StringSafe(selectedBadge.tier)}
                  </Text>
                </View>
                <Text
                  className="text-sm text-center"
                  style={{ color: colors.textSecondary }}
                >
                  {StringSafe(selectedBadge.description, "A special achievement badge.")}
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <BottomNavigation />
    </SafeAreaView>
  );
}