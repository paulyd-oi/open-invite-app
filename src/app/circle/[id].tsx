import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Platform,
  FlatList,
  RefreshControl,
  Modal,
  Keyboard,
  Share,
  Dimensions,
  Switch,
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  AppState,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ViewToken,
} from "react-native";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";
import { shouldMaskEvent, getEventDisplayFields } from "@/lib/eventVisibility";
import { circleKeys } from "@/lib/circleQueryKeys";
import { useLoadedOnce } from "@/lib/loadingInvariant";
import { safeAppendMessage, buildOptimisticMessage, retryFailedMessage, safePrependMessages } from "@/lib/pushRouter";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  MessageCircle,
  Calendar,
  MapPin,
  Users,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Settings,
  X,
  CalendarPlus,
  UserPlus,
  Check,
  UserCheck,
  BellOff,
  Bell,
  RefreshCw,
  Camera,
  Lock,
  type LucideIcon,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import BottomSheet from "@/components/BottomSheet";
import DayAgendaSheet from "@/components/DayAgendaSheet";
import { UserListRow } from "@/components/UserListRow";
import { HelpSheet, HELP_SHEETS } from "@/components/HelpSheet";
import { CirclePhotoEmoji } from "@/components/CirclePhotoEmoji";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";
import { once } from "@/lib/runtimeInvariants";

import { useSession } from "@/lib/useSession";
import { EntityAvatar } from "@/components/EntityAvatar";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { setActiveCircle } from "@/lib/activeCircle";
import { uploadCirclePhoto } from "@/lib/imageUpload";
import { getCircleMessages, setCircleReadHorizon } from "@/lib/circlesApi";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, canAddCircleMember, trackAnalytics, type PaywallContext } from "@/lib/entitlements";
import { computeSchedule } from "@/lib/scheduling/engine";
import { buildBusyWindowsFromMemberEvents } from "@/lib/scheduling/adapters";
import type { SchedulingSlotResult } from "@/lib/scheduling/types";
import { formatSlotAvailability, formatSlotAvailabilityCompact, hasPerfectAvailability } from "@/lib/scheduling/format";
import {
  type SuggestedHoursPreset,
  getSuggestedHoursForPreset,
  isOvernightWindow,
  rankSlotsForPreset,
  loadSuggestedHoursPreset,
  saveSuggestedHoursPreset,
  PRESET_LABELS,
  ALL_PRESETS,
} from "@/lib/quietHours";
import {
  type GetCircleDetailResponse,
  type GetCircleMessagesResponse,
  type CircleMessage,
  type Circle,
  type GetFriendsResponse,
  type Friendship,
} from "@/shared/contracts";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Icon components using Ionicons
const TrashIcon: LucideIcon = ({ color, size = 24, style }) => (
  <Ionicons name="trash-outline" size={size} color={color} style={style} />
);

