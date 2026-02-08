import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Calendar, UserCheck, Clock, ChevronRight, Plus, Briefcase, Check, ChevronLeft, Filter, X, Users, Sparkles } from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, useIsPro, canViewWhosFree, type PaywallContext } from "@/lib/entitlements";
import { devLog } from "@/lib/devLog";
import { circleKeys } from "@/lib/circleQueryKeys";

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

interface FriendInfo {
  friendshipId: string;
  friend: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  groups: Array<{ id: string; name: string; color: string }>;
  isWorking?: boolean;
  workLabel?: string | null;
}

interface WhosFreResponse {
  date: string;
  freeFriends: FriendInfo[];
  busyFriends: FriendInfo[];
}

// Interface for suggested times feature
interface TimeSlot {
  start: string;
  end: string;
  availableFriends: Array<{
    id: string;
    name: string | null;
    image: string | null;
  }>;
  totalAvailable: number;
}

interface GetSuggestedTimesResponse {
  slots: TimeSlot[];
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

// Mini calendar component to show week availability
function WeekAvailabilityCalendar({
  selectedFriends,
  themeColor,
  colors,
  isDark,
  onDatePress,
  currentDate,
}: {
  selectedFriends: FriendInfo[];
  themeColor: string;
  colors: any;
  isDark: boolean;
  onDatePress: (date: string) => void;
  currentDate: Date;
}) {
  const { status: bootStatus } = useBootAuthority();
  const { data: session } = useSession();
  const [weekOffset, setWeekOffset] = useState(0);

  // Get the week's dates
  const weekDates = useMemo(() => {
    const dates: Date[] = [];
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + (weekOffset * 7));

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, [currentDate, weekOffset]);

  const friendIds = selectedFriends.map(f => f.friend.id);
  const dateStrings = weekDates.map(d => d.toISOString().split('T')[0]);

  // Fetch availability for all selected friends for this week
  const { data: availabilityData } = useQuery({
    queryKey: ["friends-availability", friendIds, dateStrings],
    queryFn: async () => {
      if (friendIds.length === 0) return { availability: {} };
      const params = new URLSearchParams();
      friendIds.forEach(id => params.append("friendIds", id));
      dateStrings.forEach(d => params.append("dates", d));
      return api.get<{ availability: Record<string, Record<string, boolean>> }>(
        `/api/events/friends-availability?${params.toString()}`
      );
    },
    enabled: isAuthedForNetwork(bootStatus, session) && friendIds.length > 0,
  });

  const availability = availabilityData?.availability ?? {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <View className="mb-4">
      {/* Week Navigation */}
      <View className="flex-row items-center justify-between mb-3">
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setWeekOffset(prev => prev - 1);
          }}
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          <ChevronLeft size={18} color={colors.textSecondary} />
        </Pressable>
        <Text className="font-medium" style={{ color: colors.text }}>
          {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setWeekOffset(prev => prev + 1);
          }}
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          <ChevronRight size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Week Grid */}
      <View className="flex-row justify-between">
        {weekDates.map((date, index) => {
          const dateStr = date.toISOString().split('T')[0];
          const isToday = date.getTime() === today.getTime();
          const isPast = date < today;

          // Count how many selected friends are free on this day
          let freeCount = 0;
          selectedFriends.forEach(friend => {
            const friendAvail = availability[friend.friend.id];
            if (friendAvail && friendAvail[dateStr]) {
              freeCount++;
            }
          });

          const allFree = freeCount === selectedFriends.length && selectedFriends.length > 0;
          const someFree = freeCount > 0 && freeCount < selectedFriends.length;
          const noneFree = freeCount === 0 && selectedFriends.length > 0;

          return (
            <Pressable
              key={dateStr}
              onPress={() => {
                if (!isPast) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDatePress(dateStr);
                }
              }}
              disabled={isPast}
              className="items-center flex-1"
            >
              <Text
                className="text-xs mb-1"
                style={{ color: isToday ? themeColor : colors.textTertiary }}
              >
                {["S", "M", "T", "W", "T", "F", "S"][date.getDay()]}
              </Text>
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{
                  backgroundColor: isPast
                    ? colors.surface
                    : allFree
                    ? "#22C55E"
                    : someFree
                    ? "#F59E0B"
                    : noneFree
                    ? "#EF4444" + "30"
                    : colors.surface,
                  borderWidth: isToday ? 2 : 0,
                  borderColor: themeColor,
                  opacity: isPast ? 0.4 : 1,
                }}
              >
                <Text
                  className="font-medium"
                  style={{
                    color: allFree || someFree ? "#fff" : colors.text,
                  }}
                >
                  {date.getDate()}
                </Text>
              </View>
              {selectedFriends.length > 0 && !isPast && (
                <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                  {freeCount}/{selectedFriends.length}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Legend */}
      {selectedFriends.length > 0 && (
        <View className="flex-row justify-center mt-3 space-x-4">
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: "#22C55E" }} />
            <Text className="text-xs" style={{ color: colors.textTertiary }}>All free</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: "#F59E0B" }} />
            <Text className="text-xs" style={{ color: colors.textTertiary }}>Some free</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: "#EF444430" }} />
            <Text className="text-xs" style={{ color: colors.textTertiary }}>None free</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function WhosFreeScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  
  // P0 FIX: Initialize selectedDate from param using local-safe parsing
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date; // Use param directly (already YYYY-MM-DD)
    }
    return formatLocalDate(new Date()); // Default to today in local timezone
  });
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Paywall state for horizon gating
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("WHOS_FREE_HORIZON");

  // Fetch entitlements for gating
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements();

  // Filter state
  type TimeRange = "all" | "after_work" | "weekend";
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [hideWorking, setHideWorking] = useState(false);

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

  // P0 FIX: DEV proof log on mount
  React.useEffect(() => {
    if (__DEV__) {
      devLog('[P0_WHOS_FREE_DATE] mount', {
        routeDateParam: date ?? null,
        parsedStart: formatLocalDate(startDate),
        startDateISO: formatLocalDate(startDate),
        endDateISO: formatLocalDate(endDate),
        selectedDate,
        reason: date ? 'init_from_param' : 'init_today',
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

  // Fetch suggested times based on selected friends and date range
  const {
    data: suggestedTimesData,
    isLoading: isLoadingSuggestions,
  } = useQuery({
    queryKey: ["suggested-times", bestTimeFriendIds, startDate.toISOString(), endDate.toISOString()],
    queryFn: () =>
      api.post<GetSuggestedTimesResponse>("/api/events/suggested-times", {
        friendIds: bestTimeFriendIds,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        duration: 60,
      }),
    enabled: isAuthedForNetwork(bootStatus, session) && bestTimeFriendIds.length > 0,
  });

  const suggestedSlots = suggestedTimesData?.slots ?? [];

  // Fetch circles for filter
  interface Circle {
    id: string;
    name: string;
    color: string;
    members: Array<{ friendshipId: string }>;
  }
  const { data: circlesData } = useQuery({
    queryKey: circleKeys.all(),
    queryFn: () => api.get<{ circles: Circle[] }>("/api/circles"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });
  const circles = circlesData?.circles ?? [];

  // Parse date string as local time to avoid timezone issues
  // Input format: "2026-01-09" should be treated as local date, not UTC
  const dateObj = selectedDate ? (() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  })() : new Date();

  const formattedDate = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["whos-free", selectedDate],
    queryFn: () => api.get<WhosFreResponse>(`/api/events/whos-free?date=${selectedDate}`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!selectedDate,
  });

  const freeFriends = data?.freeFriends ?? [];
  const busyFriends = data?.busyFriends ?? [];

  // Apply filters to friends
  const applyFilters = (friends: FriendInfo[]): FriendInfo[] => {
    let filtered = [...friends];

    // Filter by circle
    if (selectedCircleId) {
      const circle = circles.find(c => c.id === selectedCircleId);
      if (circle) {
        const circleMemberIds = new Set(circle.members.map(m => m.friendshipId));
        filtered = filtered.filter(f => circleMemberIds.has(f.friendshipId));
      }
    }

    // Filter by working status
    if (hideWorking) {
      filtered = filtered.filter(f => !f.isWorking);
    }

    return filtered;
  };

  const filteredFreeFriends = applyFilters(freeFriends);
  const filteredBusyFriends = applyFilters(busyFriends);

  // Count active filters
  const activeFilterCount = (selectedCircleId ? 1 : 0) + (hideWorking ? 1 : 0) + (timeRange !== "all" ? 1 : 0);

  // Get currently selected friends data
  const selectedFriends = [...freeFriends, ...busyFriends].filter(f =>
    selectedFriendIds.has(f.friendshipId)
  );

  const handleToggleFriend = (friendshipId: string) => {
    Haptics.selectionAsync();
    setSelectedFriendIds(prev => {
      const next = new Set(prev);
      if (next.has(friendshipId)) {
        next.delete(friendshipId);
      } else {
        next.add(friendshipId);
      }
      return next;
    });
  };

  const toggleBestTimeFriend = (friendId: string) => {
    Haptics.selectionAsync();
    setBestTimeFriendIds((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
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

  const handleCreateEvent = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Pass selected friend IDs to the create event screen
    const friendIds = Array.from(selectedFriendIds).join(",");
    router.push(`/create?date=${selectedDate}${friendIds ? `&inviteFriends=${friendIds}` : ""}` as any);
  };

  const handleFriendPress = (friendshipId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/friend/${friendshipId}` as any);
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Who's Free?" }} />
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
          title: "Who's Free?",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerRight: () => (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowFilterModal(true);
              }}
              className="mr-2 flex-row items-center"
            >
              <Filter size={20} color={activeFilterCount > 0 ? themeColor : colors.textSecondary} />
              {activeFilterCount > 0 && (
                <View
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full items-center justify-center"
                  style={{ backgroundColor: themeColor }}
                >
                  <Text className="text-xs text-white font-bold">{activeFilterCount}</Text>
                </View>
              )}
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
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/friends");
                  }}
                  className="px-4 py-2 rounded-xl mt-3"
                  style={{ backgroundColor: themeColor }}
                >
                  <Text className="text-white font-semibold text-sm">Find Friends</Text>
                </Pressable>
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
                      <View
                        className="w-6 h-6 rounded-full overflow-hidden mr-2"
                        style={{ backgroundColor: `${themeColor}30` }}
                      >
                        {friendship.friend.image ? (
                          <Image source={{ uri: friendship.friend.image }} className="w-full h-full" />
                        ) : (
                          <View className="w-full h-full items-center justify-center">
                            <Text className="text-xs font-bold" style={{ color: themeColor }}>
                              {friendship.friend.name?.[0] ?? "?"}
                            </Text>
                          </View>
                        )}
                      </View>
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
                    // P0 FIX: Range normalization - ensure endDate >= startDate
                    if (endDate < date) {
                      const newEnd = new Date(date);
                      newEnd.setDate(newEnd.getDate() + 7);
                      setEndDate(newEnd);
                      if (__DEV__) {
                        devLog('[P0_WHOS_FREE_DATE] range_normalized', {
                          startDateISO: formatLocalDate(date),
                          endDateISO: formatLocalDate(newEnd),
                          normalized: true,
                          reason: 'clamp_end_after_start_change',
                        });
                      }
                    } else if (__DEV__) {
                      devLog('[P0_WHOS_FREE_DATE] start_changed', {
                        startDateISO: formatLocalDate(date),
                        endDateISO: formatLocalDate(endDate),
                        normalized: false,
                        reason: 'user_changed_start',
                      });
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
                    // P0 FIX: Clamp endDate to be >= startDate (DateTimePicker minimumDate should handle this, but be safe)
                    const clampedDate = date < startDate ? startDate : date;
                    setEndDate(clampedDate);
                    if (__DEV__) {
                      devLog('[P0_WHOS_FREE_DATE] end_changed', {
                        startDateISO: formatLocalDate(startDate),
                        endDateISO: formatLocalDate(clampedDate),
                        normalized: date < startDate,
                        reason: date < startDate ? 'clamp_end' : 'user_changed_end',
                      });
                    }
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

                {isLoadingSuggestions ? (
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
                      No available times found
                    </Text>
                    <Text className="text-center mt-1 text-xs" style={{ color: colors.textSecondary }}>
                      Try a different date range or fewer people
                    </Text>
                  </View>
                ) : (
                  <View>
                    {suggestedSlots.slice(0, 5).map((slot, index) => {
                      const { date: slotDate, time } = formatTimeSlot(slot);
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
                                available
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
