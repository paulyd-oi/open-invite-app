/**
 * CircleAvailabilitySection — Availability types, helpers, and components
 * extracted from circle/[id].tsx to reduce mount cost and file size.
 *
 * Includes:
 *  - DayDetailEventsSection (day detail sheet event list)
 *  - Availability types (SlotDetailItem, RangeItem, etc.)
 *  - Helpers: freeLabel, isoToTimeLabel, mergeContiguousSlots
 *  - RangeRow (memoized row for merged time ranges)
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { devLog } from "@/lib/devLog";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { MapPin, Lock } from "@/ui/icons";
import { shouldMaskEvent } from "@/lib/eventVisibility";
import { EventVisibilityBadge } from "@/components/EventVisibilityBadge";
import type { Circle } from "@/shared/contracts";

// Event type used in DayDetailEventsSection
type DayDetailEvent = {
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
};

/**
 * DayDetailEventsSection – Section 1 of the unified Day Detail sheet.
 * Renders open events (visible + busy summary) for the selected day.
 * Extracted from the old DayAgendaSheet children IIFE with zero logic changes.
 */
function DayDetailEventsSection({
  events,
  themeColor,
  colors,
  isDark,
  circleId,
  currentUserId,
  members,
  onClose,
  router,
  bestTimesDate,
}: {
  events: DayDetailEvent[];
  themeColor: string;
  colors: any;
  isDark: boolean;
  circleId: string;
  currentUserId: string | null;
  members: Circle["members"];
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
  bestTimesDate: Date;
}) {
  // Split events into masked-busy vs visible buckets
  const maskedBusyEvents: DayDetailEvent[] = [];
  const visibleEvents: DayDetailEvent[] = [];
  for (const event of events) {
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

  // Group masked-busy events per person
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
  for (const group of busyGroupMap.values()) {
    group.ranges.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }
  const busyGroups = Array.from(busyGroupMap.values());

  // Time formatting helper
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // All-day detection
  const isAllDay = (start: string, end: string | null): boolean => {
    if (!end) return false;
    const s = new Date(start);
    const e = new Date(end);
    if (e.getTime() - s.getTime() >= 23.5 * 60 * 60 * 1000) return true;
    const dayStart = new Date(bestTimesDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(bestTimesDate);
    dayEnd.setHours(23, 59, 59, 999);
    const EPSILON = 30 * 60 * 1000;
    if (s.getTime() <= dayStart.getTime() + EPSILON && e.getTime() >= dayEnd.getTime() - EPSILON) return true;
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

  if (events.length === 0) {
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.5, color: colors.textTertiary, textTransform: "uppercase", marginBottom: 8 }}>
          OPEN EVENTS
        </Text>
        <View style={{ alignItems: "center", paddingVertical: 16, borderRadius: 12, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" }}>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8 }}>No events on this day</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onClose();
              router.push({ pathname: "/create", params: { date: bestTimesDate.toISOString(), circleId } } as any);
            }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderRadius: 10,
              backgroundColor: themeColor,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff" }}>Create Event</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.5, color: colors.textTertiary, textTransform: "uppercase", marginBottom: 8 }}>
        OPEN EVENTS
      </Text>
      {/* Busy summary rows */}
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

      {/* Visible event rows */}
      {visibleEvents.map((event, index) => (
        <Pressable
          key={event.id}
          onPress={() => {
            if (__DEV__) {
              devLog('[P0_VISIBILITY] Circle mini calendar tap navigating:', {
                sourceSurface: 'circle-day-detail',
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
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onClose();
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
              <EventVisibilityBadge
                visibility="circle_only"
                circleId={circleId}
                isBusy={event.isBusy}
                eventId={event.id}
                surface="circle_day_detail"
                isDark={isDark}
              />
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                {event.endTime
                  ? `${fmtTime(event.startTime)} \u2013 ${fmtTime(event.endTime)}`
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
    </View>
  );
}

/**
 * Slot detail item — internal representation of a single scheduling slot.
 * Used for building merged time ranges.
 */
type SlotDetailItem = {
  slotStartISO: string;
  slotEndISO: string;
  freeCount: number;
  totalMembers: number;
};

/** Merged contiguous time range for the expanded availability list */
type RangeItem = {
  kind: "range";
  key: string;
  rangeStartISO: string;
  rangeEndISO: string;
  rangeLabel: string;
  freeCount: number;
  totalMembers: number;
  representativeSlotStartISO: string;
  section: "everyone" | "almost" | "limited";
};

/** Section header items injected into the FlatList data array */
type SectionHeaderItem = {
  kind: "section-header";
  key: string;
  title: string;
};

/** Toggle row for showing/hiding limited times */
type LimitedToggleItem = {
  kind: "limited-toggle";
  key: string;
  showing: boolean;
  count: number;
};

type AvailListItem = RangeItem | SectionHeaderItem | LimitedToggleItem;

/** Human-readable availability label: "Everyone free", "2 of 3 free", etc. */
function freeLabel(freeCount: number, totalMembers: number): string {
  if (freeCount === totalMembers) return "Everyone free";
  return `${freeCount} of ${totalMembers} free`;
}

/** Format ISO time to local display (e.g. "5:30 PM") */
function isoToTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Merge contiguous slots with the same freeCount into time ranges.
 * Uses numeric timestamp comparison with 1-second tolerance instead of
 * strict ISO string equality (which fails on format differences like
 * trailing milliseconds or Z vs +00:00).
 * Handles overlapping slots by extending the range end.
 * Input is sorted ascending by slotStartISO before merging.
 */
function mergeContiguousSlots(
  items: SlotDetailItem[],
  section: "everyone" | "almost" | "limited",
): RangeItem[] {
  if (items.length === 0) return [];
  // Sort by numeric start time (defensive — should already be sorted)
  const sorted = [...items].sort(
    (a, b) => new Date(a.slotStartISO).getTime() - new Date(b.slotStartISO).getTime(),
  );
  const ranges: RangeItem[] = [];
  let rangeStart = sorted[0].slotStartISO;
  let rangeEndMs = new Date(sorted[0].slotEndISO).getTime();
  let rangeEnd = sorted[0].slotEndISO;
  let fc = sorted[0].freeCount;
  let tm = sorted[0].totalMembers;
  let slotCount = 1;

  const flush = () => {
    const startLabel = isoToTimeLabel(rangeStart);
    const rangeLabel = slotCount === 1
      ? startLabel
      : `${startLabel} \u2013 ${isoToTimeLabel(rangeEnd)}`;
    ranges.push({
      kind: "range",
      key: `${section}:${rangeStart}:${rangeEnd}`,
      rangeStartISO: rangeStart,
      rangeEndISO: rangeEnd,
      rangeLabel,
      freeCount: fc,
      totalMembers: tm,
      representativeSlotStartISO: rangeStart,
      section,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const curStartMs = new Date(cur.slotStartISO).getTime();
    const curEndMs = new Date(cur.slotEndISO).getTime();
    // Contiguous (within 1s tolerance) or overlapping, same availability
    const isContiguous = Math.abs(rangeEndMs - curStartMs) < 1000;
    const isOverlap = curStartMs <= rangeEndMs;
    if ((isContiguous || isOverlap) && cur.freeCount === fc && cur.totalMembers === tm) {
      // Extend range end to the later of the two
      const newEndMs = Math.max(rangeEndMs, curEndMs);
      if (newEndMs > rangeEndMs) {
        rangeEndMs = newEndMs;
        rangeEnd = cur.slotEndISO;
      }
      slotCount++;
    } else {
      flush();
      rangeStart = cur.slotStartISO;
      rangeEnd = cur.slotEndISO;
      rangeEndMs = curEndMs;
      fc = cur.freeCount;
      tm = cur.totalMembers;
      slotCount = 1;
    }
  }
  flush();
  return ranges;
}

/** RangeRow — cheap memoized row for merged time ranges. No dot cluster, no member names. */
const RangeRow = React.memo(function RangeRow({
  item,
  textColor,
  onPress,
}: {
  item: RangeItem;
  textColor: string;
  onPress: () => void;
}) {
  const isEveryone = item.freeCount === item.totalMembers;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 4,
        borderRadius: 10,
      }}
    >
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: textColor }}>
        {item.rangeLabel}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: "600", color: isEveryone ? "#10B981" : textColor }}>
        {freeLabel(item.freeCount, item.totalMembers)}
      </Text>
    </Pressable>
  );
});

export { DayDetailEventsSection, RangeRow, mergeContiguousSlots, freeLabel, isoToTimeLabel };
export type { DayDetailEvent, SlotDetailItem, RangeItem, SectionHeaderItem, LimitedToggleItem, AvailListItem };
