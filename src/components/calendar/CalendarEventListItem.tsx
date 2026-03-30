import React from "react";
import { View, Text, Pressable, Share, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ContextMenu from "zeego/context-menu";
import * as ExpoCalendar from "expo-calendar";

import { ConfirmModal } from "@/components/ConfirmModal";
import { getEventPalette, assertGreyPaletteInvariant } from "@/lib/eventPalette";
import { getEventDisplayFields } from "@/lib/eventVisibility";
import { EventPhotoEmoji } from "@/components/EventPhotoEmoji";
import { EventVisibilityBadge } from "@/components/EventVisibilityBadge";
import { ChevronRight, Clock, MapPin } from "@/ui/icons";
import { buildEventSharePayload } from "@/lib/shareSSOT";
import { safeToast } from "@/lib/safeToast";
import { devLog, devError } from "@/lib/devLog";
import { DARK_COLORS } from "@/lib/ThemeContext";
import { STATUS } from "@/ui/tokens";
import { getTextColorForBackground } from "@/components/calendar/CalendarDayCells";
import { type Event } from "@/shared/contracts";

// Event color options for color picker
export const EVENT_COLORS = [
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

// Helper to format date for calendar URLs
export const formatDateForCalendar = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
};

// Helper to share event via native share sheet — uses shareSSOT for branded domain
export const shareEventFromCalendar = async (event: Event) => {
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

    const payload = buildEventSharePayload({
      id: event.id,
      title: event.title,
      emoji: event.emoji,
      dateStr,
      timeStr,
      location: event.location,
      description: event.description,
    });

    await Share.share({
      message: payload.message,
      title: event.title,
      url: payload.url,
    });
  } catch (error) {
    devError("Error sharing event:", error);
  }
};

// Helper to add event to device calendar
export const addEventToDeviceCalendar = async (event: Event) => {
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
    devError("Error adding to calendar:", error);
    safeToast.error("Oops", "That didn't go through. Please try again.");
  }
};

