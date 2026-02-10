/**
 * DayAgendaSheet – SSOT bottom-sheet for "tap a day → see events".
 *
 * Used by:
 *   • FeedCalendar  (Social tab)
 *   • MiniCalendar  (Circle detail)
 *
 * Consumers pass their own event-row UI as children.
 * The sheet owns: chrome (handle, header, close), empty state, scroll wrapper.
 */
import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Calendar, X } from "@/ui/icons";
import BottomSheet from "@/components/BottomSheet";
import { useTheme } from "@/lib/ThemeContext";
import { devLog } from "@/lib/devLog";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface DayAgendaSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  eventCount: number;
  themeColor: string;
  /** Optional node rendered below "No events" text (e.g. Create Event CTA). */
  emptyAction?: React.ReactNode;
  /** Event row list — rendered inside a ScrollView when eventCount > 0. */
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DayAgendaSheet({
  visible,
  onClose,
  selectedDate,
  eventCount,
  themeColor,
  emptyAction,
  children,
}: DayAgendaSheetProps) {
  const { colors } = useTheme();

  if (__DEV__ && visible) {
    devLog("[DAY_AGENDA_SHEET]", {
      date: selectedDate?.toISOString(),
      eventCount,
    });
  }

  const dateLabel =
    selectedDate?.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    }) ?? "";

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0.55}
      maxHeightPct={0.8}
      backdropOpacity={0.4}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: colors.separator,
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Calendar size={18} color={themeColor} />
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                marginLeft: 8,
                color: colors.text,
              }}
              numberOfLines={1}
            >
              {dateLabel}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 13,
              color: colors.textSecondary,
              marginTop: 2,
            }}
          >
            {eventCount} event{eventCount !== 1 ? "s" : ""}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* ── Content ────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {eventCount === 0 ? (
          <Animated.View
            entering={FadeInDown.duration(200)}
            style={{ alignItems: "center", paddingVertical: 32 }}
          >
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📅</Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "500",
                color: colors.textSecondary,
              }}
            >
              No events on this day
            </Text>
            {emptyAction}
          </Animated.View>
        ) : (
          children
        )}
      </ScrollView>
    </BottomSheet>
  );
}
