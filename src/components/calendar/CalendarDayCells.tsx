import React from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { getEventPalette } from "@/lib/eventPalette";
import { type Event } from "@/shared/contracts";
import { DARK_COLORS } from "@/lib/ThemeContext";

// Base heights for each view mode
export const BASE_HEIGHTS: Record<string, number> = {
  compact: 40,
  stacked: 64,
  details: 80,
  list: 80, // Not used for pinch but needed for type
};

// Check if a hex color is light (for determining text contrast)
export function isLightColor(hex: string): boolean {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  // Use relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

// Get text color for a given background color
export function getTextColorForBackground(bgColor: string, isDark: boolean): string {
  if (isLightColor(bgColor)) {
    // Light background needs darker text
    return isDark ? "#8B7500" : "#8B7500"; // Dark golden for yellow backgrounds
  }
  return bgColor;
}

// Compact View - Just dots for events
export function CompactDayCell({
  day,
  isToday,
  isSelected,
  isWeekday,
  events,
  onPress,
  themeColor,
  colors,
  heightMultiplier = 1,
  colorOverrides = {},
}: {
  day: number | null;
  isToday: boolean;
  isSelected: boolean;
  isWeekday: boolean;
  events: Event[];
  onPress: () => void;
  themeColor: string;
  colors: typeof DARK_COLORS;
  heightMultiplier?: number;
  colorOverrides?: Record<string, string>;
}) {
  const height = BASE_HEIGHTS.compact * heightMultiplier;

  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
  if (day === null) return <View style={{ flex: 1, height }} />;

  const eventColors = events.slice(0, 3).map((e) => getEventPalette(e, themeColor, colorOverrides[e.id]).bar);
  const showMoreDots = heightMultiplier > 1.2 && events.length > 3;
  const maxDots = heightMultiplier > 1.5 ? 5 : 3;

  return (
    <Pressable
      /* INVARIANT_ALLOW_INLINE_HANDLER */
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{ flex: 1, height, alignItems: "center", justifyContent: "center" }}
    >
      <View
        className="rounded-full items-center justify-center"
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        style={{
          width: 32 * Math.min(heightMultiplier, 1.3),
          height: 32 * Math.min(heightMultiplier, 1.3),
          backgroundColor: isSelected ? themeColor : "transparent",
        }}
      >
        <Text
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{
            fontSize: 16 * Math.min(heightMultiplier, 1.2),
            fontWeight: isWeekday ? "700" : "400",
            color: isSelected ? "#fff" : isToday ? themeColor : colors.text,
          }}
        >
          {day}
        </Text>
      </View>
      {events.length > 0 && !isSelected && (
        <View className="flex-row items-center justify-center absolute bottom-1">
          {/* INVARIANT_ALLOW_SMALL_MAP */}
          {events.slice(0, maxDots).map((e, idx) => (
            <View
              key={idx}
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{
                width: 4 * Math.min(heightMultiplier, 1.5),
                height: 4 * Math.min(heightMultiplier, 1.5),
                borderRadius: 2 * Math.min(heightMultiplier, 1.5),
                marginHorizontal: 1,
                backgroundColor: getEventPalette(e, themeColor, colorOverrides[e.id]).bar,
              }}
            />
          ))}
          {showMoreDots && events.length > maxDots && (
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            <Text style={{ fontSize: 8, color: colors.textTertiary, marginLeft: 2 }}>
              +{events.length - maxDots}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// Stacked View - Color bars stacked under the date
export function StackedDayCell({
  day,
  isToday,
  isSelected,
  isWeekday,
  events,
  onPress,
  themeColor,
  colors,
  heightMultiplier = 1,
  colorOverrides = {},
}: {
  day: number | null;
  isToday: boolean;
  isSelected: boolean;
  isWeekday: boolean;
  events: Event[];
  onPress: () => void;
  themeColor: string;
  colors: typeof DARK_COLORS;
  heightMultiplier?: number;
  colorOverrides?: Record<string, string>;
}) {
  const height = BASE_HEIGHTS.stacked * heightMultiplier;

  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
  if (day === null) return <View style={{ flex: 1, height }} />;

  // Show more bars when expanded
  const maxBars = heightMultiplier > 1.3 ? 5 : heightMultiplier > 1.1 ? 4 : 3;
  const eventColors = events.slice(0, maxBars).map((e) => getEventPalette(e, themeColor, colorOverrides[e.id]).bar);
  const barHeight = 4 * Math.min(heightMultiplier, 1.5);

  return (
    <Pressable
      /* INVARIANT_ALLOW_INLINE_HANDLER */
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{ flex: 1, height, alignItems: "center", paddingTop: 4 }}
    >
      <View
        className="rounded-full items-center justify-center mb-1"
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        style={{
          width: 28 * Math.min(heightMultiplier, 1.3),
          height: 28 * Math.min(heightMultiplier, 1.3),
          backgroundColor: isSelected ? themeColor : "transparent",
        }}
      >
        <Text
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{
            fontSize: 14 * Math.min(heightMultiplier, 1.2),
            fontWeight: isWeekday ? "700" : "400",
            color: isSelected ? "#fff" : isToday ? themeColor : colors.text,
          }}
        >
          {day}
        </Text>
      </View>
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <View style={{ width: "100%", paddingHorizontal: 2 }}>
        {/* INVARIANT_ALLOW_SMALL_MAP */}
        {eventColors.map((color, idx) => (
          <View
            key={idx}
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{
              height: barHeight,
              borderRadius: barHeight / 2,
              marginBottom: 2,
              backgroundColor: color,
            }}
          />
        ))}
        {events.length > maxBars && (
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          <Text style={{ fontSize: 8, color: colors.textTertiary, textAlign: "center" }}>
            +{events.length - maxBars}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// Details View - Shows event preview text
export function DetailsDayCell({
  day,
  isToday,
  isSelected,
  isWeekday,
  events,
  onPress,
  themeColor,
  colors,
  isDark,
  heightMultiplier = 1,
  colorOverrides = {},
}: {
  day: number | null;
  isToday: boolean;
  isSelected: boolean;
  isWeekday: boolean;
  events: Event[];
  onPress: () => void;
  themeColor: string;
  colors: typeof DARK_COLORS;
  isDark: boolean;
  heightMultiplier?: number;
  colorOverrides?: Record<string, string>;
}) {
  const height = BASE_HEIGHTS.details * heightMultiplier;

  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
  if (day === null) return <View style={{ flex: 1, height }} />;

  // Show more events when expanded
  const maxEvents = heightMultiplier > 1.5 ? 4 : heightMultiplier > 1.2 ? 3 : 2;

  // Number of lines for event title based on height multiplier
  // 1 line at base, 2 lines at 1.5x, 3 lines at 2x
  const titleLines = heightMultiplier >= 1.8 ? 3 : heightMultiplier >= 1.4 ? 2 : 1;

  return (
    <Pressable
      /* INVARIANT_ALLOW_INLINE_HANDLER */
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{ flex: 1, height, padding: 2 }}
    >
      <View
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        style={{
          flex: 1,
          borderRadius: 8,
          padding: 4,
          backgroundColor: isSelected ? `${themeColor}15` : "transparent",
          borderWidth: isToday ? 1 : 0,
          borderColor: themeColor,
        }}
      >
        <Text
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{
            fontSize: 12 * Math.min(heightMultiplier, 1.2),
            fontWeight: isWeekday ? "700" : "400",
            marginBottom: 2,
            color: isToday ? themeColor : colors.text,
          }}
        >
          {day}
        </Text>
        {/* INVARIANT_ALLOW_SMALL_MAP */}
        {events.slice(0, maxEvents).map((event, idx) => {
          const palette = getEventPalette(event, themeColor, colorOverrides[event.id]);
          const eventColor = palette.bar;
          const textColor = getTextColorForBackground(eventColor, isDark);
          return (
            <View
              key={idx}
              className="rounded px-1 mb-px"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{
                backgroundColor: eventColor + "30",
                paddingVertical: titleLines > 1 ? 2 : 1,
              }}
            >
              <Text
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{
                  fontSize: 9 * Math.min(heightMultiplier, 1.2),
                  fontWeight: "500",
                  color: textColor,
                  lineHeight: 11 * Math.min(heightMultiplier, 1.2),
                }}
                numberOfLines={titleLines}
              >
                {event.title}
              </Text>
            </View>
          );
        })}
        {events.length > maxEvents && (
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          <Text style={{ fontSize: 8, color: colors.textTertiary }}>
            +{events.length - maxEvents} more
          </Text>
        )}
      </View>
    </Pressable>
  );
}
