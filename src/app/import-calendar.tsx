import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  AppState,
  type AppStateStatus,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  Calendar,
  ChevronLeft,
  Check,
  RefreshCw,
  CalendarDays,
  Clock,
  MapPin,
  Upload,
  Users,
  Compass,
  Lock,
  X,
  CheckCircle,
  Settings,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/lib/ThemeContext";
import {
  getDeviceCalendars,
  getDeviceEvents,
  requestCalendarPermissions,
  checkCalendarPermission,
  openAppSettings,
  isOpenInviteExportedEvent,
  type DeviceCalendar,
  type CalendarEvent,
  type CalendarPermissionResult,
} from "@/lib/calendarSync";
import { api } from "@/lib/api";
import { safeToast } from "@/lib/safeToast";

// Types for calendar import
interface ImportedCalendarEvent {
  deviceEventId: string;
  title: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  calendarId: string;
  calendarName?: string;
}

interface ImportCalendarEventsRequest {
  events: ImportedCalendarEvent[];
  defaultVisibility?: "all_friends" | "specific_groups" | "private";
}

interface ImportCalendarEventsResponse {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  events: unknown[];
}

interface ImportedEvent {
  id: string;
  deviceCalendarId: string | null;
  [key: string]: unknown;
}

interface GetImportedEventsResponse {
  events: ImportedEvent[];
}

type VisibilityOption = "all_friends" | "specific_groups" | "private";

const VISIBILITY_OPTIONS: Array<{
  value: VisibilityOption;
  label: string;
  description: string;
  icon: typeof Compass;
}> = [
  {
    value: "all_friends",
    label: "Open to Friends",
    description: "All friends can see this event",
    icon: Compass,
  },
  {
    value: "specific_groups",
    label: "Specific Groups",
    description: "Only selected groups can see",
    icon: Users,
  },
  {
    value: "private",
    label: "Private",
    description: "Only you can see this event",
    icon: Lock,
  },
];

