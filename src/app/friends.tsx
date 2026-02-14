import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  FlatList,
  Platform,
} from "react-native";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ShareAppButton } from "@/components/ShareApp";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { refreshAfterFriendAccept, refreshAfterFriendReject, refreshAfterCircleCreate, refreshAfterCircleLeave } from "@/lib/refreshAfterMutation";
import { useLiveRefreshContract } from "@/lib/useLiveRefreshContract";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ChevronRight,
  ChevronDown,
  Users,
  Check,
  X,
  Bell,
  FlaskConical,
  Calendar,
  Clock,
  MapPin,
  List,
  LayoutGrid,
  Activity,
  BadgeCheck,
  Plus,
  Pin,
  Trash2,
  ChevronUp,
  MessageCircle,
} from "@/ui/icons";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  withSpring,
  runOnJS,
  FadeIn,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { SLIDE_MS } from "@/ui/motion";
import BottomNavigation from "@/components/BottomNavigation";
import { AppHeader } from "@/components/AppHeader";
import { EntityAvatar } from "@/components/EntityAvatar";
import { HelpSheet, HELP_SHEETS } from "@/components/HelpSheet";
import { FriendsListSkeleton } from "@/components/SkeletonLoader";
import { EmptyState } from "@/components/EmptyState";
import { CircleCard } from "@/components/CircleCard";
import { UserRow } from "@/components/UserListRow";
import { CreateCircleModal } from "@/components/CreateCircleModal";
import { SecondOrderSocialNudge, canShowSecondOrderSocialNudge, markSecondOrderSocialNudgeCompleted } from "@/components/SecondOrderSocialNudge";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useStickyLoading } from "@/lib/useStickyLoading";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { useUnseenNotificationCount } from "@/hooks/useUnseenNotifications";
import { api } from "@/lib/api";
import { useTheme, TILE_SHADOW } from "@/lib/ThemeContext";
import { circleKeys } from "@/lib/circleQueryKeys";
import { trackFriendAdded } from "@/lib/rateApp";
import { Button } from "@/ui/Button";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, usePremiumStatusContract, canCreateCircle, type PaywallContext } from "@/lib/entitlements";
import { useOnboardingGuide } from "@/hooks/useOnboardingGuide";
import { OnboardingGuideOverlay } from "@/components/OnboardingGuideOverlay";
import { FriendsActivityPane } from "@/components/friends/FriendsActivityPane";
import { FriendsChatsPane } from "@/components/friends/FriendsChatsPane";
import { FriendsPeoplePane } from "@/components/friends/FriendsPeoplePane";
import {
  type GetFriendsResponse,
  type GetFriendRequestsResponse,
  type Friendship,
  type FriendRequest,
  type GetFriendEventsResponse,
  type Event,
  type Circle,
  type GetCirclesResponse,
} from "@/shared/contracts";
import { once } from "@/lib/runtimeInvariants";

