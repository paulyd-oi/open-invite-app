import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Image, RefreshControl, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MapPin, Clock, Calendar, ChevronRight, ChevronLeft, Plus, StickyNote, ChevronDown, Trash2 } from "@/ui/icons";

// Define the MoreHorizontal icon inline using Ionicons
import { Ionicons } from "@expo/vector-icons";
const MoreHorizontal: React.FC<{ size?: number; color?: string }> = ({ size = 24, color }) => (
  <Ionicons name="ellipsis-horizontal" size={size} color={color as any} />
);
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { type GetFriendEventsResponse, type Event, type ProfileBadge, type ReportReason } from "@/shared/contracts";
import { groupEventsIntoSeries, type EventSeries } from "@/lib/recurringEventsGrouping";
import { normalizeFeaturedBadge } from "@/lib/normalizeBadge";

// ========================================
// MASKED BUSY BLOCK HANDLING
// Backend sends masked busy blocks for circle events friend cannot see:
// { id: "busy_<cuid>", startAt, endAt, isBusy: true }
// We render these as grey blocks, no navigation on tap
// ========================================

/** Type guard for masked busy blocks from backend */
function isMaskedBusy(item: any): item is { id: string; startAt?: string; startTime?: string; endAt?: string; endTime?: string; isBusy: true } {
  return item && item.isBusy === true && !item.title;
}

/** Normalize backend busy item to frontend Event shape */
function normalizeBusyItem(item: any): Event {
  return {
    ...item,
    // Map startAt→startTime, endAt→endTime if needed
    startTime: item.startTime ?? item.startAt,
    endTime: item.endTime ?? item.endAt ?? null,
    // Provide placeholder values for required Event fields
    title: "Busy",
    emoji: "",
    description: null,
    location: null,
    isRecurring: false,
    recurrence: null,
    visibility: "private",
    userId: "",
    createdAt: item.createdAt ?? new Date().toISOString(),
    updatedAt: item.updatedAt ?? new Date().toISOString(),
  };
}

/** Process events array, normalizing masked busy items */
function normalizeEventsWithBusy(rawEvents: any[]): Event[] {
  return rawEvents.map((item) =>
    isMaskedBusy(item) ? normalizeBusyItem(item) : item
  );
}

interface FriendNote {
  id: string;
  content: string;
  createdAt: string;
}

