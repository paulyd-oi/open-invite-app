import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Calendar, Clock, ChevronDown, ChevronUp, Check, Users, Sparkles } from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSession } from "@/lib/useSession";
import { EntityAvatar } from "@/components/EntityAvatar";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, canViewWhosFree, type PaywallContext } from "@/lib/entitlements";
import { devLog, devError } from "@/lib/devLog";
import { Button } from "@/ui/Button";
import { computeSchedule } from "@/lib/scheduling/engine";
import type { BusyWindow } from "@/lib/scheduling/types";
import { formatSlotAvailability } from "@/lib/scheduling/format";
import { buildWorkScheduleBusyWindows, type WorkScheduleDay } from "@/lib/scheduling/workScheduleAdapter";
import { useWorkSkipDays } from "@/lib/workSkipDays";
import AsyncStorage from "@react-native-async-storage/async-storage";

// P0 FIX: Parse YYYY-MM-DD as local date (avoids UTC timezone shift)
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// P0 FIX: Format date as YYYY-MM-DD in local timezone
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// [P1_WHOSFREE] Hard caps — prevent exploding list renders
const MAX_SUGGESTED_SLOTS = 25;
const MAX_EXPANDED_SLOTS = 50;

// [P1_WHOSFREE] Format hour (0-24) to readable AM/PM string
function formatHourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

interface TimeSlot {
  start: string;
  end: string;
  availableFriends: Array<{
    id: string;
    name: string | null;
    image: string | null;
  }>;
  totalAvailable: number;
  totalMembers: number;
}

interface Friendship {
  id: string;
  friendId: string;
  friend: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
}

interface GetFriendsResponse {
  friends: Friendship[];
}

