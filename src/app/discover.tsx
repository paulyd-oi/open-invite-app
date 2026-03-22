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
import { BlurView } from "expo-blur";
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
  Calendar,
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
import { eventKeys, deriveAttendeeCount, logRsvpMismatch, invalidateEventKeys, getInvalidateAfterRsvpJoin } from "@/lib/eventQueryKeys";
import { postIdempotent } from "@/lib/idempotencyKey";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { Button } from "@/ui/Button";
import { STATUS, HERO_GRADIENT } from "@/ui/tokens";
import { resolveEventTheme } from "@/lib/eventThemes";
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
  description?: string | null;
  eventPhotoUrl?: string | null;
  themeId?: string | null;
  joinRequests?: Array<{
    id: string;
    userId: string;
    status: string;
    user: { id: string; name: string | null; image: string | null };
  }>;
  attendeePreview?: Array<{
    id: string;
    image: string | null;
    name: string | null;
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
  const [chromeHeight, setChromeHeight] = useState<number>(160);
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
      // [INVALIDATION_GAPS_V1] Use SSOT helper instead of ad-hoc 2-key invalidation
      invalidateEventKeys(queryClient, getInvalidateAfterRsvpJoin(eventId), "discover_save");
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
    queryFn: () => api.get<{ events: PopularEvent[] }>("/api/events/feed"),
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

  // [QA-8] Suppress login flash: only show sign-in prompt when definitively logged out
  if (!session) {
    if (bootStatus !== 'loggedOut') return null;
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <Stack.Screen options={{ headerShown: false }} />

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
          style={{ paddingTop: discoverInsets.top, overflow: "hidden" }}
        >
          {/* Subtle bottom border for definition */}
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
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

            <View className="px-5" style={{ paddingBottom: 12 }}>
              {/* ═══ Lens Switcher ═══ */}
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <View className="flex-row rounded-full p-0.5" style={{ backgroundColor: isDark ? "rgba(44,44,46,0.7)" : "rgba(240,240,240,0.7)" }}>
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
                      style={active ? { backgroundColor: isDark ? "rgba(58,58,60,0.9)" : "rgba(255,255,255,0.95)", ...tileShadow } : undefined}
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
          </View>
        </BlurView>
      </View>

      {lens === "ideas" ? (
        /* ═══ Ideas Deck ═══ */
        <View style={{ flex: 1, paddingTop: chromeHeight }}>
          <DailyIdeasDeck />
        </View>
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
                top: chromeHeight + 12,
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
              contentContainerStyle={{ padding: 20, paddingTop: chromeHeight + 16, paddingBottom: 100 }}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onManualRefresh}
                  tintColor={themeColor}
                  progressViewOffset={chromeHeight}
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
                const hostName = event.user?.name?.split(" ")[0] ?? null;
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
                const cardTheme = resolveEventTheme(event.themeId);
                const cardAccent = cardTheme.backAccent;
                const plaqueBg = isDark ? cardTheme.backBgDark : cardTheme.backBgLight;

                return (
                  <Animated.View entering={FadeInDown.delay(index * 30).duration(220)} style={{ marginBottom: 18 }}>
                    <Pressable
                      testID="discover-card-open"
                      onPress={() => handleEventPress(event.id)}
                      style={{
                        borderRadius: 20,
                        overflow: "hidden",
                        backgroundColor: plaqueBg,
                        borderWidth: cardAccent ? 1.5 : 1,
                        borderColor: cardAccent ? `${cardAccent}25` : colors.borderSubtle,
                        ...tileShadow,
                      }}
                    >
                      {/* ── Image zone ── */}
                      <View style={{ aspectRatio: 1.9, position: "relative" }}>
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
                              backgroundColor: cardTheme
                                ? (isDark ? cardTheme.pageTintDark : cardTheme.pageTintLight)
                                : isDark ? "#2C2C2E" : "#FFF7ED",
                            }}
                          >
                            <Text style={{ fontSize: 52 }}>{event.emoji || "\uD83D\uDCC5"}</Text>
                          </View>
                        )}

                        {/* Category pill — image top-left */}
                        {cardTheme && cardTheme.label !== "Classic" && (
                          <View style={{
                            position: "absolute",
                            top: 12,
                            left: 12,
                            backgroundColor: "rgba(0,0,0,0.5)",
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 8,
                          }}>
                            <Text style={{
                              fontSize: 10,
                              fontWeight: "800",
                              color: "#FFFFFF",
                              letterSpacing: 0.8,
                              textTransform: "uppercase",
                            }}>
                              {cardTheme.label}
                            </Text>
                          </View>
                        )}

                        {/* Urgency chip — image top-left (below category if present) */}
                        {urgency.label ? (
                          <View style={{
                            position: "absolute",
                            top: cardTheme && cardTheme.label !== "Classic" ? 42 : 12,
                            left: 12,
                            backgroundColor: urgency.tone === "soon"
                              ? STATUS.soon.bgSoft
                              : "rgba(0,0,0,0.45)",
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 8,
                          }}>
                            <Text style={{
                              fontSize: 11,
                              fontWeight: "700",
                              color: urgency.tone === "soon" ? STATUS.soon.fg : "#FFFFFF",
                            }}>
                              {urgency.label}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* ── Themed content panel ── */}
                      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
                        {/* TOP ROW: Title + Save/Bookmark */}
                        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                          <Text
                            style={{
                              flex: 1,
                              color: colors.text,
                              fontSize: 18,
                              fontWeight: "700",
                              lineHeight: 24,
                              letterSpacing: -0.2,
                            }}
                            numberOfLines={2}
                          >
                            {event.emoji} {event.title}
                          </Text>
                          <Pressable
                            testID="discover-card-save"
                            disabled={saved || saveMutation.isPending}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              saveMutation.mutate(event.id);
                            }}
                            hitSlop={10}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              alignItems: "center",
                              justifyContent: "center",
                              marginLeft: 10,
                              marginTop: 1,
                              backgroundColor: saved
                                ? STATUS.interested.bgSoft
                                : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"),
                              opacity: saveMutation.isPending ? 0.5 : 1,
                            }}
                          >
                            <Bookmark
                              size={16}
                              color={saved ? STATUS.interested.fg : colors.textTertiary}
                            />
                          </Pressable>
                        </View>

                        {/* DESCRIPTION (1-2 lines) */}
                        {event.description ? (
                          <Text
                            style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "400", marginTop: 6, lineHeight: 18 }}
                            numberOfLines={2}
                          >
                            {event.description}
                          </Text>
                        ) : null}

                        {/* FOOTER ROW: date/time + availability | attendees */}
                        <View style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 12,
                          paddingTop: 12,
                          borderTopWidth: 1,
                          borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        }}>
                          {/* Left: date/time + "Looks clear" pill */}
                          <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 6 }}>
                            <Calendar size={12} color={cardAccent ?? colors.textSecondary} />
                            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.1 }}>
                              {dateStr}, {timeStr}
                            </Text>
                            {/* [AVAILABILITY_V1] Calendar-fit chip */}
                            {availChip && (
                              <View style={{
                                backgroundColor: availChip.tone ? STATUS[availChip.tone].bgSoft : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}>
                                <Text style={{
                                  fontSize: 10,
                                  fontWeight: "600",
                                  color: availChip.tone ? STATUS[availChip.tone].fg : colors.textTertiary,
                                }}>
                                  {availChip.label}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Right: attendee avatar stack (visual only) */}
                          {(() => {
                            const count = event.attendeeCount ?? 0;
                            if (count === 0) return null;

                            // Build avatar list: attendeePreview (going RSVPs) first, then joinRequests, then host
                            const fromPreview = (event.attendeePreview ?? [])
                              .map((a) => ({ id: a.id, name: a.name ?? null, image: a.image ?? null }));
                            const fromJR = (event.joinRequests ?? [])
                              .filter((r) => r.status === "accepted" && r.user)
                              .map((r) => ({ id: r.userId, name: r.user?.name ?? null, image: r.user?.image ?? null }));

                            // Always include host — they're an attendee on open events
                            const host = event.user
                              ? { id: event.user.id, name: event.user.name, image: event.user.image }
                              : null;

                            // Merge: attendeePreview first, then joinRequests, then host (dedupe)
                            const seen = new Set<string>();
                            const merged: { id: string; name: string | null; image: string | null }[] = [];
                            for (const a of [...fromPreview, ...fromJR, ...(host ? [host] : [])]) {
                              if (!seen.has(a.id)) { seen.add(a.id); merged.push(a); }
                            }

                            const displayed = merged.slice(0, 3);
                            const remaining = Math.max(0, count - displayed.length);
                            const AVSZ = 24;

                            // [DISCOVER_AVATAR_FIX] DEV diagnostic
                            if (__DEV__ && index < 3) {
                              devLog("[DISCOVER_AVATAR_FIX]", {
                                eventId: event.id,
                                title: event.title,
                                attendeeCount: count,
                                attendeePreviewCount: (event.attendeePreview ?? []).length,
                                joinRequestsRaw: (event.joinRequests ?? []).length,
                                fromPreviewCount: fromPreview.length,
                                fromJRCount: fromJR.length,
                                hostId: host?.id ?? null,
                                hostImage: host?.image ?? null,
                                displayedCount: displayed.length,
                                displayedImages: displayed.map((a) => ({ id: a.id, hasImage: !!a.image })),
                                remaining,
                              });
                            }

                            return (
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                {displayed.map((a, i) => (
                                  <View
                                    key={a.id}
                                    style={{
                                      marginLeft: i > 0 ? -7 : 0,
                                      borderWidth: 2,
                                      borderColor: plaqueBg,
                                      borderRadius: AVSZ / 2,
                                      zIndex: 3 - i,
                                    }}
                                  >
                                    <EntityAvatar
                                      photoUrl={a.image}
                                      initials={a.name?.[0] ?? "?"}
                                      size={AVSZ - 4}
                                      backgroundColor={a.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : `${cardAccent ?? themeColor}20`}
                                      foregroundColor={cardAccent ?? themeColor}
                                      fallbackIcon="person-outline"
                                    />
                                  </View>
                                ))}
                                {remaining > 0 && (
                                  <View style={{
                                    width: AVSZ,
                                    height: AVSZ,
                                    borderRadius: AVSZ / 2,
                                    marginLeft: -7,
                                    borderWidth: 2,
                                    borderColor: plaqueBg,
                                    backgroundColor: cardAccent ?? themeColor,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    zIndex: 0,
                                  }}>
                                    <Text style={{ fontSize: 9, fontWeight: "700", color: "#fff" }}>
                                      +{remaining}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            );
                          })()}
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
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: chromeHeight }}>
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
              contentContainerStyle={{ padding: 20, paddingTop: chromeHeight + 8, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onManualRefresh}
                  tintColor={themeColor}
                  progressViewOffset={chromeHeight}
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
