import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  RefreshControl,
  Modal,
  FlatList,
  Platform,
} from "react-native";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ShareAppButton } from "@/components/ShareApp";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Search,
  UserPlus,
  ChevronRight,
  ChevronDown,
  Users,
  Check,
  X,
  Bell,
  Contact,
  Phone,
  Mail,
  FlaskConical,
  Calendar,
  Clock,
  MapPin,
  List,
  LayoutGrid,
  Activity,
  Sparkles,
  BadgeCheck,
  Plus,
  Pin,
  Trash2,
  ChevronUp,
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
import * as Contacts from "expo-contacts";

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
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useStickyLoading } from "@/lib/useStickyLoading";
import { useUnseenNotificationCount } from "@/hooks/useUnseenNotifications";
import { api } from "@/lib/api";
import { useTheme, TILE_SHADOW } from "@/lib/ThemeContext";
import { circleKeys } from "@/lib/circleQueryKeys";
import { trackFriendAdded } from "@/lib/rateApp";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, useIsPro, canCreateCircle, type PaywallContext } from "@/lib/entitlements";
import { useOnboardingGuide } from "@/hooks/useOnboardingGuide";
import { OnboardingGuideOverlay } from "@/components/OnboardingGuideOverlay";
import {
  type GetFriendsResponse,
  type GetFriendRequestsResponse,
  type SendFriendRequestResponse,
  type Friendship,
  type FriendRequest,
  type GetFriendEventsResponse,
  type Event,
  type Circle,
  type GetCirclesResponse,
  type SearchUsersRankedResponse,
  type SearchUserResult,
} from "@/shared/contracts";
import { useNetworkStatus } from "@/lib/networkStatus";
import { wrapRace } from "@/lib/devStress";
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
    <View className="mt-2 pt-2 border-t" style={{ borderTopColor: colors.separator }}>
      {/* Day headers */}
      <View className="flex-row mb-1">
        {dayNames.map((day, i) => (
          <View key={i} className="flex-1 items-center">
            <Text className="text-[8px]" style={{ color: colors.textTertiary }}>{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid - compact version showing only necessary rows */}
      <View className="flex-row flex-wrap">
        {/* Empty cells for days before month starts */}
        {Array.from({ length: startingDay }).map((_, i) => (
          <View key={`empty-${i}`} className="w-[14.28%] h-4" />
        ))}

        {/* Days of the month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const hasEvent = eventDays.has(day);
          const isToday = day === today.getDate();

          return (
            <View key={day} className="w-[14.28%] h-4 items-center justify-center">
              <View
                className="w-3.5 h-3.5 rounded-full items-center justify-center"
                style={{
                  backgroundColor: hasEvent ? themeColor : "transparent",
                  borderWidth: isToday ? 1 : 0,
                  borderColor: isToday ? themeColor : "transparent",
                }}
              >
                <Text
                  className="text-[7px]"
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
          <View className="w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: themeColor }} />
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
          style={{ width: ACTION_WIDTH_PX }}
        >
          <Pressable
            onPress={() => { translateX.value = withSpring(0, { damping: 20, stiffness: 200 }); triggerPin(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-14 h-14 rounded-2xl items-center justify-center"
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
            style={{ marginRight: 12 }}
          />
          <View className="flex-1">
            <View className="flex-row items-center flex-nowrap gap-1.5">
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }} numberOfLines={1} ellipsizeMode="tail">
                {friend.name ?? friend.email ?? "Unknown"}
              </Text>
            </View>
            {cardSecondaryLine ? (
              <Text
                className="mt-0.5"
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
            style={{ width: 72 }}
          >
            <Pressable
              onPress={() => { translateX.value = withSpring(0, { damping: 20, stiffness: 200 }); triggerPin(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="w-14 h-14 rounded-2xl items-center justify-center"
              style={{ backgroundColor: '#10B981' }}
            >
              <Pin size={20} color="#fff" />
            </Pressable>
          </View>
        )}
        
        <GestureDetector gesture={panGesture}>
          <Animated.View 
            className="rounded-xl overflow-hidden"
            style={[{ backgroundColor: colors.surface, borderWidth: 1, borderColor: isPinned ? themeColor + "40" : colors.border }, cardAnimatedStyle]}
          >
            {/* Main row — SSOT UserRow (friends list) */}
            <UserRow
              avatarUri={friend.image}
              handle={friend.Profile?.handle}
              displayName={friend.name}
              bio={friend.Profile?.calendarBio}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/friend/${friendship.id}` as any);
              }}
              leftAccessory={isPinned ? (
                <View style={{ marginRight: 6 }}>
                  <Pin size={14} color={themeColor} />
                </View>
              ) : undefined}
              rightAccessory={
                <Pressable
                  onPress={(e) => { e.stopPropagation(); toggleExpand(); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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

function FriendRequestCard({
  request,
  type,
  onAccept,
  onReject,
  actionPending = false,
  themeColor,
  isDark,
  colors,
  onViewProfile,
}: {
  request: FriendRequest;
  type: "received" | "sent";
  onAccept?: () => void;
  onReject?: () => void;
  actionPending?: boolean;
  themeColor: string;
  isDark: boolean;
  colors: any;
  onViewProfile?: () => void;
}) {
  const user = type === "received" ? request.sender : request.receiver;
  const mutualCount = request.mutualCount ?? 0;
  
  // Extract profile info from sender/receiver
  const username = user?.Profile?.handle;
  const calendarBio = user?.Profile?.calendarBio;
  
  // Build metadata line segments (Line 2)
  // Format: "X mutual friends • @username • calendarBio" or "New to Open Invite • @username • calendarBio"
  const metadataSegments: string[] = [];
  
  if (type === "received") {
    if (mutualCount > 0) {
      metadataSegments.push(`👥 ${mutualCount} mutual friend${mutualCount === 1 ? "" : "s"}`);
    } else {
      metadataSegments.push("New to Open Invite");
    }
  } else {
    metadataSegments.push("Pending");
  }
  
  if (username) {
    metadataSegments.push(`@${username}`);
  }
  
  if (calendarBio) {
    metadataSegments.push(calendarBio);
  }
  
  const metadataLine = metadataSegments.join(" • ");

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onViewProfile?.();
      }}
      className="flex-row items-center rounded-xl p-3 mb-2"
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <EntityAvatar
        photoUrl={user?.image}
        initials={user?.name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?"}
        size={40}
        backgroundColor={user?.image ? colors.avatarBg : themeColor + "20"}
        foregroundColor={themeColor}
        style={{ marginRight: 12 }}
      />
      <View className="flex-1 mr-2">
        {/* Line 1: Name + Badge Pill */}
        <View className="flex-row items-center flex-nowrap gap-1.5">
          <Text 
            className="font-medium" 
            style={{ color: colors.text }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {user?.name ?? user?.email ?? "Unknown"}
          </Text>
        </View>
        {/* Line 2: Metadata (mutual friends • @username • calendarBio) */}
        <Text 
          className="text-xs mt-0.5" 
          style={{ color: colors.textSecondary }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {metadataLine}
        </Text>
      </View>
      {type === "received" && (
        <View className="flex-row">
          <Pressable
            testID="friend-request-reject"
            onPress={(e) => {
              e.stopPropagation();
              onReject?.();
            }}
            disabled={actionPending}
            className="w-8 h-8 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: colors.inputBg, opacity: actionPending ? 0.4 : 1 }}
          >
            <X size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            testID="friend-request-accept"
            onPress={(e) => {
              e.stopPropagation();
              onAccept?.();
            }}
            disabled={actionPending}
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: themeColor, opacity: actionPending ? 0.4 : 1 }}
          >
            <Check size={16} color="#fff" />
          </Pressable>
        </View>
      )}
      <ChevronRight size={16} color={colors.textTertiary} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

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
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string }>();
  // [LEGACY_GROUPS_PURGED] initialGroupId removed - no longer filtering by groups
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [searchEmail, setSearchEmail] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  // Auto-open search modal if navigated with ?search=true
  useEffect(() => {
    if (params.search === "true") {
      setShowAddFriend(true);
    }
  }, [params.search]);

  // Live search state
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = React.useRef("");
  const networkStatus = useNetworkStatus();

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

  // Debounce search input for live search
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = searchEmail.trim();
    latestQueryRef.current = trimmed;

    // Clear results if query is too short
    if (trimmed.length < 2) {
      setDebouncedQuery("");
      return;
    }

    // Set debounced query after 300ms
    debounceTimerRef.current = setTimeout(() => {
      // Only update if this is still the latest query
      if (latestQueryRef.current === trimmed) {
        setDebouncedQuery(trimmed);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchEmail]);

  // Live search query
  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError
  } = useQuery({
    queryKey: ["userSearch", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return { users: [] };
      const response = await api.get<SearchUsersRankedResponse>(
        `/api/profile/search?q=${encodeURIComponent(debouncedQuery)}&limit=15`
      );
      return response;
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!debouncedQuery && debouncedQuery.length >= 2 && networkStatus.isOnline,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute
  });

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
  });

  const sendRequestMutation = useMutation({
    mutationFn: (data: { email?: string; phone?: string }) =>
      wrapRace("friend_request_send", () => api.post<SendFriendRequestResponse>("/api/friends/request", data)),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data.message) {
        safeToast.info("Info", data.message);
      } else {
        safeToast.success("Success", "Friend request sent!");
      }
      setSearchEmail("");
      setShowAddFriend(false);
      setShowContactsModal(false);
      refetchRequests();
      
      // Complete "add_friend" onboarding step when user sends a friend request
      if (onboardingGuide.shouldShowStep("add_friend")) {
        onboardingGuide.completeStep("add_friend");
      }
    },
    onError: () => {
      safeToast.error("Error", "Failed to send friend request");
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.put<{ success: boolean; friendshipId?: string; friend?: { id: string; name: string | null; image: string | null } }>(`/api/friends/request/${requestId}`, { status: "accepted" }),
    onSuccess: async (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
      refetchRequests();

      // Track friend added for rate app prompt
      trackFriendAdded();

      // [LEGACY_ADD_TO_GROUPS_REMOVED] - modal trigger removed pre-launch
      if (__DEV__) devLog('[LEGACY_ADD_TO_GROUPS_REMOVED] Would have shown add-to-groups modal');
      safeToast.success("Friend added!", data.friend?.name ? `${data.friend.name} is now your friend` : "You're now friends");

      // Check if we should show second order social nudge
      if (bootStatus === 'authed') {
        const canShow = await canShowSecondOrderSocialNudge();
        if (canShow) {
          setShowSecondOrderSocialNudge(true);
        }
      }
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.put(`/api/friends/request/${requestId}`, { status: "rejected" }),
    onSuccess: () => {
      refetchRequests();
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

  const loadContacts = async () => {
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        safeToast.warning("Permission Required", "Please allow access to contacts to add friends.");
        setContactsLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Image,
        ],
        sort: Contacts.SortTypes.FirstName,
      });

      // Filter contacts that have either email or phone
      const validContacts = data.filter(
        (c) => (c.emails && c.emails.length > 0) || (c.phoneNumbers && c.phoneNumbers.length > 0)
      );
      setPhoneContacts(validContacts);
      setShowContactsModal(true);
    } catch (error) {
      devError("Error loading contacts:", error);
      safeToast.error("Error", "Failed to load contacts");
    }
    setContactsLoading(false);
  };

  const handleInviteContact = (contact: Contacts.Contact) => {
    // Guard: require email verification
    if (!guardEmailVerification(session)) {
      return;
    }

    const email = contact.emails?.[0]?.email;
    const phone = contact.phoneNumbers?.[0]?.number;

    if (email) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendRequestMutation.mutate({ email });
    } else if (phone) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendRequestMutation.mutate({ phone });
    } else {
      safeToast.warning("No Contact Info", `${contact.name ?? "This contact"} doesn't have an email or phone.`);
    }
  };

  const handleDirectFriendRequest = () => {
    // Guard: require email verification
    if (!guardEmailVerification(session)) {
      return;
    }

    if (searchEmail.trim()) {
      // Check if it looks like a phone number (mostly digits)
      const cleaned = searchEmail.trim().replace(/[^\d]/g, '');
      if (cleaned.length >= 7 && cleaned.length === searchEmail.trim().replace(/[\s\-\(\)]/g, '').length) {
        sendRequestMutation.mutate({ phone: searchEmail.trim() });
      } else {
        sendRequestMutation.mutate({ email: searchEmail.trim() });
      }
    }
  };

  const filteredContacts = phoneContacts.filter((contact) => {
    if (!contactSearch.trim()) return true;
    const search = contactSearch.toLowerCase();
    const name = contact.name?.toLowerCase() ?? "";
    const email = contact.emails?.[0]?.email?.toLowerCase() ?? "";
    return name.includes(search) || email.includes(search);
  });

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
  });

  const circles = circlesData?.circles ?? [];

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
      refetchCircles();
      setShowCreateCircle(false);
    },
    onError: () => {
      safeToast.error("Error", "Failed to create circle");
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
        <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-xl font-semibold mb-2" style={{ color: colors.text }}>
              Sign in to see your friends
            </Text>
            <Button
              variant="primary"
              label="Sign In"
              onPress={() => router.replace("/login")}
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
    return (
      <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
        <AppHeader title="Friends" />
        <FriendsListSkeleton />
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="friends-screen" className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
      <AppHeader
        title="Friends"
        left={<HelpSheet screenKey="friends" config={HELP_SHEETS.friends} />}
        right={
          <View className="flex-row items-center">
            {receivedRequests.length > 0 && (
              <View
                className="w-6 h-6 rounded-full items-center justify-center mr-2"
                style={{ backgroundColor: themeColor }}
              >
                <Text className="text-white text-xs font-bold">{receivedRequests.length}</Text>
              </View>
            )}
            <Pressable
              onPress={() => setShowAddFriend(!showAddFriend)}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: themeColor }}
            >
              <UserPlus size={20} color="#fff" />
            </Pressable>
          </View>
        }
      />

      {/* Social Features Quick Access */}
      <View className="px-5 pb-3">
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/activity");
            }}
            className="flex-1 flex-row items-center justify-center px-3 py-2.5 rounded-xl"
            style={{ backgroundColor: "#2196F320", borderWidth: 1, borderColor: "#2196F330" }}
          >
            <View style={{ position: "relative" }}>
              <Activity size={16} color="#2196F3" />
              {/* [UNREAD_DOTS_REMOVED_P2.3] Badge indicator removed pre-launch */}
            </View>
            <Text className="text-sm font-medium ml-2" style={{ color: "#2196F3" }}>
              Activity
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/suggestions");
            }}
            className="flex-1 flex-row items-center justify-center px-3 py-2.5 rounded-xl"
            style={{ backgroundColor: "#9C27B020", borderWidth: 1, borderColor: "#9C27B030" }}
          >
            <Sparkles size={16} color="#9C27B0" />
            <Text className="text-sm font-medium ml-2" style={{ color: "#9C27B0" }}>
              Suggestions
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={themeColor}
          />
        }
      >
        {/* Add Friend Section */}
        {showAddFriend && (
          <Animated.View entering={FadeInDown.springify()} className="mb-4">
            <View className="rounded-xl p-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <Text className="font-semibold mb-3" style={{ color: colors.text }}>Add Friend</Text>

              {/* Import from Contacts Button */}
              <Pressable
                onPress={loadContacts}
                disabled={contactsLoading}
                className="flex-row items-center rounded-lg p-3 mb-3"
                style={{ backgroundColor: isDark ? "#0F766E20" : "#CCFBF1" }}
              >
                <View className="w-10 h-10 rounded-full bg-teal-500 items-center justify-center mr-3">
                  <Contact size={20} color="#fff" />
                </View>
                <View className="flex-1">
                  <Text className="font-medium" style={{ color: colors.text }}>
                    {contactsLoading ? "Loading..." : "Import from Contacts"}
                  </Text>
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    Add friends from your phone
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textSecondary} />
              </Pressable>

              {/* Divider */}
              <View className="flex-row items-center mb-3">
                <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
                <Text className="text-sm mx-3" style={{ color: colors.textTertiary }}>or search by</Text>
                <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
              </View>

              {/* Search Input - supports name, email, or phone */}
              <View className="flex-row items-center">
                <View className="flex-1 flex-row items-center rounded-lg px-3 mr-2" style={{ backgroundColor: colors.inputBg }}>
                  <Search size={18} color={colors.textSecondary} />
                  <TextInput
                    value={searchEmail}
                    onChangeText={setSearchEmail}
                    placeholder="Name, email, or phone"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    className="flex-1 py-3 px-2"
                    style={{ color: colors.text }}
                  />
                </View>
                <Button
                  variant="primary"
                  label={sendRequestMutation.isPending ? "..." : "Add"}
                  onPress={handleDirectFriendRequest}
                  disabled={sendRequestMutation.isPending}
                  style={{ borderRadius: 8 }}
                />
              </View>

              {/* Helper text */}
              <Text className="text-xs mt-2" style={{ color: colors.textTertiary }}>
                Search by name, email address, or phone number to find friends
              </Text>

              {/* Live Search Results */}
              {searchEmail.trim().length >= 2 && (
                <View className="mt-3">
                  {/* Offline state */}
                  {!networkStatus.isOnline && (
                    <View className="py-4 items-center">
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        Offline — search unavailable
                      </Text>
                    </View>
                  )}

                  {/* Loading state */}
                  {networkStatus.isOnline && isSearching && (
                    <View className="py-4 items-center">
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        Searching...
                      </Text>
                    </View>
                  )}

                  {/* Results */}
                  {networkStatus.isOnline && !isSearching && searchResults?.users && searchResults.users.length > 0 && (
                    <View>
                      {searchResults.users.map((user: SearchUserResult) => (
                        <Pressable
                          key={user.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push(`/user/${user.id}` as any);
                          }}
                          className="flex-row items-center py-3 border-t"
                          style={{ borderTopColor: colors.separator }}
                        >
                          {/* Avatar */}
                          <EntityAvatar
                            photoUrl={user.avatarUrl}
                            initials={user.name?.[0]?.toUpperCase() ?? user.handle?.[0]?.toUpperCase() ?? "?"}
                            size={40}
                            backgroundColor={user.avatarUrl ? "transparent" : themeColor + "20"}
                            foregroundColor={themeColor}
                          />

                          {/* User info */}
                          <View className="flex-1 ml-3">
                            <View className="flex-row items-center">
                              <Text className="font-medium" style={{ color: colors.text }}>
                                {user.name ?? (user.handle ? `@${user.handle}` : "Unknown")}
                              </Text>
                              {user.isFriend && (
                                <View className="ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: themeColor + "20" }}>
                                  <Text className="text-[10px] font-medium" style={{ color: themeColor }}>
                                    Friend
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View className="flex-row items-center">
                              {user.handle && (
                                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                                  @{user.handle}
                                </Text>
                              )}
                              {user.handle && (user.mutualCount ?? 0) > 0 && (
                                <Text className="text-sm mx-1" style={{ color: colors.textTertiary }}>•</Text>
                              )}
                              {(user.mutualCount ?? 0) > 0 && (
                                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                                  {user.mutualCount} mutual{user.mutualCount === 1 ? "" : "s"}
                                </Text>
                              )}
                            </View>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* No results */}
                  {networkStatus.isOnline && !isSearching && searchResults?.users && searchResults.users.length === 0 && debouncedQuery.length >= 2 && (
                    <View className="py-4 items-center">
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        No users found for "{debouncedQuery}"
                      </Text>
                      <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                        Try a different search or add by email/phone
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Friend Requests */}
        {receivedRequests.length > 0 && (
          <View testID="friends-requests" className="mb-4">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRequestsExpanded(!requestsExpanded);
              }}
              className="flex-row items-center justify-between mb-2"
            >
              <View className="flex-row items-center">
                <Bell size={16} color={themeColor} />
                <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
                  Friend Requests ({receivedRequests.length})
                </Text>
              </View>
              {requestsExpanded ? (
                <ChevronUp size={18} color={colors.textTertiary} />
              ) : (
                <ChevronDown size={18} color={colors.textTertiary} />
              )}
            </Pressable>
            {requestsExpanded && (
              <Animated.View entering={FadeInDown.duration(200)}>
                {receivedRequests.map((request: FriendRequest) => {
                  const senderId = request.sender?.id;
                  return (
                    <FriendRequestCard
                      key={request.id}
                      request={request}
                      type="received"
                      themeColor={themeColor}
                      isDark={isDark}
                      colors={colors}
                      actionPending={acceptRequestMutation.isPending || rejectRequestMutation.isPending}
                      onAccept={() => {
                        if (acceptRequestMutation.isPending || rejectRequestMutation.isPending) {
                          if (__DEV__) devLog('[P0_FRIEND_REQUEST_RACE_GUARD]', 'accept tap ignored, requestId=' + request.id);
                          return;
                        }
                        acceptRequestMutation.mutate(request.id);
                      }}
                      onReject={() => {
                        if (acceptRequestMutation.isPending || rejectRequestMutation.isPending) {
                          if (__DEV__) devLog('[P0_FRIEND_REQUEST_RACE_GUARD]', 'reject tap ignored, requestId=' + request.id);
                          return;
                        }
                        rejectRequestMutation.mutate(request.id);
                      }}
                      onViewProfile={() => {
                        if (senderId) {
                          router.push(`/user/${senderId}` as any);
                        }
                      }}
                    />
                  );
                })}
              </Animated.View>
            )}
          </View>
        )}

        {/* Planning Section (Circles) */}
        <View className="mb-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPlanningExpanded(!planningExpanded);
            }}
            className="flex-row items-center justify-between mb-2"
          >
            <View className="flex-row items-center">
              <Calendar size={16} color="#9333EA" />
              <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
                Planning ({circles.length})
              </Text>
            </View>
            <View className="flex-row items-center">
              {circles.length > 0 && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/circles" as any);
                  }}
                  className="mr-2"
                >
                  <Text className="text-xs font-medium" style={{ color: "#9333EA" }}>
                    View All
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  handleCreateCirclePress();
                }}
                className="w-7 h-7 rounded-full items-center justify-center mr-2"
                style={{ backgroundColor: "#9333EA" }}
              >
                <Plus size={14} color="#fff" />
              </Pressable>
              {planningExpanded ? (
                <ChevronUp size={18} color={colors.textTertiary} />
              ) : (
                <ChevronDown size={18} color={colors.textTertiary} />
              )}
            </View>
          </Pressable>

          {planningExpanded && (
            <Animated.View entering={FadeInDown.duration(200)}>
              {circles.length === 0 ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleCreateCirclePress();
                  }}
                  className="rounded-xl p-4 mb-2 border border-dashed items-center"
                  style={{ borderColor: "#9333EA50" }}
                >
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center mb-2"
                    style={{ backgroundColor: "#9333EA20" }}
                  >
                    <Plus size={24} color="#9333EA" />
                  </View>
                  <Text className="font-medium text-center" style={{ color: colors.text }}>
                    Create a Group
                  </Text>
                  <Text className="text-xs text-center mt-1" style={{ color: colors.textSecondary }}>
                    Plan events with friends in a group chat
                  </Text>
                </Pressable>
              ) : (
                circles.map((circle, index) => (
                  <CircleCard
                    key={circle.id}
                    circle={circle}
                    index={index}
                    unreadCount={byCircle[circle.id] ?? 0}
                    onPin={(id) => pinCircleMutation.mutate(id)}
                    onDelete={(id) => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      setCircleToLeave({ id, name: circle.name });
                      setShowLeaveCircleConfirm(true);
                    }}
                  />
                ))
              )}
            </Animated.View>
          )}
        </View>

        {/* Friends List - Collapsible */}
        <View className="mb-2">
          {/* Section Header Row */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFriendsExpanded(!friendsExpanded);
            }}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Users size={16} color="#4ECDC4" />
              <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
                Friends ({filteredFriends.length})
              </Text>
            </View>
            {friendsExpanded ? (
              <ChevronUp size={18} color={colors.textTertiary} />
            ) : (
              <ChevronDown size={18} color={colors.textTertiary} />
            )}
          </Pressable>

          {/* View Mode Toggle & Filter - Only show when expanded */}
          {friendsExpanded && (
            <View className="flex-row items-center justify-between mt-2">
              {/* View Mode Toggle */}
              <View className="flex-row items-center rounded-lg p-0.5" style={{ backgroundColor: colors.surface2 }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleViewModeChange("list");
                  }}
                  className="flex-row items-center px-2.5 py-1 rounded-md"
                  style={{ backgroundColor: viewMode === "list" ? colors.surface : "transparent" }}
                >
                  <List size={14} color={viewMode === "list" ? themeColor : colors.textSecondary} />
                  <Text
                    className="text-xs font-medium ml-1"
                    style={{ color: viewMode === "list" ? themeColor : colors.textSecondary }}
                  >
                    List
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleViewModeChange("detailed");
                  }}
                  className="flex-row items-center px-2.5 py-1 rounded-md"
                  style={{ backgroundColor: viewMode === "detailed" ? colors.surface : "transparent" }}
                >
                  <LayoutGrid size={14} color={viewMode === "detailed" ? themeColor : colors.textSecondary} />
                  <Text
                    className="text-xs font-medium ml-1"
                    style={{ color: viewMode === "detailed" ? themeColor : colors.textSecondary }}
                  >
                    Detailed
                  </Text>
                </Pressable>
              </View>
              {/* [LEGACY_GROUPS_PURGED] Group Filter Button removed */}
            </View>
          )}
        </View>

        {friendsExpanded && (
          <Animated.View entering={FadeInDown.duration(200)}>
            {isLoading ? (
              <FriendsListSkeleton />
            ) : filteredFriends.length === 0 ? (
              <View className="py-12 items-center px-8">
                <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: `${themeColor}15` }}>
                  <Users size={36} color={themeColor} />
                </View>
                <Text className="text-xl font-semibold text-center mb-2" style={{ color: colors.text }}>
                  No friends yet
                </Text>
                <Text className="text-sm text-center leading-5 mb-6" style={{ color: colors.textSecondary }}>
                  Invite friends to see their plans and share yours
                </Text>
                <ShareAppButton variant="full" />
              </View>
            ) : (
              <FlatList
                data={filteredFriends}
                keyExtractor={friendKeyExtractor}
                renderItem={viewMode === "list" ? renderFriendListItem : renderFriendCard}
                // Virtualization tuning for smooth scroll with 50+ friends
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={9}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews={Platform.OS === 'android'} // Safe on Android, can cause issues on iOS
                // Allow nested scrolling inside parent ScrollView
                nestedScrollEnabled
                scrollEnabled={false} // Let parent ScrollView handle scrolling
                // Stable list - avoid re-renders
                extraData={pinnedFriendshipIds}
              />
            )}
          </Animated.View>
        )}
      </ScrollView>

      {/* Create Circle Modal */}
      <CreateCircleModal
        visible={showCreateCircle}
        onClose={() => setShowCreateCircle(false)}
        onConfirm={(name, emoji, memberIds) => {
          createCircleMutation.mutate({ name, emoji, memberIds });
        }}
        friends={friends.filter((f) => f.friend != null).map((f) => ({
          id: f.id,
          friendId: f.friendId,
          friend: f.friend,
        }))}
        isLoading={createCircleMutation.isPending}
      />

      {/* Contacts Modal */}
      <Modal
        visible={showContactsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContactsModal(false)}
      >
        <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center justify-between px-5 py-4" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable
              onPress={() => {
                setShowContactsModal(false);
                setContactSearch("");
              }}
              className="w-10"
            >
              <X size={24} color={colors.text} />
            </Pressable>
            <Text className="text-lg font-semibold" style={{ color: colors.text }}>
              Phone Contacts
            </Text>
            <View className="w-10" />
          </View>

          {/* Search */}
          <View className="px-4 py-3" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-center rounded-lg px-3" style={{ backgroundColor: colors.inputBg }}>
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                value={contactSearch}
                onChangeText={setContactSearch}
                placeholder="Search contacts..."
                placeholderTextColor={colors.textTertiary}
                className="flex-1 py-3 px-2"
                style={{ color: colors.text }}
              />
              {contactSearch.length > 0 && (
                <Pressable onPress={() => setContactSearch("")}>
                  <X size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
          </View>

          <FlatList
            data={filteredContacts}
            keyExtractor={(item, index) => item.id ?? item.name ?? `contact-${index}`}
            contentContainerStyle={{ paddingVertical: 8 }}
            // Virtualization tuning for contacts (can have hundreds)
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={9}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === 'android'}
            renderItem={({ item: contact }) => {
              const hasEmail = contact.emails && contact.emails.length > 0;
              const hasPhone = contact.phoneNumbers && contact.phoneNumbers.length > 0;
              const canInvite = hasEmail || hasPhone;
              const email = contact.emails?.[0]?.email;
              const phone = contact.phoneNumbers?.[0]?.number;

              return (
                <Pressable
                  onPress={() => handleInviteContact(contact)}
                  className="flex-row items-center mx-4 mb-2 p-4 rounded-xl"
                  style={{
                    backgroundColor: colors.surface,
                    ...(isDark ? {} : TILE_SHADOW),
                  }}
                >
                  <View className="w-12 h-12 rounded-full mr-3 items-center justify-center" style={{ backgroundColor: colors.avatarBg }}>
                    {contact.imageAvailable && contact.image?.uri ? (
                      <EntityAvatar
                        photoUrl={contact.image.uri}
                        size={48}
                        backgroundColor={colors.avatarBg}
                      />
                    ) : (
                      <Text className="text-lg font-semibold" style={{ color: colors.textSecondary }}>
                        {contact.name?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium" style={{ color: colors.text }}>
                      {contact.name ?? "Unknown"}
                    </Text>
                    {email ? (
                      <View className="flex-row items-center mt-0.5">
                        <Mail size={12} color={colors.textSecondary} />
                        <Text className="text-sm ml-1" style={{ color: colors.textSecondary }}>{email}</Text>
                      </View>
                    ) : phone ? (
                      <View className="flex-row items-center mt-0.5">
                        <Phone size={12} color={colors.textSecondary} />
                        <Text className="text-sm ml-1" style={{ color: colors.textSecondary }}>{phone}</Text>
                      </View>
                    ) : null}
                  </View>
                  {canInvite ? (
                    <View
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 9999,
                        backgroundColor: themeColor,
                      }}
                    >
                      <Text style={{ color: colors.buttonPrimaryText, fontSize: 13, fontWeight: "500" }}>Invite</Text>
                    </View>
                  ) : (
                    <Chip variant="neutral" label="No info" />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View className="py-12 items-center">
                <Contact size={48} color={colors.border} />
                <Text className="mt-3" style={{ color: colors.textSecondary }}>
                  {contactSearch ? "No contacts found" : "No contacts available"}
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

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
