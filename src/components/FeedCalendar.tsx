import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { EntityAvatar } from "@/components/EntityAvatar";
import { ChevronLeft, ChevronRight, Clock, MapPin, Calendar } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import DayAgendaSheet from "@/components/DayAgendaSheet";

import { type DARK_COLORS } from "@/lib/ThemeContext";
import { type Event } from "@/shared/contracts";
import { devLog } from "@/lib/devLog";
import { getEventPalette, assertGreyPaletteInvariant } from "@/lib/eventPalette";
import { useEventColorOverrides } from "@/hooks/useEventColorOverrides";
import { getEventDisplayFields } from "@/lib/eventVisibility";
import { EventPhotoEmoji } from "@/components/EventPhotoEmoji";
import { EventVisibilityBadge } from "@/components/EventVisibilityBadge";

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

interface EventWithMeta extends Event {
  isOwn?: boolean;
  isAttending?: boolean;
  hostName?: string | null;
  hostImage?: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  emoji: string;
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  description?: string | null;
  isOwn?: boolean;
  isAttending?: boolean;
  hostName?: string | null;
  hostImage?: string | null;
  isBusy?: boolean;
  isWork?: boolean;
  isBirthday?: boolean;
  color?: string | null;
  groupVisibility?: Array<{ groupId: string; group: { id: string; name: string; color: string } }> | null;
  eventPhotoUrl?: string | null;
  visibility?: string | null;
}

interface FeedCalendarProps {
  events: EventWithMeta[];
  themeColor: string;
  isDark: boolean;
  colors: typeof DARK_COLORS;
  userId?: string;
}

