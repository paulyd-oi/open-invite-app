import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, ScrollView, Pressable, type NativeScrollEvent, type NativeSyntheticEvent, Modal, Share, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  Clock,
  List,
  LayoutGrid,
  Layers,
  AlignJustify,
  Users,
  Send,
  Check,
  X,
  BookOpen,
  Cake,
  CalendarPlus,
  Trash2,
  Palette,
} from "@/ui/icons";
import Animated, { FadeIn, FadeInDown, useSharedValue, withSpring, runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ContextMenu from "zeego/context-menu";
import * as ExpoCalendar from "expo-calendar";

import BottomNavigation from "@/components/BottomNavigation";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { getEventShareLink } from "@/lib/deepLinks";
import { useTheme, DARK_COLORS } from "@/lib/ThemeContext";
import { useLocalEvents, isLocalEvent } from "@/lib/offlineStore";
import { type GetEventsResponse, type Event, type GetFriendBirthdaysResponse, type FriendBirthday, type GetEventRequestsResponse, type EventRequest, type GetCalendarEventsResponse } from "@/shared/contracts";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAYS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_VIEW_HEIGHT_KEY = "@openinvite_calendar_view_height";
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

type ViewMode = "compact" | "stacked" | "details" | "list";

// Calendar view modes (pinch-to-zoom compatible)
const CALENDAR_VIEW_MODES: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: "compact", label: "Compact", icon: LayoutGrid },
  { id: "stacked", label: "Stacked", icon: Layers },
  { id: "details", label: "Details", icon: AlignJustify },
];

// Keep full list for reference
const VIEW_MODES: { id: ViewMode; label: string; icon: typeof List }[] = [
  ...CALENDAR_VIEW_MODES,
  { id: "list", label: "List", icon: List },
];

// Device-level onboarding key (no user ID required)
const ONBOARDING_SEEN_KEY = "onboarding_seen_v1";

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// Format date as "Jan. 4th"
function formatDateShort(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = date.getDate();
  return `${months[date.getMonth()]}. ${day}${getOrdinalSuffix(day)}`;
}

// Get event color - use first group color or default theme color
function getEventColor(event: Event & { isBirthday?: boolean }, defaultColor: string): string {
  // Birthday events get pink color
  if (event.isBirthday) {
    return "#FF69B4";
  }
  // If event has a custom color set, use it
  if (event.color) {
    return event.color;
  }
  // If event is tied to a group, use the group's color
  if (event.groupVisibility && event.groupVisibility.length > 0) {
    return event.groupVisibility[0].group.color;
  }
  return defaultColor;
}

// Check if a hex color is light (for determining text contrast)
function isLightColor(hex: string): boolean {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  // Use relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

// Get text color for a given background color
function getTextColorForBackground(bgColor: string, isDark: boolean): string {
  if (isLightColor(bgColor)) {
    // Light background needs darker text
    return isDark ? "#8B7500" : "#8B7500"; // Dark golden for yellow backgrounds
  }
  return bgColor;
}

// Helper to format date for calendar URLs
const formatDateForCalendar = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
};

// Helper to share event via native share sheet
const shareEventFromCalendar = async (event: Event) => {
  try {
    const startDate = new Date(event.startTime);
    const dateStr = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const timeStr = startDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    const shareUrl = getEventShareLink(event.id);

    let message = `${event.emoji} ${event.title}\n\n`;
    message += `📅 ${dateStr} at ${timeStr}\n`;

    if (event.location) {
      message += `📍 ${event.location}\n`;
    }

    if (event.description) {
      message += `\n${event.description}\n`;
    }

    message += `\n🔗 ${shareUrl}`;

    await Share.share({
      message,
      title: event.title,
      url: shareUrl,
    });
  } catch (error) {
    console.error("Error sharing event:", error);
  }
};

// Helper to add event to device calendar
const addEventToDeviceCalendar = async (event: Event) => {
  try {
    const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();

    if (status !== "granted") {
      safeToast.warning(
        "Permission Required",
        "Please allow calendar access in Settings to add events."
      );
      Linking.openSettings();
      return;
    }

    const startDate = new Date(event.startTime);
    const endDate = event.endTime ? new Date(event.endTime) : new Date(startDate.getTime() + 60 * 60 * 1000);

    const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);

    let targetCalendar: typeof calendars[0] | undefined;

    if (Platform.OS === "ios") {
      try {
        const defaultCalendar = await ExpoCalendar.getDefaultCalendarAsync();
        if (defaultCalendar?.id) {
          targetCalendar = calendars.find(c => c.id === defaultCalendar.id);
        }
      } catch (e) {}
    }

    if (!targetCalendar) {
      targetCalendar = calendars.find(
        (cal) => cal.allowsModifications && cal.source?.name === "iCloud"
      );
    }

    if (!targetCalendar) {
      targetCalendar = calendars.find(
        (cal) => cal.allowsModifications && cal.isPrimary
      );
    }

    if (!targetCalendar) {
      targetCalendar = calendars.find((cal) => cal.allowsModifications);
    }

    if (!targetCalendar) {
      safeToast.error(
        "No Calendar Found",
        "Could not find a writable calendar."
      );
      return;
    }

    await ExpoCalendar.createEventAsync(targetCalendar.id, {
      title: event.title,
      startDate: startDate,
      endDate: endDate,
      location: event.location ?? undefined,
      notes: event.description ?? undefined,
      alarms: [{ relativeOffset: -30 }],
    });

    safeToast.success(
      "Event Added!",
      `"${event.title}" has been added to your calendar.`
    );
  } catch (error: any) {
    console.error("Error adding to calendar:", error);
    safeToast.error("Error", "Failed to add event to calendar.");
  }
};

// Event color options for color picker
const EVENT_COLORS = [
  "#FF6B6B", // Red
  "#FF8C42", // Orange
  "#FFD93D", // Yellow
  "#6BCB77", // Green
  "#4ECDC4", // Teal
  "#45B7D1", // Blue
  "#A78BFA", // Purple
  "#FF69B4", // Pink
  "#9CA3AF", // Gray
];

// Base heights for each view mode
const BASE_HEIGHTS: Record<ViewMode, number> = {
  compact: 40,
  stacked: 64,
  details: 80,
  list: 80, // Not used for pinch but needed for type
};

// Unified height system - continuous scale from compact through details
// compact: 40-64, stacked: 64-80, details: 80-160
const UNIFIED_MIN_HEIGHT = 40;  // Compact minimum
const UNIFIED_MAX_HEIGHT = 160; // Details maximum (2x)

// Thresholds for view mode transitions (based on unified height)
const COMPACT_TO_STACKED_THRESHOLD = 64;  // When height reaches stacked base
const STACKED_TO_DETAILS_THRESHOLD = 80;  // When height reaches details base

// Get current view mode based on unified height
function getViewModeFromHeight(height: number): ViewMode {
  if (height < COMPACT_TO_STACKED_THRESHOLD) return "compact";
  if (height < STACKED_TO_DETAILS_THRESHOLD) return "stacked";
  return "details";
}

// Get height multiplier for a specific view mode given the unified height
function getHeightMultiplierForMode(unifiedHeight: number, mode: ViewMode): number {
  const baseHeight = BASE_HEIGHTS[mode];

  switch (mode) {
    case "compact":
      // Compact range: 40-64, multiplier 1.0-1.6
      return Math.min(unifiedHeight / baseHeight, 1.6);
    case "stacked":
      // Stacked range: 64-80, multiplier 1.0-1.25
      return Math.max(0.75, Math.min(unifiedHeight / baseHeight, 1.25));
    case "details":
      // Details range: 80-160, multiplier 1.0-2.0
      return Math.max(0.75, unifiedHeight / baseHeight);
    default:
      return 1;
  }
}

