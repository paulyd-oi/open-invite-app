import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

import { Plus } from "@/ui/icons";
import { DARK_COLORS } from "@/lib/ThemeContext";
import { type Event } from "@/shared/contracts";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import { EventListItem } from "@/components/calendar/CalendarEventListItem";

// List View - Full month list with sections
export function ListView({
  events,
  currentMonth,
  currentYear,
  themeColor,
  colors,
  isDark,
  userId,
  onColorChange,
  onDelete,
  onToggleBusy,
  onEditWorkTime,
  onDeleteWorkShift,
  session,
  colorOverrides = {},
}: {
  events: Array<Event & { isAttending?: boolean; isBirthday?: boolean }>;
  currentMonth: number;
  currentYear: number;
  themeColor: string;
  colors: typeof DARK_COLORS;
  isDark: boolean;
  userId?: string;
  onColorChange?: (eventId: string, color: string) => void;
  onDelete?: (eventId: string) => void;
  onToggleBusy?: (eventId: string, isBusy: boolean) => void;
  onEditWorkTime?: (eventId: string) => void;
  onDeleteWorkShift?: (eventId: string) => void;
  session: any;
  colorOverrides?: Record<string, string>;
}) {
  const router = useRouter();

  // Group events by date
  const eventsByDate = useMemo(() => {
    const groups: { [key: string]: Array<Event & { isAttending?: boolean; isBirthday?: boolean }> } = {};

    events
      .filter((e) => {
        const d = new Date((e as any).effectiveStartTime ?? e.startTime);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .sort((a, b) => new Date((a as any).effectiveStartTime ?? a.startTime).getTime() - new Date((b as any).effectiveStartTime ?? b.startTime).getTime())
      .forEach((event) => {
        const dateKey = new Date((event as any).effectiveStartTime ?? event.startTime).toDateString();
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(event);
      });

    return Object.entries(groups).map(([dateKey, dateEvents]) => ({
      date: new Date(dateKey),
      events: dateEvents,
    }));
  }, [events, currentMonth, currentYear]);

  if (eventsByDate.length === 0) {
    return (
      <View className="px-5 py-10 items-center">
        <Text className="text-4xl mb-3">📅</Text>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text className="font-medium mb-1" style={{ color: colors.text }}>Nothing this month</Text>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text className="text-sm mb-4" style={{ color: colors.textSecondary }}>Try a different month or create something</Text>
        <Pressable
          testID="create-event-button"
          /* INVARIANT_ALLOW_INLINE_HANDLER */
          onPress={() => {
            if (!guardEmailVerification(session)) return;
            router.push("/create");
          }}
          className="flex-row items-center px-4 py-2 rounded-full"
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{ backgroundColor: themeColor }}
        >
          <Plus size={16} color="#fff" />
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="font-semibold ml-1" style={{ color: "#fff" }}>
            Create Event
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="px-5">
      {/* INVARIANT_ALLOW_SMALL_MAP */}
      {eventsByDate.map(({ date, events: dateEvents }, idx) => (
        <Animated.View key={date.toISOString()} entering={FadeInDown.delay(idx * 50)}>
          <View className="flex-row items-center mb-3 mt-5">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ backgroundColor: `${themeColor}15` }}
            >
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-xs font-bold" style={{ color: themeColor }}>
                {date.getDate()}
              </Text>
            </View>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="font-semibold" style={{ color: colors.text }}>
              {date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </Text>
          </View>
          {/* INVARIANT_ALLOW_SMALL_MAP */}
          {dateEvents.map((event) => (
            <EventListItem
              key={event.id}
              event={event}
              isAttending={event.isAttending}
              isBirthday={event.isBirthday}
              isWork={(event as any).isWork}
              themeColor={themeColor}
              colors={colors}
              isDark={isDark}
              isOwner={event.userId === userId}
              onColorChange={onColorChange}
              onDelete={onDelete}
              onToggleBusy={onToggleBusy}
              onEditWorkTime={onEditWorkTime}
              onDeleteWorkShift={onDeleteWorkShift}
              colorOverride={colorOverrides[event.id]}
            />
          ))}
        </Animated.View>
      ))}
    </View>
  );
}