function EventListItem({
  event,
  themeColor,
  colors,
  isDark,
  onClose,
  colorOverride,
}: {
  event: CalendarEvent;
  themeColor: string;
  colors: typeof DARK_COLORS;
  isDark: boolean;
  onClose?: () => void;
  colorOverride?: string;
}) {
  const router = useRouter();
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  const palette = getEventPalette(event, themeColor, colorOverride);
  const eventColor = palette.bar;

  // P0 PRIVACY: Use centralized masking logic for busy/private events
  const { displayTitle, displayEmoji, displayDescription, displayLocation, isMasked: isNonVisible } = getEventDisplayFields({
    title: event.title,
    emoji: event.emoji,
    location: event.location,
    description: event.description,
    isBusy: event.isBusy,
    isWork: event.isWork,
    isOwn: event.isOwn,
  });

  // For non-visible events: hide host info
  const displayHostName = isNonVisible ? undefined : event.hostName;
  const displayHostImage = isNonVisible ? undefined : event.hostImage;

  const timeLabel = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const handlePress = () => {
    // P0: Disable navigation for non-visible (busy/private) events
    if (isNonVisible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return; // No navigation for busy/private events
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose?.();
    router.push(`/event/${event.id}` as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isNonVisible}
      className="rounded-2xl p-4 mb-3"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: event.isOwn ? `${themeColor}40` : colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.2 : 0.05,
        shadowRadius: 8,
        elevation: 2,
        opacity: isNonVisible ? 0.7 : 1,
      }}
    >
      <View className="flex-row items-start">
        <View
          className="w-14 h-14 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: isNonVisible ? (isDark ? "#3C3C3E" : "#E5E7EB") : event.isOwn ? `${themeColor}20` : (isDark ? "#2C2C2E" : "#FFF7ED"), overflow: 'hidden' }}
        >
          <EventPhotoEmoji
            photoUrl={!isNonVisible && !event.isBusy && event.visibility !== "private" ? event.eventPhotoUrl : undefined}
            emoji={displayEmoji}
            emojiClassName="text-2xl"
          />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-lg font-semibold flex-1" style={{ color: isNonVisible ? colors.textSecondary : colors.text }} numberOfLines={1}>
              {displayTitle}
            </Text>
            {event.isOwn && (
              <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: `${themeColor}20` }}>
                <Text className="text-xs font-medium" style={{ color: themeColor }}>You</Text>
              </View>
            )}
            <EventVisibilityBadge
              visibility={event.visibility}
              circleId={undefined}
              isBusy={event.isBusy}
              eventId={event.id}
              surface="feed_calendar"
              isDark={isDark}
            />
          </View>

          {/* Description - hidden for non-visible events */}
          {displayDescription && (
            <Text
              className="text-sm mt-0.5"
              style={{ color: colors.textSecondary }}
              numberOfLines={2}
            >
              {displayDescription}
            </Text>
          )}

          {/* Host info - hidden for non-visible events */}
          {!event.isOwn && displayHostName ? (
            <View className="flex-row items-center mt-1">
              <EntityAvatar
                photoUrl={displayHostImage}
                initials={displayHostName?.[0] ?? "?"}
                size={20}
                backgroundColor={isDark ? "#2C2C2E" : `${themeColor}20`}
                foregroundColor={themeColor}
                fallbackIcon="person"
                style={{ marginRight: 8 }}
              />
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                {displayHostName}
              </Text>
            </View>
          ) : event.isOwn ? (
            <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>Your event</Text>
          ) : isNonVisible ? (
            <Text className="text-sm mt-1" style={{ color: colors.textTertiary }}>Time blocked</Text>
          ) : null}
        </View>
        {!isNonVisible && <ChevronRight size={20} color={colors.textTertiary} />}
      </View>

      {/* Time and location row - location hidden for non-visible events */}
      <View className="flex-row mt-3 pt-3 flex-wrap" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
        <View className="flex-row items-center mr-4">
          <Clock size={14} color={isNonVisible ? colors.textTertiary : themeColor} />
          <Text className="ml-1 text-sm" style={{ color: colors.textSecondary }}>
            {timeLabel}
          </Text>
        </View>
        {displayLocation && (
          <View className="flex-row items-center flex-1">
            <MapPin size={14} color="#4ECDC4" />
            <Text className="ml-1 text-sm flex-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
              {displayLocation}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function FeedCalendar({ events, themeColor, isDark, colors, userId }: FeedCalendarProps) {
  const router = useRouter();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);

  // User's event color overrides
  const { colorOverrides } = useEventColorOverrides();

  // Combine all events - IMPORTANT: filter out any busy events (defensive)
  // Busy events are private and must never appear in social/feed contexts
  const allCalendarEvents: CalendarEvent[] = useMemo(() => {
    // Filter out any events marked as busy (defensive - should already be filtered by caller)
    return events
      .filter((e) => !(e as any).isBusy)
      .map((e) => ({
        ...e,
      }));
  }, [events]);

  // Get events for a specific date
  const getEventsForDate = useCallback((date: Date) => {
    return allCalendarEvents.filter((event) => {
      const eventDate = new Date(event.startTime);
      return eventDate.toDateString() === date.toDateString();
    });
  }, [allCalendarEvents]);

  // Get all dates with events in current month
  const datesWithEvents = useMemo(() => {
    const dates = new Set<number>();
    allCalendarEvents.forEach((event) => {
      const eventDate = new Date(event.startTime);
      if (eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear) {
        dates.add(eventDate.getDate());
      }
    });
    return dates;
  }, [allCalendarEvents, currentMonth, currentYear]);

  // Get event counts by date for showing dots
  const eventCountsByDate = useMemo(() => {
    const counts: Record<number, { count: number; colors: string[] }> = {};
    allCalendarEvents.forEach((event) => {
      const eventDate = new Date(event.startTime);
      if (eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear) {
        const day = eventDate.getDate();
        if (!counts[day]) {
          counts[day] = { count: 0, colors: [] };
        }
        counts[day].count++;
        const eventColor = getEventPalette(event, themeColor, colorOverrides[event.id]).bar;
        if (counts[day].colors.length < 3 && !counts[day].colors.includes(eventColor)) {
          counts[day].colors.push(eventColor);
        }
      }
    });
    return counts;
  }, [allCalendarEvents, currentMonth, currentYear, themeColor, colorOverrides]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfMonth = getFirstDayOfMonth(currentYear, currentMonth);

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  // Fill remaining cells
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
    <View className="mb-4">
      {/* Calendar Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <Calendar size={18} color={themeColor} />
          <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Pressable
            onPress={goToPrevMonth}
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronLeft size={18} color={themeColor} />
          </Pressable>
          <Pressable
            onPress={goToNextMonth}
            className="w-8 h-8 rounded-full items-center justify-center ml-2"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronRight size={18} color={themeColor} />
          </Pressable>
        </View>
      </View>

      {/* Calendar Grid */}
      <View
        className="rounded-2xl p-3"
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        {/* Day Labels */}
        <View className="flex-row mb-2">
          {DAYS.map((day, idx) => (
            <View key={idx} className="flex-1 items-center">
              <Text
                className="text-xs font-medium"
                style={{ color: idx === 0 || idx === 6 ? colors.textTertiary : colors.textSecondary }}
              >
                {day}
              </Text>
            </View>
          ))}
        </View>

        {/* Calendar Days */}
        <View>
          {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIndex) => (
            <View key={weekIndex} className="flex-row">
              {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
                const index = weekIndex * 7 + dayIndex;
                const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
                const hasEvents = day ? datesWithEvents.has(day) : false;
                const eventData = day ? eventCountsByDate[day] : null;
                const dayOfWeek = index % 7;
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                return (
                  <View key={index} style={{ width: "14.28%" }}>
                    {day === null ? (
                      <View style={{ height: 44 }} />
                    ) : (
                      <Pressable
                        onPress={() => handleDayPress(day)}
                        style={{ height: 44, alignItems: "center", justifyContent: "center" }}
                      >
                        <View
                          className="rounded-full items-center justify-center"
                          style={{
                            width: 32,
                            height: 32,
                            backgroundColor: isToday ? themeColor : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: isWeekend ? "400" : "600",
                              color: isToday ? "#fff" : isWeekend ? colors.textTertiary : colors.text,
                            }}
                          >
                            {day}
                          </Text>
                        </View>
                        {/* Event dots */}
                        {hasEvents && eventData && !isToday && (
                          <View className="flex-row items-center absolute bottom-0">
                            {eventData.colors.map((color, colorIdx) => (
                              <View
                                key={colorIdx}
                                style={{
                                  width: 4,
                                  height: 4,
                                  borderRadius: 2,
                                  marginHorizontal: 0.5,
                                  backgroundColor: color,
                                }}
                              />
                            ))}
                            {eventData.count > 3 && (
                              <Text style={{ fontSize: 7, color: colors.textTertiary, marginLeft: 1 }}>
                                +{eventData.count - 3}
                              </Text>
                            )}
                          </View>
                        )}
                        {/* Event indicator for today */}
                        {hasEvents && isToday && (
                          <View
                            className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: "#fff" }}
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

        {/* Legend */}
        <View className="flex-row items-center justify-center mt-2 pt-2" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
          <Text className="text-xs" style={{ color: colors.textTertiary }}>
            Tap a date to see events
          </Text>
        </View>
      </View>

      {/* Day Agenda – SSOT shared sheet */}
      <DayAgendaSheet
        visible={showDayModal}
        onClose={() => setShowDayModal(false)}
        selectedDate={selectedDate}
        eventCount={selectedDateEvents.length}
        themeColor={themeColor}
        emptyAction={
          selectedDate && selectedDate >= new Date(new Date().setHours(0, 0, 0, 0)) ? (
            <Pressable
              onPress={() => {
                setShowDayModal(false);
                router.push(`/create?date=${selectedDate?.toISOString()}`);
              }}
              className="flex-row items-center mt-4 px-5 py-3 rounded-full"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white font-semibold">Create Event</Text>
            </Pressable>
          ) : undefined
        }
      >
        {selectedDateEvents.map((event, idx) => (
          <Animated.View key={event.id} entering={FadeInDown.delay(idx * 50)}>
            <EventListItem
              event={event}
              themeColor={themeColor}
              colors={colors}
              isDark={isDark}
              onClose={() => setShowDayModal(false)}
              colorOverride={colorOverrides[event.id]}
            />
          </Animated.View>
        ))}
      </DayAgendaSheet>
    </View>
  );
}