// Mini calendar component for friend cards
const MiniCalendar = React.memo(function MiniCalendar({ friendshipId, bootStatus, session }: { friendshipId: string; bootStatus: string; session: any }) {
  const { themeColor, isDark, colors } = useTheme();

  // DEV: Track renders
  if (__DEV__) {
    (MiniCalendar as any).__renderCount = ((MiniCalendar as any).__renderCount || 0) + 1;
  }

  const { data } = useQuery({
    queryKey: ["friendEvents", friendshipId],
    queryFn: () => api.get<GetFriendEventsResponse>(`/api/friends/${friendshipId}/events`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!friendshipId,
    staleTime: 60000, // Cache for 1 minute to avoid too many requests
  });

  const events = data?.events ?? [];
  
  // Filter to only show future/present events (endTime >= now OR startTime >= now if no endTime)
  const now = new Date();
  const futureEvents = events.filter((event) => {
    const endTime = event.endTime ? new Date(event.endTime) : null;
    const startTime = new Date(event.startTime);
    return (endTime && endTime >= now) || startTime >= now;
  });

  // Get current month's calendar
  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const startingDay = currentMonth.getDay();

  // Create a set of days that have events
  const eventDays = new Set<number>();
  events.forEach((event) => {
    const eventDate = new Date(event.startTime);
    if (
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getFullYear() === today.getFullYear()
    ) {
      eventDays.add(eventDate.getDate());
    }
  });

  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
    <View className="mt-2 pt-2 border-t" style={{ borderTopColor: colors.separator }}>
      {/* Day headers */}
      <View className="flex-row mb-1">
        {/* INVARIANT_ALLOW_SMALL_MAP */}
        {dayNames.map((day, i) => (
          <View key={i} className="flex-1 items-center">
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-[8px]" style={{ color: colors.textTertiary }}>{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid - compact version showing only necessary rows */}
      <View className="flex-row flex-wrap">
        {/* Empty cells for days before month starts */}
        {/* INVARIANT_ALLOW_SMALL_MAP */}
        {Array.from({ length: startingDay }).map((_, i) => (
          <View key={`empty-${i}`} className="w-[14.28%] h-4" />
        ))}

        {/* Days of the month */}
        {/* INVARIANT_ALLOW_SMALL_MAP */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const hasEvent = eventDays.has(day);
          const isToday = day === today.getDate();

          return (
            <View key={day} className="w-[14.28%] h-4 items-center justify-center">
              <View
                className="w-3.5 h-3.5 rounded-full items-center justify-center"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{
                  backgroundColor: hasEvent ? themeColor : "transparent",
                  borderWidth: isToday ? 1 : 0,
                  borderColor: isToday ? themeColor : "transparent",
                }}
              >
                <Text
                  className="text-[7px]"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{
                    color: hasEvent ? "#fff" : isToday ? themeColor : colors.textTertiary,
                    fontWeight: hasEvent || isToday ? "600" : "400",
                  }}
                >
                  {day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Event count indicator - only count future/present events */}
      {futureEvents.length > 0 && (
        <View className="flex-row items-center justify-center mt-1">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <View className="w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: themeColor }} />
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="text-[9px]" style={{ color: colors.textSecondary }}>
            {futureEvents.length} open invite{futureEvents.length !== 1 ? "s" : ""}
          </Text>
        </View>
      )}
    </View>
  );
});


const FriendCard = React.memo(function FriendCard({ 
  friendship, 
  index, 
  bootStatus,
  session,
  onPin,
  isPinned,
}: { 
  friendship: Friendship; 
  index: number; 
  bootStatus: string;
  session: any;
  onPin?: (friendshipId: string) => void;
  isPinned?: boolean;
}) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const friend = friendship.friend;

  // ── SSOT swipe constants (match CircleCard) ──────────────────
  const ACTION_WIDTH_PX = 72;
  const OPEN_RIGHT_PX   = ACTION_WIDTH_PX;
  const THRESH_OPEN_PX  = 28;
  // ─────────────────────────────────────────────────────────────
  const translateX = useSharedValue(0);

  const cardSwipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const triggerPin = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPin?.(friendship.id);
  }, [onPin, friendship.id]);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/friend/${friendship.id}` as any);
  }, [router, friendship.id]);

  const panGesture = Gesture.Pan()
    .enabled(!!onPin)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      // Clamp to [-ACTION_WIDTH_PX, +ACTION_WIDTH_PX] (defense-in-depth)
      const clamped = Math.max(-ACTION_WIDTH_PX, Math.min(OPEN_RIGHT_PX, event.translationX));
      translateX.value = clamped;
    })
    .onEnd((event) => {
      const tx = event.translationX;
      if (tx > THRESH_OPEN_PX) {
        // Right swipe past threshold → snap open to reveal Pin
        if (__DEV__) runOnJS(devLog)('[P0_FRIEND_DETAILED_SWIPE]', 'snap', { dir: 'right', target: OPEN_RIGHT_PX, friendId: friendship.id });
        translateX.value = withSpring(OPEN_RIGHT_PX, { damping: 20, stiffness: 200 });
      } else {
        // Left swipe or short right → always snap closed
        if (__DEV__ && tx < -THRESH_OPEN_PX) runOnJS(devLog)('[P0_FRIEND_DETAILED_SWIPE]', 'snap', { dir: 'left_disabled', target: 0, friendId: friendship.id });
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  // DEV: Track renders (for perf measurement)
  if (__DEV__) {
    (FriendCard as any).__renderCount = ((FriendCard as any).__renderCount || 0) + 1;
  }

  // Guard against undefined friend - must be after all hooks
  if (!friend) {
    return null;
  }

  // Build secondary metadata: "@handle • calendarBio/bio"
  const _handle = friend.Profile?.handle;
  const _bio = friend.Profile?.calendarBio || friend.Profile?.bio;
  const _cardSecondaryParts: string[] = [];
  if (_handle) _cardSecondaryParts.push(`@${_handle}`);
  if (_bio) _cardSecondaryParts.push(_bio);
  const cardSecondaryLine = _cardSecondaryParts.join(" • ");

  // Only animate first 5 items to reduce initial render cost
  const shouldAnimate = index < 5;

  const content = (
    <View className="mb-2 overflow-hidden rounded-xl">
      {/* Right-swipe: Pin action (revealed on the left side) */}
      {onPin && (
        <View
          className="absolute inset-y-0 left-0 items-center justify-center"
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{ width: ACTION_WIDTH_PX }}
        >
          <Pressable
            /* INVARIANT_ALLOW_INLINE_HANDLER */
            onPress={() => { translateX.value = withSpring(0, { damping: 20, stiffness: 200 }); triggerPin(); }}
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-14 h-14 rounded-2xl items-center justify-center"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: '#10B981' }}
          >
            <Pin size={20} color="#fff" />
          </Pressable>
        </View>
      )}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardSwipeStyle}>
          <Pressable
            onPress={handlePress}
            className="rounded-xl p-3"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: isPinned ? themeColor + "40" : colors.border }}
    >
        <View className="flex-row items-start">
          {/* Pin indicator */}
          {isPinned && (
            <View className="absolute top-3 right-3">
              <Pin size={14} color={themeColor} />
            </View>
          )}
          
          <EntityAvatar
            photoUrl={friend.image}
            initials={friend.name?.[0] ?? friend.email?.[0]?.toUpperCase() ?? "?"}
            size={48}
            backgroundColor={friend.image ? colors.avatarBg : themeColor + "20"}
            foregroundColor={themeColor}
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ marginRight: 12 }}
          />
          <View className="flex-1">
            <View className="flex-row items-center flex-nowrap gap-1.5">
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }} numberOfLines={1} ellipsizeMode="tail">
                {friend.name ?? friend.email ?? "Unknown"}
              </Text>
            </View>
            {cardSecondaryLine ? (
              <Text
                className="mt-0.5"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {cardSecondaryLine}
              </Text>
            ) : null}
            {/* [LEGACY_GROUPS_PURGED] Group badges removed */}
          </View>
        </View>

        {/* Mini Calendar */}
        <MiniCalendar friendshipId={friendship.id} bootStatus={bootStatus} session={session} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );

  // Wrap in animation only for first items
  if (shouldAnimate) {
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
        {content}
      </Animated.View>
    );
  }

  return content;
});

// Collapsible List Item for "list" view mode - with swipe-to-pin
const FriendListItem = React.memo(function FriendListItem({ 
  friendship, 
  index, 
  bootStatus,
  session,
  onPin,
  isPinned,
}: { 
  friendship: Friendship; 
  index: number; 
  bootStatus: string;
  session: any;
  onPin?: (friendshipId: string) => void;
  isPinned?: boolean;
}) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const friend = friendship.friend;
  const [isExpanded, setIsExpanded] = useState(false);
  const rotation = useSharedValue(0);
  const height = useSharedValue(0);
  
  // ── SSOT swipe constants (match CircleCard) ──────────────────
  const ACTION_WIDTH_PX = 72;
  const OPEN_RIGHT_PX   = ACTION_WIDTH_PX;
  const THRESH_OPEN_PX  = 28;
  // ─────────────────────────────────────────────────────────────
  const translateX = useSharedValue(0);
  const isSwipingRight = useSharedValue(false);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }],
  }));

  const calendarStyle = useAnimatedStyle(() => ({
    opacity: height.value,
    maxHeight: interpolate(height.value, [0, 1], [0, 200]),
    overflow: "hidden" as const,
  }));
  
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  
  const triggerPin = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPin?.(friendship.id);
  };
  
  const panGesture = Gesture.Pan()
    .enabled(!!onPin)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      // Clamp to [-ACTION_WIDTH_PX, +ACTION_WIDTH_PX] (defense-in-depth)
      const clamped = Math.max(-ACTION_WIDTH_PX, Math.min(OPEN_RIGHT_PX, event.translationX));
      // Right swipe: allow full range; Left swipe: allow drag but will snap back
      translateX.value = clamped;
      isSwipingRight.value = event.translationX > 20;
    })
    .onEnd((event) => {
      const tx = event.translationX;
      if (tx > THRESH_OPEN_PX) {
        // Right swipe past threshold → snap open to reveal Pin
        if (__DEV__) runOnJS(devLog)('[P0_FRIEND_SWIPE]', 'snap', { dir: 'right', target: OPEN_RIGHT_PX });
        translateX.value = withSpring(OPEN_RIGHT_PX, { damping: 20, stiffness: 200 });
      } else {
        // Left swipe or short right → always snap closed
        if (__DEV__ && tx < -THRESH_OPEN_PX) runOnJS(devLog)('[P0_FRIEND_SWIPE]', 'snap', { dir: 'left_disabled', target: 0 });
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
      isSwipingRight.value = false;
    });

  // Guard against undefined friend - must be after all hooks
  if (!friend) {
    return null;
  }

  if (__DEV__ && once('P0_USERROW_SOT_friends')) {
    devLog('[P0_USERROW_SOT]', { screen: 'friends', variant: 'UserRow' });
  }

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
    rotation.value = withTiming(isExpanded ? 0 : 1, { duration: SLIDE_MS });
    height.value = withTiming(isExpanded ? 0 : 1, { duration: SLIDE_MS });
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 30).springify()}>
      <View className="mb-2 overflow-hidden rounded-xl">
        {/* Pin action background - GREEN (#10B981) to match CircleCard pin styling */}
        {onPin && (
          <View
            className="absolute inset-y-0 left-0 items-center justify-center"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ width: 72 }}
          >
            <Pressable
              /* INVARIANT_ALLOW_INLINE_HANDLER */
              onPress={() => { translateX.value = withSpring(0, { damping: 20, stiffness: 200 }); triggerPin(); }}
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="w-14 h-14 rounded-2xl items-center justify-center"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ backgroundColor: '#10B981' }}
            >
              <Pin size={20} color="#fff" />
            </Pressable>
          </View>
        )}
        
        <GestureDetector gesture={panGesture}>
          <Animated.View 
            className="rounded-xl overflow-hidden"
            /* INVARIANT_ALLOW_INLINE_ARRAY_PROP */
            style={[{ backgroundColor: colors.surface, borderWidth: 1, borderColor: isPinned ? themeColor + "40" : colors.border }, cardAnimatedStyle]}
          >
            {/* Main row — SSOT UserRow (friends list) */}
            <UserRow
              avatarUri={friend.image}
              handle={friend.Profile?.handle}
              displayName={friend.name}
              bio={friend.Profile?.calendarBio}
              /* INVARIANT_ALLOW_INLINE_HANDLER */
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/friend/${friendship.id}` as any);
              }}
              leftAccessory={isPinned ? (
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                <View style={{ marginRight: 6 }}>
                  <Pin size={14} color={themeColor} />
                </View>
              ) : undefined}
              rightAccessory={
                <Pressable
                  /* INVARIANT_ALLOW_INLINE_HANDLER */
                  onPress={(e) => { e.stopPropagation(); toggleExpand(); }}
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: isExpanded ? themeColor + "15" : colors.surface2 }}
                >
                  <Animated.View style={arrowStyle}>
                    <ChevronDown size={18} color={isExpanded ? themeColor : colors.textSecondary} />
                  </Animated.View>
                </Pressable>
              }
            />

            {/* Expandable calendar section */}
            <Animated.View style={calendarStyle}>
              <View className="px-3 pb-3">
                <MiniCalendar friendshipId={friendship.id} bootStatus={bootStatus} session={session} />
              </View>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
});

