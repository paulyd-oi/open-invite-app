import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Calendar,
  Users,
  Plus,
  Settings,
  ChevronRight,
  ChevronLeft,
  Clock,
  MapPin,
  TrendingUp,
  Eye,
  BadgeCheck,
  Bell,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import type { Profile, BusinessEvent, BUSINESS_CATEGORIES } from "@/shared/contracts";

interface BusinessProfileDashboardProps {
  profile: Profile;
}

export function BusinessProfileDashboard({ profile }: BusinessProfileDashboardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Fetch business details
  const { data: businessData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["business", profile.id],
    queryFn: () => api.get<{ business: any; upcomingEvents: BusinessEvent[] }>(`/api/businesses/${profile.id}`),
    enabled: !!profile.id,
  });

  // Fetch business events
  const { data: eventsData } = useQuery({
    queryKey: ["businessEvents", profile.id, activeTab],
    queryFn: () => api.get<{ events: BusinessEvent[] }>(`/api/businesses/${profile.id}/events?upcoming=${activeTab === "upcoming"}`),
    enabled: !!profile.id,
  });

  const business = businessData?.business;
  const events = eventsData?.events ?? businessData?.upcomingEvents ?? [];

  // Calendar helper functions
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const isToday = (date: Date) => isSameDay(date, new Date());

  // Fetch all events for calendar (both upcoming and past)
  const { data: allEventsData } = useQuery({
    queryKey: ["businessEvents", profile.id, "all"],
    queryFn: () => api.get<{ events: BusinessEvent[] }>(`/api/businesses/${profile.id}/events`),
    enabled: !!profile.id,
  });

  // Build a map of dates with events
  const eventsByDate = useMemo(() => {
    const map = new Map<string, BusinessEvent[]>();
    const allEvents = allEventsData?.events ?? businessData?.upcomingEvents ?? [];

    allEvents.forEach((event) => {
      const dateKey = new Date(event.startTime).toISOString().split("T")[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });

    return map;
  }, [allEventsData, businessData]);

  // Get events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = selectedDate.toISOString().split("T")[0];
    return eventsByDate.get(dateKey) ?? [];
  }, [selectedDate, eventsByDate]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    // Add previous month's trailing days
    const prevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    const prevMonthDays = getDaysInMonth(prevMonth);
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), prevMonthDays - i),
        isCurrentMonth: false,
      });
    }

    // Add current month's days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i),
        isCurrentMonth: true,
      });
    }

    // Add next month's leading days to fill the grid
    const remainingDays = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentMonth]);

  const goToPreviousMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text style={{ color: colors.textTertiary }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={themeColor} />
      }
    >
      {/* Business Header Card */}
      <Animated.View
        entering={FadeInDown.springify()}
        className="mx-4 mt-4 rounded-2xl overflow-hidden"
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        {/* Cover Image */}
        {business?.coverUrl ? (
          <Image source={{ uri: business.coverUrl }} className="w-full h-24" resizeMode="cover" />
        ) : (
          <View className="w-full h-20" style={{ backgroundColor: themeColor + "20" }} />
        )}

        {/* Business Info */}
        <View className="p-4 -mt-8">
          <View className="flex-row items-end">
            {/* Logo */}
            <View
              className="w-16 h-16 rounded-xl overflow-hidden"
              style={{ backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.surface }}
            >
              {business?.logoUrl ? (
                <Image source={{ uri: business.logoUrl }} className="w-full h-full" />
              ) : (
                <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor + "20" }}>
                  <Building2 size={28} color={themeColor} />
                </View>
              )}
            </View>

            {/* Name & Handle */}
            <View className="flex-1 ml-3 mb-1">
              <View className="flex-row items-center">
                <Text className="text-lg font-bold" style={{ color: colors.text }}>
                  {business?.name ?? profile.name}
                </Text>
                {business?.isVerified && (
                  <BadgeCheck size={18} color={themeColor} style={{ marginLeft: 4 }} />
                )}
              </View>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                @{business?.handle ?? profile.handle}
              </Text>
            </View>

            {/* Settings Button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/business/${profile.id}/settings` as any);
              }}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Settings size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Description */}
          {business?.description && (
            <Text className="mt-3 text-sm" style={{ color: colors.text, lineHeight: 20 }} numberOfLines={2}>
              {business.description}
            </Text>
          )}

          {/* Stats Row */}
          <View className="flex-row mt-4 pt-4 border-t" style={{ borderColor: colors.border }}>
            <View className="flex-1 items-center">
              <Text className="text-xl font-bold" style={{ color: colors.text }}>
                {business?.followerCount ?? 0}
              </Text>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>Followers</Text>
            </View>
            <View className="w-px" style={{ backgroundColor: colors.border }} />
            <View className="flex-1 items-center">
              <Text className="text-xl font-bold" style={{ color: colors.text }}>
                {business?.eventCount ?? 0}
              </Text>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>Events</Text>
            </View>
            <View className="w-px" style={{ backgroundColor: colors.border }} />
            <View className="flex-1 items-center">
              <Text className="text-xl font-bold" style={{ color: colors.text }}>
                {business?.totalAttendees ?? 0}
              </Text>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>Total RSVPs</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Quick Actions */}
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        className="mx-4 mt-4"
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push(`/business/${profile.id}/create-event` as any);
          }}
          className="rounded-xl py-4 flex-row items-center justify-center"
          style={{ backgroundColor: themeColor }}
        >
          <Plus size={20} color="#fff" />
          <Text className="ml-2 font-semibold text-white">Create Event</Text>
        </Pressable>

        <View className="flex-row mt-3 gap-3">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/business/${profile.id}/team` as any);
            }}
            className="flex-1 rounded-xl p-4 flex-row items-center"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Users size={20} color={themeColor} />
            <Text className="ml-2 font-medium" style={{ color: colors.text }}>Team</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/business/${profile.id}` as any);
            }}
            className="flex-1 rounded-xl p-4 flex-row items-center"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Eye size={20} color={themeColor} />
            <Text className="ml-2 font-medium" style={{ color: colors.text }}>View Page</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Calendar Section */}
      <Animated.View
        entering={FadeInDown.delay(75).springify()}
        className="mx-4 mt-6"
      >
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-lg font-semibold" style={{ color: colors.text }}>
            Event Calendar
          </Text>
          <View className="flex-row items-center">
            <Pressable
              onPress={goToPreviousMonth}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <ChevronLeft size={18} color={colors.text} />
            </Pressable>
            <Text className="mx-3 font-medium" style={{ color: colors.text }}>
              {currentMonth.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </Text>
            <Pressable
              onPress={goToNextMonth}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <ChevronRight size={18} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <View
          className="rounded-xl p-3"
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          {/* Day headers */}
          <View className="flex-row mb-2">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
              <View key={idx} className="flex-1 items-center">
                <Text className="text-xs font-medium" style={{ color: colors.textTertiary }}>
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          <View className="flex-row flex-wrap">
            {calendarDays.slice(0, 35).map((item, idx) => {
              const dateKey = item.date.toISOString().split("T")[0];
              const hasEvents = eventsByDate.has(dateKey);
              const isSelected = selectedDate && isSameDay(item.date, selectedDate);
              const isTodayDate = isToday(item.date);

              return (
                <Pressable
                  key={idx}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedDate(item.date);
                  }}
                  className="items-center justify-center"
                  style={{
                    width: "14.28%",
                    aspectRatio: 1,
                  }}
                >
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: isSelected
                        ? themeColor
                        : isTodayDate
                        ? themeColor + "20"
                        : "transparent",
                    }}
                  >
                    <Text
                      className="text-sm"
                      style={{
                        color: isSelected
                          ? "#fff"
                          : !item.isCurrentMonth
                          ? colors.textTertiary
                          : colors.text,
                        fontWeight: isTodayDate || hasEvents ? "600" : "400",
                      }}
                    >
                      {item.date.getDate()}
                    </Text>
                  </View>
                  {/* Event dot indicator */}
                  {hasEvents && !isSelected && (
                    <View
                      className="w-1.5 h-1.5 rounded-full absolute bottom-1"
                      style={{ backgroundColor: themeColor }}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Selected date events */}
        {selectedDate && (
          <View className="mt-3">
            <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            {selectedDateEvents.length === 0 ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/business/${profile.id}/create-event` as any);
                }}
                className="py-3 px-4 rounded-xl flex-row items-center justify-center"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6", borderWidth: 1, borderStyle: "dashed", borderColor: colors.border }}
              >
                <Plus size={16} color={themeColor} />
                <Text className="ml-2 text-sm" style={{ color: themeColor }}>
                  Create event for this day
                </Text>
              </Pressable>
            ) : (
              selectedDateEvents.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/business-event/${event.id}` as any);
                  }}
                  className="py-2 px-3 rounded-lg mb-2 flex-row items-center"
                  style={{ backgroundColor: themeColor + "15" }}
                >
                  <Text className="text-lg mr-2">{event.emoji}</Text>
                  <View className="flex-1">
                    <Text className="font-medium text-sm" style={{ color: colors.text }}>
                      {event.title}
                    </Text>
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      {new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {event.endTime && ` – ${new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textTertiary} />
                </Pressable>
              ))
            )}
          </View>
        )}
      </Animated.View>

      {/* Events Section */}
      <Animated.View
        entering={FadeInDown.delay(100).springify()}
        className="mx-4 mt-6"
      >
        <Text className="text-lg font-semibold mb-3" style={{ color: colors.text }}>
          Your Events
        </Text>

        {/* Tabs */}
        <View className="flex-row rounded-xl p-1 mb-4" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab("upcoming");
            }}
            className="flex-1 py-2.5 rounded-lg"
            style={{ backgroundColor: activeTab === "upcoming" ? colors.surface : "transparent" }}
          >
            <Text
              className="text-center font-medium"
              style={{ color: activeTab === "upcoming" ? themeColor : colors.textSecondary }}
            >
              Upcoming
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab("past");
            }}
            className="flex-1 py-2.5 rounded-lg"
            style={{ backgroundColor: activeTab === "past" ? colors.surface : "transparent" }}
          >
            <Text
              className="text-center font-medium"
              style={{ color: activeTab === "past" ? themeColor : colors.textSecondary }}
            >
              Past
            </Text>
          </Pressable>
        </View>

        {/* Events List */}
        {events.length === 0 ? (
          <View
            className="py-12 items-center rounded-xl"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Calendar size={40} color={colors.textTertiary} />
            <Text className="mt-4 font-semibold" style={{ color: colors.text }}>
              No {activeTab} events
            </Text>
            <Text className="mt-2 text-center px-8" style={{ color: colors.textSecondary }}>
              {activeTab === "upcoming"
                ? "Create your first event to start engaging with your followers"
                : "Your past events will appear here"}
            </Text>
            {activeTab === "upcoming" && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push(`/business/${profile.id}/create-event` as any);
                }}
                className="mt-4 px-6 py-3 rounded-full"
                style={{ backgroundColor: themeColor }}
              >
                <Text className="text-white font-semibold">Create Event</Text>
              </Pressable>
            )}
          </View>
        ) : (
          events.map((event, index) => (
            <Animated.View
              key={event.id}
              entering={FadeInDown.delay(150 + index * 50).springify()}
              className="mb-3"
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/business-event/${event.id}` as any);
                }}
                className="rounded-xl p-4"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <View className="flex-row items-start">
                  {/* Date Badge */}
                  <View
                    className="w-14 h-14 rounded-xl items-center justify-center mr-3"
                    style={{ backgroundColor: themeColor + "15" }}
                  >
                    <Text className="text-xs font-medium" style={{ color: themeColor }}>
                      {new Date(event.startTime).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                    </Text>
                    <Text className="text-xl font-bold" style={{ color: themeColor }}>
                      {new Date(event.startTime).getDate()}
                    </Text>
                  </View>

                  <View className="flex-1">
                    <View className="flex-row items-center mb-1">
                      <Text className="text-xl mr-2">{event.emoji}</Text>
                      <Text className="flex-1 font-semibold" style={{ color: colors.text }}>
                        {event.title}
                      </Text>
                    </View>

                    <View className="flex-row items-center mt-1">
                      <Clock size={12} color={colors.textSecondary} />
                      <Text className="ml-1 text-sm" style={{ color: colors.textSecondary }}>
                        {new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        {event.endTime && ` – ${new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                      </Text>
                    </View>

                    {event.location && (
                      <View className="flex-row items-center mt-1">
                        <MapPin size={12} color={colors.textTertiary} />
                        <Text className="ml-1 text-sm" style={{ color: colors.textTertiary }} numberOfLines={1}>
                          {event.location}
                        </Text>
                      </View>
                    )}

                    {/* Attendee Stats */}
                    <View className="flex-row items-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
                      <Users size={14} color={colors.textSecondary} />
                      <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>
                        {event.attendeeCount ?? 0} attending
                      </Text>
                      {(event.interestedCount ?? 0) > 0 && (
                        <>
                          <Text className="mx-2" style={{ color: colors.textTertiary }}>•</Text>
                          <Text className="text-sm" style={{ color: colors.textTertiary }}>
                            {event.interestedCount} interested
                          </Text>
                        </>
                      )}
                    </View>
                  </View>

                  <ChevronRight size={20} color={colors.textTertiary} />
                </View>
              </Pressable>
            </Animated.View>
          ))
        )}
      </Animated.View>

      {/* Tips Section for new businesses */}
      {(business?.eventCount ?? 0) < 3 && (
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          className="mx-4 mt-6 rounded-xl p-4"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED", borderWidth: 1, borderColor: isDark ? "#3C3C3E" : "#FED7AA" }}
        >
          <View className="flex-row items-center mb-2">
            <TrendingUp size={18} color="#F59E0B" />
            <Text className="ml-2 font-semibold" style={{ color: colors.text }}>
              Tips to grow your audience
            </Text>
          </View>
          <Text className="text-sm" style={{ color: colors.textSecondary, lineHeight: 20 }}>
            • Create regular events to keep followers engaged{"\n"}
            • Add cover photos to make events more appealing{"\n"}
            • Share your business page to attract new followers
          </Text>
        </Animated.View>
      )}
    </ScrollView>
  );
}