export default function WhosFreeScreen() {
  const { date, source } = useLocalSearchParams<{ date: string; source?: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, colors } = useTheme();

  // [P0_FIND_BEST_TIME_SSOT] When launched from create, return picked time instead of pushing
  const isFromCreate = source === "create";
  
  // P0 FIX: Initialize selectedDate from param using local-safe parsing
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date; // Use param directly (already YYYY-MM-DD)
    }
    return formatLocalDate(new Date()); // Default to today in local timezone
  });

  // Paywall state for horizon gating
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("WHOS_FREE_HORIZON");

  // Fetch entitlements for gating
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements();

  // Find Best Time state
  const [bestTimeFriendIds, setBestTimeFriendIds] = useState<string[]>([]);
  const [showAllSlots, setShowAllSlots] = useState(false);
  
  // [P1_WHOSFREE] Single-day picker (replaces start/end range)
  const [pickerDate, setPickerDate] = useState<Date>(() => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return parseLocalDate(date);
    }
    return new Date();
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  // [P1_WHOSFREE] Time window — default 7 AM to 10 PM (reasonable hours)
  const [timeWindowStart, setTimeWindowStart] = useState(7);
  const [timeWindowEnd, setTimeWindowEnd] = useState(22);

  // [P1_WHOSFREE] Expandable slot index — which slot is expanded to show who's free/busy
  const [expandedSlotIndex, setExpandedSlotIndex] = useState<number | null>(null);

  // [P1_WHOSFREE] DEV proof log on mount
  React.useEffect(() => {
    if (__DEV__) {
      devLog('[P1_WHOSFREE] mount', {
        routeDateParam: date ?? null,
        pickerDate: formatLocalDate(pickerDate),
        timeWindow: `${timeWindowStart}:00–${timeWindowEnd}:00`,
        selectedDate,
      });
    }
  }, []);

  // Fetch friends for Find Best Time
  const { data: allFriendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const allFriends = allFriendsData?.friends ?? [];

  // [P0_WORK_HOURS_BLOCK] Fetch current user's work schedule for busy-block SSOT
  const { data: workScheduleData } = useQuery({
    queryKey: ["workSchedule"],
    queryFn: () => api.get<{ schedules: WorkScheduleDay[] }>("/api/work-schedule"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });
  const workSchedules = workScheduleData?.schedules ?? [];
  const { skipKeys: workSkipKeys } = useWorkSkipDays();

  // [P1_WHOSFREE] Fetch each selected friend's events for client-side scheduling
  const {
    data: friendEventsData,
    isLoading: isLoadingFriendEvents,
    isError: isFriendEventsError,
    error: friendEventsError,
  } = useQuery({
    queryKey: ["best-time-friend-events", bestTimeFriendIds],
    enabled: isAuthedForNetwork(bootStatus, session) && bestTimeFriendIds.length > 0 && allFriends.length > 0,
    queryFn: async () => {
      if (__DEV__) {
        devLog("[P1_WHOSFREE] query_firing", {
          friendIds: bestTimeFriendIds,
          date: formatLocalDate(pickerDate),
          timeWindow: `${timeWindowStart}–${timeWindowEnd}`,
        });
      }

      const results: Array<{ userId: string; events: Array<{ startTime: string; endTime: string | null; isBusy?: boolean; isWork?: boolean }> }> = [];

      // Include the current user as a "member"
      if (session?.user?.id) {
        try {
          const myRes = await api.get<{ createdEvents: any[]; goingEvents: any[] }>("/api/events/calendar");
          const myEvents = [
            ...(myRes.createdEvents ?? []),
            ...(myRes.goingEvents ?? []),
          ].map((e) => ({ startTime: e.startTime, endTime: e.endTime, isBusy: e.isBusy }));
          results.push({ userId: session.user.id, events: myEvents });
        } catch (err) {
          if (__DEV__) devError("[P1_WHOSFREE] current_user_calendar_error", err);
          // Treat current user as fully free if calendar fetch fails
          results.push({ userId: session.user.id, events: [] });
        }
      }

      // Fetch each friend's events
      for (const friendId of bestTimeFriendIds) {
        const friendship = allFriends.find((f) => f.friendId === friendId);
        if (!friendship) {
          if (__DEV__) devLog("[P1_WHOSFREE] friendship_not_found", { friendId: friendId.slice(0, 8) });
          continue;
        }
        try {
          const res = await api.get<{ events: any[] }>(`/api/friends/${friendship.id}/events`);
          results.push({
            userId: friendId,
            events: (res.events ?? []).map((e: any) => ({
              startTime: e.startTime,
              endTime: e.endTime,
              isBusy: e.isBusy,
              isWork: e.isWork,
            })),
          });
        } catch {
          // Friend events unavailable — treat as fully free
          results.push({ userId: friendId, events: [] });
        }
      }

      if (__DEV__) {
        devLog("[P1_WHOSFREE] query_response", {
          memberCount: results.length,
          eventCounts: results.map(r => ({ id: r.userId.slice(0, 6), events: r.events.length })),
        });
      }

      return results;
    },
  });

  // [P1_WHOSFREE] Client-side scheduling engine — single-day + time-window filter
  const { suggestedSlots, isLoadingSuggestions } = useMemo(() => {
    if (!friendEventsData || friendEventsData.length === 0) {
      return { suggestedSlots: [] as TimeSlot[], isLoadingSuggestions: isLoadingFriendEvents };
    }

    // [P1_WHOSFREE] Single-day range: pickerDate 00:00 → pickerDate+1 00:00
    const dayStart = new Date(pickerDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const rangeStart = dayStart.toISOString();
    const rangeEnd = dayEnd.toISOString();

    // Build busy windows for all members (current user + selected friends)
    const allMemberIds: string[] = [];
    const busyWindowsByUserId: Record<string, BusyWindow[]> = {};

    for (const member of friendEventsData) {
      allMemberIds.push(member.userId);
      const windows: BusyWindow[] = [];
      for (const evt of member.events) {
        const sMs = new Date(evt.startTime).getTime();
        if (isNaN(sMs)) continue;
        const endIso = evt.endTime ?? new Date(sMs + 60 * 60 * 1000).toISOString();
        const eMs = new Date(endIso).getTime();
        if (isNaN(eMs) || eMs <= sMs) continue;
        windows.push({
          start: evt.startTime,
          end: endIso,
          source: evt.isWork ? "work_schedule" : "event",
        });
      }
      busyWindowsByUserId[member.userId] = windows;
    }

    // [P0_WORK_HOURS_BLOCK] Merge current user's work schedule as busy blocks
    const currentUserId = session?.user?.id;
    if (currentUserId && workSchedules.length > 0) {
      const workWindows = buildWorkScheduleBusyWindows(workSchedules, rangeStart, rangeEnd, workSkipKeys);
      if (!busyWindowsByUserId[currentUserId]) {
        busyWindowsByUserId[currentUserId] = [];
      }
      busyWindowsByUserId[currentUserId] = busyWindowsByUserId[currentUserId].concat(workWindows);

      if (__DEV__) {
        devLog("[P0_WORK_HOURS_BLOCK]", "whos_free_work_merge", {
          currentUserId,
          workWindowsCount: workWindows.length,
          totalBusyForUser: busyWindowsByUserId[currentUserId].length,
        });
      }
    }

    const result = computeSchedule({
      members: allMemberIds.map((id) => ({ id })),
      busyWindowsByUserId,
      rangeStart,
      rangeEnd,
      intervalMinutes: 30,
      slotDurationMinutes: 60,
      maxTopSlots: MAX_EXPANDED_SLOTS,
    });

    if (__DEV__) {
      devLog("[P1_WHOSFREE] compute_result", {
        memberCount: allMemberIds.length,
        date: formatLocalDate(pickerDate),
        timeWindow: `${timeWindowStart}–${timeWindowEnd}`,
        slotsFound: result?.topSlots?.length ?? 0,
        engineReturnedNull: result === null,
      });
    }

    if (!result) {
      return { suggestedSlots: [] as TimeSlot[], isLoadingSuggestions: false };
    }

    // [P1_WHOSFREE] Filter slots by time window (reasonable hours)
    const filteredTopSlots = result.topSlots.filter((slot) => {
      const hour = new Date(slot.start).getHours();
      return hour >= timeWindowStart && hour < timeWindowEnd;
    });

    if (__DEV__) {
      devLog("[P1_WHOSFREE] time_window_filter", {
        before: result.topSlots.length,
        after: filteredTopSlots.length,
        window: `${timeWindowStart}:00–${timeWindowEnd}:00`,
      });
    }

    // Map SchedulingSlotResult[] → TimeSlot[] for existing UI compatibility
    const slots: TimeSlot[] = filteredTopSlots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      totalAvailable: slot.availableCount,
      totalMembers: slot.totalMembers,
      availableFriends: slot.availableUserIds
        .filter((uid) => uid !== currentUserId)
        .map((uid) => {
          const friend = allFriends.find((f) => f.friendId === uid);
          return {
            id: uid,
            name: friend?.friend?.name ?? null,
            image: friend?.friend?.image ?? null,
          };
        }),
    }));

    return { suggestedSlots: slots, isLoadingSuggestions: false };
  }, [friendEventsData, isLoadingFriendEvents, pickerDate, timeWindowStart, timeWindowEnd, allFriends, workSchedules, session?.user?.id, workSkipKeys]);

  // [P1_WHOSFREE] Capped render list — never explode the scroll
  const renderCap = showAllSlots ? MAX_EXPANDED_SLOTS : MAX_SUGGESTED_SLOTS;
  const renderedSlots = useMemo(() => {
    const sliced = suggestedSlots.slice(0, renderCap);
    if (__DEV__ && suggestedSlots.length > 0) {
      devLog("[P1_WHOSFREE] render_list", {
        date: formatLocalDate(pickerDate),
        timeWindow: `${timeWindowStart}–${timeWindowEnd}`,
        totalSlotsFound: suggestedSlots.length,
        renderCap,
        renderedSlots: sliced.length,
      });
    }
    return sliced;
  }, [suggestedSlots, renderCap, pickerDate, timeWindowStart, timeWindowEnd]);

  // [P1_WHOSFREE] Single-day label for subtitle
  const dayLabel = useMemo(() => {
    return pickerDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }, [pickerDate]);

  const toggleBestTimeFriend = (friendId: string) => {
    Haptics.selectionAsync();
    setBestTimeFriendIds((prev) => {
      const next = prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId];
      if (__DEV__) {
        devLog("[P1_WHOSFREE] friend_selection", {
          action: prev.includes(friendId) ? "deselect" : "select",
          friendId: friendId.slice(0, 8),
          selectedCount: next.length,
        });
      }
      return next;
    });
  };

  const formatTimeSlot = (slot: TimeSlot) => {
    const start = new Date(slot.start);
    const dateStr = start.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return { date: dateStr, time: timeStr };
  };

  const handleDateSelect = (newDate: string) => {
    // Check if the date is beyond the allowed horizon
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(newDate);
    targetDate.setHours(0, 0, 0, 0);
    const daysDiff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // CRITICAL: Don't gate while entitlements loading - prevents false gates for Pro users
    if (!entitlementsLoading) {
      // Check horizon limit
      const check = canViewWhosFree(entitlements, daysDiff);
      if (!check.allowed && check.context) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPaywallContext(check.context);
        setShowPaywallModal(true);
        return;
      }
    }

    setSelectedDate(newDate);
    router.setParams({ date: newDate });
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Who's Free?" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in to check availability</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Who's Free?",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Find Best Time Section */}
        <Animated.View entering={FadeInDown.delay(50).springify()} className="mb-6">
          <View
            className="rounded-2xl p-5"
            style={{
              backgroundColor: `${themeColor}10`,
              borderWidth: 1,
              borderColor: `${themeColor}30`,
            }}
          >
            <View className="flex-row items-center mb-4">
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Sparkles size={20} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text className="font-sora-semibold text-base" style={{ color: themeColor }}>
                  Find Best Time
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  See when friends are free
                </Text>
              </View>
            </View>

            {/* Select Friends for Best Time */}
            <Text className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
              WHO'S COMING?
            </Text>
            {allFriends.length === 0 ? (
              <View
                className="rounded-xl p-4 items-center mb-4"
                style={{ backgroundColor: colors.surface }}
              >
                <Users size={24} color={colors.textTertiary} />
                <Text className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                  Add friends to find the best time
                </Text>
                <Button
                  variant="primary"
                  size="sm"
                  label="Find Friends"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/friends");
                  }}
                  style={{ marginTop: 12 }}
                />
              </View>
            ) : (
              <View className="flex-row flex-wrap mb-4">
                {allFriends.filter((f) => f.friend != null).map((friendship: Friendship) => {
                  const isSelected = bestTimeFriendIds.includes(friendship.friendId);
                  return (
                    <Pressable
                      key={friendship.id}
                      onPress={() => toggleBestTimeFriend(friendship.friendId)}
                      className="rounded-full px-3 py-2 mr-2 mb-2 flex-row items-center"
                      style={{
                        backgroundColor: isSelected ? `${themeColor}20` : colors.surface,
                        borderWidth: isSelected ? 1 : 0,
                        borderColor: themeColor,
                      }}
                    >
                      <EntityAvatar
                        photoUrl={friendship.friend?.image ?? null}
                        initials={friendship.friend?.name?.[0] ?? "?"}
                        size={24}
                        backgroundColor={`${themeColor}30`}
                        foregroundColor={themeColor}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        className="text-sm font-medium"
                        style={{ color: isSelected ? themeColor : colors.text }}
                      >
                        {friendship.friend?.name?.split(" ")[0] ?? "Friend"}
                      </Text>
                      {isSelected && (
                        <View
                          className="w-4 h-4 rounded-full items-center justify-center ml-2"
                          style={{ backgroundColor: themeColor }}
                        >
                          <Check size={10} color="#fff" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* [P1_WHOSFREE] Single-Day Picker */}
            <Text className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
              DATE
            </Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="rounded-xl p-3 mb-4 flex-row items-center"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <Calendar size={16} color={themeColor} />
              <Text className="ml-2 text-sm font-medium" style={{ color: colors.text }}>
                {pickerDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </Text>
            </Pressable>

            {showDatePicker && (
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                textColor={colors.text}
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) {
                    setPickerDate(date);
                    // Reset expanded slot when date changes
                    setExpandedSlotIndex(null);
                  }
                }}
              />
            )}

            {/* [P1_WHOSFREE] Time Window — reasonable hours filter */}
            <Text className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
              TIME WINDOW
            </Text>
            <View className="flex-row items-center mb-4">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setTimeWindowStart(Math.max(0, timeWindowStart - 1));
                }}
                className="w-8 h-8 rounded-lg items-center justify-center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Text className="text-base font-bold" style={{ color: themeColor }}>−</Text>
              </Pressable>
              <View className="flex-1 mx-2 rounded-xl px-3 py-2 flex-row items-center justify-center" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Clock size={14} color={themeColor} />
                <Text className="ml-2 text-sm font-medium" style={{ color: colors.text }}>
                  {formatHourLabel(timeWindowStart)} – {formatHourLabel(timeWindowEnd)}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setTimeWindowEnd(Math.min(24, timeWindowEnd + 1));
                }}
                className="w-8 h-8 rounded-lg items-center justify-center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Text className="text-base font-bold" style={{ color: themeColor }}>+</Text>
              </Pressable>
            </View>
            <View className="flex-row justify-between mb-4 px-1">
              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                Earliest: {formatHourLabel(timeWindowStart)}
              </Text>
              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                Latest: {formatHourLabel(timeWindowEnd)}
              </Text>
            </View>

            {/* Suggested Times List */}
            {bestTimeFriendIds.length > 0 && (
              <>
                <Text className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
                  BEST TIMES
                </Text>

                {isFriendEventsError ? (
                  <View
                    className="rounded-xl p-4 items-center"
                    style={{ backgroundColor: colors.surface }}
                  >
                    <Clock size={28} color="#EF4444" />
                    <Text className="text-center mt-2 font-medium text-sm" style={{ color: colors.text }}>
                      Could not load availability
                    </Text>
                    <Text className="text-center mt-1 text-xs" style={{ color: colors.textSecondary }}>
                      Check your connection and try again
                    </Text>
                  </View>
                ) : isLoadingSuggestions ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator size="large" color={themeColor} />
                    <Text className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
                      Finding the best times...
                    </Text>
                  </View>
                ) : suggestedSlots.length === 0 ? (
                  <View
                    className="rounded-xl p-4 items-center"
                    style={{ backgroundColor: colors.surface }}
                  >
                    <Clock size={28} color={colors.textTertiary} />
                    <Text className="text-center mt-2 font-medium text-sm" style={{ color: colors.text }}>
                      No overlapping free times found
                    </Text>
                    <Text className="text-center mt-1 text-xs" style={{ color: colors.textSecondary }}>
                      Try a different date or fewer people
                    </Text>
                  </View>
                ) : (
                  <View>
                    {/* [P1_WHOSFREE] Single-day header */}
                    <View className="mb-3">
                      <Text className="font-sora-semibold text-sm" style={{ color: colors.text }}>
                        Best times on {dayLabel}
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        Showing top {renderedSlots.length} suggestion{renderedSlots.length !== 1 ? "s" : ""} ({formatHourLabel(timeWindowStart)}–{formatHourLabel(timeWindowEnd)})
                      </Text>
                    </View>

                    {renderedSlots.map((slot, index) => {
                      const { time } = formatTimeSlot(slot);
                      const availLabel = formatSlotAvailability(slot.totalAvailable, slot.totalMembers);
                      const isExpanded = expandedSlotIndex === index;
                      return (
                        <Animated.View key={index} entering={FadeIn.delay(Math.min(index, 5) * 50)}>
                          <Pressable
                            onPress={async () => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              if (isFromCreate) {
                                // [P0_FIND_BEST_TIME_SSOT] Return picked time to create screen
                                const pickedAtMs = Date.now();
                                await AsyncStorage.setItem(
                                  "oi:bestTimePick",
                                  JSON.stringify({ startISO: slot.start, endISO: slot.end, pickedAtMs }),
                                );
                                if (__DEV__) {
                                  devLog("[P0_FIND_BEST_TIME_SSOT] pick", {
                                    startISO: slot.start,
                                    endISO: slot.end,
                                    pickedAtMs,
                                    returning: "create",
                                  });
                                }
                                router.back();
                                return;
                              }
                              const slotStartDate = new Date(slot.start);
                              const dateStr = slotStartDate.toISOString().split('T')[0];
                              router.push(`/create?date=${dateStr}&time=${slot.start}` as any);
                            }}
                            className="rounded-xl p-3 mb-1 flex-row items-center"
                            style={{
                              backgroundColor: colors.surface,
                              borderWidth: 1,
                              borderColor: isExpanded ? `${themeColor}40` : colors.border,
                            }}
                          >
                            <View
                              className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                              style={{ backgroundColor: `${themeColor}15` }}
                            >
                              <Clock size={20} color={themeColor} />
                            </View>
                            <View className="flex-1">
                              <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                                {time}
                              </Text>
                              <Text className="text-xs" style={{ color: colors.textSecondary }}>
                                {availLabel}
                              </Text>
                            </View>
                            {/* [P1_WHOSFREE] X/Y availability badge */}
                            <View className="items-end mr-2">
                              <View className="flex-row items-center">
                                <Users size={12} color="#22C55E" />
                                <Text className="ml-1 font-bold text-sm" style={{ color: "#22C55E" }}>
                                  {slot.totalAvailable}/{slot.totalMembers}
                                </Text>
                              </View>
                            </View>
                            {/* [P1_WHOSFREE] Expand/collapse toggle */}
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation?.();
                                Haptics.selectionAsync();
                                setExpandedSlotIndex(isExpanded ? null : index);
                              }}
                              hitSlop={8}
                              className="p-1"
                            >
                              {isExpanded
                                ? <ChevronUp size={16} color={colors.textTertiary} />
                                : <ChevronDown size={16} color={colors.textTertiary} />
                              }
                            </Pressable>
                          </Pressable>

                          {/* [P1_WHOSFREE] Expandable detail — who's free / busy */}
                          {isExpanded && (
                            <View
                              className="rounded-b-xl px-4 py-3 mb-2 -mt-1"
                              style={{
                                backgroundColor: `${themeColor}08`,
                                borderWidth: 1,
                                borderTopWidth: 0,
                                borderColor: `${themeColor}20`,
                              }}
                            >
                              {/* Free friends */}
                              {slot.availableFriends.length > 0 && (
                                <View className="mb-2">
                                  <Text className="text-xs font-semibold mb-1" style={{ color: "#22C55E" }}>
                                    ✓ Free ({slot.availableFriends.length})
                                  </Text>
                                  {slot.availableFriends.map((friend) => (
                                    <View key={friend.id} className="flex-row items-center mb-1">
                                      <EntityAvatar
                                        photoUrl={friend.image}
                                        initials={friend.name?.[0] ?? "?"}
                                        size={20}
                                        backgroundColor={`${themeColor}30`}
                                        foregroundColor={themeColor}
                                        style={{ marginRight: 6 }}
                                      />
                                      <Text className="text-xs" style={{ color: colors.text }}>
                                        {friend.name ?? "Friend"}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                              {/* Busy friends */}
                              {(() => {
                                const busyFriends = allFriends
                                  .filter(
                                    (f) =>
                                      bestTimeFriendIds.includes(f.friendId) &&
                                      !slot.availableFriends.some((af) => af.id === f.friendId),
                                  );
                                if (busyFriends.length === 0) return null;
                                return (
                                  <View>
                                    <Text className="text-xs font-semibold mb-1" style={{ color: "#EF4444" }}>
                                      ✗ Busy ({busyFriends.length})
                                    </Text>
                                    {busyFriends.filter((f) => f.friend != null).map((friendship) => (
                                      <View key={friendship.id} className="flex-row items-center mb-1">
                                        <EntityAvatar
                                          photoUrl={friendship.friend?.image ?? null}
                                          initials={friendship.friend?.name?.[0] ?? "?"}
                                          size={20}
                                          backgroundColor="#EF444420"
                                          foregroundColor="#EF4444"
                                          style={{ marginRight: 6 }}
                                        />
                                        <Text className="text-xs" style={{ color: colors.textSecondary }}>
                                          {friendship.friend?.name ?? "Friend"}
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                );
                              })()}
                            </View>
                          )}
                        </Animated.View>
                      );
                    })}

                    {/* Show More — no recompute, just increase render cap */}
                    {!showAllSlots && suggestedSlots.length > MAX_SUGGESTED_SLOTS && (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setShowAllSlots(true);
                        }}
                        className="rounded-xl p-3 mt-1 items-center"
                        style={{
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: `${themeColor}30`,
                        }}
                      >
                        <Text className="text-sm font-medium" style={{ color: themeColor }}>
                          Show more suggestions
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        </Animated.View>

        {/* Spacer for bottom padding */}
        <View className="h-20" />
      </ScrollView>

      {/* Paywall Modal for horizon gating */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
      />
    </SafeAreaView>
  );
}