// ── Module-scope cache: eliminates detail→list jump on remount ──
let _friendsViewModeCache: "list" | "detailed" | null = null;

export default function FriendsScreen() {
  // DEV: Track first render timing
  const firstRenderTimeRef = React.useRef<number | null>(null);
  const hasLoggedFirstRenderRef = React.useRef(false);
  
  if (__DEV__ && firstRenderTimeRef.current === null) {
    firstRenderTimeRef.current = Date.now();
    console.time("[PERF] Friends screen first render");
  }

  const { data: session } = useSession();
  const { status: bootStatus, retry: retryBootstrap } = useBootAuthority();
  const router = useRouter();

  // [P0_LOADING_ESCAPE] Timeout safety for boot gate
  const isBootWaiting = (!session || bootStatus !== 'authed') && bootStatus !== 'loggedOut';
  const { isTimedOut: isBootTimedOut, reset: resetBootTimeout } = useLoadingTimeout(isBootWaiting, { timeout: 3000 });
  const [isRetrying, setIsRetrying] = useState(false);
  const params = useLocalSearchParams<{ search?: string; tab?: string }>();
  // [LEGACY_GROUPS_PURGED] initialGroupId removed - no longer filtering by groups
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  // ── Tab shell: Activity(0) | Chats(1) | People(2) ─────────
  // Default to Chats (index 1); deep-link ?tab= overrides
  const FRIENDS_TABS = ["Activity", "Chats", "People"] as const;
  const [friendsTab, setFriendsTab] = useState<number>(() => {
    if (params.tab === "activity") return 0;
    if (params.tab === "people") return 2;
    return 1; // default: Chats
  });

  // Auto-open search modal if navigated with ?search=true
  useEffect(() => {
    if (params.search === "true") {
      setFriendsTab(2); // switch to People pane
    }
  }, [params.search]);

  // Deep-link ?tab= override (runtime param changes)
  useEffect(() => {
    if (params.tab === "activity") setFriendsTab(0);
    else if (params.tab === "people") setFriendsTab(2);
    else if (params.tab === "chats") setFriendsTab(1);
  }, [params.tab]);

  // View mode and filter states — sync from in-memory cache to prevent jump
  const [viewMode, setViewMode] = useState<"list" | "detailed">(
    () => _friendsViewModeCache ?? "detailed"
  );

  // Hydrate from storage ONLY on cold start (cache null)
  useEffect(() => {
    if (_friendsViewModeCache !== null) {
      // Already cached from a previous mount this session — skip storage read
      if (__DEV__) devLog("[P0_FRIENDS_VIEW_INIT]", { source: "cache", mode: _friendsViewModeCache });
      return;
    }
    const loadViewMode = async () => {
      try {
        const userId = session?.user?.id;
        if (!userId) return;
        const key = `friends_view_mode:${userId}`;
        const saved = await AsyncStorage.getItem(key);
        if (saved === "list" || saved === "detailed") {
          _friendsViewModeCache = saved;
          setViewMode(saved);
          if (__DEV__) devLog("[P0_FRIENDS_VIEW_INIT]", { source: "storage", mode: saved });
        } else {
          _friendsViewModeCache = "detailed";
          if (__DEV__) devLog("[P0_FRIENDS_VIEW_INIT]", { source: "default", mode: "detailed" });
        }
      } catch {
        // Ignore errors - use default
        _friendsViewModeCache = "detailed";
      }
    };
    loadViewMode();
  }, [session?.user?.id]);

  // Persist view mode changes — update cache + storage
  const handleViewModeChange = useCallback(async (mode: "list" | "detailed") => {
    _friendsViewModeCache = mode;
    setViewMode(mode);
    if (__DEV__) devLog("[P0_FRIENDS_VIEW_SET]", { mode });
    try {
      const userId = session?.user?.id;
      if (!userId) return;
      const key = `friends_view_mode:${userId}`;
      await AsyncStorage.setItem(key, mode);
    } catch {
      // Ignore errors - non-critical
    }
  }, [session?.user?.id]);
  // [LEGACY_GROUPS_PURGED] selectedGroupId, showGroupFilter, editingGroup states removed

  // [LEGACY_ADD_TO_GROUPS_REMOVED] - modal state removed pre-launch
  const [showSecondOrderSocialNudge, setShowSecondOrderSocialNudge] = useState(false);

  // Circles (Planning) state
  const [showCreateCircle, setShowCreateCircle] = useState(false);
  const [friendsExpanded, setFriendsExpanded] = useState(true);
  const [planningExpanded, setPlanningExpanded] = useState(true);
  const [requestsExpanded, setRequestsExpanded] = useState(true);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  // Paywall state for circles gating
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("CIRCLES_LIMIT");

  // Confirm modal state for destructive actions
  const [showLeaveCircleConfirm, setShowLeaveCircleConfirm] = useState(false);
  const [circleToLeave, setCircleToLeave] = useState<{ id: string; name: string } | null>(null);
  // [LEGACY_GROUPS_PURGED] showDeleteGroupConfirm removed

  // Fetch entitlements for gating
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements();

  // Unseen notification count for Activity badge
  const { unseenCount, refetch: refetchUnseenCount } = useUnseenNotificationCount();

  // Interactive onboarding guide
  const onboardingGuide = useOnboardingGuide();

  // Refetch unseen count when screen gains focus + track onboarding step
  useFocusEffect(
    React.useCallback(() => {
      refetchUnseenCount();
      // Complete "friends_tab" step when user visits Friends screen
      if (onboardingGuide.shouldShowStep("friends_tab")) {
        onboardingGuide.completeStep("friends_tab");
      }
    }, [refetchUnseenCount, onboardingGuide])
  );

  // Handler for creating circle with gating
  const handleCreateCirclePress = () => {
    // CRITICAL: Don't gate while entitlements loading - prevents false gates for Pro users
    if (entitlementsLoading) {
      setShowCreateCircle(true);
      return;
    }
    
    const check = canCreateCircle(entitlements);
    if (!check.allowed && check.context) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setPaywallContext(check.context);
      setShowPaywallModal(true);
      return;
    }
    setShowCreateCircle(true);
  };

  // Load section expanded states from AsyncStorage
  useEffect(() => {
    const loadSectionStates = async () => {
      try {
        const stored = await AsyncStorage.getItem("friends_section_states");
        if (stored) {
          const states = JSON.parse(stored);
          if (typeof states.friendsExpanded === "boolean") setFriendsExpanded(states.friendsExpanded);
          if (typeof states.planningExpanded === "boolean") setPlanningExpanded(states.planningExpanded);
          if (typeof states.requestsExpanded === "boolean") setRequestsExpanded(states.requestsExpanded);
        }
      } catch (e) {
        if (__DEV__) {
          devError("[Friends] Error loading section states:", e);
        }
      } finally {
        setSectionsLoaded(true);
      }
    };
    loadSectionStates();
  }, []);

  // Save section expanded states to AsyncStorage when they change
  useEffect(() => {
    if (!sectionsLoaded) return; // Don't save until initial load is complete
    const saveSectionStates = async () => {
      try {
        await AsyncStorage.setItem(
          "friends_section_states",
          JSON.stringify({ friendsExpanded, planningExpanded, requestsExpanded })
        );
      } catch (e) {
        if (__DEV__) {
          devError("[Friends] Error saving section states:", e);
        }
      }
    };
    saveSectionStates();
  }, [friendsExpanded, planningExpanded, requestsExpanded, sectionsLoaded]);

  // Pinned friendships
  const [pinnedFriendshipIds, setPinnedFriendshipIds] = useState<Set<string>>(new Set());

  // DEV: Measure friends query performance
  if (__DEV__) {
    console.time("[PERF] Friends query");
  }

  const { data: friendsData, isLoading: rawIsLoading, refetch, isRefetching } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 5 * 60 * 1000, // 5 min - friends list is stable
    gcTime: 10 * 60 * 1000, // 10 min garbage collection
    refetchOnMount: false, // Don't refetch if data exists
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    placeholderData: (prev) => prev, // Keep previous data during refetch
  });
  
  // P1 JITTER FIX: Use sticky loading to prevent flicker
  const isLoading = useStickyLoading(rawIsLoading, 300, __DEV__ ? "friends" : undefined);

  // DEV: Log when friends data arrives
  useEffect(() => {
    if (__DEV__ && friendsData) {
      console.timeEnd("[PERF] Friends query");
      devLog("[PERF] Friends count:", friendsData.friends?.length ?? 0);
      // [P1_FRIEND_ROW_META] Proof log — check if handle/bio present in payload
      const sample = (friendsData.friends ?? []).slice(0, 5);
      sample.forEach((f) => {
        devLog("[P1_FRIEND_ROW_META]", {
          hasUsername: !!f.friend?.Profile?.handle,
          hasBio: !!(f.friend?.Profile?.calendarBio || f.friend?.Profile?.bio),
        });
      });
    }
  }, [friendsData]);

  const { data: requestsData, refetch: refetchRequests } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: () => api.get<GetFriendRequestsResponse>("/api/friends/requests"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60 * 1000, // 1 min - requests can change more often
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev: GetFriendRequestsResponse | undefined) => prev, // [PERF_SWEEP] Keep requests visible during refetch
  });

  // [P0_LOADING_ESCAPE] Retry handler (after queries are available)
  const handleLoadingRetry = useCallback(() => {
    setIsRetrying(true);
    resetBootTimeout();
    retryBootstrap();
    refetch();
    refetchRequests();
    setTimeout(() => setIsRetrying(false), 1500);
  }, [resetBootTimeout, retryBootstrap, refetch, refetchRequests]);

  const acceptRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.put<{ success: boolean; friendshipId?: string; friend?: { id: string; name: string | null; image: string | null } }>(`/api/friends/request/${requestId}`, { status: "accepted" }),
    onMutate: async (requestId) => {
      const _t0 = Date.now();
      // Optimistically remove the request from the list
      await queryClient.cancelQueries({ queryKey: ["friendRequests"] });
      const previousRequests = queryClient.getQueryData(["friendRequests"]);
      queryClient.setQueryData(["friendRequests"], (old: any) => {
        if (!old?.received) return old;
        return { ...old, received: old.received.filter((r: any) => r.id !== requestId) };
      });
      if (__DEV__) {
        devLog('[ACTION_FEEDBACK]', JSON.stringify({ action: 'friend_accept', state: 'optimistic', requestId }));
      }
      return { previousRequests, _t0 };
    },
    onSuccess: async (data, _requestId, context) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
      refetchRequests();

      // Track friend added for rate app prompt
      trackFriendAdded();

      // [LEGACY_ADD_TO_GROUPS_REMOVED] - modal trigger removed pre-launch
      if (__DEV__) devLog('[LEGACY_ADD_TO_GROUPS_REMOVED] Would have shown add-to-groups modal');
      safeToast.success("Friend added!", data.friend?.name ? `${data.friend.name} is now your friend` : "You're now friends");

      if (__DEV__) {
        const durationMs = context?._t0 ? Date.now() - context._t0 : 0;
        devLog('[ACTION_FEEDBACK]', JSON.stringify({ action: 'friend_accept', state: 'success', durationMs }));
      }

      // Check if we should show second order social nudge
      if (bootStatus === 'authed') {
        const canShow = await canShowSecondOrderSocialNudge();
        if (canShow) {
          setShowSecondOrderSocialNudge(true);
        }
      }
    },
    onError: (_error, _requestId, context) => {
      // Rollback optimistic removal
      if (context?.previousRequests) {
        queryClient.setQueryData(["friendRequests"], context.previousRequests);
      }
      safeToast.error("Accept Failed", "Could not accept request. Please try again.");
      if (__DEV__) {
        const durationMs = context?._t0 ? Date.now() - context._t0 : 0;
        devLog('[ACTION_FEEDBACK]', JSON.stringify({ action: 'friend_accept', state: 'error', durationMs }));
      }
    },
    onSettled: () => {
      refreshAfterFriendAccept(queryClient);
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.put(`/api/friends/request/${requestId}`, { status: "rejected" }),
    onMutate: async (requestId) => {
      const _t0 = Date.now();
      // Optimistically remove the request from the list
      await queryClient.cancelQueries({ queryKey: ["friendRequests"] });
      const previousRequests = queryClient.getQueryData(["friendRequests"]);
      queryClient.setQueryData(["friendRequests"], (old: any) => {
        if (!old?.received) return old;
        return { ...old, received: old.received.filter((r: any) => r.id !== requestId) };
      });
      if (__DEV__) {
        devLog('[ACTION_FEEDBACK]', JSON.stringify({ action: 'friend_reject', state: 'optimistic', requestId }));
      }
      return { previousRequests, _t0 };
    },
    onSuccess: (_data, _requestId, context) => {
      refetchRequests();
      if (__DEV__) {
        const durationMs = context?._t0 ? Date.now() - context._t0 : 0;
        devLog('[ACTION_FEEDBACK]', JSON.stringify({ action: 'friend_reject', state: 'success', durationMs }));
      }
    },
    onError: (_error, _requestId, context) => {
      // Rollback optimistic removal
      if (context?.previousRequests) {
        queryClient.setQueryData(["friendRequests"], context.previousRequests);
      }
      safeToast.error("Decline Failed", "Could not decline request. Please try again.");
      if (__DEV__) {
        const durationMs = context?._t0 ? Date.now() - context._t0 : 0;
        devLog('[ACTION_FEEDBACK]', JSON.stringify({ action: 'friend_reject', state: 'error', durationMs }));
      }
    },
    onSettled: () => {
      refreshAfterFriendReject(queryClient);
    },
  });

  // [LEGACY_ADD_TO_GROUPS_REMOVED] - addFriendToGroupsMutation removed pre-launch

  // Second order social nudge handlers
  const handleSecondOrderNudgePrimary = async () => {
    await markSecondOrderSocialNudgeCompleted();
    setShowSecondOrderSocialNudge(false);
    router.push("/social");
  };

  const handleSecondOrderNudgeSecondary = async () => {
    await markSecondOrderSocialNudgeCompleted();
    setShowSecondOrderSocialNudge(false);
    if (!guardEmailVerification(session)) return;
    router.push("/create");
  };

  const handleSecondOrderNudgeDismiss = async () => {
    await markSecondOrderSocialNudgeCompleted();
    setShowSecondOrderSocialNudge(false);
  };

  const friends = friendsData?.friends ?? [];
  const receivedRequests = requestsData?.received ?? [];

  // [LEGACY_GROUPS_PURGED] groups query and variable removed

  // Fetch circles (Planning groups)
  const { data: circlesData, refetch: refetchCircles } = useQuery({
    queryKey: circleKeys.all(),
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 5 * 60 * 1000, // 5 min - circles rarely change
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev: GetCirclesResponse | undefined) => prev, // [PERF_SWEEP] Keep circles visible during refetch
  });

  const circlesRaw = circlesData?.circles ?? [];

  // [P0_CHAT_BUMP_UI] Sort: pinned first, then by lastMessageAt desc (fallback updatedAt/createdAt)
  const circles = useMemo(() => {
    return [...circlesRaw].sort((a: any, b: any) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aTime = a.lastMessageAt ?? a.updatedAt ?? a.createdAt ?? '';
      const bTime = b.lastMessageAt ?? b.updatedAt ?? b.createdAt ?? '';
      return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
    });
  }, [circlesRaw]);

  // [P0_CIRCLE_LIST_REFRESH] SSOT: circle invalidation now handled by useLiveRefreshContract
  // (Removed duplicate useFocusEffect — refetchCircles is in refetchFns below)

  // [LIVE_REFRESH] SSOT live-feel contract: manual + foreground + focus
  const { isRefreshing: liveIsRefreshing, onManualRefresh: onFriendsManualRefresh } = useLiveRefreshContract({
    screenName: "friends",
    refetchFns: [refetch, refetchRequests, refetchCircles],
  });

  // [P1_CIRCLE_BADGE] Per-circle unread overlay from unread v2 SSOT
  const { data: unreadData } = useQuery({
    queryKey: circleKeys.unreadCount(),
    queryFn: () => api.get<{ totalUnread: number; byCircle: Record<string, number> }>("/api/circles/unread/count"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 300000,
  });
  const byCircle = unreadData?.byCircle ?? {};

  // [P1_CIRCLES_RENDER] Proof log: circles render on friends screen
  if (__DEV__ && circles.length > 0) {
    const renderSnapshot = circles.slice(0, 5).map(c => ({
      id: c.id.slice(0, 6),
      name: c.name,
      isPinned: c.isPinned ?? false,
      isMuted: c.isMuted ?? false,
    }));
    devLog("[P1_CIRCLES_RENDER]", "friends screen circles render", { count: circles.length, first5: renderSnapshot });
  }

  // Fetch pinned friendships
  const { data: pinnedData, isFetched: pinnedFetched } = useQuery({
    queryKey: ["pinnedFriendships"],
    queryFn: () => api.get<{ pinnedFriendshipIds: string[] }>("/api/circles/friends/pinned"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 5 * 60 * 1000, // 5 min
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Update local state when pinned data loads
  useEffect(() => {
    if (pinnedData?.pinnedFriendshipIds) {
      setPinnedFriendshipIds(new Set(pinnedData.pinnedFriendshipIds));
      if (__DEV__) devLog("[DEV_DECISION] pin loaded from server", { 
        count: pinnedData.pinnedFriendshipIds.length, 
        ids: pinnedData.pinnedFriendshipIds,
        source: "server" 
      });
    }
  }, [pinnedData]);

  // Circle mutations
  const createCircleMutation = useMutation({
    mutationFn: (data: { name: string; emoji?: string; memberIds: string[] }) =>
      api.post("/api/circles", data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshAfterCircleCreate(queryClient);
      refetchCircles();
      setShowCreateCircle(false);
    },
    onError: () => {
      safeToast.error("Create Failed", "Failed to create circle");
    },
  });

  const pinCircleMutation = useMutation({
    mutationFn: (circleId: string) => {
      devLog("[P1_CIRCLES_CARD]", "action=start", "type=pin", `circleId=${circleId}`, "screen=friends");
      return api.post(`/api/circles/${circleId}/pin`, {});
    },
    onMutate: async (circleId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: circleKeys.all() });
      
      // Snapshot previous value
      const previousCircles = queryClient.getQueryData(circleKeys.all());
      
      // Optimistically update cache
      queryClient.setQueryData(circleKeys.all(), (old: any) => {
        if (!old?.circles) return old;
        const circles = old.circles.map((c: any) => {
          if (c.id === circleId) {
            return { ...c, isPinned: !c.isPinned };
          }
          return c;
        });
        // Sort pinned circles first
        circles.sort((a: any, b: any) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return 0;
        });
        return { ...old, circles };
      });
      
      return { previousCircles };
    },
    onSuccess: (_, circleId) => {
      devLog("[P1_CIRCLES_CARD]", "action=success", "type=pin", `circleId=${circleId}`, "screen=friends");
      refetchCircles();
    },
    onError: (error, circleId, context) => {
      devError("[P1_CIRCLES_CARD]", "action=failure", "type=pin", `circleId=${circleId}`, `error=${error}`, "screen=friends");
      // Revert optimistic update
      if (context?.previousCircles) {
        queryClient.setQueryData(circleKeys.all(), context.previousCircles);
      }
    },
  });

  const deleteCircleMutation = useMutation({
    mutationFn: (circleId: string) => {
      devLog("[P1_CIRCLES_CARD]", "action=start", "type=delete", `circleId=${circleId}`, "screen=friends");
      return api.delete(`/api/circles/${circleId}`);
    },
    onMutate: async (circleId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: circleKeys.all() });
      
      // Snapshot previous value
      const previousCircles = queryClient.getQueryData(circleKeys.all());
      
      // Optimistically remove from cache
      queryClient.setQueryData(circleKeys.all(), (old: any) => {
        if (!old?.circles) return old;
        return {
          ...old,
          circles: old.circles.filter((c: any) => c.id !== circleId),
        };
      });
      
      return { previousCircles };
    },
    onSuccess: (_, circleId) => {
      devLog("[P1_CIRCLES_CARD]", "action=success", "type=delete", `circleId=${circleId}`, "screen=friends");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshAfterCircleLeave(queryClient, circleId);
      refetchCircles();
    },
    onError: (error, circleId, context) => {
      devError("[P1_CIRCLES_CARD]", "action=failure", "type=delete", `circleId=${circleId}`, `error=${error}`, "screen=friends");
      // Revert optimistic update
      if (context?.previousCircles) {
        queryClient.setQueryData(circleKeys.all(), context.previousCircles);
      }
    },
  });

  // Pin friendship mutation - persists to server and invalidates query for remount resilience
  const pinFriendshipMutation = useMutation({
    mutationFn: (friendshipId: string) =>
      api.post<{ isPinned: boolean }>(`/api/circles/friends/${friendshipId}/pin`, {}),
    onSuccess: (data, friendshipId) => {
      const newPinned = new Set(pinnedFriendshipIds);
      if (data.isPinned) {
        newPinned.add(friendshipId);
      } else {
        newPinned.delete(friendshipId);
      }
      setPinnedFriendshipIds(newPinned);
      // Invalidate the query to ensure persistence across remounts
      queryClient.invalidateQueries({ queryKey: ["pinnedFriendships"] });
      if (__DEV__) devLog("[DEV_DECISION] pin persisted", { friendId: friendshipId, isPinned: data.isPinned, source: "server" });
    },
  });

  // [LEGACY_GROUPS_PURGED] updateGroupMutation, deleteGroupMutation, removeMemberFromGroupMutation removed

  // Filter friends (no group filtering) and sort by pinned status
  const filteredFriends = useMemo(() => {
    // Filter out any friendships where friend is undefined
    const result = friends.filter((friendship) => friendship.friend != null);
    // Sort pinned friends first
    return result.sort((a, b) => {
      const aPinned = pinnedFriendshipIds.has(a.id);
      const bPinned = pinnedFriendshipIds.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [friends, pinnedFriendshipIds]);

  // DEV: Log first render timing after data loads
  React.useEffect(() => {
    if (__DEV__ && !hasLoggedFirstRenderRef.current && filteredFriends.length > 0) {
      hasLoggedFirstRenderRef.current = true;
      console.timeEnd("[PERF] Friends screen first render");
      devLog(`[PERF] Friends list count: ${filteredFriends.length}`);
    }
  }, [filteredFriends.length]);

  // FlatList callbacks - memoized to prevent unnecessary re-renders
  const friendKeyExtractor = useCallback((item: Friendship) => item.id, []);
  
  const handlePinFriend = useCallback((id: string) => {
    pinFriendshipMutation.mutate(id);
  }, [pinFriendshipMutation]);
  
  const renderFriendListItem = useCallback(({ item, index }: { item: Friendship; index: number }) => (
    <FriendListItem 
      friendship={item} 
      index={index} 
      bootStatus={bootStatus}
      session={session}
      onPin={handlePinFriend}
      isPinned={pinnedFriendshipIds.has(item.id)}
    />
  ), [bootStatus, session, handlePinFriend, pinnedFriendshipIds]);
  
  const renderFriendCard = useCallback(({ item, index }: { item: Friendship; index: number }) => (
    <FriendCard 
      friendship={item} 
      index={index} 
      bootStatus={bootStatus}
      session={session}
      onPin={handlePinFriend}
      isPinned={pinnedFriendshipIds.has(item.id)}
    />
  ), [bootStatus, session, handlePinFriend, pinnedFriendshipIds]);

  // [LEGACY_GROUPS_PURGED] selectedGroup memo removed

  // P0_FIX: STABLE AUTH GATE - NEVER show login UI except when DEFINITIVELY logged out
  // INVARIANT: Tab screens must defer to BootRouter for auth routing decisions
  // Only bootStatus === 'loggedOut' means user is truly logged out; all other states show skeleton
  if (!session || bootStatus !== 'authed') {
    if (__DEV__) {
      devLog('[P0_FRIENDS_AUTH] Gate check - bootStatus:', bootStatus, 'session:', !!session);
    }
    
    // ONLY show login prompt when bootStatus is DEFINITIVELY 'loggedOut'
    // All other states (loading, authed-but-no-session-yet, onboarding, degraded, error) → skeleton
    if (bootStatus === 'loggedOut') {
      if (__DEV__) {
        devLog('[P0_FRIENDS_AUTH] → Showing login prompt (bootStatus=loggedOut)');
      }
      return (
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        /* INVARIANT_ALLOW_INLINE_ARRAY_PROP */
        <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
          <View className="flex-1 items-center justify-center px-8">
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-xl font-semibold mb-2" style={{ color: colors.text }}>
              Sign in to see your friends
            </Text>
            <Button
              variant="primary"
              label="Sign In"
              /* INVARIANT_ALLOW_INLINE_HANDLER */
              onPress={() => router.replace("/login")}
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ marginTop: 16 }}
            />
          </View>
          <BottomNavigation />
        </SafeAreaView>
      );
    }
    
    // All non-loggedOut states show skeleton (loading, authed, onboarding, degraded, error)
    if (__DEV__) {
      devLog('[P0_FRIENDS_AUTH] → Showing skeleton (bootStatus=' + bootStatus + ', waiting for session)');
    }

    // [P0_LOADING_ESCAPE] Timeout escape
    if (isBootTimedOut) {
      return (
        <LoadingTimeoutUI
          context="friends"
          onRetry={handleLoadingRetry}
          isRetrying={isRetrying}
          showBottomNav={true}
        />
      );
    }

    return (
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      /* INVARIANT_ALLOW_INLINE_ARRAY_PROP */
      <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
        <AppHeader title="Friends" />
        <FriendsListSkeleton />
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  return (
    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
    /* INVARIANT_ALLOW_INLINE_ARRAY_PROP */
    <SafeAreaView testID="friends-screen" className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
      <AppHeader
        title="Friends"
        left={<HelpSheet screenKey="friends" config={HELP_SHEETS.friends} />}
        right={
          <View className="flex-row items-center">
            {receivedRequests.length > 0 && (
              <View
                className="w-6 h-6 rounded-full items-center justify-center mr-2"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ backgroundColor: themeColor }}
              >
                <Text className="text-white text-xs font-bold">{receivedRequests.length}</Text>
              </View>
            )}
            <Pressable
              /* INVARIANT_ALLOW_INLINE_HANDLER */
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/add-friends" as any);
              }}
              className="flex-row items-center px-3 py-1.5 rounded-full"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ backgroundColor: themeColor }}
            >
              <Plus size={14} color="#fff" />
              <Text className="text-xs font-semibold text-white ml-1">Add</Text>
            </Pressable>
          </View>
        }
      />

      {/* ── Tab Header: Activity | Chats | People ────────── */}
      <View className="px-5 pb-3">
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <View className="flex-row" style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: 3 }}>
          {/* INVARIANT_ALLOW_SMALL_MAP */}
          {FRIENDS_TABS.map((label, idx) => {
            const isActive = friendsTab === idx;
            const icon = idx === 0 ? Activity : idx === 1 ? MessageCircle : Users;
            const IconComp = icon;
            return (
              <Pressable
                key={label}
                /* INVARIANT_ALLOW_INLINE_HANDLER */
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFriendsTab(idx);
                }}
                className="flex-1 flex-row items-center justify-center py-2 rounded-lg"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ backgroundColor: isActive ? colors.surface : "transparent" }}
              >
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <View style={{ position: "relative" }}>
                  <IconComp size={15} color={isActive ? themeColor : colors.textSecondary} />
                  {/* Activity badge: unseen count dot */}
                  {idx === 0 && unseenCount > 0 && (
                    <View
                      className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full"
                      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                      style={{ backgroundColor: "#EF4444" }}
                    />
                  )}
                </View>
                <Text
                  className="text-xs font-semibold ml-1.5"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ color: isActive ? themeColor : colors.textSecondary }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={liveIsRefreshing || isRefetching}
            onRefresh={onFriendsManualRefresh}
            tintColor={themeColor}
          />
        }
      >
        {/* ── Active pane based on friendsTab ────────────── */}
        {friendsTab === 0 && <FriendsActivityPane />}

        {friendsTab === 1 && (
          <FriendsChatsPane
            circles={circles}
            planningExpanded={planningExpanded}
            onTogglePlanningExpanded={() => setPlanningExpanded(!planningExpanded)}
            onCreateCirclePress={handleCreateCirclePress}
            byCircle={byCircle}
            onPinCircle={(id) => pinCircleMutation.mutate(id)}
            onLeaveCircle={(id, name) => {
              setCircleToLeave({ id, name });
              setShowLeaveCircleConfirm(true);
            }}
          />
        )}

        {friendsTab === 2 && (
          <FriendsPeoplePane
            receivedRequests={receivedRequests}
            requestsExpanded={requestsExpanded}
            onToggleRequestsExpanded={() => setRequestsExpanded(!requestsExpanded)}
            isAcceptPending={acceptRequestMutation.isPending}
            isRejectPending={rejectRequestMutation.isPending}
            onAcceptRequest={(id) => acceptRequestMutation.mutate(id)}
            onRejectRequest={(id) => rejectRequestMutation.mutate(id)}
            filteredFriends={filteredFriends}
            friendsExpanded={friendsExpanded}
            onToggleFriendsExpanded={() => setFriendsExpanded(!friendsExpanded)}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            isLoading={isLoading}
            pinnedFriendshipIds={pinnedFriendshipIds}
            friendKeyExtractor={friendKeyExtractor}
            renderFriendListItem={renderFriendListItem}
            renderFriendCard={renderFriendCard}
          />
        )}
      </ScrollView>

      {/* Create Circle Modal */}
      <CreateCircleModal
        visible={showCreateCircle}
        onClose={() => setShowCreateCircle(false)}
        onConfirm={(name, emoji, memberIds) => {
          createCircleMutation.mutate({ name, emoji, memberIds });
        }}
        /* INVARIANT_ALLOW_SMALL_MAP */
        friends={friends.filter((f) => f.friend != null).map((f) => ({
          id: f.id,
          friendId: f.friendId,
          friend: f.friend,
        }))}
        isLoading={createCircleMutation.isPending}
      />

      {/* [LEGACY_GROUPS_PURGED] Group Filter Modal, Edit Group Modal, and Add to Groups Modal fully removed */}

      {/* Paywall Modal for circles gating */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
      />

      {/* Leave Circle Confirmation */}
      <ConfirmModal
        visible={showLeaveCircleConfirm}
        title="Leave Circle"
        message={`Are you sure you want to leave "${circleToLeave?.name}"?`}
        confirmText="Leave"
        isDestructive
        onConfirm={() => {
          if (circleToLeave) {
            deleteCircleMutation.mutate(circleToLeave.id);
          }
          setShowLeaveCircleConfirm(false);
          setCircleToLeave(null);
        }}
        onCancel={() => {
          setShowLeaveCircleConfirm(false);
          setCircleToLeave(null);
        }}
      />

      {/* [LEGACY_GROUPS_PURGED] Delete Group Confirmation removed */}

      <SecondOrderSocialNudge
        visible={showSecondOrderSocialNudge}
        onPrimary={handleSecondOrderNudgePrimary}
        onSecondary={handleSecondOrderNudgeSecondary}
        onDismiss={handleSecondOrderNudgeDismiss}
      />

      {/* Onboarding Guide Overlay */}
      {onboardingGuide.shouldShowStep("friends_tab") && (
        <OnboardingGuideOverlay
          step="friends_tab"
          onDismiss={() => onboardingGuide.completeStep("friends_tab")}
          onSkipAll={() => onboardingGuide.dismissGuide()}
          themeColor={themeColor}
          isDark={isDark}
          colors={colors}
          position="bottom"
        />
      )}
      {onboardingGuide.shouldShowStep("add_friend") && (
        <OnboardingGuideOverlay
          step="add_friend"
          onDismiss={() => onboardingGuide.completeStep("add_friend")}
          onSkipAll={() => onboardingGuide.dismissGuide()}
          themeColor={themeColor}
          isDark={isDark}
          colors={colors}
          position="top"
        />
      )}

      <BottomNavigation />
    </SafeAreaView>
  );
}