function EventCard({ event, index }: { event: Event | EventSeries; index: number }) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  
  // Check if this is a series or single event
  const isSeries = 'nextEvent' in event;
  const displayEvent = isSeries ? event.nextEvent : event;
  const startDate = new Date(displayEvent.startTime);
  const endDate = displayEvent.endTime ? new Date(displayEvent.endTime) : null;
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
          router.push(`/event/${displayEvent.id}` as any);
        }}
        className="rounded-2xl p-4 mb-3"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View className="flex-row items-start">
          <View className="w-12 h-12 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: themeColor + "20" }}>
            <Text className="text-xl">{isSeries ? event.emoji : displayEvent.emoji}</Text>
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text className="text-lg font-semibold flex-1" style={{ color: colors.text }} numberOfLines={1}>
                {isSeries ? event.title : displayEvent.title}
              </Text>
              {isSeries && (
                <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: `${themeColor}20` }}>
                  <Text style={{ color: themeColor }} className="text-xs font-medium">Weekly</Text>
                </View>
              )}
            </View>
            {isSeries ? (
              <>
                <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                  Next: {dateLabel} at {timeLabel}
                </Text>
                {event.occurrenceCount > 1 && (
                  <Text className="text-sm mt-0.5 font-medium" style={{ color: themeColor }}>
                    +{event.occurrenceCount - 1} more
                  </Text>
                )}
              </>
            ) : (
              <View className="flex-row items-center mt-1">
                <Clock size={14} color={themeColor} />
                <Text className="text-sm ml-1" style={{ color: colors.textSecondary }}>
                  {dateLabel} at {timeLabel}
                </Text>
              </View>
            )}
          </View>
          <ChevronRight size={20} color={colors.textTertiary} />
        </View>

        {!isSeries && displayEvent.location && (
          <View className="flex-row items-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
            <MapPin size={14} color="#4ECDC4" />
            <Text className="text-sm ml-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
              {displayEvent.location}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// Mini Calendar Component
function FriendCalendar({ events, themeColor }: { events: Event[]; themeColor: string }) {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Busy block grey color (consistent with main calendar)
  const busyColor = isDark ? "#6B6B6B" : "#9CA3AF";

  // Get events by date for quick lookup, separating busy vs regular
  const { eventsByDate, busyByDate } = useMemo(() => {
    const eventMap = new Map<string, Event[]>();
    const busyMap = new Map<string, Event[]>();
    events.forEach((event) => {
      const dateKey = new Date(event.startTime).toDateString();
      if (event.isBusy) {
        if (!busyMap.has(dateKey)) busyMap.set(dateKey, []);
        busyMap.get(dateKey)!.push(event);
      } else {
        if (!eventMap.has(dateKey)) eventMap.set(dateKey, []);
        eventMap.get(dateKey)!.push(event);
      }
    });
    return { eventsByDate: eventMap, busyByDate: busyMap };
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
    const dayBusy = busyByDate.get(dateKey);

    // Navigate only if there are actual events (not just busy blocks)
    if (dayEvents && dayEvents.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Navigate to the first event of that day
      router.push(`/event/${dayEvents[0].id}` as any);
    } else if (dayBusy && dayBusy.length > 0) {
      // Busy-only day: just haptic feedback, no navigation
      Haptics.selectionAsync();
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
      const dayBusy = busyByDate.get(dateKey) ?? [];
      const hasEvents = dayEvents.length > 0;
      const hasBusy = dayBusy.length > 0;
      const isToday = today.toDateString() === dateKey;

      // Determine cell color: events take priority (themeColor), then busy (grey)
      const cellColor = hasEvents ? themeColor : hasBusy ? busyColor : null;
      const hasAnything = hasEvents || hasBusy;

      days.push(
        <Pressable
          key={`day-${day}`}
          onPress={() => handleDayPress(day)}
          className="w-[14.28%] h-9 items-center justify-center"
        >
          <View
            className={`w-8 h-8 rounded-full items-center justify-center ${
              isToday ? "border-2" : ""
            }`}
            style={{
              borderColor: isToday ? themeColor : undefined,
              backgroundColor: cellColor ? cellColor + "20" : undefined,
            }}
          >
            <Text
              className={`text-sm ${
                hasAnything ? "font-semibold" : "font-normal"
              }`}
              style={{ color: hasEvents ? themeColor : hasBusy ? busyColor : isToday ? themeColor : colors.text }}
            >
              {day}
            </Text>
          </View>
          {hasAnything && (
            <View className="absolute bottom-0 flex-row">
              {/* Show event dots first, then busy dots */}
              {dayEvents.slice(0, 3).map((_, idx) => (
                <View
                  key={`e-${idx}`}
                  className="w-1 h-1 rounded-full mx-px"
                  style={{ backgroundColor: themeColor }}
                />
              ))}
              {dayBusy.slice(0, Math.max(0, 3 - dayEvents.length)).map((_, idx) => (
                <View
                  key={`b-${idx}`}
                  className="w-1 h-1 rounded-full mx-px"
                  style={{ backgroundColor: busyColor }}
                />
              ))}
            </View>
          )}
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

      {/* Legend */}
      <View className="flex-row items-center justify-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
        <View className="flex-row items-center mr-4">
          <View className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: themeColor }} />
          <Text className="text-xs" style={{ color: colors.textSecondary }}>Has events</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: busyColor }} />
          <Text className="text-xs" style={{ color: colors.textSecondary }}>Busy</Text>
        </View>
      </View>
    </View>
  );
}

export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  // [LEGACY_ADD_TO_GROUPS_MODAL_REMOVED] State removed - modal fully deleted
  const [showNotesSection, setShowNotesSection] = useState(true);
  const [newNoteText, setNewNoteText] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["friendEvents", id],
    queryFn: () => api.get<GetFriendEventsResponse>(`/api/friends/${id}/events`),
    enabled: bootStatus === 'authed' && !!id,
  });

  // [LEGACY_GROUPS_PURGED] friendsData/groupsData queries removed - no longer needed

  // Fetch notes for this friend
  const { data: notesData, refetch: refetchNotes } = useQuery({
    queryKey: ["friendNotes", id],
    queryFn: () => api.get<{ notes: FriendNote[] }>(`/api/friends/${id}/notes`),
    enabled: bootStatus === 'authed' && !!id,
  });

  // Fetch the friend's userId from the friendship to get their badge (fallback)
  const friendUserId = data?.friend?.id;

  // Fetch friend's badge (fallback if not embedded in friend data)
  const { data: badgeData } = useQuery({
    queryKey: ["userBadge", friendUserId],
    queryFn: () => api.get<{ badge: ProfileBadge | null }>(`/api/achievements/user/${friendUserId}/badge`),
    // Only fetch if friend doesn't have embedded featuredBadge
    enabled: bootStatus === 'authed' && !!friendUserId && !data?.friend?.featuredBadge,
  });

  // Use embedded featuredBadge if available, otherwise fallback to separate badge query
  const rawFriendBadge = data?.friend?.featuredBadge ?? badgeData?.badge;
  const friendBadge = normalizeFeaturedBadge(rawFriendBadge);
  if (__DEV__ && data?.friend) {
    console.log("[FRIEND_BADGE_DATA]", {
      friendId: friendUserId,
      hasFeaturedBadge: !!friendBadge,
      featuredBadge: friendBadge?.name ?? null,
      sourceEndpoint: data.friend.featuredBadge ? "/api/friends/:id/events" : "/api/achievements/user/:id/badge",
    });
    console.log("[FRIEND_BADGE_RENDER]", {
      friendId: friendUserId,
      render: !!friendBadge,
      reason: friendBadge ? "badge_present" : "no_badge_in_response",
    });
  }

  const notes = notesData?.notes ?? [];

  // State for delete confirmation
  const [showDeleteNoteConfirm, setShowDeleteNoteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  // State for unfriend confirmation
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReportReason, setSelectedReportReason] = useState<ReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<{ note: FriendNote }>(`/api/friends/${id}/notes`, { content }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewNoteText("");
      refetchNotes();
    },
    onError: (error: any) => {
      // Enhanced error logging for diagnostics
      console.log("[FriendNotes] Add note FAILED:", {
        friendId: id,
        httpStatus: error?.status,
        statusText: error?.statusText,
        message: error?.message,
        responseBody: error?.body ? JSON.stringify(error.body).slice(0, 500) : undefined,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2)?.slice(0, 800),
      });
      safeToast.error("Error", error?.message || "Failed to add note");
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api.delete(`/api/friends/${id}/notes/${noteId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchNotes();
    },
    onError: (error: any) => {
      // Enhanced error logging for diagnostics
      console.log("[FriendNotes] Delete note FAILED:", {
        friendId: id,
        httpStatus: error?.status,
        message: error?.message,
        responseBody: error?.body ? JSON.stringify(error.body).slice(0, 500) : undefined,
      });
      safeToast.error("Error", error?.message || "Failed to delete note");
    },
  });

  // Unfriend mutation
  const unfriendMutation = useMutation({
    mutationFn: () => api.delete(`/api/friends/${id}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Unfriended", `You and ${friend?.name ?? "this user"} are no longer friends`);
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      // Navigate back to friends list
      router.replace("/friends" as any);
    },
    onError: () => {
      safeToast.error("Error", "Failed to unfriend");
    },
  });

  const handleAddNote = () => {
    if (newNoteText.trim().length === 0) return;
    addNoteMutation.mutate(newNoteText.trim());
  };

  const handleDeleteNote = (noteId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setNoteToDelete(noteId);
    setShowDeleteNoteConfirm(true);
  };

  const confirmDeleteNote = () => {
    if (noteToDelete) {
      deleteNoteMutation.mutate(noteToDelete);
    }
    setShowDeleteNoteConfirm(false);
    setNoteToDelete(null);
  };

  const handleMenuPress = () => {
    Haptics.selectionAsync();
    setShowMenuModal(true);
  };

  const handleUnfriend = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowMenuModal(false);
    setShowUnfriendConfirm(true);
  };

  const handleReportUser = () => {
    Haptics.selectionAsync();
    setShowMenuModal(false);
    setShowReportModal(true);
  };

  const submitReport = async () => {
    if (!selectedReportReason || !friend?.id) return;
    setIsSubmittingReport(true);
    try {
      await api.post('/api/reports/user', {
        reportedUserId: friend.id,
        reason: selectedReportReason,
        details: selectedReportReason === 'other' ? reportDetails.trim() || undefined : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success('Report submitted', 'Thanks — we received your report.');
      setShowReportModal(false);
      setSelectedReportReason(null);
      setReportDetails('');
    } catch (error) {
      safeToast.error('Error', "Couldn't submit report. Please try again.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const confirmUnfriend = () => {
    unfriendMutation.mutate();
    setShowUnfriendConfirm(false);
  };

  // [LEGACY_GROUPS_PURGED] friendship and groups variables removed - no longer needed

  const friend = data?.friend;
  // Normalize events to handle masked busy blocks from backend
  const events = useMemo(() => {
    return normalizeEventsWithBusy(data?.events ?? []);
  }, [data?.events]);
  
  // Group recurring events into series (filter out busy blocks first)
  const eventSeries = useMemo(() => {
    const nonBusyEvents = events.filter((e) => !e.isBusy);
    return groupEventsIntoSeries(nonBusyEvents);
  }, [events]);

  // [LEGACY_ADD_TO_GROUPS_MODAL_REMOVED] Mutations/helpers deleted - modal fully removed

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Friend" }} />
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
          title: friend?.name ?? "Friend",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          headerRight: () => (
            <Pressable
              onPress={handleMenuPress}
              className="w-8 h-8 rounded-full items-center justify-center mr-1"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MoreHorizontal size={18} color={colors.textSecondary} />
            </Pressable>
          ),
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
        {/* Friend Info */}
        {friend && (
          <Animated.View entering={FadeInDown.springify()} className="mb-4">
            <View className="rounded-2xl p-5 items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
              {/* INVARIANT: Badges are pill-only. Never render badge icons on avatars. */}
              <View className="w-20 h-20 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                {(friend.Profile?.avatarUrl ?? friend.image) ? (
                  <Image source={{ uri: (friend.Profile?.avatarUrl ?? friend.image)! }} className="w-full h-full" />
                ) : (
                  <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor + "30" }}>
                    <Text className="text-3xl font-bold" style={{ color: themeColor }}>
                      {friend.name?.[0] ?? friend.email?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center mt-3">
                <Text className="text-xl font-bold" style={{ color: colors.text }}>
                  {friend.name ?? "No name"}
                </Text>
                {/* INVARIANT: Badges are pill-only. Badge displayed as text pill, no icon. */}
                {friendBadge && (
                  <View
                    className="ml-2 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: friendBadge.tierColor + "20" }}
                  >
                    <Text className="text-xs font-medium" style={{ color: friendBadge.tierColor }}>
                      {friendBadge.name}
                    </Text>
                  </View>
                )}
              </View>
              {/* @handle */}
              {friend.Profile?.handle && (
                <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                  @{friend.Profile.handle}
                </Text>
              )}
              {/* Bio (if present) */}
              {friend.Profile?.bio && (
                <Text className="text-sm mt-2 text-center px-4" style={{ color: colors.text }}>
                  {friend.Profile.bio}
                </Text>
              )}
              <View className="flex-row items-center mt-2">
                <Calendar size={14} color={colors.textSecondary} />
                <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>
                  My calendar looks like...
                </Text>
              </View>
              {friend.Profile?.calendarBio ? (
                <Text className="text-sm mt-1 text-center px-4" style={{ color: colors.text }}>
                  {friend.Profile.calendarBio}
                </Text>
              ) : (
                <Text className="text-sm mt-1 italic" style={{ color: colors.textTertiary }}>
                  Not set yet
                </Text>
              )}
            </View>
          </Animated.View>
        )}

        {/* Friend's Calendar */}
        <Animated.View entering={FadeInDown.delay(15).springify()} className="mb-4">
          <View className="flex-row items-center mb-3">
            <Calendar size={18} color={themeColor} />
            <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
              {friend?.name?.split(" ")[0] ?? "Friend"}'s Calendar
            </Text>
          </View>
          <FriendCalendar events={events} themeColor={themeColor} />
        </Animated.View>

        {/* [LEGACY_GROUPS_PURGED] Groups Together section fully removed */}

        {/* Notes to Remember Section */}
        <Animated.View entering={FadeInDown.delay(50).springify()} className="mb-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowNotesSection(!showNotesSection);
            }}
            className="flex-row items-center justify-between mb-3"
          >
            <View className="flex-row items-center">
              <StickyNote size={18} color="#F59E0B" />
              <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                Notes to Remember
              </Text>
              {notes.length > 0 && (
                <View
                  className="ml-2 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "#F59E0B20" }}
                >
                  <Text className="text-xs font-medium" style={{ color: "#F59E0B" }}>
                    {notes.length}
                  </Text>
                </View>
              )}
            </View>
            <ChevronDown
              size={18}
              color={colors.textTertiary}
              style={{ transform: [{ rotate: showNotesSection ? "0deg" : "-90deg" }] }}
            />
          </Pressable>

          {showNotesSection && (
            <View
              className="rounded-2xl p-4"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
            >
              <Text className="text-xs mb-3" style={{ color: colors.textTertiary }}>
                Private notes only you can see
              </Text>

              {/* Add new note input */}
              <View className="flex-row items-center mb-3">
                <TextInput
                  value={newNoteText}
                  onChangeText={setNewNoteText}
                  placeholder="Add a note about this friend..."
                  placeholderTextColor={colors.textTertiary}
                  className="flex-1 rounded-xl px-4 py-3 mr-2"
                  style={{
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                    color: colors.text,
                  }}
                  onSubmitEditing={handleAddNote}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={handleAddNote}
                  disabled={newNoteText.trim().length === 0 || addNoteMutation.isPending}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: newNoteText.trim().length > 0 ? themeColor : (isDark ? "#2C2C2E" : "#E5E7EB"),
                    opacity: addNoteMutation.isPending ? 0.5 : 1,
                  }}
                >
                  <Plus size={20} color={newNoteText.trim().length > 0 ? "#fff" : colors.textTertiary} />
                </Pressable>
              </View>

              {/* Notes list */}
              {notes.length === 0 ? (
                <View className="py-4 items-center">
                  <Text className="text-sm" style={{ color: colors.textTertiary }}>
                    No notes yet. Add one above!
                  </Text>
                </View>
              ) : (
                <View>
                  {notes.map((note, index) => (
                    <View
                      key={note.id}
                      className="flex-row items-start py-2"
                      style={{
                        borderTopWidth: index > 0 ? 1 : 0,
                        borderTopColor: colors.separator,
                      }}
                    >
                      <Text className="mr-2 mt-0.5" style={{ color: "#F59E0B" }}>
                        •
                      </Text>
                      <Text className="flex-1 text-sm" style={{ color: colors.text }}>
                        {note.content}
                      </Text>
                      <Pressable
                        onPress={() => handleDeleteNote(note.id)}
                        className="ml-2 p-1"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={14} color={colors.textTertiary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </Animated.View>

        {/* Events Section */}
        <View className="flex-row items-center mb-3">
          <Calendar size={18} color="#4ECDC4" />
          <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
            Open Invites ({eventSeries.length})
          </Text>
        </View>

        {isLoading ? (
          <View className="py-8 items-center">
            <Text style={{ color: colors.textTertiary }}>Loading events...</Text>
          </View>
        ) : eventSeries.length === 0 ? (
          <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
            <Text className="text-4xl mb-3">🎉</Text>
            <Text className="text-center" style={{ color: colors.textSecondary }}>
              No open invites from this friend yet
            </Text>
          </View>
        ) : (
          eventSeries.map((item, index) => {
            const key = 'nextEvent' in item ? item.seriesKey : (item as Event).id;
            return <EventCard key={key} event={item} index={index} />;
          })
        )}
      </ScrollView>

      {/* [LEGACY_ADD_TO_GROUPS_MODAL_REMOVED] Modal fully deleted */}

      <ConfirmModal
        visible={showDeleteNoteConfirm}
        title="Delete Note"
        message="Are you sure you want to delete this note?"
        confirmText="Delete"
        isDestructive
        onConfirm={confirmDeleteNote}
        onCancel={() => {
          setShowDeleteNoteConfirm(false);
          setNoteToDelete(null);
        }}
      />

      {/* Menu Modal */}
      <Modal
        visible={showMenuModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <Pressable 
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setShowMenuModal(false)}
        >
          <View 
            className="rounded-t-3xl p-6 pb-10"
            style={{ backgroundColor: colors.background }}
          >
            <Text className="text-lg font-bold mb-4" style={{ color: colors.text }}>
              Options
            </Text>
            
            <Pressable
              className="flex-row items-center py-4 border-b"
              style={{ borderColor: colors.border }}
              onPress={handleReportUser}
            >
              <Ionicons name="flag-outline" size={22} color={colors.text} />
              <Text className="ml-3 text-base" style={{ color: colors.text }}>
                Report User
              </Text>
            </Pressable>
            
            <Pressable
              className="flex-row items-center py-4"
              onPress={handleUnfriend}
            >
              <Ionicons name="person-remove-outline" size={22} color="#EF4444" />
              <Text className="ml-3 text-base" style={{ color: '#EF4444' }}>
                Unfriend
              </Text>
            </Pressable>
            
            <Pressable
              className="mt-4 py-4 rounded-xl items-center"
              style={{ backgroundColor: colors.surface }}
              onPress={() => setShowMenuModal(false)}
            >
              <Text className="text-base font-medium" style={{ color: colors.textSecondary }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Report User Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReportModal(false)}
      >
        <Pressable 
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setShowReportModal(false)}
        >
          <Pressable 
            className="rounded-t-3xl p-6 pb-10"
            style={{ backgroundColor: colors.background }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-xl font-bold mb-2" style={{ color: colors.text }}>
              Report User
            </Text>
            <Text className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              Select a reason for your report
            </Text>
            
            {(['spam', 'harassment', 'impersonation', 'inappropriate_content', 'other'] as const).map((reason) => {
              const labels: Record<typeof reason, string> = {
                spam: 'Spam',
                harassment: 'Harassment',
                impersonation: 'Impersonation',
                inappropriate_content: 'Inappropriate Content',
                other: 'Other',
              };
              const isSelected = selectedReportReason === reason;
              return (
                <Pressable
                  key={reason}
                  className="flex-row items-center py-3 px-4 rounded-xl mb-2"
                  style={{ 
                    backgroundColor: isSelected ? themeColor + '20' : colors.surface,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? themeColor : colors.border,
                  }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedReportReason(reason);
                  }}
                >
                  <View 
                    className="w-5 h-5 rounded-full border-2 mr-3 items-center justify-center"
                    style={{ borderColor: isSelected ? themeColor : colors.border }}
                  >
                    {isSelected && (
                      <View 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: themeColor }}
                      />
                    )}
                  </View>
                  <Text style={{ color: colors.text }}>{labels[reason]}</Text>
                </Pressable>
              );
            })}
            
            {selectedReportReason === 'other' && (
              <TextInput
                className="rounded-xl p-4 mt-2"
                style={{ 
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.text,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
                placeholder="Please describe the issue..."
                placeholderTextColor={colors.textTertiary}
                multiline
                value={reportDetails}
                onChangeText={setReportDetails}
              />
            )}
            
            <View className="flex-row mt-4 gap-3">
              <Pressable
                className="flex-1 py-4 rounded-xl items-center"
                style={{ backgroundColor: colors.surface }}
                onPress={() => {
                  setShowReportModal(false);
                  setSelectedReportReason(null);
                  setReportDetails('');
                }}
              >
                <Text className="text-base font-medium" style={{ color: colors.textSecondary }}>
                  Cancel
                </Text>
              </Pressable>
              
              <Pressable
                className="flex-1 py-4 rounded-xl items-center"
                style={{ 
                  backgroundColor: selectedReportReason ? themeColor : colors.surface,
                  opacity: selectedReportReason ? 1 : 0.5,
                }}
                onPress={submitReport}
                disabled={!selectedReportReason || isSubmittingReport}
              >
                <Text className="text-base font-medium" style={{ color: selectedReportReason ? '#FFFFFF' : colors.textSecondary }}>
                  {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Unfriend Confirmation Modal */}
      <ConfirmModal
        visible={showUnfriendConfirm}
        title="Unfriend?"
        message="You'll be removed from each other's friends list. You can add them again later."
        confirmText="Unfriend"
        isDestructive
        onConfirm={confirmUnfriend}
        onCancel={() => setShowUnfriendConfirm(false)}
      />
    </SafeAreaView>
  );
}
