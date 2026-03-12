import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { devLog } from "@/lib/devLog";
import { useLiveRefreshContract } from "@/lib/useLiveRefreshContract";
import { EventPhotoEmoji } from "@/components/EventPhotoEmoji";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, Stack } from "expo-router";
import {
  MapPin,
  Users,
  Clock,
  Heart,
  Check,
  Bookmark,
  ChevronRight,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeInUp, FadeOutUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme, TILE_SHADOW } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { safeToast } from "@/lib/safeToast";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useLoadedOnce } from "@/lib/loadingInvariant";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import BottomNavigation from "@/components/BottomNavigation";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { AppHeader } from "@/components/AppHeader";
import { HelpSheet, HELP_SHEETS } from "@/components/HelpSheet";
import { DailyIdeasDeck } from "@/components/ideas/DailyIdeasDeck";
import { eventKeys, deriveAttendeeCount, logRsvpMismatch } from "@/lib/eventQueryKeys";
import { postIdempotent } from "@/lib/idempotencyKey";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { Button } from "@/ui/Button";
import { STATUS, HERO_GRADIENT } from "@/ui/tokens";
import { RADIUS } from "@/ui/layout";
import { computeAvailabilityBatch, getAvailabilityChip } from "@/lib/availabilitySignal";
import type { GetEventsResponse } from "@/shared/contracts";

// ── Urgency helper — derives a human-readable time label from startTime ──
function getUrgencyLabel(startTime: string): { label: string; tone: "soon" | "warm" | null } {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const diffMs = start - now;
  if (diffMs < 0) return { label: "", tone: null }; // past
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH <= 1) return { label: `Starts in ${Math.max(1, Math.round(diffMs / 60000))}m`, tone: "soon" };
  if (diffH <= 6) return { label: `Starts in ${Math.round(diffH)}h`, tone: "soon" };
  // Check if today
  const startDate = new Date(startTime);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  if (start <= todayEnd.getTime()) return { label: "Tonight", tone: "soon" };
  // Check if tomorrow
  const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  if (start <= tomorrowEnd.getTime()) return { label: "Tomorrow", tone: "warm" };
  // Within 3 days
  if (diffH <= 72) return { label: `In ${Math.round(diffH / 24)} days`, tone: "warm" };
  return { label: "", tone: null };
}

/** Group label for Saved V2 time sections */
function getSavedTimeGroup(startTime: string): string {
  const now = new Date();
  const start = new Date(startTime);
  if (start.getTime() < now.getTime()) return ""; // past — filtered out

  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  if (start <= todayEnd) return "Today";

  const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  if (start <= tomorrowEnd) return "Tomorrow";

  // This week = within 7 days
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7); weekEnd.setHours(23, 59, 59, 999);
  if (start <= weekEnd) return "This Week";

  return "Later";
}

interface PopularEvent {
  id: string;
  title: string;
  emoji: string;
  startTime: string;
  endTime?: string | null;
  location: string | null;
  visibility?: string;
  user: { id: string; name: string | null; image: string | null };
  attendeeCount: number;
  capacity?: number | null;
  goingCount?: number;
  displayGoingCount?: number;
  isFull?: boolean;
  viewerRsvpStatus?: "going" | "not_going" | "interested" | "maybe" | null;
  createdAt?: string;
  eventPhotoUrl?: string | null;
  joinRequests?: Array<{
    id: string;
    userId: string;
    status: string;
    user: { id: string; name: string | null; image: string | null };
  }>;
}

type Lens = "ideas" | "events" | "saved";
const LENS_OPTIONS: { key: Lens; label: string }[] = [
  { key: "ideas", label: "Ideas" },
  { key: "events", label: "Events" },
  { key: "saved", label: "Saved" },
];

type EventSort = "popular" | "soon";
const SORT_OPTIONS: { key: EventSort; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "soon", label: "Soon" },
];

