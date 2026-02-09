import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Share,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import BottomNavigation from "@/components/BottomNavigation";
import { StreakCounter } from "@/components/StreakCounter";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { api } from "@/lib/api";
import { eventKeys } from "@/lib/eventQueryKeys";
import { circleKeys } from "@/lib/circleQueryKeys";
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
  type GetCirclesResponse,
  EVENT_CATEGORIES,
} from "../../shared/contracts";

import {
  Settings,
  Users,
  Calendar,
  Star,
  Heart,
  ChevronRight,
  Crown,
  Share2,
  Pencil,
  Plus,
  UserPlus,
  Layers,
  Flame,
  Clock,
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
    queryKey: ["profile"],
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
    queryKey: eventKeys.myEvents(),
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["profileStats"],
    queryFn: () => api.get<GetProfileStatsResponse>("/api/profile/stats"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const { data: circlesData, refetch: refetchCircles } = useQuery({
    queryKey: circleKeys.all(),
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: isAuthedForNetwork(bootStatus, session),
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
        refetchCircles(),
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
    refetchCircles,
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
  const circlesCount = circlesData?.circles?.length ?? 0;

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

  // ── What's Next derivation (SSOT from existing queries) ──
  const allEvents = eventsData?.events ?? [];
  const now = new Date();

  const upcomingEvent = useMemo(() => {
    return allEvents
      .filter((e) => new Date(e.startTime) > now && e.userId === session?.user?.id)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, session?.user?.id]);

  const pendingInvites = useMemo(() => {
    return allEvents.filter(
      (e) =>
        e.viewerRsvpStatus === null &&
        e.userId !== session?.user?.id &&
        new Date(e.startTime) > now,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, session?.user?.id]);

  // PROFILE_NEXT_MODE_INVARIANT: exactly one mode renders
  const nextMode: "upcoming" | "pending" | "empty" = upcomingEvent
    ? "upcoming"
    : pendingInvites.length > 0
    ? "pending"
    : "empty";

  // [P0_PROFILE_NEXT] DEV proof log
  if (__DEV__) {
    devLog("[P0_PROFILE_NEXT]", {
      mode: nextMode,
      hasUpcoming: !!upcomingEvent,
      pendingCount: pendingInvites.length,
      totalEvents: allEvents.length,
    });
  }

  // ── Recent Activity derivation (SSOT from existing events query) ──
  const recentActivity = useMemo(() => {
    const userId = session?.user?.id;
    if (!userId) return [];
    return allEvents
      .filter((e) => new Date(e.startTime) <= now)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        title: e.title,
        emoji: e.emoji || "📅",
        type: e.userId === userId ? "hosted" : "joined",
        date: new Date(e.startTime),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, session?.user?.id]);

  // [P0_PROFILE_ACTIVITY] DEV proof log
  if (__DEV__) {
    devLog("[P0_PROFILE_ACTIVITY]", {
      count: recentActivity.length,
      source: "eventsData",
    });
  }

  // ── Share handler ──
  const handleShareProfile = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // [P2_PROFILE_SHARE] DEV proof log
    if (__DEV__) devLog("[P2_PROFILE_SHARE]", { trigger: "profileCard" });
    try {
      const handle = userHandle ? `@${userHandle}` : displayName;
      await Share.share({
        message: `Join ${handle} on Open Invite — turning plans into memories.\n\nhttps://apps.apple.com/app/open-invite`,
      });
    } catch {
      // user cancelled
    }
  }, [userHandle, displayName]);

  // ── Time formatting helper ──
  const formatRelativeTime = (date: Date) => {
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (hours < 1) return "Soon";
    if (hours < 24) return `In ${hours}h`;
    if (days === 1) return "Tomorrow";
    return `In ${days} days`;
  };

  const formatPastDate = (date: Date) => {
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  // ── Highlights derivation (SSOT: pure function of existing query data) ──
  // HIGHLIGHTS_PURE_DERIVATION: all chips derive exclusively from existing query data
  // HIGHLIGHTS_DETERMINISTIC: same input data → same chip output
  // HIGHLIGHTS_NO_GAMIFICATION: this section is identity-only, no reward system
  type HighlightChip = { type: string; emoji: string; label: string; color: string };

  const highlightChips = useMemo((): HighlightChip[] => {
    const chips: HighlightChip[] = [];

    // 1. Top Event Type — from categoryBreakdown
    const breakdown = stats?.categoryBreakdown;
    if (breakdown && Object.keys(breakdown).length > 0) {
      const [topCat] = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0];
      const catInfo = EVENT_CATEGORIES.find((c) => c.value === topCat);
      if (catInfo) {
        chips.push({
          type: "topEventType",
          emoji: catInfo.emoji,
          label: `${catInfo.label} fan`,
          color: catInfo.color,
        });
      }
    }

    // 2. Most Active Day — from event timestamps
    if (allEvents.length >= 3) {
      const dayCounts: Record<number, number> = {};
      for (const e of allEvents) {
        const day = new Date(e.startTime).getDay();
        dayCounts[day] = (dayCounts[day] ?? 0) + 1;
      }
      const topDay = Object.entries(dayCounts).sort(
        (a, b) => Number(b[1]) - Number(a[1]),
      )[0];
      if (topDay) {
        const dayNum = Number(topDay[0]);
        const isWeekend = dayNum === 0 || dayNum === 6;
        chips.push({
          type: "mostActiveDay",
          emoji: isWeekend ? "🌅" : "📆",
          label: isWeekend ? "Weekend planner" : "Weekday warrior",
          color: isWeekend ? "#E67E22" : "#3498DB",
        });
      }
    }

    // 3. Top Circle — from circles data (best-effort, first by member count)
    const circles = circlesData?.circles;
    if (circles && circles.length > 0) {
      const topCircle = [...circles].sort(
        (a, b) => (b.members?.length ?? 0) - (a.members?.length ?? 0),
      )[0];
      if (topCircle) {
        chips.push({
          type: "topCircle",
          emoji: topCircle.emoji || "👥",
          label: topCircle.name,
          color: "#9B59B6",
        });
      }
    }

    // 4. Consistency — from currentStreak
    const streak = stats?.currentStreak ?? 0;
    if (streak >= 2) {
      chips.push({
        type: "streak",
        emoji: streak >= 7 ? "🔥" : "⚡",
        label: `${streak}-week streak`,
        color: streak >= 7 ? "#E74C3C" : "#F39C12",
      });
    }

    // 5. Social butterfly — from friends count
    if (friendsCount >= 10) {
      chips.push({
        type: "socialButterfly",
        emoji: "🦋",
        label: `${friendsCount} friends`,
        color: "#4ECDC4",
      });
    }

    return chips.slice(0, 5);
  }, [
    stats?.categoryBreakdown,
    stats?.currentStreak,
    allEvents,
    circlesData?.circles,
    friendsCount,
  ]);

  // [P0_PROFILE_HIGHLIGHTS] DEV proof log
  if (__DEV__) {
    devLog("[P0_PROFILE_HIGHLIGHTS]", {
      chipCount: highlightChips.length,
      chipTypes: highlightChips.map((c) => c.type),
    });
  }

  // ── P2 empty-state tracking ──
  const emptyStates: string[] = [];
  if (nextMode === "empty") emptyStates.push("whatsNext");
  if (recentActivity.length === 0) emptyStates.push("recentActivity");
  // Highlights hides entirely when empty — confirmed correct behavior
  if (highlightChips.length === 0) emptyStates.push("highlights");

  // [P2_PROFILE_EMPTY] DEV proof log
  if (__DEV__) {
    devLog("[P2_PROFILE_EMPTY]", { rendered: emptyStates });
  }

  // MOTION_STABILITY: mount-once guard — animations only fire on initial mount
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (__DEV__) devLog("[P2_PROFILE_MOTION]", { mounted: true });
    }
  }, []);

  // Share button press scale (P2 polish)
  const shareScale = useSharedValue(1);
  const shareAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shareScale.value }],
  }));

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
        {/* ═══ Profile Identity Card ═══ */}
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

              {/* Name + Handle */}
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

                {/* Bio */}
                <View className="flex-row items-center mt-2">
                  <Calendar size={14} color={colors.textSecondary} />
                  <Text
                    className="ml-2 text-sm"
                    style={{ color: colors.textSecondary }}
                  >
                    {calendarBio ? StringSafe(calendarBio) : "Not set yet"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Edit / Share CTAs */}
            <View className="flex-row mt-4 pt-3 border-t" style={{ borderColor: colors.border }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/settings");
                }}
                className="flex-1 flex-row items-center justify-center py-2 rounded-lg mr-2"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <Pencil size={14} color={colors.textSecondary} />
                <Text className="ml-1.5 text-sm font-medium" style={{ color: colors.text }}>
                  Edit
                </Text>
              </Pressable>
              <Animated.View style={[{ flex: 1, marginLeft: 8 }, shareAnimatedStyle]}>
                <Pressable
                  onPressIn={() => { shareScale.value = withTiming(0.95, { duration: 100 }); }}
                  onPressOut={() => { shareScale.value = withTiming(1, { duration: 150 }); }}
                  onPress={handleShareProfile}
                  className="flex-row items-center justify-center py-2 rounded-lg"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Share2 size={14} color={colors.textSecondary} />
                  <Text className="ml-1.5 text-sm font-medium" style={{ color: colors.text }}>
                    Share
                  </Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </Animated.View>

        {/* ═══ What's Next Card ═══ */}
        <Animated.View entering={FadeInDown.delay(50).springify()} className="mb-4">
          <View
            className="rounded-2xl p-4 border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Text className="text-xs font-semibold mb-3" style={{ color: colors.textTertiary }}>
              WHAT&apos;S NEXT
            </Text>

            {nextMode === "upcoming" && upcomingEvent && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/event/${upcomingEvent.id}`);
                }}
                className="flex-row items-center"
              >
                <View
                  className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                  style={{ backgroundColor: `${themeColor}15` }}
                >
                  <Text className="text-lg">{upcomingEvent.emoji || "📅"}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                    {StringSafe(upcomingEvent.title)}
                  </Text>
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    {formatRelativeTime(new Date(upcomingEvent.startTime))}
                  </Text>
                </View>
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: `${themeColor}15` }}
                >
                  <Text className="text-sm font-medium" style={{ color: themeColor }}>View</Text>
                </View>
              </Pressable>
            )}

            {nextMode === "pending" && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/calendar");
                }}
                className="flex-row items-center"
              >
                <View
                  className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                  style={{ backgroundColor: "#FF950015" }}
                >
                  <Clock size={20} color="#FF9500" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold" style={{ color: colors.text }}>
                    {pendingInvites.length} pending {pendingInvites.length === 1 ? "invite" : "invites"}
                  </Text>
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    Waiting for your response
                  </Text>
                </View>
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: "#FF950015" }}
                >
                  <Text className="text-sm font-medium" style={{ color: "#FF9500" }}>Respond</Text>
                </View>
              </Pressable>
            )}

            {nextMode === "empty" && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/create");
                }}
                className="flex-row items-center"
              >
                <View
                  className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                  style={{ backgroundColor: `${themeColor}15` }}
                >
                  <Plus size={20} color={themeColor} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold" style={{ color: colors.text }}>
                    Nothing planned — start something
                  </Text>
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    Your next hangout is one tap away
                  </Text>
                </View>
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: `${themeColor}15` }}
                >
                  <Text className="text-sm font-medium" style={{ color: themeColor }}>Create</Text>
                </View>
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* ═══ Quick Actions ═══ */}
        <Animated.View entering={FadeInDown.delay(75).springify()} className="mb-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[
              { label: "Create Event", icon: Plus, color: themeColor, route: "/create" as const },
              { label: "Invite Friend", icon: UserPlus, color: "#4ECDC4", route: "/invite" as const },
              { label: "New Group", icon: Layers, color: "#F39C12", route: "/friends" as const },
              { label: calendarBio ? "Edit Profile" : "Add Bio", icon: Pencil, color: "#9B59B6", route: "/settings" as const },
            ].map((action, i) => (
              <Pressable
                key={action.label}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(action.route);
                }}
                className="flex-row items-center px-4 py-2.5 rounded-full border mr-2"
                style={{
                  backgroundColor: `${action.color}10`,
                  borderColor: `${action.color}30`,
                }}
              >
                <action.icon size={16} color={action.color} />
                <Text className="ml-1.5 text-sm font-medium" style={{ color: action.color }}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        {/* ═══ Highlights ═══ */}
        {highlightChips.length > 0 && (
          <Animated.View entering={FadeInDown.delay(88).springify()} className="mt-1 mb-5">
            <Text className="text-xs font-semibold mb-2.5" style={{ color: colors.textTertiary }}>
              HIGHLIGHTS
            </Text>
            <View
              className="rounded-xl px-3 py-3 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {highlightChips.map((chip, idx) => (
                  <Animated.View
                    key={chip.type}
                    entering={FadeIn.delay(idx * 30).duration(250)}
                  >
                    <View
                      className="flex-row items-center px-3.5 py-2 rounded-full border mr-2"
                      style={{
                        backgroundColor: `${chip.color}10`,
                        borderColor: `${chip.color}25`,
                      }}
                    >
                      <Text className="text-sm mr-1.5">{chip.emoji}</Text>
                      <Text className="text-sm font-medium" style={{ color: chip.color }}>
                        {StringSafe(chip.label)}
                      </Text>
                    </View>
                  </Animated.View>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        )}

        {/* ═══ Momentum (Streak) ═══ */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="mb-4">
          <StreakCounter
            currentStreak={stats?.currentStreak ?? 0}
            longestStreak={stats?.currentStreak ?? 0}
            totalHangouts={stats?.attendedCount ?? 0}
          />
        </Animated.View>

        {/* ═══ Social Snapshot (2×2 grid) ═══ */}
        <Animated.View entering={FadeInDown.delay(125).springify()} className="mb-4">
          <Text className="text-xs font-semibold mb-2" style={{ color: colors.textTertiary }}>
            SOCIAL SNAPSHOT
          </Text>
          <View className="flex-row mb-2">
            {/* Friends */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/friends");
              }}
              className="flex-1 rounded-xl p-4 mr-1 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-2xl font-bold" style={{ color: "#4ECDC4" }}>
                  {StringSafe(friendsCount)}
                </Text>
                <Users size={16} color="#4ECDC4" />
              </View>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>Friends</Text>
            </Pressable>
            {/* Circles */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/friends");
              }}
              className="flex-1 rounded-xl p-4 ml-1 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-2xl font-bold" style={{ color: "#F39C12" }}>
                  {StringSafe(circlesCount)}
                </Text>
                <Layers size={16} color="#F39C12" />
              </View>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>Groups</Text>
            </Pressable>
          </View>
          <View className="flex-row">
            {/* Hosted */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/calendar");
              }}
              className="flex-1 rounded-xl p-4 mr-1 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-2xl font-bold" style={{ color: themeColor }}>
                  {StringSafe(stats?.hostedCount ?? 0)}
                </Text>
                <Star size={16} color={themeColor} />
              </View>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>Hosted</Text>
            </Pressable>
            {/* Attended */}
            <View
              className="flex-1 rounded-xl p-4 ml-1 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-2xl font-bold" style={{ color: "#4ECDC4" }}>
                  {StringSafe(stats?.attendedCount ?? 0)}
                </Text>
                <Heart size={16} color="#4ECDC4" />
              </View>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>Attended</Text>
            </View>
          </View>
        </Animated.View>

        {/* ═══ Event Types Breakdown ═══ */}
        {stats?.categoryBreakdown &&
          Object.keys(stats.categoryBreakdown).length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(150).springify()}
              className="mb-4"
            >
              <Text
                className="text-xs font-semibold mb-2"
                style={{ color: colors.textTertiary }}
              >
                EVENT TYPES
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

        {/* ═══ Recent Activity ═══ */}
        <Animated.View entering={FadeInDown.delay(175).springify()} className="mb-4">
          <Text className="text-xs font-semibold mb-2" style={{ color: colors.textTertiary }}>
            RECENT ACTIVITY
          </Text>
          <View
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            {recentActivity.length > 0 ? (
              recentActivity.map((item, index) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/event/${item.id}`);
                  }}
                  className="flex-row items-center px-4 py-3"
                  style={index < recentActivity.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}
                >
                  <Text className="text-lg mr-3">{item.emoji}</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-medium" style={{ color: colors.text }} numberOfLines={1}>
                      {item.type === "hosted" ? "Hosted" : "Joined"} {StringSafe(item.title)}
                    </Text>
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>
                      {formatPastDate(item.date)}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textTertiary} />
                </Pressable>
              ))
            ) : (
              /* EMPTY_STATE_CLARITY: preserves section height, intentional copy */
              <View className="px-4 py-5 items-center">
                <Text className="text-sm" style={{ color: colors.textTertiary }}>
                  Your social story starts here.
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>

      <BottomNavigation />
    </SafeAreaView>
  );
}