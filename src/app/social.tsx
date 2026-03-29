import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, Share, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useQuery, useQueryClient, useMutation, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { DEFAULT_ENDREACHED_DEBOUNCE_MS } from "@/lib/infiniteQuerySSOT";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { useLiveRefreshContract } from "@/lib/useLiveRefreshContract";
import { useRouter, usePathname, useFocusEffect } from "expo-router";
import { MapPin, Clock, UserPlus, ChevronRight, Calendar, Share2, Mail, X, Users, Plus, Heart, Check } from "@/ui/icons";
import Animated, { FadeInDown, FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolate } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import BottomNavigation from "@/components/BottomNavigation";
import { AppHeader } from "@/components/AppHeader";
import { EntityAvatar } from "@/components/EntityAvatar";
import { HelpSheet, HELP_SHEETS } from "@/components/HelpSheet";
import { ShareAppButton } from "@/components/ShareApp";
import { FeedSkeleton } from "@/components/SkeletonLoader";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { safeToast } from "@/lib/safeToast";
import { EmptyState } from "@/components/EmptyState";
import { Image as ExpoImage } from "expo-image";
import { EventVisibilityBadge } from "@/components/EventVisibilityBadge";
import { QuickEventButton } from "@/components/QuickEventButton";
import { SocialProof } from "@/components/SocialProof";
import { FeedCalendar, EventListItem } from "@/components/FeedCalendar";
import { AuthErrorUI } from "@/components/AuthErrorUI";
import { useSession } from "@/lib/useSession";
import { authClient } from "@/lib/authClient";
import { api } from "@/lib/api";
import { useTheme, DARK_COLORS, TILE_SHADOW } from "@/lib/ThemeContext";
import { TAB_BOTTOM_PADDING } from "@/lib/layoutSpacing";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useStickyLoadingCombined } from "@/lib/useStickyLoading";
import { useLoadedOnce } from "@/lib/loadingInvariant";
import { isEmailGateActive, guardEmailVerification } from "@/lib/emailVerificationGate";
import { performLogout } from "@/lib/logout";
import { clearSessionCache } from "@/lib/sessionCache";
import { AuthProvider } from "@/lib/AuthContext";
import { FirstValueNudge, canShowFirstValueNudge, markFirstValueNudgeDismissed } from "@/components/FirstValueNudge";
import { SocialMemoryCard } from "@/components/SocialMemoryCard";
import { loadGuidanceState, shouldShowEmptyGuidanceSync, setGuidanceUserId, dismissAllGuidance } from "@/lib/firstSessionGuidance";
import { type GetEventsFeedResponse, type GetEventsResponse, type Event, type GetFriendsResponse, type RsvpStatusMutation } from "@/shared/contracts";
import { groupEventsIntoSeries, type EventSeries } from "@/lib/recurringEventsGrouping";
import { eventKeys, invalidateEventKeys, getInvalidateAfterRsvpJoin, deriveAttendeeCount, logRsvpMismatch } from "@/lib/eventQueryKeys";
import { qk } from "@/lib/queryKeys";
import { usePreloadHeroBanners } from "@/lib/usePreloadHeroBanners";
import { APP_STORE_URL } from "@/lib/config";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { trackFeedLoadTime, trackFeedPageLoaded, trackWeeklyDigestCardShown, trackWeeklyDigestCardTap, trackSocialEmptyCtaTap } from "@/analytics/analyticsEventsSSOT";
import { usePaginatedNotifications } from "@/hooks/usePaginatedNotifications";
import type { Notification } from "@/shared/contracts";

// Swipe action threshold (px to reveal actions)
const SWIPE_THRESHOLD = 60;
const ACTION_WIDTH = 120; // Width of action buttons area

// Availability outline colors (inline, no global tokens)
const AVAILABILITY_COLORS = {
  free: "#22C55E",   // green
  busy: "#EF4444",   // red
} as const;

