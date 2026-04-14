import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Share,
  Linking,
  AppState,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { devLog } from "@/lib/devLog";
import { useLiveRefreshContract } from "@/lib/useLiveRefreshContract";
import { EventPhotoEmoji } from "@/components/EventPhotoEmoji";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useRouter, Stack } from "expo-router";
import {
  MapPin,
  Users,
  Clock,
  Heart,
  Bookmark,
  Calendar,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeInUp, FadeOutUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { softenColor } from "@/lib/softenColor";
import { Image as ExpoImage } from "expo-image";

import { useSession } from "@/lib/useSession";
import { useWhosDownSeen } from "@/lib/whosDownSeen";
import { api } from "@/lib/api";
import { useTheme, TILE_SHADOW } from "@/lib/ThemeContext";
import { buildAppSharePayload } from "@/lib/shareSSOT";
import { TAB_BOTTOM_PADDING } from "@/lib/layoutSpacing";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { safeToast } from "@/lib/safeToast";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useLoadedOnce } from "@/lib/loadingInvariant";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import BottomNavigation from "@/components/BottomNavigation";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppHeader } from "@/components/AppHeader";
import { HelpSheet, HELP_SHEETS } from "@/components/HelpSheet";
import { useActivationNudge } from "@/hooks/useActivationNudge";
import { ActivationNudgeCard } from "@/components/activation/ActivationNudgeCard";
// Hidden for v1.3 — replaced with Map
// import { DailyIdeasDeck } from "@/components/ideas/DailyIdeasDeck";
// Safe dynamic require — native pod may not exist on older builds (315-320)
let RNMapView: any = null;
let RNMarker: any = null;
let RNCallout: any = null;
try {
  const maps = require("react-native-maps");
  RNMapView = maps.default;
  RNMarker = maps.Marker;
  RNCallout = maps.Callout;
} catch {
  // Native module not available — builds without pod install
}
import { EventVisibilityBadge } from "@/components/EventVisibilityBadge";
import { eventKeys, deriveAttendeeCount, logRsvpMismatch, invalidateEventKeys, getInvalidateAfterRsvpJoin } from "@/lib/eventQueryKeys";
import { postIdempotent } from "@/lib/idempotencyKey";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { Button } from "@/ui/Button";
import { STATUS, HERO_GRADIENT } from "@/ui/tokens";
import { resolveEventTheme } from "@/lib/eventThemes";
import { RADIUS } from "@/ui/layout";
import { computeAvailabilityBatch, getAvailabilityChip } from "@/lib/availabilitySignal";
import type { GetEventsResponse, GetEventsFeedResponse, GetFriendsHostedFeedResponse, GetFriendsResponse, WhosDownFeedResponse, EventRequest, CreateEventRequestResponse, RespondEventRequestResponse } from "@/shared/contracts";
import { EVENT_CATEGORIES } from "@/shared/contracts";
import { qk } from "@/lib/queryKeys";
import * as Location from "expo-location";
import { DEFAULT_ENDREACHED_DEBOUNCE_MS } from "@/lib/infiniteQuerySSOT";
import { formatLocationShort } from "@/lib/locationFormat";
import { isEventResponded, isEventVisibleInMap, isEventVisibleInFeed, isEventEligibleForDiscoverPool, getEffectiveTime, isVisibleInPublicFeed, comparePublicFeedOrder, PUBLIC_NEARBY_MILES, type GeoPoint } from "@/lib/discoverFilters";
import { trackDiscoverSurfaceViewed, trackDiscoverEventOpened } from "@/analytics/analyticsEventsSSOT";

// ── Luminance contrast helper — returns black or white for readability on cardColor ──
function getTextColorForBg(hex: string): "#000000" | "#FFFFFF" {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

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
  cardColor?: string | null;
  isRecurring?: boolean;
  recurrence?: string | null;
  nextOccurrence?: string | null;
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
  circleId?: string | null;
  circleName?: string | null;
  groupVisibility?: Array<{ groupId: string; group: { id: string; name: string; color: string } }> | null;
  userId?: string;
  eventHook?: string | null;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

// [WHOS_DOWN_V1] Discover nav: Map / Events / Who's Down. Responded folds into Events pills.
type Lens = "map" | "events" | "whos_down";
const LENS_OPTIONS: { key: Lens; label: string }[] = [
  { key: "map", label: "Map" },
  { key: "events", label: "Events" },
  { key: "whos_down", label: "Who's Down" },
];

// [WHOS_DOWN_V1] Going / Not Going are first-class pills in the same row as the other event
// sorts — no Responded parent pill, no second-row sub-filter. They reuse the existing
// respondedGoingSorted / respondedNotGoingSorted datasets.
type EventSort = "popular" | "soon" | "friends" | "saved" | "group" | "public" | "going" | "not_going";
const SORT_OPTIONS: { key: EventSort; label: string }[] = [
  { key: "soon", label: "Soon" },
  { key: "popular", label: "Popular" },
  { key: "friends", label: "Friends" },
  { key: "saved", label: "Saved" },
  { key: "group", label: "Group" },
  { key: "public", label: "Public" },
  { key: "going", label: "Going" },
  { key: "not_going", label: "Not Going" },
];

// [DISCOVER_PANE_ISOLATION_V1] Inline, non-full-screen fallback used by each
// Discover pane's <ErrorBoundary>. A render-time crash in one pane shows this
// local fallback while the shell + sibling panes stay interactive.
function DiscoverPaneErrorFallback({
  paneLabel,
  onRetry,
  textColor,
  subTextColor,
  accentColor,
  topPadding,
}: {
  paneLabel: string;
  onRetry: () => void;
  textColor: string;
  subTextColor: string;
  accentColor: string;
  topPadding: number;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: topPadding }}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: textColor, textAlign: "center", marginBottom: 6 }}>
        Couldn&apos;t render this view
      </Text>
      <Text style={{ fontSize: 14, color: subTextColor, textAlign: "center", marginBottom: 16, lineHeight: 20 }}>
        Try switching tabs or tap retry. The rest of Discover is still available.
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={`Retry ${paneLabel}`}
        style={{
          backgroundColor: accentColor,
          paddingHorizontal: 18,
          paddingVertical: 10,
          borderRadius: 10,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>Try Again</Text>
      </Pressable>
    </View>
  );
}

