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

import { normalizeFeaturedBadge } from "@/lib/normalizeBadge";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { getProfileDisplay, getProfileInitial } from "@/lib/profileDisplay";
import { getImageSource } from "@/lib/imageSource";
import { useIsPro } from "@/lib/entitlements";

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
} from "@/ui/icons";

/**
 * INVARIANT:
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
    enabled: bootStatus === "authed",
  });

  const { data: profileData, refetch: refetchProfile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<GetProfileResponse>("/api/profile"),
    enabled: bootStatus === "authed",
  });

  const { data: friendsData, refetch: refetchFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: bootStatus === "authed",
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: bootStatus === "authed",
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["profileStats"],
    queryFn: () => api.get<GetProfileStatsResponse>("/api/profile/stats"),
    enabled: bootStatus === "authed",
  });

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

  // Avatar
  const [avatarSource, setAvatarSource] = useState<any>(null);

  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const safeUri =
          typeof profileDisplay.avatarUri === "string"
            ? profileDisplay.avatarUri
            : undefined;

        const source = await getImageSource(safeUri);
        setAvatarSource(source ?? null);
      } catch {
        setAvatarSource(null);
      }
    };
    loadAvatar();
  }, [profileDisplay.avatarUri]);

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

  // Badge modal
  const [selectedBadge, setSelectedBadge] = useState<any>(null);

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
        {/* Profile Card */}
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
              {/* Avatar */}
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

              {/* Name */}
              <View className="flex-1 ml-4">
                <Text
                  className="text-xl font-sora-bold"
                  style={{ color: colors.text }}
                >
                  {displayName}
                </Text>

                {userHandle && (
                  <Text style={{ color: colors.textSecondary }}>
                    @{StringSafe(userHandle)}
                  </Text>
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

        {/* Stats */}
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <View className="flex-row mb-4">
            <View
              className="flex-1 rounded-xl p-4 mr-2 border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 28, color: themeColor }}>
                {StringSafe(stats?.hostedCount ?? 0)}
              </Text>
              <Text style={{ color: colors.textSecondary }}>Hosted</Text>
            </View>

            <View
              className="flex-1 rounded-xl p-4 border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 28, color: "#4ECDC4" }}>
                {StringSafe(stats?.attendedCount ?? 0)}
              </Text>
              <Text style={{ color: colors.textSecondary }}>Attended</Text>
            </View>
          </View>
        </Animated.View>

        {/* Friends */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Pressable
            onPress={() => router.push("/friends")}
            className="rounded-xl p-4 border items-center mb-6"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Users size={18} color="#4ECDC4" />
            <Text style={{ fontSize: 22, marginTop: 6 }}>
              {StringSafe(friendsCount)}
            </Text>
            <Text style={{ color: colors.textSecondary }}>Friends</Text>
          </Pressable>
        </Animated.View>

        {/* Streak */}
        {(stats?.currentStreak ?? 0) > 0 && (
          <StreakCounter
            currentStreak={stats?.currentStreak ?? 0}
            longestStreak={stats?.currentStreak ?? 0}
            totalHangouts={stats?.attendedCount ?? 0}
          />
        )}
      </ScrollView>

      <BottomNavigation />

      {/* Badge Modal Placeholder */}
      <Modal visible={false} transparent />
    </SafeAreaView>
  );
}