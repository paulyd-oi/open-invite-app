/**
 * MiniCalendar Component
 *
 * A compact calendar view showing the current month with event indicators.
 * Used in friend cards to show upcoming events at a glance.
 */

import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/ThemeContext";

interface MiniCalendarProps {
  /** Array of event dates (Date objects or ISO strings) */
  eventDates: (Date | string)[];
  /** Optional accent color (defaults to theme color) */
  accentColor?: string;
  /** Optional label for event count (defaults to "open invite") */
  eventLabel?: string;
}

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

export function MiniCalendar({
  eventDates,
  accentColor,
  eventLabel = "open invite",
}: MiniCalendarProps) {
  const { themeColor, colors } = useTheme();
  const color = accentColor ?? themeColor;

  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const startingDay = currentMonth.getDay();

  // Create a set of days that have events this month
  const eventDays = new Set<number>();
  eventDates.forEach((date) => {
    const eventDate = typeof date === "string" ? new Date(date) : date;
    if (
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getFullYear() === today.getFullYear()
    ) {
      eventDays.add(eventDate.getDate());
    }
  });

  // Count all events in the current month (both past and future)
  const eventCount = eventDates.filter((date) => {
    const eventDate = typeof date === "string" ? new Date(date) : date;
    return (
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getFullYear() === today.getFullYear()
    );
  }).length;

  return (
    <View className="mt-2 pt-2 border-t" style={{ borderTopColor: colors.separator }}>
      {/* Day headers */}
      <View className="flex-row mb-1">
        {DAY_NAMES.map((day, i) => (
          <View key={i} className="flex-1 items-center">
            <Text className="text-[8px]" style={{ color: colors.textTertiary }}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View className="flex-row flex-wrap">
        {/* Empty cells for days before month starts */}
        {Array.from({ length: startingDay }).map((_, i) => (
          <View key={`empty-${i}`} className="w-[14.28%] h-4" />
        ))}

        {/* Days of the month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const hasEvent = eventDays.has(day);
          const isToday = day === today.getDate();

          return (
            <View key={day} className="w-[14.28%] h-4 items-center justify-center">
              <View
                className="w-3.5 h-3.5 rounded-full items-center justify-center"
                style={{
                  backgroundColor: hasEvent ? color : "transparent",
                  borderWidth: isToday ? 1 : 0,
                  borderColor: isToday ? color : "transparent",
                }}
              >
                <Text
                  className="text-[7px]"
                  style={{
                    color: hasEvent ? "#fff" : isToday ? color : colors.textTertiary,
                    fontWeight: hasEvent || isToday ? "600" : "400",
                  }}
                >
                  {day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Event count indicator */}
      {eventCount > 0 && (
        <View className="flex-row items-center justify-center mt-1">
          <View
            className="w-1.5 h-1.5 rounded-full mr-1"
            style={{ backgroundColor: color }}
          />
          <Text className="text-[9px]" style={{ color: colors.textSecondary }}>
            {eventCount} {eventLabel}
            {eventCount !== 1 ? "s" : ""}
          </Text>
        </View>
      )}
    </View>
  );
}
