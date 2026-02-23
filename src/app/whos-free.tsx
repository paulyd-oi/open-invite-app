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
import { Calendar, Clock, ChevronRight, Check, Users, Sparkles } from "@/ui/icons";
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
  };
}

interface GetFriendsResponse {
  friends: Friendship[];
}

export default function WhosFreeScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, colors } = useTheme();
  
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
  
  // P0 FIX: Initialize startDate/endDate from route param, not hardcoded today
  const [startDate, setStartDate] = useState<Date>(() => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return parseLocalDate(date);
    }
    return new Date();
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    const baseDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? parseLocalDate(date) : new Date();
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 7);
    return d;
  });
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // [P0_WHOSFREE_SOT] DEV proof log on mount
  React.useEffect(() => {
    if (__DEV__) {
      devLog('[P0_WHOSFREE_SOT] mount', {
        routeDateParam: date ?? null,
        startDate: formatLocalDate(startDate),
        endDate: formatLocalDate(endDate),
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

  // [P0_WHOSFREE_SOT] Fetch each selected friend's events for client-side scheduling
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
        devLog("[P0_WHOSFREE_SOT] query_firing", {
          friendIds: bestTimeFriendIds,
          rangeStart: formatLocalDate(startDate),
          rangeEnd: formatLocalDate(endDate),
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
          if (__DEV__) devError("[P0_WHOSFREE_SOT] current_user_calendar_error", err);
          // Treat current user as fully free if calendar fetch fails
          results.push({ userId: session.user.id, events: [] });
        }
      }

      // Fetch each friend's events
      for (const friendId of bestTimeFriendIds) {
        const friendship = allFriends.find((f) => f.friendId === friendId);
        if (!friendship) {
          if (__DEV__) devLog("[P0_WHOSFREE_SOT] friendship_not_found", { friendId: friendId.slice(0, 8) });
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
        devLog("[P0_WHOSFREE_SOT] query_response", {
          memberCount: results.length,
          eventCounts: results.map(r => ({ id: r.userId.slice(0, 6), events: r.events.length })),
        });
      }

      return results;
    },
  });

  // [P0_WORK_HOURS_BLOCK] Client-side scheduling engine (replaces backend suggested-times)
  const { suggestedSlots, isLoadingSuggestions } = useMemo(() => {
    if (!friendEventsData || friendEventsData.length === 0) {
      return { suggestedSlots: [] as TimeSlot[], isLoadingSuggestions: isLoadingFriendEvents };
    }

    const rangeStart = startDate.toISOString();
    const rangeEnd = endDate.toISOString();

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
      const workWindows = buildWorkScheduleBusyWindows(workSchedules, rangeStart, rangeEnd);
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
      maxTopSlots: 10,
    });

    if (__DEV__) {
      devLog("[P0_WHOSFREE_SOT] compute_result", {
        memberCount: allMemberIds.length,
        rangeStart: formatLocalDate(startDate),
        rangeEnd: formatLocalDate(endDate),
        slotsFound: result?.topSlots?.length ?? 0,
        engineReturnedNull: result === null,
      });
    }

    if (!result) {
      return { suggestedSlots: [] as TimeSlot[], isLoadingSuggestions: false };
    }

    // Map SchedulingSlotResult[] → TimeSlot[] for existing UI compatibility
    const slots: TimeSlot[] = result.topSlots.map((slot) => ({
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
            name: friend?.friend.name ?? null,
            image: friend?.friend.image ?? null,
          };
        }),
    }));

    return { suggestedSlots: slots, isLoadingSuggestions: false };
  }, [friendEventsData, isLoadingFriendEvents, startDate, endDate, allFriends, workSchedules, session?.user?.id]);

  const toggleBestTimeFriend = (friendId: string) => {
    Haptics.selectionAsync();
    setBestTimeFriendIds((prev) => {
      const next = prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId];
      if (__DEV__) {
        devLog("[P0_WHOSFREE_SOT] friend_selection", {
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
                {allFriends.map((friendship: Friendship) => {
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
                        photoUrl={friendship.friend.image}
                        initials={friendship.friend.name?.[0] ?? "?"}
                        size={24}
                        backgroundColor={`${themeColor}30`}
                        foregroundColor={themeColor}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        className="text-sm font-medium"
                        style={{ color: isSelected ? themeColor : colors.text }}
                      >
                        {friendship.friend.name?.split(" ")[0] ?? "Friend"}
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

            {/* Date Range Pickers */}
            <Text className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
              DATE RANGE
            </Text>
            <View className="flex-row mb-4">
              <Pressable
                onPress={() => setShowStartPicker(true)}
                className="flex-1 rounded-xl p-3 mr-2 flex-row items-center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Calendar size={16} color={themeColor} />
                <Text className="ml-2 text-sm" style={{ color: colors.text }}>
                  {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowEndPicker(true)}
                className="flex-1 rounded-xl p-3 flex-row items-center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Calendar size={16} color="#4ECDC4" />
                <Text className="ml-2 text-sm" style={{ color: colors.text }}>
                  {endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </Pressable>
            </View>

            {showStartPicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowStartPicker(false);
                  if (date) {
                    setStartDate(date);
                    if (endDate < date) {
                      const newEnd = new Date(date);
                      newEnd.setDate(newEnd.getDate() + 7);
                      setEndDate(newEnd);
                    }
                  }
                }}
              />
            )}

            {showEndPicker && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display="spinner"
                minimumDate={startDate}
                onChange={(_, date) => {
                  setShowEndPicker(false);
                  if (date) {
                    const clampedDate = date < startDate ? startDate : date;
                    setEndDate(clampedDate);
                  }
                }}
              />
            )}

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
                      Try a wider date range or fewer people
                    </Text>
                  </View>
                ) : (
                  <View>
                    {suggestedSlots.slice(0, 5).map((slot, index) => {
                      const { date: slotDate, time } = formatTimeSlot(slot);
                      const availLabel = formatSlotAvailability(slot.totalAvailable, slot.totalMembers);
                      return (
                        <Animated.View key={index} entering={FadeIn.delay(index * 50)}>
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              const slotStartDate = new Date(slot.start);
                              const dateStr = slotStartDate.toISOString().split('T')[0];
                              router.push(`/create?date=${dateStr}&time=${slot.start}` as any);
                            }}
                            className="rounded-xl p-3 mb-2 flex-row items-center"
                            style={{
                              backgroundColor: colors.surface,
                              borderWidth: 1,
                              borderColor: colors.border,
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
                                {slotDate}
                              </Text>
                              <Text className="text-xs" style={{ color: colors.textSecondary }}>
                                {time}
                              </Text>
                            </View>
                            <View className="items-end">
                              <View className="flex-row items-center">
                                <Users size={12} color="#22C55E" />
                                <Text className="ml-1 font-semibold text-sm" style={{ color: "#22C55E" }}>
                                  {slot.totalAvailable}
                                </Text>
                              </View>
                              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                                {availLabel}
                              </Text>
                            </View>
                            <ChevronRight size={16} color={colors.textTertiary} />
                          </Pressable>
                        </Animated.View>
                      );
                    })}
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