// Compact View - Just dots for events
function CompactDayCell({
  day,
  isToday,
  isSelected,
  isWeekday,
  events,
  onPress,
  themeColor,
  colors,
  heightMultiplier = 1,
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
}) {
  const height = BASE_HEIGHTS.compact * heightMultiplier;

  if (day === null) return <View style={{ flex: 1, height }} />;

  const eventColors = events.slice(0, 3).map((e) => getEventColor(e, themeColor));
  const showMoreDots = heightMultiplier > 1.2 && events.length > 3;
  const maxDots = heightMultiplier > 1.5 ? 5 : 3;

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ flex: 1, height, alignItems: "center", justifyContent: "center" }}
    >
      <View
        className="rounded-full items-center justify-center"
        style={{
          width: 32 * Math.min(heightMultiplier, 1.3),
          height: 32 * Math.min(heightMultiplier, 1.3),
          backgroundColor: isSelected ? themeColor : "transparent",
        }}
      >
        <Text
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
          {events.slice(0, maxDots).map((e, idx) => (
            <View
              key={idx}
              style={{
                width: 4 * Math.min(heightMultiplier, 1.5),
                height: 4 * Math.min(heightMultiplier, 1.5),
                borderRadius: 2 * Math.min(heightMultiplier, 1.5),
                marginHorizontal: 1,
                backgroundColor: getEventColor(e, themeColor),
              }}
            />
          ))}
          {showMoreDots && events.length > maxDots && (
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
function StackedDayCell({
  day,
  isToday,
  isSelected,
  isWeekday,
  events,
  onPress,
  themeColor,
  colors,
  heightMultiplier = 1,
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
}) {
  const height = BASE_HEIGHTS.stacked * heightMultiplier;

  if (day === null) return <View style={{ flex: 1, height }} />;

  // Show more bars when expanded
  const maxBars = heightMultiplier > 1.3 ? 5 : heightMultiplier > 1.1 ? 4 : 3;
  const eventColors = events.slice(0, maxBars).map((e) => getEventColor(e, themeColor));
  const barHeight = 4 * Math.min(heightMultiplier, 1.5);

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ flex: 1, height, alignItems: "center", paddingTop: 4 }}
    >
      <View
        className="rounded-full items-center justify-center mb-1"
        style={{
          width: 28 * Math.min(heightMultiplier, 1.3),
          height: 28 * Math.min(heightMultiplier, 1.3),
          backgroundColor: isSelected ? themeColor : "transparent",
        }}
      >
        <Text
          style={{
            fontSize: 14 * Math.min(heightMultiplier, 1.2),
            fontWeight: isWeekday ? "700" : "400",
            color: isSelected ? "#fff" : isToday ? themeColor : colors.text,
          }}
        >
          {day}
        </Text>
      </View>
      <View style={{ width: "100%", paddingHorizontal: 2 }}>
        {eventColors.map((color, idx) => (
          <View
            key={idx}
            style={{
              height: barHeight,
              borderRadius: barHeight / 2,
              marginBottom: 2,
              backgroundColor: color,
            }}
          />
        ))}
        {events.length > maxBars && (
          <Text style={{ fontSize: 8, color: colors.textTertiary, textAlign: "center" }}>
            +{events.length - maxBars}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// Details View - Shows event preview text
function DetailsDayCell({
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
}) {
  const height = BASE_HEIGHTS.details * heightMultiplier;

  if (day === null) return <View style={{ flex: 1, height }} />;

  // Show more events when expanded
  const maxEvents = heightMultiplier > 1.5 ? 4 : heightMultiplier > 1.2 ? 3 : 2;

  // Number of lines for event title based on height multiplier
  // 1 line at base, 2 lines at 1.5x, 3 lines at 2x
  const titleLines = heightMultiplier >= 1.8 ? 3 : heightMultiplier >= 1.4 ? 2 : 1;

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ flex: 1, height, padding: 2 }}
    >
      <View
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
          style={{
            fontSize: 12 * Math.min(heightMultiplier, 1.2),
            fontWeight: isWeekday ? "700" : "400",
            marginBottom: 2,
            color: isToday ? themeColor : colors.text,
          }}
        >
          {day}
        </Text>
        {events.slice(0, maxEvents).map((event, idx) => {
          const eventColor = getEventColor(event, themeColor);
          const textColor = getTextColorForBackground(eventColor, isDark);
          return (
            <View
              key={idx}
              className="rounded px-1 mb-px"
              style={{
                backgroundColor: eventColor + "30",
                paddingVertical: titleLines > 1 ? 2 : 1,
              }}
            >
              <Text
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
          <Text style={{ fontSize: 8, color: colors.textTertiary }}>
            +{events.length - maxEvents} more
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// Event List Item for all views
function EventListItem({
  event,
  isAttending,
  isBirthday,
  isWork,
  themeColor,
  colors,
  compact = false,
  isDark,
  onColorChange,
  onDelete,
  isOwner,
}: {
  event: Event & { isBusinessEvent?: boolean; businessEventId?: string };
  isAttending?: boolean;
  isBirthday?: boolean;
  isWork?: boolean;
  themeColor: string;
  colors: typeof DARK_COLORS;
  compact?: boolean;
  isDark: boolean;
  onColorChange?: (eventId: string, color: string) => void;
  onDelete?: (eventId: string) => void;
  isOwner?: boolean;
}) {
  const router = useRouter();
  // Track context menu state to prevent navigation when menu was just opened
  const contextMenuOpenedRef = React.useRef(false);
  const navigationBlockedUntilRef = React.useRef(0);
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  // Use pink/magenta for birthdays, gray for work, theme color for regular events
  const eventColor = isBirthday ? "#FF69B4" : isWork ? "#6B7280" : getEventColor(event, themeColor);
  const textColor = getTextColorForBackground(eventColor, isDark);

  // Format time label: birthdays show "All day", all other events show time range
  const timeLabel = isBirthday
    ? "All day"
    : endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  // Work events are not tappable
  const isInteractive = !isBirthday && !isWork;

  // Check if event is tied to a group (cannot change color if so)
  const isTiedToGroup = event.groupVisibility && event.groupVisibility.length > 0;

  // Determine the correct route for the event
  const getEventRoute = () => {
    return `/event/${event.id}`;
  };

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    shareEventFromCalendar(event);
  };

  const handleSync = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addEventToDeviceCalendar(event);
  };

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete?.(event.id);
  };

  const handleColorSelect = (color: string) => {
    console.log("[Calendar] Color selected:", color, "for event:", event.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onColorChange?.(event.id, color);
  };

  // Handle navigation with context menu awareness
  const handlePress = () => {
    // Block navigation if context menu was recently opened (within 500ms)
    const now = Date.now();
    if (now < navigationBlockedUntilRef.current) {
      return;
    }

    // Only navigate if press duration was short (not a long press)
    const pressDuration = now - pressStartTimeRef.current;
    if (pressDuration > 200) {
      // Long press detected, don't navigate
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(getEventRoute() as any);
  };

  // Track press start time to detect long press vs tap
  const pressStartTimeRef = React.useRef(0);

  const handlePressIn = () => {
    pressStartTimeRef.current = Date.now();
  };

  // Track context menu open/close state
  const handleContextMenuOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      contextMenuOpenedRef.current = true;
      // Block navigation for 500ms after context menu opens
      navigationBlockedUntilRef.current = Date.now() + 500;
    } else {
      // When menu closes, extend the block briefly to prevent onPress from firing
      if (contextMenuOpenedRef.current) {
        navigationBlockedUntilRef.current = Date.now() + 300;
      }
      // Reset after a brief delay
      setTimeout(() => {
        contextMenuOpenedRef.current = false;
      }, 350);
    }
  };

  // For non-interactive items (birthdays, work), just return simple Pressable
  if (!isInteractive) {
    if (compact) {
      return (
        <Pressable
          className="flex-row items-center py-2"
          style={{ opacity: isWork ? 0.7 : 1 }}
        >
          <View
            className="w-1 h-full rounded-full mr-3"
            style={{ backgroundColor: eventColor, minHeight: 36 }}
          />
          <View className="flex-1">
            <Text className="font-semibold" style={{ color: colors.text }} numberOfLines={1}>
              {isWork ? `💼 ${event.title}` : event.title}
            </Text>
            <Text className="text-xs" style={{ color: colors.textSecondary }}>
              {timeLabel}
            </Text>
          </View>
        </Pressable>
      );
    }

    return (
      <View
        className="flex-row items-center rounded-xl p-3 mb-2"
        style={{
          backgroundColor: eventColor + "12",
          borderLeftWidth: 4,
          borderLeftColor: eventColor,
          opacity: isWork ? 0.8 : 1,
        }}
      >
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-lg mr-2">{event.emoji}</Text>
            <Text className="font-semibold flex-1" style={{ color: colors.text }} numberOfLines={1}>
              {event.title}
            </Text>
            {isWork && (
              <View
                className="px-2 py-0.5 rounded-full ml-2"
                style={{ backgroundColor: eventColor + "30" }}
              >
                <Text className="text-xs font-medium" style={{ color: eventColor }}>
                  Busy
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row items-center mt-1">
            <Clock size={12} color={textColor} />
            <Text className="text-xs ml-1" style={{ color: textColor }}>
              {timeLabel}
            </Text>
          </View>
          {isBirthday && event.description && (
            <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
              {event.description}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // Interactive events with context menu
  const cardContent = compact ? (
    <View className="flex-row items-center py-2">
      <View
        className="w-1 h-full rounded-full mr-3"
        style={{ backgroundColor: eventColor, minHeight: 36 }}
      />
      <View className="flex-1">
        <Text className="font-semibold" style={{ color: colors.text }} numberOfLines={1}>
          {event.title}
        </Text>
        <Text className="text-xs" style={{ color: colors.textSecondary }}>
          {timeLabel}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </View>
  ) : (
    <View
      className="flex-row items-center rounded-xl p-3 mb-2"
      style={{
        backgroundColor: eventColor + "12",
        borderLeftWidth: 4,
        borderLeftColor: eventColor,
      }}
    >
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-lg mr-2">{event.emoji}</Text>
          <Text className="font-semibold flex-1" style={{ color: colors.text }} numberOfLines={1}>
            {event.title}
          </Text>
        </View>
        <View className="flex-row items-center mt-1">
          <Clock size={12} color={textColor} />
          <Text className="text-xs ml-1" style={{ color: textColor }}>
            {timeLabel}
          </Text>
          {event.location && (
            <>
              <MapPin size={12} color={colors.textTertiary} style={{ marginLeft: 12 }} />
              <Text className="text-xs ml-1 flex-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {event.location}
              </Text>
            </>
          )}
        </View>
        {isAttending && event.user && (
          <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
            Hosted by {event.user.name ?? event.user.email ?? "Friend"}
          </Text>
        )}
      </View>
      <ChevronRight size={18} color={colors.textTertiary} />
    </View>
  );

  return (
    <>
      <ContextMenu.Root onOpenChange={handleContextMenuOpenChange}>
        <ContextMenu.Trigger>
          <Pressable onPressIn={handlePressIn} onPress={handlePress}>
            {cardContent}
          </Pressable>
        </ContextMenu.Trigger>
        <ContextMenu.Content>
          {/* Share */}
          <ContextMenu.Item key="share" onSelect={handleShare}>
            <ContextMenu.ItemTitle>Share Event</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "paperplane" }} />
          </ContextMenu.Item>

        {/* Sync to Calendar */}
        <ContextMenu.Item key="sync" onSelect={handleSync}>
          <ContextMenu.ItemTitle>Sync to Calendar</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon ios={{ name: "calendar.badge.plus" }} />
        </ContextMenu.Item>

        {/* Change Color - Only if not tied to a group and user is owner */}
        {!isTiedToGroup && isOwner && onColorChange && (
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger key="color-trigger">
              <ContextMenu.ItemTitle>Change Color</ContextMenu.ItemTitle>
              <ContextMenu.ItemIcon ios={{ name: "paintpalette" }} />
            </ContextMenu.SubTrigger>
            <ContextMenu.SubContent>
              {EVENT_COLORS.map((color) => (
                <ContextMenu.Item
                  key={color}
                  onSelect={() => handleColorSelect(color)}
                >
                  <ContextMenu.ItemTitle>
                    {color === "#FF6B6B" ? "Red" :
                     color === "#FF8C42" ? "Orange" :
                     color === "#FFD93D" ? "Yellow" :
                     color === "#6BCB77" ? "Green" :
                     color === "#4ECDC4" ? "Teal" :
                     color === "#45B7D1" ? "Blue" :
                     color === "#A78BFA" ? "Purple" :
                     color === "#FF69B4" ? "Pink" : "Gray"}
                  </ContextMenu.ItemTitle>
                </ContextMenu.Item>
              ))}
            </ContextMenu.SubContent>
          </ContextMenu.Sub>
        )}

        {/* Delete - Only if user is owner */}
        {isOwner && onDelete && (
          <ContextMenu.Item key="delete" onSelect={handleDelete} destructive>
            <ContextMenu.ItemTitle>Delete Event</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "trash" }} />
          </ContextMenu.Item>
        )}
      </ContextMenu.Content>
    </ContextMenu.Root>

      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete Event"
        message={`Are you sure you want to delete "${event.title}"? This cannot be undone.`}
        confirmText="Delete"
        isDestructive
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

// Upcoming Birthdays Section - Collapsible
function UpcomingBirthdaysSection({
  upcomingBirthdays,
  colors,
}: {
  upcomingBirthdays: Array<{
    id: string;
    name: string | null;
    image: string | null;
    birthday: string;
    showYear: boolean;
    nextBirthday: Date;
    daysUntil: number;
    isOwnBirthday: boolean;
    turningAge: number;
  }>;
  colors: typeof DARK_COLORS;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (upcomingBirthdays.length === 0) {
    return null;
  }

  return (
    <View className="px-5 mt-6 mb-4">
      {/* Header - Tappable to collapse/expand */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsExpanded(!isExpanded);
        }}
        className="flex-row items-center justify-between mb-3"
      >
        <View className="flex-row items-center">
          <Cake size={18} color="#FF69B4" />
          <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
            Upcoming Birthdays
          </Text>
          <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FF69B420" }}>
            <Text className="text-xs font-medium" style={{ color: "#FF69B4" }}>
              {upcomingBirthdays.length}
            </Text>
          </View>
        </View>
        <ChevronRight
          size={18}
          color={colors.textTertiary}
          style={{ transform: [{ rotate: isExpanded ? "90deg" : "0deg" }] }}
        />
      </Pressable>

      {/* Content - Collapsible */}
      {isExpanded && (
        <Animated.View entering={FadeInDown.springify()}>
          <View
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            {upcomingBirthdays.map((bday, idx) => {
              const isToday = bday.daysUntil === 0;
              const isTomorrow = bday.daysUntil === 1;

              return (
                <View
                  key={bday.id}
                  className="flex-row items-center p-3"
                  style={{
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: colors.separator,
                    backgroundColor: isToday ? "#FF69B410" : "transparent",
                  }}
                >
                  {/* Avatar or cake emoji */}
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{
                      backgroundColor: isToday ? "#FF69B430" : "#FF69B415",
                    }}
                  >
                    <Text className="text-lg">🎂</Text>
                  </View>

                  {/* Name and age */}
                  <View className="flex-1">
                    <Text className="font-medium" style={{ color: colors.text }}>
                      {bday.isOwnBirthday ? "My Birthday" : `${bday.name ?? "Friend"}'s Birthday`}
                    </Text>
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      {bday.showYear ? (bday.isOwnBirthday ? `Turning ${bday.turningAge}` : `Turns ${bday.turningAge}`) : "Birthday!"}
                    </Text>
                  </View>

                  {/* Days until */}
                  <View className="items-end">
                    {isToday ? (
                      <View className="px-2 py-1 rounded-full" style={{ backgroundColor: "#FF69B4" }}>
                        <Text className="text-xs font-bold text-white">TODAY!</Text>
                      </View>
                    ) : isTomorrow ? (
                      <View className="px-2 py-1 rounded-full" style={{ backgroundColor: "#FF69B430" }}>
                        <Text className="text-xs font-semibold" style={{ color: "#FF69B4" }}>Tomorrow</Text>
                      </View>
                    ) : (
                      <View className="items-end">
                        <Text className="text-sm font-semibold" style={{ color: "#FF69B4" }}>
                          {bday.nextBirthday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </Text>
                        <Text className="text-xs" style={{ color: colors.textTertiary }}>
                          in {bday.daysUntil} days
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// List View - Full month list with sections
function ListView({
  events,
  currentMonth,
  currentYear,
  themeColor,
  colors,
  isDark,
  userId,
  onColorChange,
  onDelete,
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
}) {
  const router = useRouter();

  // Group events by date
  const eventsByDate = useMemo(() => {
    const groups: { [key: string]: Array<Event & { isAttending?: boolean; isBirthday?: boolean }> } = {};

    events
      .filter((e) => {
        const d = new Date(e.startTime);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .forEach((event) => {
        const dateKey = new Date(event.startTime).toDateString();
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
        <Text style={{ color: colors.textTertiary }}>No events this month</Text>
        <Pressable
          onPress={() => router.push("/create")}
          className="flex-row items-center mt-3"
        >
          <Plus size={16} color={themeColor} />
          <Text className="font-medium ml-1" style={{ color: themeColor }}>
            Create Event
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="px-5">
      {eventsByDate.map(({ date, events: dateEvents }, idx) => (
        <Animated.View key={date.toISOString()} entering={FadeInDown.delay(idx * 50)}>
          <View className="flex-row items-center mb-2 mt-4">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: `${themeColor}15` }}
            >
              <Text className="text-xs font-bold" style={{ color: themeColor }}>
                {date.getDate()}
              </Text>
            </View>
            <Text className="font-semibold" style={{ color: colors.text }}>
              {date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </Text>
          </View>
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
            />
          ))}
        </Animated.View>
      ))}
    </View>
  );
}

export default function CalendarScreen() {
  const { data: session, isLoading: sessionLoading } = useSession();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

  // [CalendarBoot] Add instrumentation at top of component
  if (__DEV__) {
    console.log("[CalendarBoot] Component render", { sessionLoading, hasSession: !!session });
  }

  // Get local events created while offline
  const localEvents = useLocalEvents();

  // First login guide popup
  const [showFirstLoginGuide, setShowFirstLoginGuide] = useState(false);

  // Check if this is the user's first login
  useEffect(() => {
    const checkFirstLogin = async () => {
      const hasSeenGuide = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
      if (!hasSeenGuide) {
        // Show the popup after a small delay for smoother UX
        setTimeout(() => {
          setShowFirstLoginGuide(true);
        }, 500);
      }
    };
    checkFirstLogin();
  }, []);

  const handleDismissGuide = async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    setShowFirstLoginGuide(false);
  };

  const handleOpenGuide = async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    setShowFirstLoginGuide(false);
    router.push("/onboarding");
  };

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [isListView, setIsListView] = useState(false);

  // Scroll-to-change-month state
  const scrollViewRef = useRef<ScrollView>(null);
  const [showPrevMonthIndicator, setShowPrevMonthIndicator] = useState(false);
  const [showNextMonthIndicator, setShowNextMonthIndicator] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const isChangingMonth = useRef(false);
  const lastScrollY = useRef(0);
  const SCROLL_THRESHOLD = 80; // Threshold for overscroll to trigger month change

  // Unified height system - one continuous value that determines both view mode and multiplier
  // Range: 40 (compact min) -> 64 (stacked) -> 80 (details) -> 160 (details max)
  const [initialHeightLoaded, setInitialHeightLoaded] = useState(false);
  const unifiedHeight = useSharedValue(BASE_HEIGHTS.stacked); // Start at stacked
  const baseUnifiedHeight = useSharedValue(BASE_HEIGHTS.stacked);
  const [displayUnifiedHeight, setDisplayUnifiedHeight] = useState(BASE_HEIGHTS.stacked);

  // [CalendarBoot] Degraded mode timeout system
  const [isInDegradedMode, setIsInDegradedMode] = useState(false);
  const degradedModeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // If session is missing or loading, set timeout for degraded mode
    if (sessionLoading || !session) {
      if (__DEV__) {
        console.log("[CalendarBoot] Session missing/loading, starting degraded mode timeout");
      }
      degradedModeTimeoutRef.current = setTimeout(() => {
        if (__DEV__) {
          console.log("[CalendarBoot] Degraded mode timeout triggered (2500ms)");
        }
        setIsInDegradedMode(true);
      }, 2500);

      return () => {
        if (degradedModeTimeoutRef.current) {
          clearTimeout(degradedModeTimeoutRef.current);
        }
      };
    } else {
      // Session loaded, cancel degraded mode
      if (degradedModeTimeoutRef.current) {
        clearTimeout(degradedModeTimeoutRef.current);
      }
      setIsInDegradedMode(false);
    }
  }, [session, sessionLoading]);

  // Load saved calendar view height on mount
  useEffect(() => {
    const loadSavedHeight = async () => {
      try {
        const savedHeight = await AsyncStorage.getItem(CALENDAR_VIEW_HEIGHT_KEY);
        if (savedHeight) {
          const height = parseFloat(savedHeight);
          if (!isNaN(height) && height >= UNIFIED_MIN_HEIGHT && height <= UNIFIED_MAX_HEIGHT) {
            unifiedHeight.value = height;
            setDisplayUnifiedHeight(height);
            prevViewModeRef.current = getViewModeFromHeight(height);
          }
        }
      } catch (error) {
        console.error("Failed to load calendar view height:", error);
      }
      setInitialHeightLoaded(true);
    };
    loadSavedHeight();
  }, []);

  // Save calendar view height when it changes
  useEffect(() => {
    if (!initialHeightLoaded) return;
    const saveHeight = async () => {
      try {
        await AsyncStorage.setItem(CALENDAR_VIEW_HEIGHT_KEY, displayUnifiedHeight.toString());
      } catch (error) {
        console.error("Failed to save calendar view height:", error);
      }
    };
    saveHeight();
  }, [displayUnifiedHeight, initialHeightLoaded]);

  // Derive view mode and height multiplier from unified height
  const viewMode = getViewModeFromHeight(displayUnifiedHeight);
  const displayHeightMultiplier = getHeightMultiplierForMode(displayUnifiedHeight, viewMode);

  // Track previous view mode for haptic feedback on transitions
  const prevViewModeRef = React.useRef(viewMode);

  // Helper function to update display state (called from worklet via runOnJS)
  const onHeightChange = useCallback((newHeight: number) => {
    setDisplayUnifiedHeight(newHeight);

    // Check if view mode changed and trigger haptic
    const newViewMode = getViewModeFromHeight(newHeight);
    if (newViewMode !== prevViewModeRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      prevViewModeRef.current = newViewMode;
    }
  }, []);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Pinch gesture with unified height system - seamless transitions
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      baseUnifiedHeight.value = unifiedHeight.value;
    })
    .onUpdate((event) => {
      // Scale the unified height based on pinch
      const newHeight = baseUnifiedHeight.value * event.scale;
      // Clamp between min and max
      unifiedHeight.value = Math.max(
        UNIFIED_MIN_HEIGHT,
        Math.min(UNIFIED_MAX_HEIGHT, newHeight)
      );
      // Update display state
      runOnJS(onHeightChange)(unifiedHeight.value);
    })
    .onEnd(() => {
      // Snap to nice values at view mode boundaries or current position
      let targetHeight = unifiedHeight.value;

      // Snap to nearest threshold if close
      const snapThreshold = 8;
      if (Math.abs(targetHeight - COMPACT_TO_STACKED_THRESHOLD) < snapThreshold) {
        targetHeight = COMPACT_TO_STACKED_THRESHOLD;
      } else if (Math.abs(targetHeight - STACKED_TO_DETAILS_THRESHOLD) < snapThreshold) {
        targetHeight = STACKED_TO_DETAILS_THRESHOLD;
      }

      // Clamp and animate
      targetHeight = Math.max(UNIFIED_MIN_HEIGHT, Math.min(UNIFIED_MAX_HEIGHT, targetHeight));
      unifiedHeight.value = withSpring(targetHeight, { damping: 15, stiffness: 150 });
      runOnJS(onHeightChange)(targetHeight);
      runOnJS(triggerHaptic)();
    });

  // Manual view mode setter (for button clicks)
  const setViewModeManually = useCallback((mode: ViewMode) => {
    Haptics.selectionAsync();
    const targetHeight = BASE_HEIGHTS[mode];
    unifiedHeight.value = targetHeight;
    setDisplayUnifiedHeight(targetHeight);
    prevViewModeRef.current = mode;
  }, [unifiedHeight]);

  // Calculate date range for the visible calendar (include surrounding days for grid padding)
  const visibleDateRange = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    // Include days from previous/next month that appear in the calendar grid
    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

    // Start from the first day shown in the grid (may be from previous month)
    const rangeStart = new Date(firstDay);
    rangeStart.setDate(rangeStart.getDate() - firstDayOfWeek);
    rangeStart.setHours(0, 0, 0, 0);

    // End at the last day shown in the grid (may be from next month)
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + totalCells);
    rangeEnd.setHours(23, 59, 59, 999);

    return {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString(),
    };
  }, [currentYear, currentMonth]);

  // Fetch calendar events (created + going events) for the visible range
  const { data: calendarData, refetch: refetchCalendarEvents } = useQuery({
    queryKey: ["events", "calendar", visibleDateRange.start, visibleDateRange.end],
    queryFn: () =>
      api.get<GetCalendarEventsResponse>(
        `/api/events/calendar-events?start=${encodeURIComponent(visibleDateRange.start)}&end=${encodeURIComponent(visibleDateRange.end)}`
      ),
    // [CalendarBoot] Remove enabled gate to allow fetch attempt in degraded mode
    refetchOnMount: true,
    staleTime: 0, // Always consider data stale to ensure fresh data on navigation
  });

  // Fetch friend birthdays
  const { data: birthdaysData } = useQuery({
    queryKey: ["birthdays"],
    queryFn: () => api.get<GetFriendBirthdaysResponse>("/api/birthdays"),
    // [CalendarBoot] Remove enabled gate to allow fetch attempt in degraded mode
  });

  // QueryClient for invalidating queries
  const queryClient = useQueryClient();

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => api.delete(`/api/events/${eventId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: () => {
      safeToast.error("Error", "Failed to delete event");
    },
  });

  // Update event color mutation
  const updateEventColorMutation = useMutation({
    mutationFn: ({ eventId, color }: { eventId: string; color: string }) =>
      api.put(`/api/events/${eventId}`, { color }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Invalidate calendar events query to refresh
      queryClient.invalidateQueries({ queryKey: ["events", "calendar"] });
    },
    onError: () => {
      safeToast.error("Error", "Failed to update event color");
    },
  });

  // Handlers for context menu actions
  const handleDeleteEvent = (eventId: string) => {
    deleteEventMutation.mutate(eventId);
  };

  const handleColorChange = (eventId: string, color: string) => {
    console.log("[Calendar] handleColorChange called:", { eventId, color });
    updateEventColorMutation.mutate({ eventId, color });
  };

  // Fetch work schedule
  interface WorkScheduleDay {
    dayOfWeek: number;
    dayName: string;
    isEnabled: boolean;
    startTime: string | null;
    endTime: string | null;
    label: string;
  }
  interface WorkScheduleSettings {
    showOnCalendar: boolean;
  }
  const { data: workScheduleData } = useQuery({
    queryKey: ["workSchedule"],
    queryFn: () => api.get<{ schedules: WorkScheduleDay[]; settings: WorkScheduleSettings }>("/api/work-schedule"),
    // [CalendarBoot] Remove enabled gate to allow fetch attempt in degraded mode
  });

  // Fetch event requests
  const { data: eventRequestsData } = useQuery({
    queryKey: ["event-requests"],
    queryFn: () => api.get<GetEventRequestsResponse>("/api/event-requests"),
    // [CalendarBoot] Remove enabled gate to allow fetch attempt in degraded mode
  });

  // Extract created and going events from calendar data
  const myEvents = calendarData?.createdEvents ?? [];
  const goingEvents = calendarData?.goingEvents ?? [];

  const friendBirthdays = birthdaysData?.birthdays ?? [];
  const workSchedules = workScheduleData?.schedules ?? [];
  const workSettings = workScheduleData?.settings ?? { showOnCalendar: true };
  const eventRequests = eventRequestsData?.eventRequests ?? [];
  const pendingEventRequestCount = eventRequestsData?.pendingCount ?? 0;

  // Convert birthdays to pseudo-events for the calendar
  const birthdayEvents = useMemo(() => {
    return friendBirthdays.map((bday): Event & { isAttending?: boolean; isBirthday?: boolean; isOwnBirthday?: boolean } => {
      const birthdayDate = new Date(bday.birthday);
      // Create a birthday "event" for this year
      const thisYearBirthday = new Date(currentYear, birthdayDate.getMonth(), birthdayDate.getDate(), 0, 0, 0);

      // Check if this is the user's own birthday
      const isOwn = (bday as any).isOwnBirthday === true;

      return {
        id: `birthday-${bday.id}`,
        title: isOwn ? `🎂 My Birthday` : `🎂 ${bday.name ?? "Friend"}'s Birthday`,
        description: bday.showYear
          ? isOwn ? `I'm turning ${currentYear - birthdayDate.getFullYear()}!` : `Turning ${currentYear - birthdayDate.getFullYear()}!`
          : "Birthday!",
        location: null,
        emoji: "🎂",
        startTime: thisYearBirthday.toISOString(),
        endTime: null,
        isRecurring: true,
        recurrence: "yearly",
        visibility: "all_friends",
        userId: bday.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isAttending: false,
        isBirthday: true,
        isOwnBirthday: isOwn,
      };
    });
  }, [friendBirthdays, currentYear]);

  // Generate work schedule pseudo-events for the visible month
  const workEvents = useMemo(() => {
    if (workSchedules.length === 0) return [];

    const events: Array<Event & { isAttending?: boolean; isBirthday?: boolean; isWork?: boolean }> = [];
    const daysInCurrentMonth = getDaysInMonth(currentYear, currentMonth);

    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dayOfWeek = date.getDay();
      const schedule = workSchedules.find((s) => s.dayOfWeek === dayOfWeek);

      if (schedule?.isEnabled && schedule.startTime && schedule.endTime) {
        const [startHours, startMinutes] = schedule.startTime.split(":").map(Number);
        const [endHours, endMinutes] = schedule.endTime.split(":").map(Number);

        const startTime = new Date(currentYear, currentMonth, day, startHours, startMinutes);
        const endTime = new Date(currentYear, currentMonth, day, endHours, endMinutes);

        events.push({
          id: `work-${currentYear}-${currentMonth}-${day}`,
          title: schedule.label || "Work",
          description: `${schedule.startTime} - ${schedule.endTime}`,
          location: null,
          emoji: "💼",
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          isRecurring: true,
          recurrence: "weekly",
          visibility: "all_friends",
          userId: session?.user?.id ?? "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isAttending: false,
          isBirthday: false,
          isWork: true,
        });
      }
    }

    return events;
  }, [workSchedules, currentYear, currentMonth, session?.user?.id]);

  // Combine events (myEvents = created, goingEvents = RSVP going + joined, localEvents = offline created)
  const allEvents = useMemo(() => {
    const myEventIds = new Set(myEvents.map((e) => e.id));

    // Convert local events to the expected format with all required fields
    const localEventsFormatted = localEvents.map((e) => ({
      id: e.id,
      title: e.title,
      emoji: e.emoji,
      startTime: e.startTime,
      endTime: e.endTime ?? null,
      location: e.location ?? null,
      description: e.description ?? null,
      visibility: e.visibility ?? "friends",
      userId: e.userId ?? session?.user?.id ?? "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isRecurring: false,
      recurrence: null,
      inviteOnly: e.inviteOnly ?? false,
      color: e.color ?? null,
      groupId: null,
      parentEventId: null,
      isAttending: false,
      isBirthday: false,
      isWork: false,
      isLocalOnly: true, // Mark as local-only for visual indicator
    }));

    const combined: Array<Event & { isAttending?: boolean; isBirthday?: boolean; isWork?: boolean; isLocalOnly?: boolean }> = [
      ...workEvents, // Work events first (background)
      ...myEvents.map((e) => ({ ...e, isAttending: false, isBirthday: false, isWork: false, isLocalOnly: false })),
      ...localEventsFormatted, // Include offline-created events
      ...goingEvents
        .filter((e) => !myEventIds.has(e.id)) // Dedupe: don't show own events twice
        .map((e) => ({ ...e, isAttending: true, isBirthday: false, isWork: false, isLocalOnly: false })),
      ...birthdayEvents.map((e) => ({ ...e, isWork: false, isLocalOnly: false })),
    ];
    return combined;
  }, [myEvents, goingEvents, birthdayEvents, workEvents, localEvents, session?.user?.id]);

  // Compute upcoming birthdays (next 30 days) for the sidebar section
  const upcomingBirthdays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    return friendBirthdays
      .map((bday) => {
        const birthdayDate = new Date(bday.birthday);
        // Create this year's birthday
        let thisYearBirthday = new Date(today.getFullYear(), birthdayDate.getMonth(), birthdayDate.getDate());

        // If birthday has passed this year, use next year
        if (thisYearBirthday < today) {
          thisYearBirthday = new Date(today.getFullYear() + 1, birthdayDate.getMonth(), birthdayDate.getDate());
        }

        const daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const isOwn = (bday as any).isOwnBirthday === true;

        return {
          ...bday,
          nextBirthday: thisYearBirthday,
          daysUntil,
          isOwnBirthday: isOwn,
          turningAge: thisYearBirthday.getFullYear() - birthdayDate.getFullYear(),
        };
      })
      .filter((b) => b.daysUntil >= 0 && b.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 5); // Show max 5 upcoming birthdays
  }, [friendBirthdays]);

  // Get events for a specific date (for calendar grid - respects showOnCalendar setting)
  const getEventsForCalendarDate = useCallback((date: Date) => {
    return allEvents.filter((event) => {
      const eventDate = new Date(event.startTime);
      const matchesDate = eventDate.toDateString() === date.toDateString();
      // Filter out work events from calendar bubbles if setting is off
      if (!workSettings.showOnCalendar && (event as any).isWork) {
        return false;
      }
      return matchesDate;
    });
  }, [allEvents, workSettings.showOnCalendar]);

  // Get events for a specific date (for event list - always includes work events)
  const getEventsForDate = useCallback((date: Date) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return allEvents.filter((event) => {
      if (!event.startTime) return false;

      const start = new Date(event.startTime);
      if (isNaN(start.getTime())) return false;

      const end =
        event.endTime && !isNaN(new Date(event.endTime).getTime())
          ? new Date(event.endTime)
          : new Date(start.getTime() + 60 * 60 * 1000); // defensive fallback

      // Overlap test
      return start <= dayEnd && end >= dayStart;
    });
  }, [allEvents]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfMonth = getFirstDayOfMonth(currentYear, currentMonth);

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  // Fill remaining cells to complete the grid
  const remainingCells = (7 - (calendarDays.length % 7)) % 7;
  for (let i = 0; i < remainingCells; i++) {
    calendarDays.push(null);
  }

  const goToPrevMonth = useCallback(() => {
    Haptics.selectionAsync();
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }, [currentMonth, currentYear]);

  const goToNextMonth = useCallback(() => {
    Haptics.selectionAsync();
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }, [currentMonth, currentYear]);

  const goToToday = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    setSelectedDate(today);
  };

  // Handle scroll events to detect overscroll
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isChangingMonth.current) return;

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const offsetY = contentOffset.y;
    const maxScroll = Math.max(0, contentSize.height - layoutMeasurement.height);

    // Track scroll position
    lastScrollY.current = offsetY;

    // Check for overscroll at top (negative offset) - need significant overscroll
    if (offsetY < -SCROLL_THRESHOLD) {
      setShowPrevMonthIndicator(true);
    } else {
      setShowPrevMonthIndicator(false);
    }

    // Check for overscroll at bottom (or if content fits on screen, check for any downward overscroll)
    const canScrollDown = maxScroll > 10; // Has scrollable content
    if (canScrollDown && offsetY > maxScroll + SCROLL_THRESHOLD) {
      setShowNextMonthIndicator(true);
    } else if (!canScrollDown && offsetY > SCROLL_THRESHOLD) {
      // Content fits on screen - trigger on downward pull
      setShowNextMonthIndicator(true);
    } else {
      setShowNextMonthIndicator(false);
    }
  }, [SCROLL_THRESHOLD]);

  // Handle scroll end drag to trigger month change (only on user release, not momentum)
  const handleScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isChangingMonth.current) return;

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const offsetY = contentOffset.y;
    const maxScroll = Math.max(0, contentSize.height - layoutMeasurement.height);

    // Trigger previous month - must be significantly overscrolled at top
    if (offsetY < -SCROLL_THRESHOLD) {
      isChangingMonth.current = true;
      setShowPrevMonthIndicator(false);
      goToPrevMonth();
      // Reset scroll position and state
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        lastScrollY.current = 0;
      }, 50);
      setTimeout(() => {
        isChangingMonth.current = false;
      }, 600);
      return;
    }

    // Trigger next month - check for overscroll at bottom
    const canScrollDown = maxScroll > 10;
    const shouldTriggerNext = canScrollDown
      ? offsetY > maxScroll + SCROLL_THRESHOLD
      : offsetY > SCROLL_THRESHOLD;

    if (shouldTriggerNext) {
      isChangingMonth.current = true;
      setShowNextMonthIndicator(false);
      goToNextMonth();
      // Reset scroll position and state
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        lastScrollY.current = 0;
      }, 50);
      setTimeout(() => {
        isChangingMonth.current = false;
      }, 600);
      return;
    }
  }, [SCROLL_THRESHOLD, goToPrevMonth, goToNextMonth]);

  // Clear indicators when momentum scroll ends (bounce back)
  const handleMomentumEnd = useCallback(() => {
    setShowPrevMonthIndicator(false);
    setShowNextMonthIndicator(false);
  }, []);

  // Get previous and next month names
  const prevMonthName = MONTHS[(currentMonth - 1 + 12) % 12];
  const nextMonthName = MONTHS[(currentMonth + 1) % 12];

  const selectedDateEvents = getEventsForDate(selectedDate).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // Render calendar cell based on view mode
  const renderCell = (day: number | null, index: number) => {
    const date = day ? new Date(currentYear, currentMonth, day) : null;
    // Use getEventsForCalendarDate for calendar bubbles (respects showOnCalendar setting)
    const events = date ? getEventsForCalendarDate(date) : [];
    const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
    const isSelected = day === selectedDate.getDate() && currentMonth === selectedDate.getMonth() && currentYear === selectedDate.getFullYear();
    // Day of week: 0 = Sunday, 1-5 = Mon-Fri (weekdays), 6 = Saturday
    const dayOfWeek = index % 7;
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    const commonProps = {
      day,
      isToday,
      isSelected,
      isWeekday,
      events,
      onPress: () => {
        if (day) {
          Haptics.selectionAsync();
          setSelectedDate(new Date(currentYear, currentMonth, day));
        }
      },
      themeColor,
      colors,
      heightMultiplier: displayHeightMultiplier,
    };

    switch (viewMode) {
      case "compact":
        return <CompactDayCell key={index} {...commonProps} />;
      case "stacked":
        return <StackedDayCell key={index} {...commonProps} />;
      case "details":
        return <DetailsDayCell key={index} {...commonProps} isDark={isDark} />;
      default:
        return <CompactDayCell key={index} {...commonProps} />;
    }
  };

  if (!session && !isInDegradedMode) {
    if (__DEV__) {
      console.log("[CalendarBoot] Rendering loading state - session not available yet");
    }
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-xl font-semibold mb-2" style={{ color: colors.text }}>
            Loading calendar...
          </Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  // [CalendarBoot] If in degraded mode, render calendar shell with banner
  if (isInDegradedMode && !session) {
    if (__DEV__) {
      console.log("[CalendarBoot] Rendering in degraded mode - session timeout exceeded");
    }
    // Continue to calendar render below - render UI anyway with placeholder data
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        {/* [CalendarBoot] Show banner in degraded mode */}
        {isInDegradedMode && !session && (
          <View className="bg-yellow-100 px-4 py-2 border-b" style={{ borderColor: colors.border }}>
            <Text className="text-sm font-semibold text-yellow-800">
              Still loading your profile—some info may be missing
            </Text>
          </View>
        )}
        <View className="px-5 pt-2 pb-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Text className="text-2xl font-sora-bold" style={{ color: themeColor }}>
              {MONTHS[currentMonth]}
            </Text>
            <Text className="text-2xl font-sora-bold ml-2" style={{ color: colors.text }}>
              {currentYear}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Pressable
              onPress={() => router.push("/create")}
              className="flex-row items-center px-4 py-2 rounded-full"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white font-semibold">Create</Text>
            </Pressable>
          </View>
        </View>

        {/* Month Navigation */}
        <View className="flex-row items-center justify-between mt-3">
          <Pressable onPress={goToPrevMonth} className="flex-row items-center p-2">
            <ChevronLeft size={20} color={themeColor} />
            <Text className="font-bold ml-1" style={{ color: themeColor, fontSize: 15 }}>
              {MONTHS[(currentMonth - 1 + 12) % 12].slice(0, 3)}
            </Text>
          </Pressable>

          {/* View Mode Selector - Calendar modes + separate List button */}
          <View className="flex-row items-center">
            {/* Calendar view modes (pinch-to-zoom) */}
            <View
              className="flex-row rounded-full p-1"
              style={{ backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" }}
            >
              {CALENDAR_VIEW_MODES.map((mode) => {
                const Icon = mode.icon;
                const isActive = !isListView && viewMode === mode.id;
                return (
                  <Pressable
                    key={mode.id}
                    onPress={() => {
                      setIsListView(false);
                      setViewModeManually(mode.id);
                    }}
                    className="px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: isActive ? (isDark ? "#3A3A3C" : "#fff") : "transparent",
                    }}
                  >
                    <Icon size={16} color={isActive ? themeColor : colors.textTertiary} />
                  </Pressable>
                );
              })}
            </View>

            {/* List view - separate button */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setIsListView(true);
              }}
              className="w-8 h-8 rounded-full items-center justify-center ml-2"
              style={{
                backgroundColor: isListView
                  ? (isDark ? "#3A3A3C" : "#fff")
                  : (isDark ? "#1C1C1E" : "#F2F2F7"),
              }}
            >
              <List size={16} color={isListView ? themeColor : colors.textTertiary} />
            </Pressable>
          </View>

          <Pressable onPress={goToNextMonth} className="flex-row items-center p-2">
            <Text className="font-bold mr-1" style={{ color: themeColor, fontSize: 15 }}>
              {MONTHS[(currentMonth + 1) % 12].slice(0, 3)}
            </Text>
            <ChevronRight size={20} color={themeColor} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        bounces={true}
      >
        {/* Previous month indicator - shown when scrolling up */}
        {showPrevMonthIndicator && (
          <Animated.View
            entering={FadeIn.duration(200)}
            className="items-center py-3 -mt-2"
          >
            <Text className="text-sm font-medium" style={{ color: themeColor }}>
              {prevMonthName}
            </Text>
          </Animated.View>
        )}

        {isListView ? (
          <ListView
            events={allEvents}
            currentMonth={currentMonth}
            currentYear={currentYear}
            themeColor={themeColor}
            colors={colors}
            isDark={isDark}
            userId={session?.user?.id}
            onColorChange={handleColorChange}
            onDelete={handleDeleteEvent}
          />
        ) : (
          <>
            {/* Calendar Grid with Pinch-to-Expand */}
            <GestureDetector gesture={pinchGesture}>
              <Animated.View className="px-3">
                {/* Day Labels */}
                <View className="flex-row mb-1">
                  {DAYS.map((day, idx) => (
                    <View key={idx} className="flex-1 items-center py-2">
                      <Text
                        className="text-xs font-medium"
                        style={{ color: idx === 0 || idx === 6 ? colors.textTertiary : colors.textSecondary }}
                      >
                        {day}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Grid with Week Separators */}
                <View>
                  {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIndex) => (
                    <View key={weekIndex}>
                      {/* Week separator line (not before first week) */}
                      {weekIndex > 0 && (
                        <View
                          style={{
                            height: 1,
                            backgroundColor: colors.border,
                            opacity: 0.4,
                            marginHorizontal: 4,
                          }}
                        />
                      )}
                      {/* Week row */}
                      <View className="flex-row">
                        {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
                          const index = weekIndex * 7 + dayIndex;
                          return (
                            <View key={index} style={{ width: "14.28%" }}>
                              {renderCell(day, index)}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>

                {/* Pinch hint */}
                <View className="items-center mt-2 mb-1">
                  <Text className="text-xs" style={{ color: colors.textTertiary }}>
                    Pinch to expand
                  </Text>
                </View>
              </Animated.View>
            </GestureDetector>

            {/* Selected Date Events */}
            <View className="px-5 mt-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                  {selectedDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/whos-free?date=${selectedDate.toISOString().split('T')[0]}` as any);
                    }}
                    className="flex-row items-center px-2 py-1 rounded-full"
                    style={{ backgroundColor: `${themeColor}15` }}
                  >
                    <Users size={12} color={themeColor} />
                    <Text className="text-xs font-medium ml-1" style={{ color: themeColor }}>
                      Free?
                    </Text>
                  </Pressable>
                  {selectedDateEvents.length > 0 && (
                    <View
                      className="px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${themeColor}20` }}
                    >
                      <Text className="text-xs font-medium" style={{ color: themeColor }}>
                        {selectedDateEvents.length} event{selectedDateEvents.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {selectedDateEvents.length === 0 ? (
                <View
                  className="rounded-2xl p-6 items-center"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: colors.textTertiary }}>No events on this day</Text>
                  <View className="flex-row items-center mt-3 gap-4">
                    <Pressable
                      onPress={() => router.push(`/create?date=${selectedDate.toISOString()}`)}
                      className="flex-row items-center"
                    >
                      <Plus size={16} color={themeColor} />
                      <Text className="font-medium ml-1" style={{ color: themeColor }}>
                        Create Event
                      </Text>
                    </Pressable>
                    <View style={{ width: 1, height: 16, backgroundColor: colors.border }} />
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/whos-free?date=${selectedDate.toISOString().split('T')[0]}` as any);
                      }}
                      className="flex-row items-center"
                    >
                      <Users size={16} color={themeColor} />
                      <Text className="font-medium ml-1" style={{ color: themeColor }}>
                        Who's Free?
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                selectedDateEvents.map((event, idx) => (
                  <Animated.View key={event.id} entering={FadeInDown.delay(idx * 50)}>
                    <EventListItem
                      event={event}
                      isAttending={event.isAttending}
                      isBirthday={event.isBirthday}
                      isWork={(event as any).isWork}
                      themeColor={themeColor}
                      colors={colors}
                      isDark={isDark}
                      isOwner={event.userId === session?.user?.id}
                      onColorChange={handleColorChange}
                      onDelete={handleDeleteEvent}
                    />
                  </Animated.View>
                ))
              )}
            </View>

            {/* Proposed Events Section (formerly Event Requests) */}
            {eventRequests.length > 0 && (
              <View className="px-5 mt-6">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Send size={18} color={themeColor} />
                    <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                      Proposed Events
                    </Text>
                    {pendingEventRequestCount > 0 && (
                      <View
                        className="ml-2 w-5 h-5 rounded-full items-center justify-center"
                        style={{ backgroundColor: "#FF3B30" }}
                      >
                        <Text className="text-xs text-white font-bold">
                          {pendingEventRequestCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/create-event-request" as any);
                    }}
                    className="flex-row items-center px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: `${themeColor}15` }}
                  >
                    <Plus size={14} color={themeColor} />
                    <Text className="text-sm font-medium ml-1" style={{ color: themeColor }}>
                      Propose
                    </Text>
                  </Pressable>
                </View>
                {eventRequests.slice(0, 5).map((request, idx) => {
                  const startDate = new Date(request.startTime);
                  const isCreator = request.creatorId === session?.user?.id;
                  const members = request.members ?? [];
                  const myResponse = members.find((m) => m.userId === session?.user?.id);
                  const needsResponse = !isCreator && myResponse?.status === "pending";
                  const acceptedCount = members.filter((m) => m.status === "accepted").length;
                  const totalMembers = members.length;

                  return (
                    <Animated.View key={request.id} entering={FadeInDown.delay(idx * 50)}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push(`/event-request/${request.id}` as any);
                        }}
                        className="rounded-xl p-4 mb-3"
                        style={{
                          backgroundColor: needsResponse ? `${themeColor}10` : colors.surface,
                          borderWidth: needsResponse ? 2 : 1,
                          borderColor: needsResponse ? themeColor : colors.border,
                        }}
                      >
                        <View className="flex-row items-start">
                          <View
                            className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                          >
                            <Text className="text-2xl">{request.emoji}</Text>
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center justify-between">
                              <Text className="font-semibold flex-1 mr-2" style={{ color: colors.text }} numberOfLines={1}>
                                {request.title}
                              </Text>
                              {needsResponse && (
                                <View
                                  className="px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: "#FF3B30" }}
                                >
                                  <Text className="text-xs text-white font-medium">RSVP</Text>
                                </View>
                              )}
                              {request.status === "confirmed" && (
                                <View
                                  className="px-2 py-0.5 rounded-full flex-row items-center"
                                  style={{ backgroundColor: "#22C55E20" }}
                                >
                                  <Check size={10} color="#22C55E" />
                                  <Text className="text-xs font-medium ml-1" style={{ color: "#22C55E" }}>
                                    Confirmed
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View className="flex-row items-center mt-1">
                              <Clock size={12} color={colors.textSecondary} />
                              <Text className="text-xs ml-1" style={{ color: colors.textSecondary }}>
                                {startDate.toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}{" "}
                                at{" "}
                                {startDate.toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </Text>
                            </View>
                            <View className="flex-row items-center mt-2">
                              <Users size={12} color={colors.textTertiary} />
                              <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>
                                {isCreator ? "You invited " : `${request.creator.name ?? "Someone"} + `}
                                {totalMembers} {totalMembers === 1 ? "friend" : "friends"}
                              </Text>
                              {request.status === "pending" && (
                                <Text className="text-xs ml-2" style={{ color: colors.textTertiary }}>
                                  • {acceptedCount}/{totalMembers} accepted
                                </Text>
                              )}
                            </View>
                          </View>
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}

                {eventRequests.length > 5 && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/event-requests" as any);
                    }}
                    className="py-2 items-center"
                  >
                    <Text className="text-sm font-medium" style={{ color: themeColor }}>
                      View all {eventRequests.length} requests
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Create Event Request CTA when no requests */}
            {eventRequests.length === 0 && (
              <View className="px-5 mt-6">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/create-event-request" as any);
                  }}
                  className="rounded-xl p-4 flex-row items-center"
                  style={{ backgroundColor: `${themeColor}10`, borderWidth: 1, borderColor: `${themeColor}30` }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: `${themeColor}20` }}
                  >
                    <Send size={20} color={themeColor} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold" style={{ color: themeColor }}>
                      Send Event Request
                    </Text>
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      Invite friends to an event - it's created when everyone accepts
                    </Text>
                  </View>
                </Pressable>
              </View>
            )}

            {/* Upcoming Birthdays Section - Collapsible */}
            <UpcomingBirthdaysSection
              upcomingBirthdays={upcomingBirthdays}
              colors={colors}
            />
          </>
        )}

        {/* Next month indicator - shown when scrolling down */}
        {showNextMonthIndicator && (
          <Animated.View
            entering={FadeIn.duration(200)}
            className="items-center py-3"
          >
            <Text className="text-sm font-medium" style={{ color: themeColor }}>
              {nextMonthName}
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      <BottomNavigation />

      {/* First Login Guide Modal */}
      <Modal
        visible={showFirstLoginGuide}
        transparent
        animationType="fade"
        onRequestClose={handleDismissGuide}
      >
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <Animated.View
            entering={FadeIn.duration(300)}
            className="mx-6 rounded-3xl overflow-hidden"
            style={{
              backgroundColor: colors.surface,
              maxWidth: 340,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
            }}
          >
            {/* Header with icon */}
            <View
              className="px-6 pt-8 pb-4 items-center"
              style={{ backgroundColor: `${themeColor}15` }}
            >
              <View
                className="w-16 h-16 rounded-full items-center justify-center mb-4"
                style={{ backgroundColor: themeColor }}
              >
                <BookOpen size={32} color="#fff" />
              </View>
              <Text className="text-xl font-bold text-center" style={{ color: colors.text }}>
                Welcome to Open Invite!
              </Text>
              <Text className="text-sm text-center mt-2" style={{ color: colors.textSecondary }}>
                Take a quick tour to learn how to share plans with friends
              </Text>
            </View>

            {/* Content */}
            <View className="px-6 py-5">
              <View className="flex-row items-center mb-3">
                <Text className="text-2xl mr-3">📅</Text>
                <Text style={{ color: colors.text }} className="flex-1">See friends' plans on your calendar</Text>
              </View>
              <View className="flex-row items-center mb-3">
                <Text className="text-2xl mr-3">🎉</Text>
                <Text style={{ color: colors.text }} className="flex-1">Create and share events easily</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-2xl mr-3">👥</Text>
                <Text style={{ color: colors.text }} className="flex-1">Find who's free to hang out</Text>
              </View>
            </View>

            {/* Buttons */}
            <View className="px-6 pb-6">
              <Pressable
                onPress={handleOpenGuide}
                className="py-4 rounded-xl items-center"
                style={{ backgroundColor: themeColor }}
              >
                <Text className="text-white font-semibold text-base">Get Started Guide</Text>
              </Pressable>
              <Pressable
                onPress={handleDismissGuide}
                className="py-3 mt-2 items-center"
              >
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  Maybe later
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
