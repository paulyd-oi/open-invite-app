import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Image, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Calendar, ChevronRight, ChevronLeft, UserPlus, Lock, Shield, Check, X, Users, MapPin, Clock } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useMinuteTick } from "@/lib/useMinuteTick";
import { normalizeFeaturedBadge } from "@/lib/normalizeBadge";
import { BadgePill } from "@/components/BadgePill";
import { type FriendUser, type ProfileBadge, type Event } from "@/shared/contracts";

// Minimal Calendar Component (no events visible for privacy)
function PrivateCalendar({ themeColor }: { themeColor: string }) {
  const { colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    return { daysInMonth, startingDay };
  };

  const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);
  const today = new Date();

  const goToPrevMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const renderDays = () => {
    const days = [];
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    // Day headers
    for (let i = 0; i < 7; i++) {
      days.push(
        <View key={`header-${i}`} className="w-[14.28%] items-center py-1">
          <Text className="text-xs font-medium" style={{ color: colors.textTertiary }}>{dayNames[i]}</Text>
        </View>
      );
    }

    // Empty cells for days before month starts
    for (let i = 0; i < startingDay; i++) {
      days.push(<View key={`empty-${i}`} className="w-[14.28%] h-9" />);
    }

    // Days of the month (no event indicators for privacy)
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const dateKey = date.toDateString();
      const isToday = today.toDateString() === dateKey;

      days.push(
        <View
          key={`day-${day}`}
          className="w-[14.28%] h-9 items-center justify-center"
        >
          <View
            className={`w-8 h-8 rounded-full items-center justify-center ${isToday ? "border-2" : ""}`}
            style={{
              borderColor: isToday ? themeColor : undefined,
            }}
          >
            <Text
              className="text-sm font-normal"
              style={{ color: isToday ? themeColor : colors.text }}
            >
              {day}
            </Text>
          </View>
        </View>
      );
    }

    return days;
  };

  return (
    <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
      {/* Month Header */}
      <View className="flex-row items-center justify-between mb-3">
        <Pressable onPress={goToPrevMonth} className="p-2">
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <Text className="text-base font-semibold" style={{ color: colors.text }}>
          {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
        <Pressable onPress={goToNextMonth} className="p-2">
          <ChevronRight size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Calendar Grid */}
      <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 220 }}
      >
        <View className="flex-row flex-wrap">
          {renderDays()}
        </View>
      </ScrollView>

      {/* Privacy notice */}
      <View className="flex-row items-center justify-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
        <Lock size={12} color={colors.textTertiary} />
        <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>Events hidden for privacy</Text>
      </View>
    </View>
  );
}

