import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Calendar, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Check, Users, Sparkles, Plus, AlertCircle } from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSession } from "@/lib/useSession";
import { EntityAvatar } from "@/components/EntityAvatar";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useLiveRefreshContract } from "@/lib/useLiveRefreshContract";
import { STACK_BOTTOM_PADDING } from "@/lib/layoutSpacing";
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
import BottomSheet from "@/components/BottomSheet";
import { FriendPickerSheet } from "@/components/FriendPickerSheet";
import { buildGlassTokens } from "@/ui/glassTokens";
import type { Friendship, GetFriendsResponse } from "@/shared/contracts";

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


export default function WhosFreeScreen() {
  const { date, source } = useLocalSearchParams<{ date: string; source?: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

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

  // Glass redesign: friend picker sheet + time window sheet
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [showTimeWindowPicker, setShowTimeWindowPicker] = useState(false);

  // [P1_WHOSFREE] DEV proof log on mount
  React.useEffect(() => {
    if (__DEV__) {
      devLog('[P1_WHOSFREE] mount', {
        routeDateParam: date ?? null,
        pickerDate: formatLocalDate(pickerDate),
        timeWindow: `${timeWindowStart}:00–${timeWindowEnd}:00`,
        selectedDate,
      });
      devLog('[P0_WHOSFREE_REFRESH]', { status: 'wired', triggers: ['manual', 'focus', 'foreground'] });
    }
  }, []);

  // Fetch friends for Find Best Time
  const { data: allFriendsData, refetch: refetchFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const allFriends = allFriendsData?.friends ?? [];

  // [P0_WORK_HOURS_BLOCK] Fetch current user's work schedule for busy-block SSOT
  const { data: workScheduleData, refetch: refetchWorkSchedule } = useQuery({
    queryKey: ["workSchedule"],
    queryFn: () => api.get<{ schedules: WorkScheduleDay[] }>("/api/work-schedule"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });
  const workSchedules = workScheduleData?.schedules ?? [];
  const { skipKeys: workSkipKeys } = useWorkSkipDays();

  // [P0_WORK_HOURS_BLOCK] Fetch selected friends' work schedules (friendship-gated endpoint)
  const { data: friendWorkSchedulesData, refetch: refetchFriendWorkSchedules } = useQuery({
    queryKey: ["friendWorkSchedules", bestTimeFriendIds],
    queryFn: async () => {
      const results = await Promise.allSettled(
        bestTimeFriendIds.map(async (friendId) => {
          const res = await api.get<{ schedules: WorkScheduleDay[] }>(`/api/work-schedule/user/${friendId}`);
          return { userId: friendId, schedules: res.schedules ?? [] };
        }),
      );
      // Only keep successful fetches — 403/404 means friend hasn't shared, treat as fully free
      return results
        .filter((r): r is PromiseFulfilledResult<{ userId: string; schedules: WorkScheduleDay[] }> =>
          r.status === "fulfilled",
        )
        .map((r) => r.value);
    },
    enabled: isAuthedForNetwork(bootStatus, session) && bestTimeFriendIds.length > 0,
  });

  // [P1_WHOSFREE] Fetch each selected friend's events for client-side scheduling
  const {
    data: friendEventsData,
    isLoading: isLoadingFriendEvents,
    isError: isFriendEventsError,
    isSuccess: isFriendEventsSuccess,
    error: friendEventsError,
    refetch: refetchFriendEvents,
  } = useQuery({
    queryKey: ["best-time-friend-events", bestTimeFriendIds, session?.user?.id],
    enabled: isAuthedForNetwork(bootStatus, session) && bestTimeFriendIds.length > 0 && allFriends.length > 0,
    queryFn: async () => {
      if (__DEV__) {
        devLog("[P1_WHOSFREE] query_firing", {
          friendIds: bestTimeFriendIds,
          date: formatLocalDate(pickerDate),
          timeWindow: `${timeWindowStart}–${timeWindowEnd}`,
        });
      }

      let fetchFailCount = 0;
      let fetchTotalCount = 0;
      const results: Array<{ userId: string; events: Array<{ startTime: string; endTime: string | null; isBusy?: boolean; isWork?: boolean }> }> = [];

      // Include the current user as a "member"
      if (session?.user?.id) {
        fetchTotalCount++;
        try {
          const myRes = await api.get<{ createdEvents: any[]; goingEvents: any[] }>("/api/events/calendar");
          const myEvents = [
            ...(myRes.createdEvents ?? []),
            ...(myRes.goingEvents ?? []),
          ].map((e) => ({ startTime: e.startTime, endTime: e.endTime, isBusy: e.isBusy }));
          results.push({ userId: session.user.id, events: myEvents });
        } catch (err) {
          fetchFailCount++;
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
        fetchTotalCount++;
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
          fetchFailCount++;
          // Friend events unavailable — treat as fully free
          results.push({ userId: friendId, events: [] });
        }
      }

      if (__DEV__) {
        devLog("[P1_WHOSFREE] query_response", {
          memberCount: results.length,
          eventCounts: results.map(r => ({ id: r.userId.slice(0, 6), events: r.events.length })),
          fetchFailCount,
          fetchTotalCount,
        });
      }

      // [P0_WHOSFREE_ERROR_TRUTH] If ALL inner fetches failed, data is unreliable — throw to surface error UI
      if (fetchTotalCount > 0 && fetchFailCount === fetchTotalCount) {
        throw new Error(`All ${fetchTotalCount} availability fetches failed — data unreliable`);
      }

      return results;
    },
  });

  // [P0_WHOSFREE_ERROR_TRUTH] DEV-only diagnostic log for error/truth state
  React.useEffect(() => {
    if (__DEV__) {
      console.log('[P0_WHOSFREE_ERROR_TRUTH]', {
        isError: isFriendEventsError,
        isSuccess: isFriendEventsSuccess,
        dataPresent: !!friendEventsData,
      });
    }
  }, [isFriendEventsError, isFriendEventsSuccess, friendEventsData]);

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

    // [P0_WORK_HOURS_BLOCK] Merge friends' work schedules as busy blocks
    if (friendWorkSchedulesData) {
      for (const friendSched of friendWorkSchedulesData) {
        if (friendSched.schedules.length === 0) continue;
        const friendWorkWindows = buildWorkScheduleBusyWindows(friendSched.schedules, rangeStart, rangeEnd);
        if (friendWorkWindows.length === 0) continue;
        if (!busyWindowsByUserId[friendSched.userId]) {
          busyWindowsByUserId[friendSched.userId] = [];
        }
        busyWindowsByUserId[friendSched.userId] = busyWindowsByUserId[friendSched.userId].concat(friendWorkWindows);

        if (__DEV__) {
          devLog("[P0_WORK_HOURS_BLOCK]", "friend_work_merge", {
            friendId: friendSched.userId.slice(0, 8),
            workWindowsCount: friendWorkWindows.length,
            totalBusyForFriend: busyWindowsByUserId[friendSched.userId].length,
          });
        }
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
  }, [friendEventsData, isLoadingFriendEvents, pickerDate, timeWindowStart, timeWindowEnd, allFriends, workSchedules, session?.user?.id, workSkipKeys, friendWorkSchedulesData]);

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

  // Derived: friends currently selected (for avatar strip)
  const selectedFriends = useMemo(
    () => allFriends.filter((f) => bestTimeFriendIds.includes(f.friendId) && f.friend != null),
    [allFriends, bestTimeFriendIds],
  );

  // Glass slot tier classification
  const getSlotTier = (slot: TimeSlot) => {
    const busyCount = slot.totalMembers - slot.totalAvailable;
    if (busyCount === 0)
      return {
        bg: "rgba(93,202,165,0.08)",
        border: "rgba(93,202,165,0.25)",
        accent: "#5DCAA5",
        label: "Everyone free",
      };
    if (busyCount === 1)
      return {
        bg: isDark ? "rgba(255,255,255,0.06)" : colors.surface,
        border: isDark ? "rgba(255,255,255,0.1)" : colors.borderSubtle,
        accent: colors.textSecondary,
        label: "Great overlap",
      };
    return {
      bg: "rgba(245,158,11,0.06)",
      border: "rgba(245,158,11,0.2)",
      accent: "#F59E0B",
      label: "Some conflicts",
    };
  };

  // Glass styling tokens
  const glass = buildGlassTokens(isDark, colors);

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

  // [P0_WHOSFREE_REFRESH] Pull-to-refresh + focus/foreground refresh via SSOT contract
  const { isRefreshing, onManualRefresh } = useLiveRefreshContract({
    screenName: "whos-free",
    refetchFns: [refetchFriends, refetchWorkSchedule, refetchFriendEvents, refetchFriendWorkSchedules],
  });

  // [QA-8] Suppress login flash: only show sign-in prompt when definitively logged out
  if (!session) {
    if (bootStatus !== 'loggedOut') return null;
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Who's Free?" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in to check availability</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Slot time selection handler (shared by slot tap and "Pick this time" CTA)
  const handlePickSlot = async (slot: TimeSlot) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isFromCreate) {
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
    const dateStr = slotStartDate.toISOString().split("T")[0];
    router.push(`/create?date=${dateStr}&time=${slot.start}`);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={[]}>
      <Stack.Screen
        options={{
          title: "Who's Free?",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: STACK_BOTTOM_PADDING }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onManualRefresh}
            tintColor={themeColor}
          />
        }
      >
        {/* ── Header ── */}
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
                backgroundColor: `${themeColor}20`,
              }}
            >
              <Sparkles size={20} color={themeColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                Find Best Time
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
                See when friends are free
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── FRIENDS glass card ── */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={{ marginBottom: 12 }}>
          <Pressable
            onPress={() => {
              if (allFriends.length === 0) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/friends");
              } else {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowFriendPicker(true);
              }
            }}
            style={{ ...glass.card, padding: 16 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ ...glass.label, textTransform: "uppercase" }}>FRIENDS</Text>
              {bestTimeFriendIds.length > 0 && (
                <View
                  style={{
                    backgroundColor: "rgba(93,202,165,0.12)",
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: "#5DCAA5", fontSize: 11, fontWeight: "700" }}>
                    {bestTimeFriendIds.length} selected
                  </Text>
                </View>
              )}
            </View>

            {allFriends.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 16 }}>
                <Users size={24} color={colors.textTertiary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>
                  Add friends to find the best time
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                {selectedFriends.slice(0, 8).map((friendship, i) => (
                  <View
                    key={friendship.friendId}
                    style={{
                      marginLeft: i > 0 ? -8 : 0,
                      borderWidth: 2,
                      borderColor: colors.background,
                      borderRadius: 18,
                      zIndex: 8 - i,
                    }}
                  >
                    <EntityAvatar
                      photoUrl={friendship.friend?.image ?? null}
                      initials={friendship.friend?.name?.[0] ?? "?"}
                      size={32}
                      backgroundColor={isDark ? "rgba(255,255,255,0.1)" : `${themeColor}15`}
                      foregroundColor={themeColor}
                    />
                  </View>
                ))}
                {/* + button */}
                <View
                  style={{
                    marginLeft: selectedFriends.length > 0 ? -8 : 0,
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : colors.surface,
                    borderWidth: 1.5,
                    borderColor: isDark ? "rgba(255,255,255,0.15)" : colors.border,
                    borderStyle: "dashed",
                    zIndex: 0,
                  }}
                >
                  <Plus size={16} color={colors.textSecondary} />
                </View>
              </View>
            )}
          </Pressable>
        </Animated.View>

        {/* ── DATE + TIME WINDOW side-by-side ── */}
        <Animated.View
          entering={FadeInDown.delay(150).springify()}
          style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}
        >
          {/* Date card with day-switch arrows */}
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                const prev = new Date(pickerDate);
                prev.setDate(prev.getDate() - 1);
                if (prev >= new Date(new Date().toDateString())) {
                  setPickerDate(prev);
                  setExpandedSlotIndex(null);
                }
              }}
              hitSlop={8}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <ChevronLeft size={14} color={isDark ? "rgba(255,255,255,0.4)" : "#aaa"} />
            </Pressable>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={{ ...glass.card, flex: 1, padding: 14 }}
            >
              <Text style={{ ...glass.label, textTransform: "uppercase", marginBottom: 6 }}>DATE</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Calendar size={14} color={themeColor} />
                <Text style={{ ...glass.value, marginLeft: 6 }}>
                  {pickerDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                const next = new Date(pickerDate);
                next.setDate(next.getDate() + 1);
                setPickerDate(next);
                setExpandedSlotIndex(null);
              }}
              hitSlop={8}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <ChevronRight size={14} color={isDark ? "rgba(255,255,255,0.4)" : "#aaa"} />
            </Pressable>
          </View>

          {/* Time window card */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowTimeWindowPicker(true);
            }}
            style={{ ...glass.card, flex: 1, padding: 14 }}
          >
            <Text style={{ ...glass.label, textTransform: "uppercase", marginBottom: 6 }}>WINDOW</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Clock size={14} color={themeColor} />
              <Text style={{ ...glass.value, marginLeft: 6 }}>
                {formatHourLabel(timeWindowStart)} – {formatHourLabel(timeWindowEnd)}
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        {showDatePicker && (
          <DateTimePicker
            value={pickerDate}
            mode="date"
            display="spinner"
            minimumDate={new Date()}
            textColor={colors.text}
            onChange={(_, d) => {
              setShowDatePicker(false);
              if (d) {
                setPickerDate(d);
                setExpandedSlotIndex(null);
              }
            }}
          />
        )}

        {/* ── BEST TIMES section ── */}
        {bestTimeFriendIds.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            {/* Section header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ ...glass.label, textTransform: "uppercase" }}>BEST TIMES</Text>
              {suggestedSlots.length > 0 && (
                <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
                  {renderedSlots.length} suggestion{renderedSlots.length !== 1 ? "s" : ""}
                </Text>
              )}
            </View>

            {/* Error state */}
            {isFriendEventsError ? (
              <View style={{ ...glass.card, padding: 24, alignItems: "center" }}>
                <AlertCircle size={28} color="#EF4444" />
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500", marginTop: 10, textAlign: "center" }}>
                  Could not load availability
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, textAlign: "center" }}>
                  Check your connection and try again
                </Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    refetchFriendEvents();
                  }}
                  style={{
                    marginTop: 14,
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: `${themeColor}20`,
                  }}
                >
                  <Text style={{ color: themeColor, fontSize: 13, fontWeight: "600" }}>Retry</Text>
                </Pressable>
              </View>

            ) : isLoadingSuggestions || (!isFriendEventsSuccess && !friendEventsData) ? (
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <ActivityIndicator size="large" color={themeColor} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 10 }}>
                  Finding the best times...
                </Text>
              </View>

            ) : suggestedSlots.length === 0 ? (
              <View style={{ ...glass.card, padding: 24, alignItems: "center" }}>
                <Clock size={28} color={colors.textTertiary} />
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500", marginTop: 10, textAlign: "center" }}>
                  No overlapping free times found
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, textAlign: "center" }}>
                  Try a different date or fewer people
                </Text>
              </View>

            ) : (
              <View>
                {/* Day label */}
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 10 }}>
                  {dayLabel}
                </Text>

                {/* Slot cards */}
                {renderedSlots.map((slot, index) => {
                  const { time } = formatTimeSlot(slot);
                  const tier = getSlotTier(slot);
                  const isExpanded = expandedSlotIndex === index;
                  const busyCount = slot.totalMembers - slot.totalAvailable;

                  // Busy friends for expanded view
                  const busyFriends = allFriends.filter(
                    (f) =>
                      bestTimeFriendIds.includes(f.friendId) &&
                      !slot.availableFriends.some((af) => af.id === f.friendId) &&
                      f.friend != null,
                  );

                  return (
                    <Animated.View key={index} entering={FadeIn.delay(Math.min(index, 5) * 40)}>
                      {/* Slot card */}
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          setExpandedSlotIndex(isExpanded ? null : index);
                        }}
                        style={{
                          backgroundColor: tier.bg,
                          borderWidth: 0.5,
                          borderColor: tier.border,
                          borderRadius: isExpanded ? 16 : 14,
                          borderBottomLeftRadius: isExpanded ? 0 : 14,
                          borderBottomRightRadius: isExpanded ? 0 : 14,
                          padding: 14,
                          marginBottom: isExpanded ? 0 : 6,
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
                            {time}
                          </Text>
                          <Text style={{ color: tier.accent, fontSize: 11, fontWeight: "500", marginTop: 2 }}>
                            {tier.label}
                          </Text>
                        </View>

                        {/* Count badge */}
                        <View style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
                          <Users size={12} color={tier.accent} />
                          <Text style={{ color: tier.accent, fontSize: 13, fontWeight: "700", marginLeft: 4 }}>
                            {slot.totalAvailable}/{slot.totalMembers}
                          </Text>
                        </View>

                        {/* Chevron */}
                        {isExpanded ? (
                          <ChevronUp size={16} color={colors.textTertiary} />
                        ) : (
                          <ChevronDown size={16} color={colors.textTertiary} />
                        )}
                      </Pressable>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <View
                          style={{
                            backgroundColor: tier.bg,
                            borderWidth: 0.5,
                            borderTopWidth: 0,
                            borderColor: tier.border,
                            borderBottomLeftRadius: 16,
                            borderBottomRightRadius: 16,
                            paddingHorizontal: 14,
                            paddingTop: 4,
                            paddingBottom: 14,
                            marginBottom: 6,
                          }}
                        >
                          {/* Divider */}
                          <View
                            style={{
                              height: 0.5,
                              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                              marginBottom: 10,
                            }}
                          />

                          {/* Free people chips */}
                          {slot.availableFriends.length > 0 && (
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: busyFriends.length > 0 ? 8 : 12 }}>
                              {slot.availableFriends.map((friend) => (
                                <View
                                  key={friend.id}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    backgroundColor: "rgba(93,202,165,0.1)",
                                    borderRadius: 20,
                                    paddingVertical: 4,
                                    paddingHorizontal: 8,
                                    paddingRight: 10,
                                  }}
                                >
                                  <EntityAvatar
                                    photoUrl={friend.image}
                                    initials={friend.name?.[0] ?? "?"}
                                    size={20}
                                    backgroundColor="rgba(93,202,165,0.2)"
                                    foregroundColor="#5DCAA5"
                                  />
                                  <Text style={{ color: "#5DCAA5", fontSize: 11, fontWeight: "600", marginLeft: 5 }}>
                                    {friend.name?.split(" ")[0] ?? "Friend"}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {/* Busy people chips */}
                          {busyFriends.length > 0 && (
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                              {busyFriends.map((friendship) => (
                                <View
                                  key={friendship.id}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    backgroundColor: "rgba(239,68,68,0.08)",
                                    borderRadius: 20,
                                    paddingVertical: 4,
                                    paddingHorizontal: 8,
                                    paddingRight: 10,
                                  }}
                                >
                                  <EntityAvatar
                                    photoUrl={friendship.friend?.image ?? null}
                                    initials={friendship.friend?.name?.[0] ?? "?"}
                                    size={20}
                                    backgroundColor="rgba(239,68,68,0.15)"
                                    foregroundColor="#EF4444"
                                  />
                                  <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: "500", marginLeft: 5 }}>
                                    {friendship.friend?.name?.split(" ")[0] ?? "Friend"}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {/* Pick this time CTA */}
                          <Pressable
                            onPress={() => handlePickSlot(slot)}
                            style={{
                              backgroundColor: "#5DCAA5",
                              borderRadius: 12,
                              paddingVertical: 12,
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                              Pick this time
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </Animated.View>
                  );
                })}

                {/* Show More */}
                {!showAllSlots && suggestedSlots.length > MAX_SUGGESTED_SLOTS && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAllSlots(true);
                    }}
                    style={{ ...glass.card, padding: 12, marginTop: 4, alignItems: "center" }}
                  >
                    <Text style={{ color: themeColor, fontSize: 13, fontWeight: "500" }}>
                      Show more suggestions
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </Animated.View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Friend Picker Sheet ── */}
      <FriendPickerSheet
        visible={showFriendPicker}
        onClose={() => setShowFriendPicker(false)}
        friends={allFriends}
        selectedIds={bestTimeFriendIds}
        onToggle={toggleBestTimeFriend}
      />

      {/* ── Time Window Sheet ── */}
      <BottomSheet
        visible={showTimeWindowPicker}
        onClose={() => setShowTimeWindowPicker(false)}
        title="Time Window"
        heightPct={0}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          {/* Earliest */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>Earliest</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setTimeWindowStart(Math.max(0, timeWindowStart - 1));
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : colors.surface,
                  borderWidth: 0.5,
                  borderColor: isDark ? "rgba(255,255,255,0.1)" : colors.borderSubtle,
                }}
              >
                <Text style={{ color: themeColor, fontSize: 18, fontWeight: "700" }}>-</Text>
              </Pressable>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600", minWidth: 60, textAlign: "center" }}>
                {formatHourLabel(timeWindowStart)}
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setTimeWindowStart(Math.min(timeWindowEnd - 1, timeWindowStart + 1));
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : colors.surface,
                  borderWidth: 0.5,
                  borderColor: isDark ? "rgba(255,255,255,0.1)" : colors.borderSubtle,
                }}
              >
                <Text style={{ color: themeColor, fontSize: 18, fontWeight: "700" }}>+</Text>
              </Pressable>
            </View>
          </View>
          {/* Latest */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>Latest</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setTimeWindowEnd(Math.max(timeWindowStart + 1, timeWindowEnd - 1));
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : colors.surface,
                  borderWidth: 0.5,
                  borderColor: isDark ? "rgba(255,255,255,0.1)" : colors.borderSubtle,
                }}
              >
                <Text style={{ color: themeColor, fontSize: 18, fontWeight: "700" }}>-</Text>
              </Pressable>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600", minWidth: 60, textAlign: "center" }}>
                {formatHourLabel(timeWindowEnd)}
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setTimeWindowEnd(Math.min(24, timeWindowEnd + 1));
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : colors.surface,
                  borderWidth: 0.5,
                  borderColor: isDark ? "rgba(255,255,255,0.1)" : colors.borderSubtle,
                }}
              >
                <Text style={{ color: themeColor, fontSize: 18, fontWeight: "700" }}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </BottomSheet>

      {/* Paywall Modal for horizon gating */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
      />
    </SafeAreaView>
  );
}
