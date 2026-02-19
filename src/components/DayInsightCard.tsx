/**
 * DayInsightCard — subtle contextual card shown above the day detail list
 * when the selected day has no Open Invite events ("empty enough").
 *
 * Work schedule blocks and birthdays do NOT count as Open Invite activity.
 * If work blocks exist, infers "Free after {time}" messaging.
 *
 * [P0_DAY_INSIGHT_CARD] proof tag
 */

import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { Plus } from "@/ui/icons";
import { useTheme, TILE_SHADOW } from "@/lib/ThemeContext";
import * as Haptics from "expo-haptics";
import { devLog } from "@/lib/devLog";

interface DayInsightEvent {
  startTime: string;
  endTime?: string | null;
  isWork?: boolean;
  isBirthday?: boolean;
}

interface DayInsightCardProps {
  selectedDate: Date;
  events: DayInsightEvent[];
  onCreatePress: () => void;
}

export function DayInsightCard({
  selectedDate,
  events,
  onCreatePress,
}: DayInsightCardProps) {
  const { themeColor, colors, isDark } = useTheme();

  const insight = useMemo(() => {
    // Open Invite events = not work, not birthday
    const openInviteEvents = events.filter(
      (e) => !e.isWork && !e.isBirthday
    );
    const emptyEnough = openInviteEvents.length === 0;

    if (!emptyEnough) return null;

    // Infer "free after" from work blocks
    const workEvents = events.filter((e) => e.isWork && e.endTime);
    let freeAfter: string | null = null;

    if (workEvents.length > 0) {
      const latestEnd = workEvents.reduce((latest, e) => {
        const end = new Date(e.endTime!).getTime();
        return end > latest ? end : latest;
      }, 0);

      const latestEndDate = new Date(latestEnd);
      const now = new Date();

      // Only show "Free after" if the end time is in the future
      // and falls on the same day
      if (
        latestEndDate > now &&
        latestEndDate.toDateString() === selectedDate.toDateString()
      ) {
        freeAfter = latestEndDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
      }
    }

    const today = new Date();
    const isToday =
      selectedDate.getDate() === today.getDate() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getFullYear() === today.getFullYear();

    const dayLabel = isToday
      ? "Today"
      : selectedDate.toLocaleDateString("en-US", { weekday: "long" });

    const bodyLine = isToday ? "Nothing planned yet" : "Open day";

    if (__DEV__) {
      devLog("[P0_DAY_INSIGHT_CARD]", {
        date: selectedDate.toISOString().split("T")[0],
        isToday,
        emptyEnough,
        freeAfter,
        totalEvents: events.length,
        openInviteCount: openInviteEvents.length,
      });
    }

    return { dayLabel, bodyLine, freeAfter };
  }, [selectedDate, events]);

  if (!insight) return null;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onCreatePress();
      }}
      className="rounded-2xl px-4 py-3 mb-4"
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{
        backgroundColor: isDark ? colors.surface : `${themeColor}08`,
        borderWidth: 1,
        borderColor: isDark ? colors.border : `${themeColor}18`,
        ...(isDark ? {} : TILE_SHADOW),
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text
            className="text-sm font-semibold mb-0.5"
            style={{ color: themeColor }}
          >
            {insight.dayLabel}
          </Text>
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            {insight.bodyLine}
            {insight.freeAfter ? ` · Free after ${insight.freeAfter}` : ""}
          </Text>
        </View>
        <View
          className="w-8 h-8 rounded-full items-center justify-center"
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{ backgroundColor: `${themeColor}15` }}
        >
          <Plus size={16} color={themeColor} />
        </View>
      </View>
    </Pressable>
  );
}
