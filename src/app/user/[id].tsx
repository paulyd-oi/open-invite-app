import React, { useState, useMemo, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Image, RefreshControl, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Calendar, ChevronRight, ChevronLeft, UserPlus, Lock, Shield, Check, X, Users, MapPin, Clock, StickyNote, ChevronDown, Plus, Trash2 } from "@/ui/icons";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useMinuteTick } from "@/lib/useMinuteTick";

import { ConfirmModal } from "@/components/ConfirmModal";
import { safeToast } from "@/lib/safeToast";
import { Button } from "@/ui/Button";
import { type FriendUser, type Event, type ReportReason } from "@/shared/contracts";
import { devLog } from "@/lib/devLog";


// MoreHorizontal icon using Ionicons
const MoreHorizontal: React.FC<{ size?: number; color?: string }> = ({ size = 24, color }) => (
  <Ionicons name="ellipsis-horizontal" size={size} color={color as any} />
);

// Friend note type
interface FriendNote {
  id: string;
  content: string;
  createdAt: string;
}

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
          // [P0_VISIBILITY] Proof log: friend event card tap (always friend-of-host)
          if (__DEV__) {
            devLog('[P0_VISIBILITY] Friend event card tap navigating:', {
              sourceSurface: 'friend-event-card',
              eventIdPrefix: event.id?.slice(0, 6),
              hostIdPrefix: event.userId?.slice(0, 6),
              isBusy: false,
              viewerFriendOfHost: true, // This card only shows friend's events
              decision: 'full_details',
              reason: 'friend_of_host',
            });
          }
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
      const firstEvent = dayEvents[0];
      // [P0_VISIBILITY] Proof log: friend calendar tap (always friend-of-host since this is their calendar)
      if (__DEV__) {
        devLog('[P0_VISIBILITY] Friend calendar tap navigating:', {
          sourceSurface: 'friend-calendar',
          eventIdPrefix: firstEvent.id?.slice(0, 6),
          hostIdPrefix: firstEvent.userId?.slice(0, 6),
          isBusy: false,
          viewerFriendOfHost: true, // This calendar only shows friend's events, viewer IS friend of host
          decision: 'full_details',
          reason: 'friend_of_host',
        });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Navigate to the first event of that day
      router.push(`/event/${firstEvent.id}` as any);
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
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  // ===== FRIEND-ONLY STATE (unlocked when isFriend=true) =====
  const [showNotesSection, setShowNotesSection] = useState(true);
  const [newNoteText, setNewNoteText] = useState("");
  const [showDeleteNoteConfirm, setShowDeleteNoteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReportReason, setSelectedReportReason] = useState<ReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Fetch user profile data
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["userProfile", id],
    queryFn: () => api.get<{ user: FriendUser; isFriend: boolean; friendshipId: string | null; hasPendingRequest: boolean; incomingRequestId: string | null }>(`/api/profile/${id}/profile`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!id,
  });

  // Extract values for easier use
  const user = data?.user;
  const isFriend = data?.isFriend ?? false;
  const friendshipId = data?.friendshipId ?? null;
  const hasPendingRequest = data?.hasPendingRequest ?? false;
  const incomingRequestId = data?.incomingRequestId ?? null;

  // [P0_PROFILE_SOT] DEV-only proof log on mount
  useEffect(() => {
    if (__DEV__ && data) {
      devLog("[P0_PROFILE_SOT]", {
        routeSource: source ?? "user/[id]",
        targetUserId: id,
        relationshipState: isFriend ? "friend" : "non-friend",
        friendshipId: friendshipId,
        gatedSections: {
          notes: isFriend,
          calendar: isFriend,
          unfriendMenu: isFriend,
        },
      });
    }
  }, [data, id, source, isFriend, friendshipId]);

  // Fetch friend events when isFriend=true (unlocked state)
  const { data: friendEventsData, refetch: refetchFriendEvents } = useQuery({
    queryKey: ["friendEvents", friendshipId],
    queryFn: () => api.get<{ events: Event[]; friend: FriendUser }>(`/api/friends/${friendshipId}/events`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!friendshipId && isFriend,
  });

  // Fetch notes for this friend (friend-only feature)
  const { data: notesData, refetch: refetchNotes } = useQuery({
    queryKey: ["friendNotes", friendshipId],
    queryFn: () => api.get<{ notes: FriendNote[] }>(`/api/friends/${friendshipId}/notes`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!friendshipId && isFriend,
  });

  const notes = notesData?.notes ?? [];

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
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Stay on this screen - refetch will update state to show friend features
      queryClient.invalidateQueries({ queryKey: ["userProfile", id] });
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      // Refetch to get the updated isFriend state
      refetch();
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

  // ===== FRIEND-ONLY MUTATIONS =====
  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<{ note: FriendNote }>(`/api/friends/${friendshipId}/notes`, { content }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewNoteText("");
      refetchNotes();
    },
    onError: (error: any) => {
      safeToast.error("Error", error?.message || "Failed to add note");
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api.delete(`/api/friends/${friendshipId}/notes/${noteId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchNotes();
    },
    onError: (error: any) => {
      safeToast.error("Error", error?.message || "Failed to delete note");
    },
  });

  // Unfriend mutation
  const unfriendMutation = useMutation({
    mutationFn: () => api.delete(`/api/friends/${friendshipId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Unfriended", `You and ${user?.name ?? "this user"} are no longer friends`);
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile", id] });
      // Navigate back to friends list
      router.replace("/friends" as any);
    },
    onError: () => {
      safeToast.error("Error", "Failed to unfriend");
    },
  });

  // ===== FRIEND-ONLY HANDLERS =====
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
    if (!selectedReportReason || !id) return;
    setIsSubmittingReport(true);
    try {
      await api.post('/api/reports/user', {
        reportedUserId: id,
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

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Profile" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in to view profiles</Text>
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
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          // Show menu button only for friends (SSOT: friend features gated by relationship)
          headerRight: isFriend ? () => (
            <Pressable
              onPress={handleMenuPress}
              className="w-8 h-8 rounded-full items-center justify-center mr-1"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MoreHorizontal size={18} color={colors.textSecondary} />
            </Pressable>
          ) : undefined,
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
                          <Button
                            variant="secondary"
                            label="Decline"
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              rejectRequestMutation.mutate(incomingRequestId);
                            }}
                            disabled={rejectRequestMutation.isPending}
                            loading={rejectRequestMutation.isPending}
                            leftIcon={!rejectRequestMutation.isPending ? <X size={18} color={colors.textSecondary} /> : undefined}
                            style={{ marginRight: 12 }}
                          />
                          <Button
                            variant="success"
                            label={acceptRequestMutation.isPending ? "Accepting..." : "Accept"}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              acceptRequestMutation.mutate(incomingRequestId);
                            }}
                            disabled={acceptRequestMutation.isPending}
                            loading={acceptRequestMutation.isPending}
                            leftIcon={!acceptRequestMutation.isPending ? <Check size={18} color="#fff" /> : undefined}
                          />
                        </View>
                      </View>
                    ) : (
                      /* Outgoing request or no request - show Add Friend button */
                      <Button
                        variant={hasPendingRequest ? "secondary" : "primary"}
                        label={
                          sendRequestMutation.isPending
                            ? "Sending..."
                            : hasPendingRequest
                              ? "Request Sent"
                              : "Add Friend"
                        }
                        onPress={() => {
                          if (!hasPendingRequest) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            sendRequestMutation.mutate();
                          }
                        }}
                        disabled={hasPendingRequest || sendRequestMutation.isPending}
                        loading={sendRequestMutation.isPending}
                        leftIcon={
                          !sendRequestMutation.isPending
                            ? <UserPlus size={18} color={hasPendingRequest ? colors.textSecondary : "#fff"} />
                            : undefined
                        }
                        style={{ marginTop: 16 }}
                      />
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

                {/* Notes Section (FRIEND-ONLY SSOT FEATURE) */}
                <Animated.View entering={FadeInDown.delay(100).springify()} className="mb-4 mt-4">
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
                        <Button
                          variant="secondary"
                          size="sm"
                          label="Decline"
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            rejectRequestMutation.mutate(incomingRequestId);
                          }}
                          disabled={rejectRequestMutation.isPending}
                          loading={rejectRequestMutation.isPending}
                          leftIcon={!rejectRequestMutation.isPending ? <X size={16} color={colors.textSecondary} /> : undefined}
                          style={{ marginRight: 8 }}
                        />
                        <Button
                          variant="success"
                          size="sm"
                          label={acceptRequestMutation.isPending ? "..." : "Accept"}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            acceptRequestMutation.mutate(incomingRequestId);
                          }}
                          disabled={acceptRequestMutation.isPending}
                          loading={acceptRequestMutation.isPending}
                          leftIcon={!acceptRequestMutation.isPending ? <Check size={16} color="#fff" /> : undefined}
                        />
                      </View>
                    ) : !isFriend && !hasPendingRequest ? (
                      <Button
                        variant="primary"
                        size="sm"
                        label={sendRequestMutation.isPending ? "Sending..." : "Send Friend Request"}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          sendRequestMutation.mutate();
                        }}
                        disabled={sendRequestMutation.isPending}
                        loading={sendRequestMutation.isPending}
                        leftIcon={!sendRequestMutation.isPending ? <UserPlus size={16} color="#fff" /> : undefined}
                      />
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

      {/* ===== FRIEND-ONLY MODALS (SSOT: gated by isFriend) ===== */}
      
      {/* Delete Note Confirmation Modal */}
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

      {/* Menu Modal (friend-only) */}
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
            
            <Button
              variant="secondary"
              label="Cancel"
              onPress={() => setShowMenuModal(false)}
              style={{ marginTop: 16 }}
            />
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
              <Button
                variant="secondary"
                label="Cancel"
                onPress={() => {
                  setShowReportModal(false);
                  setSelectedReportReason(null);
                  setReportDetails('');
                }}
                style={{ flex: 1, borderRadius: 12 }}
              />
              
              <Button
                variant="primary"
                label={isSubmittingReport ? 'Submitting...' : 'Submit Report'}
                onPress={submitReport}
                disabled={!selectedReportReason || isSubmittingReport}
                loading={isSubmittingReport}
                style={{ flex: 1, borderRadius: 12 }}
              />
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