// Event List Item for all views
export function EventListItem({
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
  onToggleBusy,
  isOwner,
  colorOverride,
}: {
  event: Event;
  isAttending?: boolean;
  isBirthday?: boolean;
  isWork?: boolean;
  themeColor: string;
  colors: typeof DARK_COLORS;
  compact?: boolean;
  isDark: boolean;
  onColorChange?: (eventId: string, color: string) => void;
  onDelete?: (eventId: string) => void;
  onToggleBusy?: (eventId: string, isBusy: boolean) => void;
  isOwner?: boolean;
  colorOverride?: string;
}) {
  const router = useRouter();
  // Track context menu state to prevent navigation when menu was just opened
  const contextMenuOpenedRef = React.useRef(false);
  const navigationBlockedUntilRef = React.useRef(0);
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;

  // P0 PRIVACY: Use centralized masking logic for busy/private events
  // Note: isOwner prop determines ownership, event.isOwn may not exist on Event type
  const viewerIsOwner = isOwner ?? false;
  const { displayTitle, displayEmoji, displayLocation, isMasked: isNonVisible } = getEventDisplayFields({
    title: event.title,
    emoji: event.emoji,
    location: event.location,
    isBusy: event.isBusy || isWork,
    isWork: isWork,
    isOwn: viewerIsOwner,
  }, viewerIsOwner);

  // INVARIANT: Use single source of truth for event palette (busy/work = grey)
  // Apply user's color override if set
  const palette = getEventPalette({ ...event, isWork }, themeColor, colorOverride);
  const eventColor = isBirthday ? STATUS.birthday.fg : palette.bar;
  const bgColor = isBirthday ? STATUS.birthday.bgSoft : palette.bg;
  const textColor = getTextColorForBackground(eventColor, isDark);

  // DEV assertion: verify grey palette invariant
  if (__DEV__) {
    assertGreyPaletteInvariant({ ...event, isWork }, palette, "EventListItem");
  }

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
    devLog("[Calendar] Color selected:", color, "for event:", event.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onColorChange?.(event.id, color);
  };

  const handleToggleBusy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggleBusy?.(event.id, !event.isBusy);
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
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{ opacity: isWork ? 0.7 : 1 }}
        >
          <View
            className="w-1 h-full rounded-full mr-3"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: eventColor, minHeight: 36 }}
          />
          <View className="flex-1">
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="font-semibold" style={{ color: colors.text }} numberOfLines={1}>
              {isWork ? `💼 ${displayTitle}` : displayTitle}
            </Text>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
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
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        style={{
          backgroundColor: bgColor,
          borderLeftWidth: 4,
          borderLeftColor: eventColor,
          opacity: isWork ? 0.8 : 1,
        }}
      >
        <View className="flex-1">
          <View className="flex-row items-center">
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <View style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
              <EventPhotoEmoji
                photoUrl={!isNonVisible && !event.isBusy && event.visibility !== "private" ? event.eventPhotoUrl : undefined}
                emoji={displayEmoji}
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                emojiStyle={{ fontSize: 18 }}
              />
            </View>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="font-semibold flex-1" style={{ color: colors.text }} numberOfLines={1}>
              {displayTitle}
            </Text>
            {isWork && (
              <View
                className="px-2 py-0.5 rounded-full ml-2"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ backgroundColor: eventColor + "30" }}
              >
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="text-xs font-medium" style={{ color: eventColor }}>
                  Busy
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row items-center mt-1">
            <Clock size={12} color={textColor} />
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-xs ml-1" style={{ color: textColor }}>
              {timeLabel}
            </Text>
          </View>
          {isBirthday && event.description && (
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
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
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        style={{ backgroundColor: eventColor, minHeight: 36 }}
      />
      <View className="flex-1">
        <View className="flex-row items-center">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="font-semibold flex-1" style={{ color: colors.text }} numberOfLines={1}>
            {displayTitle}
          </Text>
          <EventVisibilityBadge visibility={event.visibility} circleId={event.circleId} circleName={event.circleName} isBusy={event.isBusy} eventId={event.id} surface="calendar_compact" isDark={isDark} />
        </View>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text className="text-xs" style={{ color: colors.textSecondary }}>
          {timeLabel}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </View>
  ) : (
    <View
      className="flex-row items-center rounded-xl p-3 mb-2"
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{
        backgroundColor: bgColor,
        borderLeftWidth: 4,
        borderLeftColor: eventColor,
      }}
    >
      <View className="flex-1">
        <View className="flex-row items-center">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <View style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
            <EventPhotoEmoji
              photoUrl={!isNonVisible && !event.isBusy && event.visibility !== "private" ? event.eventPhotoUrl : undefined}
              emoji={displayEmoji}
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              emojiStyle={{ fontSize: 18 }}
            />
          </View>
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="font-semibold flex-1" style={{ color: colors.text }} numberOfLines={1}>
            {displayTitle}
          </Text>
          <EventVisibilityBadge visibility={event.visibility} circleId={event.circleId} circleName={event.circleName} isBusy={event.isBusy} eventId={event.id} surface="calendar_full" isDark={isDark} />
        </View>
        <View className="flex-row items-center mt-1">
          <Clock size={12} color={textColor} />
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="text-xs ml-1" style={{ color: textColor }}>
            {timeLabel}
          </Text>
          {displayLocation && (
            <>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <MapPin size={12} color={colors.textTertiary} style={{ marginLeft: 12 }} />
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-xs ml-1 flex-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {displayLocation}
              </Text>
            </>
          )}
        </View>
        {isAttending && event.user && (
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
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
          <Pressable testID="calendar-event-open" onPressIn={handlePressIn} onPress={handlePress}>
            {cardContent}
          </Pressable>
        </ContextMenu.Trigger>
        <ContextMenu.Content>
          {/* Share */}
          <ContextMenu.Item key="share" onSelect={handleShare}>
            <ContextMenu.ItemTitle>Share Event</ContextMenu.ItemTitle>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <ContextMenu.ItemIcon ios={{ name: "paperplane" }} />
          </ContextMenu.Item>

        {/* Sync to Calendar */}
        <ContextMenu.Item key="sync" onSelect={handleSync}>
          <ContextMenu.ItemTitle>Sync to Calendar</ContextMenu.ItemTitle>
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <ContextMenu.ItemIcon ios={{ name: "calendar.badge.plus" }} />
        </ContextMenu.Item>

        {/* Change Color - Available on ALL events (viewer-local cosmetic only, no backend write) */}
        {onColorChange && (
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger key="color-trigger">
              <ContextMenu.ItemTitle>Change Color</ContextMenu.ItemTitle>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <ContextMenu.ItemIcon ios={{ name: "paintpalette" }} />
            </ContextMenu.SubTrigger>
            <ContextMenu.SubContent>
              {/* INVARIANT_ALLOW_SMALL_MAP */}
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

        {/* Toggle Busy - Only if user is owner */}
        {isOwner && onToggleBusy && (
          <ContextMenu.Item key="busy" onSelect={handleToggleBusy}>
            <ContextMenu.ItemTitle>{event.isBusy ? "Unmark as Busy" : "Mark as Busy"}</ContextMenu.ItemTitle>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <ContextMenu.ItemIcon ios={{ name: event.isBusy ? "calendar" : "briefcase" }} />
          </ContextMenu.Item>
        )}

        {/* Delete - Only if user is owner */}
        {isOwner && onDelete && (
          <ContextMenu.Item key="delete" onSelect={handleDelete} destructive>
            <ContextMenu.ItemTitle>Delete Event</ContextMenu.ItemTitle>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
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