const WarningIcon: LucideIcon = ({ color, size = 24, style }) => (
  <Ionicons name="warning-outline" size={size} color={color} style={style} />
);

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// Mini Calendar Component (similar to FeedCalendar)
function MiniCalendar({
  memberEvents,
  members,
  themeColor,
  colors,
  isDark,
  onSelectDate,
  circleId,
  currentUserId,
}: {
  memberEvents: Array<{ userId: string; events: Array<any> }>;
  members: Circle["members"];
  themeColor: string;
  colors: any;
  isDark: boolean;
  onSelectDate?: (date: Date, events: any[]) => void;
  circleId: string;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SchedulingSlotResult | null>(null);
  const [showBestTimeSheet, setShowBestTimeSheet] = useState(false);
  const [showAllAvailability, setShowAllAvailability] = useState(false);
  const [bestTimesDate, setBestTimesDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [quietPreset, setQuietPreset] = useState<SuggestedHoursPreset>("default");
  const [showPresetPicker, setShowPresetPicker] = useState(false);

  // Load persisted suggested-hours preset on mount
  useEffect(() => {
    loadSuggestedHoursPreset().then((p) => setQuietPreset(p));
  }, []);

  // Create member color map
  const memberColors = ["#FF6B4A", "#4ECDC4", "#9333EA", "#F59E0B", "#10B981", "#EC4899"];
  const memberColorMap = useMemo(() =>
    new Map(members.map((m, i) => [m.userId, memberColors[i % memberColors.length]])),
    [members]
  );

  // Get events for a specific date (deduped by event ID)
  const getEventsForDate = useCallback((date: Date) => {
    const eventMap = new Map<string, {
      id: string;
      title: string;
      emoji: string;
      startTime: string;
      endTime: string | null;
      location: string | null;
      userId: string;
      color: string;
      userName: string;
      attendingMemberIds: string[];
      isPrivate: boolean;
      isBusy?: boolean;
    }>();

    memberEvents.forEach((memberData) => {
      memberData.events
        .filter((e) => {
          const eventDate = new Date(e.startTime);
          return eventDate.toDateString() === date.toDateString();
        })
        .forEach((e) => {
          if (!eventMap.has(e.id)) {
            // First time seeing this event - add it
            // P0 PRIVACY: Use centralized masking logic for busy/private events
            const isOwner = memberData.userId === currentUserId;
            const shouldMask = shouldMaskEvent({
              isBusy: e.isBusy,
              isWork: e.isWork,
              isOwn: isOwner,
            }, isOwner);
            
            // Get display fields using centralized helper
            const displayFields = getEventDisplayFields({
              title: e.title,
              emoji: e.emoji,
              location: e.location,
              description: e.description,
              isBusy: e.isBusy,
              isWork: e.isWork,
              isOwn: isOwner,
            }, isOwner);

            // [P0_CIRCLES_EVENT_GUARD] Preserve backend isPrivate — OR with shouldMask
            // so events the backend marks private stay untappable even when isBusy/isWork are missing
            const derivedPrivate = shouldMask || !!e.isPrivate;

            eventMap.set(e.id, {
              ...e,
              title: displayFields.displayTitle,
              emoji: displayFields.displayEmoji,
              location: displayFields.displayLocation,
              userId: memberData.userId,
              color: memberColorMap.get(memberData.userId) ?? themeColor,
              userName: members.find(m => m.userId === memberData.userId)?.user.name ?? "Unknown",
              attendingMemberIds: [memberData.userId],
              isPrivate: derivedPrivate,
              isBusy: e.isBusy,
            });
          } else {
            // Already have this event - just add this member to attendees
            const existing = eventMap.get(e.id)!;
            if (!existing.attendingMemberIds.includes(memberData.userId)) {
              existing.attendingMemberIds.push(memberData.userId);
            }
          }
        });
    });

    return Array.from(eventMap.values());
  }, [memberEvents, memberColorMap, members, themeColor, currentUserId]);

  // Get event data for current month (deduped by event ID)
  const eventDataByDate = useMemo(() => {
    const data: Record<number, { colors: string[]; count: number; eventIds: Set<string> }> = {};

    memberEvents.forEach((memberData) => {
      memberData.events.forEach((event) => {
        const eventDate = new Date(event.startTime);
        if (eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear) {
          const day = eventDate.getDate();
          if (!data[day]) {
            data[day] = { colors: [], count: 0, eventIds: new Set() };
          }
          // Only count each unique event once
          if (!data[day].eventIds.has(event.id)) {
            data[day].eventIds.add(event.id);
            data[day].count++;
          }
          const color = memberColorMap.get(memberData.userId) ?? themeColor;
          if (data[day].colors.length < 3 && !data[day].colors.includes(color)) {
            data[day].colors.push(color);
          }
        }
      });
    });

    return data;
  }, [memberEvents, currentMonth, currentYear, memberColorMap, themeColor]);

  // [SCHED_INVAR_V1] SSOT: compute availability via scheduling engine
  const scheduleResult = useMemo(() => {
    const now = new Date();
    const rangeStart = now.toISOString();
    const rangeEndDate = new Date(now);
    rangeEndDate.setDate(rangeEndDate.getDate() + 14);
    const rangeEnd = rangeEndDate.toISOString();

    // Build busy windows from memberEvents via SSOT adapter
    const busyWindowsByUserId = buildBusyWindowsFromMemberEvents(memberEvents);

    return computeSchedule({
      members: members.map((m) => ({ id: m.userId })),
      busyWindowsByUserId,
      rangeStart,
      rangeEnd,
      intervalMinutes: 30,
      slotDurationMinutes: 60,
      maxTopSlots: 1000, // Return all slots so per-day dot indicators can be derived
    });
  }, [memberEvents, members]);

  // Per-date availability for the "Best time to meet" sheet
  const dateScheduleResult = useMemo(() => {
    const dayStart = new Date(bestTimesDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(bestTimesDate);
    dayEnd.setHours(23, 59, 59, 999);
    const busyWindowsByUserId = buildBusyWindowsFromMemberEvents(memberEvents);
    return computeSchedule({
      members: members.map((m) => ({ id: m.userId })),
      busyWindowsByUserId,
      rangeStart: dayStart.toISOString(),
      rangeEnd: dayEnd.toISOString(),
      intervalMinutes: 30,
      slotDurationMinutes: 60,
      maxTopSlots: 1000, // Parity with 14-day pool — prevents false-empty after suggested-hours filter
    });
  }, [memberEvents, members, bestTimesDate]);

  // Suggested hours filter + social ranking via SSOT (src/lib/quietHours.ts)
  const quietWindow = getSuggestedHoursForPreset(quietPreset);
  const quietSlots = useMemo(() => {
    const raw = dateScheduleResult?.topSlots ?? [];
    return rankSlotsForPreset(raw, quietPreset);
  }, [dateScheduleResult, bestTimesDate, quietPreset]);
  const quietBestSlot = quietSlots[0] ?? null;
  const quietHasPerfectOverlap = quietBestSlot ? hasPerfectAvailability(quietBestSlot.availableCount, quietBestSlot.totalMembers) : false;

  // DEV proof: single canonical log on sheet-open or date/preset change
  useEffect(() => {
    if (!__DEV__) return;
    if (!showBestTimeSheet) return;
    const overnight = isOvernightWindow(quietWindow);
    devLog('[P1_SUGGESTED_HOURS_PROOF]', {
      preset: quietPreset,
      window: { startHour: quietWindow.startHour, endHour: quietWindow.endHour, overnight },
      date: bestTimesDate.toISOString(),
      rawSlotsCount: dateScheduleResult?.topSlots?.length ?? 0,
      filteredSlotsCount: quietSlots.length,
      membersTotal: members.length,
    });
  }, [showBestTimeSheet, bestTimesDate, dateScheduleResult, quietSlots, quietWindow, quietPreset, members]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfMonth = getFirstDayOfMonth(currentYear, currentMonth);

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }
  const remainingCells = (7 - (calendarDays.length % 7)) % 7;
  for (let i = 0; i < remainingCells; i++) {
    calendarDays.push(null);
  }

  const goToPrevMonth = () => {
    Haptics.selectionAsync();
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    Haptics.selectionAsync();
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleDayPress = (day: number) => {
    Haptics.selectionAsync();
    const date = new Date(currentYear, currentMonth, day);
    setSelectedDate(date);
    setShowDayModal(true);
  };

  const selectedDateEvents = selectedDate
    ? getEventsForDate(selectedDate).sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
    : [];

  return (
    <View className="rounded-xl mb-3" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center">
          <Calendar size={16} color={themeColor} />
          <Text className="font-semibold ml-2 text-sm" style={{ color: colors.text }}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Pressable
            onPress={goToPrevMonth}
            className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
          >
            <ChevronLeft size={16} color={themeColor} />
          </Pressable>
          <Pressable
            onPress={goToNextMonth}
            className="w-7 h-7 rounded-full items-center justify-center ml-1"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
          >
            <ChevronRight size={16} color={themeColor} />
          </Pressable>
        </View>
      </View>

      {/* Day Labels */}
      <View className="flex-row">
        {DAYS.map((day, idx) => (
          <View key={idx} style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "500",
                color: idx === 0 || idx === 6 ? colors.textTertiary : colors.textSecondary
              }}
            >
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View>
        {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIndex) => (
          <View key={weekIndex} className="flex-row">
            {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
              const index = weekIndex * 7 + dayIndex;
              const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
              const eventData = day ? eventDataByDate[day] : null;
              const dayOfWeek = index % 7;
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

              return (
                <View key={index} style={{ flex: 1, alignItems: "center" }}>
                  {day === null ? (
                    <View style={{ height: 32 }} />
                  ) : (
                    <Pressable
                      onPress={() => handleDayPress(day)}
                      style={{ height: 32, width: "100%", alignItems: "center", justifyContent: "center" }}
                    >
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: isToday ? themeColor : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isWeekend ? "400" : "600",
                            color: isToday ? "#fff" : isWeekend ? colors.textTertiary : colors.text,
                          }}
                        >
                          {day}
                        </Text>
                      </View>
                      {/* Event dots */}
                      {eventData && !isToday && (
                        <View style={{ flexDirection: "row", alignItems: "center", position: "absolute", bottom: 2 }}>
                          {eventData.colors.slice(0, 3).map((color, colorIdx) => (
                            <View
                              key={colorIdx}
                              style={{
                                width: 3,
                                height: 3,
                                borderRadius: 1.5,
                                marginHorizontal: 0.5,
                                backgroundColor: color,
                              }}
                            />
                          ))}
                        </View>
                      )}
                      {eventData && isToday && (
                        <View
                          style={{
                            position: "absolute",
                            bottom: 2,
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: "#fff"
                          }}
                        />
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* Smart Scheduling v1 — SSOT via bestTimesDate + dateScheduleResult */}
      {scheduleResult && scheduleResult.topSlots.length > 0 && (
        <View style={{ marginTop: 2, paddingTop: 2, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setShowBestTimeSheet(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${quietHasPerfectOverlap ? "Everyone's free" : "Best times to meet"}. Tap to view.`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 2,
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: 8,
              backgroundColor: pressed
                ? (quietHasPerfectOverlap ? "#10B98118" : (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"))
                : (quietHasPerfectOverlap ? "#10B98110" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)")),
            })}
          >
            <View>
              <Text style={{ fontSize: 12, fontWeight: "600", color: quietHasPerfectOverlap ? "#10B981" : colors.textSecondary }}>
                {quietHasPerfectOverlap ? "Everyone's free" : "Best times"}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>Tap to see best times</Text>
            </View>
          </Pressable>

          {/* Day selector chips — SSOT: sets bestTimesDate */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 2 }} contentContainerStyle={{ paddingRight: 4 }}>
            {Array.from({ length: 14 }, (_, i) => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              d.setDate(d.getDate() + i);
              const isSelected = d.toDateString() === bestTimesDate.toDateString();
              const dayAbbr = d.toLocaleDateString("en-US", { weekday: "short" });
              const dayNum = d.getDate();
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setBestTimesDate(d);
                    setShowBestTimeSheet(true);
                  }}
                  style={{
                    alignItems: "center",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginRight: 5,
                    borderRadius: 8,
                    backgroundColor: isSelected
                      ? (isDark ? themeColor + "30" : themeColor + "18")
                      : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
                    borderWidth: isSelected ? 1 : 0,
                    borderColor: isSelected ? themeColor : "transparent",
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "500", color: isSelected ? themeColor : colors.textTertiary }}>{dayAbbr}</Text>
                  <Text style={{ fontSize: 12, fontWeight: isSelected ? "700" : "500", color: isSelected ? themeColor : colors.text }}>{dayNum}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Best Time to Meet Sheet */}
          <BottomSheet
            visible={showBestTimeSheet}
            onClose={() => { setShowBestTimeSheet(false); setShowAllAvailability(false); }}
            title="Best time to meet"
            heightPct={0}
            maxHeightPct={0.75}
            backdropOpacity={0.45}
          >
            <ScrollView style={{ paddingHorizontal: 16, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 13, color: colors.textTertiary, marginBottom: 8 }}>
                Based on availability shared in this circle
              </Text>

              {/* Suggested hours row */}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowPresetPicker((v) => !v);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  marginBottom: 12,
                  borderRadius: 10,
                  backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
                }}
              >
                <View>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Suggested hours</Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                    {PRESET_LABELS[quietPreset].range}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "500", color: themeColor }}>Change</Text>
              </Pressable>
              <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: -8, marginBottom: 12, paddingHorizontal: 4 }}>
                We only recommend times within these hours.
              </Text>

              {/* Inline preset picker */}
              {showPresetPicker && (
                <View style={{ marginBottom: 12, borderRadius: 10, overflow: "hidden", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" }}>
                  {ALL_PRESETS.map((p) => {
                    const isActive = p === quietPreset;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setQuietPreset(p);
                          saveSuggestedHoursPreset(p);
                          setShowPresetPicker(false);
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderBottomWidth: 0.5,
                          borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        }}
                      >
                        <View>
                          <Text style={{ fontSize: 14, fontWeight: isActive ? "600" : "400", color: isActive ? themeColor : colors.text }}>
                            {PRESET_LABELS[p].label}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textTertiary }}>{PRESET_LABELS[p].range}</Text>
                        </View>
                        {isActive && <Check size={16} color={themeColor} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Date selector row */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    const prev = new Date(bestTimesDate);
                    prev.setDate(prev.getDate() - 1);
                    prev.setHours(0, 0, 0, 0);
                    setBestTimesDate(prev);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ padding: 6 }}
                >
                  <ChevronLeft size={18} color={colors.text} />
                </Pressable>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>
                  {bestTimesDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </Text>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    const next = new Date(bestTimesDate);
                    next.setDate(next.getDate() + 1);
                    next.setHours(0, 0, 0, 0);
                    setBestTimesDate(next);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ padding: 6 }}
                >
                  <ChevronRight size={18} color={colors.text} />
                </Pressable>
              </View>

              {/* Recommended section or empty state — filtered to quiet hours */}
              {quietSlots.length > 0 ? (
                <>
                  <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 0.5, color: colors.textTertiary, textTransform: "uppercase", marginBottom: 10 }}>
                    Recommended
                  </Text>
                  {quietSlots.map((slot, idx) => {
                    const slotDate = new Date(slot.start);
                    const endDate = new Date(slot.end);
                    const timeLabel = slotDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                    const endTimeLabel = endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                    const rankLabel = idx === 0 ? "Best" : idx === 1 ? "Good" : "Option";
                    const rankColor = idx === 0 ? "#10B981" : idx === 1 ? themeColor : colors.textSecondary;
                    return (
                      <Pressable
                        key={`best-${idx}`}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                          if (__DEV__) devLog('[P1_PREFILL_EVENT]', { slotStart: slot.start, slotEnd: slot.end, circleId });
                          setShowBestTimeSheet(false);
                          setShowAllAvailability(false);
                          router.push({
                            pathname: "/create",
                            params: {
                              date: slot.start,
                              endDate: slot.end,
                              circleId: circleId,
                            },
                          } as any);
                        }}
                        onLongPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSelectedSlot(slot);
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          marginBottom: 8,
                          borderRadius: 12,
                          backgroundColor: idx === 0
                            ? (isDark ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.08)")
                            : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)"),
                        }}
                      >
                        <View style={{ width: 48, marginRight: 10 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: rankColor }}>{rankLabel}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text }}>{timeLabel} {"\u2013"} {endTimeLabel}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: rankColor }}>
                          {formatSlotAvailabilityCompact(slot.availableCount, slot.totalMembers)}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {/* View all toggle */}
                  <Pressable
                    onPress={() => setShowAllAvailability(!showAllAvailability)}
                    style={{ paddingVertical: 10, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "500", color: themeColor }}>
                      {showAllAvailability ? "Hide details" : "View all availability"}
                    </Text>
                  </Pressable>

                  {/* Expanded availability details */}
                  {showAllAvailability && quietSlots.map((slot, idx) => {
                    const slotDate = new Date(slot.start);
                    const timeLabel = slotDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                    return (
                      <View key={`detail-${idx}`} style={{ marginBottom: 12, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text, marginBottom: 4 }}>
                          {timeLabel}
                        </Text>
                        {slot.availableUserIds.map((uid) => {
                          const m = members.find((mb) => mb.userId === uid);
                          return (
                            <View key={uid} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981", marginRight: 8 }} />
                              <Text style={{ fontSize: 12, color: colors.text }}>{m?.user?.name ?? uid.slice(-6)}</Text>
                            </View>
                          );
                        })}
                        {slot.unavailableUserIds.map((uid) => {
                          const m = members.find((mb) => mb.userId === uid);
                          return (
                            <View key={uid} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textTertiary, marginRight: 8 }} />
                              <Text style={{ fontSize: 12, color: colors.textTertiary }}>{m?.user?.name ?? uid.slice(-6)}</Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}

                  {/* Create event at best time — uses quietBestSlot (filtered) */}
                  {quietBestSlot && <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      setShowBestTimeSheet(false);
                      setShowAllAvailability(false);
                      const best = quietBestSlot;
                      const durationMin = Math.round((new Date(best.end).getTime() - new Date(best.start).getTime()) / 60000);
                      router.push({
                        pathname: "/create",
                        params: {
                          date: best.start,
                          circleId: circleId,
                          duration: String(durationMin),
                        },
                      } as any);
                    }}
                    style={{
                      marginTop: 12,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: themeColor,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff" }}>Create event at best time</Text>
                  </Pressable>}
                </>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: 6 }}>No shared free times</Text>
                  <Text style={{ fontSize: 13, color: colors.textTertiary, marginBottom: 16 }}>Try another day.</Text>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      setShowBestTimeSheet(false);
                      router.push({ pathname: "/create", params: { circleId: circleId } } as any);
                    }}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 24,
                      borderRadius: 12,
                      backgroundColor: themeColor,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff" }}>Create an event anyway</Text>
                  </Pressable>
                </View>
              )}

              {/* Privacy disclaimer */}
              <Text style={{ fontSize: 12, lineHeight: 16, color: colors.textTertiary, marginTop: 16, textAlign: "center" }}>
                {"\u201CEveryone\u2019s free\u201D is based on availability shared in the app and may not always be exact. Times outside your suggested hours are hidden."}
              </Text>
              <Text style={{ fontSize: 11, lineHeight: 15, color: colors.textTertiary, marginTop: 6, textAlign: "center" }}>
                Suggested hours can be changed in Best time to meet.
              </Text>
            </ScrollView>
          </BottomSheet>

          {/* Slot Availability Bottom Sheet */}
          <BottomSheet
            visible={selectedSlot !== null}
            onClose={() => setSelectedSlot(null)}
            title={selectedSlot ? (() => {
              const d = new Date(selectedSlot.start);
              return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            })() : ""}
            heightPct={0}
            maxHeightPct={0.6}
            backdropOpacity={0.5}
          >
            {selectedSlot && (
              <ScrollView style={{ paddingHorizontal: 20 }}>
                {/* Subheader */}
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
                  {formatSlotAvailability(selectedSlot.availableCount, selectedSlot.totalMembers)}
                </Text>

                {/* Available section */}
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#10B981", marginBottom: 6 }}>
                  Available ({selectedSlot.availableCount})
                </Text>
                {selectedSlot.availableUserIds.map((uid) => {
                  const m = members.find((mb) => mb.userId === uid);
                  return (
                    <View key={uid} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981", marginRight: 8 }} />
                      <Text style={{ fontSize: 13, color: colors.text }}>{m?.user?.name ?? uid.slice(-6)}</Text>
                    </View>
                  );
                })}

                {/* Busy section */}
                {selectedSlot.unavailableUserIds.length > 0 && (
                  <>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textTertiary, marginTop: 12, marginBottom: 6 }}>
                      Busy ({selectedSlot.unavailableUserIds.length})
                    </Text>
                    {selectedSlot.unavailableUserIds.map((uid) => {
                      const m = members.find((mb) => mb.userId === uid);
                      return (
                        <View key={uid} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textTertiary, marginRight: 8 }} />
                          <Text style={{ fontSize: 13, color: colors.textTertiary }}>{m?.user?.name ?? uid.slice(-6)}</Text>
                        </View>
                      );
                    })}
                  </>
                )}


              </ScrollView>
            )}
          </BottomSheet>
        </View>
      )}

      {/* Empty state: no shared free times */}
      {!scheduleResult && (
        <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 11, color: colors.textTertiary }}>No shared free times yet</Text>
        </View>
      )}

      {/* Member Legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
        {members.slice(0, 5).map((member) => (
          <View key={member.userId} style={{ flexDirection: "row", alignItems: "center", marginRight: 10, marginBottom: 2 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                marginRight: 4,
                backgroundColor: memberColorMap.get(member.userId)
              }}
            />
            <Text style={{ fontSize: 10, color: colors.textSecondary }}>
              {member.user.name?.split(" ")[0] ?? "Unknown"}
            </Text>
          </View>
        ))}
      </View>

      {/* Day Agenda – SSOT shared sheet */}
      <DayAgendaSheet
        visible={showDayModal}
        onClose={() => setShowDayModal(false)}
        selectedDate={selectedDate}
        eventCount={selectedDateEvents.length}
        themeColor={themeColor}
      >
        {(() => {
          // PART B — Split events into masked-busy vs visible buckets
          const maskedBusyEvents: typeof selectedDateEvents = [];
          const visibleEvents: typeof selectedDateEvents = [];
          for (const event of selectedDateEvents) {
            const viewerIsOwner = event.userId === currentUserId;
            const maskedBusy = shouldMaskEvent(
              { isBusy: event.isBusy, isWork: false, isOwn: viewerIsOwner },
              viewerIsOwner
            ) || (event.isPrivate && !viewerIsOwner);
            if (maskedBusy) {
              maskedBusyEvents.push(event);
            } else {
              visibleEvents.push(event);
            }
          }

          // PART C — Group masked-busy events per person
          const busyGroupMap = new Map<string, {
            ownerName: string;
            ranges: { start: string; end: string | null }[];
          }>();
          for (const ev of maskedBusyEvents) {
            const key = ev.userId || ev.userName || "unknown";
            if (!busyGroupMap.has(key)) {
              busyGroupMap.set(key, {
                ownerName: ev.userName || "Someone",
                ranges: [],
              });
            }
            busyGroupMap.get(key)!.ranges.push({
              start: ev.startTime,
              end: ev.endTime,
            });
          }
          // Sort each group's ranges by start time
          for (const group of busyGroupMap.values()) {
            group.ranges.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
          }
          const busyGroups = Array.from(busyGroupMap.values());

          // Time formatting helper
          const fmtTime = (iso: string) =>
            new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

          // All-day detection: treat as all-day if span covers essentially the whole selected day
          const isAllDay = (start: string, end: string | null): boolean => {
            if (!end) return false;
            const s = new Date(start);
            const e = new Date(end);
            // Heuristic 1: duration >= 23h 30m
            if (e.getTime() - s.getTime() >= 23.5 * 60 * 60 * 1000) return true;
            // Heuristic 2: start <= startOfDay + 30min AND end >= endOfDay - 30min
            if (selectedDate) {
              const dayStart = new Date(selectedDate);
              dayStart.setHours(0, 0, 0, 0);
              const dayEnd = new Date(selectedDate);
              dayEnd.setHours(23, 59, 59, 999);
              const EPSILON = 30 * 60 * 1000; // 30 minutes
              if (s.getTime() <= dayStart.getTime() + EPSILON && e.getTime() >= dayEnd.getTime() - EPSILON) return true;
            }
            return false;
          };

          const fmtRange = (r: { start: string; end: string | null }) => {
            if (isAllDay(r.start, r.end)) return "All day";
            return r.end ? `${fmtTime(r.start)}\u2013${fmtTime(r.end)}` : fmtTime(r.start);
          };

          const buildRangeString = (ranges: { start: string; end: string | null }[]) => {
            const MAX_DISPLAY = 2;
            const displayed = ranges.slice(0, MAX_DISPLAY).map(fmtRange);
            const extra = ranges.length - MAX_DISPLAY;
            return extra > 0
              ? `${displayed.join(", ")} +${extra} more ${extra === 1 ? "block" : "blocks"}`
              : displayed.join(", ");
          };

          // DEV proof logs
          let allDayCount = 0;
          let overflowCount = 0;
          for (const g of busyGroups) {
            allDayCount += g.ranges.filter(r => isAllDay(r.start, r.end)).length;
            if (g.ranges.length > 2) overflowCount++;
          }
          if (__DEV__) {
            devLog('[P0_BUSY_SUMMARY_POLISH]', {
              groups: busyGroups.length,
              allDayCount,
              overflowCount,
            });
            if (busyGroups.length > 0) {
              const first = busyGroups[0];
              devLog('[P0_BUSY_SUMMARY_FMT]', { ownerName: first.ownerName, ranges: buildRangeString(first.ranges) });
            }
          }

          return (
            <>
              {/* INV_BUSY_SUM_2/3: Per-person busy summary rows */}
              {busyGroups.length > 0 && (
                <>
                  <Text style={{
                    fontSize: 10,
                    fontWeight: "600",
                    letterSpacing: 1,
                    color: colors.textTertiary,
                    marginBottom: 6,
                    marginTop: 2,
                  }}>
                    BUSY BLOCKS
                  </Text>
                  {busyGroups.map((group, gIdx) => (
                    <View
                      key={`busy-group-${gIdx}`}
                      style={{
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 8,
                        backgroundColor: isDark ? "rgba(44,44,46,0.7)" : "rgba(249,250,251,0.8)",
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 8, backgroundColor: isDark ? "rgba(156,163,175,0.5)" : "rgba(156,163,175,0.6)" }} />
                        <Text style={{ fontWeight: "500", flex: 1, color: colors.textSecondary }} numberOfLines={1}>
                          {`${group.ownerName} is busy`}
                        </Text>
                        <Lock size={12} color={colors.textTertiary} />
                      </View>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4, marginLeft: 18 }} numberOfLines={1}>
                        {buildRangeString(group.ranges)}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {/* Visible (non-busy) event rows — unchanged behavior */}
              {visibleEvents.map((event, index) => (
                <Pressable
                  key={event.id}
                  onPress={() => {
                    if (__DEV__) {
                      devLog('[P0_VISIBILITY] Circle mini calendar tap navigating:', {
                        sourceSurface: 'circle-mini',
                        eventIdPrefix: event.id?.slice(0, 6),
                        hostIdPrefix: event.userId?.slice(0, 6),
                        isBusy: false,
                        viewerFriendOfHost: 'unknown',
                        decision: 'navigating_to_event_details',
                        reason: 'tap_allowed_event_will_gate',
                      });
                    }
                    const eventId = event.id;
                    if (!eventId || typeof eventId !== 'string' || eventId.length < 10) {
                      if (__DEV__) {
                        devLog('[P0_CIRCLES_EVENT_GUARD] blocked navigation: invalid eventId', {
                          eventId: eventId ?? 'missing',
                          eventTitle: event.title,
                          circleId,
                        });
                      }
                      return;
                    }
                    if (__DEV__) {
                      devLog('[P0_CIRCLES_EVENT_TRACE]', {
                        circleId,
                        eventId,
                        requestUrl: `/api/events/${eventId}`,
                        eventTitle: event.title,
                        isPrivate: event.isPrivate,
                      });
                    }
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowDayModal(false);
                    router.push(`/event/${eventId}` as any);
                  }}
                >
                  <Animated.View
                    entering={FadeInDown.delay((busyGroups.length + index) * 50).springify()}
                    style={{
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB"
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          marginRight: 8,
                          backgroundColor: event.color || themeColor
                        }}
                      />
                      <Text style={{ fontWeight: "500", flex: 1, color: colors.text }} numberOfLines={1}>
                        {event.title}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                        {event.endTime
                          ? `${fmtTime(event.startTime)} – ${fmtTime(event.endTime)}`
                          : fmtTime(event.startTime)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, marginLeft: 18 }}>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        {event.attendingMemberIds.length > 1
                          ? `${event.attendingMemberIds.length} attending`
                          : event.userName}
                      </Text>
                      {event.location && (
                        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 10, flex: 1 }}>
                          <MapPin size={10} color={colors.textTertiary} />
                          <Text style={{ fontSize: 11, marginLeft: 3, color: colors.textTertiary }} numberOfLines={1}>
                            {event.location}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Animated.View>
                </Pressable>
              ))}
            </>
          );
        })()}
      </DayAgendaSheet>
    </View>
  );
}

// Date separator label helper
function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = today.getTime() - msgDay.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const month = d.toLocaleDateString(undefined, { month: "short" });
  const day = d.getDate();
  if (d.getFullYear() !== now.getFullYear()) return `${month} ${day}, ${d.getFullYear()}`;
  return `${month} ${day}`;
}

// Message Bubble Component
function MessageBubble({
  message,
  isOwn,
  themeColor,
  colors,
  isDark,
  onRetry,
  onLongPress,
  onPress,
  isRunContinuation,
  showTimestamp,
  reactions,
  editedContent,
  isDeleted,
}: {
  message: CircleMessage & { status?: string; retryCount?: number; clientMessageId?: string };
  isOwn: boolean;
  themeColor: string;
  colors: any;
  isDark: boolean;
  onRetry?: () => void;
  onLongPress?: () => void;
  onPress?: () => void;
  isRunContinuation?: boolean;
  showTimestamp?: boolean;
  reactions?: string[];
  editedContent?: string;
  isDeleted?: boolean;
}) {
  const isSystemMessage = message.content.startsWith("📅");
  const isSending = (message as any).status === "sending";
  const isFailed = (message as any).status === "failed";
  const isSent = (message as any).status === "sent" || (!isSending && !isFailed);
  // Guard: prevent onPress firing after onLongPress
  const longPressFiredRef = useRef(false);

  if (isSystemMessage) {
    return (
      <View className="items-center my-2">
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
        onPress?.();
      }}
      onLongPress={() => {
        longPressFiredRef.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress?.();
      }}
      delayLongPress={400}
    >
    <View className={`${isRunContinuation ? "mb-0.5" : "mb-3"} ${isOwn ? "items-end" : "items-start"}`}>
      <View className={`flex-row items-end ${isOwn ? "flex-row-reverse" : ""}`}>
        {!isOwn && !isRunContinuation && (
          <View
            className="w-7 h-7 rounded-full overflow-hidden mr-2"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
          >
            <EntityAvatar
              photoUrl={message.user.image}
              initials={message.user.name?.[0] ?? "?"}
              size={28}
              backgroundColor={message.user.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "20"}
              foregroundColor={themeColor}
            />
          </View>
        )}
        {/* Spacer to keep alignment when avatar is hidden in a run */}
        {!isOwn && isRunContinuation && <View style={{ width: 36 }} />}
        <View style={{ maxWidth: "75%" }}>
          {!isOwn && !isRunContinuation && (
            <Text className="text-xs mb-1 ml-1" style={{ color: colors.textTertiary }}>
              {message.user.name?.split(" ")[0] ?? "Unknown"}
            </Text>
          )}
          <View
            className={`rounded-2xl px-4 py-2.5 ${isOwn ? "rounded-br-md" : "rounded-bl-md"}`}
            style={{
              backgroundColor: isOwn ? themeColor : isDark ? "#2C2C2E" : "#F3F4F6",
              opacity: isSending ? 0.7 : isFailed ? 0.5 : /* isSent */ 1,
            }}
          >
            {isDeleted ? (
              <Text style={{ fontStyle: "italic", color: isOwn ? "rgba(255,255,255,0.5)" : colors.textTertiary }}>Message deleted</Text>
            ) : (
              <>
                {message.reply && (
                  <View style={{ marginBottom: 4, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: isOwn ? "rgba(255,255,255,0.25)" : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)") }}>
                    <Text style={{ fontSize: 12, fontStyle: "italic", color: isOwn ? "rgba(255,255,255,0.8)" : colors.textSecondary }} numberOfLines={1}>
                      ↩︎ {message.reply.userName}: {message.reply.snippet}
                    </Text>
                  </View>
                )}
                <Text style={{ color: isOwn ? "#fff" : colors.text }}>{editedContent ?? message.content}</Text>
              </>
            )}
          </View>
          {/* [P2_CHAT_REACTIONS] Reaction chips */}
          {!isDeleted && reactions && reactions.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2, ...(isOwn ? { justifyContent: "flex-end", marginRight: 2 } : { marginLeft: 2 }) }}>
              {reactions.map((emoji) => (
                <View
                  key={emoji}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                    borderRadius: 10,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    marginRight: 4,
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>{emoji}</Text>
                  <Text style={{ fontSize: 10, marginLeft: 2, color: colors.textTertiary }}>1</Text>
                </View>
              ))}
            </View>
          )}
          {showTimestamp && (
          <View className={`flex-row items-center mt-1 ${isOwn ? "justify-end mr-1" : "ml-1"}`}>
            <Text className="text-[10px]" style={{ color: colors.textTertiary }}>
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </Text>
            {editedContent && !isDeleted && (
              <Text className="text-[10px] ml-1" style={{ color: colors.textTertiary, fontStyle: "italic" }}>(edited)</Text>
            )}
            {isSending && !isSent && (
              <Text className="text-[10px] ml-1" style={{ color: colors.textTertiary }}>Sending…</Text>
            )}
            {isFailed && !isSent && onRetry && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onRetry();
                }}
                className="flex-row items-center ml-1.5"
                hitSlop={8}
              >
                <RefreshCw size={10} color="#EF4444" />
                <Text className="text-[10px] ml-0.5" style={{ color: "#EF4444" }}>Retry</Text>
              </Pressable>
            )}
          </View>
          )}
          {/* Always show status indicators even when timestamp is hidden */}
          {!showTimestamp && (isSending || isFailed) && (
          <View className={`flex-row items-center mt-1 ${isOwn ? "justify-end mr-1" : "ml-1"}`}>
            {isSending && !isSent && (
              <Text className="text-[10px]" style={{ color: colors.textTertiary }}>Sending…</Text>
            )}
            {isFailed && !isSent && onRetry && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onRetry();
                }}
                className="flex-row items-center"
                hitSlop={8}
              >
                <RefreshCw size={10} color="#EF4444" />
                <Text className="text-[10px] ml-0.5" style={{ color: "#EF4444" }}>Retry</Text>
              </Pressable>
            )}
          </View>
          )}
        </View>
      </View>
    </View>
    </Pressable>
  );
}

export default function CircleScreen() {
  const { id, draftMessage, draftVariants: draftVariantsRaw } = useLocalSearchParams<{ id: string; draftMessage?: string; draftVariants?: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  const pendingScrollRef = useRef(false);
  // [P0_CHAT_ANCHOR] Scroll metrics for QA snapshot
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const AUTO_SCROLL_THRESHOLD = 120;
  const unseenCountRef = useRef(0);
  const [unseenCount, setUnseenCount] = useState(0);
  const prevMessageCountRef = useRef<number | null>(null);

  const bumpUnseen = useCallback((delta: number) => {
    unseenCountRef.current = Math.max(0, unseenCountRef.current + delta);
    setUnseenCount(unseenCountRef.current);
  }, []);

  const clearUnseen = useCallback(() => {
    unseenCountRef.current = 0;
    setUnseenCount(0);
  }, []);

  // [P1_CHAT_PILL] Log when pill becomes visible
  useEffect(() => {
    if (__DEV__ && unseenCount > 0) {
      devLog("[P1_CHAT_PILL]", "pill_show", { unseen: unseenCount });
    }
  }, [unseenCount > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // [P2_CHAT_SCROLL_BTN] Scroll-to-bottom button state
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const prevScrollBtnVisibleRef = useRef(false);

  // [P2_CHAT_SCROLL_BTN] Hide button when unseen pill takes over
  useEffect(() => {
    if (unseenCount > 0 && prevScrollBtnVisibleRef.current) {
      prevScrollBtnVisibleRef.current = false;
      setShowScrollToBottom(false);
      if (__DEV__) devLog("[P2_CHAT_SCROLL_BTN]", "hide", { reason: "unseen_pill_active" });
    }
  }, [unseenCount]);

  // [P1_CHAT_PAGINATION] Pagination state — compound cursor (createdAt + id)
  const PAGE_SIZE = 30;
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const cursorCreatedAtRef = useRef<string | null>(null);
  const cursorIdRef = useRef<string | null>(null);
  const isPrependingRef = useRef(false);

  // [P1_READ_HORIZON] Monotonic read horizon — only send when strictly newer
  const lastSentReadAtRef = useRef<string | null>(null);

  // Viewability tracking for scroll anchor on prepend
  const firstVisibleIdRef = useRef<string | null>(null);
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!viewableItems?.length) return;
      const first = viewableItems[0]?.item;
      if (first?.id) firstVisibleIdRef.current = first.id;
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;

  // [P1_READ_HORIZON] Send monotonic read horizon to server
  // Reads messages from query cache (not the `circle` local) to avoid declaration-order issues
  const sendReadHorizon = useCallback(
    (reason: string) => {
      if (!id || !isAuthedForNetwork(bootStatus, session)) {
        if (__DEV__) devLog("[P1_READ_HORIZON]", "skip", { reason: "not_authed" });
        return;
      }
      if (isPrependingRef.current) {
        if (__DEV__) devLog("[P1_READ_HORIZON]", "skip", { reason: "prepending" });
        return;
      }
      const cached = queryClient.getQueryData(circleKeys.single(id)) as any;
      const msgs = cached?.circle?.messages;
      if (!msgs?.length) {
        if (__DEV__) devLog("[P1_READ_HORIZON]", "skip", { reason: "no_messages" });
        return;
      }
      // Newest message is last in the sorted array
      const newest = msgs[msgs.length - 1];
      const lastReadAt = newest.createdAt as string;
      // Monotonic guard: only send if strictly newer
      if (lastSentReadAtRef.current && lastReadAt <= lastSentReadAtRef.current) {
        if (__DEV__) devLog("[P1_READ_HORIZON]", "skip", { reason: "not_newer", lastReadAt, lastSent: lastSentReadAtRef.current });
        return;
      }
      lastSentReadAtRef.current = lastReadAt;
      if (__DEV__) devLog("[P1_READ_HORIZON]", "send", { circleId: id, lastReadAt, reason });

      setCircleReadHorizon({ circleId: id, lastReadAt })
        .then((res) => {
          // Optimistic clear — exact per-circle using byCircle SSOT
          queryClient.setQueryData(
            circleKeys.unreadCount(),
            (prev: any) => {
              if (!prev) return prev;
              const currentCircle = (prev.byCircle?.[id!] as number) ?? 0;
              const nextTotal = Math.max(0, ((prev.totalUnread as number) ?? 0) - currentCircle);
              return {
                ...prev,
                totalUnread: nextTotal,
                byCircle: { ...(prev.byCircle ?? {}), [id!]: 0 },
              };
            },
          );
          // Background reconcile — inactive only
          queryClient.invalidateQueries({ queryKey: circleKeys.unreadCount(), refetchType: "inactive" });
          queryClient.invalidateQueries({ queryKey: circleKeys.all(), refetchType: "inactive" });
          if (__DEV__) devLog("[P1_READ_HORIZON]", "ok", {
            endpoint: `/api/circles/${id}/read-horizon`,
            circleId: id,
            providedLastReadAt: lastReadAt,
            serverLastReadAt: res?.lastReadAt,
          });
        })
        .catch((e) => {
          // Non-fatal: horizon will be retried on next trigger
          if (__DEV__) devLog("[P1_READ_HORIZON]", "error", { circleId: id, error: String(e) });
        });
    },
    [id, bootStatus, session, queryClient],
  );

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    // [P0_CHAT_ANCHOR] Store metrics for QA snapshot
    scrollOffsetRef.current = contentOffset.y;
    contentHeightRef.current = contentSize.height;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const wasNearBottom = isNearBottomRef.current;
    isNearBottomRef.current = distanceFromBottom < AUTO_SCROLL_THRESHOLD;
    // [P1_NEW_MSG] Clear indicator when user scrolls back to bottom
    if (!wasNearBottom && isNearBottomRef.current) {
      clearUnseen();
      sendReadHorizon("return_to_bottom");
      if (__DEV__) {
        devLog("[P1_CHAT_PILL]", "pill_clear", { reason: "return_to_bottom" });
      }
    }
    // [P2_CHAT_SCROLL_BTN] Show when scrolled up AND unseen pill not active
    const shouldShow = !isNearBottomRef.current && unseenCountRef.current === 0;
    if (shouldShow !== prevScrollBtnVisibleRef.current) {
      prevScrollBtnVisibleRef.current = shouldShow;
      setShowScrollToBottom(shouldShow);
      if (__DEV__) {
        devLog("[P2_CHAT_SCROLL_BTN]", shouldShow ? "show" : "hide", {
          reason: shouldShow ? "scrolled_up" : isNearBottomRef.current ? "near_bottom" : "unseen_pill_active",
        });
      }
    }
  }, [AUTO_SCROLL_THRESHOLD, clearUnseen, sendReadHorizon]);

  const scheduleAutoScroll = useCallback(() => {
    if (pendingScrollRef.current) return;
    pendingScrollRef.current = true;
    requestAnimationFrame(() => {
      pendingScrollRef.current = false;
      flatListRef.current?.scrollToEnd({ animated: true });
      if (__DEV__) {
        devLog("[P1_SCROLL_ANCHOR]", "auto-scroll");
        devLog("[P0_CHAT_ANCHOR]", "auto_scroll", { scrollY: Math.round(scrollOffsetRef.current), contentH: Math.round(contentHeightRef.current), firstVisibleId: firstVisibleIdRef.current });
      }
    });
  }, []);

  const [message, setMessage] = useState(draftMessage ?? "");

  // Draft variant cycling (from Ideas deck)
  const draftVariants = React.useMemo<string[] | null>(() => {
    if (!draftVariantsRaw) return null;
    try { const arr = JSON.parse(decodeURIComponent(draftVariantsRaw)); return Array.isArray(arr) ? arr : null; } catch { return null; }
  }, [draftVariantsRaw]);
  const variantIndexRef = useRef(0);
  const [showTryAnother, setShowTryAnother] = useState(!!draftVariants);

  // [P2_TYPING_UI] Typing indicator state
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; name: string }>>([]);
  const lastTypingPingRef = useRef<number>(0);
  const prevTypingNonEmptyRef = useRef(false);
  const [showCalendar, setShowCalendar] = useState(true);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [createEventVisibility, setCreateEventVisibility] = useState<"open_invite" | "circle_only">("circle_only");
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showNotifySheet, setShowNotifySheet] = useState(false);
  const [showMembersSheet, setShowMembersSheet] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [selectedMemberToRemove, setSelectedMemberToRemove] = useState<string | null>(null);

  // DEV: Log when selectedMemberToRemove changes
  React.useEffect(() => {
    if (__DEV__) {
      devLog('[CircleRemoveMember] selectedMemberToRemove changed:', {
        selectedMemberToRemove,
        confirmModalShouldBeVisible: !!selectedMemberToRemove,
      });
    }
  }, [selectedMemberToRemove]);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  const [settingsSheetView, setSettingsSheetView] = useState<"settings" | "photo">("settings");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [friendSuggestions, setFriendSuggestions] = useState<Array<{
    newMemberName: string;
    existingMemberName: string;
    newMemberId: string;
  }>>([]);
  const [showFriendSuggestionModal, setShowFriendSuggestionModal] = useState(false);
  const [calendarCollapsedByKeyboard, setCalendarCollapsedByKeyboard] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Paywall state for member limit gating
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("CIRCLE_MEMBERS_LIMIT");

  // Fetch entitlements for gating
  const { data: entitlements } = useEntitlements();

  // Auto-collapse calendar when keyboard shows
  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardWillShow", () => {
      if (showCalendar) {
        setShowCalendar(false);
        setCalendarCollapsedByKeyboard(true);
      }
      // [P1_SCROLL_ANCHOR] keyboard safety: auto-scroll when user is near bottom
      if (isNearBottomRef.current) {
        scheduleAutoScroll();
      }
    });

    const hideSubscription = Keyboard.addListener("keyboardWillHide", () => {
      if (calendarCollapsedByKeyboard) {
        setShowCalendar(true);
        setCalendarCollapsedByKeyboard(false);
      }
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [showCalendar, calendarCollapsedByKeyboard]);

  const { data, isLoading, isFetching, isSuccess, isError, refetch } = useQuery({
    queryKey: circleKeys.single(id),
    queryFn: async () => {
      const response = await api.get<GetCircleDetailResponse>(`/api/circles/${id}`);
      // [P0_MUTE_TOGGLE] Carry forward cached isMuted when backend omits it.
      // The detail endpoint declares isMuted as optional; when it returns undefined
      // the 10s poll (or any invalidation-triggered refetch) would overwrite the
      // optimistic value, causing the toggle to flip back to OFF.
      if (response?.circle && response.circle.isMuted === undefined) {
        const cached = queryClient.getQueryData(circleKeys.single(id)) as GetCircleDetailResponse | undefined;
        if (cached?.circle?.isMuted !== undefined) {
          if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "carry_forward_isMuted", { circleId: id, cachedValue: cached.circle.isMuted });
          return { ...response, circle: { ...response.circle, isMuted: cached.circle.isMuted } };
        }
      }
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "refetch_settled", { circleId: id, isMuted: response?.circle?.isMuted });
      return response;
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id,
    refetchInterval: 10000, // Poll every 10 seconds for new messages
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
  });

  // [P1_LOADING_INV] loadedOnce discipline: prevent "Loading..." flash on 10s poll
  const { showInitialLoading: showCircleLoading, showRefetchIndicator: showCircleRefetch } = useLoadedOnce(
    { isLoading, isFetching, isSuccess, data },
    "circle-detail",
  );

  // [P0_LOADING_ESCAPE] Timeout safety for initial load
  const { isTimedOut: isCircleTimedOut, reset: resetCircleTimeout } = useLoadingTimeout(
    !!(showCircleLoading || (!data?.circle && !isError)) && !!id,
    { timeout: 3000 },
  );
  const [isRetrying, setIsRetrying] = useState(false);
  const handleLoadingRetry = useCallback(() => {
    setIsRetrying(true);
    resetCircleTimeout();
    refetch();
    setTimeout(() => setIsRetrying(false), 1500);
  }, [resetCircleTimeout, refetch]);

  // [P1_SCROLL_ANCHOR] + [P1_NEW_MSG] Message append watcher — depends on count only, not full array
  const circle = data?.circle;
  const messageCount = circle?.messages?.length ?? 0;
  useEffect(() => {
    if (prevMessageCountRef.current == null) {
      prevMessageCountRef.current = messageCount;
      return;
    }
    // [P1_CHAT_PAGINATION] Skip watcher during older-message prepend
    if (isPrependingRef.current) {
      prevMessageCountRef.current = messageCount;
      if (__DEV__) {
        devLog("[P1_CHAT_PAGINATION]", "skip-new-msg-watcher (prepend)");
      }
      return;
    }
    const prev = prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;
    const delta = messageCount - prev;
    if (delta <= 0) return;

    if (isNearBottomRef.current) {
      clearUnseen();
      scheduleAutoScroll();
      sendReadHorizon("near_bottom_new_msg");
      if (__DEV__) {
        devLog("[P1_CHAT_PILL]", "pill_clear", { reason: "near_bottom", delta });
      }
    } else {
      bumpUnseen(delta);
      if (__DEV__) {
        devLog("[P1_CHAT_PILL]", "unseen_inc", { delta, unseenAfter: unseenCountRef.current });
      }
    }
  }, [messageCount, scheduleAutoScroll, clearUnseen, bumpUnseen]);

  // [P1_CHAT_CURSOR_V2] Init compound cursor from initial data
  useEffect(() => {
    if (!circle?.messages?.length) return;
    // Only seed cursor once (when null)
    if (cursorCreatedAtRef.current != null) return;
    const msgs = circle.messages;
    const oldest = msgs.reduce(
      (min: any, m: any) => (m.createdAt < min.createdAt ? m : min),
      msgs[0],
    );
    cursorCreatedAtRef.current = oldest.createdAt;
    cursorIdRef.current = oldest.id;
    if (__DEV__) {
      devLog("[P1_CHAT_CURSOR_V2]", "init", {
        oldestCreatedAt: oldest.createdAt,
        oldestId: oldest.id,
        initialCount: msgs.length,
      });
    }
  }, [circle?.messages]);

  // Fetch friends list for adding members
  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session) && showAddMembers,
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ content, clientMessageId, reply }: { content: string; clientMessageId: string; reply?: { messageId: string; userId: string; userName: string; snippet: string } }) =>
      api.post(`/api/circles/${id}/messages`, { content, clientMessageId, ...(reply ? { reply } : {}) }),
    onMutate: async ({ content, clientMessageId, reply }: { content: string; clientMessageId: string; reply?: { messageId: string; userId: string; userName: string; snippet: string } }) => {
      // Build optimistic message and insert into cache immediately
      const userId = session?.user?.id ?? "unknown";
      const userName = session?.user?.name ?? undefined;
      const userImage = session?.user?.image ?? null;
      const optimistic = buildOptimisticMessage(id, userId, content, userName, userImage);
      // Override clientMessageId so retry reuses the same one
      optimistic.clientMessageId = clientMessageId;
      // Attach reply metadata to optimistic message for immediate render
      if (reply) (optimistic as any).reply = reply;

      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: circleKeys.single(id) });

      queryClient.setQueryData(
        circleKeys.single(id),
        (prev: any) => safeAppendMessage(prev, optimistic),
      );

      if (__DEV__) {
        devLog("[P1_MSG_IDEMP]", "mutate", { clientMessageId, optimisticId: optimistic.id });
      }

      // Clear input immediately for instant feel
      setMessage("");

      return { optimisticId: optimistic.id, content, clientMessageId };
    },
    onSuccess: (serverResponse: any, _vars, context) => {
      // Reconcile: replace optimistic message with server response, mark sent
      const serverMsg = serverResponse?.message;
      if (serverMsg?.id && context?.optimisticId) {
        // Try matching by clientMessageId first (covers push-arrived-first), fallback to optimisticId
        const cmi = context.clientMessageId;
        let foundOptimistic = false;
        queryClient.setQueryData(
          circleKeys.single(id),
          (prev: any) => {
            if (!prev?.circle?.messages) return prev;
            return {
              ...prev,
              circle: {
                ...prev.circle,
                messages: prev.circle.messages.map((m: any) => {
                  if (m.id === context.optimisticId || (cmi && m.clientMessageId === cmi && m.id !== serverMsg.id)) {
                    foundOptimistic = true;
                    return { ...serverMsg, status: "sent", clientMessageId: cmi };
                  }
                  return m;
                }),
              },
            };
          },
        );
        if (__DEV__) {
          devLog("[P1_MSG_IDEMP]", "reconcile_via_http", {
            clientMessageId: cmi,
            serverId: serverMsg.id,
            foundOptimistic,
          });
        }
      }

      // Background reconcile — inactive only
      queryClient.invalidateQueries({
        queryKey: circleKeys.single(id),
        refetchType: "inactive",
      });
    },
    onError: (_error, _vars, context) => {
      // Mark as failed — do NOT remove. Message stays visible for retry.
      if (context?.optimisticId) {
        queryClient.setQueryData(
          circleKeys.single(id),
          (prev: any) => {
            if (!prev?.circle?.messages) return prev;
            return {
              ...prev,
              circle: {
                ...prev.circle,
                messages: prev.circle.messages.map(
                  (m: any) => m.id === context.optimisticId
                    ? { ...m, status: "failed" }
                    : m,
                ),
              },
            };
          },
        );
        if (__DEV__) {
          devLog("[P1_MSG_DELIVERY]", `failed ${context.optimisticId}`);
        }
      }
      safeToast.error("Message Failed", "Message failed to send. Tap to retry.");
    },
  });

  // Add members mutation
  const addMembersMutation = useMutation({
    mutationFn: (memberIds: string[]) =>
      api.post<{ success: boolean; addedCount: number }>(`/api/circles/${id}/members`, { memberIds }),
    onSuccess: async (_data, memberIds) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddMembers(false);
      setSelectedFriends([]);

      // Invalidate and refetch circle data to update calendar with new members
      await queryClient.invalidateQueries({ queryKey: circleKeys.single(id) });
      await queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      await refetch();

      // Check if new members are friends with all existing circle members
      if (circle && friendsData?.friends) {
        checkFriendSuggestions(memberIds);
      }
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Add Members Failed", "Failed to add members. Please try again.");
    },
  });

  // Remove member mutation (host only)
  const removeMemberMutation = useMutation({
    mutationFn: (memberUserId: string) => {
      if (__DEV__) {
        devLog('[CircleRemoveMember] Mutation executing:', {
          circleId: id,
          memberUserId,
          endpoint: `/api/circles/${id}/members/${memberUserId}`,
        });
      }
      return api.delete(`/api/circles/${id}/members/${memberUserId}`);
    },
    onSuccess: async (_data, memberUserId) => {
      if (__DEV__) {
        devLog('[CircleRemoveMember] Mutation SUCCESS:', { circleId: id, memberUserId });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Removed", "Member has been removed from the circle.");
      setSelectedMemberToRemove(null);
      // Invalidate and refetch circle data
      await queryClient.invalidateQueries({ queryKey: circleKeys.single(id) });
      await queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      await refetch();
    },
    onError: (error: any, memberUserId) => {
      if (__DEV__) {
        devLog('[CircleRemoveMember] Mutation ERROR:', {
          circleId: id,
          memberUserId,
          status: error?.status,
          message: error?.message,
          body: error?.body,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error?.status === 403) {
        safeToast.error("Not Allowed", "Only the host can remove members.");
      } else if (error?.status === 400) {
        safeToast.error("Cannot Remove", "The host cannot be removed from the circle.");
      } else {
        safeToast.error("Remove Failed", "Failed to remove member. Please try again.");
      }
      setSelectedMemberToRemove(null);
    },
  });

  // [P1_READ_HORIZON] markAsReadMutation removed — replaced by sendReadHorizon()

  // Update circle mutation (for description editing)
  const updateCircleMutation = useMutation({
    mutationFn: (updates: { description?: string }) =>
      api.put<{ circle: Circle }>(`/api/circles/${id}`, updates),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Saved", "Description updated");
      queryClient.invalidateQueries({ queryKey: circleKeys.single(id) });
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      setEditingDescription(false);
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error?.status === 403) {
        safeToast.error("Not Allowed", "Only the host can edit this.");
      } else {
        safeToast.error("Update Failed", "Failed to update. Please try again.");
      }
    },
  });

  // [P0_CIRCLE_MUTE_V1] Mute toggle mutation
  const muteMutation = useMutation({
    mutationFn: async (isMuted: boolean) => {
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "mutation_start", { circleId: id, desiredMuted: isMuted });
      return api.post(`/api/circles/${id}/mute`, { isMuted });
    },
    onMutate: async (isMuted) => {
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "optimistic_update", { circleId: id, isMuted });
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: circleKeys.all() });
      await queryClient.cancelQueries({ queryKey: circleKeys.single(id) });

      // Snapshot current values
      const previousCircles = queryClient.getQueryData(circleKeys.all());
      const previousCircle = queryClient.getQueryData(circleKeys.single(id));

      // Optimistically update circles list
      queryClient.setQueryData(circleKeys.all(), (old: any) => {
        if (!old?.circles) return old;
        return {
          ...old,
          circles: old.circles.map((c: Circle) =>
            c.id === id ? { ...c, isMuted } : c
          ),
        };
      });

      // Optimistically update circle detail
      queryClient.setQueryData(circleKeys.single(id), (old: any) => {
        if (!old?.circle) return old;
        return { ...old, circle: { ...old.circle, isMuted } };
      });

      return { previousCircles, previousCircle };
    },
    onSuccess: (_, isMuted) => {
      // [P0_CIRCLE_MUTE_POLISH] Light selection haptic on success
      Haptics.selectionAsync();
      if (__DEV__) {
        devLog("[P0_CIRCLE_MUTE_POLISH]", {
          circleId: id,
          prevMuted: !isMuted,
          nextMuted: isMuted,
          entryPoint: "details",
          success: true,
        });
        devLog("[P0_CIRCLE_MUTE_ANALYTICS]", {
          eventName: "circle_mute_toggle",
          payload: { circleId: id, nextMuted: isMuted, entryPoint: "details" },
        });
      }
      trackAnalytics("circle_mute_toggle", {
        circleId: id,
        nextMuted: isMuted,
        entryPoint: "details",
      });
      // [P0_CIRCLE_SETTINGS] Only invalidate list — do NOT invalidate single() here.
      // The detail endpoint returns isMuted as optional; a refetch can overwrite
      // the optimistic update with undefined → false, causing the toggle to revert.
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "mutation_success", { circleId: id, persistedMuted: isMuted });
      if (__DEV__) devLog("[P0_CIRCLE_SETTINGS]", "mute_persist_ok", { circleId: id, isMuted });
    },
    onError: (error, isMuted, context) => {
      // Revert optimistic updates
      if (context?.previousCircles) {
        queryClient.setQueryData(circleKeys.all(), context.previousCircles);
      }
      if (context?.previousCircle) {
        queryClient.setQueryData(circleKeys.single(id), context.previousCircle);
      }
      if (__DEV__) {
        devLog("[P0_CIRCLE_MUTE_POLISH]", {
          circleId: id,
          prevMuted: !isMuted,
          nextMuted: isMuted,
          entryPoint: "details",
          success: false,
        });
      }
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "mutation_error", { circleId: id, desiredMuted: isMuted, error: String(error) });
      safeToast.error("Oops", "Could not update mute setting");
    },
  });

  // [P1_READ_HORIZON] Mark as read on focus + track active circle for push routing
  useFocusEffect(
    useCallback(() => {
      if (session && id && isAuthedForNetwork(bootStatus, session)) {
        setActiveCircle(id);
        sendReadHorizon("focus");
      }
      return () => {
        setActiveCircle(null);
      };
    }, [session, id, bootStatus, sendReadHorizon]),
  );

  // [P2_TYPING_UI] Poll typing list every 2s while focused + app active
  useFocusEffect(
    useCallback(() => {
      if (!id || !session?.user?.id || !isAuthedForNetwork(bootStatus, session)) return;
      let active = true;
      let paused = AppState.currentState !== "active";
      const poll = async () => {
        if (!active || paused) return;
        try {
          const res = await api.get<{ ok: boolean; typing: Array<{ userId: string; name: string; updatedAt: number }> }>(
            `/api/circles/${id}/typing`,
          );
          if (!active || paused) return;
          const filtered = (res?.typing ?? []).filter((t) => t.userId !== session.user?.id);
          setTypingUsers(filtered);
          // [P2_TYPING_UI] Log transitions
          const nowNonEmpty = filtered.length > 0;
          if (nowNonEmpty !== prevTypingNonEmptyRef.current) {
            if (__DEV__) devLog("[P2_TYPING_UI]", nowNonEmpty ? "show" : "hide", nowNonEmpty ? { count: filtered.length } : {});
            prevTypingNonEmptyRef.current = nowNonEmpty;
          }
        } catch {
          // Silently ignore polling errors
        }
      };
      poll();
      const interval = setInterval(poll, 2000);
      // Pause polling when app goes to background
      const appSub = AppState.addEventListener("change", (next) => {
        paused = next !== "active";
        if (!paused) poll(); // Resume immediately on foreground
      });
      return () => {
        active = false;
        clearInterval(interval);
        appSub.remove();
        setTypingUsers([]);
        prevTypingNonEmptyRef.current = false;
        // Best-effort clear typing on blur so others don't see stale indicator
        api.post(`/api/circles/${id}/typing`, { isTyping: false }).catch(() => {});
      };
    }, [id, session, bootStatus]),
  );

  // [P2_TYPING_UI] Throttled typing ping (max 1/sec)
  const sendTypingPing = useCallback(() => {
    if (!id) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < 1000) return;
    lastTypingPingRef.current = now;
    api.post(`/api/circles/${id}/typing`, { isTyping: true }).catch(() => {});
  }, [id]);

  const sendTypingClear = useCallback(() => {
    if (!id) return;
    lastTypingPingRef.current = 0;
    api.post(`/api/circles/${id}/typing`, { isTyping: false }).catch(() => {});
  }, [id]);

  // [P1_CHAT_CURSOR_V2] Fetch older messages with compound cursor pagination
  const fetchOlderMessages = useCallback(async () => {
    if (!id || !hasMoreOlder || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    isPrependingRef.current = true;

    try {
      const res = await getCircleMessages({
        circleId: id,
        beforeCreatedAt: cursorCreatedAtRef.current,
        beforeId: cursorIdRef.current,
        limit: PAGE_SIZE,
      });

      const older = res.messages ?? [];
      const serverHasMore = res.hasMore ?? false;

      // Update compound cursor to oldest returned message
      if (older.length > 0) {
        const oldest = older.reduce((min, m) =>
          m.createdAt < min.createdAt ? m : min, older[0],
        );
        cursorCreatedAtRef.current = oldest.createdAt;
        cursorIdRef.current = oldest.id;
      }

      // Trust server for hasMore; fallback if empty
      setHasMoreOlder(older.length === 0 ? false : serverHasMore);

      // Patch cache: prepend older messages into circleKeys.single
      if (older.length > 0) {
        queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
          if (!prev?.circle) return prev;
          const prevMsgs = prev.circle.messages ?? [];
          const merged = safePrependMessages(prevMsgs, older);
          return { ...prev, circle: { ...prev.circle, messages: merged } };
        });
      }

      if (__DEV__) {
        devLog("[P1_CHAT_CURSOR_V2]", "prepend", {
          olderCount: older.length,
          hasMore: serverHasMore,
          oldestCreatedAt: cursorCreatedAtRef.current,
          oldestId: cursorIdRef.current,
        });
      }
    } catch (e) {
      safeToast.error("Oops", "Couldn't load older messages");
      if (__DEV__) {
        devLog("[P1_CHAT_CURSOR_V2]", "load-earlier error", { circleId: id, error: String(e) });
      }
    } finally {
      // Allow rAF to settle layout before clearing prepend flag
      requestAnimationFrame(() => {
        isPrependingRef.current = false;
      });
      setIsLoadingEarlier(false);
    }
  }, [id, hasMoreOlder, isLoadingEarlier, queryClient, PAGE_SIZE]);

  // [P0_SHEET_PRIMITIVE_GROUP_SETTINGS] proof log – once per open
  useEffect(() => {
    if (__DEV__ && showGroupSettings) {
      const capPx = Math.round(Dimensions.get("window").height * 0.85);
      devLog("[P0_SHEET_PRIMITIVE_GROUP_SETTINGS] open", { maxHeightPct: 0.85, capPx });
      devLog("[CIRCLE_SETTINGS_SHEET] view=settings");
    }
  }, [showGroupSettings]);

  // [CIRCLE_SETTINGS_SHEET] proof log – view mode switching
  useEffect(() => {
    if (__DEV__ && showGroupSettings && settingsSheetView === "photo") {
      devLog("[CIRCLE_SETTINGS_SHEET] view=photo");
    }
  }, [settingsSheetView, showGroupSettings]);

  const isHost = circle?.createdById === session?.user?.id;

  // Check if new members need friend suggestions
  const checkFriendSuggestions = (newMemberIds: string[]) => {
    if (!circle || !circle.members || !friendsData?.friends) return;

    const existingMemberIds = circle.members.map(m => m.userId);
    const myFriendIds = new Set(friendsData.friends.map(f => f.friendId));
    const suggestions: Array<{
      newMemberName: string;
      existingMemberName: string;
      newMemberId: string;
    }> = [];

    // For each new member, check if they are friends with existing members
    // We can only suggest adding them as friends to the current user
    for (const newMemberId of newMemberIds) {
      const newMember = friendsData.friends.find(f => f.friendId === newMemberId);
      if (!newMember) continue;

      // Check each existing member
      for (const existingMember of circle.members) {
        // Skip if this is the current user
        if (existingMember.userId === session?.user?.id) continue;

        // Check if the existing member is in the new member's potential friends
        // Since we can't check another user's friend list, we note this for the suggestion
        // The suggestion is: "New member might not be friends with existing member"
        if (!myFriendIds.has(existingMember.userId)) {
          // Current user isn't friends with this existing member (shouldn't happen in a circle)
          continue;
        }

        // Add a suggestion that encourages adding each other
        suggestions.push({
          newMemberName: newMember.friend.name ?? "Unknown",
          existingMemberName: existingMember.user.name ?? "Unknown",
          newMemberId: newMemberId,
        });
      }
    }

    // Show unique suggestions (one per new member)
    const uniqueSuggestions = newMemberIds.map(id => {
      const newMember = friendsData.friends.find(f => f.friendId === id);
      if (!newMember) return null;

      return {
        newMemberName: newMember.friend.name ?? "Unknown",
        existingMemberName: "", // Will show general message
        newMemberId: id,
      };
    }).filter((s): s is NonNullable<typeof s> => s !== null);

    if (uniqueSuggestions.length > 0) {
      setFriendSuggestions(uniqueSuggestions);
      // Show suggestion modal after a brief delay
      setTimeout(() => setShowFriendSuggestionModal(true), 500);
    }
  };

  const handleSend = () => {
    if (message.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendTypingClear();
      const clientMessageId = `cmi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      // [P2_CHAT_REPLY_UI2] Build reply payload for API
      let reply: { messageId: string; userId: string; userName: string; snippet: string } | undefined;
      if (replyTarget) {
        reply = {
          messageId: replyTarget.messageId,
          userId: replyTarget.userId,
          userName: replyTarget.name,
          snippet: replyTarget.snippet,
        };
        if (__DEV__) devLog("[P2_CHAT_REPLY_UI2]", "send_attach", { messageId: replyTarget.messageId });
        clearReplyTarget("sent");
      }
      sendMessageMutation.mutate({
        content: message.trim(),
        clientMessageId,
        ...(reply ? { reply } : {}),
      });
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    Haptics.selectionAsync();
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleAddMembers = () => {
    if (selectedFriends.length === 0) {
      safeToast.warning("Select Friends", "Please select at least one friend to add.");
      return;
    }

    // Check member limit before adding
    const currentMembersCount = circle?.members?.length ?? 0;
    const newTotalCount = currentMembersCount + selectedFriends.length;
    const check = canAddCircleMember(entitlements, currentMembersCount);

    if (!check.allowed && check.context) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setPaywallContext(check.context);
      setShowPaywallModal(true);
      return;
    }

    addMembersMutation.mutate(selectedFriends);
  };

  // Filter out friends who are already members
  const availableFriends = useMemo(() => {
    if (!friendsData?.friends || !circle || !circle.members) return [];
    const memberIds = new Set(circle.members.map(m => m.userId));
    return friendsData.friends.filter(f => !memberIds.has(f.friendId));
  }, [friendsData?.friends, circle]);

  // ═══ HOOK_ORDER_STABLE: All hooks declared before any early return ═══
  // [P1_AVAIL_SUMMARY_UI] Availability summary query — graceful 404 fallback
  const [showAvailSheet, setShowAvailSheet] = useState(false);
  const { data: availData } = useQuery({
    queryKey: circleKeys.availabilitySummary(id!),
    queryFn: async () => {
      try {
        const res = await api.get<{
          tonight: { free: number; busy: number; tentative?: number; unknown: number; total: number };
          members?: Array<{ userId: string; name: string; status: string }>;
        }>(`/api/circles/${id}/availability-summary`);
        return res;
      } catch (e: any) {
        if (__DEV__) devLog("[P1_AVAIL_SUMMARY_UI]", "hidden_nonok", { status: e?.status ?? "unknown" });
        return null;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  // Derive strip data; hide if query failed / not yet loaded
  const availTonight = availData?.tonight ?? null;
  const availMembers = availData?.members ?? null;
  const availLogFiredRef = useRef(false);
  useEffect(() => {
    if (!availLogFiredRef.current && __DEV__) {
      devLog("[P1_AVAIL_SUMMARY_UI]", "mounted");
      availLogFiredRef.current = true;
    }
  }, []);
  useEffect(() => {
    if (__DEV__ && availTonight) {
      devLog("[P1_AVAIL_SUMMARY_UI]", "shown", {
        free: availTonight.free,
        busy: availTonight.busy,
        unknown: availTonight.unknown,
        tentative: availTonight.tentative,
        total: availTonight.total,
      });
    }
  }, [availTonight]);

  // [P1_PLAN_LOCK_UI] Plan lock query — graceful 404 fallback
  const [showPlanLockSheet, setShowPlanLockSheet] = useState(false);
  const [planLockDraftNote, setPlanLockDraftNote] = useState("");
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const { data: planLockData } = useQuery({
    queryKey: circleKeys.planLock(id!),
    queryFn: async () => {
      try {
        const res = await api.get<{
          locked: boolean;
          note?: string;
        }>(`/api/circles/${id}/plan-lock`);
        return res;
      } catch (e: any) {
        if (__DEV__) devLog("[P1_PLAN_LOCK_UI]", "hidden_nonok", { status: e?.status ?? "unknown" });
        return null;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  const planLock = planLockData ?? null;
  const planLockLogFiredRef = useRef(false);
  useEffect(() => {
    if (!planLockLogFiredRef.current && __DEV__) {
      devLog("[P1_PLAN_LOCK_UI]", "mounted");
      planLockLogFiredRef.current = true;
    }
  }, []);
  // [P1_LIFECYCLE_UI] Lifecycle query — graceful 404 fallback
  const { data: lifecycleData } = useQuery({
    queryKey: circleKeys.lifecycle(id!),
    queryFn: async () => {
      try {
        const res = await api.get<{ state: string; note?: string }>(`/api/circles/${id}/lifecycle`);
        return res;
      } catch (e: any) {
        if (__DEV__) devLog("[P1_LIFECYCLE_UI]", "hidden_nonok", { status: e?.status ?? "unknown" });
        return null;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  const lifecycleState = lifecycleData?.state ?? null;
  const lifecycleNote = lifecycleData?.note ?? null;

  // [P1_LIFECYCLE_UI] Run-it-back mutation
  const lifecycleMutation = useMutation({
    mutationFn: async (body: { state: string }) => {
      return api.post<{ state: string }>(`/api/circles/${id}/lifecycle`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: circleKeys.lifecycle(id!) });
      queryClient.invalidateQueries({ queryKey: circleKeys.polls(id!) });
      queryClient.invalidateQueries({ queryKey: circleKeys.planLock(id!) });
    },
  });

  // [P1_NOTIFY_LEVEL_UI] Notification level query — graceful fallback to "all"
  type CircleNotificationLevel = "all" | "decisions" | "mentions" | "mute";
  const { data: notifyLevelData } = useQuery({
    queryKey: circleKeys.notificationLevel(id!),
    queryFn: async () => {
      try {
        const res = await api.get<{ ok: boolean; level: CircleNotificationLevel }>(`/api/circles/${id}/notification-level`);
        return res;
      } catch (e: any) {
        if (__DEV__) devLog("[P1_NOTIFY_LEVEL_UI]", "query_fallback", { status: e?.status ?? "unknown" });
        return { ok: true, level: "all" as CircleNotificationLevel };
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  const notifyLevel: CircleNotificationLevel = (notifyLevelData?.level as CircleNotificationLevel) ?? "all";

  const notifyLevelMutation = useMutation({
    mutationFn: async (level: CircleNotificationLevel) => {
      return api.post<{ ok: boolean; level: CircleNotificationLevel }>(`/api/circles/${id}/notification-level`, { level });
    },
    onMutate: async (level) => {
      await queryClient.cancelQueries({ queryKey: circleKeys.notificationLevel(id!) });
      const prev = queryClient.getQueryData(circleKeys.notificationLevel(id!));
      queryClient.setQueryData(circleKeys.notificationLevel(id!), { ok: true, level });
      return { prev };
    },
    onError: (_err, _level, context) => {
      if (context?.prev) {
        queryClient.setQueryData(circleKeys.notificationLevel(id!), context.prev);
      }
      safeToast.error("Update Failed", "Failed to update notifications");
      if (__DEV__) devLog("[P1_NOTIFY_LEVEL_UI]", "save_error", { level: _level });
    },
    onSuccess: (_data, level) => {
      if (__DEV__) devLog("[P1_NOTIFY_LEVEL_UI]", "save_success", { level });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: circleKeys.notificationLevel(id!) });
    },
  });

  const notifyLevelLogRef = useRef(false);
  useEffect(() => {
    if (!notifyLevelLogRef.current && __DEV__) {
      devLog("[P1_NOTIFY_LEVEL_UI]", "mounted");
      notifyLevelLogRef.current = true;
    }
  }, []);

  // [P1_COORDINATION_FLOW] Log lock highlight on transition
  const prevLockedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (planLock?.locked && prevLockedRef.current === false && __DEV__) {
      devLog("[P1_COORDINATION_FLOW]", "lock_highlight");
    }
    prevLockedRef.current = planLock?.locked ?? null;
  }, [planLock?.locked]);

  // [P1_PLAN_LOCK_UI] Save mutation with optimistic update
  const planLockMutation = useMutation({
    mutationFn: async ({ locked, note }: { locked: boolean; note: string }) => {
      return api.post<{ locked: boolean; note?: string }>(`/api/circles/${id}/plan-lock`, { locked, note });
    },
    onMutate: async ({ locked, note }) => {
      await queryClient.cancelQueries({ queryKey: circleKeys.planLock(id!) });
      const prev = queryClient.getQueryData(circleKeys.planLock(id!));
      queryClient.setQueryData(circleKeys.planLock(id!), { locked, note: note || undefined });
      return { prev };
    },
    onSuccess: () => {
      if (__DEV__) devLog("[P1_PLAN_LOCK_UI]", "save", { circleId: id });
      queryClient.invalidateQueries({ queryKey: circleKeys.planLock(id!), refetchType: "inactive" });
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(circleKeys.planLock(id!), context.prev);
      }
      safeToast.error("Update Failed", "Could not update plan lock");
    },
  });

  // [P1_POLL_UI] Poll query — graceful 404 fallback
  const [showPollSheet, setShowPollSheet] = useState(false);
  const [activePollIdx, setActivePollIdx] = useState(0);
  const { data: pollsRaw } = useQuery({
    queryKey: circleKeys.polls(id!),
    queryFn: async () => {
      try {
        return await api.get<{
          polls: Array<{
            id: string;
            question: string;
            options: Array<{ id: string; label: string; count: number; votedByMe: boolean }>;
          }>;
        }>(`/api/circles/${id}/polls`);
      } catch (e: any) {
        if (__DEV__) devLog("[P1_POLL_UI]", "hidden_nonok", { status: e?.status ?? "unknown" });
        return null;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  const polls = pollsRaw?.polls ?? null;
  const pollLogFiredRef = useRef(false);
  useEffect(() => {
    if (!pollLogFiredRef.current && __DEV__) {
      devLog("[P1_POLL_UI]", "mount");
      devLog("[P1_COORDINATION_FLOW]", "mounted");
      devLog("[P1_POLLS_E2E_UI]", "mounted", { circleId: id });
      devLog("[P1_CIRCLE_POLLS_DISABLED]", { applied: true });
      pollLogFiredRef.current = true;
    }
  }, []);
  useEffect(() => {
    if (__DEV__ && polls && polls.length > 0) {
      devLog("[P1_POLL_UI]", "refresh", { count: polls.length });
      devLog("[P1_POLLS_E2E_UI]", "polls_refetched", { count: polls.length });
    }
  }, [polls]);

  // [P1_POLL_UI] Vote mutation with optimistic update
  const voteMutation = useMutation({
    mutationFn: async ({ pollId, optionId }: { pollId: string; optionId: string }) => {
      return api.post(`/api/circles/${id}/polls/${pollId}/vote`, { optionId });
    },
    onMutate: async ({ pollId, optionId }) => {
      await queryClient.cancelQueries({ queryKey: circleKeys.polls(id!) });
      const prev = queryClient.getQueryData(circleKeys.polls(id!));
      queryClient.setQueryData(circleKeys.polls(id!), (old: any) => {
        if (!old?.polls) return old;
        return {
          ...old,
          polls: old.polls.map((p: any) => {
            if (p.id !== pollId) return p;
            return {
              ...p,
              options: p.options.map((o: any) => {
                const wasVoted = o.votedByMe;
                const isTarget = o.id === optionId;
                if (isTarget) return { ...o, votedByMe: true, count: wasVoted ? o.count : o.count + 1 };
                if (wasVoted) return { ...o, votedByMe: false, count: Math.max(0, o.count - 1) };
                return o;
              }),
            };
          }),
        };
      });
      if (__DEV__) devLog("[P1_POLL_UI]", "vote", { pollId, optionId });
      if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "vote_attempt", { pollId, optionId });
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: circleKeys.polls(id!) });
      if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "vote_success");
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(circleKeys.polls(id!), context.prev);
      }
      safeToast.error("Vote Failed", "Could not submit vote");
      if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "vote_error", { error: String(_err) });
    },
  });

  // Derive messages safely (circle may be null before loading gate)
  const messages = circle?.messages ?? [];

  // [P1_CHAT_SEND_UI] Derive send-status flags for pending/failed indicators
  const hasPending = messages.some((m: any) => m.status === "sending");
  const latestFailed = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as any;
      if (m.status === "failed" && m.id?.startsWith("optimistic-")) return m;
    }
    return null;
  }, [messages]);
  const hasFailed = !!latestFailed;

  // [P1_CHAT_SEND_UI] DEV log when failed banner becomes visible
  useEffect(() => {
    if (__DEV__ && hasFailed && latestFailed) {
      devLog("[P1_CHAT_SEND_UI]", "banner_shown", { failedId: latestFailed.id });
    }
  }, [hasFailed, latestFailed]);

  // [P1_CHAT_TS] Tap-to-toggle timestamp state
  const [activeTimestampId, setActiveTimestampId] = useState<string | null>(null);
  const activeTimestampTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBubbleTap = useCallback((msgId: string | undefined) => {
    if (!msgId) return;
    if (activeTimestampTimerRef.current) clearTimeout(activeTimestampTimerRef.current);
    if (activeTimestampId === msgId) {
      setActiveTimestampId(null);
      return;
    }
    setActiveTimestampId(msgId);
    if (__DEV__) devLog("[P1_CHAT_TS]", "toggle_on", { id: msgId, reason: "tap" });
    activeTimestampTimerRef.current = setTimeout(() => {
      setActiveTimestampId(null);
      if (__DEV__) devLog("[P1_CHAT_TS]", "auto_hide", { id: msgId });
    }, 3000);
  }, [activeTimestampId]);

  // [P2_CHAT_REACTIONS] Local-only reactions overlay state
  const [reactionsByStableId, setReactionsByStableId] = useState<Record<string, string[]>>({});
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const REACTION_EMOJI = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDE4F"];
  const reactionsLogFiredRef = useRef(false);
  useEffect(() => {
    if (!reactionsLogFiredRef.current && __DEV__) {
      devLog("[P2_CHAT_REACTIONS]", "mounted");
      reactionsLogFiredRef.current = true;
    }
  }, []);

  // [P2_CHAT_REPLY] Reply state (wired to API)
  const [replyTarget, setReplyTarget] = useState<{ messageId: string; userId: string; name: string; snippet: string } | null>(null);
  const replyLogFiredRef = useRef(false);
  useEffect(() => {
    if (!replyLogFiredRef.current && __DEV__) {
      devLog("[P2_CHAT_REPLY_UI2]", "mounted");
      replyLogFiredRef.current = true;
    }
  }, []);
  const clearReplyTarget = useCallback((reason: "x" | "sent" | "blur" | "system_guard") => {
    setReplyTarget(null);
    if (__DEV__) devLog("[P2_CHAT_REPLY_UI2]", "clear", { reason });
  }, []);

  // [P2_CHAT_EDITDEL] Local-only edit/delete state
  const [editedContentByStableId, setEditedContentByStableId] = useState<Record<string, { content: string; editedAt: number }>>({});
  const [deletedStableIds, setDeletedStableIds] = useState<Record<string, true>>({});
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editDraftContent, setEditDraftContent] = useState("");
  const editDelLogFiredRef = useRef(false);
  useEffect(() => {
    if (!editDelLogFiredRef.current && __DEV__) {
      devLog("[P2_CHAT_EDITDEL]", "mounted");
      editDelLogFiredRef.current = true;
    }
  }, []);

  // [P1_CHAT_GROUP] One-time mount log
  const groupLogFired = useRef(false);
  useEffect(() => {
    if (!groupLogFired.current && __DEV__) {
      devLog("[P1_CHAT_GROUP]", "enabled windowMs=120000");
      devLog("[P2_CHAT_DATESEP]", "enabled");
      devLog("[P2_TYPING_UI]", "mounted");
      groupLogFired.current = true;
    }
  }, []);

  // ─── [P0_CHAT_ANCHOR] DEV-only QA Panel state & helpers ───
  const [qaExpanded, setQaExpanded] = useState(false);
  const qaSnap = useCallback(() => ({
    isNearBottom: isNearBottomRef.current,
    firstVisibleId: firstVisibleIdRef.current,
    scrollY: scrollOffsetRef.current,
    contentH: contentHeightRef.current,
    ts: Date.now(),
  }), []);
  const qaLog = useCallback((action: string, before: { isNearBottom: boolean; firstVisibleId: string | null; scrollY: number; contentH: number; ts: number }, didAutoScroll: boolean) => {
    if (!__DEV__) return;
    requestAnimationFrame(() => {
      devLog("[P0_CHAT_ANCHOR]", action, {
        before: { isNearBottom: before.isNearBottom, firstVisibleId: before.firstVisibleId, scrollY: Math.round(before.scrollY), contentH: Math.round(before.contentH) },
        after: { isNearBottom: isNearBottomRef.current, firstVisibleId: firstVisibleIdRef.current, scrollY: Math.round(scrollOffsetRef.current), contentH: Math.round(contentHeightRef.current) },
        didAutoScroll,
        elapsedMs: Date.now() - before.ts,
      });
    });
  }, []);

  // [P0_HOOK_FIX] hooks normalized — all hooks above, early return below
  if (__DEV__) devLog("[P0_HOOK_FIX]", "hooks normalized");

  // ═══ Loading gate (AFTER all hooks — HOOK_ORDER_STABLE invariant) ═══
  if (!session || showCircleLoading || !circle) {
    // [P0_LOADING_ESCAPE] Timeout / error escape
    if (isCircleTimedOut || (isError && !circle)) {
      return (
        <LoadingTimeoutUI
          context="circle"
          onRetry={handleLoadingRetry}
          isRetrying={isRetrying}
          showBottomNav={false}
          message={isError ? "Something went wrong loading this circle." : undefined}
        />
      );
    }
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // [P0_CHAT_ANCHOR] QA action helpers (DEV only, not perf-sensitive)
  const qaInjectMessages = (n: number) => {
    const snap = qaSnap();
    const now = Date.now();
    const fakes = Array.from({ length: n }, (_, i) => ({
      id: `qa-msg-${now}-${i}`,
      circleId: id,
      userId: "qa-user",
      content: `QA message #${i + 1} of ${n}`,
      createdAt: new Date(now + i).toISOString(),
      user: { id: "qa-user", name: "QA Bot", image: null },
    }));
    queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
      if (!prev?.circle) return prev;
      return { ...prev, circle: { ...prev.circle, messages: [...(prev.circle.messages ?? []), ...fakes] } };
    });
    const shouldScroll = isNearBottomRef.current;
    if (shouldScroll) scheduleAutoScroll();
    qaLog(`inject_${n}`, snap, shouldScroll);
  };
  const qaToggleTyping = () => {
    const snap = qaSnap();
    setTypingUsers(prev => prev.length > 0 ? [] : [{ userId: "qa-1", name: "QA Alice" }, { userId: "qa-2", name: "QA Bob" }]);
    qaLog("toggle_typing", snap, false);
  };
  const qaToggleFailed = () => {
    const snap = qaSnap();
    queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
      if (!prev?.circle?.messages) return prev;
      const has = prev.circle.messages.some((m: any) => m.id === "optimistic-qa-fail");
      const next = has
        ? prev.circle.messages.filter((m: any) => m.id !== "optimistic-qa-fail")
        : [...prev.circle.messages, { id: "optimistic-qa-fail", circleId: id, userId: session?.user?.id ?? "qa", content: "QA failed msg", createdAt: new Date().toISOString(), user: { id: session?.user?.id ?? "qa", name: "QA", image: null }, status: "failed", clientMessageId: "cmi-qa-fail" }];
      return { ...prev, circle: { ...prev.circle, messages: next } };
    });
    qaLog("toggle_failed", snap, false);
  };
  const qaTogglePending = () => {
    const snap = qaSnap();
    queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
      if (!prev?.circle?.messages) return prev;
      const has = prev.circle.messages.some((m: any) => m.id === "optimistic-qa-pending");
      const next = has
        ? prev.circle.messages.filter((m: any) => m.id !== "optimistic-qa-pending")
        : [...prev.circle.messages, { id: "optimistic-qa-pending", circleId: id, userId: session?.user?.id ?? "qa", content: "QA pending msg", createdAt: new Date().toISOString(), user: { id: session?.user?.id ?? "qa", name: "QA", image: null }, status: "sending", clientMessageId: "cmi-qa-pending" }];
      return { ...prev, circle: { ...prev.circle, messages: next } };
    });
    qaLog("toggle_pending", snap, false);
  };
  const qaToggleReactions = () => {
    const snap = qaSnap();
    const tid = firstVisibleIdRef.current ?? messages[0]?.id;
    if (!tid) return;
    setReactionsByStableId(prev => {
      const ex = prev[tid] ?? [];
      return { ...prev, [tid]: ex.length > 0 ? [] : ["\uD83D\uDC4D", "\u2764\uFE0F"] };
    });
    qaLog("toggle_reactions", snap, false);
  };
  const qaToggleReply = () => {
    const snap = qaSnap();
    setReplyTarget(prev => prev ? null : { messageId: "qa-reply", userId: "qa-user", name: "QA Alice", snippet: "QA reply preview text" });
    qaLog("toggle_reply", snap, false);
  };
  const qaToggleEdit = () => {
    const snap = qaSnap();
    const tid = firstVisibleIdRef.current ?? messages[0]?.id;
    if (!tid) return;
    setEditedContentByStableId(prev => {
      if (prev[tid]) { const { [tid]: _, ...rest } = prev; return rest; }
      return { ...prev, [tid]: { content: "[QA edited]", editedAt: Date.now() } };
    });
    qaLog("toggle_edit", snap, false);
  };
  const qaToggleDelete = () => {
    const snap = qaSnap();
    const tid = firstVisibleIdRef.current ?? messages[0]?.id;
    if (!tid) return;
    setDeletedStableIds(prev => {
      if (prev[tid]) { const { [tid]: _, ...rest } = prev; return rest; }
      return { ...prev, [tid]: true as const };
    });
    qaLog("toggle_delete", snap, false);
  };
  const qaSimulatePrepend = () => {
    const snap = qaSnap();
    isPrependingRef.current = true;
    const now = Date.now();
    const fakes = Array.from({ length: 5 }, (_, i) => ({
      id: `qa-old-${now}-${i}`,
      circleId: id,
      userId: "qa-user",
      content: `QA older #${i + 1}`,
      createdAt: new Date(now - 86400000 - i * 60000).toISOString(),
      user: { id: "qa-user", name: "QA Bot", image: null },
    }));
    queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
      if (!prev?.circle) return prev;
      return { ...prev, circle: { ...prev.circle, messages: [...fakes, ...(prev.circle.messages ?? [])] } };
    });
    requestAnimationFrame(() => { isPrependingRef.current = false; });
    qaLog("simulate_prepend", snap, false);
  };

  const members = circle!.members ?? [];
  const currentUserId = session!.user?.id;

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{ borderColor: colors.border, backgroundColor: colors.surface }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>

        <Pressable className="flex-1 flex-row items-center">
          <View
            className="w-10 h-10 rounded-xl items-center justify-center mr-3 overflow-hidden"
            style={{ backgroundColor: themeColor + "20" }}
          >
            <CirclePhotoEmoji photoUrl={circle.photoUrl} emoji={circle.emoji} emojiClassName="text-xl" />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text className="font-semibold" style={{ color: colors.text }}>
                {circle.name}
              </Text>
              <HelpSheet screenKey="circles" config={HELP_SHEETS.circles} />
            </View>
            <Text className="text-xs" style={{ color: colors.textTertiary }}>
              {members.length} members
            </Text>
          </View>
        </Pressable>

        {/* Member Avatars - Tappable to open settings */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowGroupSettings(true);
          }}
          className="flex-row mr-3"
        >
          {members.slice(0, 3).map((member, i) => (
            <View
              key={member.userId}
              className="rounded-full border-2"
              style={{
                marginLeft: i > 0 ? -12 : 0,
                borderColor: colors.surface,
              }}
            >
              <EntityAvatar
                photoUrl={member.user.image}
                initials={member.user.name?.[0] ?? "?"}
                size={28}
                backgroundColor={member.user.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "30"}
                foregroundColor={themeColor}
              />
            </View>
          ))}
          {members.length > 3 && (
            <View
              className="w-8 h-8 rounded-full items-center justify-center border-2"
              style={{
                marginLeft: -12,
                borderColor: colors.surface,
                backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB",
              }}
            >
              <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                +{members.length - 3}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Create Event Button */}
        <View className="items-center mr-3">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowCreateEvent(true);
            }}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: themeColor }}
          >
            <CalendarPlus size={18} color="#fff" />
          </Pressable>
          <Text className="text-xs mt-1 font-medium" style={{ color: colors.textSecondary }}>
            Create
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Calendar Toggle */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCalendar(!showCalendar);
            setCalendarCollapsedByKeyboard(false);
          }}
          className="flex-row items-center justify-center py-2 border-b"
          style={{ borderColor: colors.border }}
        >
          <Calendar size={14} color={themeColor} />
          <Text className="text-sm font-medium ml-1.5" style={{ color: themeColor }}>
            {showCalendar ? "Hide" : "Show"} Calendar
          </Text>
          {showCalendar ? (
            <ChevronUp size={14} color={themeColor} style={{ marginLeft: 4 }} />
          ) : (
            <ChevronDown size={14} color={themeColor} style={{ marginLeft: 4 }} />
          )}
        </Pressable>

        {/* Mini Calendar */}
        {showCalendar && circle.memberEvents && (() => {
          const totalEvents = circle.memberEvents.reduce((sum, m) => sum + m.events.length, 0);
          
          if (totalEvents === 0) {
            return (
              <Animated.View entering={FadeInDown.duration(200)} className="px-4 pt-3 pb-4">
                <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: colors.surface }}>
                  <View
                    className="w-16 h-16 rounded-full items-center justify-center mb-3"
                    style={{ backgroundColor: colors.surfaceElevated }}
                  >
                    <Calendar size={24} color={colors.textTertiary} />
                  </View>
                  <Text className="text-base font-semibold mb-1" style={{ color: colors.text }}>
                    Nothing planned yet
                  </Text>
                  <Text className="text-center text-sm mb-4" style={{ color: colors.textSecondary }}>
                    Create the first event for this group
                  </Text>
                  <Button
                    variant="primary"
                    size="sm"
                    label="Create Event"
                    onPress={() => {
                      router.push({
                        pathname: "/create",
                        params: { circleId: id },
                      } as any);
                    }}
                  />
                </View>
              </Animated.View>
            );
          }
          
          return (
            <Animated.View entering={FadeInDown.duration(200)} className="px-4 pt-3">
              <MiniCalendar
                memberEvents={circle.memberEvents}
                members={members}
                themeColor={themeColor}
                colors={colors}
                isDark={isDark}
                circleId={id!}
                currentUserId={session?.user?.id ?? null}
              />
            </Animated.View>
          );
        })()}

        {/* [P1_LIFECYCLE_UI] Finalized Chip */}
        {lifecycleState === "finalized" && (() => {
          if (__DEV__) devLog("[P1_LIFECYCLE_UI]", "chip_render");
          return (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPlanLockDraftNote(planLock?.note ?? "");
                setShowPlanLockSheet(true);
              }}
              style={{
                alignSelf: "center",
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 6,
                marginVertical: 6,
                borderRadius: 16,
                backgroundColor: isDark ? "rgba(52,199,89,0.10)" : "rgba(48,161,78,0.08)",
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: isDark ? "#34C759" : "#1A7F37" }}>
                ✅ Finalized{lifecycleNote ? ` \u2022 ${lifecycleNote}` : (planLock?.note ? ` \u2022 ${planLock.note}` : "")}
              </Text>
            </Pressable>
          );
        })()}

        {/* [P1_LIFECYCLE_UI] Completion Prompt — ephemeral run-it-back */}
        {lifecycleState === "completed" && !completionDismissed && (
          <Animated.View entering={FadeIn.duration(300)} style={{
            alignItems: "center",
            paddingVertical: 10,
            paddingHorizontal: 16,
            marginVertical: 4,
            gap: 8,
          }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text, textAlign: "center" }}>
              🎉 Event done — run it back?
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                variant="primary"
                size="sm"
                label="Start new plan"
                onPress={() => {
                  if (__DEV__) devLog("[P1_LIFECYCLE_UI]", "run_it_back");
                  lifecycleMutation.mutate({ state: "planning" });
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setCompletionDismissed(true);
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                label="Dismiss"
                onPress={() => setCompletionDismissed(true)}
              />
            </View>
          </Animated.View>
        )}

        {/* [P1_AVAIL_SUMMARY_UI] Availability Summary Strip */}
        {availTonight && lifecycleState !== "finalized" && lifecycleState !== "completed" && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (__DEV__) devLog("[P1_AVAIL_SUMMARY_UI]", "tap_open");
              setShowAvailSheet(true);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderColor: colors.border,
              backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Tonight:</Text>
            <Text style={{ fontSize: 13, color: colors.text }}>{"\uD83D\uDFE2"} {availTonight.free}</Text>
            <Text style={{ fontSize: 13, color: colors.text }}>{"\uD83D\uDFE1"} {availTonight.busy}</Text>
            {(availTonight.tentative ?? 0) > 0 && (
              <Text style={{ fontSize: 13, color: colors.text }}>{"\uD83D\uDFE0"} {availTonight.tentative}</Text>
            )}
            <Text style={{ fontSize: 13, color: colors.text }}>{"\u26AA"} {availTonight.unknown}</Text>
            <ChevronRight size={14} color={colors.textTertiary} />
          </Pressable>
        )}

        {/* [P1_POLL_UI] Poll Strip — [P0_POLL_HIDDEN] gated off */}
        {(() => {
          const POLLS_ENABLED = false;
          if (!POLLS_ENABLED) return null;
          return polls && polls.length > 0 && lifecycleState !== "finalized" && lifecycleState !== "completed" && polls.map((poll, pIdx) => (
            <Pressable
              key={poll.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActivePollIdx(pIdx);
                // [P0_MODAL_GUARD] Close other sheets FIRST, then open poll
                // after a short delay. Two simultaneous Modals freeze iOS touch handling.
                if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_start", { from: "poll_strip", to: "poll", ms: 350 });
                setShowNotifySheet(false);
                setShowPlanLockSheet(false);
                setTimeout(() => {
                  setShowPollSheet(true);
                  if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_open_child", { from: "poll_strip", to: "poll", ms: 350 });
                  if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "sheet_open", { sheet: "poll", pollIdx: pIdx });
                }, 350);
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderColor: colors.border,
                backgroundColor: isDark ? "rgba(99,102,241,0.06)" : "rgba(99,102,241,0.04)",
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 3 }}>{"\uD83D\uDCCA"} Poll</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 }} numberOfLines={1}>{poll.question}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {poll.options.map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.selectionAsync();
                      voteMutation.mutate({ pollId: poll.id, optionId: opt.id });
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: opt.votedByMe ? themeColor : (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"),
                      backgroundColor: opt.votedByMe ? (themeColor + "18") : "transparent",
                      gap: 4,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: opt.votedByMe ? "600" : "400", color: opt.votedByMe ? themeColor : colors.text }}>{opt.label}</Text>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: opt.votedByMe ? themeColor : colors.textTertiary }}>({opt.count})</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          ));
        })()}

        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={11}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          removeClippedSubviews={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={themeColor} />
          }
          ListHeaderComponent={
            hasMoreOlder ? (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <Pressable
                  onPress={fetchOlderMessages}
                  disabled={isLoadingEarlier}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 16,
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {isLoadingEarlier ? (
                    <>
                      <ActivityIndicator size="small" color={colors.textTertiary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>
                        Loading earlier…
                      </Text>
                    </>
                  ) : (
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>
                      Load earlier messages
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="py-12 items-center">
              <Users size={40} color={colors.textTertiary} />
              <Text className="mt-4 text-center" style={{ color: colors.textSecondary }}>
                Start planning your next hangout!
              </Text>
              <Text className="mt-1 text-center text-sm" style={{ color: colors.textTertiary }}>
                Send a message or create an event
              </Text>
            </View>
          }
          ListFooterComponent={
            hasPending ? (
              <View className="flex-row items-center justify-center py-2" style={{ gap: 6 }}>
                <ActivityIndicator size="small" color={colors.textTertiary} />
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>Sending…</Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            // -- Run grouping: consecutive same-sender within 2 min --
            const RUN_WINDOW_MS = 120_000;
            const isGroupable = (m: any) => !!m?.userId && !!m?.user && !m.content?.startsWith("\u{1F4C5}");
            const prev = index > 0 ? messages[index - 1] : null;
            const isRunContinuation =
              !!prev &&
              isGroupable(prev) &&
              isGroupable(item) &&
              prev.userId === item.userId &&
              Math.abs(new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime()) <= RUN_WINDOW_MS;

            const isFailedOptimistic = (item as any).status === "failed" && (item as any).id?.startsWith("optimistic-");

            const handleCopy = async () => {
              try {
                await Clipboard.setStringAsync(item.content);
                safeToast.success("Copied", "Message text copied");
                if (__DEV__) devLog("[P1_MSG_ACTIONS]", "copy", { id: item.id });
              } catch { safeToast.error("Copy Failed", "Could not copy text"); }
            };

            const handleRetry = () => {
              retryFailedMessage(
                id,
                (item as any).id,
                queryClient,
                () => sendMessageMutation.mutate({
                  content: item.content,
                  clientMessageId: (item as any).clientMessageId ?? `cmi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                }),
              );
              if (__DEV__) devLog("[P1_MSG_ACTIONS]", "retry", { id: item.id, clientMessageId: (item as any).clientMessageId });
            };

            const handleRemove = () => {
              queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
                if (!prev?.circle?.messages) return prev;
                return {
                  ...prev,
                  circle: { ...prev.circle, messages: prev.circle.messages.filter((m: any) => m.id !== item.id) },
                };
              });
              if (__DEV__) devLog("[P1_MSG_ACTIONS]", "remove", { id: item.id });
            };

            const handleLongPress = () => {
              if (!item.content || item.content.startsWith("📅")) return;
              const isOwnMsg = item.userId === currentUserId;
              const isDeletedMsg = !!deletedStableIds[item.id ?? (item as any).clientMessageId];
              // Guard: no actions on deleted messages except Copy
              if (isDeletedMsg) return;
              if (__DEV__) devLog("[P1_MSG_ACTIONS]", "open_actions", { id: item.id, status: (item as any).status });

              if (Platform.OS === "ios") {
                const options = ["Reply", "Add Reaction", "Copy Text"];
                if (isOwnMsg && !isFailedOptimistic) { options.push("Edit Message"); options.push("Delete Message"); }
                if (isFailedOptimistic && (item as any).clientMessageId) options.push("Retry Send");
                if (isFailedOptimistic) options.push("Remove Failed Message");
                options.push("Cancel");
                const destructiveIdx = Math.max(options.indexOf("Remove Failed Message"), options.indexOf("Delete Message"));
                ActionSheetIOS.showActionSheetWithOptions(
                  { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: destructiveIdx },
                  (idx) => {
                    const picked = options[idx];
                    if (picked === "Reply") {
                      // Guard: can't reply to optimistic messages that haven't been persisted
                      if (!item.id || item.id.startsWith("optimistic-")) {
                        safeToast.warning("Hold on", "Can't reply until sent");
                        return;
                      }
                      const senderName = item.user?.name?.split(" ")[0] ?? "Unknown";
                      const snippet = item.content.slice(0, 80).replace(/\n/g, " ");
                      setReplyTarget({ messageId: item.id, userId: item.userId, name: senderName, snippet });
                      if (__DEV__) devLog("[P2_CHAT_REPLY_UI2]", "set", { messageId: item.id });
                      inputRef.current?.focus();
                    }
                    else if (picked === "Add Reaction") {
                      if (__DEV__) devLog("[P2_CHAT_REACTIONS]", "open_picker", { messageId: stableId });
                      setReactionTargetId(stableId);
                    }
                    else if (picked === "Copy Text") handleCopy();
                    else if (picked === "Edit Message") {
                      const existing = editedContentByStableId[stableId];
                      setEditDraftContent(existing?.content ?? item.content);
                      setEditTargetId(stableId);
                      if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "edit_open", { messageId: stableId });
                    }
                    else if (picked === "Delete Message") {
                      if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "delete_confirm", { messageId: stableId });
                      Alert.alert("Delete Message", "This message will be removed from your view.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => {
                          setDeletedStableIds((prev) => ({ ...prev, [stableId]: true }));
                          if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "delete_apply", { messageId: stableId });
                        }},
                      ]);
                    }
                    else if (picked === "Retry Send") handleRetry();
                    else if (picked === "Remove Failed Message") handleRemove();
                  },
                );
              } else {
                // Android: use a simple alert-style approach with Modal state
                // For simplicity and zero-dep constraint, use built-in Alert
                const buttons: Array<{ text: string; onPress: () => void; style?: "cancel" | "destructive" | "default" }> = [
                  { text: "Reply", onPress: () => {
                    // Guard: can't reply to optimistic messages that haven't been persisted
                    if (!item.id || item.id.startsWith("optimistic-")) {
                      safeToast.warning("Hold on", "Can't reply until sent");
                      return;
                    }
                    const senderName = item.user?.name?.split(" ")[0] ?? "Unknown";
                    const snippet = item.content.slice(0, 80).replace(/\n/g, " ");
                    setReplyTarget({ messageId: item.id, userId: item.userId, name: senderName, snippet });
                    if (__DEV__) devLog("[P2_CHAT_REPLY_UI2]", "set", { messageId: item.id });
                    inputRef.current?.focus();
                  }},
                  { text: "Add Reaction", onPress: () => {
                    if (__DEV__) devLog("[P2_CHAT_REACTIONS]", "open_picker", { messageId: stableId });
                    setReactionTargetId(stableId);
                  }},
                  { text: "Copy Text", onPress: handleCopy },
                ];
                if (isOwnMsg && !isFailedOptimistic) {
                  buttons.push({ text: "Edit Message", onPress: () => {
                    const existing = editedContentByStableId[stableId];
                    setEditDraftContent(existing?.content ?? item.content);
                    setEditTargetId(stableId);
                    if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "edit_open", { messageId: stableId });
                  }});
                  buttons.push({ text: "Delete Message", style: "destructive", onPress: () => {
                    if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "delete_confirm", { messageId: stableId });
                    Alert.alert("Delete Message", "This message will be removed from your view.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => {
                        setDeletedStableIds((prev) => ({ ...prev, [stableId]: true }));
                        if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "delete_apply", { messageId: stableId });
                      }},
                    ]);
                  }});
                }
                if (isFailedOptimistic && (item as any).clientMessageId) {
                  buttons.push({ text: "Retry Send", onPress: handleRetry });
                }
                if (isFailedOptimistic) {
                  buttons.push({ text: "Remove Failed Message", onPress: handleRemove, style: "destructive" });
                }
                buttons.push({ text: "Cancel", style: "cancel", onPress: () => {} });
                Alert.alert("Message", undefined, buttons);
              }
            };

            const stableId = item.id ?? (item as any).clientMessageId;
            const showTimestamp = !isRunContinuation || activeTimestampId === stableId;

            // -- Date separator: show pill when calendar day changes --
            let showDateSep = false;
            if (!prev) {
              showDateSep = true;
            } else {
              const prevDay = new Date(prev.createdAt);
              const curDay = new Date(item.createdAt);
              showDateSep =
                prevDay.getFullYear() !== curDay.getFullYear() ||
                prevDay.getMonth() !== curDay.getMonth() ||
                prevDay.getDate() !== curDay.getDate();
            }

            return (
              <>
                {showDateSep && (
                  <View style={{ alignItems: "center", marginVertical: 12 }}>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 10,
                        backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                      }}
                    >
                      <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: "500" }}>
                        {formatDateSeparator(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                )}
                <MessageBubble
                message={item}
                isOwn={item.userId === currentUserId}
                themeColor={themeColor}
                colors={colors}
                isDark={isDark}
                isRunContinuation={isRunContinuation}
                showTimestamp={showTimestamp}
                onPress={() => handleBubbleTap(stableId)}
                onRetry={isFailedOptimistic
                  ? handleRetry
                  : undefined
                }
                onLongPress={handleLongPress}
                reactions={stableId ? reactionsByStableId[stableId] : undefined}
                editedContent={stableId ? editedContentByStableId[stableId]?.content : undefined}
                isDeleted={stableId ? !!deletedStableIds[stableId] : false}
              />
              </>
            );
          }}
        />

        {/* [P2_CHAT_SCROLL_BTN] Floating scroll-to-bottom button */}
        {showScrollToBottom && unseenCount === 0 ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              flatListRef.current?.scrollToEnd({ animated: true });
              if (__DEV__) devLog("[P2_CHAT_SCROLL_BTN]", "tap", {});
            }}
            style={{
              position: "absolute",
              right: 16,
              bottom: 92,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: isDark ? "rgba(58,58,60,0.9)" : "rgba(255,255,255,0.95)",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 49,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDark ? 0.4 : 0.15,
              shadowRadius: 3,
              elevation: 3,
              borderWidth: isDark ? 0 : 0.5,
              borderColor: "rgba(0,0,0,0.08)",
            }}
          >
            <ChevronDown size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {/* [P1_CHAT_PILL] Floating new messages indicator */}
        {unseenCount > 0 ? (
          <Pressable
            onPress={() => {
              if (__DEV__) {
                devLog("[P1_CHAT_PILL]", "pill_tap", { unseen: unseenCount });
              }
              clearUnseen();
              scheduleAutoScroll();
              sendReadHorizon("pill_tap");
              if (__DEV__) {
                devLog("[P1_CHAT_PILL]", "pill_clear", { reason: "tap" });
              }
            }}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 92,
              alignItems: "center",
              zIndex: 50,
            }}
          >
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                backgroundColor: "rgba(0,0,0,0.72)",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
                New messages
              </Text>
              {unseenCount > 1 ? (
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                  {unseenCount > 99 ? "99+" : unseenCount}
                </Text>
              ) : null}
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{"\u2193"}</Text>
            </View>
          </Pressable>
        ) : null}

        {/* [P1_CHAT_SEND_UI] Failed message banner */}
        {hasFailed && latestFailed && (
            <Pressable
              onPress={() => {
                const cmi = latestFailed.clientMessageId;
                if (!cmi) {
                  safeToast.error("Retry Failed", "Cannot retry this message");
                  return;
                }
                if (__DEV__) devLog("[P1_CHAT_SEND_UI]", "retry_from_banner", { failedId: latestFailed.id, clientMessageId: cmi });
                retryFailedMessage(
                  id,
                  latestFailed.id,
                  queryClient,
                  () => sendMessageMutation.mutate({
                    content: latestFailed.content,
                    clientMessageId: cmi,
                  }),
                );
              }}
              style={{
                backgroundColor: "rgba(239,68,68,0.1)",
                borderTopWidth: 1,
                borderColor: "rgba(239,68,68,0.2)",
                paddingVertical: 8,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <RefreshCw size={12} color="#EF4444" />
              <Text style={{ color: "#EF4444", fontSize: 13, fontWeight: "500" }}>
                Message failed to send · Tap to retry
              </Text>
            </Pressable>
        )}

        {/* [P2_TYPING_UI] Typing indicator */}
        {typingUsers.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
            <Text style={{ color: colors.textTertiary, fontSize: 13, fontStyle: "italic" }}>
              {typingUsers.length === 1
                ? `${typingUsers[0].name} is typing\u2026`
                : typingUsers.length === 2
                  ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing\u2026`
                  : `${typingUsers.length} people are typing\u2026`}
            </Text>
          </View>
        )}

        {/* [P2_CHAT_REPLY] Reply preview bar */}
        {replyTarget && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderTopWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <View style={{ width: 3, borderRadius: 1.5, backgroundColor: themeColor, alignSelf: "stretch", marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: themeColor }} numberOfLines={1}>
                Replying to {replyTarget.name}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
                {replyTarget.snippet}
              </Text>
            </View>
            <Pressable
              onPress={() => clearReplyTarget("x")}
              hitSlop={8}
              style={{ padding: 4, marginLeft: 8 }}
            >
              <X size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        )}

        {/* Message Input */}
        {showTryAnother && draftVariants && draftVariants.length > 1 && (
          <View className="px-4 py-1.5 border-t flex-row items-center" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
            <RefreshCw size={12} color={colors.textTertiary} />
            <Pressable
              onPress={() => {
                variantIndexRef.current = (variantIndexRef.current + 1) % draftVariants.length;
                setMessage(draftVariants[variantIndexRef.current]!);
                Haptics.selectionAsync();
                if (__DEV__) devLog("[P1_DRAFT_VARIANTS]", { idx: variantIndexRef.current, total: draftVariants.length });
              }}
              hitSlop={8}
            >
              <Text className="text-[12px] font-medium ml-1.5" style={{ color: themeColor }}>Try another message</Text>
            </Pressable>
          </View>
        )}
        <View
          className="px-4 py-3 border-t flex-row items-end"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <View
            className="flex-1 flex-row items-end rounded-2xl px-4 py-2 mr-2"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6", minHeight: 44, maxHeight: 100 }}
          >
            <TextInput
              ref={inputRef}
              value={message}
              onChangeText={(text) => {
                setMessage(text);
                if (text.trim().length > 0) sendTypingPing();
                else sendTypingClear();
              }}
              onBlur={() => {
                sendTypingClear();
                if (replyTarget && !message.trim()) clearReplyTarget("blur");
              }}
              placeholder="Message..."
              placeholderTextColor={colors.textTertiary}
              multiline
              className="flex-1 py-1"
              style={{ color: colors.text, fontSize: 16, maxHeight: 80 }}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!message.trim() || sendMessageMutation.isPending}
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{
              backgroundColor: message.trim() ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB",
              opacity: !message.trim() || sendMessageMutation.isPending ? 0.5 : 1,
            }}
          >
            <MessageCircle
              size={18}
              color={message.trim() ? "#fff" : colors.textTertiary}
              style={{ marginLeft: 2 }}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Add Members Modal */}
      <Modal
        visible={showAddMembers}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowAddMembers(false);
          setSelectedFriends([]);
        }}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => {
            setShowAddMembers(false);
            setSelectedFriends([]);
          }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Animated.View
              entering={FadeInDown.springify().damping(20).stiffness(300)}
              style={{
                backgroundColor: colors.background,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: "80%",
                minHeight: 300,
                overflow: "hidden",
              }}
            >
              {/* Modal Handle */}
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.textTertiary,
                    opacity: 0.4,
                  }}
                />
              </View>

              {/* Modal Header */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <UserPlus size={22} color={themeColor} />
                  <Text style={{ fontSize: 18, fontWeight: "600", marginLeft: 10, color: colors.text }}>
                    Add Members
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setShowAddMembers(false);
                    setSelectedFriends([]);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                  }}
                >
                  <X size={18} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Friends List */}
              <ScrollView
                style={{ maxHeight: 350 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
                showsVerticalScrollIndicator={true}
              >
                {availableFriends.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <Users size={40} color={colors.textTertiary} />
                    <Text style={{ fontSize: 16, fontWeight: "500", marginTop: 16, color: colors.textSecondary }}>
                      No more friends to add
                    </Text>
                    <Text style={{ fontSize: 14, marginTop: 6, color: colors.textTertiary, textAlign: "center" }}>
                      All your friends are already in this circle
                    </Text>
                  </View>
                ) : (
                  availableFriends.map((friendship, index) => {
                    const isSelected = selectedFriends.includes(friendship.friendId);
                    return (
                      <Animated.View key={friendship.friendId} entering={FadeInDown.delay(index * 30)}>
                        <Pressable
                          onPress={() => toggleFriendSelection(friendship.friendId)}
                          style={{
                            marginBottom: 8,
                            borderRadius: 12,
                            backgroundColor: isSelected ? `${themeColor}15` : isDark ? "#2C2C2E" : "#F9FAFB",
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? themeColor : colors.border,
                            overflow: "hidden",
                          }}
                        >
                          <UserListRow
                            handle={friendship.friend.Profile?.handle}
                            displayName={friendship.friend.name}
                            bio={friendship.friend.Profile?.calendarBio}
                            avatarUri={friendship.friend.image}
                            disablePressFeedback
                            rightAccessory={
                              <View
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 14,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: isSelected ? themeColor : "transparent",
                                  borderWidth: isSelected ? 0 : 2,
                                  borderColor: colors.border,
                                }}
                              >
                                {isSelected && <Check size={16} color="#fff" />}
                              </View>
                            }
                          />
                        </Pressable>
                      </Animated.View>
                    );
                  })
                )}
              </ScrollView>

              {/* Add Button */}
              {availableFriends.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 34, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Button
                    variant="primary"
                    label={
                      addMembersMutation.isPending
                        ? "Adding..."
                        : selectedFriends.length > 0
                          ? `Add ${selectedFriends.length} Friend${selectedFriends.length > 1 ? "s" : ""}`
                          : "Select Friends to Add"
                    }
                    onPress={handleAddMembers}
                    disabled={selectedFriends.length === 0 || addMembersMutation.isPending}
                    loading={addMembersMutation.isPending}
                    style={{ borderRadius: 14 }}
                  />
                </View>
              )}
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Friend Suggestion Modal */}
      <Modal
        visible={showFriendSuggestionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFriendSuggestionModal(false)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 20 }}
          onPress={() => setShowFriendSuggestionModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340 }}>
            <Animated.View
              entering={FadeIn.duration(200)}
              style={{
                backgroundColor: colors.background,
                borderRadius: 20,
                padding: 24,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: `${themeColor}20`,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <UserCheck size={32} color={themeColor} />
              </View>

              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 8 }}>
                Members Added!
              </Text>

              <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                {friendSuggestions.length === 1
                  ? `${friendSuggestions[0]?.newMemberName} has been added to the circle.`
                  : `${friendSuggestions.length} new members have been added to the circle.`}
                {"\n\n"}
                <Text style={{ color: colors.text, fontWeight: "500" }}>
                  Tip: Make sure everyone in the circle is friends with each other to see all events!
                </Text>
              </Text>

              <View style={{ flexDirection: "row", width: "100%" }}>
                <Button
                  variant="primary"
                  label="Got it!"
                  onPress={() => setShowFriendSuggestionModal(false)}
                  style={{ flex: 1, borderRadius: RADIUS.md }}
                />
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* [P1_AVAIL_SUMMARY_UI] Availability Roster Sheet */}
      <BottomSheet
        visible={showAvailSheet}
        onClose={() => setShowAvailSheet(false)}
        heightPct={0}
        maxHeightPct={0.6}
        backdropOpacity={0.5}
        title="Tonight's Availability"
      >
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {/* Summary counts */}
          {availTonight && (
            <View style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 16,
              paddingVertical: 12,
              marginBottom: 8,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}>
              <Text style={{ fontSize: 14, color: colors.text }}>{"\uD83D\uDFE2"} {availTonight.free} free</Text>
              <Text style={{ fontSize: 14, color: colors.text }}>{"\uD83D\uDFE1"} {availTonight.busy} busy</Text>
              {(availTonight.tentative ?? 0) > 0 && (
                <Text style={{ fontSize: 14, color: colors.text }}>{"\uD83D\uDFE0"} {availTonight.tentative} tentative</Text>
              )}
              <Text style={{ fontSize: 14, color: colors.text }}>{"\u26AA"} {availTonight.unknown} unknown</Text>
            </View>
          )}

          {/* Member-by-member roster */}
          {availMembers && availMembers.length > 0 ? (
            availMembers.map((m) => {
              const statusEmoji = m.status === "free" ? "\uD83D\uDFE2" : m.status === "busy" ? "\uD83D\uDFE1" : m.status === "tentative" ? "\uD83D\uDFE0" : "\u26AA";
              const statusLabel = m.status.charAt(0).toUpperCase() + m.status.slice(1);
              // Try to find member avatar from circle members
              const circleMember = members.find((cm: any) => cm.userId === m.userId);
              return (
                <View key={m.userId} style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  borderBottomWidth: 0.5,
                  borderColor: colors.border,
                }}>
                  {/* Avatar */}
                  <View style={{
                    marginRight: 12,
                  }}>
                    <EntityAvatar
                      photoUrl={circleMember?.user?.image}
                      initials={m.name?.[0] ?? "?"}
                      size={36}
                      backgroundColor={circleMember?.user?.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "20"}
                      foregroundColor={themeColor}
                    />
                  </View>
                  {/* Name */}
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.text }}>
                    {m.name}
                  </Text>
                  {/* Status pill */}
                  <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                    gap: 4,
                  }}>
                    <Text style={{ fontSize: 12 }}>{statusEmoji}</Text>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textSecondary }}>{statusLabel}</Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                Member breakdown coming next
              </Text>
            </View>
          )}
        </ScrollView>
      </BottomSheet>

      {/* [P1_PLAN_LOCK_UI] Plan Lock Sheet */}
      <BottomSheet
        visible={showPlanLockSheet}
        onClose={() => setShowPlanLockSheet(false)}
        heightPct={0}
        maxHeightPct={0.5}
        backdropOpacity={0.5}
        keyboardMode="padding"
        title="Plan Lock"
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
          {/* Toggle */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>
              {planLock?.locked ? "\uD83D\uDD12 Locked" : "\uD83D\uDD13 Unlocked"}
            </Text>
            <Switch
              value={planLock?.locked ?? false}
              onValueChange={(val) => {
                if (__DEV__) devLog("[P1_PLAN_LOCK_UI]", "toggle", { locked: val });
                planLockMutation.mutate({ locked: val, note: planLockDraftNote.trim() });
              }}
              trackColor={{ false: isDark ? "#3A3A3C" : "#E5E7EB", true: themeColor }}
            />
          </View>

          {/* Note editor */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textSecondary, marginBottom: 6 }}>
              Note (optional)
            </Text>
            <TextInput
              value={planLockDraftNote}
              onChangeText={(t) => setPlanLockDraftNote(t.slice(0, 120))}
              placeholder="e.g. Dinner at 7pm confirmed"
              placeholderTextColor={colors.textTertiary}
              maxLength={120}
              multiline
              style={{
                color: colors.text,
                fontSize: 14,
                backgroundColor: isDark ? "#1c1c1e" : "#f3f4f6",
                borderRadius: 10,
                padding: 12,
                minHeight: 48,
                maxHeight: 100,
                textAlignVertical: "top",
              }}
            />
            <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: "right", marginTop: 4 }}>
              {planLockDraftNote.length}/120
            </Text>
          </View>

          {/* Save */}
          <Button
            variant="primary"
            label={planLockMutation.isPending ? "Saving\u2026" : "Save"}
            onPress={() => {
              if (__DEV__) devLog("[P1_PLAN_LOCK_UI]", "save", { locked: planLock?.locked ?? false, note: planLockDraftNote.trim() });
              planLockMutation.mutate({ locked: planLock?.locked ?? false, note: planLockDraftNote.trim() });
              setShowPlanLockSheet(false);
            }}
            disabled={planLockMutation.isPending}
            loading={planLockMutation.isPending}
            style={{ borderRadius: RADIUS.md }}
          />

          {/* [P1_LOCK_POLISH] Host-only unlock */}
          {isHost && planLock?.locked && (
            <Pressable
              onPress={async () => {
                if (__DEV__) devLog("[P1_LOCK_POLISH]", "unlock_attempt");
                try {
                  await api.post(`/api/circles/${id}/plan-lock`, { locked: false, note: "" });
                  queryClient.invalidateQueries({ queryKey: circleKeys.planLock(id!) });
                  if (__DEV__) devLog("[P1_LOCK_POLISH]", "unlock_success");
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setShowPlanLockSheet(false);
                } catch (e: any) {
                  if (__DEV__) devLog("[P1_LOCK_POLISH]", "unlock_error", { status: e?.status ?? "unknown" });
                  safeToast.error("Unlock Failed", "Failed to unlock plan");
                }
              }}
              style={{
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: isDark ? "rgba(255,59,48,0.4)" : "rgba(255,59,48,0.3)",
                backgroundColor: isDark ? "rgba(255,59,48,0.08)" : "rgba(255,59,48,0.06)",
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#FF3B30" }}>
                Unlock plan
              </Text>
            </Pressable>
          )}
        </View>
      </BottomSheet>

      {/* [P1_POLL_UI] Poll Detail Sheet */}
      <BottomSheet
        visible={showPollSheet}
        onClose={() => { setShowPollSheet(false); if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "sheet_close", { sheet: "poll" }); }}
        heightPct={0}
        maxHeightPct={0.6}
        backdropOpacity={0.5}
        title={polls?.[activePollIdx]?.question ?? "Poll"}
      >
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {(() => {
            const detailOpts = polls?.[activePollIdx]?.options;
            const detailWinner = planLock?.locked && detailOpts
              ? detailOpts.reduce((best, o) => (o.count > best.count ? o : best), detailOpts[0])
              : null;
            const detailWinnerId = detailWinner && detailWinner.count > 0 ? detailWinner.id : null;
            return detailOpts?.map((opt) => {
              const isVoted = opt.votedByMe;
              const isDetailWinner = detailWinnerId === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    voteMutation.mutate({ pollId: polls![activePollIdx].id, optionId: opt.id });
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    marginBottom: 8,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : isVoted ? themeColor : colors.border,
                    backgroundColor: isDetailWinner ? (isDark ? "rgba(52,199,89,0.12)" : "rgba(48,161,78,0.08)") : isVoted ? (themeColor + "12") : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"),
                  }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 10 }}>
                  <View style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : isVoted ? themeColor : colors.textTertiary,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : isVoted ? themeColor : "transparent",
                  }}>
                    {(isVoted || isDetailWinner) && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: (isVoted || isDetailWinner) ? "600" : "400", color: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : colors.text, flex: 1 }}>{opt.label}</Text>
                  {isDetailWinner && <Text style={{ fontSize: 11, fontWeight: "700", color: isDark ? "#34C759" : "#30A14E" }}>WINNER</Text>}
                </View>
                <View style={{
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 10,
                  backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : isVoted ? themeColor : colors.textSecondary }}>{opt.count}</Text>
                </View>
              </Pressable>
              );
            });
          })()}
        </ScrollView>

        {/* [P1_LOCK_POLISH] Poll finalization context */}
        {planLock?.locked && (
          <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
            <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: "center", fontStyle: "italic" }}>
              This poll finalized the plan.
            </Text>
          </View>
        )}

        {/* [P1_POLL_LOCK_BRIDGE] Lock plan with winning option */}
        {(() => {
          const activePoll = polls?.[activePollIdx];
          if (!activePoll || !isHost) return null;
          const totalVotes = activePoll.options.reduce((s: number, o: any) => s + o.count, 0);
          if (totalVotes === 0) return null;
          const winner = activePoll.options.reduce((best: any, o: any) => o.count > best.count ? o : best, activePoll.options[0]);
          if (!winner) return null;
          return (
            <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
              <Button
                variant="primary"
                label={`🔒 Lock plan with "${winner.label}"`}
                onPress={async () => {
                  const note = `Locked plan: ${winner.label}`;
                  if (__DEV__) devLog("[P1_POLL_LOCK_BRIDGE]", "bridge_attempt", { pollId: activePoll.id, winnerId: winner.id, winnerLabel: winner.label, note });
                  try {
                    await api.post(`/api/circles/${id}/plan-lock`, { locked: true, note });
                    queryClient.invalidateQueries({ queryKey: circleKeys.planLock(id!) });
                    queryClient.invalidateQueries({ queryKey: circleKeys.polls(id!) });
                    queryClient.invalidateQueries({ queryKey: circleKeys.availabilitySummary(id!) });
                    if (__DEV__) devLog("[P1_POLL_LOCK_BRIDGE]", "bridge_success", { note });
                    if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "bridge_lock_success", { pollId: activePoll.id, winner: winner.label });
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setShowPollSheet(false);
                  } catch (e: any) {
                    if (__DEV__) devLog("[P1_POLL_LOCK_BRIDGE]", "bridge_error", { status: e?.status ?? "unknown" });
                    if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "bridge_lock_error", { status: e?.status ?? "unknown" });
                    safeToast.error("Lock Failed", "Failed to lock plan");
                  }
                }}
                style={{ borderRadius: RADIUS.md }}
              />
            </View>
          );
        })()}
      </BottomSheet>

      {/* [P0_CIRCLE_INFO] Info Sheet */}
      <BottomSheet
        visible={showInfoSheet}
        onClose={() => {
          setShowInfoSheet(false);
          if (__DEV__) devLog("[P1_CIRCLE_INFO_OPEN]", "closed");
        }}
        heightPct={0}
        maxHeightPct={0.5}
        backdropOpacity={0.5}
        title="Everyone's Free"
      >
        <ScrollView style={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
            Based on events in Open Invite. If someone hasn't added their plans yet, their schedule may look more open than it really is. Encourage your circle to add events for more accurate times.
          </Text>
          {__DEV__ && (
            <Text style={{ fontSize: 10, marginTop: 12, color: colors.textTertiary, fontStyle: "italic" }}>
              [P0_FREE_INFO_COPY]
            </Text>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Circle Settings (uses shared BottomSheet) */}
      <BottomSheet
        visible={showGroupSettings}
        onClose={() => { setShowGroupSettings(false); setSettingsSheetView("settings"); }}
        heightPct={0}
        maxHeightPct={0.85}
        backdropOpacity={0.5}
        keyboardMode="padding"
      >
              {/* Header */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" }}>
                  Circle Settings
                </Text>
              </View>

              {/* Scrollable content for keyboard accessibility */}
              <ScrollView 
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
              {settingsSheetView === "settings" && (<>
              {/* Circle Info */}
              <View style={{ paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    backgroundColor: `${themeColor}20`,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 16,
                    overflow: "hidden",
                  }}
                >
                  <CirclePhotoEmoji photoUrl={circle?.photoUrl} emoji={circle?.emoji ?? "👥"} emojiStyle={{ fontSize: 28 }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>
                    {circle?.name}
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                    {members.length} member{members.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>

              {/* Description Section */}
              <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textSecondary }}>Description</Text>
                  {isHost && !editingDescription && (
                    <Pressable
                      onPress={() => {
                        setDescriptionText(circle?.description ?? "");
                        setEditingDescription(true);
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: themeColor }}>Edit</Text>
                    </Pressable>
                  )}
                </View>
                {editingDescription && isHost ? (
                  <View>
                    <TextInput
                      value={descriptionText}
                      onChangeText={(text) => setDescriptionText(text.slice(0, 160))}
                      placeholder="Add a circle description..."
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      maxLength={160}
                      style={{
                        backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                        borderRadius: 12,
                        padding: 12,
                        color: colors.text,
                        fontSize: 15,
                        minHeight: 60,
                        textAlignVertical: "top",
                      }}
                    />
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <Text style={{ fontSize: 12, color: colors.textTertiary }}>{descriptionText.length}/160</Text>
                      <View style={{ flexDirection: "row" }}>
                        <Pressable
                          onPress={() => setEditingDescription(false)}
                          style={{ paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.textSecondary }}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            const newDescription = descriptionText.trim() || undefined;
                            updateCircleMutation.mutate({ description: newDescription ?? "" });
                          }}
                          disabled={updateCircleMutation.isPending}
                          style={{
                            backgroundColor: themeColor,
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 8,
                            opacity: updateCircleMutation.isPending ? 0.5 : 1,
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>
                            {updateCircleMutation.isPending ? "Saving..." : "Save"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : (
                  <Text style={{ fontSize: 15, color: circle?.description ? colors.text : colors.textTertiary, fontStyle: circle?.description ? "normal" : "italic" }}>
                    {circle?.description ?? (isHost ? "Tap Edit to add a description" : "No description")}
                  </Text>
                )}
              </View>

              {/* Settings Options */}
              <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                {/* Circle Photo (host only) */}
                {isHost && (
                  <Pressable
                    onPress={() => setSettingsSheetView("photo")}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Camera size={22} color={themeColor} />
                    <View style={{ flex: 1, marginLeft: 16 }}>
                      <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Circle Photo</Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                        {circle?.photoUrl ? "Change or remove photo" : "Add a circle photo"}
                      </Text>
                    </View>
                    <ChevronRight size={20} color={colors.textTertiary} />
                  </Pressable>
                )}

                {/* Members List */}
                <Pressable
                  onPress={() => {
                    // [P0_MODAL_GUARD] Close settings FIRST, then open members
                    // after a short delay. Two simultaneous Modals freeze iOS touch handling.
                    if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_start", { from: "settings", to: "members", ms: 350 });
                    setShowGroupSettings(false);
                    setTimeout(() => {
                      setShowMembersSheet(true);
                      if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_open_child", { from: "settings", to: "members", ms: 350 });
                    }, 350);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Users size={22} color={colors.text} />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Members</Text>
                  </View>
                  <ChevronRight size={20} color={colors.textTertiary} />
                </Pressable>

                {/* Share Group */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Share.share({
                      message: `Join my group "${circle?.name}" on Open Invite!`,
                      title: circle?.name,
                    }).catch(() => {
                      // User cancelled share
                    });
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Users size={22} color={themeColor} />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Share Group</Text>
                  </View>
                  <ChevronRight size={20} color={colors.textTertiary} />
                </Pressable>

                {/* [P0_CIRCLE_MUTE_V1] Mute Messages Toggle */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <BellOff size={22} color={colors.textSecondary} />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Mute Messages</Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                      {circle?.isMuted ? "Notifications silenced" : "Get notified of new messages"}
                    </Text>
                    {/* [P0_CIRCLE_MUTE_POLISH] Helper text explaining mute scope */}
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                      Mutes message notifications only. Event alerts still send.
                    </Text>
                  </View>
                  <Switch
                    value={circle?.isMuted ?? false}
                    onValueChange={(value) => {
                      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "toggle_press", { circleId: id, userId: session?.user?.id, desiredValue: value, currentValue: circle?.isMuted, sourceField: "circle?.isMuted via circleKeys.single" });
                      if (muteMutation.isPending) {
                        if (__DEV__) devLog('[P1_DOUBLE_SUBMIT_GUARD]', 'circleMute ignored, circleId=' + id);
                        return;
                      }
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      muteMutation.mutate(value);
                    }}
                    trackColor={{ false: isDark ? "#3A3A3C" : "#E5E7EB", true: themeColor + "80" }}
                    thumbColor={circle?.isMuted ? themeColor : isDark ? "#FFFFFF" : "#FFFFFF"}
                    ios_backgroundColor={isDark ? "#3A3A3C" : "#E5E7EB"}
                  />
                </View>

                {/* [P1_NOTIFY_LEVEL_UI] Notification Level Row */}
                <Pressable
                  onPress={() => {
                    if (__DEV__) devLog("[P0_CIRCLE_SETTINGS]", "notify_level_tap");
                    // [P0_CIRCLE_SETTINGS] Close settings sheet FIRST, then open notify sheet
                    // after a short delay. Two simultaneous Modals freeze iOS touch handling.
                    setShowPollSheet(false);
                    setShowGroupSettings(false);
                    setTimeout(() => {
                      setShowNotifySheet(true);
                      if (__DEV__) devLog("[P0_CIRCLE_SETTINGS]", "notify_sheet_opened");
                    }, 350);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Bell size={22} color={colors.textSecondary} />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Notification Level</Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                      {notifyLevel === "all" ? "All activity" : notifyLevel === "decisions" ? "Decisions only" : notifyLevel === "mentions" ? "Mentions only" : "Muted"}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textTertiary} />
                </Pressable>

                {/* Leave Group */}
                <Pressable
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    setShowGroupSettings(false);
                    // Navigate back and let the delete happen from friends screen
                    router.back();
                    safeToast.info("Leave Group", "To leave this group, swipe left on it in your Friends tab.");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 16,
                  }}
                >
                  <X size={22} color="#FF3B30" />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: "#FF3B30" }}>Leave Group</Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>Remove yourself from this group</Text>
                  </View>
                </Pressable>
              </View>
              </>)}

              {/* Photo actions view (inside same sheet) */}
              {settingsSheetView === "photo" && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
                  <View style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 4 }}>
                    <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text, textAlign: "center" }}>Circle Photo</Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      if (uploadingPhoto) return;
                      setShowGroupSettings(false);
                      setSettingsSheetView("settings");
                      // Wait for sheet dismiss animation to complete before opening picker
                      // Prevents iOS gesture/touch blocker overlay freeze
                      await new Promise(r => setTimeout(r, 300));
                      try {
                        if (__DEV__) devLog('[CIRCLE_PHOTO_PICK_START]');
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== "granted") {
                          safeToast.warning("Permission Required", "Please allow access to your photos.");
                          return;
                        }
                        const result = await ImagePicker.launchImageLibraryAsync({
                          mediaTypes: ["images"],
                          allowsEditing: true,
                          aspect: [1, 1],
                          quality: 0.8,
                        });
                        if (result.canceled || !result.assets?.[0]) {
                          if (__DEV__) devLog('[CIRCLE_PHOTO_PICK_CANCEL]');
                          return;
                        }
                        if (__DEV__) devLog('[CIRCLE_PHOTO_PICK_OK]', { uri: result.assets[0].uri.slice(-30) });

                        setUploadingPhoto(true);
                        const uploadResult = await uploadCirclePhoto(result.assets[0].uri);
                        if (__DEV__) devLog('[CIRCLE_PHOTO_SAVE]', { photoUrl: uploadResult.url, photoPublicId: uploadResult.publicId ?? null });
                        await api.put(`/api/circles/${id}`, { photoUrl: uploadResult.url, photoPublicId: uploadResult.publicId });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        safeToast.success("Saved", "Circle photo updated");
                        queryClient.invalidateQueries({ queryKey: circleKeys.single(id) });
                        queryClient.invalidateQueries({ queryKey: circleKeys.all() });
                      } catch (error: any) {
                        if (__DEV__) devError("[CIRCLE_PHOTO]", "upload failed", error);
                        safeToast.error("Upload Failed", error?.message || "Please try again.");
                      } finally {
                        setUploadingPhoto(false);
                      }
                    }}
                    disabled={uploadingPhoto}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      opacity: uploadingPhoto ? 0.5 : 1,
                    }}
                  >
                    <Camera size={22} color={themeColor} />
                    <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text, marginLeft: 16, flex: 1 }}>
                      {uploadingPhoto ? "Uploading..." : "Upload Photo"}
                    </Text>
                  </Pressable>

                  {circle?.photoUrl && (
                    <Pressable
                      onPress={async () => {
                        try {
                          await api.put(`/api/circles/${id}`, { photoUrl: null, photoPublicId: null });
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          safeToast.success("Removed", "Circle photo removed");
                          queryClient.invalidateQueries({ queryKey: circleKeys.single(id) });
                          queryClient.invalidateQueries({ queryKey: circleKeys.all() });
                        } catch (error: any) {
                          if (__DEV__) devError("[CIRCLE_PHOTO]", "remove failed", error);
                          safeToast.error("Remove Failed", "Failed to remove photo.");
                        }
                        setSettingsSheetView("settings");
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <X size={22} color="#FF3B30" />
                      <Text style={{ fontSize: 16, fontWeight: "500", color: "#FF3B30", marginLeft: 16, flex: 1 }}>
                        Remove Photo
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={() => setSettingsSheetView("settings")}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 16,
                    }}
                  >
                    <ChevronLeft size={20} color={colors.textSecondary} />
                    <Text style={{ fontSize: 16, fontWeight: "500", color: colors.textSecondary, marginLeft: 8 }}>
                      Back
                    </Text>
                  </Pressable>
                </View>
              )}
              </ScrollView>
      </BottomSheet>

      {/* [P1_NOTIFY_LEVEL_UI] Notification Level Sheet */}
      <BottomSheet
        visible={showNotifySheet}
        onClose={() => { setShowNotifySheet(false); if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "sheet_close", { sheet: "notification_level" }); }}
        heightPct={0}
        maxHeightPct={0.45}
        backdropOpacity={0.5}
        title="Notifications"
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>
            Choose what you want to hear from this circle.
          </Text>
          {([
            { key: "all" as const, label: "All activity", desc: "Messages, decisions, and events" },
            { key: "decisions" as const, label: "Decisions only", desc: "Polls and plan lock updates" },
            { key: "mentions" as const, label: "Mentions only", desc: "Only when you\u2019re mentioned" },
            { key: "mute" as const, label: "Muted", desc: "No notifications from this circle" },
          ]).map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => {
                if (__DEV__) devLog("[P1_NOTIFY_LEVEL_UI]", "select", { level: opt.key });
                Haptics.selectionAsync();
                notifyLevelMutation.mutate(opt.key);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 14,
                paddingHorizontal: 14,
                marginBottom: 6,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: notifyLevel === opt.key ? themeColor : colors.border,
                backgroundColor: notifyLevel === opt.key ? (themeColor + "12") : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"),
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: notifyLevel === opt.key ? "600" : "400", color: notifyLevel === opt.key ? themeColor : colors.text }}>
                  {opt.label}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{opt.desc}</Text>
              </View>
              <View style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: notifyLevel === opt.key ? themeColor : colors.textTertiary,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: notifyLevel === opt.key ? themeColor : "transparent",
              }}>
                {notifyLevel === opt.key && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
              </View>
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      {/* Members Sheet Modal */}
      <Modal
        visible={showMembersSheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowMembersSheet(false);
          setSelectedFriends([]);
        }}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => {
            setShowMembersSheet(false);
            setSelectedFriends([]);
          }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Animated.View
              entering={FadeInDown.springify().damping(20).stiffness(300)}
              style={{
                backgroundColor: colors.background,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                height: Dimensions.get('window').height * 0.92,
                maxHeight: Dimensions.get('window').height * 0.95,
                overflow: "hidden",
              }}
              onLayout={__DEV__ ? (e) => {
                const { height: sheetH } = e.nativeEvent.layout;
                devLog('[P0_MEMBERS_SHEET]', 'sheet_open', { sheetHeight: Math.round(sheetH), windowHeight: Math.round(Dimensions.get('window').height), bottomInset: insets.bottom, sheetPct: '92%', maxPct: '95%' });
                devLog('[P2_ANIMATION]', { component: 'members_sheet', animationMounted: true });
                devLog('[P2_CIRCLE_UX]', { polishApplied: true });
              } : undefined}
            >
              {/* Modal Handle */}
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.textTertiary,
                    opacity: 0.4,
                  }}
                />
              </View>

              {/* Modal Header */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>
                  Members
                </Text>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(40, insets.bottom + 16) }}
                onContentSizeChange={__DEV__ ? (_w, h) => {
                  devLog('[P0_MEMBERS_SHEET]', 'scroll_content_size', { contentHeight: Math.round(h), membersCount: members.length, availableFriendsCount: availableFriends.length });
                } : undefined}
              >
                {/* Members List — SSOT via UserRow */}
                {__DEV__ && members.length > 0 && once('P0_USERROW_SHEET_SOT_circle') && void devLog('[P0_USERROW_SHEET_SOT]', { screen: 'circle_members_sheet', showChevron: false, usesPressedState: true, rowsSampled: members.length })}
                {members.map((member, idx) => {
                  const isHostOfCircle = circle?.createdById === member.userId;
                  return (
                    <View
                      key={member.userId}
                      style={{
                        borderBottomWidth: idx < members.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <UserListRow
                        handle={null}
                        displayName={member.user.name}
                        bio={null}
                        avatarUri={member.user.image}
                        badgeText={isHostOfCircle ? "Host" : null}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setShowMembersSheet(false);
                          setSelectedFriends([]);
                          router.push(`/user/${member.userId}`);
                        }}
                        rightAccessory={
                          isHost && !isHostOfCircle ? (
                              <Pressable
                                onPress={(e) => {
                                  e.stopPropagation();
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                  if (__DEV__) {
                                    devLog('[CircleRemoveMember] Trash pressed, member snapshot:', {
                                      memberId: member.id,
                                      memberUserId: member.userId,
                                      memberUserIdFromUser: member.user?.id,
                                      memberName: member.user?.name,
                                      circleId: id,
                                    });
                                  }
                                  const targetUserId = member.userId;
                                  if (!targetUserId) {
                                    devError('[CircleRemoveMember] ERROR: No userId found for member');
                                    safeToast.error("Member Not Found", "Unable to identify member. Please try again.");
                                    return;
                                  }
                                  setShowMembersSheet(false);
                                  setTimeout(() => {
                                    setSelectedMemberToRemove(targetUserId);
                                  }, 100);
                                }}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 16,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: "#FF3B3015",
                                }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <TrashIcon size={16} color="#FF3B30" />
                              </Pressable>
                          ) : undefined
                        }
                      />
                    </View>
                  );
                })}

                {/* Add Members Section — visual separator from members list */}
                <View style={{ marginTop: 20, paddingTop: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 12 }}>Add Members</Text>

                  {availableFriends.length > 0 ? (
                    <View
                      onLayout={__DEV__ ? (e) => {
                        devLog('[P0_MEMBERS_SHEET]', 'add_members_list_layout', { listHeight: Math.round(e.nativeEvent.layout.height), friendCount: availableFriends.length });
                      } : undefined}
                    >
                      {__DEV__ && availableFriends.length > 0 && once('P0_USERROW_SHEET_SOT_circle_add') && void devLog('[P0_USERROW_SHEET_SOT]', { screen: 'circle_add_members_sheet', showChevron: false, usesPressedState: true, rowsSampled: availableFriends.length })}
                      {availableFriends.map((friend, idx) => {
                        const isSelected = selectedFriends.includes(friend.friendId);
                        return (
                          <Animated.View
                            key={friend.friendId}
                            entering={FadeInDown.delay(idx * 25).springify()}
                          >
                            <Pressable
                              onPress={() => toggleFriendSelection(friend.friendId)}
                              style={{
                                borderBottomWidth: 1,
                                borderBottomColor: colors.border,
                              }}
                            >
                              <UserListRow
                                handle={friend.friend.Profile?.handle}
                                displayName={friend.friend.name}
                                bio={friend.friend.Profile?.calendarBio}
                                avatarUri={friend.friend.image}
                                disablePressFeedback
                                rightAccessory={
                                  <View
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 10,
                                      borderWidth: 2,
                                      borderColor: colors.border,
                                      backgroundColor: isSelected ? themeColor : "transparent",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    {isSelected && <Check size={16} color="#fff" />}
                                  </View>
                                }
                              />
                            </Pressable>
                          </Animated.View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>No more friends to add</Text>
                  )}
                </View>
              </ScrollView>

              {/* Add Button */}
              {selectedFriends.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(24, insets.bottom + 8), paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Button
                    variant="primary"
                    label={
                      addMembersMutation.isPending
                        ? "Adding..."
                        : `Add ${selectedFriends.length} Friend${selectedFriends.length > 1 ? "s" : ""}`
                    }
                    onPress={handleAddMembers}
                    disabled={selectedFriends.length === 0 || addMembersMutation.isPending}
                    loading={addMembersMutation.isPending}
                    style={{ borderRadius: 12 }}
                  />
                </View>
              )}
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Remove Member Confirmation Modal */}
      <Modal
        visible={!!selectedMemberToRemove}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedMemberToRemove(null)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 20 }}
          onPress={() => setSelectedMemberToRemove(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340 }}>
            <Animated.View
              entering={FadeIn.duration(200)}
              style={{
                backgroundColor: colors.background,
                borderRadius: 20,
                padding: 24,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: "#FF3B3020",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <WarningIcon size={32} color="#FF3B30" />
              </View>

              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 8 }}>
                Remove Member?
              </Text>

              <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                {(() => {
                  const memberToRemove = members.find(m => m.userId === selectedMemberToRemove);
                  return `Are you sure you want to remove ${memberToRemove?.user.name ?? "this member"} from the circle?`;
                })()}
              </Text>

              <View style={{ flexDirection: "row", width: "100%" }}>
                <Pressable
                  onPress={() => setSelectedMemberToRemove(null)}
                  style={{
                    flex: 1,
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    marginRight: 8,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (selectedMemberToRemove) {
                      if (__DEV__) {
                        devLog('[CircleRemoveMember] Confirm pressed:', {
                          circleId: id,
                          memberUserIdToRemove: selectedMemberToRemove,
                          apiPath: `/api/circles/${id}/members/${selectedMemberToRemove}`,
                        });
                      }
                      removeMemberMutation.mutate(selectedMemberToRemove);
                    }
                  }}
                  disabled={removeMemberMutation.isPending}
                  style={{
                    flex: 1,
                    backgroundColor: "#FF3B30",
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    opacity: removeMemberMutation.isPending ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>
                    {removeMemberMutation.isPending ? "Removing..." : "Remove"}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create Event Modal with visibility tabs */}
      <Modal
        visible={showCreateEvent}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateEvent(false)}
      >
        <Pressable
          onPress={() => setShowCreateEvent(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: 20,
              width: "85%",
              maxWidth: 340,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 16 }}>
              Create Event
            </Text>

            {/* Circle Only indicator */}
            <View style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6", borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{
                textAlign: "center",
                fontSize: 14,
                fontWeight: "600",
                color: themeColor,
              }}>
                Circle Only
              </Text>
            </View>

            {/* Description text */}
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: "center", marginBottom: 20 }}>
              Events created here are only visible to friends in this group.
            </Text>

            {/* Create Button */}
            <Button
              variant="primary"
              label="Create"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowCreateEvent(false);
                router.push(`/create?circleId=${id}&visibility=circle_only` as any);
              }}
              style={{ borderRadius: 12 }}
            />

            {/* Cancel Button */}
            <Pressable
              onPress={() => setShowCreateEvent(false)}
              style={{ paddingVertical: 12, marginTop: 8 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.textSecondary, textAlign: "center" }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Paywall Modal for member limit gating */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
      />

      {/* [P2_CHAT_EDITDEL] Edit message overlay */}
      {editTargetId !== null && (
        <Pressable
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => { setEditTargetId(null); setEditDraftContent(""); }}
        >
          <Pressable
            style={{
              width: "85%",
              backgroundColor: isDark ? "#2c2c2e" : "#ffffff",
              borderRadius: 16,
              padding: 20,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text, marginBottom: 12 }}>Edit message</Text>
            <TextInput
              value={editDraftContent}
              onChangeText={setEditDraftContent}
              multiline
              style={{
                color: colors.text,
                fontSize: 16,
                backgroundColor: isDark ? "#1c1c1e" : "#f3f4f6",
                borderRadius: 10,
                padding: 12,
                minHeight: 60,
                maxHeight: 160,
                textAlignVertical: "top",
              }}
              autoFocus
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 12 }}>
              <Pressable
                onPress={() => { setEditTargetId(null); setEditDraftContent(""); }}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "500" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const trimmed = editDraftContent.trim();
                  if (!trimmed) {
                    safeToast.error("Message Empty", "Message cannot be empty");
                    return;
                  }
                  setEditedContentByStableId((prev) => ({ ...prev, [editTargetId]: { content: trimmed, editedAt: Date.now() } }));
                  if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "edit_save", { messageId: editTargetId });
                  setEditTargetId(null);
                  setEditDraftContent("");
                }}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: themeColor }}
              >
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      )}

      {/* [P2_CHAT_REACTIONS] Emoji reaction picker overlay */}
      {reactionTargetId !== null && (
        <Pressable
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setReactionTargetId(null)}
        >
          <View
            style={{
              flexDirection: "row",
              backgroundColor: isDark ? "#2c2c2e" : "#ffffff",
              borderRadius: 28,
              paddingHorizontal: 8,
              paddingVertical: 6,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}
          >
            {REACTION_EMOJI.map((emoji) => {
              const isSelected = (reactionsByStableId[reactionTargetId] ?? []).includes(emoji);
              return (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    setReactionsByStableId((prev) => {
                      const existing = prev[reactionTargetId] ?? [];
                      const next = existing.includes(emoji)
                        ? existing.filter((e) => e !== emoji)
                        : [...existing, emoji];
                      if (__DEV__) devLog("[P2_CHAT_REACTIONS]", existing.includes(emoji) ? "clear" : "select", { emoji, messageId: reactionTargetId });
                      return { ...prev, [reactionTargetId]: next };
                    });
                    setReactionTargetId(null);
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: isSelected
                      ? (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)")
                      : "transparent",
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      )}

      {/* ─── [P0_CHAT_ANCHOR] DEV-only Chat QA Panel ─── */}
      {__DEV__ && (
        <View style={{ position: "absolute", top: insets.top + 56, right: 8, zIndex: 9999 }} pointerEvents="box-none">
          <Pressable
            onPress={() => setQaExpanded(p => !p)}
            style={{
              backgroundColor: "rgba(220,38,38,0.9)",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
              alignSelf: "flex-end",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
              {qaExpanded ? "\u25BC QA" : "\u25B6 QA"}
            </Text>
          </Pressable>
          {qaExpanded && (
            <View style={{
              backgroundColor: isDark ? "rgba(30,30,32,0.97)" : "rgba(255,255,255,0.97)",
              borderRadius: 12,
              padding: 8,
              marginTop: 4,
              width: 200,
              maxHeight: 400,
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 10,
            }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {([
                  { label: "+1 msg", fn: () => qaInjectMessages(1) },
                  { label: "+3 msgs", fn: () => qaInjectMessages(3) },
                  { label: "+10 msgs", fn: () => qaInjectMessages(10) },
                  { label: "\u2328 Typing 0\u21942\u21940", fn: qaToggleTyping },
                  { label: "\u2717 Failed banner", fn: qaToggleFailed },
                  { label: "\u23F3 Pending footer", fn: qaTogglePending },
                  { label: "\uD83D\uDC4D Reactions", fn: qaToggleReactions },
                  { label: "\u21A9 Reply preview", fn: qaToggleReply },
                  { label: "\u270E Edit indicator", fn: qaToggleEdit },
                  { label: "\uD83D\uDDD1 Delete tombstone", fn: qaToggleDelete },
                  { label: "\u2B06 Prepend 5 old", fn: qaSimulatePrepend },
                ] as const).map(({ label, fn }) => (
                  <Pressable
                    key={label}
                    onPress={fn}
                    style={{
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                      borderRadius: 6,
                      marginBottom: 3,
                      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500" }}>{label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