type AvailabilityStatus = "free" | "busy" | "unknown";
type RsvpStatus = RsvpStatusMutation;

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
  
  // Canonical attendee count derivation (SSOT: eventQueryKeys.ts)
  const derivedAttendeeCount = deriveAttendeeCount(displayEvent);
  
  // [P0_RSVP_MISMATCH] FIX: Prefer goingCount (backend authoritative) over derivedCount.
  // derivedCount uses joinRequests which may only include friends, not ALL going users.
  const effectiveGoingCount = displayEvent.goingCount ?? derivedAttendeeCount;
  
  // DEV: Log mismatch between goingCount and derived count
  logRsvpMismatch(displayEvent.id, derivedAttendeeCount, displayEvent.goingCount, "social-feed");
  
  // Check if event is full (capacity exists and attendee count >= capacity)
  const isEventFull = displayEvent.capacity != null && 
    effectiveGoingCount >= displayEvent.capacity;

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

  // [SOCIAL_GESTURE] Suppress tap when user was swiping or scrolling
  const wasSwiping = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });
  const MOVE_THRESHOLD = 10; // px — finger must stay within this to count as tap

  const handlePress = () => {
    if (wasSwiping.current) {
      if (__DEV__) devLog("[SOCIAL_GESTURE]", "press_suppressed", { eventId: displayEvent.id, reason: "pan_gesture_active" });
      wasSwiping.current = false;
      return;
    }
    if (__DEV__) devLog("[SOCIAL_GESTURE]", "press_fired", { eventId: displayEvent.id });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/event/${displayEvent.id}` as any);
  };

  const onTouchStart = useCallback((e: any) => {
    wasSwiping.current = false;
    const touch = e.nativeEvent;
    touchStart.current = { x: touch.pageX, y: touch.pageY };
  }, []);

  const onTouchMove = useCallback((e: any) => {
    const touch = e.nativeEvent;
    const dx = Math.abs(touch.pageX - touchStart.current.x);
    const dy = Math.abs(touch.pageY - touchStart.current.y);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      wasSwiping.current = true;
    }
  }, []);

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
  
  const setWasSwiping = useCallback((v: boolean) => { wasSwiping.current = v; }, []);

  const panGesture = Gesture.Pan()
    .enabled(canSwipe)
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onStart(() => {
      // [SOCIAL_GESTURE] Pan activated — mark as swiping so Pressable.onPress is suppressed
      runOnJS(setWasSwiping)(true);
    })
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
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        className="rounded-2xl p-4 mb-4"
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        style={{
          backgroundColor: colors.surface,
          ...getBorderStyle(),
          ...(isDark ? { elevation: 1 } : TILE_SHADOW),
        }}
      >
        <View className="flex-row items-center">
          <View
            className="w-14 h-14 rounded-xl items-center justify-center mr-3"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: isOwn ? `${themeColor}20` : colors.surfaceElevated, overflow: 'hidden' }}
          >
            {displayEvent.visibility !== "private" && !displayEvent.isBusy && displayEvent.eventPhotoUrl ? (
              <ExpoImage
                source={{ uri: displayEvent.eventPhotoUrl }}
                style={{ width: 56, height: 56, borderRadius: 12 }}
                transition={200}
              />
            ) : (
              <Calendar size={24} color={themeColor} />
            )}
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text style={{ color: colors.text }} className="text-lg font-sora-semibold flex-1" numberOfLines={1}>
                {displayEvent.title}
              </Text>
              {isOwn && (
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                <Chip variant="accent" label="You" size="sm" style={{ marginLeft: 8 }} />
              )}
              <EventVisibilityBadge visibility={displayEvent.visibility} circleId={displayEvent.circleId} circleName={displayEvent.circleName} isBusy={displayEvent.isBusy} eventId={displayEvent.id} surface="social_feed" isDark={isDark} />
            </View>
            {displayEvent.description && !isSeries && (
              <Text
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ color: colors.textSecondary }}
                className="text-sm mt-0.5"
                numberOfLines={2}
              >
                {displayEvent.description}
              </Text>
            )}
            {isSeries && (
              <Text
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ color: colors.textSecondary }}
                className="text-sm mt-0.5"
              >
                Next: {dateLabel} at {timeLabel}
              </Text>
            )}
            {isSeries && (event as EventSeries).occurrenceCount > 1 && (
              <Text
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ color: themeColor }}
                className="text-sm mt-0.5 font-medium"
              >
                +{(event as EventSeries).occurrenceCount - 1} more
              </Text>
            )}
            {!isSeries && (isOwn || displayEvent.user?.name) && (
              <View className="flex-row items-center mt-1">
                <EntityAvatar
                  photoUrl={displayImage}
                  initials={displayName?.[0] ?? "?"}
                  size={24}
                  backgroundColor={displayImage ? colors.avatarBg : `${themeColor}20`}
                  foregroundColor={themeColor}
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ marginRight: 8 }}
                />
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  {isOwn ? "Your event" : displayEvent.user?.name}
                </Text>
              </View>
            )}
          </View>
        </View>

        {!isSeries && (
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          <View className="flex-row mt-3 pt-3 flex-wrap" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
            <View className="flex-row items-center mr-4">
              <Calendar size={14} color="#9CA3AF" />
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text style={{ color: colors.textSecondary, fontSize: 14 }} className="ml-1">{dateLabel}</Text>
            </View>
            <View className="flex-row items-center mr-4">
              <Clock size={14} color={themeColor} />
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text style={{ color: colors.textSecondary, fontSize: 14 }} className="ml-1">{timeLabel}</Text>
            </View>
            {displayEvent.location && (
              <View className="flex-row items-center flex-1">
                <MapPin size={14} color="#4ECDC4" />
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
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
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text style={{ color: displayEvent.isFull ? "#EF4444" : colors.textSecondary, fontSize: 14 }} className="ml-1">
              {displayEvent.isFull 
                ? `Full • ${effectiveGoingCount} going`
                : `${effectiveGoingCount}/${displayEvent.capacity} filled`
              }
            </Text>
          </View>
        )}

        {/* Social Proof - Friends Going */}
        {!isSeries && attendeesList.length > 0 && (
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
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
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{ 
            width: ACTION_WIDTH + 20,
            backgroundColor: colors.background,
          }}
        >
          <View className="flex-1 flex-row items-center justify-end pr-4">
            {/* Placeholder to maintain layout - actions are overlaid */}
          </View>
        </View>

        {/* Action buttons revealed on swipe */}
        <Animated.View 
          className="absolute right-0 top-0 bottom-0 flex-row items-center justify-end pr-4"
          /* INVARIANT_ALLOW_INLINE_ARRAY_PROP */
          style={[{ width: ACTION_WIDTH }, actionsAnimatedStyle]}
        >
          <Pressable
            onPress={handleInterested}
            className="w-12 h-12 rounded-full items-center justify-center mr-2"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: themeColor }}
          >
            <Heart size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={handleGoing}
            className="w-12 h-12 rounded-full items-center justify-center"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
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

  // Sort series by effective upcoming time (nextOccurrence for recurring, startTime otherwise)
  const getEffTime = (e: Event) => e.isRecurring && e.nextOccurrence ? new Date(e.nextOccurrence) : new Date(e.startTime);
  const sortedSeries = [...series].sort(
    (a, b) => getEffTime(a.nextEvent).getTime() - getEffTime(b.nextEvent).getTime()
  );

  sortedSeries.forEach((item) => {
    const eventDate = getEffTime(item.nextEvent);
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
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text style={{ color: colors.text }} className="text-lg font-sora-semibold flex-1">
          {title} ({events.length})
        </Text>
        {onToggle && (
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          <Text style={{ color: colors.textTertiary }} className="text-sm">
            {isCollapsed ? "▶" : "▼"}
          </Text>
        )}
      </Pressable>
      {/* INVARIANT_ALLOW_SMALL_MAP */}
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
  const { data: session } = useSession();
  const { colors } = useTheme();

  return (
    <View>
      <EmptyState
        type="events"
        actionLabel="Create Event"
        onAction={() => {
          trackSocialEmptyCtaTap({ cta: "create_plan", source: "social_empty" });
          if (!guardEmailVerification(session)) return;
          router.push("/create");
        }}
      />
      <Pressable
        onPress={() => {
          trackSocialEmptyCtaTap({ cta: "find_friends", source: "social_empty" });
          router.push("/add-friends");
        }}
        className="self-center mt-3 px-5 py-2.5 rounded-full"
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        <Text className="text-sm font-medium" style={{ color: colors.text }}>
          Find Friends
        </Text>
      </Pressable>
    </View>
  );
}

// ── Weekly Digest Card [GROWTH_P14] ─────────────────────────────────────────

/** Module-level session gate so we fire shown-telemetry at most once per app session. */
let _digestShownThisSession = false;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Find the most recent WEEKLY_DIGEST notification within the last 7 days. */
function findRecentWeeklyDigest(notifications: Notification[]): Notification | null {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  for (const n of notifications) {
    if (n.type === "weekly_digest" || n.type === "WEEKLY_DIGEST") {
      const ts = new Date(n.createdAt).getTime();
      if (ts >= cutoff) return n;
    }
  }
  return null;
}

const WeeklyDigestCard = React.memo(function WeeklyDigestCard({
  digest,
  colors,
  themeColor,
  onTap,
}: {
  digest: Notification;
  colors: { surface: string; text: string; textSecondary: string; border: string };
  themeColor: string;
  onTap: () => void;
}) {
  // Fire shown telemetry once per session
  const didFireRef = useRef(false);
  useEffect(() => {
    if (!didFireRef.current && !_digestShownThisSession) {
      didFireRef.current = true;
      _digestShownThisSession = true;
      trackWeeklyDigestCardShown({ hasDigest: true, sourceScreen: "social" });
    }
  }, []);

  const previewText = digest.body || digest.title || "";
  return (
    <Pressable
      /* INVARIANT_ALLOW_INLINE_HANDLER */
      onPress={onTap}
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
      }}
      accessibilityRole="button"
      accessibilityLabel="This week digest"
    >
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <Text style={{ color: themeColor, fontWeight: "700", fontSize: 15, marginBottom: 4 }}>
        This week
      </Text>
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <Text
        numberOfLines={2}
        style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}
      >
        {previewText}
      </Text>
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <Text style={{ color: themeColor, fontWeight: "600", fontSize: 13, marginTop: 8 }}>
        View
      </Text>
    </Pressable>
  );
});

export default function SocialScreen() {
  const socialMountTime = useRef(Date.now());
  const { data: session, isPending: sessionLoading } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [authBootstrapState, setAuthBootstrapState] = useState<"checking" | "error" | "ready">("checking");
  const [authBootstrapError, setAuthBootstrapError] = useState<{ error?: string; timedOut?: boolean }>();
  const [showFirstValueNudge, setShowFirstValueNudge] = useState(false);
  const [insightDismissed, setInsightDismissed] = useState(false);
  const [guidanceLoaded, setGuidanceLoaded] = useState(false);
  const hasBootstrapped = useRef(false);

  // [P0_CREATE_PILL_RENDER] DEV proof log for Create pill on Social
  const didLogCreatePill = useRef(false);
  const lastEndReachedRef = useRef(0);
  const feedMountTsRef = useRef(Date.now());
  const feedLoadTimeFired = useRef(false);
  const socialInsets = useSafeAreaInsets();
  const [chromeHeight, setChromeHeight] = useState<number>(160);
  if (__DEV__ && !didLogCreatePill.current) {
    didLogCreatePill.current = true;
    devLog('[P0_CREATE_PILL_RENDER]', {
      screen: 'social',
      visible: true,
      bottomInset: socialInsets.bottom,
      hasSafeAreaInsets: socialInsets.bottom > 0,
      container: 'SafeAreaView>Header',
    });
  }
  
  // Collapse state for sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Pane + date selection state for social calendar
  const [activePane, setActivePane] = useState<"group" | "open">("open");
  const [selectedCalDate, setSelectedCalDate] = useState<Date | null>(null);

  // [GROWTH_P14] Weekly digest — reuse paginated notifications (first page only)
  const { notifications: allNotifications } = usePaginatedNotifications({
    enabled: isAuthedForNetwork(bootStatus, session),
    pageSize: 30,
  });
  const weeklyDigest = useMemo(
    () => findRecentWeeklyDigest(allNotifications),
    [allNotifications],
  );
  const handleDigestTap = useCallback(() => {
    const hadPreview = !!(weeklyDigest?.body);
    trackWeeklyDigestCardTap({ sourceScreen: "social", target: "notifications", hadPreviewText: hadPreview });
    router.push("/activity");
  }, [weeklyDigest, router]);

  // Auth gating based on boot status AND session userId (SSOT gate)
  const isAuthed = isAuthedForNetwork(bootStatus, session);

  // Load guidance state when user ID is available
  useEffect(() => {
    setGuidanceUserId(session?.user?.id ?? null);
    loadGuidanceState().then(() => setGuidanceLoaded(true));
  }, [session?.user?.id]);

  // Redirect non-authed users to the unauthenticated root
  useEffect(() => {
    if (bootStatus === 'onboarding') {
      router.replace('/welcome');
    } else if (bootStatus === 'loggedOut' || bootStatus === 'error') {
      router.replace('/welcome');
    }
  }, [bootStatus, router]);

  // NOTE: useRevenueCatSync is called in _layout.tsx BootRouter (single global call)

  // NOTE: useNotifications() moved to _layout.tsx BootRouter for global push registration

  // Refetch session on app focus to sync emailVerified state
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: qk.session() });
    }, [queryClient])
  );

  // Removed old verification banner logic - now using EmailVerificationBanner component
  // which auto-shows when emailVerified === false

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
      if (__DEV__) devLog("[SocialScreen] Auth confirmed via bootStatus; setting bootstrap state to ready");
      setAuthBootstrapState("ready");
    }
  }, [isAuthed]);

  // Handle retry button
  const handleRetry = useCallback(() => {
    if (__DEV__) devLog("[SocialScreen] Retrying bootstrap...");
    hasBootstrapped.current = false;
    setAuthBootstrapState("checking");
    setAuthBootstrapError(undefined);
  }, []);

  // Handle reset session button
  const handleResetSession = useCallback(async () => {
    await performLogout({ screen: "social", queryClient, router });
  }, [queryClient, router]);

  // Pagination constants
  const FEED_PAGE_SIZE = 20;
  // Exact query key for the infinite feed query (includes page size for cache identity)
  const feedExactKey = [...eventKeys.feedPaginated(), FEED_PAGE_SIZE] as const;

  // Fetch friend events (feed) with pagination
  const {
    data: feedPagesData,
    isLoading: feedLoading,
    refetch: refetchFeed,
    isRefetching: isRefetchingFeed,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: feedExactKey,
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/api/events/feed?limit=${FEED_PAGE_SIZE}&cursor=${encodeURIComponent(pageParam)}`
        : `/api/events/feed?limit=${FEED_PAGE_SIZE}`;
      const result = await api.get<GetEventsFeedResponse>(url);

      // DEV proof log for pagination
      if (__DEV__) {
        const loadedCount = result.events.length;
        devLog('[P1_FEED_PAGINATION]', `cursor=${pageParam ?? 'null'}, loadedCount=${loadedCount}, nextCursor=${result.nextCursor ?? 'null'}`);
      }

      // [P1_FEED_PAGE_LOADED] Per-page telemetry
      trackFeedPageLoaded({
        pageIndex: pageParam ? 1 : 0, // 0 = first page, 1 = subsequent
        itemCount: result.events.length,
        hasCursor: !!pageParam,
        hasNextPage: !!result.nextCursor,
      });

      return result;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000, // 5 min — data considered fresh, won't refetch on tab return
    gcTime: 30 * 60 * 1000, // 30 min — keep cached data in memory across navigations
    // refetchOnMount: default (true) — stale data refetches on navigation return
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    placeholderData: (prev: InfiniteData<GetEventsFeedResponse, string | null> | undefined) => prev, // [PERF_SWEEP] Keep pages visible during refetch
    // [INFINITE_QUERY_SSOT] Removed capInfinitePages to fix "Load More" button bug - React Query manages pagination state
  });

  // Auto-pagination: scroll-triggered fetch for feed
  const handleFeedScroll = useCallback((e: { nativeEvent: { layoutMeasurement: { height: number }; contentOffset: { y: number }; contentSize: { height: number } } }) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    // Trigger at ~50% of visible height from bottom
    if (distanceFromBottom > layoutMeasurement.height * 0.5) return;
    if (!hasNextPage || isFetchingNextPage) return;
    const now = Date.now();
    if (now - lastEndReachedRef.current < DEFAULT_ENDREACHED_DEBOUNCE_MS) return;
    lastEndReachedRef.current = now;
    if (__DEV__) devLog('[P1_FEED_ENDREACHED]', { hasNextPage, isFetchingNextPage });
    fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten paginated feed data for existing consumption
  const feedData = useMemo(() => {
    if (!feedPagesData?.pages) return undefined;
    const allEvents = feedPagesData.pages.flatMap(page => page.events);
    return { events: allEvents };
  }, [feedPagesData]);

  // [P1_POSTHOG_FEED_LOAD_TIME] Fire once per mount when feed data first settles
  useEffect(() => {
    if (feedLoadTimeFired.current || !feedData?.events) return;
    feedLoadTimeFired.current = true;
    const ms = Date.now() - feedMountTsRef.current;
    trackFeedLoadTime({ ms, itemCount: feedData.events.length });
    if (__DEV__) devLog('[P1_FEED_LOAD_TIME]', { ms, itemCount: feedData.events.length });
  }, [feedData]);

  // Also fetch user's own events
  const {
    data: myEventsData,
    isLoading: myEventsLoading,
    refetch: refetchMyEvents,
    isRefetching: isRefetchingMyEvents,
  } = useQuery({
    queryKey: eventKeys.mine(),
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000, // 5 min — data considered fresh, won't refetch on tab return
    gcTime: 30 * 60 * 1000, // 30 min — keep cached data in memory across navigations
    refetchInterval: 60000,
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
    // refetchOnMount: default (true) — stale data refetches on navigation return
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // Fetch events user is attending
  const {
    data: attendingData,
    isLoading: attendingLoading,
    refetch: refetchAttending,
    isRefetching: isRefetchingAttending,
  } = useQuery({
    queryKey: eventKeys.attending(),
    queryFn: () => api.get<GetEventsResponse>("/api/events/attending"),
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000, // 5 min — data considered fresh, won't refetch on tab return
    gcTime: 30 * 60 * 1000, // 30 min — keep cached data in memory across navigations
    refetchInterval: 60000,
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
    // refetchOnMount: default (true) — stale data refetches on navigation return
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // [P0_SOCIAL_OPTIMISTIC_RSVP] Per-event in-flight guard to allow concurrent RSVPs on different events
  const rsvpInflightRef = useRef(new Set<string>());

  // RSVP mutation for swipe actions — optimistic with event-scoped rollback
  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: RsvpStatus }) =>
      api.post(`/api/events/${eventId}/rsvp`, { status }),
    onMutate: async ({ eventId, status }) => {
      const _t0 = Date.now();
      rsvpInflightRef.current.add(eventId);

      // Cancel outgoing feed + detail refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: eventKeys.feedPaginated() });
      await queryClient.cancelQueries({ queryKey: eventKeys.single(eventId) });

      // Snapshot previous feed pages for rollback (use EXACT key for infinite query)
      const previousFeed = queryClient.getQueryData<InfiniteData<GetEventsFeedResponse, string | null>>(feedExactKey);

      // Snapshot event detail cache for rollback (if user visited event before)
      const detailKey = eventKeys.single(eventId);
      const previousDetail = queryClient.getQueryData<Event>(detailKey);

      // Helper: compute goingCount delta
      const computeDelta = (prevStatus: string | null | undefined, newStatus: string) => {
        const wasGoing = prevStatus === "going";
        const isGoing = newStatus === "going";
        if (!wasGoing && isGoing) return 1;
        if (wasGoing && !isGoing) return -1;
        return 0;
      };

      // Optimistically update viewerRsvpStatus + goingCount in the feed cache
      queryClient.setQueryData<InfiniteData<GetEventsFeedResponse, string | null>>(feedExactKey, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          /* INVARIANT_ALLOW_SMALL_MAP */
          pages: old.pages.map((page) => ({
            ...page,
            /* INVARIANT_ALLOW_SMALL_MAP */
            events: page.events.map((ev) => {
              if (ev.id !== eventId) return ev;
              const delta = computeDelta(ev.viewerRsvpStatus, status);
              return {
                ...ev,
                viewerRsvpStatus: status,
                goingCount: Math.max(0, (ev.goingCount ?? 0) + delta),
              };
            }),
          })),
        };
      });

      // [PHASE2_CACHE_NORM] Also update event detail cache if it exists
      if (previousDetail) {
        const delta = computeDelta(previousDetail.viewerRsvpStatus, status);
        queryClient.setQueryData<Event>(detailKey, {
          ...previousDetail,
          viewerRsvpStatus: status as Event["viewerRsvpStatus"],
          goingCount: Math.max(0, (previousDetail.goingCount ?? 0) + delta),
        });
      }

      if (__DEV__) {
        devLog('[P0_SOCIAL_OPTIMISTIC_RSVP]', {
          eventId,
          newStatus: status,
          rollbackUsed: false,
          hasPreviousFeed: !!previousFeed,
          hasDetailCache: !!previousDetail,
        });
      }

      return { previousFeed, previousDetail, detailKey, _t0, eventId };
    },
    onSuccess: (_, { eventId, status }, context) => {
      if (__DEV__) {
        const durationMs = context?._t0 ? Date.now() - context._t0 : 0;
        devLog('[ACTION_FEEDBACK]', JSON.stringify({
          action: 'rsvp_swipe',
          state: 'success',
          eventId,
          status,
          durationMs,
        }));
      }
    },
    onError: (error: any, { eventId, status }, context) => {
      // Rollback optimistic feed update using exact key
      if (context?.previousFeed) {
        queryClient.setQueryData<InfiniteData<GetEventsFeedResponse, string | null>>(feedExactKey, context.previousFeed);
      }
      // Rollback optimistic event detail cache
      if (context?.previousDetail && context?.detailKey) {
        queryClient.setQueryData<Event>(context.detailKey, context.previousDetail);
      }
      if (__DEV__) {
        devLog('[P0_SOCIAL_OPTIMISTIC_RSVP]', {
          eventId,
          newStatus: status,
          rollbackUsed: !!context?.previousFeed,
          detailRollback: !!context?.previousDetail,
          errorStatus: error?.status,
        });
      }
      // Handle 409 EVENT_FULL error
      if (error?.response?.status === 409 || error?.status === 409) {
        safeToast.warning("Full", "This invite is full.");
      } else {
        safeToast.error("Oops", "That didn't go through. Please try again.");
      }
    },
    onSettled: (_, __, { eventId }) => {
      rsvpInflightRef.current.delete(eventId);
      // Always reconcile with server truth
      invalidateEventKeys(queryClient, getInvalidateAfterRsvpJoin(eventId), `rsvp_swipe_settled`);
    },
  });

  // Handle RSVP from swipe action — per-event guard allows concurrent RSVPs on different events
  const { mutate: rsvpMutate } = rsvpMutation;
  const handleSwipeRsvp = useCallback((eventId: string, status: RsvpStatus) => {
    if (!isAuthed) return;
    // [P0_SOCIAL_RSVP_RACE_GUARD] Per-event guard: block duplicate on SAME event, allow different events
    if (rsvpInflightRef.current.has(eventId)) {
      if (__DEV__) devLog('[P0_SOCIAL_RSVP_RACE_GUARD]', 'swipe ignored (inflight), eventId=' + eventId + ' status=' + status);
      return;
    }
    rsvpMutate({ eventId, status });
  }, [isAuthed, rsvpMutate]);

  // Fetch friends for first-value nudge eligibility
  const {
    data: friendsData,
    isLoading: friendsLoading,
  } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000, // 5 min - same as friends tab
    // refetchOnMount: default (true) — stale data refetches on navigation return
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
  });

  // Check if user is eligible for first-value nudge
  const isFirstValueNudgeEligible = (() => {
    // Only eligible if authed
    if (bootStatus !== 'authed') return false;
    
    // MUST be email verified - verification takes priority over nudge
    if (session?.user?.emailVerified === false) return false;
    
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

  // Auto-dismiss guidance for senior users (those with friends or events)
  // This prevents showing guides to existing accounts who have already used the app
  useEffect(() => {
    const checkSeniorUser = async () => {
      if (!session?.user?.id || bootStatus !== 'authed') return;
      if (feedLoading || myEventsLoading || friendsLoading) return;
      
      const hasFriends = (friendsData?.friends?.length ?? 0) > 0;
      const hasEvents = (myEventsData?.events?.length ?? 0) > 0;
      
      // If user has friends OR events, they're a senior user - dismiss all guidance
      if (hasFriends || hasEvents) {
        await dismissAllGuidance();
        // Reload guidance state to update cache
        await loadGuidanceState();
        setGuidanceLoaded(true);
      }
    };
    checkSeniorUser();
  }, [session?.user?.id, bootStatus, feedLoading, myEventsLoading, friendsLoading, friendsData, myEventsData]);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Discovery events: pure discovery (excludes going/interested/host)
  // P0: Client-side safety net — also exclude circle-only events from social feed
  const discoveryEvents = useMemo(() => {
    const feedEvents = feedData?.events ?? [];
    const myEvents = myEventsData?.events ?? [];
    const attendingEvents = attendingData?.events ?? [];

    const myEventIds = new Set(myEvents.map(e => e.id));
    const attendingEventIds = new Set(attendingEvents.map(e => e.id));
    const viewerUserId = session?.user?.id;

    let excludedCircleCount = 0;
    let excludedExpiredCount = 0;
    const nowMs = Date.now();
    const filtered = feedEvents.filter(event => {
      // [INVALIDATION_GAPS_V1] Filter past/ended events — same pattern as profile fix
      // For recurring events, use nextOccurrence (server-computed future date) instead of stale original startTime
      const startMs = event.startTime ? new Date(event.startTime).getTime() : NaN;
      if (Number.isNaN(startMs)) { excludedExpiredCount++; return false; }
      if (event.isRecurring && event.nextOccurrence) {
        const nextOccMs = new Date(event.nextOccurrence).getTime();
        if (nextOccMs < nowMs) { excludedExpiredCount++; return false; }
      } else {
        const endMs = event.endTime ? new Date(event.endTime).getTime() : NaN;
        const relevantMs = Number.isNaN(endMs) ? startMs : endMs;
        if (relevantMs < nowMs) { excludedExpiredCount++; return false; }
      }

      if (event.userId === viewerUserId) return false;
      if (event.viewerRsvpStatus === 'going' || event.viewerRsvpStatus === 'interested') return false;
      if (myEventIds.has(event.id)) return false;
      if (attendingEventIds.has(event.id)) return false;
      // Safety net: circle-only events must not appear in social/discover feed
      if (event.visibility === 'circle_only' || (event.circleId && event.visibility !== 'all_friends')) {
        excludedCircleCount++;
        return false;
      }
      return true;
    });
    if (__DEV__) {
      devLog('[P0_SOCIAL_OPEN_INVITES_FILTER]', {
        renderedCount: filtered.length,
        excludedCircleCount,
        excludedExpiredCount, // [SOCIAL_EXPIRY] past/ended events filtered
      });
    }
    return filtered;
  }, [feedData?.events, myEventsData?.events, attendingData?.events, session?.user?.id]);

  // All events for calendar (includes my events + attending + discovery)
  // [P0_SOCIAL_TAB_PRIVACY] ALLOWLIST: Only OPEN and GROUP/CIRCLE events may appear.
  // PRIVATE, BUSY, and work events must be excluded from the dataset entirely — no masking.
  const allEvents = useMemo(() => {
    const myEvents = myEventsData?.events ?? [];
    const attendingEvents = attendingData?.events ?? [];

    // ALLOWLIST visibility values permitted on the social/center tab calendar
    const SOCIAL_ALLOWED_VISIBILITY = new Set([
      "all_friends",
      "open_invite",
      "circle_only",
      "specific_groups",
    ]);

    // Allowlist filter: event must have allowed visibility AND not be busy/work
    const isAllowedOnSocialTab = (e: Event): { allowed: boolean; reason?: string } => {
      if (e.isBusy) return { allowed: false, reason: "isBusy" };
      if ((e as any).isWork) return { allowed: false, reason: "isWork" };
      // Legacy busy detection
      const t = (e.title ?? "").toLowerCase().trim();
      if (t === "busy" || t.startsWith("busy ")) return { allowed: false, reason: "legacy_busy_title" };

      const vis = (e.visibility ?? "").toLowerCase();
      if (vis === "private") return { allowed: false, reason: "visibility=private" };
      if (!SOCIAL_ALLOWED_VISIBILITY.has(vis)) return { allowed: false, reason: `visibility=${vis}_not_in_allowlist` };

      return { allowed: true };
    };

    const eventMap = new Map<string, Event>();
    const excluded: Array<{ id: string; title: string; reason: string }> = [];

    const addIfAllowed = (e: Event) => {
      if (eventMap.has(e.id)) return;
      const check = isAllowedOnSocialTab(e);
      if (check.allowed) {
        eventMap.set(e.id, e);
      } else {
        excluded.push({ id: e.id, title: e.title, reason: check.reason! });
      }
    };

    myEvents.forEach(addIfAllowed);
    attendingEvents.forEach(addIfAllowed);
    discoveryEvents.forEach(addIfAllowed);

    const result = Array.from(eventMap.values());

    // [P0_SOCIAL_TAB_PRIVACY] DEV proof: log raw counts, per-item decisions, final count
    if (__DEV__) {
      const totalInput = myEvents.length + attendingEvents.length + discoveryEvents.length;
      devLog("[P0_SOCIAL_TAB_PRIVACY]", {
        rawItemCount: totalInput,
        myEventsCount: myEvents.length,
        attendingCount: attendingEvents.length,
        discoveryCount: discoveryEvents.length,
        excludedCount: excluded.length,
        renderedCount: result.length,
        excludedItems: excluded.slice(0, 10),
      });
    }

    return result;
  }, [myEventsData?.events, attendingData?.events, discoveryEvents]);

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

  // Group discovery events by time (feed sections show ONLY discovery)
  const groupedEvents = useMemo(
    () => groupEventsByTime(discoveryEvents, session?.user?.id),
    [discoveryEvents, session?.user?.id]
  );

  // "Group" pane events: circle events only (own + attending, where circleId is set)
  const groupPaneEvents = useMemo(() => {
    const myEvents = myEventsData?.events ?? [];
    const attending = attendingData?.events ?? [];
    const viewerUserId = session?.user?.id;
    const eventMap = new Map<string, Event>();
    myEvents.forEach(e => eventMap.set(e.id, e));
    attending.forEach(e => { if (!eventMap.has(e.id)) eventMap.set(e.id, e); });
    return Array.from(eventMap.values())
      .filter(e => !!e.circleId) // Circle events only
      .filter(e => new Date(e.startTime) >= new Date(new Date().setHours(0, 0, 0, 0)))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [myEventsData?.events, attendingData?.events, session?.user?.id]);

  // Events for the selected calendar date (from all events)
  const selectedDateEvents = useMemo(() => {
    if (!selectedCalDate) return [];
    return calendarEvents
      .filter(e => {
        const d = new Date(e.startTime);
        return d.toDateString() === selectedCalDate.toDateString();
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [selectedCalDate, calendarEvents]);

  // Handler for calendar date selection
  const handleCalDateSelect = useCallback((date: Date) => {
    // Toggle: tap same date again to deselect
    if (selectedCalDate && date.toDateString() === selectedCalDate.toDateString()) {
      setSelectedCalDate(null);
    } else {
      setSelectedCalDate(date);
    }
  }, [selectedCalDate]);

  // [P0_PERF_PRELOAD_BOUNDED_HEROES] Prefetch hero banners for bounded social feed sections
  const socialHeroUris = useMemo(() => {
    const uris: (string | null | undefined)[] = [];
    const sections = [groupedEvents.today, groupedEvents.tomorrow, groupedEvents.thisWeek];
    for (const section of sections) {
      for (const item of section) {
        const ev = 'nextEvent' in item ? item.nextEvent : item;
        uris.push(ev.eventPhotoUrl);
        if (uris.length >= 6) break;
      }
      if (uris.length >= 6) break;
    }
    return uris;
  }, [groupedEvents]);
  usePreloadHeroBanners({ uris: socialHeroUris, enabled: true, max: 6 });

  // Count discovery events in the next 14 days for social proof line
  const plansIn14Days = useMemo(() => {
    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return discoveryEvents.filter((event) => {
      const eventDate = new Date(event.startTime);
      return eventDate >= now && eventDate <= fourteenDaysFromNow;
    }).length;
  }, [discoveryEvents]);

  const handleRefreshLegacy = () => {
    refetchFeed();
    refetchMyEvents();
    refetchAttending();
  };

  // [LIVE_REFRESH] SSOT live-feel contract: manual + foreground + focus
  const { isRefreshing: liveIsRefreshing, onManualRefresh } = useLiveRefreshContract({
    screenName: "social",
    refetchFns: [refetchFeed, refetchMyEvents, refetchAttending],
  });

  const isRefreshing = liveIsRefreshing || isRefetchingFeed || isRefetchingMyEvents || isRefetchingAttending;
  
  // P1 JITTER FIX: Use sticky loading to prevent flicker on fast refetches
  const isStickyLoading = useStickyLoadingCombined(
    [feedLoading, myEventsLoading, attendingLoading],
    300,
    __DEV__ ? "social" : undefined
  );

  // [P1_LOADING_INV] loadedOnce discipline: skeleton only on first load, never on refetch
  const { showInitialLoading: isLoading } = useLoadedOnce(
    { isLoading: isStickyLoading, isFetching: isRefreshing, isSuccess: !!feedData, data: feedData },
    "social-feed",
  );

  // [PERF_SWEEP] DEV-only render timing
  if (__DEV__ && !isLoading && socialMountTime.current) {
    devLog("[PERF_SWEEP]", { screen: "social", phase: "render", durationMs: Date.now() - socialMountTime.current });
    socialMountTime.current = 0;
  }

  // Render loading state for non-authed states (redirect useEffect handles routing)
  // Keep BottomNavigation visible for escape route
  if (bootStatus === 'loading' || bootStatus === 'loggedOut' || bootStatus === 'error' || bootStatus === 'onboarding') {
    return (
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      /* INVARIANT_ALLOW_INLINE_ARRAY_PROP */
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text style={{ color: colors.textTertiary }}>Syncing your feed…</Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  if (sessionLoading) {
    return (
      <AuthProvider state="checking">
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        {/* INVARIANT_ALLOW_INLINE_ARRAY_PROP */}
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
          <View className="flex-1 items-center justify-center">
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
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
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        {/* INVARIANT_ALLOW_INLINE_ARRAY_PROP */}
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
          <View className="flex-1 items-center justify-center">
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text style={{ color: colors.textTertiary }}>Loading...</Text>
          </View>
        </SafeAreaView>
      </AuthProvider>
    );
  }

  const hasOpenInviteEvents =
    groupedEvents.today.length > 0 ||
    groupedEvents.tomorrow.length > 0 ||
    groupedEvents.thisWeek.length > 0 ||
    groupedEvents.upcoming.length > 0;
  const hasGroupEvents = groupPaneEvents.length > 0;
  const hasEvents = hasOpenInviteEvents || hasGroupEvents;
    
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
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      {/* INVARIANT_ALLOW_INLINE_ARRAY_PROP */}
      <SafeAreaView testID="social-screen" className="flex-1" style={{ backgroundColor: colors.background }} edges={[]}>

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
          style={{ paddingTop: socialInsets.top, overflow: "hidden" }}
        >
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
            <AppHeader
              title="Open Invites"
              left={<HelpSheet screenKey="social" config={HELP_SHEETS.social} />}
              right={
                <View className="flex-row items-center">
                  <ShareAppButton variant="icon" />
                  <Button
                    variant="primary"
                    size="sm"
                    label="Create"
                    /* INVARIANT_ALLOW_INLINE_HANDLER */
                    onPress={() => {
                      if (!guardEmailVerification(session)) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/create");
                    }}
                    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                    style={{ marginLeft: 8 }}
                  />
                </View>
              }
            />
          </View>
        </BlurView>
      </View>

      {/* Main content */}
      {isLoading ? (
        <FeedSkeleton />
      ) : (
        <ScrollView
          testID="social-feed"
          className="flex-1 px-5"
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          contentContainerStyle={{ paddingTop: chromeHeight, paddingBottom: TAB_BOTTOM_PADDING }}
          showsVerticalScrollIndicator={false}
          onScroll={handleFeedScroll}
          scrollEventThrottle={400}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onManualRefresh}
              tintColor={themeColor}
              progressViewOffset={chromeHeight}
            />
          }
        >
          {/* Email verification banner - shows when emailVerified === false */}
          <EmailVerificationBanner />

          {/* [GROWTH_P14] Weekly digest card */}
          {weeklyDigest && (
            <WeeklyDigestCard
              digest={weeklyDigest}
              colors={colors}
              themeColor={themeColor}
              onTap={handleDigestTap}
            />
          )}
          <FeedCalendar
            events={calendarEvents}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userId={session?.user?.id}
            onDateSelect={handleCalDateSelect}
            selectedDate={selectedCalDate}
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

          {/* ═══ MODE B: Selected date — inline events ═══ */}
          {selectedCalDate ? (
            <View className="mt-4">
              {/* Selected date header with clear button */}
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center">
                  <Calendar size={16} color={themeColor} />
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-base font-semibold ml-2" style={{ color: colors.text }}>
                    {selectedCalDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </Text>
                </View>
                <Pressable
                  /* INVARIANT_ALLOW_INLINE_HANDLER */
                  onPress={() => setSelectedCalDate(null)}
                  className="w-8 h-8 rounded-full items-center justify-center"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ backgroundColor: colors.surface }}
                >
                  <X size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                {selectedDateEvents.length} {selectedDateEvents.length === 1 ? "event" : "events"}
              </Text>
              {selectedDateEvents.length > 0 ? (
                // INVARIANT_ALLOW_SMALL_MAP
                selectedDateEvents.map((event, idx) => (
                  <Animated.View key={event.id} entering={FadeInDown.delay(idx * 50)}>
                    <EventListItem
                      event={event}
                      themeColor={themeColor}
                      colors={colors}
                      isDark={isDark}
                    />
                  </Animated.View>
                ))
              ) : (
                <View className="py-8 items-center">
                  <Text className="text-4xl mb-3">📅</Text>
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-base font-medium" style={{ color: colors.textSecondary }}>
                    No events on this day
                  </Text>
                  {selectedCalDate >= new Date(new Date().setHours(0, 0, 0, 0)) && (
                    <Button
                      variant="ghost"
                      label="Create an Invite"
                      /* INVARIANT_ALLOW_INLINE_HANDLER */
                      onPress={() => {
                        if (!guardEmailVerification(session)) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        router.push(`/create?date=${selectedCalDate.toISOString()}`);
                      }}
                      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                      style={{ marginTop: 12 }}
                    />
                  )}
                </View>
              )}
            </View>
          ) : (
            /* ═══ MODE A: Default — Group | Open Invite pane ═══ */
            <View className="mt-4">
              {/* Pane selector */}
              <View className="flex-row mb-4" style={{ borderRadius: 12, backgroundColor: colors.surface, padding: 4 }}>
                <Pressable
                  /* INVARIANT_ALLOW_INLINE_HANDLER */
                  onPress={() => { Haptics.selectionAsync(); setActivePane("group"); }}
                  className="flex-1 items-center py-2.5 rounded-lg"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ backgroundColor: activePane === "group" ? themeColor : "transparent" }}
                >
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-sm font-semibold" style={{ color: activePane === "group" ? "#FFFFFF" : colors.textSecondary }}>
                    Group Invite
                  </Text>
                </Pressable>
                <Pressable
                  /* INVARIANT_ALLOW_INLINE_HANDLER */
                  onPress={() => { Haptics.selectionAsync(); setActivePane("open"); }}
                  className="flex-1 items-center py-2.5 rounded-lg"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ backgroundColor: activePane === "open" ? themeColor : "transparent" }}
                >
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-sm font-semibold" style={{ color: activePane === "open" ? "#FFFFFF" : colors.textSecondary }}>
                    Open Invite
                  </Text>
                </Pressable>
              </View>

              {/* Pane content */}
              {activePane === "open" ? (
                /* Open Invite pane — discovery events by time section */
                hasOpenInviteEvents ? (
                  <>
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
                    {/* Load more button for feed pagination */}
                    {hasNextPage && (
                      <Button
                        variant="secondary"
                        label="Load more invites"
                        /* INVARIANT_ALLOW_INLINE_HANDLER */
                        onPress={() => fetchNextPage()}
                        loading={isFetchingNextPage}
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        style={{ marginHorizontal: 16, marginVertical: 24, borderRadius: 12 }}
                      />
                    )}
                  </>
                ) : (
                  <View className="py-8 items-center px-8">
                    <Text className="text-4xl mb-3">🎉</Text>
                    {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                    <Text className="text-base font-medium text-center" style={{ color: colors.textSecondary }}>
                      No open invites from friends yet
                    </Text>
                    <Button
                      variant="ghost"
                      label="Create an Invite"
                      /* INVARIANT_ALLOW_INLINE_HANDLER */
                      onPress={() => {
                        if (!guardEmailVerification(session)) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        router.push("/create");
                      }}
                      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                      style={{ marginTop: 12 }}
                    />
                  </View>
                )
              ) : (
                /* Group pane — circle events only */
                hasGroupEvents ? (
                  // INVARIANT_ALLOW_SMALL_MAP
                  groupPaneEvents.map((event, idx) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      index={idx}
                      isOwn={event.userId === session?.user?.id}
                      themeColor={themeColor}
                      isDark={isDark}
                      colors={colors}
                      userImage={session?.user?.image}
                      userName={session?.user?.name}
                      userCalendarEvents={userCalendarEvents}
                      onRsvp={handleSwipeRsvp}
                      isAuthed={isAuthed}
                    />
                  ))
                ) : (
                  <View className="py-8 items-center px-8">
                    <Text className="text-4xl mb-3">👥</Text>
                    {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                    <Text className="text-base font-medium text-center" style={{ color: colors.textSecondary }}>
                      No upcoming circle events
                    </Text>
                    <Button
                      variant="ghost"
                      label="Create an Invite"
                      /* INVARIANT_ALLOW_INLINE_HANDLER */
                      onPress={() => {
                        if (!guardEmailVerification(session)) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        router.push("/create");
                      }}
                      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                      style={{ marginTop: 12 }}
                    />
                  </View>
                )
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Quick Plan button removed from Social screen — component preserved for future use */}

      {/* First-Value Nudge for Brand New Users */}
      <FirstValueNudge
        visible={showFirstValueNudge}
        onClose={() => setShowFirstValueNudge(false)}
        onPrimary={() => router.push("/friends")}
        onSecondary={() => {
          if (!guardEmailVerification(session)) return;
          router.push("/create");
        }}
      />

      <BottomNavigation />
      </SafeAreaView>
    </AuthProvider>
  );
}
