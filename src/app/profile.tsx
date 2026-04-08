import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Share,
  ActivityIndicator,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { resolveBannerUri } from "@/lib/heroSSOT";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { usePreloadHeroBanners } from "@/lib/usePreloadHeroBanners";

import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";

import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { AppHeader } from "@/components/AppHeader";
import BottomNavigation from "@/components/BottomNavigation";
import { StreakCounter } from "@/components/StreakCounter";
import { EntityAvatar } from "@/components/EntityAvatar";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { InlineErrorCard } from "@/components/InlineErrorCard";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { api } from "@/lib/api";
import { eventKeys } from "@/lib/eventQueryKeys";
import { circleKeys } from "@/lib/circleQueryKeys";
import { qk } from "@/lib/queryKeys";
import { useTheme } from "@/lib/ThemeContext";
import { getProfileDisplay, getProfileInitial } from "@/lib/profileDisplay";
import { getImageSource } from "@/lib/imageSource";
import { usePremiumStatusContract } from "@/lib/entitlements";
import { buildProfileSharePayload } from "@/lib/shareSSOT";
import { devLog } from "@/lib/devLog";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { ProfileThemeBackground } from "@/components/ProfileThemeBackground";
import { isValidThemeId, type ThemeId } from "@/lib/eventThemes";

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
  Layers,
  Flame,
  Clock,
  Eye,
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
  const profileInsets = useSafeAreaInsets();
  const [chromeHeight, setChromeHeight] = useState<number>(100);

  const [refreshing, setRefreshing] = useState(false);

  const { status: bootStatus, retry: retryBootstrap } = useBootAuthority();

  const { isPro: userIsPremium } = usePremiumStatusContract();

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
      router.replace("/welcome");
  }, [bootStatus, router]);

  // Queries (authed only)
  const { data: profilesData, refetch: refetchProfiles } = useQuery({
    queryKey: qk.profiles(),
    queryFn: () => api.get<GetProfilesResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 120_000, // 2 min — stable data
  });

  const { data: profileData, refetch: refetchProfile, isError: isProfileError, isPending: isProfilePending } = useQuery({
    queryKey: qk.profile(),
    queryFn: () => api.get<GetProfileResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60_000, // 1 min — own profile, moderately stable
  });

  const { data: friendsData, refetch: refetchFriends } = useQuery({
    queryKey: qk.friend.all(),
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60_000, // 1 min
  });

  const { data: eventsData, refetch: refetchEvents, isError: isEventsError, isRefetching: isEventsRefetching } = useQuery({
    queryKey: eventKeys.myEvents(),
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60_000, // 1 min
  });

  const { data: statsData, refetch: refetchStats, isError: isStatsError, isRefetching: isStatsRefetching, isPending: isStatsPending } = useQuery({
    queryKey: qk.profileStats(),
    queryFn: () => api.get<GetProfileStatsResponse>("/api/profile/stats"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 120_000, // 2 min — heavy endpoint, most stable
  });

  const { data: circlesData, refetch: refetchCircles } = useQuery({
    queryKey: circleKeys.all(),
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60_000, // 1 min
  });

  // Load avatar source with auth headers (must be after profileData query)
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const { avatarUri } = getProfileDisplay({ profileData, session });
        const safeUri = typeof avatarUri === "string" ? avatarUri : undefined;
        if (__DEV__) {
          devLog("[PROFILE_PHOTO]", "avatar_source_resolve", {
            avatarUri: safeUri?.slice(0, 80),
            fromProfile: !!profileData?.profile?.avatarUrl,
            fromUser: !!profileData?.user?.image,
            fromSession: !!session?.user?.image,
          });
        }
        const source = await getImageSource(safeUri);
        setAvatarSource(source ?? null);
      } catch {
        setAvatarSource(null);
      }
    };
    loadAvatar();
  }, [profileData, session]);

  // [PROFILE_PHOTO] Refresh profile data when screen gains focus.
  // React Native has no window.focus event, so React Query's refetchOnWindowFocus
  // doesn't fire. This ensures the avatar updates after editing in settings.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: qk.profile() });
    }, [queryClient])
  );

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
        queryClient.invalidateQueries({ queryKey: qk.session() }),
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

  // ═══ ALL HOOKS AND DERIVED VALUES MUST BE ABOVE THE LOADING GATE ═══
  // React hook-count invariant: hooks cannot be skipped by early returns.

  // Safe derived values (harmless when queries return undefined during loading/logout)
  const friends = (friendsData?.friends ?? []).filter((f) => f.friend != null);
  const friendsCount = friends.length;
  const circlesCount = circlesData?.circles?.length ?? 0;

  const stats = statsData?.stats;
  const eventPerformance = statsData?.eventPerformance;

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

  // ── Profile theme ──
  const rawThemeId = profileData?.profile?.profileThemeId;
  const profileThemeId = isValidThemeId(rawThemeId) ? rawThemeId as ThemeId : null;

  // ── Banner photo URL — SSOT via heroSSOT.resolveBannerUri ──
  const bannerUri = resolveBannerUri(profileData?.profile as Record<string, unknown> | null);

  // [P0_PERF_PRELOAD_OWN_PROFILE_HERO] Preload own banner (max 1, bounded)
  usePreloadHeroBanners({ uris: bannerUri ? [bannerUri] : [], enabled: !!bannerUri, max: 1 });

  // [P0_BANNER_RENDER] DEV proof: what the UI is trying to render
  useEffect(() => {
    if (__DEV__) {
      devLog("[P0_BANNER_RENDER]", {
        bannerUri: bannerUri?.slice(0, 60) ?? null,
        source: (profileData?.profile as any)?.bannerPhotoUrl
          ? "bannerPhotoUrl"
          : (profileData?.profile as any)?.bannerUrl
            ? "bannerUrl"
            : "none",
        profileKeys: profileData?.profile ? Object.keys(profileData.profile) : [],
      });
    }
  }, [bannerUri, profileData?.profile]);

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
        eventPhotoUrl: e.eventPhotoUrl ?? null,
        type: e.userId === userId ? "hosted" : "joined",
        date: new Date(e.startTime),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, session?.user?.id]);

  // ── Share handler ──
  const handleShareProfile = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // [P2_PROFILE_SHARE] DEV proof log
    if (__DEV__) devLog("[P2_PROFILE_SHARE]", { trigger: "profileCard" });
    try {
      const handle = userHandle ? `@${userHandle}` : displayName;
      const payload = buildProfileSharePayload(handle);
      await Share.share({ message: payload.message });
    } catch {
      // user cancelled
    }
  }, [userHandle, displayName]);

  // ── YOUR WEEK derivation (SSOT from existing events query) ──
  const weekEventsAll = useMemo(() => {
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return allEvents
      .filter((e) => {
        const start = new Date(e.startTime);
        return start > now && start <= weekFromNow && e.userId === session?.user?.id;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, session?.user?.id]);

  // MOTION_STABILITY: mount-once guard — animations only fire on initial mount
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (__DEV__) devLog("[P2_PROFILE_MOTION]", { mounted: true });
      if (__DEV__) devLog("[P2_ANIMATION]", { component: "profile", animationMounted: true });
      if (__DEV__) devLog("[P2_PROFILE_IDENTITY]", { layoutRefined: true });
      if (__DEV__) devLog("[P3_PROFILE_ACTION_ROW_REMOVED]", true);
      if (__DEV__) devLog("[P3_PROFILE_MOTION]", { duration: 240, stagger: 40, springify: false });
      if (__DEV__) devLog("[P3_PROFILE_RHYTHM]", { applied: true });
    }
  }, []);

  // Share button press scale (P2 polish)
  const shareScale = useSharedValue(1);
  const shareAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shareScale.value }],
  }));

  // ═══ ALL HOOKS ABOVE — LOADING GATE BELOW ═══

  // [P0_PROFILE_HOOK_GUARD] DEV proof log
  if (__DEV__) {
    const isAuthed = bootStatus === "authed";
    devLog("[P0_PROFILE_HOOK_GUARD]", {
      state: isAuthed ? "authed" : "loggedOut",
      bootStatus,
      hasSession: !!session?.user?.id,
    });
  }

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

  // Error state: profile query settled with an error and no cached data.
  // Prevents a silent blank screen when the network is down on first load.
  if (isProfileError && !profileData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center gap-6 px-8">
          <Text
            className="text-center text-base"
            style={{ color: colors.textSecondary }}
          >
            {"Couldn't load profile.\nCheck your connection and try again."}
          </Text>
          <Button variant="secondary" label="Retry" onPress={onRefresh} loading={refreshing} />
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  // Data-level loading gate: show skeleton while critical queries are pending
  // (bootStatus is already "authed" at this point, but queries may not have resolved yet)
  const isDataPending = isProfilePending || isStatsPending;
  if (isDataPending && !profileData && !statsData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center gap-4">
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            }}
          />
          <View
            style={{
              width: 140,
              height: 18,
              borderRadius: 9,
              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            }}
          />
          <View
            style={{
              width: 100,
              height: 14,
              borderRadius: 7,
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            }}
          />
          <ActivityIndicator
            size="small"
            color={colors.textSecondary}
            style={{ marginTop: 12 }}
          />
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

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

  // [P0_PROFILE_ACTIVITY] DEV proof log
  if (__DEV__) {
    devLog("[P0_PROFILE_ACTIVITY]", {
      count: recentActivity.length,
      source: "eventsData",
    });
  }

  // [P1_HEADER_SOT] Header consistency proof
  if (__DEV__) {
    devLog("[P1_HEADER_SOT]", {
      route: "profile",
      resolvedTitle: "Profile",
      backMode: "n/a (tab root)",
    });
  }

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

  const weekEventCount = weekEventsAll.length;
  const upcomingWeekEvents = weekEventsAll.slice(0, 3);

  // [P3_PROFILE_WEEK] DEV proof log
  if (__DEV__) {
    devLog("[P3_PROFILE_WEEK]", { weekCount: weekEventCount, previewCount: upcomingWeekEvents.length });
  }

  // ── P2 empty-state tracking ──
  const emptyStates: string[] = [];
  if (nextMode === "empty") emptyStates.push("whatsNext");
  if (recentActivity.length === 0) emptyStates.push("recentActivity");

  // [P2_PROFILE_EMPTY] DEV proof log
  if (__DEV__) {
    devLog("[P2_PROFILE_EMPTY]", { rendered: emptyStates });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={[]}>

      {/* ═══ Profile theme background ═══ */}
      {profileThemeId && (
        <ProfileThemeBackground themeId={profileThemeId} />
      )}

      {/* ═══ Floating translucent top chrome ═══ */}
      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== chromeHeight) setChromeHeight(h);
        }}
        pointerEvents="box-none"
      >
        <BlurView
          intensity={88}
          tint={isDark ? "dark" : "light"}
          style={{ paddingTop: profileInsets.top, overflow: "hidden" }}
        >
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
            <AppHeader
              title="Profile"
              right={
                <Pressable
                  onPress={() => router.push("/settings")}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.inputBg }}
                >
                  <Settings size={20} color={colors.textSecondary} />
                </Pressable>
              }
            />
          </View>
        </BlurView>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: chromeHeight, paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColor}
            progressViewOffset={chromeHeight}
          />
        }
      >
        {/* ═══ Profile Identity Card ═══ */}
        <Animated.View entering={FadeInDown.duration(240)}>
          <View
            className="rounded-2xl border mb-4 overflow-hidden"
            style={{
              backgroundColor: colors.surface,
              borderColor: userIsPremium ? "#FFD700" : colors.border,
              borderWidth: userIsPremium ? 2 : 1,
            }}
          >
            {/* Banner — canonical 3:1 aspect ratio */}
            {bannerUri && (
              <View style={{ aspectRatio: 3, width: "100%" }}>
                {/* INVARIANT_HERO_USES_TRANSFORM_SSOT — banner decoded via CLOUDINARY_PRESETS.HERO_BANNER */}
                <ExpoImage
                  source={{ uri: toCloudinaryTransformedUrl(bannerUri!, CLOUDINARY_PRESETS.HERO_BANNER) }}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                  priority="normal"
                />
                {/* Subtle global tint */}
                <View
                  style={{
                    position: "absolute",
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: isDark ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.18)",
                  }}
                />
                {/* Bottom legibility gradient */}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 80,
                    backgroundColor: isDark
                      ? "rgba(0,0,0,0.35)"
                      : "rgba(255,255,255,0.25)",
                  }}
                />
              </View>
            )}

            {/* Content layer */}
            <View style={{ padding: bannerUri ? 12 : 20, marginTop: bannerUri ? -40 : 0 }}>
              {/* Avatar row */}
              <View style={{ alignItems: bannerUri ? "center" : "flex-start", marginBottom: bannerUri ? 8 : 0 }}>
                {bannerUri && (
                  <View className="relative" style={{ marginBottom: 8, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
                    <EntityAvatar
                      imageSource={avatarSource}
                      initials={StringSafe(getProfileInitial({ profileData, session }))}
                      size={72}
                      backgroundColor={isDark ? colors.surfaceElevated : `${themeColor}15`}
                      foregroundColor={themeColor}
                      fallbackIcon="person"
                    />
                    {userIsPremium && (
                      <View
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full items-center justify-center"
                        style={{ backgroundColor: "#FFD700" }}
                      >
                        <Crown size={12} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Text legibility panel (fake glass when banner present) */}
              <View
                style={bannerUri ? {
                  backgroundColor: isDark ? "rgba(0,0,0,0.46)" : "rgba(255,255,255,0.82)",
                  borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                  borderWidth: 1,
                  borderRadius: 16,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  overflow: "hidden",
                  shadowColor: "#000",
                  shadowOpacity: isDark ? 0.35 : 0.12,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                } : undefined}
              >
                {/* Legibility boost — subtle bottom deepening */}
                {bannerUri && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: "50%",
                      backgroundColor: isDark ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.18)",
                    }}
                  />
                )}
                {/* No-banner layout: horizontal avatar + text */}
                {!bannerUri ? (
                  <View className="flex-row items-center">
                    <View className="relative" style={{ marginRight: 16 }}>
                      <EntityAvatar
                        imageSource={avatarSource}
                        initials={StringSafe(getProfileInitial({ profileData, session }))}
                        size={72}
                        backgroundColor={isDark ? colors.surfaceElevated : `${themeColor}15`}
                        foregroundColor={themeColor}
                        fallbackIcon="person"
                      />
                      {userIsPremium && (
                        <View
                          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full items-center justify-center"
                          style={{ backgroundColor: "#FFD700" }}
                        >
                          <Crown size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text
                          className="text-xl font-sora-bold"
                          style={{ color: colors.text, letterSpacing: -0.3 }}
                        >
                          {displayName}
                        </Text>
                        {userIsPremium && (
                          <Chip variant="status" label="PRO" color="#B8860B" size="sm" style={{ marginLeft: 8 }} />
                        )}
                      </View>
                      {userHandle && (
                        <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>
                          {`@${StringSafe(userHandle)}`}
                        </Text>
                      )}
                      <View className="flex-row items-center" style={{ marginTop: 6 }}>
                        <Calendar size={14} color={colors.textTertiary} />
                        <Text className="ml-2 text-sm" style={{ color: colors.textTertiary }} numberOfLines={1}>
                          {calendarBio ? StringSafe(calendarBio) : "Tap Edit to add a bio"}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  /* Banner layout: centered text — hero contrast tokens */
                  <View style={{ alignItems: "center" }}>
                    <View className="flex-row items-center">
                      <Text
                        className="text-xl font-sora-bold"
                        style={{ color: colors.text, fontWeight: "700", letterSpacing: -0.3 }}
                      >
                        {displayName}
                      </Text>
                      {userIsPremium && (
                        <Chip variant="status" label="PRO" color="#B8860B" size="sm" style={{ marginLeft: 8 }} />
                      )}
                    </View>
                    {userHandle && (
                      <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>
                        {`@${StringSafe(userHandle)}`}
                      </Text>
                    )}
                    <View className="flex-row items-center" style={{ marginTop: 6 }}>
                      <Calendar size={14} color={colors.textTertiary} />
                      <Text className="ml-2 text-sm" style={{ color: colors.textTertiary }} numberOfLines={1}>
                        {calendarBio ? StringSafe(calendarBio) : "Tap Edit to add a bio"}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

            {/* Edit / Share / Preview — visually grouped action row */}
            <View className="flex-row mt-5 pt-3 border-t" style={{ borderColor: colors.border, gap: 8 }}>
              <Button
                variant="secondary"
                label="Edit"
                leftIcon={<Pencil size={14} color={colors.textSecondary} />}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/edit-profile");
                }}
                size="sm"
                style={{ flex: 1, borderRadius: 10 }}
              />
              <Animated.View style={[{ flex: 1 }, shareAnimatedStyle]}>
                <Button
                  variant="secondary"
                  label="Share"
                  leftIcon={<Share2 size={14} color={colors.textSecondary} />}
                  onPress={handleShareProfile}
                  size="sm"
                  style={{ borderRadius: 10 }}
                />
              </Animated.View>
            </View>

            {/* View Public Profile — accent pill CTA */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/public-profile");
              }}
              style={{
                backgroundColor: themeColor,
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                alignSelf: "center",
                marginTop: 8,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Eye size={14} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 13, marginLeft: 6 }}>
                View Public Profile
              </Text>
            </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ═══ What's Next Card ═══ */}
        <Animated.View entering={FadeInDown.delay(40).duration(240)} className="mb-4">
          <View
            className="rounded-2xl p-4 border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Text className="text-xs font-semibold mb-3" style={{ color: colors.textTertiary, letterSpacing: 1 }}>
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
                <EntityAvatar
                  photoUrl={upcomingEvent.eventPhotoUrl}
                  emoji={upcomingEvent.emoji || "📅"}
                  size={40}
                  borderRadius={12}
                  backgroundColor={`${themeColor}15`}
                  emojiClassName="text-lg"
                />
                <View style={{ width: 12 }} />
                <View className="flex-1">
                  <Text className="text-base font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                    {StringSafe(upcomingEvent.title)}
                  </Text>
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    {formatRelativeTime(new Date(upcomingEvent.startTime))}
                  </Text>
                </View>
                <Chip variant="accent" label="View" style={{ borderRadius: 8 }} />
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
                <Chip variant="status" label="Respond" color="#FF9500" style={{ borderRadius: 8 }} />
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
                    Your calendar's wide open
                  </Text>
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    Your next hangout is one tap away
                  </Text>
                </View>
                <Chip variant="accent" label="Create" style={{ borderRadius: 8 }} />
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* ═══ Your Week ═══ */}
        <Animated.View entering={FadeInDown.delay(80).duration(240)} className="mb-4">
          <Text className="text-xs font-semibold mb-3" style={{ color: colors.textTertiary, letterSpacing: 1 }}>
            YOUR WEEK
          </Text>
          {isEventsError && !eventsData ? (
            (() => {
              if (__DEV__) {
                console.warn("[P1_PROFILE_PARTIAL_ERROR]", { card: "events", hasData: !!eventsData });
              }
              return (
                <InlineErrorCard
                  cardName="Events"
                  onRetry={() => refetchEvents()}
                  isRetrying={isEventsRefetching}
                />
              );
            })()
          ) : (
          <View
            className="rounded-xl p-4 border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, minHeight: 130 }}
          >
            <Text className="text-sm mb-3" style={{ color: colors.textSecondary }}>
              {weekEventCount > 0
                ? `${weekEventCount} plan${weekEventCount === 1 ? "" : "s"} in the next 7 days`
                : "Nothing planned this week"}
            </Text>

            {upcomingWeekEvents.length > 0 && (
              <View className="mb-3">
                {upcomingWeekEvents.map((evt, idx) => {
                  const dayLabel = new Date(evt.startTime).toLocaleDateString("en-US", { weekday: "short" });
                  return (
                    <Pressable
                      key={evt.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/event/${evt.id}`);
                      }}
                      className="flex-row items-center py-1.5"
                      style={({ pressed }) => [
                        { opacity: pressed ? 0.6 : 1 },
                        idx < upcomingWeekEvents.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined,
                      ]}
                    >
                      <EntityAvatar
                        photoUrl={evt.eventPhotoUrl}
                        emoji={evt.emoji || "📅"}
                        size={24}
                        borderRadius={6}
                        emojiStyle={{ fontSize: 16 }}
                      />
                      <View style={{ width: 8 }} />
                      <Text className="flex-1 text-sm font-medium" style={{ color: colors.text }} numberOfLines={1}>
                        {StringSafe(evt.title)}
                      </Text>
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>{dayLabel}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Button
              variant="ghost"
              label={weekEventCount === 0 ? "Start something" : "View calendar"}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(weekEventCount === 0 ? "/create" : "/calendar");
              }}
              style={{ backgroundColor: `${themeColor}15`, borderRadius: 8, paddingVertical: 10 }}
            />
          </View>
          )}
        </Animated.View>

        {/* ═══ Momentum (Streak) ═══ */}
        <Animated.View entering={FadeInDown.delay(120).duration(240)} className="mb-4">
          {isStatsError && !statsData ? (
            (() => {
              if (__DEV__) {
                console.warn("[P1_PROFILE_PARTIAL_ERROR]", { card: "stats", hasData: !!statsData });
              }
              return (
                <InlineErrorCard
                  cardName="Stats"
                  onRetry={() => refetchStats()}
                  isRetrying={isStatsRefetching}
                />
              );
            })()
          ) : (
            <StreakCounter
              currentStreak={stats?.currentStreak ?? 0}
              longestStreak={0}
              totalHangouts={stats?.attendedCount ?? 0}
            />
          )}
        </Animated.View>

        {/* ═══ Event Performance (premium-gated) ═══ */}
        {userIsPremium && (eventPerformance || (stats?.hostedCount ?? 0) > 0) && (
          <Animated.View entering={FadeInDown.delay(140).duration(240)} className="mb-4">
            <Text className="text-xs font-semibold mb-3" style={{ color: colors.textTertiary, letterSpacing: 1 }}>
              EVENT PERFORMANCE
            </Text>
            {/* Overview stats row */}
            <View className="flex-row mb-2">
              <View
                className="flex-1 rounded-xl p-4 mr-1 border"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
              >
                <Text className="text-2xl font-bold" style={{ color: themeColor }}>
                  {StringSafe(eventPerformance?.totalRsvpsReceived ?? stats?.attendedCount ?? 0)}
                </Text>
                <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                  {eventPerformance ? "Total RSVPs" : "Events Attended"}
                </Text>
              </View>
              <View
                className="flex-1 rounded-xl p-4 ml-1 border"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
              >
                <Text className="text-2xl font-bold" style={{ color: "#F39C12" }}>
                  {StringSafe(eventPerformance?.avgRsvpsPerEvent ?? stats?.hostedCount ?? 0)}
                </Text>
                <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                  {eventPerformance ? "Avg per Event" : "Events Hosted"}
                </Text>
              </View>
            </View>

            {/* Top events list */}
            {(eventPerformance?.topEvents?.length ?? 0) > 0 && (
              <View
                className="rounded-xl border overflow-hidden"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
              >
                {(eventPerformance?.topEvents ?? []).map((topEvent, idx) => (
                  <Pressable
                    key={topEvent.id}
                    className="flex-row items-center px-4 py-3"
                    style={idx > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/event/${topEvent.id}`);
                    }}
                  >
                    <Text className="text-lg mr-2">{topEvent.emoji ?? "📅"}</Text>
                    <View className="flex-1">
                      <Text className="font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                        {topEvent.title}
                      </Text>
                      <Text className="text-xs" style={{ color: colors.textSecondary }}>
                        {topEvent.attendees} attendee{topEvent.attendees !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={colors.textTertiary} />
                  </Pressable>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* Teaser card for free users who have hosted events */}
        {!userIsPremium && (stats?.hostedCount ?? 0) > 0 && (
          <Animated.View entering={FadeInDown.delay(140).duration(240)} className="mb-4">
            <Pressable
              className="rounded-xl p-4 border"
              style={{ backgroundColor: colors.surface, borderColor: "#FFD70050" }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/subscription");
              }}
            >
              <View className="flex-row items-center mb-2">
                <Crown size={16} color="#FFD700" />
                <Text className="font-semibold ml-2" style={{ color: colors.text }}>
                  Event Performance
                </Text>
                <Chip label="PRO" variant="status" color="#FFD700" size="sm" style={{ marginLeft: 8 }} />
              </View>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                See your RSVP stats, top events, and hosting insights.
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* ═══ Social Snapshot (2×2 grid) ═══ */}
        <Animated.View entering={FadeInDown.delay(160).duration(240)} className="mb-4">
          <Text className="text-xs font-semibold mb-3" style={{ color: colors.textTertiary, letterSpacing: 1 }}>
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
              <Text className="text-xs" style={{ color: colors.textTertiary }}>Friends</Text>
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
              <Text className="text-xs" style={{ color: colors.textTertiary }}>Groups</Text>
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
              <Text className="text-xs" style={{ color: colors.textTertiary }}>Hosted</Text>
              {(stats?.hostedCount ?? 0) >= 5 && (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 2 }}>
                  <Text style={{ fontSize: 10 }}>⭐</Text>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#B45309" }}>Active Host</Text>
                </View>
              )}
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
              <Text className="text-xs" style={{ color: colors.textTertiary }}>Attended</Text>
            </View>
          </View>
        </Animated.View>


        {/* ═══ Recent Activity ═══ */}
        <Animated.View entering={FadeInDown.delay(240).duration(240)} className="mb-4">
          <Text className="text-xs font-semibold mb-3" style={{ color: colors.textTertiary, letterSpacing: 1 }}>
            RECENT ACTIVITY
          </Text>
          <View
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            {recentActivity.length > 0 ? (
              recentActivity.map((item, index) => {
                // [P1_PROFILE_EVENT_THUMB] DEV proof: recent activity now renders cover image
                if (__DEV__) {
                  devLog('[P1_PROFILE_EVENT_THUMB] RecentActivity row', {
                    eventId: item.id?.slice(0, 6),
                    hasPhoto: !!item.eventPhotoUrl,
                    emoji: item.emoji,
                  });
                }
                return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/event/${item.id}`);
                  }}
                  className="flex-row items-center px-4 py-3"
                  style={index < recentActivity.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}
                >
                  <EntityAvatar
                    photoUrl={item.eventPhotoUrl}
                    emoji={item.emoji}
                    size={28}
                    borderRadius={8}
                    backgroundColor={`${themeColor}15`}
                    emojiStyle={{ fontSize: 16 }}
                  />
                  <View style={{ width: 12 }} />
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
                );
              })
            ) : (
              /* EMPTY_STATE_CLARITY: preserves section height, intentional copy */
              <View className="px-4 py-5 items-center">
                <Text className="text-sm" style={{ color: colors.textTertiary }}>
                  Past events will appear here
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
