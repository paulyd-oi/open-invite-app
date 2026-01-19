import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, Modal, ScrollView, Image } from "react-native";
import { ChevronLeft, ChevronRight, X, Clock, MapPin, Calendar, Building2 } from "@/ui/icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { type DARK_COLORS } from "@/lib/ThemeContext";
import { type Event, type BusinessEvent } from "@/shared/contracts";

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

// Get event color - use first group color or default theme color
function getEventColor(event: Event | CalendarEvent, defaultColor: string): string {
  if ('groupVisibility' in event && event.groupVisibility && event.groupVisibility.length > 0) {
    return event.groupVisibility[0].group.color;
  }
  if ('isBusinessEvent' in event && event.isBusinessEvent) {
    return "#8B5CF6"; // Purple for business events
  }
  return defaultColor;
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
  isBusinessEvent?: boolean;
  businessId?: string;
  businessName?: string;
  businessLogo?: string | null;
  groupVisibility?: Array<{ groupId: string; group: { id: string; name: string; color: string } }>;
}

interface FeedCalendarProps {
  events: EventWithMeta[];
  businessEvents?: BusinessEvent[];
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
}: {
  event: CalendarEvent;
  themeColor: string;
  colors: typeof DARK_COLORS;
  isDark: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  const eventColor = event.isBusinessEvent ? "#8B5CF6" : getEventColor(event, themeColor);

  const timeLabel = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose?.();
    router.push(`/event/${event.id}` as any);
  };

  return (
    <Pressable
      onPress={handlePress}
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
      }}
    >
      <View className="flex-row items-start">
        <View
          className="w-14 h-14 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: event.isOwn ? `${themeColor}20` : (isDark ? "#2C2C2E" : "#FFF7ED") }}
        >
          <Text className="text-2xl">{event.emoji}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-lg font-semibold flex-1" style={{ color: colors.text }} numberOfLines={1}>
              {event.title}
            </Text>
            {event.isOwn && (
              <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: `${themeColor}20` }}>
                <Text className="text-xs font-medium" style={{ color: themeColor }}>You</Text>
              </View>
            )}
            {event.isBusinessEvent && (
              <View className="px-2 py-0.5 rounded-full ml-2 flex-row items-center" style={{ backgroundColor: "#8B5CF620" }}>
                <Building2 size={10} color="#8B5CF6" />
                <Text className="text-xs font-medium ml-1" style={{ color: "#8B5CF6" }}>Business</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {event.description && (
            <Text
              className="text-sm mt-0.5"
              style={{ color: colors.textSecondary }}
              numberOfLines={2}
            >
              {event.description}
            </Text>
          )}

          {/* Host info */}
          {event.isBusinessEvent && event.businessName ? (
            <View className="flex-row items-center mt-1">
              <View className="w-5 h-5 rounded-full overflow-hidden mr-2" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                {event.businessLogo ? (
                  <Image source={{ uri: event.businessLogo }} className="w-full h-full" />
                ) : (
                  <View className="w-full h-full items-center justify-center" style={{ backgroundColor: "#8B5CF620" }}>
                    <Building2 size={10} color="#8B5CF6" />
                  </View>
                )}
              </View>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                {event.businessName}
              </Text>
            </View>
          ) : !event.isOwn && event.hostName ? (
            <View className="flex-row items-center mt-1">
              <View className="w-5 h-5 rounded-full overflow-hidden mr-2" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                {event.hostImage ? (
                  <Image source={{ uri: event.hostImage }} className="w-full h-full" />
                ) : (
                  <View className="w-full h-full items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                    <Text style={{ color: themeColor, fontSize: 10, fontWeight: "500" }}>
                      {event.hostName?.[0] ?? "?"}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                {event.hostName}
              </Text>
            </View>
          ) : event.isOwn ? (
            <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>Your event</Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={colors.textTertiary} />
      </View>

      {/* Time and location row */}
      <View className="flex-row mt-3 pt-3 flex-wrap" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
        <View className="flex-row items-center mr-4">
          <Clock size={14} color={themeColor} />
          <Text className="ml-1 text-sm" style={{ color: colors.textSecondary }}>
            {timeLabel}
          </Text>
        </View>
        {event.location && (
          <View className="flex-row items-center flex-1">
            <MapPin size={14} color="#4ECDC4" />
            <Text className="ml-1 text-sm flex-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function FeedCalendar({ events, businessEvents = [], themeColor, isDark, colors, userId }: FeedCalendarProps) {
  const router = useRouter();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);
  // Business events hidden for launch - will be enabled in future update
  const [showBusinessEvents, setShowBusinessEvents] = useState(false);

  // Convert business events to calendar events format (hidden for now)
  const convertedBusinessEvents: CalendarEvent[] = useMemo(() => {
    if (!showBusinessEvents) return [];
    return businessEvents.map((be) => ({
      id: be.id,
      title: be.title,
      emoji: be.emoji,
      startTime: be.startTime,
      endTime: be.endTime,
      location: be.location,
      description: be.description,
      isBusinessEvent: true,
      businessId: be.businessId,
      businessName: be.business?.name,
      businessLogo: be.business?.logoUrl,
    }));
  }, [businessEvents, showBusinessEvents]);

  // Combine all events
  const allCalendarEvents: CalendarEvent[] = useMemo(() => {
    const friendEvents: CalendarEvent[] = events.map((e) => ({
      ...e,
      isBusinessEvent: false,
    }));

    if (showBusinessEvents) {
      return [...friendEvents, ...convertedBusinessEvents];
    }
    return friendEvents;
  }, [events, convertedBusinessEvents, showBusinessEvents]);

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
    const counts: Record<number, { count: number; colors: string[]; hasBusinessEvent: boolean }> = {};
    allCalendarEvents.forEach((event) => {
      const eventDate = new Date(event.startTime);
      if (eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear) {
        const day = eventDate.getDate();
        if (!counts[day]) {
          counts[day] = { count: 0, colors: [], hasBusinessEvent: false };
        }
        counts[day].count++;
        if (event.isBusinessEvent) {
          counts[day].hasBusinessEvent = true;
        }
        const eventColor = event.isBusinessEvent ? "#8B5CF6" : getEventColor(event, themeColor);
        if (counts[day].colors.length < 3 && !counts[day].colors.includes(eventColor)) {
          counts[day].colors.push(eventColor);
        }
      }
    });
    return counts;
  }, [allCalendarEvents, currentMonth, currentYear, themeColor]);

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

  const toggleBusinessEvents = () => {
    Haptics.selectionAsync();
    setShowBusinessEvents(!showBusinessEvents);
  };

  const selectedDateEvents = selectedDate
    ? getEventsForDate(selectedDate).sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
    : [];

  const businessEventCount = convertedBusinessEvents.length;

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

      {/* Business Events Toggle - Hidden for launch, will be enabled in future update */}
      {/* {businessEventCount > 0 && (
        <Pressable
          onPress={toggleBusinessEvents}
          className="flex-row items-center justify-between mb-3 px-3 py-2 rounded-xl"
          style={{ backgroundColor: showBusinessEvents ? "#8B5CF615" : colors.surface, borderWidth: 1, borderColor: showBusinessEvents ? "#8B5CF640" : colors.border }}
        >
          <View className="flex-row items-center">
            <Building2 size={16} color={showBusinessEvents ? "#8B5CF6" : colors.textTertiary} />
            <Text className="ml-2 font-medium" style={{ color: showBusinessEvents ? "#8B5CF6" : colors.textSecondary }}>
              Business Events
            </Text>
            <View className="ml-2 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: showBusinessEvents ? "#8B5CF630" : colors.surfaceElevated }}>
              <Text className="text-xs font-medium" style={{ color: showBusinessEvents ? "#8B5CF6" : colors.textTertiary }}>
                {businessEventCount}
              </Text>
            </View>
          </View>
          <View
            className="w-10 h-6 rounded-full justify-center px-0.5"
            style={{ backgroundColor: showBusinessEvents ? "#8B5CF6" : isDark ? "#3A3A3C" : "#E5E7EB" }}
          >
            <Animated.View
              className="w-5 h-5 rounded-full"
              style={{
                backgroundColor: "#fff",
                alignSelf: showBusinessEvents ? "flex-end" : "flex-start",
              }}
            />
          </View>
        </Pressable>
      )} */}

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

      {/* Day Events Modal */}
      <Modal
        visible={showDayModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDayModal(false)}
      >
        <Pressable
          className="flex-1 justify-center px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowDayModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Animated.View
              entering={FadeIn.duration(200)}
              style={{
                backgroundColor: colors.background,
                borderRadius: 24,
                maxHeight: "80%",
                overflow: "hidden",
              }}
            >
              {/* Modal Handle */}
              <View className="items-center pt-3 pb-2">
                <View
                  className="w-10 h-1 rounded-full"
                  style={{ backgroundColor: colors.textTertiary, opacity: 0.5 }}
                />
              </View>

              {/* Modal Header */}
              <View
                className="flex-row items-center justify-between px-5 pb-4"
                style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
              >
                <View>
                  <Text className="text-xl font-bold" style={{ color: colors.text }}>
                    {selectedDate?.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                  <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                    {selectedDateEvents.length} event{selectedDateEvents.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowDayModal(false)}
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.surfaceElevated }}
                >
                  <X size={18} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Events List */}
              <ScrollView
                className="px-5 pt-4"
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
              >
                {selectedDateEvents.length === 0 ? (
                  <View className="items-center py-8">
                    <Text className="text-4xl mb-3">📅</Text>
                    <Text className="text-base" style={{ color: colors.textSecondary }}>No events on this day</Text>
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
                  </View>
                ) : (
                  selectedDateEvents.map((event, idx) => (
                    <Animated.View key={event.id} entering={FadeInDown.delay(idx * 50)}>
                      <EventListItem
                        event={event}
                        themeColor={themeColor}
                        colors={colors}
                        isDark={isDark}
                        onClose={() => setShowDayModal(false)}
                      />
                    </Animated.View>
                  ))
                )}
              </ScrollView>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
