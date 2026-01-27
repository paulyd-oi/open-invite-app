import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, Image, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter, usePathname } from "expo-router";
import { MapPin, Clock, UserPlus, ChevronRight, Calendar, Share2, Mail, X, Users, Plus, Heart, Check } from "@/ui/icons";
import Animated, { FadeInDown, FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolate } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import BottomNavigation from "@/components/BottomNavigation";
import { ShareAppButton } from "@/components/ShareApp";
import { FeedSkeleton } from "@/components/SkeletonLoader";
import { safeToast } from "@/lib/safeToast";
import { EmptyState } from "@/components/EmptyState";
import { QuickEventButton } from "@/components/QuickEventButton";
import { SocialProof } from "@/components/SocialProof";
import { FeedCalendar } from "@/components/FeedCalendar";
import { AuthErrorUI } from "@/components/AuthErrorUI";
import { useSession } from "@/lib/useSession";
import { authClient } from "@/lib/authClient";
import { api } from "@/lib/api";
import { useTheme, DARK_COLORS } from "@/lib/ThemeContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { resetSession } from "@/lib/authBootstrap";
import { setLogoutIntent } from "@/lib/logoutIntent";
import { clearSessionCache } from "@/lib/sessionCache";
import { AuthProvider } from "@/lib/AuthContext";
import { FirstValueNudge, canShowFirstValueNudge, markFirstValueNudgeDismissed } from "@/components/FirstValueNudge";
import { SocialMemoryCard } from "@/components/SocialMemoryCard";
import { loadGuidanceState, shouldShowEmptyGuidanceSync } from "@/lib/firstSessionGuidance";
import { type GetEventsFeedResponse, type GetEventsResponse, type Event, type GetFriendsResponse } from "@/shared/contracts";
import { groupEventsIntoSeries, type EventSeries } from "@/lib/recurringEventsGrouping";

// Swipe action threshold (px to reveal actions)
const SWIPE_THRESHOLD = 60;
const ACTION_WIDTH = 120; // Width of action buttons area

// Availability outline colors (inline, no global tokens)
const AVAILABILITY_COLORS = {
  free: "#22C55E",   // green
  busy: "#EF4444",   // red
} as const;

type AvailabilityStatus = "free" | "busy" | "unknown";
type RsvpStatus = "going" | "interested" | "not_going";

/**
 * Compute availability for a feed event against user's calendar.
 * Returns "free" if no conflicts, "busy" if overlap, "unknown" if data unavailable.
 * Conflict rule: (eventStart < otherEnd) AND (eventEnd > otherStart)
 */
function getAvailabilityStatus(
  feedEvent: Event | EventSeries,
  userCalendarEvents: Event[] | undefined
): AvailabilityStatus {
  // If calendar data not loaded, return unknown
  if (!userCalendarEvents || userCalendarEvents.length === 0) {
    return "unknown";
  }

  // Get the actual event to check (handle series)
  const displayEvent = 'nextEvent' in feedEvent ? feedEvent.nextEvent : feedEvent;
  
  // If event has no valid time window, return unknown
  if (!displayEvent.startTime) {
    return "unknown";
  }
  
  const eventStart = new Date(displayEvent.startTime).getTime();
  // If no endTime, treat as point event (1 minute duration for conflict check)
  const eventEnd = displayEvent.endTime 
    ? new Date(displayEvent.endTime).getTime() 
    : eventStart + 60000;

  // Check for conflicts with user's calendar events
  for (const calEvent of userCalendarEvents) {
    // Skip if same event (ignore conflicts with self)
    if (calEvent.id === displayEvent.id) continue;
    
    // Skip if calendar event has no time
    if (!calEvent.startTime) continue;
    
    const calStart = new Date(calEvent.startTime).getTime();
    const calEnd = calEvent.endTime 
      ? new Date(calEvent.endTime).getTime() 
      : calStart + 60000;
    
    // Conflict detection: overlap exists if eventStart < calEnd AND eventEnd > calStart
    if (eventStart < calEnd && eventEnd > calStart) {
      return "busy";
    }
  }
  
  return "free";
}