export default function ImportCalendarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string; eventId?: string }>();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  const [permissionResult, setPermissionResult] = useState<CalendarPermissionResult | null>(null);
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [defaultVisibility, setDefaultVisibility] = useState<VisibilityOption>("all_friends");
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
  } | null>(null);

  // Track previous permission status to avoid re-rendering loops
  const prevPermissionStatusRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Fetch imported events from backend
  const { data: importedEventsData, refetch: refetchImported } = useQuery({
    queryKey: ["imported-events"],
    queryFn: () => api.get<GetImportedEventsResponse>("/api/events/imported"),
    staleTime: 30000,
  });

  // Import events mutation
  const importMutation = useMutation({
    mutationFn: (data: ImportCalendarEventsRequest) =>
      api.post<ImportCalendarEventsResponse>("/api/events/import", data),
    onSuccess: (data) => {
      setSyncResult({
        imported: data.imported,
        updated: data.updated,
        skipped: data.skipped,
      });
      safeToast.success(
        `Synced ${data.imported + data.updated} events to Open Invite`
      );
      // Invalidate events queries
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["imported-events"] });
      refetchImported();
      // Clear selection
      setSelectedEvents(new Set());
    },
    onError: (error: Error) => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Check permission and load calendars on mount
  useEffect(() => {
    checkPermissionAndLoad();
  }, []);

  // AppState listener: re-check permission when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      // If app is becoming active (user returned from Settings)
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // Re-check permission without showing loading spinner
        recheckPermissionQuietly();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Focus effect: re-check permission when screen gains focus
  useFocusEffect(
    useCallback(() => {
      // Only re-check if we previously had no permission
      // This handles the case when user navigates back from iOS Settings
      if (permissionResult && !permissionResult.granted) {
        recheckPermissionQuietly();
      }
    }, [permissionResult])
  );

  const checkPermissionAndLoad = async () => {
    setIsLoading(true);
    try {
      const result = await checkCalendarPermission();

      // Only update state if status changed (prevents infinite loops)
      if (result.status !== prevPermissionStatusRef.current) {
        prevPermissionStatusRef.current = result.status;
        setPermissionResult(result);

        if (result.granted) {
          await loadCalendarsData();
          // If permission was just granted and we have a returnTo, navigate back
          handlePermissionGrantedNavigation();
        }
      }
    } catch (error) {
      console.error("Failed to check permission:", error);
      setPermissionResult({
        granted: false,
        status: "undetermined",
        canAskAgain: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const recheckPermissionQuietly = async () => {
    if (isCheckingPermission) return; // Prevent concurrent checks

    setIsCheckingPermission(true);
    try {
      const result = await checkCalendarPermission();

      // Only update if status actually changed
      if (result.status !== prevPermissionStatusRef.current) {
        prevPermissionStatusRef.current = result.status;
        setPermissionResult(result);

        if (result.granted) {
          await loadCalendarsData();
          handlePermissionGrantedNavigation();
        }
      }
    } catch (error) {
      console.error("Failed to recheck permission:", error);
    } finally {
      setIsCheckingPermission(false);
    }
  };

  const loadCalendarsData = async () => {
    const deviceCalendars = await getDeviceCalendars();
    setCalendars(deviceCalendars);

    // Pre-select primary or iCloud calendars
    const preSelected = new Set<string>();
    deviceCalendars.forEach((cal) => {
      if (cal.isPrimary || cal.source === "iCloud") {
        preSelected.add(cal.id);
      }
    });
    if (preSelected.size === 0 && deviceCalendars.length > 0) {
      preSelected.add(deviceCalendars[0].id);
    }
    setSelectedCalendars(preSelected);
  };

  const handlePermissionGrantedNavigation = () => {
    // If we have a returnTo param, navigate back to that destination
    if (params.returnTo) {
      if (params.returnTo === "eventDetails" && params.eventId) {
        router.replace(`/event/${params.eventId}` as any);
      } else {
        router.back();
      }
    }
  };

  const handleRequestPermission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const granted = await requestCalendarPermissions();

    // Update permission result after request
    const result = await checkCalendarPermission();
    prevPermissionStatusRef.current = result.status;
    setPermissionResult(result);

    if (granted) {
      await loadCalendarsData();
      handlePermissionGrantedNavigation();
    }
  };

  const handleOpenSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openAppSettings();
    // Permission will be re-checked when user returns via AppState listener
  };

  const toggleCalendarSelection = (calendarId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCalendars((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(calendarId)) {
        newSet.delete(calendarId);
      } else {
        newSet.add(calendarId);
      }
      return newSet;
    });
  };

  const toggleEventSelection = (eventId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedEvents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const selectAllEvents = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedEvents.size === events.length) {
      setSelectedEvents(new Set());
    } else {
      setSelectedEvents(new Set(events.map((e) => e.id)));
    }
  };

  const loadEvents = async () => {
    if (selectedCalendars.size === 0) {
      safeToast.error("Please select at least one calendar");
      return;
    }

    setIsLoadingEvents(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Get events for the next 30 days
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);

      const calendarEvents = await getDeviceEvents(
        Array.from(selectedCalendars),
        startDate,
        endDate
      );

      // Filter out events that were exported from Open Invite (prevent loopback duplicates)
      const filteredEvents = calendarEvents.filter(
        (event) => !isOpenInviteExportedEvent(event.notes)
      );

      // Sort by start date
      filteredEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

      setEvents(filteredEvents);
      // Pre-select all events by default
      setSelectedEvents(new Set(filteredEvents.map((e) => e.id)));
      setShowEvents(true);
      setSyncResult(null);
    } catch (error) {
      console.error("Failed to load events:", error);
      safeToast.error("Oops", "Couldn't refresh right now. Try again in a moment.");
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleSyncEvents = () => {
    if (selectedEvents.size === 0) {
      safeToast.error("Please select at least one event to sync");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Filter selected events and prepare for import
    const eventsToImport = events
      .filter((e) => selectedEvents.has(e.id))
      .map((e) => ({
        deviceEventId: e.id,
        title: e.title,
        startTime: e.startDate.toISOString(),
        endTime: e.endDate?.toISOString() ?? null,
        location: e.location ?? null,
        notes: e.notes ?? null,
        calendarId: e.calendarId,
        calendarName: e.calendarTitle,
      }));

    importMutation.mutate({
      events: eventsToImport,
      defaultVisibility,
    });
  };

  const formatEventDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    }
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatEventTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Group events by date
  const groupedEvents = events.reduce((groups, event) => {
    const dateKey = event.startDate.toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(event);
    return groups;
  }, {} as Record<string, CalendarEvent[]>);

  // Check if an event is already imported
  const isEventImported = useCallback(
    (deviceEventId: string) => {
      return importedEventsData?.events?.some(
        (e) => e.deviceCalendarId === deviceEventId
      );
    },
    [importedEventsData]
  );

  const currentVisibilityOption = VISIBILITY_OPTIONS.find(
    (opt) => opt.value === defaultVisibility
  )!;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor} />
          <Text className="mt-4" style={{ color: colors.textSecondary }}>
            Loading calendars...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xl font-bold" style={{ color: colors.text }}>
            Sync Calendar
          </Text>
          <Text className="text-sm" style={{ color: colors.textSecondary }}>
            Import events to share with friends
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {!permissionResult || !permissionResult.granted ? (
          // Permission Request Screen - Optional Feature
          <Animated.View entering={FadeInDown.springify()}>
            <View
              className="rounded-2xl p-6 items-center"
              style={{ backgroundColor: colors.surface }}
            >
              <View
                className="w-20 h-20 rounded-full items-center justify-center mb-4"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Calendar size={40} color={themeColor} />
              </View>
              <Text
                className="text-xl font-bold text-center mb-2"
                style={{ color: colors.text }}
              >
                Connect Your Calendar
              </Text>
              <Text
                className="text-center mb-6"
                style={{ color: colors.textSecondary }}
              >
                Automatically share your calendar events with friends. You can always add events manually.
              </Text>

              {permissionResult && !permissionResult.canAskAgain ? (
                // Permission permanently denied - show Open Settings button
                <>
                  <Pressable
                    onPress={handleOpenSettings}
                    className="w-full py-4 rounded-xl items-center mb-3"
                    style={{ backgroundColor: themeColor }}
                  >
                    <View className="flex-row items-center">
                      <Settings size={18} color="#fff" />
                      <Text className="text-white font-semibold ml-2">Open Settings</Text>
                    </View>
                  </Pressable>
                  <Text
                    className="text-xs text-center mb-4"
                    style={{ color: colors.textTertiary }}
                  >
                    Enable in Settings → Open Invite → Calendars
                  </Text>
                  <Text
                    className="text-xs text-center"
                    style={{ color: colors.textTertiary }}
                  >
                    This feature is optional — you can still use Open Invite without it.
                  </Text>
                </>
              ) : (
                // Can still request permission
                <>
                  <Pressable
                    onPress={handleRequestPermission}
                    className="w-full py-4 rounded-xl items-center mb-3"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white font-semibold">Enable Calendar Access</Text>
                  </Pressable>
                  <Text
                    className="text-xs text-center"
                    style={{ color: colors.textTertiary }}
                  >
                    Optional — you can still create events manually without calendar access.
                  </Text>
                </>
              )}
            </View>
          </Animated.View>
        ) : (
          <>
            {/* Sync Result Banner */}
            {syncResult && (
              <Animated.View entering={FadeIn} exiting={FadeOut} className="mb-4">
                <View
                  className="rounded-xl p-4 flex-row items-center"
                  style={{ backgroundColor: `${themeColor}20` }}
                >
                  <CheckCircle size={24} color={themeColor} />
                  <View className="ml-3 flex-1">
                    <Text className="font-semibold" style={{ color: colors.text }}>
                      Sync Complete
                    </Text>
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      {syncResult.imported} imported, {syncResult.updated} updated
                      {syncResult.skipped > 0 && `, ${syncResult.skipped} skipped`}
                    </Text>
                  </View>
                  <Pressable onPress={() => setSyncResult(null)}>
                    <X size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* Default Visibility Selector */}
            <Animated.View entering={FadeInDown.springify()} className="mb-4">
              <Text
                className="text-sm font-medium mb-2 ml-2"
                style={{ color: colors.textSecondary }}
              >
                DEFAULT VISIBILITY
              </Text>
              <Pressable
                onPress={() => setShowVisibilityModal(true)}
                className="rounded-xl p-4 flex-row items-center"
                style={{ backgroundColor: colors.surface }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${themeColor}20` }}
                >
                  <currentVisibilityOption.icon size={20} color={themeColor} />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="font-medium" style={{ color: colors.text }}>
                    {currentVisibilityOption.label}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.textSecondary }}>
                    {currentVisibilityOption.description}
                  </Text>
                </View>
                <ChevronLeft
                  size={20}
                  color={colors.textSecondary}
                  style={{ transform: [{ rotate: "180deg" }] }}
                />
              </Pressable>
            </Animated.View>

            {/* Calendar Selection */}
            <Animated.View entering={FadeInDown.delay(50).springify()}>
              <Text
                className="text-sm font-medium mb-2 ml-2"
                style={{ color: colors.textSecondary }}
              >
                SELECT CALENDARS
              </Text>
              <View
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.surface }}
              >
                {calendars.length === 0 ? (
                  <View className="p-6 items-center">
                    <Text style={{ color: colors.textSecondary }}>
                      No calendars found on your device
                    </Text>
                  </View>
                ) : (
                  calendars.map((calendar, index) => (
                    <Pressable
                      key={calendar.id}
                      onPress={() => toggleCalendarSelection(calendar.id)}
                      className="flex-row items-center p-4"
                      style={{
                        borderBottomWidth: index < calendars.length - 1 ? 1 : 0,
                        borderBottomColor: colors.separator,
                      }}
                    >
                      <View
                        className="w-4 h-4 rounded-full mr-3"
                        style={{ backgroundColor: calendar.color }}
                      />
                      <View className="flex-1">
                        <Text className="font-medium" style={{ color: colors.text }}>
                          {calendar.title}
                        </Text>
                        <Text className="text-xs" style={{ color: colors.textTertiary }}>
                          {calendar.source}
                          {calendar.isPrimary && " • Primary"}
                        </Text>
                      </View>
                      <View
                        className="w-6 h-6 rounded-md items-center justify-center"
                        style={{
                          backgroundColor: selectedCalendars.has(calendar.id)
                            ? themeColor
                            : isDark
                            ? "#2C2C2E"
                            : "#E5E7EB",
                        }}
                      >
                        {selectedCalendars.has(calendar.id) && (
                          <Check size={14} color="#fff" />
                        )}
                      </View>
                    </Pressable>
                  ))
                )}
              </View>
            </Animated.View>

            {/* Load Events Button */}
            <Animated.View entering={FadeInDown.delay(100).springify()} className="mt-4">
              <Pressable
                onPress={loadEvents}
                disabled={isLoadingEvents || selectedCalendars.size === 0}
                className="py-4 rounded-xl flex-row items-center justify-center"
                style={{
                  backgroundColor:
                    selectedCalendars.size === 0
                      ? isDark
                        ? "#2C2C2E"
                        : "#E5E7EB"
                      : themeColor,
                }}
              >
                {isLoadingEvents ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <RefreshCw
                      size={18}
                      color={selectedCalendars.size === 0 ? colors.textTertiary : "#fff"}
                    />
                    <Text
                      className="font-semibold ml-2"
                      style={{
                        color: selectedCalendars.size === 0 ? colors.textTertiary : "#fff",
                      }}
                    >
                      Load Events
                    </Text>
                  </>
                )}
              </Pressable>
            </Animated.View>

            {/* Events List */}
            {showEvents && (
              <Animated.View entering={FadeIn} className="mt-6">
                <View className="flex-row items-center justify-between mb-3">
                  <Text
                    className="text-sm font-medium ml-2"
                    style={{ color: colors.textSecondary }}
                  >
                    SELECT EVENTS ({selectedEvents.size}/{events.length})
                  </Text>
                  <Pressable onPress={selectAllEvents} className="px-3 py-1">
                    <Text className="text-sm font-medium" style={{ color: themeColor }}>
                      {selectedEvents.size === events.length ? "Deselect All" : "Select All"}
                    </Text>
                  </Pressable>
                </View>

                {events.length === 0 ? (
                  <View
                    className="rounded-2xl p-6 items-center"
                    style={{ backgroundColor: colors.surface }}
                  >
                    <CalendarDays size={32} color={colors.textTertiary} />
                    <Text
                      className="mt-3 text-center"
                      style={{ color: colors.textSecondary }}
                    >
                      No events found in the next 30 days
                    </Text>
                  </View>
                ) : (
                  Object.entries(groupedEvents).map(([dateKey, dayEvents], groupIndex) => (
                    <Animated.View
                      key={dateKey}
                      entering={FadeInDown.delay(groupIndex * 50).springify()}
                      className="mb-4"
                    >
                      <Text
                        className="text-sm font-semibold mb-2 ml-2"
                        style={{ color: themeColor }}
                      >
                        {formatEventDate(new Date(dateKey))}
                      </Text>
                      <View
                        className="rounded-2xl overflow-hidden"
                        style={{ backgroundColor: colors.surface }}
                      >
                        {dayEvents.map((event, index) => {
                          const alreadyImported = isEventImported(event.id);
                          const isSelected = selectedEvents.has(event.id);

                          return (
                            <Pressable
                              key={event.id}
                              onPress={() => toggleEventSelection(event.id)}
                              className="p-4"
                              style={{
                                borderBottomWidth: index < dayEvents.length - 1 ? 1 : 0,
                                borderBottomColor: colors.separator,
                                opacity: alreadyImported ? 0.6 : 1,
                              }}
                            >
                              <View className="flex-row items-start">
                                <View
                                  className="w-6 h-6 rounded-md items-center justify-center mr-3 mt-0.5"
                                  style={{
                                    backgroundColor: isSelected
                                      ? themeColor
                                      : isDark
                                      ? "#2C2C2E"
                                      : "#E5E7EB",
                                  }}
                                >
                                  {isSelected && <Check size={14} color="#fff" />}
                                </View>
                                <View
                                  className="w-1 rounded-full mr-3"
                                  style={{
                                    backgroundColor: event.calendarColor,
                                    height: 40,
                                  }}
                                />
                                <View className="flex-1">
                                  <View className="flex-row items-center">
                                    <Text
                                      className="font-semibold flex-1"
                                      style={{ color: colors.text }}
                                      numberOfLines={1}
                                    >
                                      {event.title}
                                    </Text>
                                    {alreadyImported && (
                                      <View
                                        className="ml-2 px-2 py-0.5 rounded-full"
                                        style={{ backgroundColor: `${themeColor}20` }}
                                      >
                                        <Text
                                          className="text-xs"
                                          style={{ color: themeColor }}
                                        >
                                          Synced
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                  <View className="flex-row items-center mt-1">
                                    <Clock size={12} color={colors.textTertiary} />
                                    <Text
                                      className="text-xs ml-1"
                                      style={{ color: colors.textSecondary }}
                                    >
                                      {formatEventTime(event.startDate)}
                                      {event.endDate &&
                                        ` - ${formatEventTime(event.endDate)}`}
                                    </Text>
                                  </View>
                                  {event.location && (
                                    <View className="flex-row items-center mt-1">
                                      <MapPin size={12} color={colors.textTertiary} />
                                      <Text
                                        className="text-xs ml-1 flex-1"
                                        style={{ color: colors.textSecondary }}
                                        numberOfLines={1}
                                      >
                                        {event.location}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Animated.View>
                  ))
                )}
              </Animated.View>
            )}

            {/* Info Note */}
            <Animated.View entering={FadeInDown.delay(150).springify()} className="mt-4">
              <View
                className="rounded-xl p-4"
                style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
              >
                <Text
                  className="text-xs leading-5 text-center"
                  style={{ color: colors.textSecondary }}
                >
                  Synced events will appear on your Open Invite calendar and be visible to friends based on your visibility settings. You can change visibility for each event later.
                </Text>
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* Floating Sync Button */}
      {showEvents && selectedEvents.size > 0 && (
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut}
          className="absolute bottom-6 left-4 right-4"
        >
          <Pressable
            onPress={handleSyncEvents}
            disabled={importMutation.isPending}
            className="py-4 rounded-2xl flex-row items-center justify-center shadow-lg"
            style={{ backgroundColor: themeColor }}
          >
            {importMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Upload size={20} color="#fff" />
                <Text className="text-white font-bold ml-2 text-lg">
                  Sync {selectedEvents.size} Event{selectedEvents.size !== 1 ? "s" : ""}
                </Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      )}

      {/* Visibility Selection Modal */}
      <Modal
        visible={showVisibilityModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowVisibilityModal(false)}
      >
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          <SafeAreaView edges={["top"]} className="flex-1">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between px-4 py-3 border-b" style={{ borderColor: colors.separator }}>
              <Pressable onPress={() => setShowVisibilityModal(false)}>
                <Text style={{ color: themeColor }}>Cancel</Text>
              </Pressable>
              <Text className="font-semibold text-lg" style={{ color: colors.text }}>
                Default Visibility
              </Text>
              <Pressable onPress={() => setShowVisibilityModal(false)}>
                <Text className="font-semibold" style={{ color: themeColor }}>
                  Done
                </Text>
              </Pressable>
            </View>

            <ScrollView className="flex-1 px-4 pt-4">
              <Text className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                Choose the default visibility for imported events. You can change this for individual events later.
              </Text>

              <View
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.surface }}
              >
                {VISIBILITY_OPTIONS.map((option, index) => (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDefaultVisibility(option.value);
                    }}
                    className="flex-row items-center p-4"
                    style={{
                      borderBottomWidth: index < VISIBILITY_OPTIONS.length - 1 ? 1 : 0,
                      borderBottomColor: colors.separator,
                    }}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center"
                      style={{
                        backgroundColor:
                          defaultVisibility === option.value
                            ? `${themeColor}20`
                            : isDark
                            ? "#2C2C2E"
                            : "#E5E7EB",
                      }}
                    >
                      <option.icon
                        size={20}
                        color={
                          defaultVisibility === option.value
                            ? themeColor
                            : colors.textSecondary
                        }
                      />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="font-medium" style={{ color: colors.text }}>
                        {option.label}
                      </Text>
                      <Text className="text-xs" style={{ color: colors.textSecondary }}>
                        {option.description}
                      </Text>
                    </View>
                    {defaultVisibility === option.value && (
                      <Check size={20} color={themeColor} />
                    )}
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