export default function DiscoverScreen() {
  const mountTime = useRef(Date.now());
  const { data: session } = useSession();
  const { status: bootStatus, retry: retryBootstrap } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

  // ── Lens state ──
  const [lens, setLens] = useState<Lens>("events");
  const [eventSort, setEventSort] = useState<EventSort>("soon");
  type MapFilter = "friends" | "public";
  const [mapFilter, setMapFilter] = useState<MapFilter>("friends");
  const [chromeHeight, setChromeHeight] = useState<number>(160);
  const queryClient = useQueryClient();

  // [WHOS_DOWN_V1] Creation bottom-sheet state
  const [showCreateWhosDown, setShowCreateWhosDown] = useState(false);
  const [wdTitle, setWdTitle] = useState("");
  const [wdTimeHint, setWdTimeHint] = useState<string | null>(null);
  const [wdWhere, setWdWhere] = useState("");

  // ── Discover surface view tracking (dedupe per pane+pill combo) ──
  const lastTrackedSurface = useRef<string>("");
  useEffect(() => {
    const pill = lens === "events" ? eventSort : null;
    const key = `${lens}:${pill ?? ""}`;
    if (key === lastTrackedSurface.current) return;
    lastTrackedSurface.current = key;
    trackDiscoverSurfaceViewed({ pane: lens, pill });
  }, [lens, eventSort]);

  // ── User location (shared by Map pane + Public pill distance cap) ──
  const SAN_DIEGO = { latitude: 32.7157, longitude: -117.1611 };
  const [userRegion, setUserRegion] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapLocationPermBlocked, setMapLocationPermBlocked] = useState(false);
  const mapRef = useRef<any>(null);
  const locationFetchedRef = useRef(false);

  useEffect(() => {
    // Fetch location when Map pane or Public pill is active (one-time)
    if (lens !== "map" && eventSort !== "public") return;
    if (locationFetchedRef.current) return;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          locationFetchedRef.current = true;
          setMapLocationPermBlocked(false);
        } else if (!perm.canAskAgain) {
          setMapLocationPermBlocked(true);
        }
      } catch {
        // fallback — no location available
      }
    })();
  }, [lens, eventSort]);

  // Manual location request for Map Public CTA
  const requestMapLocation = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        locationFetchedRef.current = true;
        setMapLocationPermBlocked(false);
      } else if (!perm.canAskAgain) {
        setMapLocationPermBlocked(true);
      }
    } catch {
      // permission denied or location unavailable
    }
  }, []);

  // Re-check location permission when returning from Settings
  useEffect(() => {
    if (lens !== "map" || mapFilter !== "public" || !mapLocationPermBlocked) return;
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          locationFetchedRef.current = true;
          setMapLocationPermBlocked(false);
        }
      } catch {
        // still no location
      }
    });
    return () => sub.remove();
  }, [lens, mapFilter, mapLocationPermBlocked]);

  // ── For You: save state + toast ──
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
    onMutate: async (eventId) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: eventKeys.feedPaginated() });
      await queryClient.cancelQueries({ queryKey: eventKeys.myEvents() });

      // Snapshot previous values for rollback
      const prevFeed = queryClient.getQueryData<InfiniteData<GetEventsFeedResponse, string | null>>(eventKeys.feedPaginated());
      const prevMyEvents = queryClient.getQueryData<{ events: PopularEvent[] }>(eventKeys.myEvents());

      // Optimistically update viewerRsvpStatus in infinite pages
      queryClient.setQueryData<InfiniteData<GetEventsFeedResponse, string | null>>(eventKeys.feedPaginated(), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            events: page.events.map((e) =>
              e.id === eventId ? { ...e, viewerRsvpStatus: "interested" as const } : e,
            ),
          })),
        };
      });
      // Patch myEvents (non-paginated)
      const patchMyEvents = (old: { events: PopularEvent[] } | undefined) => {
        if (!old) return old;
        return { ...old, events: old.events.map((e) => e.id === eventId ? { ...e, viewerRsvpStatus: "interested" as const } : e) };
      };
      queryClient.setQueryData(eventKeys.myEvents(), patchMyEvents);

      return { prevFeed, prevMyEvents };
    },
    onSuccess: (_data, eventId) => {
      invalidateEventKeys(queryClient, getInvalidateAfterRsvpJoin(eventId), "discover_save");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      flashSavedToast();
    },
    onError: (err, _eventId, context) => {
      // Rollback optimistic update
      if (context?.prevFeed) queryClient.setQueryData(eventKeys.feedPaginated(), context.prevFeed);
      if (context?.prevMyEvents) queryClient.setQueryData(eventKeys.myEvents(), context.prevMyEvents);
      if (__DEV__) devLog("[DISCOVER_SAVE_ERR]", err);
      safeToast.error("Couldn't save", "Please try again");
    },
  });

  // Surface tokens from theme SSOT
  const tileShadow = !isDark ? TILE_SHADOW : {};

  // SSOT: paginated feed — uses useInfiniteQuery with cursor-based pagination
  const FEED_PAGE_SIZE = 20;
  const lastEndReachedRef = useRef(0);
  const {
    data: feedInfiniteData,
    isLoading: loadingFeed,
    isFetching: fetchingFeed,
    refetch: refetchFeed,
    isError: feedError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: eventKeys.feedPaginated(),
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/api/events/feed?limit=${FEED_PAGE_SIZE}&cursor=${encodeURIComponent(pageParam)}`
        : `/api/events/feed?limit=${FEED_PAGE_SIZE}`;
      return api.get<GetEventsFeedResponse>(url);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev: InfiniteData<GetEventsFeedResponse, string | null> | undefined) => prev,
  });
  // Flatten pages into the same shape downstream code expects
  const feedData = useMemo(() => {
    if (!feedInfiniteData?.pages) return null;
    const events = feedInfiniteData.pages.flatMap((p) => p.events ?? []) as unknown as PopularEvent[];
    return { events };
  }, [feedInfiniteData?.pages]);

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

  // [FRIEND_BADGE] Lightweight friend-host lookup for badge on Events cards.
  // Fetches first page of friends-hosted-feed to build a Set of friend host user IDs.
  const { data: friendHostData } = useQuery({
    queryKey: eventKeys.friendsHostedFeed(),
    queryFn: () => api.get<GetFriendsHostedFeedResponse>("/api/events/friends-hosted-feed?days=30&limit=50"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // [FRIENDS_PILL] Friends feed — events where viewer's friends RSVP'd going
  // Fetch eagerly (not gated on pill selection) so data is ready when user taps Friends pill
  const { data: friendsFeedData, isLoading: loadingFriendsFeed, refetch: refetchFriendsFeed } = useQuery({
    queryKey: eventKeys.friendsFeed(),
    queryFn: () => api.get<{ events: PopularEvent[] }>("/api/events/feed?tab=friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev: { events: PopularEvent[] } | undefined) => prev,
  });

  // [WHOS_DOWN_V1] Friends-only casual feed. Gated only on auth so the lens badge
  // count is accurate even before user taps Who's Down.
  const { data: whosDownData, refetch: refetchWhosDown, error: whosDownError } = useQuery({
    queryKey: qk.whosDownFeed(),
    queryFn: () => api.get<WhosDownFeedResponse>("/api/event-requests/feed/whos-down"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const whosDownItems = whosDownData?.items ?? [];

  // [WHOS_DOWN_V1] Local-only unseen tracking for the Discover tab badge.
  // Badge reflects new ideas since the last time the user had the Who's Down
  // tab open with the feed loaded, not the total active count.
  const { seenIds: whosDownSeenIds, hydrated: whosDownSeenHydrated, markSeen: markWhosDownSeen } = useWhosDownSeen(
    session?.user?.id ?? null,
  );
  const whosDownUnseenCount = useMemo(() => {
    if (!whosDownSeenHydrated) return 0;
    let n = 0;
    for (const item of whosDownItems) {
      if (!whosDownSeenIds.has(item.id)) n += 1;
    }
    return n;
  }, [whosDownItems, whosDownSeenIds, whosDownSeenHydrated]);

  // Mark currently-loaded idea IDs as seen whenever the user is viewing the
  // Who's Down tab AND the feed has hydrated. Re-runs when the feed changes
  // (pull-to-refresh, invalidation after post/respond) so late-arriving items
  // also get marked seen as long as the tab is still open.
  useEffect(() => {
    if (lens !== "whos_down") return;
    if (!whosDownSeenHydrated) return;
    if (whosDownItems.length === 0) return;
    const ids = whosDownItems.map((i) => i.id);
    markWhosDownSeen(ids);
  }, [lens, whosDownSeenHydrated, whosDownItems, markWhosDownSeen]);

  // [WHOS_DOWN_V1] Create casual idea post
  const createWhosDownMutation = useMutation({
    mutationFn: (body: { title: string; timeHint?: string; whereText?: string }) =>
      api.post<CreateEventRequestResponse>("/api/event-requests", { ...body, mode: "casual" }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreateWhosDown(false);
      setWdTitle("");
      setWdTimeHint(null);
      setWdWhere("");
      queryClient.invalidateQueries({ queryKey: qk.whosDownFeed() });
      queryClient.invalidateQueries({ queryKey: qk.eventRequests() });
      safeToast.success("Posted!", "Your friends can see this idea now.");
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Oops", "Couldn't post. Please try again.");
    },
  });

  // [WHOS_DOWN_V1] Mark "I'm Down" on a casual post
  const respondWhosDownMutation = useMutation({
    mutationFn: (id: string) =>
      api.put<RespondEventRequestResponse>(`/api/event-requests/${id}/respond`, { status: "accepted" }),
    onMutate: (id: string) => {
      // Optimistically bump local down state: surface will refetch on success.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.whosDownFeed() });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Oops", "Couldn't respond. Please try again.");
    },
  });

  // Friend count for nudge gating — shares cache key with Friends/Calendar/etc.
  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 120_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const friendCount = friendsData?.friends?.length ?? -1; // -1 = not yet loaded

  // [ACTIVATION_NUDGE] Derive first-session signals from already-loaded queries.
  const hostedCount = myEventsData?.events?.filter((e) => e.user?.id === session?.user?.id).length ?? 0;
  const myRsvpCount = (feedInfiniteData?.pages ?? []).reduce((n, p) => {
    return n + (p.events ?? []).filter((e) => e.viewerRsvpStatus === "going" || e.viewerRsvpStatus === "interested").length;
  }, 0);
  const activationSignalsLoading =
    friendCount === -1 || loadingMyEvents || !feedInfiniteData;
  const { activeNudge: activationNudge, dismiss: dismissActivationNudge } = useActivationNudge({
    userId: session?.user?.id,
    hasFriends: friendCount > 0,
    hasCreatedEvent: hostedCount > 0,
    hasRsvpd: myRsvpCount > 0,
    loading: activationSignalsLoading,
  });

  const friendHostUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of friendHostData?.events ?? []) {
      if (event.user?.id) ids.add(event.user.id);
    }
    return ids;
  }, [friendHostData?.events]);

  // [FRIENDS_PILL] Set of viewer's direct friend user IDs for social proof cross-referencing
  const friendUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of friendsData?.friends ?? []) {
      if (f.friend?.id) ids.add(f.friend.id);
    }
    return ids;
  }, [friendsData?.friends]);

  const isLoading = loadingFeed || loadingMyEvents;
  // [DISCOVER_FAIL_SOFT_V1] Narrow fatal guard: only blank the surface when BOTH
  // core queries have errored AND we have no cached/derived events to render.
  // A single failing non-core query (attending, friendsHosted, friendsFeed, friends)
  // must NEVER blank Discover — those degrade to pane/section empty states.
  const hasAnyCoreEventData = !!(
    (feedData?.events && feedData.events.length > 0) ||
    (myEventsData?.events && myEventsData.events.length > 0)
  );
  const isFatalError = feedError && myEventsError && !hasAnyCoreEventData;

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
    refetchFns: [refetchFeed, refetchMyEvents, refetchFriendsFeed, refetchWhosDown],
  });

  // ── SSOT: merge + deduplicate + enrich all events ──
  const enrichedEvents = useMemo(() => {
    const feedEvents = feedData?.events ?? [];
    const myEvents = myEventsData?.events ?? [];

    // [DISCOVER_SHAPE_GUARD_V1] Drop malformed records at the derivation boundary so a
    // single bad row from the backend cannot crash the entire Discover render (which
    // would blank the surface despite the fail-soft fatal guard). Required shape for
    // downstream dedup/sort/filter: non-empty id, title, startTime.
    const isShapeValid = (e: PopularEvent | undefined | null): e is PopularEvent =>
      !!e && typeof e.id === "string" && !!e.id &&
      typeof e.title === "string" && !!e.title &&
      typeof e.startTime === "string" && !!e.startTime;

    // Step 1: id-based dedup (merge feed + my events)
    const allEventsMap = new Map<string, PopularEvent>();
    [...feedEvents, ...myEvents].forEach((event) => {
      if (!isShapeValid(event)) return;
      if (!allEventsMap.has(event.id)) {
        allEventsMap.set(event.id, event);
      }
    });

    if (__DEV__) console.log("[DISCOVER_DEDUP] RAW feed+my:", feedEvents.length + myEvents.length, "after id-dedup:", allEventsMap.size);

    // Step 2: Collapse recurring event instances into single entries per series.
    // Backend may return separate rows per occurrence — keep only the one
    // with the nearest upcoming time so each series appears once.
    // Uses TWO strategies:
    //   A) Full series key (isRecurring + recurrence + userId + title)
    //   B) Fallback: same host + same title (catches events where recurrence field is missing)
    const seriesMap = new Map<string, PopularEvent>();
    const titleDedupMap = new Map<string, PopularEvent>();

    for (const event of allEventsMap.values()) {
      const titleKey = event.title.toLowerCase().trim();
      // Strategy A: explicit recurring field match
      if (event.isRecurring && event.recurrence && event.user?.id) {
        const key = `series:${event.user.id}:${event.recurrence}:${titleKey}`;
        const existing = seriesMap.get(key);
        if (!existing) {
          seriesMap.set(key, event);
        } else {
          const existTime = new Date(existing.nextOccurrence ?? existing.startTime).getTime();
          const newTime = new Date(event.nextOccurrence ?? event.startTime).getTime();
          if (newTime < existTime) {
            seriesMap.set(key, event);
          }
        }
      } else {
        // Strategy B: title+host dedup for events missing recurrence metadata
        // (backend may return duplicates with unique ids but identical host+title)
        const hostTitleKey = `ht:${event.user?.id ?? "anon"}:${titleKey}`;
        const existing = titleDedupMap.get(hostTitleKey);
        if (!existing) {
          titleDedupMap.set(hostTitleKey, event);
        } else {
          // Keep the nearest upcoming occurrence
          const existTime = new Date(existing.nextOccurrence ?? existing.startTime).getTime();
          const newTime = new Date(event.nextOccurrence ?? event.startTime).getTime();
          if (newTime < existTime) {
            titleDedupMap.set(hostTitleKey, event);
          }
        }
      }
    }

    // Merge both maps (series keys and title-dedup keys are disjoint by prefix)
    const allEvents = [...seriesMap.values(), ...titleDedupMap.values()];

    if (__DEV__) console.log("[DISCOVER_DEDUP] after series collapse:", allEvents.length, "(series:", seriesMap.size, "title:", titleDedupMap.size, ")");
    const now = Date.now();

    // Enrich with canonical attendee count + filter to eligible discover pool
    return allEvents
      .filter((e) => isEventEligibleForDiscoverPool(e, now))
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
  const respondedSorted = useMemo(() => {
    return enrichedEvents
      .filter(isEventResponded)
      .sort((a, b) => getEffectiveTime(a) - getEffectiveTime(b));
  }, [enrichedEvents]);

  const respondedGoingSorted = useMemo(() => {
    return respondedSorted.filter((e) => e.viewerRsvpStatus === "going");
  }, [respondedSorted]);

  const respondedNotGoingSorted = useMemo(() => {
    return respondedSorted.filter((e) => e.viewerRsvpStatus === "not_going");
  }, [respondedSorted]);

  const popularSorted = useMemo(() => {
    return [...enrichedEvents]
      .filter(isEventVisibleInFeed)
      .sort((a, b) => b.attendeeCount - a.attendeeCount || getEffectiveTime(b) - getEffectiveTime(a));
  }, [enrichedEvents]);

  const soonSorted = useMemo(() => {
    return [...enrichedEvents]
      .filter(isEventVisibleInFeed)
      .sort((a, b) => getEffectiveTime(a) - getEffectiveTime(b));
  }, [enrichedEvents]);

  // Group events: circle/group-visibility events from own + attending data (sorted soonest-first)
  const groupSorted = useMemo(() => {
    const myEvents = myEventsData?.events ?? [];
    const now = Date.now();
    const GROUP_VIS = ["circle_only", "specific_groups"];
    return myEvents
      .filter((e) => {
        // Include events with circleId OR circle/group visibility
        const isGroup = !!e.circleId || (e.visibility && GROUP_VIS.includes(e.visibility));
        if (!isGroup) return false;
        return getEffectiveTime(e) >= now;
      })
      .map((event) => {
        const derivedCount = deriveAttendeeCount(event);
        const attendeeCount = event.displayGoingCount ?? event.goingCount ?? derivedCount;
        return { ...event, attendeeCount };
      })
      .filter(isEventVisibleInFeed)
      .sort((a, b) => getEffectiveTime(a) - getEffectiveTime(b));
  }, [myEventsData?.events]);

  // [FRIENDS_PILL] Friends feed from backend (already filtered/sorted by goingCount desc)
  const friendsSorted = useMemo(() => {
    return (friendsFeedData?.events ?? [])
      .filter(isEventVisibleInFeed)
      .map((event) => {
        const derivedCount = deriveAttendeeCount(event);
        const attendeeCount = event.displayGoingCount ?? event.goingCount ?? derivedCount;
        return { ...event, attendeeCount };
      });
  }, [friendsFeedData?.events]);

  // Saved events list (interested/maybe from server + locally saved), sorted soonest-first, past filtered
  const savedEventsList = useMemo(() => {
    const now = Date.now();
    return enrichedEvents
      .filter((e) => {
        if (getEffectiveTime(e) < now) return false; // filter past
        return e.viewerRsvpStatus === "interested" || e.viewerRsvpStatus === "maybe";
      })
      .sort((a, b) => getEffectiveTime(a) - getEffectiveTime(b));
  }, [enrichedEvents]);

  // Public events: visibility === "public", within 50mi if location available
  // Sort: nearby coord events first (distance ASC), then no-coord events (time ASC)
  // [PUBLIC_LANE_OWN_EVENTS_V1] Pass viewer user id so own public events bypass
  // the responded filter (host is auto-"going" for their own event).
  const publicSorted = useMemo(() => {
    const now = Date.now();
    const loc: GeoPoint | null = userRegion;
    const viewerUserId = session?.user?.id ?? null;
    return enrichedEvents
      .filter((e) => isVisibleInPublicFeed(e, loc, now, viewerUserId))
      .sort((a, b) => comparePublicFeedOrder(a, b, loc));
  }, [enrichedEvents, userRegion, session?.user?.id]);

  // Active Events feed based on sort control
  // [WHOS_DOWN_V1] Going / Not Going are first-class pills reusing the respondedGoingSorted /
  // respondedNotGoingSorted datasets — no nested navigation, no second-row sub-filter.
  const activeFeed = eventSort === "public" ? publicSorted
    : eventSort === "friends" ? friendsSorted
    : eventSort === "saved" ? savedEventsList
    : eventSort === "group" ? groupSorted
    : eventSort === "soon" ? soonSorted
    : eventSort === "going" ? respondedGoingSorted
    : eventSort === "not_going" ? respondedNotGoingSorted
    : popularSorted;

  // ── Host event count: derive "Active Host" badge (5+ events) ──
  const hostEventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of enrichedEvents) {
      const hostId = e.user?.id;
      if (hostId) counts.set(hostId, (counts.get(hostId) ?? 0) + 1);
    }
    return counts;
  }, [enrichedEvents]);

  // ── Map events: filter by Friends | Public map sub-filter ──
  // [PUBLIC_LANE_OWN_EVENTS_V1] Map Public passes viewer user id so the host's
  // own public events aren't dropped by the responded filter. Map markers still
  // require valid coordinates via isEventVisibleInMap — an own public event
  // without coords remains off the map (that's a map-marker contract, not a
  // public-lane contract).
  const mapEvents = useMemo(() => {
    const visibleOnMap = enrichedEvents.filter(isEventVisibleInMap);
    if (mapFilter === "public") {
      const now = Date.now();
      const loc: GeoPoint | null = userRegion;
      const viewerUserId = session?.user?.id ?? null;
      return visibleOnMap
        .filter(e => isVisibleInPublicFeed(e, loc, now, viewerUserId));
    }
    // Friends: exclude public events
    return visibleOnMap.filter(e => e.visibility !== "public");
  }, [enrichedEvents, mapFilter, userRegion, session?.user?.id]);

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

  const handleEventPress = (eventId: string, interactionMode: "map_pin" | "map_callout" | "event_card" | "list_row", event?: PopularEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const pane = lens;
    const pill = lens === "events" ? eventSort : null;
    trackDiscoverEventOpened({
      eventId,
      pane,
      pill,
      interactionMode,
      viewerRsvpStatus: event?.viewerRsvpStatus ?? null,
    });
    router.push(`/event/${eventId}?from=discover&discoverSource=${pane}&discoverPill=${pill ?? ""}`);
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

  // [DISCOVER_FAIL_SOFT_V1] Full-screen fatal ONLY when core payload truly cannot render.
  // Secondary query failures (attending, friendsHosted, friendsFeed, friends, map/public
  // derivations) degrade to pane-level empty states — not a blanket blocker.
  if (isFatalError && !showDiscoverLoading) {
    return (
      <LoadingTimeoutUI
        context="discover"
        onRetry={handleRetry}
        isRetrying={isRetrying}
        showBottomNav={true}
        title="Couldn't load events"
        message="Check your connection and try again."
      />
    );
  }

  return (
    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={[]}>
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
                  // [WHOS_DOWN_V1] Unseen count badge on Who's Down tab.
                  // Client-side seen state — shows NEW ideas since last open,
                  // not total active count.
                  const showBadge = opt.key === "whos_down" && whosDownUnseenCount > 0;
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
                      className="flex-1 items-center py-2 rounded-full flex-row justify-center"
                      style={active ? { backgroundColor: isDark ? "rgba(58,58,60,0.9)" : "rgba(255,255,255,0.95)", ...tileShadow } : undefined}
                    >
                      <Text
                        className={`text-sm ${active ? "font-semibold" : "font-normal"}`}
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        style={{ color: active ? themeColor : colors.textTertiary }}
                      >
                        {opt.label}
                      </Text>
                      {showBadge && (
                        <View
                          style={{
                            marginLeft: 5,
                            minWidth: 18,
                            height: 18,
                            paddingHorizontal: 5,
                            borderRadius: 9,
                            backgroundColor: themeColor,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFFFFF" }}>
                            {whosDownUnseenCount > 99 ? "99+" : whosDownUnseenCount}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </BlurView>
      </View>

      {lens === "map" ? (
        /* ═══ Map View ═══ */
        /* [DISCOVER_PANE_ISOLATION_V1] Pane-level error boundary */
        <ErrorBoundary
          fallback={({ reset }) => (
            <DiscoverPaneErrorFallback
              paneLabel="Map"
              onRetry={reset}
              textColor={colors.text}
              subTextColor={colors.textSecondary}
              accentColor={themeColor}
              topPadding={chromeHeight + 16}
            />
          )}
        >
        <View style={{ flex: 1 }}>
          {!RNMapView ? (
            /* Fallback when native module is missing (OTA on builds 315-320) */
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32, paddingTop: chromeHeight + 32 }}>
              <MapPin size={40} color={colors.textTertiary} />
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text, textAlign: "center", marginTop: 12, marginBottom: 8 }}>
                Map requires an app update
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", marginBottom: 20, lineHeight: 20 }}>
                Update Open Invite to use the Map view.
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const { Linking } = require("react-native");
                  Linking.openURL("https://apps.apple.com/app/id6757429210");
                }}
                style={{
                  backgroundColor: themeColor,
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: RADIUS.lg,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Update Now</Text>
              </Pressable>
            </View>
          ) : (
          <RNMapView
            ref={mapRef}
            style={{ flex: 1 }}
            mapPadding={{ top: chromeHeight, right: 0, bottom: 0, left: 0 }}
            initialRegion={{
              ...(userRegion ?? SAN_DIEGO),
              latitudeDelta: 0.15,
              longitudeDelta: 0.15,
            }}
            region={userRegion ? { ...userRegion, latitudeDelta: 0.15, longitudeDelta: 0.15 } : undefined}
            showsUserLocation
            showsMyLocationButton
          >
            {mapEvents.map((event) => {
              const lat = (event.lat ?? event.latitude)!;
              const lng = (event.lng ?? event.longitude)!;
              const urgency = getUrgencyLabel(event.startTime);
              return (
                <RNMarker
                  key={event.id}
                  coordinate={{ latitude: lat, longitude: lng }}
                  title={`${event.emoji} ${event.title}`}
                  description={urgency.label || event.location || undefined}
                  onCalloutPress={() => handleEventPress(event.id, "map_callout", event)}
                >
                  <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    overflow: "hidden",
                    borderWidth: 2,
                    borderColor: "#FFFFFF",
                    ...(TILE_SHADOW as any),
                  }}>
                    {event.eventPhotoUrl ? (
                      <ExpoImage
                        source={{ uri: event.eventPhotoUrl }}
                        style={{ width: 40, height: 40 }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={{ width: 40, height: 40, backgroundColor: themeColor, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 18 }}>{event.emoji}</Text>
                      </View>
                    )}
                  </View>
                  <RNCallout tooltip onPress={() => handleEventPress(event.id, "map_callout", event)}>
                    <View style={{
                      backgroundColor: colors.surface,
                      borderRadius: 12,
                      padding: 12,
                      width: 220,
                      ...(TILE_SHADOW as any),
                    }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                        {event.emoji} {event.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                        {new Date(event.startTime).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(event.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </Text>
                      {urgency.label ? (
                        <Text style={{ fontSize: 12, fontWeight: "600", color: STATUS.soon.fg, marginTop: 2 }}>
                          {urgency.label}
                        </Text>
                      ) : null}
                      {event.location ? (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 3 }}>
                          <MapPin size={11} color={colors.textTertiary} />
                          <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                            {formatLocationShort(event.location)}
                          </Text>
                        </View>
                      ) : null}
                      {event.attendeeCount > 0 ? (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 3 }}>
                          <Users size={11} color={STATUS.going.fg} />
                          <Text style={{ fontSize: 12, color: STATUS.going.fg, fontWeight: "600" }}>
                            {event.attendeeCount} going
                          </Text>
                        </View>
                      ) : null}
                      <Text style={{ fontSize: 11, color: themeColor, fontWeight: "600", marginTop: 6 }}>
                        Tap to view →
                      </Text>
                    </View>
                  </RNCallout>
                </RNMarker>
              );
            })}
          </RNMapView>
          )}

          {/* Friends | Public map filter selector */}
          {RNMapView && (
          <View style={{
            position: "absolute",
            top: chromeHeight + 12,
            left: 0,
            right: 0,
            alignItems: "center",
            zIndex: 90,
          }} pointerEvents="box-none">
            <View style={{
              flexDirection: "row",
              backgroundColor: colors.surface,
              borderRadius: 10,
              padding: 3,
              ...(TILE_SHADOW as any),
            }}>
              {(["friends", "public"] as const).map((key) => {
                const active = mapFilter === key;
                return (
                  <Pressable
                    key={key}
                    /* INVARIANT_ALLOW_INLINE_HANDLER */
                    onPress={() => { Haptics.selectionAsync(); setMapFilter(key); }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: active ? themeColor : "transparent",
                    }}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: active ? "#FFFFFF" : colors.textSecondary,
                    }}>
                      {key === "friends" ? "Friends" : "Public"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          )}

          {/* Map Public no-location helper banner */}
          {RNMapView && mapFilter === "public" && !userRegion && (
          <View style={{
            position: "absolute",
            top: chromeHeight + 52,
            left: 16,
            right: 16,
            zIndex: 89,
          }} pointerEvents="box-none">
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              ...(TILE_SHADOW as any),
            }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1, marginRight: 10 }}>
                {mapLocationPermBlocked
                  ? "Location is off. Enable it in Settings to see nearby public events."
                  : "Showing all public events. Enable location for nearby results."}
              </Text>
              <Pressable
                /* INVARIANT_ALLOW_INLINE_HANDLER */
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (mapLocationPermBlocked) {
                    Linking.openSettings();
                  } else {
                    requestMapLocation();
                  }
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: themeColor,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#FFFFFF" }}>
                  {mapLocationPermBlocked ? "Open Settings" : "Enable Location"}
                </Text>
              </Pressable>
            </View>
          </View>
          )}

          {/* Event count overlay — only when map is available */}
          {RNMapView && (
          <View style={{
            position: "absolute",
            bottom: TAB_BOTTOM_PADDING + 16,
            left: 20,
            right: 20,
            alignItems: "center",
          }}>
            <View style={{
              backgroundColor: colors.surface,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              ...(TILE_SHADOW as any),
            }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
                {mapEvents.length === 0
                  ? "No events with locations nearby"
                  : `${mapEvents.length} event${mapEvents.length !== 1 ? "s" : ""} on map`}
              </Text>
            </View>
          </View>
          )}
        </View>
        </ErrorBoundary>
      ) : lens === "events" ? (
        /* ═══ Events Feed ═══ */
        /* [DISCOVER_PANE_ISOLATION_V1] Pane-level error boundary */
        <ErrorBoundary
          fallback={({ reset }) => (
            <DiscoverPaneErrorFallback
              paneLabel="Events"
              onRetry={reset}
              textColor={colors.text}
              subTextColor={colors.textSecondary}
              accentColor={themeColor}
              topPadding={chromeHeight + 16}
            />
          )}
        >
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
              contentContainerStyle={{ padding: 20, paddingTop: chromeHeight + 16, paddingBottom: TAB_BOTTOM_PADDING }}
              onEndReached={() => {
                const now = Date.now();
                if (now - lastEndReachedRef.current < DEFAULT_ENDREACHED_DEBOUNCE_MS) return;
                if (!hasNextPage || isFetchingNextPage) return;
                lastEndReachedRef.current = now;
                fetchNextPage();
              }}
              onEndReachedThreshold={0.5}
              ListFooterComponent={isFetchingNextPage ? (
                <View style={{ paddingVertical: 16, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={themeColor} />
                </View>
              ) : null}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onManualRefresh}
                  tintColor={themeColor}
                  progressViewOffset={chromeHeight}
                />
              }
              ListHeaderComponent={
                <>
                {/* [ACTIVATION_NUDGE] Shown at most 1 at a time, cooldown+dismiss capped via useActivationNudge */}
                {activationNudge && (
                  <ActivationNudgeCard
                    nudgeKey={activationNudge}
                    themeColor={themeColor}
                    colors={colors}
                    onAction={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (activationNudge === "add_friends") router.push("/add-friends");
                      else if (activationNudge === "create_event") {
                        if (!guardEmailVerification(session)) return;
                        router.push("/create");
                      } else if (activationNudge === "rsvp_event") setEventSort("soon");
                      dismissActivationNudge();
                    }}
                    onDismiss={() => {
                      Haptics.selectionAsync();
                      dismissActivationNudge();
                    }}
                  />
                )}
                {/* ═══ Sort Chips (scrollable for 6 pills) ═══ */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
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
                </ScrollView>
                {/* ═══ Public pill: location helper ═══ */}
                {eventSort === "public" && !userRegion && activeFeed.length > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 10,
                    }}
                  >
                    <MapPin size={14} color={colors.textTertiary} />
                    <Text style={{ flex: 1, fontSize: 12, color: colors.textTertiary, marginLeft: 8 }}>
                      Enable location for nearby ranking
                    </Text>
                  </View>
                )}
                {/* ═══ Friend Nudge — zero friends recovery (suppressed if activation nudge already covers it) ═══ */}
                {/* Shows regardless of feed state so users who skipped Find Friends onboarding */}
                {/* still have a visible path back after the ActivationNudgeCard exhausts its dismiss cap. */}
                {friendCount === 0 && activationNudge !== "add_friends" && (
                  <Pressable
                    onPress={() => router.push("/add-friends")}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: `${themeColor}10`,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: `${themeColor}20`,
                    }}
                  >
                    <Users size={18} color={themeColor} />
                    <Text style={{ flex: 1, fontSize: 13, color: colors.text, marginLeft: 10 }}>
                      Add friends to see more events and activity.
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: themeColor }}>
                      Find Friends
                    </Text>
                  </Pressable>
                )}
                </>
              }
              ListEmptyComponent={
                eventSort === "going" || eventSort === "not_going" ? (
                <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>
                    {eventSort === "going" ? "\uD83C\uDF89" : "\uD83D\uDC4B"}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                    {eventSort === "going" ? "No events you're going to" : "No declined events"}
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                    {eventSort === "going"
                      ? "RSVP \"Going\" to events and they'll show up here."
                      : "Events you decline will appear here in case you change your mind."}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setEventSort("soon");
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={{
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: RADIUS.lg,
                      backgroundColor: themeColor,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Browse Events</Text>
                  </Pressable>
                </View>
                ) : eventSort === "friends" && loadingFriendsFeed ? (
                <View style={{ alignItems: "center", paddingTop: 60 }}>
                  <ActivityIndicator size="small" color={themeColor} />
                </View>
                ) : eventSort === "friends" ? (
                <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>{"\uD83D\uDC4B"}</Text>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                    No friend activity yet
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                    Invite friends to Open Invite to see what they're up to!
                  </Text>
                  <Pressable
                    onPress={async () => {
                      const payload = buildAppSharePayload("Join me on Open Invite — let's make plans!");
                      await Share.share({ message: payload.message, url: payload.url });
                    }}
                    style={{
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: RADIUS.lg,
                      backgroundColor: themeColor,
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Invite Friends</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/add-friends")}
                    style={{ marginTop: 14 }}
                  >
                    <Text style={{ color: themeColor, fontSize: 13, fontWeight: "500" }}>Find Friends</Text>
                  </Pressable>
                </View>
                ) : eventSort === "saved" ? (
                <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 28,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: isDark ? "rgba(236,72,153,0.12)" : "rgba(236,72,153,0.08)",
                    marginBottom: 16,
                  }}>
                    <Bookmark size={24} color={STATUS.interested.fg} />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                    No saved events
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                    Tap the heart on any event to save it.{"\n"}Saved events appear here.
                  </Text>
                  <Pressable
                    onPress={() => {
                      setEventSort("soon");
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={{
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: RADIUS.lg,
                      backgroundColor: themeColor,
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Browse Events</Text>
                  </Pressable>
                </View>
                ) : eventSort === "group" ? (
                <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>{"\uD83D\uDC65"}</Text>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                    No circle events yet
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                    Join or create a circle to see events from your groups
                  </Text>
                  <Pressable
                    onPress={() => router.push("/social")}
                    style={{
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: RADIUS.lg,
                      backgroundColor: themeColor,
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Explore Circles</Text>
                  </Pressable>
                </View>
                ) : eventSort === "public" ? (
                <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>{"\uD83C\uDF0D"}</Text>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                    No public events nearby
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 6 }}>
                    Public events are visible to everyone nearby — great for meetups, open runs, community hangouts, and more.
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                    Be the first to host one in your area!
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (!guardEmailVerification(session)) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push("/create?visibility=public");
                    }}
                    style={{
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: RADIUS.lg,
                      backgroundColor: themeColor,
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Create Public Event</Text>
                  </Pressable>
                  {!userRegion && (
                    <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: "center", marginTop: 12 }}>
                      Enable location for nearby filtering
                    </Text>
                  )}
                </View>
                ) : eventSort === "popular" ? (
                <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>{"\uD83D\uDD25"}</Text>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                    No trending events yet
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                    Events with the most RSVPs show up here. Create one and spread the word!
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (!guardEmailVerification(session)) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push("/create");
                    }}
                    style={{
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: RADIUS.lg,
                      backgroundColor: themeColor,
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Create Event</Text>
                  </Pressable>
                </View>
                ) : (
                /* Soon (default) */
                <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>{"\u2728"}</Text>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                    No upcoming events yet
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                    Be the first to host! Create an event and invite your friends.
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (!guardEmailVerification(session)) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push("/create");
                    }}
                    style={{
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: RADIUS.lg,
                      backgroundColor: themeColor,
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Create Event</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      const payload = buildAppSharePayload("Join me on Open Invite — let's make plans!");
                      await Share.share({ message: payload.message, url: payload.url });
                    }}
                    style={{ marginTop: 14 }}
                  >
                    <Text style={{ color: themeColor, fontSize: 13, fontWeight: "500" }}>Invite Friends</Text>
                  </Pressable>
                </View>
                )
              }
              renderItem={({ item: event, index }) => {
                const hasPhoto = !!event.eventPhotoUrl && event.visibility !== "private";
                const rsvp = event.viewerRsvpStatus as string | null | undefined;
                const saved = rsvp === "interested" || rsvp === "maybe";
                const hostName = event.user?.name?.split(" ")[0] ?? null;
                const isMyEvent = event.user?.id === session?.user?.id;
                const displayTime = event.nextOccurrence ?? event.startTime;
                const dateStr = new Date(displayTime).toLocaleDateString([], {
                  weekday: "short", month: "short", day: "numeric",
                });
                const timeStr = new Date(displayTime).toLocaleTimeString([], {
                  hour: "numeric", minute: "2-digit",
                });
                const urgency = getUrgencyLabel(displayTime);
                const spotsLeft = event.capacity && event.attendeeCount > 0
                  ? Math.max(0, event.capacity - event.attendeeCount)
                  : null;
                const almostFull = spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 3;
                // [AVAILABILITY_V1] Availability chip for this card
                // RSVP status overrides calendar-based availability chip
                const calendarChip = getAvailabilityChip(availabilityMap.get(event.id) ?? "unknown");
                const availChip: { label: string; tone: "going" | "warning" | "destructive" | null } | null =
                  rsvp === "going"
                    ? { label: "Attending", tone: "going" }
                    : rsvp === "not_going"
                      ? { label: "Not Attending", tone: "destructive" }
                      : calendarChip;
                const cardTheme = resolveEventTheme(event.themeId);
                const cardAccent = cardTheme.backAccent;
                const rawCardColor = event.cardColor ?? undefined;
                const plaqueBg = rawCardColor ? softenColor(rawCardColor) : (isDark ? cardTheme.backBgDark : cardTheme.backBgLight);
                const ccHex = rawCardColor ? softenColor(rawCardColor) : undefined;
                const ccText = ccHex ? getTextColorForBg(ccHex) : null;
                const ccSecondary = ccText ? `${ccText}B3` : null;

                return (
                  <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 300)).duration(220)} style={{ marginBottom: 18 }}>
                    <Pressable
                      testID="discover-card-open"
                      onPress={() => handleEventPress(event.id, "event_card", event)}
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
                            <Calendar size={48} color={isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.12)"} />
                          </View>
                        )}

                        {/* Urgency chip — image top-left */}
                        {urgency.label ? (
                          <View style={{
                            position: "absolute",
                            top: 12,
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

                        {/* Event Hook overlay removed — headline now in card body */}
                      </View>

                      {/* ── Themed content panel ── */}
                      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
                        {/* TOP ROW: Title + Save/Bookmark */}
                        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                          <Text
                            style={{
                              flex: 1,
                              color: ccText ?? colors.text,
                              fontSize: 18,
                              fontWeight: "700",
                              lineHeight: 24,
                              letterSpacing: -0.2,
                            }}
                            numberOfLines={2}
                          >
                            {event.title}
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

                        {/* Circle/group badge */}
                        {event.circleName ? (
                          <View style={{ flexDirection: "row", marginTop: 6 }}>
                            <EventVisibilityBadge
                              visibility={event.visibility}
                              circleId={event.circleId}
                              circleName={event.circleName}
                              eventId={event.id}
                              surface="discover_card"
                              isDark={isDark}
                            />
                          </View>
                        ) : null}

                        {/* Group name pill — shows actual group name on group-visibility events */}
                        {!event.circleName && event.groupVisibility?.length ? (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6, gap: 4 }}>
                            {event.groupVisibility.map((gv) => (
                              <View
                                key={gv.groupId}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 6,
                                  backgroundColor: gv.group.color
                                    ? `${gv.group.color}${isDark ? "33" : "22"}`
                                    : (isDark ? "rgba(245,158,11,0.2)" : "#FEF3C7"),
                                }}
                              >
                                <Users size={10} color={gv.group.color || (isDark ? "#FCD34D" : "#B45309")} />
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "600",
                                    color: gv.group.color || (isDark ? "#FCD34D" : "#B45309"),
                                    marginLeft: 3,
                                  }}
                                  numberOfLines={1}
                                >
                                  {gv.group.name}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        {/* Headline teaser (replaces description on card front) */}
                        {event.eventHook ? (
                          <Text
                            style={{ color: ccSecondary ?? colors.textSecondary, fontSize: 13, fontWeight: "500", fontStyle: "italic", marginTop: 6, lineHeight: 18 }}
                            numberOfLines={2}
                          >
                            {event.eventHook}
                          </Text>
                        ) : null}

                        {/* Category badge */}
                        {event.category && event.category !== "social" && (() => {
                          const cat = EVENT_CATEGORIES.find((c) => c.value === event.category);
                          if (!cat) return null;
                          return (
                            <View style={{ flexDirection: "row", marginTop: 6 }}>
                              <View style={{
                                flexDirection: "row",
                                alignItems: "center",
                                paddingHorizontal: 7,
                                paddingVertical: 2,
                                borderRadius: 6,
                                backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                              }}>
                                <Text style={{ fontSize: 10 }}>{cat.emoji}</Text>
                                <Text style={{ fontSize: 10, fontWeight: "600", color: ccSecondary ?? colors.textTertiary, marginLeft: 3 }}>{cat.label}</Text>
                              </View>
                            </View>
                          );
                        })()}

                        {/* Location — compact single line */}
                        {event.location ? (
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 }}>
                            <MapPin size={12} color={ccSecondary ?? colors.textTertiary} />
                            <Text
                              style={{ color: ccSecondary ?? colors.textSecondary, fontSize: 12, fontWeight: "500" }}
                              numberOfLines={1}
                            >
                              {formatLocationShort(event.location)}
                            </Text>
                          </View>
                        ) : null}

                        {/* [FRIENDS_PILL] Social proof — friend avatars + "Sarah is going" */}
                        {eventSort === "friends" && (event.attendeePreview?.length ?? 0) > 0 && (() => {
                          const preview = event.attendeePreview ?? [];
                          const friendAttendees = preview.filter((a) => friendUserIds.has(a.id));
                          if (friendAttendees.length === 0) return null;
                          const firstName = friendAttendees[0].name?.split(" ")[0] ?? "A friend";
                          const othersCount = friendAttendees.length - 1;
                          const label = othersCount === 0
                            ? `${firstName} is going`
                            : `${firstName} +${othersCount} friend${othersCount > 1 ? "s" : ""} going`;
                          return (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 }}>
                              {friendAttendees.slice(0, 3).map((a, i) => (
                                <View key={a.id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }}>
                                  <EntityAvatar
                                    photoUrl={a.image}
                                    initials={a.name?.[0] ?? "?"}
                                    size={20}
                                    backgroundColor={isDark ? "#2C2C2E" : "#E5E7EB"}
                                    foregroundColor={cardAccent ?? themeColor}
                                    fallbackIcon="person-outline"
                                  />
                                </View>
                              ))}
                              <Text style={{ fontSize: 12, fontWeight: "500", color: cardAccent ?? themeColor, marginLeft: 2 }}>
                                {label}
                              </Text>
                            </View>
                          );
                        })()}

                        {/* Host badge — "Hosted by you" or "Hosted by {friend}" */}
                        {event.user?.id && (
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 }}>
                            <EntityAvatar
                              photoUrl={event.user.image}
                              initials={event.user.name?.[0] ?? "?"}
                              size={20}
                              backgroundColor={event.user.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : `${cardAccent ?? themeColor}20`}
                              foregroundColor={cardAccent ?? themeColor}
                              fallbackIcon="person-outline"
                            />
                            <Text style={{ fontSize: 12, fontWeight: "500", color: cardAccent ?? themeColor }}>
                              {isMyEvent ? "Hosted by you" : `Hosted by ${hostName ?? "a friend"}`}
                            </Text>
                            {(hostEventCounts.get(event.user!.id) ?? 0) >= 5 && (
                              <View style={{
                                flexDirection: "row",
                                alignItems: "center",
                                backgroundColor: "#FEF3C7",
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 6,
                                gap: 2,
                              }}>
                                <Text style={{ fontSize: 10 }}>⭐</Text>
                                <Text style={{ fontSize: 10, fontWeight: "700", color: "#B45309" }}>Active Host</Text>
                              </View>
                            )}
                          </View>
                        )}

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
                            <Calendar size={12} color={ccSecondary ?? cardAccent ?? colors.textSecondary} />
                            <Text style={{ color: ccSecondary ?? colors.textSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.1 }}>
                              {dateStr}, {timeStr}
                            </Text>
                            {/* [AVAILABILITY_V1] Calendar-fit chip — hidden on own events */}
                            {availChip && !isMyEvent && (
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

                            if (merged.length === 0 && count === 0) return null;
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
                                      backgroundColor={isDark ? "#2C2C2E" : "#E5E7EB"}
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
        </ErrorBoundary>
      ) : (
        /* ═══ [WHOS_DOWN_V1] Who's Down Pane ═══ */
        /* [DISCOVER_PANE_ISOLATION_V1] Pane-level error boundary */
        <ErrorBoundary
          fallback={({ reset }) => (
            <DiscoverPaneErrorFallback
              paneLabel="Who's Down"
              onRetry={reset}
              textColor={colors.text}
              subTextColor={colors.textSecondary}
              accentColor={themeColor}
              topPadding={chromeHeight + 16}
            />
          )}
        >
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingTop: chromeHeight + 8, paddingBottom: TAB_BOTTOM_PADDING }}
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
            {/* Static explainer + Post an Idea CTA */}
            <Pressable
              onPress={() => {
                if (!guardEmailVerification(session)) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowCreateWhosDown(true);
              }}
              style={{
                backgroundColor: `${themeColor}12`,
                borderWidth: 1,
                borderColor: `${themeColor}30`,
                borderRadius: RADIUS.lg,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 4 }}>
                Have an idea to do?
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 8 }}>
                See who's down to come. If enough people are down, make the event.
              </Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 12 }}>
                Friends only · expires in 24h
              </Text>
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: RADIUS.lg,
                  backgroundColor: themeColor,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>Post an Idea</Text>
              </View>
            </Pressable>

            {/* Whos-down error soft-fail banner */}
            {whosDownError && whosDownItems.length === 0 && (
              <View style={{ alignItems: "center", paddingTop: 24, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", marginBottom: 12 }}>
                  Couldn't load ideas. Pull to refresh.
                </Text>
              </View>
            )}

            {/* Feed cards */}
            {whosDownItems.length === 0 && !whosDownError ? (
              <View style={{ alignItems: "center", paddingTop: 32, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>{"\u{1F4A1}"}</Text>
                <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                  No ideas yet
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                  Be the first — post an idea and see who's down.
                </Text>
                <Pressable
                  onPress={() => {
                    if (!guardEmailVerification(session)) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowCreateWhosDown(true);
                  }}
                  style={{
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                    borderRadius: RADIUS.lg,
                    backgroundColor: themeColor,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>Post an Idea</Text>
                </Pressable>
              </View>
            ) : (
              whosDownItems.map((item, idx) => {
                // [WHOS_DOWN_V1] Harden against partial feed payloads: some backend
                // serialization paths may omit `members`. Normalize at the render
                // boundary so `.find`/`.filter` never hit undefined.
                const members = Array.isArray(item.members) ? item.members : [];
                const downCount = item.downCount ?? members.filter((m) => m.status === "accepted").length;
                const isMine = item.creatorId === session.user?.id;
                const myMember = members.find((m) => m.userId === session.user?.id);
                const imDown = myMember?.status === "accepted";
                const creatorName = item.creator?.name?.split(" ")[0] ?? "Someone";
                return (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.delay(Math.min(idx * 40, 300)).duration(240)}
                    style={{ marginBottom: 12 }}
                  >
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/event-request/${item.id}`);
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.borderSubtle,
                        borderRadius: RADIUS.lg,
                        padding: 14,
                        opacity: pressed ? 0.85 : 1,
                        ...tileShadow,
                      })}
                    >
                      {/* [WHOS_DOWN_V1] Single-row card: avatar + metadata stack
                          (title / time / where / creator / down count) + action.
                          Down count lives inside the metadata stack — no loose
                          bottom row that wastes vertical space when count is 0. */}
                      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                        <View style={{ marginRight: 12 }}>
                          <EntityAvatar
                            photoUrl={item.creator?.image}
                            initials={item.creator?.name?.[0] ?? "?"}
                            size={44}
                            backgroundColor={item.creator?.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : `${themeColor}30`}
                            foregroundColor={themeColor}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "700", fontSize: 15, color: colors.text }} numberOfLines={2}>
                            {item.title}
                          </Text>
                          {item.timeHint ? (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, flexWrap: "wrap", gap: 2 }}>
                              <Clock size={12} color={colors.textTertiary} />
                              <Text style={{ fontSize: 12, color: colors.textSecondary, marginLeft: 4 }}>
                                {item.timeHint}
                              </Text>
                            </View>
                          ) : null}
                          {item.whereText ? (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                              <MapPin size={12} color={colors.textTertiary} />
                              <Text style={{ fontSize: 12, color: colors.textTertiary, marginLeft: 4 }} numberOfLines={1}>
                                {item.whereText}
                              </Text>
                            </View>
                          ) : null}
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                            <Text style={{ fontSize: 11, color: colors.textTertiary }} numberOfLines={1}>
                              {isMine ? "Your idea" : `From ${creatorName}`}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.textTertiary, marginHorizontal: 6 }}>·</Text>
                            <Users size={11} color={STATUS.going.fg} />
                            <Text style={{ fontSize: 11, fontWeight: "600", color: STATUS.going.fg, marginLeft: 3 }}>
                              {downCount} down
                            </Text>
                          </View>
                        </View>
                        {!isMine && (
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              if (imDown) return;
                              respondWhosDownMutation.mutate(item.id);
                            }}
                            disabled={imDown || respondWhosDownMutation.isPending}
                            style={{
                              marginLeft: 8,
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              borderRadius: RADIUS.lg,
                              backgroundColor: imDown ? STATUS.going.bgSoft : themeColor,
                              alignSelf: "center",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "700",
                                color: imDown ? STATUS.going.fg : "#FFFFFF",
                              }}
                            >
                              {imDown ? "You're Down" : "I'm Down"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })
            )}
          </ScrollView>
        </View>
        </ErrorBoundary>
      )}

      {/* [WHOS_DOWN_V1] Bottom-sheet creation modal */}
      <Modal
        visible={showCreateWhosDown}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateWhosDown(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <Pressable
            className="flex-1 justify-end"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            onPress={() => setShowCreateWhosDown(false)}
          >
            <Pressable
              onPress={() => {}}
              className="rounded-t-3xl p-6"
              style={{ backgroundColor: colors.background }}
            >
              <View
                className="w-12 h-1 rounded-full self-center mb-4"
                style={{ backgroundColor: colors.border }}
              />

              <Text className="text-xl font-bold mb-1" style={{ color: colors.text }}>
                Post an Idea
              </Text>
              <Text className="text-sm mb-5" style={{ color: colors.textSecondary }}>
                Float something to your friends. No commitment.
              </Text>

              {/* Idea title */}
              <TextInput
                value={wdTitle}
                onChangeText={setWdTitle}
                placeholder="What's the idea? e.g. Bowling tonight?"
                placeholderTextColor={colors.textTertiary}
                maxLength={120}
                className="p-4 rounded-xl mb-4"
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.text,
                  fontSize: 16,
                }}
                autoFocus
              />

              {/* Time hint chips */}
              <Text
                className="text-xs font-semibold mb-2"
                style={{ color: colors.textSecondary, letterSpacing: 0.5 }}
              >
                WHEN (OPTIONAL)
              </Text>
              <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
                {[
                  { key: "Tonight", label: "Tonight" },
                  { key: "Tomorrow", label: "Tomorrow" },
                  { key: "This Weekend", label: "This Weekend" },
                  { key: "Next Week", label: "Next Week" },
                  { key: "Anytime", label: "Anytime" },
                ].map((chip) => {
                  const active = wdTimeHint === chip.key;
                  return (
                    <Pressable
                      key={chip.key}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setWdTimeHint(active ? null : chip.key);
                      }}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: RADIUS.lg,
                        backgroundColor: active ? themeColor : colors.surface,
                        borderWidth: 1,
                        borderColor: active ? themeColor : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: active ? "#FFFFFF" : colors.text,
                        }}
                      >
                        {chip.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Where (optional) */}
              <Text
                className="text-xs font-semibold mb-2"
                style={{ color: colors.textSecondary, letterSpacing: 0.5 }}
              >
                WHERE (OPTIONAL)
              </Text>
              <TextInput
                value={wdWhere}
                onChangeText={setWdWhere}
                placeholder="e.g. Griffith Park"
                placeholderTextColor={colors.textTertiary}
                maxLength={120}
                className="p-4 rounded-xl mb-4"
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.text,
                  fontSize: 16,
                }}
              />

              {/* [WHOS_DOWN_V1] Helper: friends-only + 24h expiry stated explicitly. */}
              <View className="flex-row items-center mb-5">
                <Users size={14} color={colors.textSecondary} />
                <Text
                  className="ml-2 text-xs"
                  style={{ color: colors.textSecondary }}
                >
                  Friends only · expires in 24h
                </Text>
              </View>

              {/* Post button */}
              <Pressable
                onPress={() => {
                  const trimmed = wdTitle.trim();
                  if (!trimmed) {
                    safeToast.error("Add an idea", "Type what you're thinking first.");
                    return;
                  }
                  createWhosDownMutation.mutate({
                    title: trimmed,
                    timeHint: wdTimeHint ?? undefined,
                    whereText: wdWhere.trim() || undefined,
                  });
                }}
                disabled={createWhosDownMutation.isPending || !wdTitle.trim()}
                style={{
                  paddingVertical: 14,
                  borderRadius: RADIUS.lg,
                  backgroundColor: themeColor,
                  alignItems: "center",
                  opacity: createWhosDownMutation.isPending || !wdTitle.trim() ? 0.5 : 1,
                }}
              >
                {createWhosDownMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF" }}>
                    Post Idea
                  </Text>
                )}
              </Pressable>

              {/* Cancel */}
              <Pressable
                onPress={() => setShowCreateWhosDown(false)}
                className="py-4 items-center"
              >
                <Text className="font-medium" style={{ color: colors.textSecondary }}>
                  Cancel
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <BottomNavigation />
    </SafeAreaView>
  );
}