function EventCard({ event, index, isOwn, themeColor, isDark, colors, userImage, userName, userCalendarEvents, onRsvp, isAuthed }: {
  event: Event | EventSeries;
  index: number;
  isOwn?: boolean;
  themeColor: string;
  isDark: boolean;
  colors: typeof DARK_COLORS;
  userImage?: string | null;
  userName?: string | null;
  userCalendarEvents?: Event[];
  onRsvp?: (eventId: string, status: RsvpStatus) => void;
  isAuthed?: boolean;
}) {
  const router = useRouter();
  const translateX = useSharedValue(0);
  
  // Check if this is a series or single event
  // All events are wrapped in EventSeries, but only recurring ones with multiple occurrences are "series"
  const isSeriesWrapper = 'nextEvent' in event;
  const isSeries = isSeriesWrapper && (event as EventSeries).isRecurring && (event as EventSeries).occurrenceCount > 1;
  const displayEvent = isSeriesWrapper ? (event as EventSeries).nextEvent : event;
  const startDate = new Date(displayEvent.startTime);
  const endDate = displayEvent.endTime ? new Date(displayEvent.endTime) : null;
  
  // Check if event is full (capacity exists and goingCount >= capacity)
  const isEventFull = displayEvent.capacity != null && 
    (displayEvent.goingCount ?? 0) >= displayEvent.capacity;

  const dateLabel = startDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Show time range if endTime exists
  const timeLabel = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/event/${displayEvent.id}` as any);
  };

  // For own events, use the passed user image/name; otherwise use event.user data
  const displayImage = isOwn ? userImage : displayEvent.user?.image;
  const displayName = isOwn ? userName : displayEvent.user?.name;

  // Get accepted attendees for social proof
  const acceptedAttendees = displayEvent.joinRequests?.filter((r) => r.status === "accepted") ?? [];
  const attendeesList = acceptedAttendees.map((r) => ({
    id: r.userId,
    name: r.user?.name ?? "Unknown",
    image: r.user?.image ?? null,
  }));

  // Compute availability status for this event
  const availability = getAvailabilityStatus(event, userCalendarEvents);
  
  // Determine border style based on availability
  // Own events keep their existing theme-tinted border
  // Non-own events get availability outline (green/red) or default border
  const getBorderStyle = () => {
    if (isOwn) {
      return { borderWidth: 1, borderColor: `${themeColor}40` };
    }
    if (availability === "free") {
      return { borderWidth: 2, borderColor: AVAILABILITY_COLORS.free };
    }
    if (availability === "busy") {
      return { borderWidth: 2, borderColor: AVAILABILITY_COLORS.busy };
    }
    // unknown: default border
    return { borderWidth: 1, borderColor: colors.border };
  };

  // Swipe action handlers
  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleInterested = () => {
    if (!isAuthed || !onRsvp) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onRsvp(displayEvent.id, "interested");
    translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
  };

  const handleGoing = () => {
    if (!isAuthed || !onRsvp) return;
    if (isEventFull) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      safeToast.warning("Full", "This invite is full.");
      translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onRsvp(displayEvent.id, "going");
    translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
  };

  // Pan gesture for swipe-to-reveal actions (only for non-own events when authed)
  const canSwipe = Boolean(isAuthed && !isOwn && !isSeries);
  
  const panGesture = Gesture.Pan()
    .enabled(canSwipe)
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      // Only allow swipe left (negative values)
      if (e.translationX < 0) {
        translateX.value = Math.max(e.translationX, -ACTION_WIDTH);
      } else {
        translateX.value = e.translationX * 0.2; // Resistance when swiping right
      }
      // Haptic at threshold
      if (e.translationX < -SWIPE_THRESHOLD && translateX.value > -SWIPE_THRESHOLD - 5) {
        runOnJS(triggerHaptic)();
      }
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        // Snap open
        translateX.value = withSpring(-ACTION_WIDTH, { damping: 15, stiffness: 150 });
      } else {
        // Snap closed
        translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionsAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-ACTION_WIDTH, -SWIPE_THRESHOLD, 0],
      [1, 0.5, 0]
    );
    return { opacity: Math.max(0, opacity) };
  });

  // Wrapper for swipeable card
  const cardContent = (
      <Pressable
        onPress={handlePress}
        className="rounded-2xl p-4 mb-3"
        style={{
          backgroundColor: colors.surface,
          ...getBorderStyle(),
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.2 : 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View className="flex-row items-start">
          <View
            className="w-14 h-14 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: isOwn ? `${themeColor}20` : isDark ? "#2C2C2E" : "#FFF7ED" }}
          >
            <Text className="text-2xl">{displayEvent.emoji}</Text>
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text style={{ color: colors.text }} className="text-lg font-sora-semibold flex-1" numberOfLines={1}>
                {displayEvent.title}
              </Text>
              {isOwn && (
                <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: `${themeColor}20` }}>
                  <Text style={{ color: themeColor }} className="text-xs font-medium">You</Text>
                </View>
              )}
            </View>
            {displayEvent.description && !isSeries && (
              <Text
                style={{ color: colors.textSecondary }}
                className="text-sm mt-0.5"
                numberOfLines={2}
              >
                {displayEvent.description}
              </Text>
            )}
            {isSeries && (
              <Text
                style={{ color: colors.textSecondary }}
                className="text-sm mt-0.5"
              >
                Next: {dateLabel} at {timeLabel}
              </Text>
            )}
            {isSeries && (event as EventSeries).occurrenceCount > 1 && (
              <Text
                style={{ color: themeColor }}
                className="text-sm mt-0.5 font-medium"
              >
                +{(event as EventSeries).occurrenceCount - 1} more
              </Text>
            )}
            {!isSeries && (
              <View className="flex-row items-center mt-1">
                <View className="w-6 h-6 rounded-full mr-2 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                  {displayImage ? (
                    <Image source={{ uri: displayImage }} className="w-full h-full" />
                  ) : (
                    <View className="w-full h-full items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                      <Text style={{ color: themeColor }} className="text-xs font-medium">
                        {displayName?.[0] ?? "?"}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  {isOwn ? "Your event" : displayEvent.user?.name ?? "Someone"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {!isSeries && (
          <View className="flex-row mt-3 pt-3 flex-wrap" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
            <View className="flex-row items-center mr-4">
              <Calendar size={14} color="#9CA3AF" />
              <Text style={{ color: colors.textSecondary, fontSize: 14 }} className="ml-1">{dateLabel}</Text>
            </View>
            <View className="flex-row items-center mr-4">
              <Clock size={14} color={themeColor} />
              <Text style={{ color: colors.textSecondary, fontSize: 14 }} className="ml-1">{timeLabel}</Text>
            </View>
            {displayEvent.location && (
              <View className="flex-row items-center flex-1">
                <MapPin size={14} color="#4ECDC4" />
                <Text style={{ color: colors.textSecondary, fontSize: 14 }} className="ml-1" numberOfLines={1}>
                  {displayEvent.location}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Capacity indicator */}
        {!isSeries && displayEvent.capacity != null && (
          <View className="flex-row items-center mt-2">
            <Users size={14} color={displayEvent.isFull ? "#EF4444" : "#22C55E"} />
            <Text style={{ color: displayEvent.isFull ? "#EF4444" : colors.textSecondary, fontSize: 14 }} className="ml-1">
              {displayEvent.isFull 
                ? `Full • ${displayEvent.goingCount ?? 0} going`
                : `${displayEvent.goingCount ?? 0}/${displayEvent.capacity} filled`
              }
            </Text>
          </View>
        )}

        {/* Social Proof - Friends Going */}
        {!isSeries && attendeesList.length > 0 && (
          <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
            <SocialProof
              attendees={attendeesList}
              totalCount={attendeesList.length}
              maxDisplay={3}
              size="small"
            />
          </View>
        )}
      </Pressable>
  );

  // If swipe is not enabled, return card directly
  if (!canSwipe) {
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
        {cardContent}
      </Animated.View>
    );
  }

  // Swipeable wrapper with action buttons
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <View className="mb-3 relative">
        {/* Background lane for revealed actions */}
        <View 
          className="absolute right-0 top-0 bottom-0 rounded-2xl overflow-hidden"
          style={{ 
            width: ACTION_WIDTH + 20,
            backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6",
          }}
        >
          <View className="flex-1 flex-row items-center justify-end pr-4">
            {/* Placeholder to maintain layout - actions are overlaid */}
          </View>
        </View>

        {/* Action buttons revealed on swipe */}
        <Animated.View 
          className="absolute right-0 top-0 bottom-0 flex-row items-center justify-end pr-4"
          style={[{ width: ACTION_WIDTH }, actionsAnimatedStyle]}
        >
          <Pressable
            onPress={handleInterested}
            className="w-12 h-12 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: themeColor }}
          >
            <Heart size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={handleGoing}
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: isEventFull ? "#9CA3AF" : "#22C55E" }}
          >
            <Check size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
        
        {/* Swipeable card */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={cardAnimatedStyle}>
            {cardContent}
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

interface GroupedEvents {
  today: Array<Event | EventSeries>;
  tomorrow: Array<Event | EventSeries>;
  thisWeek: Array<Event | EventSeries>;
  upcoming: Array<Event | EventSeries>;
}

function groupEventsByTime(events: Event[], userId?: string): GroupedEvents {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const endOfWeek = new Date(today.getTime() + 7 * 86400000);

  const grouped: GroupedEvents = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    upcoming: [],
  };

  // Group recurring events into series first
  const series = groupEventsIntoSeries(events);

  // Sort series by next occurrence time
  const sortedSeries = [...series].sort(
    (a, b) => new Date(a.nextEvent.startTime).getTime() - new Date(b.nextEvent.startTime).getTime()
  );

  sortedSeries.forEach((item) => {
    const eventDate = new Date(item.nextEvent.startTime);
    const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

    if (eventDay.getTime() === today.getTime()) {
      grouped.today.push(item);
    } else if (eventDay.getTime() === tomorrow.getTime()) {
      grouped.tomorrow.push(item);
    } else if (eventDay > tomorrow && eventDay < endOfWeek) {
      grouped.thisWeek.push(item);
    } else if (eventDay >= endOfWeek) {
      grouped.upcoming.push(item);
    }
  });

  return grouped;
}

function EventSection({
  title,
  events,
  startIndex,
  userId,
  themeColor,
  isDark,
  colors,
  userImage,
  userName,
  isCollapsed,
  onToggle,
  userCalendarEvents,
  onRsvp,
  isAuthed,
}: {
  title: string;
  events: Array<Event | EventSeries>;
  startIndex: number;
  userId?: string;
  themeColor: string;
  isDark: boolean;
  colors: typeof DARK_COLORS;
  userImage?: string | null;
  userName?: string | null;
  isCollapsed?: boolean;
  onToggle?: () => void;
  userCalendarEvents?: Event[];
  onRsvp?: (eventId: string, status: RsvpStatus) => void;
  isAuthed?: boolean;
}) {
  if (events.length === 0) return null;

  return (
    <View className="mb-6">
      <Pressable 
        onPress={onToggle}
        className="flex-row items-center mb-4"
        disabled={!onToggle}
      >
        <Text style={{ color: colors.text }} className="text-lg font-sora-semibold flex-1">
          {title} ({events.length})
        </Text>
        {onToggle && (
          <Text style={{ color: colors.textTertiary }} className="text-sm">
            {isCollapsed ? "▶" : "▼"}
          </Text>
        )}
      </Pressable>
      {!isCollapsed && events.map((event, index) => {
        // Check if this is a series or single event
        const isSeries = 'nextEvent' in event;
        const eventId = isSeries ? event.seriesKey : event.id;
        const eventUserId = isSeries ? event.nextEvent.userId : event.userId;
        
        return (
          <EventCard
            key={eventId}
            event={event}
            index={startIndex + index}
            isOwn={eventUserId === userId}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userImage={userImage}
            userName={userName}
            userCalendarEvents={userCalendarEvents}
            onRsvp={onRsvp}
            isAuthed={isAuthed}
          />
        );
      })}
    </View>
  );
}

function EmptyFeed() {
  const router = useRouter();

  return (
    <EmptyState
      type="events"
      actionLabel="Create Event"
      onAction={() => router.push("/create")}
    />
  );
}

// Soft banner for users who deferred email verification
function VerificationBanner({
  onDismiss,
  themeColor,
  colors,
}: {
  onDismiss: () => void;
  themeColor: string;
  colors: typeof DARK_COLORS;
}) {
  const router = useRouter();

  const handleVerify = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/settings");
  };

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      className="mx-5 mb-4 rounded-2xl p-4"
      style={{
        backgroundColor: `${themeColor}15`,
        borderWidth: 1,
        borderColor: `${themeColor}30`,
      }}
    >
      <View className="flex-row items-start">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: `${themeColor}25` }}
        >
          <Mail size={20} color={themeColor} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text }} className="text-sm font-sora-semibold">
            Verify your email
          </Text>
          <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
            Verify to host events and invite friends.
          </Text>
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          className="p-1"
        >
          <X size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
      <Pressable
        onPress={handleVerify}
        className="mt-3 py-2.5 rounded-xl items-center"
        style={{ backgroundColor: themeColor }}
      >
        <Text className="text-white text-sm font-sora-semibold">
          Verify Now
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function SocialScreen() {
  const { data: session, isPending: sessionLoading } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [authBootstrapState, setAuthBootstrapState] = useState<"checking" | "error" | "ready">("checking");
  const [authBootstrapError, setAuthBootstrapError] = useState<{ error?: string; timedOut?: boolean }>();
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [showFirstValueNudge, setShowFirstValueNudge] = useState(false);
  const [insightDismissed, setInsightDismissed] = useState(false);
  const [guidanceLoaded, setGuidanceLoaded] = useState(false);
  const hasBootstrapped = useRef(false);
  
  // Collapse state for sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Auth gating based on boot status (token validation), not session presence
  const isAuthed = bootStatus === "authed";

  // Load guidance state on mount
  useEffect(() => {
    loadGuidanceState().then(() => setGuidanceLoaded(true));
  }, []);

  // Redirect non-authed users to appropriate auth screen
  useEffect(() => {
    if (bootStatus === 'onboarding') {
      router.replace('/welcome');
    } else if (bootStatus === 'loggedOut' || bootStatus === 'error') {
      router.replace('/login');
    }
  }, [bootStatus, router]);

  // NOTE: useRevenueCatSync is called in _layout.tsx BootRouter (single global call)

  // Initialize push notifications - registers token and sets up listeners
  useNotifications();

  // Check verification deferred status - only show if session user is NOT verified
  useEffect(() => {
    const checkVerificationStatus = async () => {
      try {
        // First check if user is already verified via session - if so, never show banner
        if (session?.user?.emailVerified === true) {
          setShowVerificationBanner(false);
          return;
        }
        // Only show banner if explicitly deferred AND not dismissed AND not verified
        const deferred = await AsyncStorage.getItem("verification_deferred");
        const dismissed = await AsyncStorage.getItem("verification_banner_dismissed");
        if (deferred === "true" && dismissed !== "true" && session?.user?.emailVerified === false) {
          setShowVerificationBanner(true);
        } else {
          setShowVerificationBanner(false);
        }
      } catch (error) {
        // Ignore errors
      }
    };
    // Only run once session is loaded (not pending)
    if (!sessionLoading) {
      checkVerificationStatus();
    }
  }, [session, sessionLoading]);

  const handleDismissBanner = useCallback(async () => {
    setShowVerificationBanner(false);
    try {
      await AsyncStorage.setItem("verification_banner_dismissed", "true");
    } catch (error) {
      // Ignore
    }
  }, []);

  // Check insight card dismissal status (14-day cooldown)
  useEffect(() => {
    const checkInsightDismissal = async () => {
      try {
        const userId = session?.user?.id;
        if (!userId) return;
        const dismissedUntil = await AsyncStorage.getItem(`feed_insight_dismissed_until::${userId}`);
        if (dismissedUntil) {
          const until = parseInt(dismissedUntil, 10);
          if (Date.now() < until) {
            setInsightDismissed(true);
          } else {
            // Expired, clear it
            await AsyncStorage.removeItem(`feed_insight_dismissed_until::${userId}`);
            setInsightDismissed(false);
          }
        }
      } catch (error) {
        // Ignore
      }
    };
    if (session?.user?.id) {
      checkInsightDismissal();
    }
  }, [session?.user?.id]);

  const handleDismissInsight = useCallback(async () => {
    setInsightDismissed(true);
    try {
      const userId = session?.user?.id;
      if (!userId) return;
      // 14-day cooldown
      const until = Date.now() + 14 * 24 * 60 * 60 * 1000;
      await AsyncStorage.setItem(`feed_insight_dismissed_until::${userId}`, until.toString());
    } catch (error) {
      // Ignore
    }
  }, [session?.user?.id]);

  // Bootstrap authentication on mount
  useEffect(() => {
    // GUARD: Only validate if BootRouter has already determined we're authed.
    // Auth truth source is bootStatus (token validation), not session presence.
    if (isAuthed) {
      // bootStatus confirms token is valid
      console.log("[SocialScreen] Auth confirmed via bootStatus; setting bootstrap state to ready");
      setAuthBootstrapState("ready");
    }
  }, [isAuthed]);

  // Handle retry button
  const handleRetry = useCallback(() => {
    console.log("[SocialScreen] Retrying bootstrap...");
    hasBootstrapped.current = false;
    setAuthBootstrapState("checking");
    setAuthBootstrapError(undefined);
  }, []);

  // Handle reset session button
  const handleResetSession = useCallback(async () => {
    if (__DEV__) {
      console.log("[Logout] begin");
    }
    try {
      // Standardized logout sequence
      setLogoutIntent();
      await resetSession({ reason: "user_logout", endpoint: "SocialScreen" });
      if (__DEV__) {
        console.log("[Logout] after resetSession");
      }

      // Cancel all pending queries
      await queryClient.cancelQueries();
      if (__DEV__) {
        console.log("[Logout] after cancelQueries");
      }

      // Clear React Query cache
      queryClient.clear();
      if (__DEV__) {
        console.log("[Logout] after queryClient.clear");
      }

      // Reset boot authority singleton to trigger bootStatus update to 'loggedOut'
      const { resetBootAuthority } = await import("@/hooks/useBootAuthority");
      resetBootAuthority();
      if (__DEV__) {
        console.log("[Logout] Boot authority reset");
      }
    } catch (error) {
      console.error("[SocialScreen] Error during logout:", error);
      // Try to clear cache anyway
      try {
        await queryClient.cancelQueries();
        queryClient.clear();
        const { resetBootAuthority } = await import("@/hooks/useBootAuthority");
        resetBootAuthority();
      } catch (e) {
        // ignore
      }
    }

    // Hard transition to login
    if (__DEV__) {
      console.log("[Logout] navigating to /login");
    }
    router.replace("/login");
  }, [queryClient, router]);

  // Fetch friend events (feed)
  const {
    data: feedData,
    isLoading: feedLoading,
    refetch: refetchFeed,
    isRefetching: isRefetchingFeed,
  } = useQuery({
    queryKey: ["events", "feed"],
    queryFn: () => api.get<GetEventsFeedResponse>("/api/events/feed"),
    enabled: isAuthed,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
  });

  // Also fetch user's own events
  const {
    data: myEventsData,
    isLoading: myEventsLoading,
    refetch: refetchMyEvents,
    isRefetching: isRefetchingMyEvents,
  } = useQuery({
    queryKey: ["events", "mine"],
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: isAuthed,
    refetchInterval: 30000,
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
  });

  // Fetch events user is attending
  const {
    data: attendingData,
    isLoading: attendingLoading,
    refetch: refetchAttending,
    isRefetching: isRefetchingAttending,
  } = useQuery({
    queryKey: ["events", "attending"],
    queryFn: () => api.get<GetEventsResponse>("/api/events/attending"),
    enabled: isAuthed,
    refetchInterval: 30000,
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
  });

  // RSVP mutation for swipe actions
  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: RsvpStatus }) => 
      api.post(`/api/events/${eventId}/rsvp`, { status }),
    onSuccess: (_, { status }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["events", "feed"] });
      queryClient.invalidateQueries({ queryKey: ["events", "attending"] });
      queryClient.invalidateQueries({ queryKey: ["events", "calendar"] });
      queryClient.invalidateQueries({ queryKey: ["events", "mine"] });
    },
    onError: (error: any) => {
      // Handle 409 EVENT_FULL error
      if (error?.response?.status === 409 || error?.status === 409) {
        safeToast.warning("Full", "This invite is full.");
      } else {
        safeToast.error("Oops", "That didn't go through. Please try again.");
      }
    },
  });

  // Handle RSVP from swipe action
  const handleSwipeRsvp = useCallback((eventId: string, status: RsvpStatus) => {
    if (!isAuthed) return;
    rsvpMutation.mutate({ eventId, status });
  }, [isAuthed, rsvpMutation]);

  // Fetch friends for first-value nudge eligibility
  const {
    data: friendsData,
    isLoading: friendsLoading,
  } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthed,
  });

  // Business events feature is disabled (feature flag: businessAccounts = false)
  // Provide empty fallback to prevent network calls
  const businessEventsData = undefined;

  // Check if user is eligible for first-value nudge
  const isFirstValueNudgeEligible = (() => {
    // Only eligible if authed
    if (bootStatus !== 'authed') return false;
    
    // Check if user has zero social connections and events
    const hasFriends = (friendsData?.friends?.length ?? 0) > 0;
    const hasCreatedEvents = (myEventsData?.events?.length ?? 0) > 0;
    const hasAttendingEvents = (attendingData?.events?.length ?? 0) > 0;
    
    return !hasFriends && !hasCreatedEvents && !hasAttendingEvents;
  })();

  // Show first-value nudge if eligible and not loading
  useEffect(() => {
    const checkFirstValueNudge = async () => {
      if (!isAuthed || !isFirstValueNudgeEligible) return;
      if (feedLoading || myEventsLoading || attendingLoading || friendsLoading) return;

      const canShow = await canShowFirstValueNudge();
      if (canShow) {
        setShowFirstValueNudge(true);
      }
    };

    checkFirstValueNudge();
  }, [isAuthed, isFirstValueNudgeEligible, feedLoading, myEventsLoading, attendingLoading, friendsLoading]);

  // Derive social memory from existing data patterns
  const socialMemory = useMemo(() => {
    if (bootStatus !== 'authed' || feedLoading || myEventsLoading || attendingLoading || friendsLoading) {
      return null;
    }

    const attendingEvents = attendingData?.events || [];
    const myEvents = myEventsData?.events || [];
    const friends = friendsData?.friends || [];

    // Pattern 1: Frequent Event Attendance (≥2 events attending)
    if (attendingEvents.length >= 2) {
      const eventTypes = attendingEvents.map(e => e.title.toLowerCase());
      const hasRepeatedTypes = eventTypes.some(type => 
        eventTypes.filter(t => t.includes(type.split(' ')[0]) || type.includes(t.split(' ')[0])).length > 1
      );
      
      if (hasRepeatedTypes) {
        return {
          memory: "You have a pattern of joining events that align with your interests. Your social connections are building around shared experiences.",
          type: 'events' as const
        };
      } else {
        return {
          memory: "You're exploring diverse social experiences. Each event you join adds a new dimension to your social identity.",
          type: 'events' as const
        };
      }
    }

    // Pattern 2: Active Event Hosting (≥2 events created)
    if (myEvents.length >= 2) {
      const recentEvents = myEvents.filter(e => 
        new Date(e.startTime) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      );
      
      if (recentEvents.length >= 1) {
        return {
          memory: "You're becoming a social catalyst in your community. People look forward to the experiences you create.",
          type: 'hosting' as const
        };
      } else {
        return {
          memory: "Your hosting journey is creating lasting memories for others. Each event you organize strengthens your community.",
          type: 'hosting' as const
        };
      }
    }

    // Pattern 3: Growing Social Network (≥2 friends)
    if (friends.length >= 2) {
      return {
        memory: "Your social network is growing meaningfully. Each connection represents a shared moment and potential for deeper friendship.",
        type: 'friends' as const
      };
    }

    // No qualifying patterns found
    return null;
  }, [bootStatus, feedLoading, myEventsLoading, attendingLoading, friendsLoading, attendingData, myEventsData, friendsData]);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Combine and deduplicate events
  const allEvents = useMemo(() => {
    const feedEvents = feedData?.events ?? [];
    const myEvents = myEventsData?.events ?? [];
    const attendingEvents = attendingData?.events ?? [];

    // Create a map to deduplicate by event ID
    const eventMap = new Map<string, Event>();

    // Add my events first (so they show as "own")
    myEvents.forEach((event) => {
      eventMap.set(event.id, event);
    });

    // Add attending events
    attendingEvents.forEach((event) => {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    });

    // Add feed events (won't override my events or attending events)
    feedEvents.forEach((event) => {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    });

    return Array.from(eventMap.values());
  }, [feedData?.events, myEventsData?.events, attendingData?.events]);

  // Prepare events for calendar with metadata
  const calendarEvents = useMemo(() => {
    const myEventIds = new Set(myEventsData?.events?.map((e) => e.id) ?? []);
    const attendingEventIds = new Set(attendingData?.events?.map((e) => e.id) ?? []);

    return allEvents.map((event) => ({
      ...event,
      isOwn: myEventIds.has(event.id),
      isAttending: attendingEventIds.has(event.id),
      hostName: event.user?.name ?? null,
      hostImage: event.user?.image ?? null,
    }));
  }, [allEvents, myEventsData?.events, attendingData?.events]);

  // User's calendar events for availability checking (created + attending)
  // Used by EventCard to determine free/busy status
  const userCalendarEvents = useMemo(() => {
    const myEvents = myEventsData?.events ?? [];
    const attendingEvents = attendingData?.events ?? [];
    
    // Dedupe by event id
    const eventMap = new Map<string, Event>();
    [...myEvents, ...attendingEvents].forEach((event) => {
      eventMap.set(event.id, event);
    });
    
    return Array.from(eventMap.values());
  }, [myEventsData?.events, attendingData?.events]);

  // Group events by time
  const groupedEvents = useMemo(
    () => groupEventsByTime(allEvents, session?.user?.id),
    [allEvents, session?.user?.id]
  );

  // Count events in the next 14 days for social proof line
  const plansIn14Days = useMemo(() => {
    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return allEvents.filter((event) => {
      const eventDate = new Date(event.startTime);
      return eventDate >= now && eventDate <= fourteenDaysFromNow;
    }).length;
  }, [allEvents]);

  const handleRefresh = () => {
    refetchFeed();
    refetchMyEvents();
    refetchAttending();
  };

  const isRefreshing = isRefetchingFeed || isRefetchingMyEvents || isRefetchingAttending;
  const isLoading = feedLoading || myEventsLoading || attendingLoading;

  // Render loading state for non-authed states (redirect useEffect handles routing)
  // Keep BottomNavigation visible for escape route
  if (bootStatus === 'loading' || bootStatus === 'loggedOut' || bootStatus === 'error' || bootStatus === 'onboarding') {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textTertiary }}>Syncing your feed…</Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  if (sessionLoading) {
    return (
      <AuthProvider state="checking">
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
          <View className="flex-1 items-center justify-center">
            <Text style={{ color: colors.textTertiary }}>Syncing your feed…</Text>
          </View>
          <BottomNavigation />
        </SafeAreaView>
      </AuthProvider>
    );
  }

  // Show error UI if bootstrap failed
  if (authBootstrapState === "error") {
    return (
      <AuthProvider state="error">
        <AuthErrorUI
          error={authBootstrapError?.error}
          timedOut={authBootstrapError?.timedOut}
          onRetry={handleRetry}
          onReset={handleResetSession}
        />
      </AuthProvider>
    );
  }

  // Show loading while checking auth state
  if (authBootstrapState === "checking") {
    return (
      <AuthProvider state="checking">
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
          <View className="flex-1 items-center justify-center">
            <Text style={{ color: colors.textTertiary }}>Loading...</Text>
          </View>
        </SafeAreaView>
      </AuthProvider>
    );
  }

  const hasEvents =
    groupedEvents.today.length > 0 ||
    groupedEvents.tomorrow.length > 0 ||
    groupedEvents.thisWeek.length > 0 ||
    groupedEvents.upcoming.length > 0;
    
  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  return (
    <AuthProvider state="authed">
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="px-5 pt-4 pb-5 flex-row items-center justify-between">
        <View>
          <Text style={{ color: colors.text }} className="text-3xl font-sora-bold">Open Invites</Text>
          <Text style={{ color: colors.textSecondary }} className="mt-1 font-sora">See what's happening</Text>
        </View>
        <View className="flex-row items-center">
          <ShareAppButton variant="icon" />
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/create");
            }}
            className="flex-row items-center px-4 py-2 rounded-full ml-2"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-sora-semibold">Create</Text>
          </Pressable>
        </View>
      </View>

      {/* Micro Social Proof Line */}
      {!isLoading && plansIn14Days > 0 && (
        <View className="px-5 pb-3">
          <Text
            style={{ color: colors.textSecondary }}
            className="text-sm"
            accessibilityLabel={`${plansIn14Days} ${plansIn14Days === 1 ? 'plan' : 'plans'} in the next 14 days`}
          >
            {plansIn14Days} {plansIn14Days === 1 ? 'plan' : 'plans'} in the next 14 days
          </Text>
        </View>
      )}

      {/* Verification banner for users who deferred email verification */}
      {showVerificationBanner && (
        <VerificationBanner
          onDismiss={handleDismissBanner}
          themeColor={themeColor}
          colors={colors}
        />
      )}
      
      {/* Filter Pills */}
      {isLoading ? (
        <FeedSkeleton />
      ) : !hasEvents ? (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {socialMemory && !insightDismissed && (
            <SocialMemoryCard
              memory={socialMemory.memory}
              type={socialMemory.type}
              themeColor={themeColor}
              isDark={isDark}
              colors={colors}
              onDismiss={handleDismissInsight}
            />
          )}
          <FeedCalendar
            events={calendarEvents}
            businessEvents={undefined}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userId={session?.user?.id}
          />
          <View className="py-12 items-center px-8">
            <Text className="text-5xl mb-4">📅</Text>
            <Text className="text-xl font-semibold text-center mb-2" style={{ color: colors.text }}>
              Nothing new yet
            </Text>
            {guidanceLoaded && shouldShowEmptyGuidanceSync("view_feed") && (
              <Text className="text-center mb-4" style={{ color: colors.textSecondary }}>
                Bring your people in — invites make the feed come alive.
              </Text>
            )}
            {guidanceLoaded && shouldShowEmptyGuidanceSync("view_feed") && (
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  try {
                    await Share.share({
                      message: "Join me on Open Invite - the easiest way to share plans with friends!\n\nhttps://apps.apple.com/app/open-invite",
                      url: "https://apps.apple.com/app/open-invite",
                    });
                  } catch (error) {
                    console.error("Error sharing:", error);
                  }
                }}
                className="flex-row items-center px-5 py-2.5 rounded-full mb-3"
                style={{ backgroundColor: themeColor }}
              >
                <UserPlus size={16} color="#FFFFFF" />
                <Text className="font-semibold ml-2 text-white">Invite a friend</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/create");
              }}
              className="flex-row items-center"
            >
              <Text className="font-medium" style={{ color: themeColor }}>Create an Invite</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={themeColor}
            />
          }
        >
          <FeedCalendar
            events={calendarEvents}
            businessEvents={undefined}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userId={session?.user?.id}
          />
          {socialMemory && !insightDismissed && (
            <SocialMemoryCard
              memory={socialMemory.memory}
              type={socialMemory.type}
              themeColor={themeColor}
              isDark={isDark}
              colors={colors}
              onDismiss={handleDismissInsight}
            />
          )}
          <EventSection
            title="Today"
            events={groupedEvents.today}
            startIndex={0}
            userId={session?.user?.id}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userImage={session?.user?.image}
            userName={session?.user?.name}
            isCollapsed={collapsedSections.has("today")}
            onToggle={() => toggleSection("today")}
            userCalendarEvents={userCalendarEvents}
            onRsvp={handleSwipeRsvp}
            isAuthed={isAuthed}
          />
          <EventSection
            title="Tomorrow"
            events={groupedEvents.tomorrow}
            startIndex={groupedEvents.today.length}
            userId={session?.user?.id}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userImage={session?.user?.image}
            userName={session?.user?.name}
            isCollapsed={collapsedSections.has("tomorrow")}
            onToggle={() => toggleSection("tomorrow")}
            userCalendarEvents={userCalendarEvents}
            onRsvp={handleSwipeRsvp}
            isAuthed={isAuthed}
          />
          <EventSection
            title="This Week"
            events={groupedEvents.thisWeek}
            startIndex={groupedEvents.today.length + groupedEvents.tomorrow.length}
            userId={session?.user?.id}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userImage={session?.user?.image}
            userName={session?.user?.name}
            isCollapsed={collapsedSections.has("thisWeek")}
            onToggle={() => toggleSection("thisWeek")}
            userCalendarEvents={userCalendarEvents}
            onRsvp={handleSwipeRsvp}
            isAuthed={isAuthed}
          />
          <EventSection
            title="Upcoming"
            events={groupedEvents.upcoming}
            startIndex={
              groupedEvents.today.length +
              groupedEvents.tomorrow.length +
              groupedEvents.thisWeek.length
            }
            userId={session?.user?.id}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userImage={session?.user?.image}
            userName={session?.user?.name}
            isCollapsed={collapsedSections.has("upcoming")}
            onToggle={() => toggleSection("upcoming")}
            userCalendarEvents={userCalendarEvents}
            onRsvp={handleSwipeRsvp}
            isAuthed={isAuthed}
          />
        </ScrollView>
      )}

      {/* Quick Event Floating Button */}
      {session && <QuickEventButton />}

      {/* First-Value Nudge for Brand New Users */}
      <FirstValueNudge
        visible={showFirstValueNudge}
        onClose={() => setShowFirstValueNudge(false)}
        onPrimary={() => router.push("/discover")}
        onSecondary={() => router.push("/create")}
      />

      <BottomNavigation />
      </SafeAreaView>
    </AuthProvider>
  );
}