export default function DiscoverScreen() {
  const mountTime = useRef(Date.now());
  const { data: session } = useSession();
  const { status: bootStatus, retry: retryBootstrap } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

  // ── Lens state ──
  const [lens, setLens] = useState<Lens>("events");
  const [eventSort, setEventSort] = useState<EventSort>("popular");
  const queryClient = useQueryClient();

  // ── For You: save state + toast ──
  const [savedEvents, setSavedEvents] = useState<Set<string>>(new Set());
  const [showSavedToast, setShowSavedToast] = useState(false);
  const savedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSavedToast = useCallback(() => {
    if (savedToastTimerRef.current) clearTimeout(savedToastTimerRef.current);
    setShowSavedToast(true);
    savedToastTimerRef.current = setTimeout(() => setShowSavedToast(false), 1400);
  }, []);

  useEffect(() => {
    return () => { if (savedToastTimerRef.current) clearTimeout(savedToastTimerRef.current); };
  }, []);

  const saveMutation = useMutation({
    mutationFn: (eventId: string) =>
      postIdempotent(`/api/events/${eventId}/rsvp`, { status: "interested" }),
    onSuccess: (_data, eventId) => {
      setSavedEvents((prev) => new Set(prev).add(eventId));
      queryClient.invalidateQueries({ queryKey: eventKeys.feedPopular() });
      queryClient.invalidateQueries({ queryKey: eventKeys.myEvents() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      flashSavedToast();
    },
    onError: (err) => {
      if (__DEV__) devLog("[DISCOVER_SAVE_ERR]", err);
      safeToast.error("Couldn't save", "Please try again");
    },
  });

  // Surface tokens from theme SSOT
  const tileShadow = !isDark ? TILE_SHADOW : {};

  // SSOT: two event sources merged into one list
  const { data: feedData, isLoading: loadingFeed, isFetching: fetchingFeed, refetch: refetchFeed, isError: feedError } = useQuery({
    queryKey: eventKeys.feedPopular(),
    queryFn: () => api.get<{ events: PopularEvent[] }>("/api/events/feed?visibility=open_invite"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev: { events: PopularEvent[] } | undefined) => prev,
  });

  const { data: myEventsData, isLoading: loadingMyEvents, isFetching: fetchingMyEvents, refetch: refetchMyEvents, isError: myEventsError } = useQuery({
    queryKey: eventKeys.myEvents(),
    queryFn: () => api.get<{ events: PopularEvent[] }>("/api/events"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev: { events: PopularEvent[] } | undefined) => prev,
  });

  // [AVAILABILITY_V1] Fetch attending events for availability signal computation
  const { data: attendingData } = useQuery({
    queryKey: eventKeys.attending(),
    queryFn: () => api.get<GetEventsResponse>("/api/events/attending"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const isLoading = loadingFeed || loadingMyEvents;
  const isError = feedError || myEventsError;

  // [P0_LOADING_ESCAPE] loadedOnce discipline: skeleton only on first load
  const { showInitialLoading: showDiscoverLoading, showRefetchIndicator: discoverRefetching } = useLoadedOnce(
    { isLoading, isFetching: fetchingFeed || fetchingMyEvents, isSuccess: !!(feedData || myEventsData), data: feedData },
    "discover-feed",
  );

  // [PERF_SWEEP] DEV-only render timing
  if (__DEV__ && !showDiscoverLoading && mountTime.current) {
    devLog("[PERF_SWEEP]", { screen: "discover", phase: "render", durationMs: Date.now() - mountTime.current });
    mountTime.current = 0;
  }

  // [P0_LOADING_ESCAPE] Timeout safety
  const isBootLoading = bootStatus === 'loading';
  const { isTimedOut, reset: resetTimeout } = useLoadingTimeout(isBootLoading || showDiscoverLoading, { timeout: 3000 });
  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    resetTimeout();
    retryBootstrap();
    refetchFeed();
    refetchMyEvents();
    setTimeout(() => setIsRetrying(false), 1500);
  }, [resetTimeout, retryBootstrap, refetchFeed, refetchMyEvents]);

  // [LIVE_REFRESH] SSOT live-feel contract: manual + foreground + focus
  const { isRefreshing, onManualRefresh } = useLiveRefreshContract({
    screenName: "discover",
    refetchFns: [refetchFeed, refetchMyEvents],
  });

  // ── SSOT: merge + deduplicate + enrich all events ──
  const enrichedEvents = useMemo(() => {
    const feedEvents = feedData?.events ?? [];
    const myEvents = myEventsData?.events ?? [];

    const allEventsMap = new Map<string, PopularEvent>();
    [...feedEvents, ...myEvents].forEach((event) => {
      if (!allEventsMap.has(event.id)) {
        allEventsMap.set(event.id, event);
      }
    });

    const allEvents = Array.from(allEventsMap.values());
    const now = new Date();

    // Enrich with canonical attendee count + filter to upcoming + non-private
    const BLOCKED_VIS = ["circle_only", "specific_groups", "private"];
    return allEvents
      .filter((e) => {
        if (e.visibility && BLOCKED_VIS.includes(e.visibility)) return false;
        return new Date(e.startTime) >= now;
      })
      .map((event) => {
        const derivedCount = deriveAttendeeCount(event);
        const attendeeCount = event.displayGoingCount ?? event.goingCount ?? derivedCount;
        if (__DEV__) logRsvpMismatch(event.id, derivedCount, event.goingCount, "discover_v1");
        return { ...event, attendeeCount };
      });
  }, [feedData?.events, myEventsData?.events]);

  // [AVAILABILITY_V1] Compute availability signals for all enriched events
  const calendarEvents = useMemo(() => {
    const myEvents = myEventsData?.events ?? [];
    const attending = attendingData?.events ?? [];
    const eventMap = new Map<string, { id: string; startTime: string; endTime?: string | null }>();
    [...myEvents, ...attending].forEach((e) => {
      if (!eventMap.has(e.id)) eventMap.set(e.id, e);
    });
    return Array.from(eventMap.values());
  }, [myEventsData?.events, attendingData?.events]);

  const availabilityMap = useMemo(
    () => computeAvailabilityBatch(enrichedEvents, calendarEvents.length > 0 ? calendarEvents : undefined),
    [enrichedEvents, calendarEvents],
  );

  // ── Sort-derived lists (all from enrichedEvents SSOT) ──
  const popularSorted = useMemo(() => {
    return [...enrichedEvents].sort(
      (a, b) => b.attendeeCount - a.attendeeCount || new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }, [enrichedEvents]);

  const soonSorted = useMemo(() => {
    return [...enrichedEvents].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }, [enrichedEvents]);

  // Active Events feed based on sort control
  const activeFeed = eventSort === "soon" ? soonSorted : popularSorted;

  // Saved events list (interested/maybe from server + locally saved), sorted soonest-first, past filtered
  const savedEventsList = useMemo(() => {
    const now = Date.now();
    return enrichedEvents
      .filter((e) => {
        if (new Date(e.startTime).getTime() < now) return false; // filter past
        return savedEvents.has(e.id) || e.viewerRsvpStatus === "interested" || e.viewerRsvpStatus === "maybe";
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [enrichedEvents, savedEvents]);

  // [DISCOVER_LENS] DEV proof logs (once per mount)
  // [P0_CREATE_PILL_RENDER] DEV proof log for Create pill on Discover
  const didLogCreatePill = useRef(false);
  const discoverInsets = useSafeAreaInsets();
  if (__DEV__ && !didLogCreatePill.current) {
    didLogCreatePill.current = true;
    devLog('[P0_CREATE_PILL_RENDER]', {
      screen: 'discover',
      visible: true,
      bottomInset: discoverInsets.bottom,
      hasSafeAreaInsets: discoverInsets.bottom > 0,
      container: 'SafeAreaView>Header',
    });
  }

  const didLog = useRef(false);
  if (__DEV__ && !didLog.current && !isLoading) {
    didLog.current = true;
    devLog("[DISCOVER_LENS]", {
      lens,
      totalEnriched: enrichedEvents.length,
      eventSort,
    });
  }

  const handleEventPress = (eventId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/event/${eventId}` as any);
  };

  if (!session) {
    return (
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text style={{ color: colors.textSecondary }}>Please sign in to discover events</Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  // [P0_LOADING_ESCAPE] Timeout / error gate
  if ((isBootLoading || showDiscoverLoading) && isTimedOut) {
    return (
      <LoadingTimeoutUI
        context="discover"
        onRetry={handleRetry}
        isRetrying={isRetrying}
        showBottomNav={true}
      />
    );
  }

  if (isError && !showDiscoverLoading) {
    return (
      <LoadingTimeoutUI
        context="discover"
        onRetry={handleRetry}
        isRetrying={isRetrying}
        showBottomNav={true}
        message="Something went wrong loading events. Please try again."
      />
    );
  }

  return (
    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <AppHeader
        title="Discover"
        left={<HelpSheet screenKey="discover" config={HELP_SHEETS.discover} />}
        right={
          <Button
            variant="primary"
            size="sm"
            label="Create"
            /* INVARIANT_ALLOW_INLINE_HANDLER */
            onPress={() => {
              if (!guardEmailVerification(session)) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/create");
            }}
          />
        }
      />

      <View className="px-5">
        {/* ═══ Lens Switcher ═══ */}
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <View className="flex-row mt-3 rounded-full p-0.5" style={{ backgroundColor: colors.segmentBg }}>
          {/* INVARIANT_ALLOW_SMALL_MAP */}
          {LENS_OPTIONS.map((opt) => {
            const active = lens === opt.key;
            return (
              <Pressable
                key={opt.key}
                testID={`discover-tab-${opt.key}`}
                /* INVARIANT_ALLOW_INLINE_HANDLER */
                onPress={() => {
                  if (lens !== opt.key) {
                    setLens(opt.key);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (__DEV__) devLog("[DISCOVER_LENS]", { lens: opt.key, totalEnriched: enrichedEvents.length });
                  }
                }}
                className="flex-1 items-center py-2 rounded-full"
                style={active ? { backgroundColor: colors.surface, ...tileShadow } : undefined}
              >
                <Text
                  className={`text-sm ${active ? "font-semibold" : "font-normal"}`}
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ color: active ? themeColor : colors.textTertiary }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {lens === "ideas" ? (
        /* ═══ Ideas Deck ═══ */
        <DailyIdeasDeck />
      ) : lens === "events" ? (
        /* ═══ Events Feed ═══ */
        <View style={{ flex: 1 }}>
          {/* "Saved" toast */}
          {showSavedToast && (
            <Animated.View
              entering={FadeInUp.duration(260)}
              exiting={FadeOutUp.duration(180)}
              pointerEvents="box-none"
              style={{
                position: "absolute",
                top: 12,
                left: 0,
                right: 0,
                zIndex: 100,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: STATUS.interested.bgSoft,
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  gap: 6,
                }}
              >
                <Heart size={15} color={STATUS.interested.fg} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: STATUS.interested.fg }}>
                  Saved to your list
                </Text>
              </View>
            </Animated.View>
          )}

          {showDiscoverLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color={themeColor} />
            </View>
          ) : (
            <FlatList
              data={activeFeed}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 100 }}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onManualRefresh}
                  tintColor={themeColor}
                />
              }
              ListHeaderComponent={
                /* ═══ Sort Chips ═══ */
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  {/* INVARIANT_ALLOW_SMALL_MAP */}
                  {SORT_OPTIONS.map((opt) => {
                    const active = eventSort === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        testID={`discover-sort-${opt.key}`}
                        onPress={() => {
                          if (eventSort !== opt.key) {
                            setEventSort(opt.key);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }
                        }}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          borderRadius: 20,
                          backgroundColor: active ? themeColor : (isDark ? "#2C2C2E" : "#F0F0F0"),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: active ? "600" : "400",
                            color: active ? "#FFFFFF" : colors.textSecondary,
                          }}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              }
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingTop: 60 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>{"\u2728"}</Text>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                    No events yet
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                    Events from your network will appear here.
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (!guardEmailVerification(session)) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push("/create" as any);
                    }}
                    style={{
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: RADIUS.lg,
                      backgroundColor: themeColor,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Create an Event</Text>
                  </Pressable>
                </View>
              }
              renderItem={({ item: event, index }) => {
                const hasPhoto = !!event.eventPhotoUrl && event.visibility !== "private";
                const rsvp = event.viewerRsvpStatus as string | null | undefined;
                const saved = savedEvents.has(event.id) || rsvp === "interested" || rsvp === "maybe";
                const hostName = event.user?.name?.split(" ")[0] ?? "someone";
                const dateStr = new Date(event.startTime).toLocaleDateString([], {
                  weekday: "short", month: "short", day: "numeric",
                });
                const timeStr = new Date(event.startTime).toLocaleTimeString([], {
                  hour: "numeric", minute: "2-digit",
                });
                const urgency = getUrgencyLabel(event.startTime);
                const spotsLeft = event.capacity && event.attendeeCount > 0
                  ? Math.max(0, event.capacity - event.attendeeCount)
                  : null;
                const almostFull = spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 3;
                // [AVAILABILITY_V1] Availability chip for this card
                const availChip = getAvailabilityChip(availabilityMap.get(event.id) ?? "unknown");

                return (
                  <Animated.View entering={FadeInDown.delay(index * 30).duration(220)} style={{ marginBottom: 16 }}>
                    <Pressable
                      testID="discover-card-open"
                      onPress={() => handleEventPress(event.id)}
                      style={{
                        borderRadius: RADIUS.xl,
                        overflow: "hidden",
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.borderSubtle,
                        ...tileShadow,
                      }}
                    >
                      {/* Save toggle — card-level overlay */}
                      <Pressable
                        testID="discover-card-save"
                        disabled={saved || saveMutation.isPending}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          saveMutation.mutate(event.id);
                        }}
                        hitSlop={10}
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          zIndex: 999,
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: saved ? STATUS.interested.bgSoft : "rgba(0,0,0,0.4)",
                          borderWidth: saved ? 1.5 : 0,
                          borderColor: saved ? STATUS.interested.fg : "transparent",
                          opacity: saveMutation.isPending ? 0.5 : 1,
                        }}
                      >
                        <Heart
                          size={18}
                          color={saved ? STATUS.interested.fg : "#FFFFFF"}
                        />
                      </Pressable>

                      {/* Hero image */}
                      <View>
                        <View style={{ aspectRatio: 4 / 3 }}>
                          {hasPhoto ? (
                            <ExpoImage
                              source={{ uri: toCloudinaryTransformedUrl(event.eventPhotoUrl!, CLOUDINARY_PRESETS.HERO_BANNER) }}
                              style={{ width: "100%", height: "100%" }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              transition={200}
                            />
                          ) : (
                            <View
                              style={{
                                width: "100%",
                                height: "100%",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED",
                              }}
                            >
                              <Text style={{ fontSize: 56 }}>{event.emoji || "\uD83D\uDCC5"}</Text>
                            </View>
                          )}

                          {/* Gradient overlay */}
                          <LinearGradient
                            colors={[...HERO_GRADIENT.colors]}
                            locations={[...HERO_GRADIENT.locations]}
                            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60%" }}
                          />

                          {/* Overlay content */}
                          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 16 }}>
                            <Text
                              style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "700", lineHeight: 26 }}
                              numberOfLines={2}
                            >
                              {event.emoji} {event.title}
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                              <Clock size={13} color="rgba(255,255,255,0.8)" />
                              <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, marginLeft: 5, fontWeight: "500" }}>
                                {dateStr} at {timeStr}
                              </Text>
                            </View>
                            {event.location && (
                              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                                <MapPin size={13} color="rgba(255,255,255,0.7)" />
                                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginLeft: 5 }} numberOfLines={1}>
                                  {event.location}
                                </Text>
                              </View>
                            )}
                            {/* [SOCIAL_PROOF_V2] Host line — prominent, always visible */}
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                              <EntityAvatar
                                photoUrl={event.user?.image}
                                initials={event.user?.name?.[0] ?? "?"}
                                size={22}
                                backgroundColor="rgba(255,255,255,0.2)"
                                foregroundColor="#FFFFFF"
                              />
                              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "500", marginLeft: 6 }}>
                                Hosted by {hostName}
                              </Text>
                            </View>

                            {/* [SOCIAL_PROOF_V2] Momentum + chips row */}
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap", gap: 4 }}>
                              {/* Momentum-aware attendance copy */}
                              {(() => {
                                const count = event.attendeeCount ?? 0;
                                const cap = event.capacity ?? null;
                                // No attendees — early traction cue
                                if (count === 0) return (
                                  <View style={{ backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                    <Text style={{ fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.7)" }}>
                                      Be the first to join
                                    </Text>
                                  </View>
                                );
                                // Build momentum copy
                                let label: string;
                                if (cap && count >= cap) {
                                  label = `${count} going · Full`;
                                } else if (count >= 10) {
                                  label = `${count} going · Popular`;
                                } else if (count >= 5) {
                                  label = `${count} going · Filling up`;
                                } else {
                                  label = `${count} going`;
                                }
                                return (
                                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                                    <Users size={12} color={STATUS.going.fg} />
                                    <Text style={{ color: STATUS.going.fg, fontSize: 12, fontWeight: "600", marginLeft: 4 }}>
                                      {label}
                                    </Text>
                                  </View>
                                );
                              })()}
                              {urgency.label ? (
                                <View style={{
                                  backgroundColor: urgency.tone === "soon" ? STATUS.soon.bgSoft : "rgba(255,255,255,0.15)",
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 8,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: "700",
                                    color: urgency.tone === "soon" ? STATUS.soon.fg : "rgba(255,255,255,0.8)",
                                  }}>
                                    {urgency.label}
                                  </Text>
                                </View>
                              ) : null}
                              {almostFull && (
                                <View style={{
                                  backgroundColor: STATUS.soon.bgSoft,
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 8,
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS.soon.fg }}>
                                    {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
                                  </Text>
                                </View>
                              )}
                              {/* [AVAILABILITY_V1] Calendar-fit chip */}
                              {availChip && (
                                <View style={{
                                  backgroundColor: availChip.tone ? STATUS[availChip.tone].bgSoft : "rgba(255,255,255,0.15)",
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 8,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: "600",
                                    color: availChip.tone ? STATUS[availChip.tone].fg : "rgba(255,255,255,0.8)",
                                  }}>
                                    {availChip.label}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              }}
            />
          )}
        </View>
      ) : (
        /* ═══ Saved Tab ═══ */
        <View style={{ flex: 1 }}>
          {showDiscoverLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color={themeColor} />
            </View>
          ) : savedEventsList.length === 0 ? (
            /* ═══ Saved V2 — Empty State ═══ */
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 28,
                alignItems: "center", justifyContent: "center",
                backgroundColor: isDark ? "rgba(236,72,153,0.12)" : "rgba(236,72,153,0.08)",
                marginBottom: 16,
              }}>
                <Bookmark size={24} color={STATUS.interested.fg} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                Your shortlist
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 6 }}>
                Save events you're considering.{"\n"}They'll be here when you're ready to decide.
              </Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: "center", lineHeight: 18, marginBottom: 24 }}>
                Tap the heart on any event to save it.
              </Text>
              <Pressable
                testID="discover-saved-empty-browse-events"
                onPress={() => {
                  setLens("events");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: RADIUS.lg,
                  backgroundColor: themeColor,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>
                  Browse Events
                </Text>
              </Pressable>
            </View>
          ) : (
            /* ═══ Saved V2 — Event List with Time Groups ═══ */
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onManualRefresh}
                  tintColor={themeColor}
                />
              }
            >
              {(() => {
                let lastGroup = "";
                let itemIndex = 0;
                return savedEventsList.map((event) => {
                  const group = getSavedTimeGroup(event.startTime);
                  const showHeader = group !== lastGroup;
                  lastGroup = group;
                  const idx = itemIndex++;

                  const timeStr = new Date(event.startTime).toLocaleTimeString([], {
                    hour: "numeric", minute: "2-digit",
                  });
                  const dateStr = new Date(event.startTime).toLocaleDateString([], {
                    weekday: "short", month: "short", day: "numeric",
                  });
                  const savedUrgency = getUrgencyLabel(event.startTime);
                  const savedAvailChip = getAvailabilityChip(availabilityMap.get(event.id) ?? "unknown");
                  const isToday = group === "Today";
                  const isTomorrow = group === "Tomorrow";

                  return (
                    <React.Fragment key={event.id}>
                      {showHeader && (
                        <Animated.View entering={FadeInDown.delay(idx * 40).duration(200)} style={{ marginTop: idx > 0 ? 10 : 0, marginBottom: 8 }}>
                          <Text style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: (isToday || isTomorrow) ? STATUS.soon.fg : colors.textSecondary,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}>
                            {group}
                          </Text>
                        </Animated.View>
                      )}
                      <Animated.View
                        entering={FadeInDown.delay(idx * 40).duration(240)}
                        style={{ marginBottom: 10 }}
                      >
                        <Pressable
                          testID="discover-saved-row-open"
                          onPress={() => handleEventPress(event.id)}
                          style={({ pressed }) => ({
                            backgroundColor: colors.surface,
                            borderColor: isToday ? STATUS.soon.fg + "30" : colors.borderSubtle,
                            borderWidth: 1,
                            borderRadius: RADIUS.lg,
                            padding: 14,
                            opacity: pressed ? 0.85 : 1,
                            ...tileShadow,
                          })}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <View
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: RADIUS.md,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: themeColor + "20",
                                overflow: "hidden",
                                marginRight: 12,
                              }}
                            >
                              <EventPhotoEmoji
                                photoUrl={event.visibility !== "private" ? event.eventPhotoUrl : undefined}
                                emoji={event.emoji || "\uD83D\uDCC5"}
                                emojiClassName="text-xl"
                              />
                            </View>

                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text
                                style={{ fontWeight: "600", fontSize: 15, color: colors.text }}
                                numberOfLines={1}
                              >
                                {event.title}
                              </Text>
                              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3, flexWrap: "wrap", gap: 2 }}>
                                <Clock size={12} color={colors.textTertiary} />
                                <Text
                                  style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 4 }}
                                  numberOfLines={1}
                                >
                                  {isToday ? timeStr : isTomorrow ? timeStr : `${dateStr}, ${timeStr}`}
                                </Text>
                              </View>
                              {event.location && (
                                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                                  <MapPin size={12} color={colors.textTertiary} />
                                  <Text
                                    style={{ fontSize: 12, color: colors.textTertiary, marginLeft: 4 }}
                                    numberOfLines={1}
                                  >
                                    {event.location}
                                  </Text>
                                </View>
                              )}
                              {/* Hosted by — social proof for decision making */}
                              {event.user?.name && (
                                <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
                                  Hosted by {event.user.name}
                                </Text>
                              )}
                            </View>

                            <View style={{ alignItems: "flex-end", gap: 4 }}>
                              {savedUrgency.label ? (
                                <View style={{
                                  backgroundColor: savedUrgency.tone === "soon" ? STATUS.soon.bgSoft : STATUS.info.bgSoft,
                                  paddingHorizontal: 8,
                                  paddingVertical: 2,
                                  borderRadius: 6,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: "700",
                                    color: savedUrgency.tone === "soon" ? STATUS.soon.fg : STATUS.info.fg,
                                  }}>
                                    {savedUrgency.label}
                                  </Text>
                                </View>
                              ) : null}
                              {/* [SAVED_V2] Show availability alongside urgency — both useful for decisions */}
                              {savedAvailChip && (
                                <View style={{
                                  backgroundColor: savedAvailChip.tone ? STATUS[savedAvailChip.tone].bgSoft : undefined,
                                  paddingHorizontal: 8,
                                  paddingVertical: 2,
                                  borderRadius: 6,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: "600",
                                    color: savedAvailChip.tone ? STATUS[savedAvailChip.tone].fg : colors.textSecondary,
                                  }}>
                                    {savedAvailChip.label}
                                  </Text>
                                </View>
                              )}
                              {event.attendeeCount > 0 && (
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                  <Users size={11} color={STATUS.going.fg} />
                                  <Text style={{ fontSize: 11, color: STATUS.going.fg, fontWeight: "600", marginLeft: 3 }}>
                                    {event.attendeeCount}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </Pressable>
                      </Animated.View>
                    </React.Fragment>
                  );
                });
              })()}
            </ScrollView>
          )}
        </View>
      )}

      <BottomNavigation />
    </SafeAreaView>
  );
}
