/**
 * CircleMembersSection — MiniCalendar component extracted from circle/[id].tsx
 * to reduce mount cost and file size.
 *
 * Shows member events on a calendar grid with day-detail sheets,
 * availability computation, and best-time-to-meet UI.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  FlatList,
  PanResponder,
  InteractionManager,
} from "react-native";
import { devLog } from "@/lib/devLog";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
} from "@/ui/icons";
import * as Haptics from "expo-haptics";
import BottomSheet from "@/components/BottomSheet";
import { buildGlassTokens } from "@/ui/glassTokens";
import { api } from "@/lib/api";
import { circleKeys } from "@/lib/circleQueryKeys";
import { shouldMaskEvent, getEventDisplayFields } from "@/lib/eventVisibility";
import { computeSchedule } from "@/lib/scheduling/engine";
import { buildBusyWindowsFromMemberEvents } from "@/lib/scheduling/adapters";
import { buildWorkScheduleBusyWindows, mergeWorkScheduleWindows, type WorkScheduleDay } from "@/lib/scheduling/workScheduleAdapter";
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
import type { Circle, GetCircleAvailabilityResponse } from "@/shared/contracts";
import {
  DayDetailEventsSection,
  RangeRow,
  mergeContiguousSlots,
  freeLabel,
  type DayDetailEvent,
  type SlotDetailItem,
  type AvailListItem,
} from "./CircleAvailabilitySection";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
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
  const [selectedSlot, setSelectedSlot] = useState<SchedulingSlotResult | null>(null);
  const [showBestTimeSheet, setShowBestTimeSheet] = useState(false);
  const [showAllAvailability, setShowAllAvailability] = useState(false);
  const [showLimitedTimes, setShowLimitedTimes] = useState(false);
  const [showMoreTimes, setShowMoreTimes] = useState(false);
  // [PERF] Deferred rendering: false until sheet open animation settles
  const [isSheetSettled, setIsSheetSettled] = useState(false);
  const [bestTimesDate, setBestTimesDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [quietPreset, setQuietPreset] = useState<SuggestedHoursPreset>("default");
  const [showPresetPicker, setShowPresetPicker] = useState(false);

  // [PERF] Defer heavy Who's Free content until sheet open animation settles
  useEffect(() => {
    if (showBestTimeSheet) {
      const handle = InteractionManager.runAfterInteractions(() => {
        setIsSheetSettled(true);
      });
      return () => handle.cancel();
    } else {
      setIsSheetSettled(false);
    }
  }, [showBestTimeSheet]);

  const glass = buildGlassTokens(isDark, colors);

  // [P0_DAY_DETAIL_SWIPE] Swipe left/right inside unified sheet to change day
  const bestTimesDateRef = useRef(bestTimesDate);
  bestTimesDateRef.current = bestTimesDate;
  const swipeConsumedRef = useRef(false);

  const daySwipePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gs) => {
      // Only claim horizontal swipes that clearly exceed vertical movement
      return Math.abs(gs.dx) >= 40 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5;
    },
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderGrant: () => {
      swipeConsumedRef.current = false;
    },
    onPanResponderMove: (_evt, gs) => {
      if (swipeConsumedRef.current) return;
      if (Math.abs(gs.dx) >= 40 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5) {
        swipeConsumedRef.current = true;
        const fromDate = bestTimesDateRef.current;
        const toDate = new Date(fromDate);
        const direction = gs.dx < 0 ? "left" : "right";
        toDate.setDate(toDate.getDate() + (direction === "left" ? 1 : -1));
        toDate.setHours(0, 0, 0, 0);
        Haptics.selectionAsync().catch(() => {});
        setBestTimesDate(toDate);
        if (__DEV__) {
          devLog('[P0_DAY_DETAIL_SWIPE]', {
            circleId,
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString(),
            direction,
          });
        }
      }
    },
    onPanResponderRelease: () => {
      swipeConsumedRef.current = false;
    },
  }), [circleId]);

  // [P0_WORK_HOURS_BLOCK] Fetch current user's work schedule for busy-block SSOT
  const { data: workScheduleData } = useQuery({
    queryKey: ["workSchedule"],
    queryFn: () => api.get<{ schedules: WorkScheduleDay[] }>("/api/work-schedule"),
    enabled: !!currentUserId,
  });
  const workSchedules = workScheduleData?.schedules ?? [];

  // [PERF] Stable fingerprints for scheduling deps — avoids recomputing
  // computeSchedule() on every 60s poll when data hasn't actually changed.
  const memberIdsKey = useMemo(
    () => members.map((m) => m.userId).sort().join(","),
    [members],
  );
  const memberEventsKey = useMemo(
    () => memberEvents.map((me) => `${me.userId}:${me.events.length}`).sort().join("|"),
    [memberEvents],
  );
  const workSchedulesKey = useMemo(
    () => workSchedules.map((ws) => `${ws.dayOfWeek}:${ws.isEnabled}`).join(","),
    [workSchedules],
  );

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
      coverUrl?: string | null;
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

    // [P0_WORK_HOURS_BLOCK] Merge current user's work schedule as busy blocks
    if (currentUserId && workSchedules.length > 0) {
      const workWindows = buildWorkScheduleBusyWindows(workSchedules, rangeStart, rangeEnd);
      mergeWorkScheduleWindows(busyWindowsByUserId, currentUserId, workWindows);
    }

    return computeSchedule({
      members: members.map((m) => ({ id: m.userId })),
      busyWindowsByUserId,
      rangeStart,
      rangeEnd,
      intervalMinutes: 30,
      slotDurationMinutes: 60,
      maxTopSlots: 1000, // Return all slots so per-day dot indicators can be derived
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable fingerprints replace object refs
  }, [memberEventsKey, memberIdsKey, workSchedulesKey, currentUserId]);

  // [P0_DAY_AVAIL_SOT] Compute stable date range strings for the selected day
  const dayAvailRange = useMemo(() => {
    const dayStart = new Date(bestTimesDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(bestTimesDate);
    dayEnd.setHours(23, 59, 59, 999);
    return { start: dayStart.toISOString(), end: dayEnd.toISOString() };
  }, [bestTimesDate]);

  // [P0_DAY_AVAIL_SOT] Fetch interval-based availability from server (includes ALL members' work schedules)
  const { data: dayAvailData } = useQuery({
    queryKey: circleKeys.availability(circleId, dayAvailRange.start, dayAvailRange.end),
    queryFn: async () => {
      try {
        const params = new URLSearchParams({ start: dayAvailRange.start, end: dayAvailRange.end });
        return await api.get<GetCircleAvailabilityResponse>(
          `/api/circles/${circleId}/availability?${params.toString()}`
        );
      } catch (e: any) {
        if (__DEV__) devLog('[P0_DAY_AVAIL_SOT]', 'fetch_error', { status: e?.status ?? 'unknown' });
        return null;
      }
    },
    enabled: !!circleId && showBestTimeSheet,
    staleTime: 60_000,
    retry: false,
  });

  // Per-date availability for the "Best time to meet" sheet
  // [P0_DAY_AVAIL_SOT] Uses /availability response as SSOT when available,
  // falls back to client-side memberEvents when the query hasn't resolved yet.
  // [PERF] Gated behind isSheetSettled to defer heavy computeSchedule() until after open animation.
  const dateScheduleResult = useMemo(() => {
    if (!isSheetSettled) return null;

    let busyWindowsByUserId: Record<string, import("@/lib/scheduling/types").BusyWindow[]>;

    if (dayAvailData?.availability) {
      // SSOT path: server-side busyTimes include ALL members' work schedules
      busyWindowsByUserId = {};
      for (const member of dayAvailData.availability) {
        busyWindowsByUserId[member.userId] = member.busyTimes.map((bt) => ({
          start: bt.start,
          end: bt.end,
        }));
      }
    } else {
      // Fallback: client-side memberEvents + current user's work schedule only
      busyWindowsByUserId = buildBusyWindowsFromMemberEvents(memberEvents);
      if (currentUserId && workSchedules.length > 0) {
        const workWindows = buildWorkScheduleBusyWindows(workSchedules, dayAvailRange.start, dayAvailRange.end);
        mergeWorkScheduleWindows(busyWindowsByUserId, currentUserId, workWindows);
      }
    }

    // [P0_ALL_AVAIL_FIX] Diagnostic: log per-member busy window counts
    if (__DEV__) {
      const perMember: Record<string, { total: number }> = {};
      for (const m of members) {
        const wins = busyWindowsByUserId[m.userId] ?? [];
        perMember[m.userId] = { total: wins.length };
      }
      devLog('[P0_DAY_AVAIL_SOT]', 'dateSchedule_busyDiag', {
        date: bestTimesDate.toISOString(),
        source: dayAvailData?.availability ? 'server_availability' : 'client_fallback',
        memberCount: members.length,
        perMember,
      });
    }

    return computeSchedule({
      members: members.map((m) => ({ id: m.userId })),
      busyWindowsByUserId,
      rangeStart: dayAvailRange.start,
      rangeEnd: dayAvailRange.end,
      intervalMinutes: 30,
      slotDurationMinutes: 60,
      maxTopSlots: 50, // [PERF] Day sheet only shows top ~3 + expanded ranges; 1000 was wasteful
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable fingerprints replace object refs
  }, [isSheetSettled, dayAvailData, memberEventsKey, memberIdsKey, bestTimesDate, workSchedulesKey, currentUserId, dayAvailRange]);

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

  // Precompute slot detail items — sorted ascending by slot start
  const slotDetailItems = useMemo((): SlotDetailItem[] => {
    return [...quietSlots]
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .map((slot) => ({
        slotStartISO: slot.start,
        slotEndISO: slot.end,
        freeCount: slot.availableCount,
        totalMembers: slot.totalMembers,
      }));
  }, [quietSlots]);

  // [P0_DAYDETAIL_AVAIL_RANGE_SECTIONS] Derive merged ranges per section
  const everyoneRanges = useMemo(() =>
    mergeContiguousSlots(slotDetailItems.filter((s) => s.freeCount === s.totalMembers), "everyone"),
  [slotDetailItems]);
  const almostRanges = useMemo(() =>
    mergeContiguousSlots(slotDetailItems.filter((s) => s.freeCount === s.totalMembers - 1), "almost"),
  [slotDetailItems]);
  const limitedRanges = useMemo(() =>
    mergeContiguousSlots(slotDetailItems.filter((s) => s.freeCount <= s.totalMembers - 2), "limited"),
  [slotDetailItems]);

  // Composite data array for the FlatList — section headers + range rows + limited toggle
  const sectionListData = useMemo((): AvailListItem[] => {
    const items: AvailListItem[] = [];
    if (everyoneRanges.length > 0) {
      items.push({ kind: "section-header", key: "sh-everyone", title: "Everyone free" });
      items.push(...everyoneRanges);
    }
    if (almostRanges.length > 0) {
      items.push({ kind: "section-header", key: "sh-almost", title: "Almost everyone" });
      items.push(...almostRanges);
    }
    if (limitedRanges.length > 0) {
      items.push({ kind: "limited-toggle", key: "lt-toggle", showing: showLimitedTimes, count: limitedRanges.length });
      if (showLimitedTimes) {
        items.push({ kind: "section-header", key: "sh-limited", title: "Limited" });
        items.push(...limitedRanges);
      }
    }
    return items;
  }, [everyoneRanges, almostRanges, limitedRanges, showLimitedTimes]);

  // DEV proof log — fires once per expand action via ref latch
  const vlistLogLatchRef = useRef(false);
  const expandTapTsRef = useRef(0);
  const firstRowTsRef = useRef(0);
  useEffect(() => {
    if (!showAllAvailability) {
      vlistLogLatchRef.current = false;
      expandTapTsRef.current = 0;
      firstRowTsRef.current = 0;
      return;
    }
    if (vlistLogLatchRef.current) return;
    vlistLogLatchRef.current = true;
    if (__DEV__) {
      const dayKey = bestTimesDate.toISOString().slice(0, 10);
      requestAnimationFrame(() => {
        devLog('[P0_DAYDETAIL_AVAIL_RANGE_SECTIONS]', {
          dayKey,
          totalMembers: members.length,
          everyoneRanges: everyoneRanges.length,
          almostRanges: almostRanges.length,
          limitedRanges: limitedRanges.length,
          showLimitedTimes,
        });
        const allRanges = [...everyoneRanges, ...almostRanges, ...limitedRanges];
        devLog('[P0_DAYDETAIL_RANGE_MERGE_PROOF]', {
          dayKey,
          inputSlotCount: slotDetailItems.length,
          outputRangeCount: allRanges.length,
          firstRangeStart: allRanges[0]?.rangeStartISO ?? null,
          lastRangeEnd: allRanges[allRanges.length - 1]?.rangeEndISO ?? null,
        });
      });
    }
  }, [showAllAvailability, members.length, bestTimesDate, everyoneRanges.length, almostRanges.length, limitedRanges.length, showLimitedTimes]);

  // Stable renderItem for clustered section list — handles range rows, section headers, and limited toggle
  const renderAvailListItem = useCallback(({ item }: { item: AvailListItem }) => {
    if (item.kind === "section-header") {
      return (
        <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: colors.textTertiary, textTransform: "uppercase", marginTop: 14, marginBottom: 6, paddingHorizontal: 4 }}>
          {item.title}
        </Text>
      );
    }
    if (item.kind === "limited-toggle") {
      return (
        <Pressable
          onPress={() => {
            const next = !item.showing;
            if (__DEV__) {
              devLog('[P0_DAYDETAIL_AVAIL_LIMITED_TOGGLE]', {
                circleId,
                dayKey: bestTimesDate.toISOString().slice(0, 10),
                nextShowLimitedTimes: next,
                limitedCount: item.count,
              });
            }
            setShowLimitedTimes(next);
          }}
          style={{ paddingVertical: 10, alignItems: "center", marginTop: 8 }}
        >
          <Text style={{ fontSize: 13, fontWeight: "500", color: themeColor }}>
            {item.showing ? "Hide limited times" : `Show limited times (${item.count} ranges)`}
          </Text>
        </Pressable>
      );
    }
    // kind === "range"
    const handlePress = () => {
      if (__DEV__) {
        devLog('[P0_DAYDETAIL_AVAIL_RANGE_TAP]', {
          circleId,
          dayKey: bestTimesDate.toISOString().slice(0, 10),
          section: item.section,
          rangeStartISO: item.rangeStartISO,
          rangeEndISO: item.rangeEndISO,
          freeCount: item.freeCount,
          totalMembers: item.totalMembers,
        });
      }
      const original = quietSlots.find((s) => s.start === item.representativeSlotStartISO);
      if (original) setSelectedSlot(original);
    };
    return (
      <RangeRow
        item={item}
        textColor={colors.text}
        onPress={handlePress}
      />
    );
  }, [colors.text, colors.textTertiary, circleId, bestTimesDate, quietSlots, themeColor]);

  const availListKeyExtractor = useCallback((item: AvailListItem) => item.key, []);

  // [P0_DAY_DETAIL_UNIFY] Events for the unified Day Detail sheet (keyed off bestTimesDate)
  const dayDetailEvents = useMemo(() => {
    return getEventsForDate(bestTimesDate).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }, [bestTimesDate, getEventsForDate]);

  // [P0_DAY_AVAIL_SOT] Proof log: once per sheet open or day change
  // Logs circleId, selectedDate, memberCount, per-member busyTimes counts,
  // and confirms slot-level freeCount during evening window.
  useEffect(() => {
    if (!__DEV__) return;
    if (!showBestTimeSheet) return;
    const everyoneFreeCount = quietSlots.filter(s => s.availableCount === s.totalMembers).length;
    const partialCount = quietSlots.length - everyoneFreeCount;

    // Per-member busyTimes counts from SSOT (/availability) when available
    const memberBusyDigest: Array<{ userId: string; busyTimesCount: number }> = [];
    if (dayAvailData?.availability) {
      for (const m of dayAvailData.availability.slice(0, 2)) {
        memberBusyDigest.push({ userId: m.userId, busyTimesCount: m.busyTimes.length });
      }
    }

    // Check evening window (17:00Z–22:00Z) for a slot with freeCount < memberCount
    const eveningSlot = quietSlots.find((s) => {
      const h = new Date(s.start).getUTCHours();
      return h >= 17 && h < 22;
    });

    devLog('[P0_DAY_AVAIL_SOT]', {
      circleId,
      selectedDate: bestTimesDate.toISOString(),
      memberCount: members.length,
      source: dayAvailData?.availability ? 'server_availability' : 'client_fallback',
      memberBusyDigest,
      freeLabelCounts: { everyoneFreeCount, partialCount },
      eveningProbe: eveningSlot
        ? { start: eveningSlot.start, freeCount: eveningSlot.availableCount, totalMembers: eveningSlot.totalMembers }
        : null,
    });
  }, [showBestTimeSheet, bestTimesDate, dayDetailEvents, quietSlots, circleId, dayAvailData, members]);

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
    date.setHours(0, 0, 0, 0);
    setSelectedDate(date);
    setBestTimesDate(date);
    setShowBestTimeSheet(true);
  };

  return (
    <View className="rounded-xl mb-3" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(200,200,220,0.15)", borderWidth: 1, borderColor: colors.border, padding: 10 }}>
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
              ...glass.card,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 2,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 12,
              backgroundColor: pressed
                ? (quietHasPerfectOverlap ? "rgba(93,202,165,0.12)" : glass.card.backgroundColor)
                : (quietHasPerfectOverlap ? "rgba(93,202,165,0.08)" : glass.card.backgroundColor),
              borderColor: quietHasPerfectOverlap ? "rgba(93,202,165,0.25)" : glass.card.borderColor,
            })}
          >
            <View>
              <Text style={{ ...glass.value, fontSize: 12, fontWeight: "600", color: quietHasPerfectOverlap ? "#5DCAA5" : colors.textSecondary }}>
                {quietHasPerfectOverlap ? "Everyone's free" : "Best times"}
              </Text>
              <Text style={{ ...glass.label, fontSize: 10, marginTop: 1 }}>Tap to see best times</Text>
            </View>
          </Pressable>

          {/* Unified Day Detail Sheet (events + who's free) */}
          <BottomSheet
            visible={showBestTimeSheet}
            onClose={() => { setShowBestTimeSheet(false); setShowAllAvailability(false); setShowLimitedTimes(false); setShowMoreTimes(false); }}
            title={bestTimesDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            heightPct={0}
            maxHeightPct={0.85}
            backdropOpacity={0.45}
          >
            <FlatList
              data={showAllAvailability ? sectionListData : []}
              renderItem={renderAvailListItem}
              keyExtractor={availListKeyExtractor}
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={true}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
              ListHeaderComponent={
              <>
              {/* [P0_DAY_DETAIL_SWIPE] Swipe wrapper for day change gesture */}
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <View {...daySwipePanResponder.panHandlers}>

              {/* ── Section 1: Open Events ──────────────────────── */}
              <DayDetailEventsSection
                events={dayDetailEvents}
                themeColor={themeColor}
                colors={colors}
                isDark={isDark}
                circleId={circleId}
                currentUserId={currentUserId}
                members={members}
                onClose={() => { setShowBestTimeSheet(false); setShowAllAvailability(false); setShowLimitedTimes(false); setShowMoreTimes(false); }}
                router={router}
                bestTimesDate={bestTimesDate}
              />

              {/* ── Section 2: Who's Free — distinct module container ── */}
              <View style={{
                ...glass.card,
                padding: 16,
                marginTop: 8,
              }}>
              <Text style={{ ...glass.label, fontSize: 13, fontWeight: "700", letterSpacing: 0.4, color: colors.text, marginBottom: 4 }}>
                Who{"\u2019"}s Free
              </Text>
              <Text style={{ ...glass.label, fontSize: 12, marginBottom: 14 }}>
                Based on availability shared in this circle
              </Text>

              {/* [PERF] Skeleton placeholder while schedule computation is deferred */}
              {!isSheetSettled ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  {/* Skeleton rows */}
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={{
                      width: "100%",
                      height: 40,
                      borderRadius: glass.card.borderRadius,
                      backgroundColor: glass.card.backgroundColor,
                      marginBottom: 8,
                    }} />
                  ))}
                  <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>
                    Checking availability…
                  </Text>
                </View>
              ) : (
              <>
              {/* Suggested hours row */}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowPresetPicker((v) => !v);
                }}
                style={{
                  ...glass.card,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  marginBottom: 12,
                  borderRadius: 12,
                }}
              >
                <View>
                  <Text style={{ ...glass.value, fontSize: 13, fontWeight: "600" }}>Suggested hours</Text>
                  <Text style={{ ...glass.label, fontSize: 11, marginTop: 1 }}>
                    {PRESET_LABELS[quietPreset].range}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "500", color: themeColor }}>Change</Text>
              </Pressable>
              <Text style={{ ...glass.label, fontSize: 11, marginTop: -8, marginBottom: 12, paddingHorizontal: 4 }}>
                We only recommend times within these hours.
              </Text>

              {/* Inline preset picker */}
              {showPresetPicker && (
                <View style={{ ...glass.card, marginBottom: 12, borderRadius: 12, overflow: "hidden" }}>
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
                          borderBottomColor: glass.card.borderColor,
                        }}
                      >
                        <View>
                          <Text style={{ ...glass.value, fontSize: 14, fontWeight: isActive ? "600" : "400", color: isActive ? themeColor : colors.text }}>
                            {PRESET_LABELS[p].label}
                          </Text>
                          <Text style={{ ...glass.label, fontSize: 11 }}>{PRESET_LABELS[p].range}</Text>
                        </View>
                        {isActive && <Check size={16} color={themeColor} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Date selector row */}
              <View style={{ ...glass.card, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12 }}>
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
                <Text style={{ ...glass.value, fontSize: 15, fontWeight: "600" }}>
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
                  <Text style={{ ...glass.label, textTransform: "uppercase", marginBottom: 10 }}>
                    Recommended
                  </Text>

                  {/* Best slot — always visible */}
                  {(() => {
                    const slot = quietSlots[0];
                    const slotDate = new Date(slot.start);
                    const endDate = new Date(slot.end);
                    const timeLabel = slotDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                    const endTimeLabel = endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                    return (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                          if (__DEV__) devLog('[P1_PREFILL_EVENT]', { slotStart: slot.start, slotEnd: slot.end, circleId });
                          setShowBestTimeSheet(false);
                          setShowAllAvailability(false);
                          router.push({
                            pathname: "/create",
                            params: { date: slot.start, endDate: slot.end, circleId },
                          } as any);
                        }}
                        onLongPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedSlot(slot); }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          marginBottom: 8,
                          borderRadius: 12,
                          backgroundColor: "rgba(93,202,165,0.08)",
                          borderWidth: glass.card.borderWidth,
                          borderColor: "rgba(93,202,165,0.25)",
                        }}
                      >
                        <View style={{ width: 48, marginRight: 10 }}>
                          <Text style={{ ...glass.label, color: "#5DCAA5", fontWeight: "700" }}>Best</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ ...glass.value }}>{timeLabel} {"\u2013"} {endTimeLabel}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#5DCAA5" }}>
                          {formatSlotAvailabilityCompact(slot.availableCount, slot.totalMembers)}
                        </Text>
                      </Pressable>
                    );
                  })()}

                  {/* Good / Option slots — collapsed behind toggle */}
                  {quietSlots.length > 1 && (
                    <>
                      {showMoreTimes && quietSlots.slice(1, 3).map((slot, idx) => {
                        const actualIdx = idx + 1;
                        const slotDate = new Date(slot.start);
                        const endDate = new Date(slot.end);
                        const timeLabel = slotDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                        const endTimeLabel = endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                        const rankLabel = actualIdx === 1 ? "Good" : "Option";
                        const rankColor = actualIdx === 1 ? themeColor : colors.textSecondary;
                        return (
                          <Pressable
                            key={`best-${actualIdx}`}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                              if (__DEV__) devLog('[P1_PREFILL_EVENT]', { slotStart: slot.start, slotEnd: slot.end, circleId });
                              setShowBestTimeSheet(false);
                              setShowAllAvailability(false);
                              router.push({
                                pathname: "/create",
                                params: { date: slot.start, endDate: slot.end, circleId },
                              } as any);
                            }}
                            onLongPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedSlot(slot); }}
                            style={{
                              ...glass.card,
                              flexDirection: "row",
                              alignItems: "center",
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              marginBottom: 8,
                              borderRadius: 12,
                            }}
                          >
                            <View style={{ width: 48, marginRight: 10 }}>
                              <Text style={{ ...glass.label, color: rankColor, fontWeight: "700" }}>{rankLabel}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ ...glass.value }}>{timeLabel} {"\u2013"} {endTimeLabel}</Text>
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: "600", color: rankColor }}>
                              {formatSlotAvailabilityCompact(slot.availableCount, slot.totalMembers)}
                            </Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setShowMoreTimes(!showMoreTimes);
                        }}
                        style={{ paddingVertical: 6, alignItems: "center", marginBottom: 4 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "500", color: themeColor }}>
                          {showMoreTimes ? "Show less" : `Show ${Math.min(quietSlots.length - 1, 2)} more time${Math.min(quietSlots.length - 1, 2) === 1 ? "" : "s"}`}
                        </Text>
                      </Pressable>
                    </>
                  )}

                  {/* View all availability toggle */}
                  <Pressable
                    onPress={() => {
                      expandTapTsRef.current = Date.now();
                      firstRowTsRef.current = 0;
                      setShowAllAvailability(!showAllAvailability);
                    }}
                    style={{ paddingVertical: 10, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "500", color: themeColor }}>
                      {showAllAvailability ? "Hide details" : "View all availability"}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <Text style={{ ...glass.value, fontSize: 16, fontWeight: "600", marginBottom: 6 }}>No shared free times</Text>
                  <Text style={{ ...glass.label, fontSize: 13, marginBottom: 16 }}>Try another day.</Text>
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
              </>
              )}{/* close isSheetSettled ternary */}
              </View>{/* close Who's Free container */}
              </View>{/* close pan handler */}
              </>
              }
              ListFooterComponent={
              <View style={{ paddingHorizontal: 0 }}>
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
                        mode: "smart",
                      },
                    } as any);
                  }}
                  style={{
                    marginTop: 12,
                    paddingVertical: 14,
                    borderRadius: glass.card.borderRadius,
                    backgroundColor: "#5DCAA5",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff" }}>Create event at best time</Text>
                </Pressable>}

                {/* Privacy disclaimer */}
                <Text style={{ ...glass.label, fontSize: 12, lineHeight: 16, marginTop: 16, textAlign: "center" }}>
                  {"\u201CEveryone\u2019s free\u201D is based on availability shared in the app and may not always be exact. Times outside your suggested hours are hidden."}
                </Text>
                <Text style={{ ...glass.label, fontSize: 11, lineHeight: 15, marginTop: 6, textAlign: "center" }}>
                  Suggested hours can be changed in Best time to meet.
                </Text>
              </View>
              }
            />
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
                <Text style={{ ...glass.label, fontSize: 13, marginBottom: 12 }}>
                  {formatSlotAvailability(selectedSlot.availableCount, selectedSlot.totalMembers)}
                </Text>

                {/* Available section */}
                <View style={{ ...glass.card, padding: 12, marginBottom: 8 }}>
                  <Text style={{ ...glass.label, color: "#5DCAA5", fontWeight: "700", marginBottom: 8 }}>
                    Available ({selectedSlot.availableCount})
                  </Text>
                  {selectedSlot.availableUserIds.map((uid) => {
                    const m = members.find((mb) => mb.userId === uid);
                    return (
                      <View key={uid} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#5DCAA5", marginRight: 8 }} />
                        <Text style={{ ...glass.value, fontSize: 13 }}>{m?.user?.name ?? uid.slice(-6)}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Busy section */}
                {selectedSlot.unavailableUserIds.length > 0 && (
                  <View style={{ ...glass.card, padding: 12 }}>
                    <Text style={{ ...glass.label, fontWeight: "700", marginBottom: 8 }}>
                      Busy ({selectedSlot.unavailableUserIds.length})
                    </Text>
                    {selectedSlot.unavailableUserIds.map((uid) => {
                      const m = members.find((mb) => mb.userId === uid);
                      return (
                        <View key={uid} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textTertiary, marginRight: 8 }} />
                          <Text style={{ ...glass.label, fontSize: 13 }}>{m?.user?.name ?? uid.slice(-6)}</Text>
                        </View>
                      );
                    })}
                  </View>
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

    </View>
  );
}

export { MiniCalendar };