// EventCard Component (for friend events in unlocked state)
function EventCard({ event, index }: { event: Event; index: number }) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  const isToday = new Date().toDateString() === startDate.toDateString();
  const isTomorrow =
    new Date(Date.now() + 86400000).toDateString() === startDate.toDateString();

  const dateLabel = isToday
    ? "Today"
    : isTomorrow
    ? "Tomorrow"
    : startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Show time range if endTime exists
  const timeLabel = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/event/${event.id}` as any);
        }}
        className="rounded-2xl p-4 mb-3"
        style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <View className="flex-row items-center mb-2">
              <Text className="text-3xl mr-2">{event.emoji ?? "📅"}</Text>
              <View className="flex-1">
                <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                  {event.title}
                </Text>
                <View className="flex-row items-center mt-1">
                  <Calendar size={12} color={colors.textSecondary} />
                  <Text className="text-xs ml-1" style={{ color: colors.textSecondary }}>
                    {dateLabel}
                  </Text>
                </View>
              </View>
            </View>

            {event.description && (
              <Text className="text-sm mb-2" style={{ color: colors.textSecondary }} numberOfLines={2}>
                {event.description}
              </Text>
            )}

            <View className="flex-row items-center flex-wrap gap-2">
              <View className="flex-row items-center">
                <Clock size={12} color={themeColor} />
                <Text className="text-xs ml-1 font-medium" style={{ color: themeColor }}>
                  {timeLabel}
                </Text>
              </View>

              {event.location && (
                <View className="flex-row items-center">
                  <MapPin size={12} color={colors.textTertiary} />
                  <Text className="text-xs ml-1" style={{ color: colors.textTertiary }} numberOfLines={1}>
                    {event.location}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <ChevronRight size={20} color={colors.textTertiary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// FriendCalendar Component (for friend events in unlocked state)
function FriendCalendar({ events, themeColor }: { events: Event[]; themeColor: string }) {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Get events by date for quick lookup
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((event) => {
      const dateKey = new Date(event.startTime).toDateString();
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });
    return map;
  }, [events]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    return { daysInMonth, startingDay };
  };

  const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);
  const today = new Date();

  const goToPrevMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDayPress = (day: number) => {
    const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dateKey = selectedDate.toDateString();
    const dayEvents = eventsByDate.get(dateKey);

    if (dayEvents && dayEvents.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Navigate to the first event of that day
      router.push(`/event/${dayEvents[0].id}` as any);
    }
  };

  const renderDays = () => {
    const days = [];
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    // Day headers
    for (let i = 0; i < 7; i++) {
      days.push(
        <View key={`header-${i}`} className="w-[14.28%] items-center py-1">
          <Text className="text-xs font-medium" style={{ color: colors.textTertiary }}>{dayNames[i]}</Text>
        </View>
      );
    }

    // Empty cells for days before month starts
    for (let i = 0; i < startingDay; i++) {
      days.push(<View key={`empty-${i}`} className="w-[14.28%] h-9" />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const dateKey = date.toDateString();
      const dayEvents = eventsByDate.get(dateKey) ?? [];
      const hasEvents = dayEvents.length > 0;
      const isToday = today.toDateString() === dateKey;

      days.push(
        <Pressable
          key={`day-${day}`}
          onPress={() => handleDayPress(day)}
          className="w-[14.28%] h-9 items-center justify-center"
        >
          <View
            className={`w-8 h-8 rounded-full items-center justify-center ${
              isToday ? "border-2" : ""
            } ${hasEvents ? "" : ""}`}
            style={{
              borderColor: isToday ? themeColor : undefined,
              backgroundColor: hasEvents ? themeColor + "20" : undefined,
            }}
          >
            <Text
              className={`text-sm ${
                hasEvents ? "font-semibold" : "font-normal"
              }`}
              style={{ color: hasEvents ? themeColor : isToday ? themeColor : colors.text }}
            >
              {day}
            </Text>
          </View>
        </Pressable>
      );
    }

    return days;
  };

  return (
    <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
      {/* Month Header */}
      <View className="flex-row items-center justify-between mb-3">
        <Pressable onPress={goToPrevMonth} className="p-2">
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <Text className="text-base font-semibold" style={{ color: colors.text }}>
          {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
        <Pressable onPress={goToNextMonth} className="p-2">
          <ChevronRight size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Calendar Grid */}
      <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 220 }}
      >
        <View className="flex-row flex-wrap">
          {renderDays()}
        </View>
      </ScrollView>
    </View>
  );
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  // [LEGACY_ADD_TO_GROUPS_REMOVED] - modal state removed pre-launch

  // Fetch user profile data
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["userProfile", id],
    queryFn: () => api.get<{ user: FriendUser; isFriend: boolean; friendshipId: string | null; hasPendingRequest: boolean; incomingRequestId: string | null }>(`/api/profile/${id}/profile`),
    enabled: bootStatus === 'authed' && !!id,
  });

  // [LEGACY_ADD_TO_GROUPS_REMOVED] - groups query removed pre-launch

  // Fetch user's badge
  const { data: badgeData } = useQuery({
    queryKey: ["userBadge", id],
    queryFn: () => api.get<{ badge: ProfileBadge | null }>(`/api/achievements/user/${id}/badge`),
    enabled: bootStatus === 'authed' && !!id,
  });

  const userBadge = badgeData?.badge;
  const normalizedBadge = normalizeFeaturedBadge(userBadge);

  // Fetch friend events when isFriend=true (unlocked state)
  const { data: friendEventsData } = useQuery({
    queryKey: ["friendEvents", data?.friendshipId],
    queryFn: () => api.get<{ events: Event[]; friend: FriendUser }>(`/api/friends/${data?.friendshipId}`),
    enabled: bootStatus === 'authed' && !!data?.friendshipId && data.isFriend,
  });

  // Minute tick to force rerender when events pass their end time
  const minuteTick = useMinuteTick(true);

  // Filter to only show upcoming events (exclude past - event still shows if endTime not yet passed)
  const friendEvents = useMemo(() => {
    const events = friendEventsData?.events ?? [];
    const now = new Date();
    return events.filter(event => {
      // Use endTime if available, otherwise fall back to startTime
      const relevantTime = event.endTime ? new Date(event.endTime) : new Date(event.startTime);
      return relevantTime >= now;
    });
  }, [friendEventsData?.events, minuteTick]);

  // Send friend request mutation
  const sendRequestMutation = useMutation({
    mutationFn: () => api.post("/api/friends/request", { userId: id }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["userProfile", id] });
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
    },
  });

  // Accept friend request mutation
  const acceptRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.put<{ success: boolean; friendshipId?: string; friend?: { id: string; name: string | null; image: string | null } }>(`/api/friends/request/${requestId}`, { status: "accepted" }),
    onSuccess: (responseData) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["userProfile", id] });
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });

      // [LEGACY_ADD_TO_GROUPS_REMOVED] - modal trigger removed pre-launch
      if (__DEV__) console.log('[LEGACY_ADD_TO_GROUPS_REMOVED] Would have shown add-to-groups modal');
      
      // Redirect to friend profile on success
      if (responseData.friendshipId) {
        router.replace(`/friend/${responseData.friendshipId}` as any);
      }
    },
  });

  // Reject friend request mutation
  const rejectRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.put(`/api/friends/request/${requestId}`, { status: "rejected" }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["userProfile", id] });
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
    },
  });

  // [LEGACY_ADD_TO_GROUPS_REMOVED] - addFriendToGroupsMutation removed pre-launch

  const user = data?.user;
  const isFriend = data?.isFriend ?? false;
  const friendshipId = data?.friendshipId ?? null;
  const hasPendingRequest = data?.hasPendingRequest ?? false;
  const incomingRequestId = data?.incomingRequestId ?? null;

  // DO NOT auto-redirect anymore - let user stay on this screen after accepting
  // Profile will update to show unlocked state via refetch

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Profile" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: user?.name ?? "Profile",
          headerStyle: { backgroundColor: colors.background },
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={themeColor}
          />
        }
      >
        {isLoading ? (
          <View className="py-8 items-center">
            <Text style={{ color: colors.textTertiary }}>Loading...</Text>
          </View>
        ) : user ? (
          <>
            {/* User Info Card */}
            <Animated.View entering={FadeInDown.springify()} className="mb-4">
              <View className="rounded-2xl p-5 items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
                {/* INVARIANT: Badges are pill-only. No badge overlay on avatar. */}
                <View className="w-20 h-20 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                  {(user.Profile?.avatarUrl ?? user.image) ? (
                    <Image source={{ uri: (user.Profile?.avatarUrl ?? user.image)! }} className="w-full h-full" />
                  ) : (
                    <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor + "30" }}>
                      <Text className="text-3xl font-bold" style={{ color: themeColor }}>
                        {user.name?.[0] ?? user.email?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center mt-3">
                  <Text className="text-xl font-bold" style={{ color: colors.text }}>
                    {user.name ?? "No name"}
                  </Text>
                {/* INVARIANT: Badges are pill-only. No trophy icons anywhere. */}
                  {normalizedBadge && (
                    <View className="ml-2">
                      <BadgePill
                        name={normalizedBadge.name}
                        tierColor={normalizedBadge.tierColor}
                        variant="small"
                      />
                    </View>
                  )}
                </View>
                {/* @handle */}
                {user.Profile?.handle && (
                  <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                    @{user.Profile.handle}
                  </Text>
                )}

                {/* Calendar Bio */}
                <View className="flex-row items-center mt-2">
                  <Calendar size={14} color={colors.textSecondary} />
                  <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>
                    My calendar looks like...
                  </Text>
                </View>
                {user.Profile?.calendarBio ? (
                  <Text className="text-sm mt-1 text-center px-4" style={{ color: colors.text }}>
                    {user.Profile.calendarBio}
                  </Text>
                ) : (
                  <Text className="text-sm mt-1 italic" style={{ color: colors.textTertiary }}>
                    Not set yet
                  </Text>
                )}

                {/* Add Friend Button (if not already friends) */}
                {!isFriend && (
                  <>
                    {/* Incoming request - show Accept/Decline buttons */}
                    {incomingRequestId ? (
                      <View className="mt-4">
                        <Text className="text-sm text-center mb-3" style={{ color: colors.textSecondary }}>
                          {user.name?.split(" ")[0] ?? "They"} sent you a friend request
                        </Text>
                        <View className="flex-row items-center justify-center">
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              rejectRequestMutation.mutate(incomingRequestId);
                            }}
                            disabled={rejectRequestMutation.isPending}
                            className="flex-row items-center px-5 py-3 rounded-full mr-3"
                            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                          >
                            <X size={18} color={colors.textSecondary} />
                            <Text className="font-semibold ml-2" style={{ color: colors.textSecondary }}>
                              Decline
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              acceptRequestMutation.mutate(incomingRequestId);
                            }}
                            disabled={acceptRequestMutation.isPending}
                            className="flex-row items-center px-5 py-3 rounded-full"
                            style={{ backgroundColor: "#22C55E" }}
                          >
                            <Check size={18} color="#fff" />
                            <Text className="font-semibold ml-2 text-white">
                              {acceptRequestMutation.isPending ? "Accepting..." : "Accept"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      /* Outgoing request or no request - show Add Friend button */
                      <Pressable
                        onPress={() => {
                          if (!hasPendingRequest) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            sendRequestMutation.mutate();
                          }
                        }}
                        disabled={hasPendingRequest || sendRequestMutation.isPending}
                        className="mt-4 flex-row items-center px-6 py-3 rounded-full"
                        style={{
                          backgroundColor: hasPendingRequest ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor
                        }}
                      >
                        <UserPlus size={18} color={hasPendingRequest ? colors.textSecondary : "#fff"} />
                        <Text
                          className="font-semibold ml-2"
                          style={{ color: hasPendingRequest ? colors.textSecondary : "#fff" }}
                        >
                          {sendRequestMutation.isPending
                            ? "Sending..."
                            : hasPendingRequest
                              ? "Request Sent"
                              : "Add Friend"}
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            </Animated.View>

            {/* Conditional Calendar & Events Section */}
            {isFriend ? (
              <>
                {/* UNLOCKED STATE - Show friend's calendar and events */}
                <Animated.View entering={FadeInDown.delay(50).springify()}>
                  <View className="flex-row items-center mb-3">
                    <Calendar size={18} color={themeColor} />
                    <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                      {user.name?.split(" ")[0] ?? "Their"}'s Calendar
                    </Text>
                  </View>
                  <FriendCalendar events={friendEvents} themeColor={themeColor} />
                </Animated.View>

                {/* Events Section */}
                <View className="flex-row items-center mb-3">
                  <Calendar size={18} color="#4ECDC4" />
                  <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                    Open Invites ({friendEvents.length})
                  </Text>
                </View>

                {friendEvents.length === 0 ? (
                  <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
                    <Text className="text-4xl mb-3">🎉</Text>
                    <Text className="text-center" style={{ color: colors.textSecondary }}>
                      No open invites from this friend yet
                    </Text>
                  </View>
                ) : (
                  friendEvents.map((event: Event, index: number) => (
                    <EventCard key={event.id} event={event} index={index} />
                  ))
                )}
              </>
            ) : (
              <>
                {/* LOCKED STATE - Show private calendar and privacy notice */}
                <Animated.View entering={FadeInDown.delay(50).springify()}>
                  <View className="flex-row items-center mb-3">
                    <Calendar size={18} color={themeColor} />
                    <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                      {user.name?.split(" ")[0] ?? "Their"}'s Calendar
                    </Text>
                  </View>
                  <PrivateCalendar themeColor={themeColor} />
                </Animated.View>

                {/* Privacy Notice for Events */}
                <Animated.View entering={FadeInDown.delay(100).springify()}>
                  <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
                    <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                      <Shield size={28} color={colors.textTertiary} />
                    </View>
                    <Text className="text-lg font-semibold text-center mb-1" style={{ color: colors.text }}>
                      Events are Private
                    </Text>
                    <Text className="text-sm text-center mb-4" style={{ color: colors.textSecondary }}>
                      {incomingRequestId
                        ? `Accept ${user.name?.split(" ")[0] ?? "their"} request to see their open invites`
                        : `Add ${user.name?.split(" ")[0] ?? "them"} as a friend to see their open invites and events`}
                    </Text>

                    {/* Incoming request - show Accept/Decline buttons */}
                    {incomingRequestId ? (
                      <View className="flex-row items-center justify-center">
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            rejectRequestMutation.mutate(incomingRequestId);
                          }}
                          disabled={rejectRequestMutation.isPending}
                          className="flex-row items-center px-4 py-2.5 rounded-full mr-2"
                          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                        >
                          <X size={16} color={colors.textSecondary} />
                          <Text className="font-medium ml-1.5" style={{ color: colors.textSecondary }}>
                            Decline
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            acceptRequestMutation.mutate(incomingRequestId);
                          }}
                          disabled={acceptRequestMutation.isPending}
                          className="flex-row items-center px-4 py-2.5 rounded-full"
                          style={{ backgroundColor: "#22C55E" }}
                        >
                          <Check size={16} color="#fff" />
                          <Text className="font-medium ml-1.5 text-white">
                            {acceptRequestMutation.isPending ? "..." : "Accept"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : !isFriend && !hasPendingRequest ? (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          sendRequestMutation.mutate();
                        }}
                        disabled={sendRequestMutation.isPending}
                        className="flex-row items-center px-5 py-2.5 rounded-full"
                        style={{ backgroundColor: themeColor }}
                      >
                        <UserPlus size={16} color="#fff" />
                        <Text className="text-white font-medium ml-2">
                          {sendRequestMutation.isPending ? "Sending..." : "Send Friend Request"}
                        </Text>
                      </Pressable>
                    ) : hasPendingRequest ? (
                      <View className="flex-row items-center px-5 py-2.5 rounded-full" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                        <Text className="font-medium" style={{ color: colors.textSecondary }}>
                          Request Sent
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Animated.View>
              </>
            )}
          </>
        ) : (
          <View className="py-8 items-center">
            <Text style={{ color: colors.textTertiary }}>User not found</Text>
          </View>
        )}
      </ScrollView>

      {/* [LEGACY_ADD_TO_GROUPS_REMOVED] - Add to Groups Modal removed pre-launch */}
    </SafeAreaView>
  );
}
