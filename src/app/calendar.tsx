import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Modal, Share, Linking, Platform, TextInput, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { useLiveRefreshContract } from "@/lib/useLiveRefreshContract";
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
  UserPlus,
  Send,
  Check,
  X,
  BookOpen,
  Cake,
  CalendarPlus,
  Trash2,
  Palette,
  Briefcase,
  CalendarDays,
} from "@/ui/icons";
import Animated, { FadeIn, FadeInDown, FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight, useSharedValue, withSpring, runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ContextMenu from "zeego/context-menu";
import * as ExpoCalendar from "expo-calendar";

import { AppHeader, HEADER_TITLE_SIZE } from "@/components/AppHeader";
import BottomNavigation from "@/components/BottomNavigation";
import { HelpSheet, HELP_SHEETS } from "@/components/HelpSheet";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useStickyLoadingCombined } from "@/lib/useStickyLoading";
import { useLoadedOnce } from "@/lib/loadingInvariant";
import { isEmailGateActive, guardEmailVerification } from "@/lib/emailVerificationGate";
import { api } from "@/lib/api";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { buildEventSharePayload } from "@/lib/shareSSOT";
import { useTheme, DARK_COLORS, TILE_SHADOW } from "@/lib/ThemeContext";
import { TAB_BOTTOM_PADDING } from "@/lib/layoutSpacing";
import { useLocalEvents, isLocalEvent } from "@/lib/offlineStore";
import { loadGuidanceState, shouldShowEmptyGuidanceSync, setGuidanceUserId } from "@/lib/firstSessionGuidance";
import { getEventPalette, assertGreyPaletteInvariant } from "@/lib/eventPalette";
import { getEventDisplayFields } from "@/lib/eventVisibility";
import { useEventColorOverrides } from "@/hooks/useEventColorOverrides";
import { WelcomeModal, hasWelcomeModalBeenShown } from "@/components/WelcomeModal";
import {
  checkCalendarPermission,
  getDeviceCalendars,
  getDeviceEvents,
  hasCalendarPermissions,
  isOpenInviteExportedEvent,
} from "@/lib/calendarSync";
import { type GetEventsResponse, type Event, type GetFriendBirthdaysResponse, type FriendBirthday, type GetEventRequestsResponse, type EventRequest, type GetCalendarEventsResponse, type GetFriendsResponse } from "@/shared/contracts";
import { eventKeys, invalidateEventKeys, getInvalidateAfterEventDelete } from "@/lib/eventQueryKeys";
import { Button } from "@/ui/Button";
import { EventPhotoEmoji } from "@/components/EventPhotoEmoji";
import { EventVisibilityBadge } from "@/components/EventVisibilityBadge";
import { Chip } from "@/ui/Chip";
import { APP_STORE_URL } from "@/lib/config";
import { STATUS } from "@/ui/tokens";
import { CompactDayCell, StackedDayCell, DetailsDayCell, BASE_HEIGHTS, isLightColor, getTextColorForBackground } from "@/components/calendar/CalendarDayCells";
import { EventListItem, EVENT_COLORS, shareEventFromCalendar, addEventToDeviceCalendar, formatDateForCalendar } from "@/components/calendar/CalendarEventListItem";
import { UpcomingBirthdaysSection } from "@/components/calendar/CalendarBirthdaysSection";
import { ListView } from "@/components/calendar/CalendarListView";
import { CalendarBusyBlockModal } from "@/components/calendar/CalendarBusyBlockModal";
import { CalendarFirstLoginGuideModal } from "@/components/calendar/CalendarFirstLoginGuideModal";
import { CalendarHeaderChrome, MONTHS, CALENDAR_VIEW_MODES, type ViewMode } from "@/components/calendar/CalendarHeaderChrome";
import { DAYS, DAYS_FULL, CALENDAR_VIEW_HEIGHT_KEY, GUIDE_SEEN_KEY_PREFIX, UNIFIED_MIN_HEIGHT, UNIFIED_MAX_HEIGHT, COMPACT_TO_STACKED_THRESHOLD, STACKED_TO_DETAILS_THRESHOLD, getDaysInMonth, getFirstDayOfMonth, getOrdinalSuffix, formatDateShort, getViewModeFromHeight, getHeightMultiplierForMode } from "@/lib/calendarUtils";

// NOTE: getEventPalette, EventPalette, and assertGreyPaletteInvariant are now imported from @/lib/eventPalette
// This is the single source of truth for busy/work grey rendering

// Keep full list for reference
const VIEW_MODES: { id: ViewMode; label: string; icon: typeof List }[] = [
  ...CALENDAR_VIEW_MODES,
  { id: "list", label: "List", icon: List },
];

export default function CalendarScreen() {
  const { data: session } = useSession();
  const { status: bootStatus, retry: retryBootstrap } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const calendarInsets = useSafeAreaInsets();
  const [chromeHeight, setChromeHeight] = useState<number>(160);
  const calendarMountTime = useRef(Date.now()); // [PERF_SWEEP] render timing

  // DEV-only proof log for P0 white screen fix
  useEffect(() => {
    if (__DEV__) {
      devLog('[P0_WHITE_LOGIN]', 'CalendarScreen first render, bootStatus:', bootStatus, 'userId:', session?.user?.id?.substring(0, 8) || 'none');
    }
  }, []);

  // Event color overrides for user-controlled customization
  const { colorOverrides, getOverrideColor, setOverrideColor } = useEventColorOverrides();

  // Timeout for graceful degraded mode when loading takes too long
  const isBootLoading = bootStatus === 'loading';
  const { isTimedOut, reset: resetTimeout } = useLoadingTimeout(isBootLoading, { timeout: 3000 });
  const [isRetrying, setIsRetrying] = useState(false);
  const [guidanceLoaded, setGuidanceLoaded] = useState(false);

  // Load first-session guidance state when user ID is available
  useEffect(() => {
    setGuidanceUserId(session?.user?.id ?? null);
    loadGuidanceState().then(() => setGuidanceLoaded(true));
  }, [session?.user?.id]);

  // First-login welcome modal state (shows only once per user)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeModalChecked, setWelcomeModalChecked] = useState(false);

  // Calendar import nudge state (shows banner if permission not granted and not dismissed)
  const [showCalendarImportNudge, setShowCalendarImportNudge] = useState(false);
  const [calendarImportNudgeChecked, setCalendarImportNudgeChecked] = useState(false);

  // INVARIANT LOG PREFIX for calendar import nudge
  const CAL_NUDGE_LOG = "[CAL_IMPORT_INVARIANT]";

  // Check calendar import nudge visibility
  // INVARIANTS:
  // 1. If calendar permission granted → NEVER show banner
  // 2. Dismissals are USER-SCOPED (key includes userId)
  useEffect(() => {
    if (bootStatus !== 'authed' || !session?.user?.id || calendarImportNudgeChecked) return;
    
    setCalendarImportNudgeChecked(true);
    
    const checkNudge = async () => {
      const userId = session?.user?.id;
      if (!userId) return;
      const dismissedKey = `calendar_import_nudge_dismissed:${userId}`;
      
      // INVARIANT 2: User-scoped dismissal check
      const dismissed = await AsyncStorage.getItem(dismissedKey);
      if (dismissed === "true") {
        if (__DEV__) {
          devLog(`${CAL_NUDGE_LOG} ❌ BLOCKED: User dismissed nudge (key=${dismissedKey})`);
        }
        return;
      }
      
      // INVARIANT 1: If calendar permission granted, NEVER show
      const permResult = await checkCalendarPermission();
      if (permResult.granted) {
        if (__DEV__) {
          devLog(`${CAL_NUDGE_LOG} ❌ BLOCKED: Calendar permission already granted (status=${permResult.status})`);
        }
        return;
      }
      
      if (__DEV__) {
        devLog(`${CAL_NUDGE_LOG} ✅ ALLOWED: Showing calendar import nudge (userId=${userId})`);
      }
      // Small delay to let screen settle
      setTimeout(() => setShowCalendarImportNudge(true), 800);
    };
    
    checkNudge();
  }, [bootStatus, session?.user?.id, calendarImportNudgeChecked]);

  const handleDismissCalendarImportNudge = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCalendarImportNudge(false);
    if (session?.user?.id) {
      const dismissedKey = `calendar_import_nudge_dismissed:${session.user.id}`;
      await AsyncStorage.setItem(dismissedKey, "true");
      if (__DEV__) {
        devLog(`${CAL_NUDGE_LOG} 📝 Marked nudge dismissed (key=${dismissedKey})`);
      }
    }
  };

  const handleCalendarImportNudgePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCalendarImportNudge(false);
    router.push("/import-calendar");
  };

  // Check if welcome modal should be shown on first authed load
  useEffect(() => {
    // Only check once after user is authed
    if (bootStatus !== 'authed' || !session?.user?.id || welcomeModalChecked) return;
    
    setWelcomeModalChecked(true);
    
    // Check if modal has been shown before for this user
    hasWelcomeModalBeenShown(session.user.id).then((alreadyShown) => {
      if (!alreadyShown) {
        // Small delay to let the screen settle before showing modal
        setTimeout(() => setShowWelcomeModal(true), 500);
      }
    });
  }, [bootStatus, session?.user?.id, welcomeModalChecked]);

  // Handle retry from timeout UI
  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    resetTimeout();
    retryBootstrap();
    // Reset retrying state after a brief delay
    setTimeout(() => setIsRetrying(false), 1500);
  }, [resetTimeout, retryBootstrap]);

  // Get local events created while offline
  const localEvents = useLocalEvents();

  // Fetch friends count for Get Started gating
  // STRUCTURAL FIX: Include isFetched to distinguish "loading" from "loaded with empty data"
  const { data: friendsData, isFetched: isFriendsFetched } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 5 * 60 * 1000, // 5 min - same as friends tab
    // refetchOnMount: default (true) — stale data refetches on navigation return
    refetchOnWindowFocus: false,
  });

  // First login guide popup
  const [showFirstLoginGuide, setShowFirstLoginGuide] = useState(false);

  // Quick Busy block creation modal
  const [showBusyModal, setShowBusyModal] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Busy");
  const [busyStartTime, setBusyStartTime] = useState<Date | null>(null);
  const [busyEndTime, setBusyEndTime] = useState<Date | null>(null);

  // Create busy block mutation
  const createBusyMutation = useMutation({
    mutationFn: (data: { title: string; startTime: string; endTime: string }) =>
      api.post<{ event: Event }>("/api/events", {
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        emoji: "⏰",
        visibility: "private",
        isBusy: true,
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Busy block added");
      // P0 FIX: Invalidate specific keys instead of wildcard
      queryClient.invalidateQueries({ queryKey: eventKeys.calendar() });
      setShowBusyModal(false);
      setBusyLabel("Busy");
      setBusyStartTime(null);
      setBusyEndTime(null);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Create Failed", "Failed to create busy block");
    },
  });

  const handleOpenBusyModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Default to selected date, 9am-10am
    const start = new Date(selectedDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(10, 0, 0, 0);
    setBusyStartTime(start);
    setBusyEndTime(end);
    setBusyLabel("Busy");
    setShowBusyModal(true);
  };

  // Auto-bump end time if start crosses or meets it (minimum 15min gap)
  const adjustBusyStart = (newStart: Date) => {
    setBusyStartTime(newStart);
    if (busyEndTime && newStart >= busyEndTime) {
      const bumped = new Date(newStart);
      bumped.setMinutes(bumped.getMinutes() + 15);
      setBusyEndTime(bumped);
    }
  };

  // Prevent end time from going before start time
  const adjustBusyEnd = (newEnd: Date) => {
    if (busyStartTime && newEnd <= busyStartTime) return;
    setBusyEndTime(newEnd);
  };

  const handleCreateBusy = () => {
    if (!busyStartTime || !busyEndTime) return;
    createBusyMutation.mutate({
      title: busyLabel.trim() || "Busy",
      startTime: busyStartTime.toISOString(),
      endTime: busyEndTime.toISOString(),
    });
  };

  const handleDismissGuide = async () => {
    const userId = session?.user?.id;
    if (userId) {
      // Persist dismissal per-user (survives logout)
      await AsyncStorage.setItem(`get_started_dismissed:${userId}`, "true");
    }
    setShowFirstLoginGuide(false);
  };

  const handleOpenGuide = async () => {
    const userId = session?.user?.id;
    if (userId) {
      // Mark as dismissed when opening guide
      await AsyncStorage.setItem(`get_started_dismissed:${userId}`, "true");
    }
    setShowFirstLoginGuide(false);
    router.push("/onboarding");
  };

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [isListView, setIsListView] = useState(false);

  // ScrollView ref (kept for programmatic scrollTo if needed)
  const scrollViewRef = useRef<ScrollView>(null);

  // Month/year ref for deterministic updates without closure issues
  const monthYearRef = useRef({ month: today.getMonth(), year: today.getFullYear() });

  // Direction of last month navigation — drives header animation
  const monthNavDirRef = useRef<"next" | "prev">("next");

  // Sync monthYearRef with state
  useEffect(() => {
    monthYearRef.current = { month: currentMonth, year: currentYear };
  }, [currentMonth, currentYear]);

  // Unified height system - one continuous value that determines both view mode and multiplier
  // Range: 40 (compact min) -> 64 (stacked) -> 80 (details) -> 160 (details max)
  const [initialHeightLoaded, setInitialHeightLoaded] = useState(false);
  const unifiedHeight = useSharedValue(BASE_HEIGHTS.stacked);
  const baseUnifiedHeight = useSharedValue(BASE_HEIGHTS.stacked);
  const [displayUnifiedHeight, setDisplayUnifiedHeight] = useState(BASE_HEIGHTS.stacked);

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
        devError("Failed to load calendar view height:", error);
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
        devError("Failed to save calendar view height:", error);
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
  // Throttled to reduce re-renders during pinch gesture
  const lastUpdateRef = React.useRef(0);
  const onHeightChange = useCallback((newHeight: number, forceUpdate = false) => {
    const now = Date.now();
    // Throttle updates to every 50ms during gesture (forceUpdate bypasses throttle for gesture end)
    if (!forceUpdate && now - lastUpdateRef.current < 50) return;
    lastUpdateRef.current = now;
    
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
      // Scale the unified height based on pinch (worklet - no JS bridge)
      const newHeight = baseUnifiedHeight.value * event.scale;
      // Clamp between min and max
      unifiedHeight.value = Math.max(
        UNIFIED_MIN_HEIGHT,
        Math.min(UNIFIED_MAX_HEIGHT, newHeight)
      );
      // Throttled update to display state
      runOnJS(onHeightChange)(unifiedHeight.value, false);
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
      // Force update on gesture end to ensure final state is captured
      runOnJS(onHeightChange)(targetHeight, true);
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
  // STRUCTURAL FIX: Include isFetched to distinguish "loading" from "loaded with empty data"
  const { data: calendarData, refetch: refetchCalendarEvents, isLoading: isLoadingCalendar, isRefetching: isRefetchingCalendar, isError: isCalendarError, isFetched: isCalendarFetched } = useQuery({
    queryKey: eventKeys.calendarRange(visibleDateRange.start, visibleDateRange.end),
    queryFn: () =>
      api.get<GetCalendarEventsResponse>(
        `/api/events/calendar-events?start=${encodeURIComponent(visibleDateRange.start)}&end=${encodeURIComponent(visibleDateRange.end)}`
      ),
    enabled: isAuthedForNetwork(bootStatus, session),
    refetchOnMount: true,
    staleTime: 0, // Always consider data stale to ensure fresh data on navigation
    placeholderData: (prev: GetCalendarEventsResponse | undefined) => prev, // [PERF_SWEEP] Keep calendar visible during refetch
  });

  // Fetch friend birthdays
  const { data: birthdaysData, isLoading: isLoadingBirthdays, isError: isBirthdaysError, refetch: refetchBirthdays } = useQuery({
    queryKey: ["birthdays"],
    queryFn: () => api.get<GetFriendBirthdaysResponse>("/api/birthdays"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 5 * 60 * 1000, // 5 min — birthdays rarely change
    placeholderData: (prev: GetFriendBirthdaysResponse | undefined) => prev,
  });

  // QueryClient for invalidating queries
  const queryClient = useQueryClient();

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => api.delete(`/api/events/${eventId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // P0 FIX: Invalidate using SSOT contract
      invalidateEventKeys(queryClient, getInvalidateAfterEventDelete(), "event_delete_calendar");
    },
    onError: () => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Update event color mutation — viewer-scoped, saves local + backend [P0_EVENT_COLOR_UI]
  const updateEventColorMutation = useMutation({
    mutationFn: async ({ eventId, color }: { eventId: string; color: string }) => {
      if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'calendar_color_set', { eventId, color });
      // setOverrideColor handles: AsyncStorage + local state + query invalidation + backend API
      await setOverrideColor(eventId, color);
    },
    onSuccess: (_data, variables) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'calendar_color_done', { eventId: variables.eventId, color: variables.color });
    },
    onError: (_err, variables) => {
      if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'calendar_color_error', { eventId: variables.eventId, error: String(_err) });
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Toggle busy status mutation
  const toggleBusyMutation = useMutation({
    mutationFn: ({ eventId, isBusy }: { eventId: string; isBusy: boolean }) =>
      api.put(`/api/events/${eventId}/busy`, { isBusy }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: eventKeys.calendar() });
      queryClient.invalidateQueries({ queryKey: eventKeys.feed() });
    },
    onError: () => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Handlers for context menu actions
  const handleDeleteEvent = (eventId: string) => {
    deleteEventMutation.mutate(eventId);
  };

  const handleColorChange = (eventId: string, color: string) => {
    devLog("[Calendar] handleColorChange called:", { eventId, color });
    updateEventColorMutation.mutate({ eventId, color });
  };

  const handleToggleBusy = (eventId: string, isBusy: boolean) => {
    toggleBusyMutation.mutate({ eventId, isBusy });
  };

  // Fetch work schedule
  interface WorkScheduleDay {
    dayOfWeek: number;
    dayName: string;
    isEnabled: boolean;
    startTime: string | null;
    endTime: string | null;
    label: string;
    // Split schedule support (optional second block)
    block2StartTime?: string | null;
    block2EndTime?: string | null;
  }
  interface WorkScheduleSettings {
    showOnCalendar: boolean;
  }
  const { data: workScheduleData } = useQuery({
    queryKey: ["workSchedule"],
    queryFn: () => api.get<{ schedules: WorkScheduleDay[]; settings: WorkScheduleSettings }>("/api/work-schedule"),
    // Gate on SSOT to prevent queries during logout
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Fetch event requests
  const { data: eventRequestsData } = useQuery({
    queryKey: ["event-requests"],
    queryFn: () => api.get<GetEventRequestsResponse>("/api/event-requests"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Extract created and going events from calendar data
  const myEvents = calendarData?.createdEvents ?? [];
  const goingEvents = calendarData?.goingEvents ?? [];

  const friendBirthdays = birthdaysData?.birthdays ?? [];
  const workSchedules = workScheduleData?.schedules ?? [];
  const workSettings = workScheduleData?.settings ?? { showOnCalendar: true };
  const eventRequests = eventRequestsData?.eventRequests ?? [];
  const pendingEventRequestCount = eventRequestsData?.pendingCount ?? 0;

  // LEGACY ONBOARDING DISABLED: The old "Welcome to Open Invite / Get Started Guide" modal
  // has been replaced by the new interactive onboarding in useOnboardingGuide.
  // This useEffect is kept but disabled to prevent the old modal from showing.
  useEffect(() => {
    // DISABLED: Legacy first login guide modal
    // The new interactive onboarding (useOnboardingGuide) is the only onboarding prompt.
    // See: src/hooks/useOnboardingGuide.ts for the active onboarding system.
    if (__DEV__) devLog('[GUIDE_DECISION] Legacy guide check DISABLED - using new interactive onboarding only');
    
    // Clean up any old flags for existing users (one-time migration)
    const cleanupLegacyFlags = async () => {
      const userId = session?.user?.id;
      if (!userId) return;
      // Mark old guide as dismissed to prevent any future re-enablement
      const guideSeenKey = `get_started_dismissed:${userId}`;
      const alreadyDismissed = await AsyncStorage.getItem(guideSeenKey);
      if (!alreadyDismissed) {
        await AsyncStorage.setItem(guideSeenKey, "true");
        if (__DEV__) devLog('[GUIDE_DECISION] Migrated: set legacy flag to dismissed', { guideSeenKey });
      }
    };
    cleanupLegacyFlags();
  }, [session?.user?.id, bootStatus, isFriendsFetched, isCalendarFetched, friendsData, calendarData]);

  // P1 JITTER FIX: Use sticky loading to prevent flicker on fast refetches
  const stickyLoading = useStickyLoadingCombined(
    [isLoadingCalendar, isLoadingBirthdays],
    300,
    __DEV__ ? "calendar" : undefined
  );

  // [PERF_SWEEP] loadedOnce discipline: skeleton only on first load, never on refetch
  const { showInitialLoading: showCalendarLoading } = useLoadedOnce(
    { isLoading: stickyLoading, isFetching: isRefetchingCalendar, isSuccess: !!calendarData, data: calendarData },
    "calendar-events",
  );

  // [PERF_SWEEP] DEV-only render timing
  if (__DEV__ && !showCalendarLoading && calendarMountTime.current) {
    devLog("[PERF_SWEEP]", { screen: "calendar", phase: "render", durationMs: Date.now() - calendarMountTime.current });
    calendarMountTime.current = 0;
  }

  // Determine empty state logic (fixed bug: account for loading states)
  // Note: isRefetchingCalendar intentionally excluded – refetch should not reset empty state
  // Use showCalendarLoading (loadedOnce) for UI decisions to prevent blank flash on refetch
  const isDataSettled = !showCalendarLoading && bootStatus === 'authed';
  const hasEventsForView = myEvents.length > 0 || goingEvents.length > 0 || localEvents.length > 0 || eventRequests.length > 0;
  const shouldShowEmptyPrompt = isDataSettled && !hasEventsForView;

  // Aggregate error state for any critical query
  const hasQueryError = isCalendarError || isBirthdaysError;

  // Debug logs for gating query states (helps diagnose stuck loading states)
  useEffect(() => {
    devLog("[CalendarScreen] Query states:", {
      bootStatus,
      isLoadingCalendar,
      isRefetchingCalendar,
      isLoadingBirthdays,
      isCalendarError,
      isBirthdaysError,
      isDataSettled,
      hasQueryError,
    });
  }, [bootStatus, isLoadingCalendar, isRefetchingCalendar, isLoadingBirthdays, isCalendarError, isBirthdaysError, isDataSettled, hasQueryError]);

  // [LIVE_REFRESH] SSOT live-feel contract: manual + foreground + focus
  // Replaces the old manual useFocusEffect refetch
  const { isRefreshing: calendarIsRefreshing, onManualRefresh: onCalendarManualRefresh } = useLiveRefreshContract({
    screenName: "calendar",
    refetchFns: [refetchCalendarEvents, refetchBirthdays],
  });

  // [CALENDAR_RESYNC] Check device calendar for new events on pull-to-refresh
  const resyncInFlightRef = useRef(false);
  const checkDeviceCalendarForNewEvents = useCallback(async () => {
    if (resyncInFlightRef.current) return;
    resyncInFlightRef.current = true;
    try {
      const hasPermission = await hasCalendarPermissions();
      if (!hasPermission) return;

      const calendars = await getDeviceCalendars();
      const writableIds = calendars.filter((c) => c.allowsModifications).map((c) => c.id);
      if (writableIds.length === 0) return;

      const now = new Date();
      const thirtyDaysOut = new Date();
      thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
      const deviceEvents = await getDeviceEvents(writableIds, now, thirtyDaysOut);

      // Filter out events exported from Open Invite (OID marker)
      const externalEvents = deviceEvents.filter((e) => !isOpenInviteExportedEvent(e.notes));
      if (externalEvents.length === 0) return;

      // Fetch already-imported events from backend
      let importedDeviceIds = new Set<string>();
      try {
        const imported = await api.get<{ events: Array<{ deviceCalendarId: string | null }> }>("/api/events/imported");
        importedDeviceIds = new Set(
          imported.events.filter((e) => e.deviceCalendarId).map((e) => e.deviceCalendarId!)
        );
      } catch {
        // If fetch fails, skip resync silently
        return;
      }

      // Diff: only events not already imported
      const newEvents = externalEvents.filter((e) => !importedDeviceIds.has(e.id));
      if (newEvents.length === 0) {
        if (__DEV__) devLog("[CALENDAR_RESYNC]", "no new device events found");
        return;
      }

      if (__DEV__) devLog("[CALENDAR_RESYNC]", `found ${newEvents.length} new device events, navigating to import`);
      router.push("/import-calendar?mode=resync" as any);
    } catch (error) {
      if (__DEV__) devError("[CALENDAR_RESYNC]", "failed:", error);
    } finally {
      resyncInFlightRef.current = false;
    }
  }, [router]);

  // Wrap pull-to-refresh: normal refresh + async device calendar check
  const handleCalendarRefresh = useCallback(() => {
    onCalendarManualRefresh();
    // Fire device calendar diff in background (non-blocking)
    checkDeviceCalendarForNewEvents();
  }, [onCalendarManualRefresh, checkDeviceCalendarForNewEvents]);

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

        // Block 2 (split schedule) - if present
        if (schedule.block2StartTime && schedule.block2EndTime) {
          const [block2StartHours, block2StartMinutes] = schedule.block2StartTime.split(":").map(Number);
          const [block2EndHours, block2EndMinutes] = schedule.block2EndTime.split(":").map(Number);

          const block2StartTime = new Date(currentYear, currentMonth, day, block2StartHours, block2StartMinutes);
          const block2EndTime = new Date(currentYear, currentMonth, day, block2EndHours, block2EndMinutes);

          events.push({
            id: `work-${currentYear}-${currentMonth}-${day}-b2`,
            title: schedule.label || "Work",
            description: `${schedule.block2StartTime} - ${schedule.block2EndTime}`,
            location: null,
            emoji: "💼",
            startTime: block2StartTime.toISOString(),
            endTime: block2EndTime.toISOString(),
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
    Haptics.selectionAsync().catch(() => {});
    monthNavDirRef.current = "prev";
    const ref = monthYearRef.current;
    const newMonth = ref.month === 0 ? 11 : ref.month - 1;
    const newYear = ref.month === 0 ? ref.year - 1 : ref.year;
    if (__DEV__) {
      devLog("[P0_CAL_HAPTIC]", { dir: "prev" });
      devLog("[CalendarGesture] TRIGGER prev", { from: `${ref.month + 1}/${ref.year}`, to: `${newMonth + 1}/${newYear}` });
      devLog("[P1_CAL_MONTH_HEADER_ANIM]", { dir: "prev", monthKey: `${newYear}-${String(newMonth + 1).padStart(2, "0")}` });
    }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
    setSelectedDate(new Date(newYear, newMonth, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    monthNavDirRef.current = "next";
    const ref = monthYearRef.current;
    const newMonth = ref.month === 11 ? 0 : ref.month + 1;
    const newYear = ref.month === 11 ? ref.year + 1 : ref.year;
    if (__DEV__) {
      devLog("[P0_CAL_HAPTIC]", { dir: "next" });
      devLog("[CalendarGesture] TRIGGER next", { from: `${ref.month + 1}/${ref.year}`, to: `${newMonth + 1}/${newYear}` });
      devLog("[P1_CAL_MONTH_HEADER_ANIM]", { dir: "next", monthKey: `${newYear}-${String(newMonth + 1).padStart(2, "0")}` });
    }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
    setSelectedDate(new Date(newYear, newMonth, 1));
  }, []);

  const goToToday = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    setSelectedDate(today);
  };

  // ── Horizontal swipe gesture for month navigation (replaces vertical overscroll) ──
  const swipeMonthGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])      // activate only after 20px horizontal movement
    .failOffsetY([-15, 15])        // fail early if vertical intent
    .onEnd((event) => {
      "worklet";
      const { translationX, velocityX, translationY } = event;
      // Direction lock: must be clearly horizontal
      if (Math.abs(translationX) <= Math.abs(translationY) * 1.2) return;
      // Threshold: minimum 60px distance OR 800 velocity
      const meetsThreshold =
        Math.abs(translationX) >= 60 || Math.abs(velocityX) >= 800;
      if (!meetsThreshold) return;

      if (translationX < 0) {
        runOnJS(goToNextMonth)();
        if (__DEV__) runOnJS(devLog)("[P0_CAL_SWIPE_MONTH]", { dir: "next" });
      } else {
        runOnJS(goToPrevMonth)();
        if (__DEV__) runOnJS(devLog)("[P0_CAL_SWIPE_MONTH]", { dir: "prev" });
      }
    });

  // Compose pinch + horizontal swipe so both work on the calendar grid
  const calendarGesture = Gesture.Race(swipeMonthGesture, pinchGesture);

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
      colorOverrides,
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

  // Show loading while bootstrap is in progress or not authed
  if (bootStatus !== 'authed') {
    // [BOOT_FLOW] Proof log: Calendar screen rendering loading state
    if (__DEV__) {
      devLog('[BOOT_FLOW]', 'CalendarScreen rendering loading state, bootStatus:', bootStatus, 'isTimedOut:', isTimedOut);
    }

    // If loading has timed out, show user-friendly timeout UI with escape routes
    if (isTimedOut || bootStatus === 'error') {
      return (
        <LoadingTimeoutUI
          context="calendar"
          onRetry={handleRetry}
          isRetrying={isRetrying}
          showBottomNav={true}
        />
      );
    }

    // Still within timeout window - show simple loading state
    // Include testID for E2E to detect we're on calendar route
    return (
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      /* INVARIANT_ALLOW_INLINE_ARRAY_PROP */
      <SafeAreaView testID="calendar-screen" className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center px-8">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="text-base" style={{ color: colors.textTertiary }}>
            Syncing your calendar…
          </Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  // [BOOT_FLOW] Proof log: Calendar screen rendering authed state
  if (__DEV__) {
    devLog('[BOOT_FLOW]', 'CalendarScreen rendering authed state, userId:', session?.user?.id?.substring(0, 8) || 'none');
  }

  // Show error UI if queries failed (isCalendarError or isBirthdaysError)
  if (__DEV__) devLog('[P0_CALENDAR_ERROR_UI]', { isCalendarError, isBirthdaysError, hasQueryError });
  if (hasQueryError) {
    return (
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      /* INVARIANT_ALLOW_INLINE_ARRAY_PROP */
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center px-8">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="text-xl font-semibold mb-2" style={{ color: colors.text }}>
            Couldn't load your calendar
          </Text>
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="text-base text-center mb-6" style={{ color: colors.textSecondary }}>
            Couldn't refresh right now. Try again in a moment.
          </Text>
          <Button
            variant="primary"
            label="Retry"
            /* INVARIANT_ALLOW_INLINE_HANDLER */
            onPress={() => {
              devLog("[CalendarScreen] Retry button pressed, refetching...");
              refetchCalendarEvents();
            }}
          />
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  return (
    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      {/* INVARIANT_ALLOW_INLINE_ARRAY_PROP */}
      <SafeAreaView testID="calendar-screen" className="flex-1" style={{ backgroundColor: colors.background }} edges={[]}>

      {/* ═══ Floating translucent top chrome ═══ */}
      <CalendarHeaderChrome
        currentMonth={currentMonth}
        currentYear={currentYear}
        viewMode={viewMode}
        isListView={isListView}
        themeColor={themeColor}
        colors={colors}
        isDark={isDark}
        calendarInsets={calendarInsets}
        chromeHeight={chromeHeight}
        monthNavDirRef={monthNavDirRef}
        session={session}
        onGoToPrevMonth={goToPrevMonth}
        onGoToNextMonth={goToNextMonth}
        onSetViewMode={(mode) => { setIsListView(false); setViewModeManually(mode); }}
        onSetListView={() => { Haptics.selectionAsync(); setIsListView(true); }}
        onCreateEvent={() => { if (!guardEmailVerification(session)) return; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/create"); }}
        onChromeLayout={(h) => { if (h > 0 && h !== chromeHeight) setChromeHeight(h); }}
      />

      {/* Global Empty State - When user has no events at all */}
      <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          contentContainerStyle={{ paddingTop: chromeHeight, paddingBottom: TAB_BOTTOM_PADDING }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={calendarIsRefreshing}
              onRefresh={handleCalendarRefresh}
              tintColor={themeColor}
              progressViewOffset={chromeHeight}
            />
          }
        >
          {/* Calendar Import Nudge Banner - shown if permission not granted and not dismissed */}
          {showCalendarImportNudge && (
            <Animated.View
              entering={FadeInDown.springify()}
              className="mx-4 mb-3 p-4 rounded-2xl flex-row items-center"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ backgroundColor: themeColor + "15", borderWidth: 1, borderColor: themeColor + "30" }}
            >
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: themeColor + "20" }}>
                <CalendarDays size={20} color={themeColor} />
              </View>
              <View className="flex-1 mr-2">
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                  Import your calendar
                </Text>
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                  One-time import. Your data stays private.
                </Text>
              </View>
              <Pressable
                onPress={handleCalendarImportNudgePress}
                className="px-3 py-1.5 rounded-full mr-1"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ backgroundColor: themeColor }}
              >
                <Text className="text-white text-xs font-semibold">Import</Text>
              </Pressable>
              <Pressable
                onPress={handleDismissCalendarImportNudge}
                className="p-1.5"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={colors.textTertiary} />
              </Pressable>
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
            onToggleBusy={handleToggleBusy}
            session={session}
            colorOverrides={colorOverrides}
          />
        ) : (
          <>
            {/* Calendar Grid with Pinch-to-Expand */}
            <GestureDetector gesture={calendarGesture}>
              <Animated.View className="px-3">
                {/* Day Labels */}
                <View className="flex-row mb-1">
                  {/* INVARIANT_ALLOW_SMALL_MAP */}
                  {DAYS.map((day, idx) => (
                    <View key={idx} className="flex-1 items-center py-2">
                      <Text
                        className="text-xs font-medium"
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        style={{ color: idx === 0 || idx === 6 ? colors.textTertiary : colors.textSecondary }}
                      >
                        {day}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Grid with Week Separators */}
                <View>
                  {/* INVARIANT_ALLOW_SMALL_MAP */}
                  {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIndex) => (
                    <View key={weekIndex}>
                      {/* Week separator line (not before first week) */}
                      {weekIndex > 0 && (
                        <View
                          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
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
                        {/* INVARIANT_ALLOW_SMALL_MAP */}
                        {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
                          const index = weekIndex * 7 + dayIndex;
                          return (
                            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
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
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-xs" style={{ color: colors.textTertiary }}>
                    Pinch to expand
                  </Text>
                </View>
              </Animated.View>
            </GestureDetector>

            {/* Selected Date Events */}
            <View className="px-5 mt-6">
              <View className="flex-row items-center justify-between mb-4">
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                  {selectedDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Chip
                    variant="muted"
                    label="Busy"
                    leftIcon={<Briefcase size={12} color={colors.chipMutedText} />}
                    onPress={handleOpenBusyModal}
                    size="sm"
                  />
                  <Chip
                    variant="accent"
                    label="Free?"
                    leftIcon={<Users size={12} color={themeColor} />}
                    /* INVARIANT_ALLOW_INLINE_HANDLER */
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/whos-free?date=${selectedDate.toISOString().split('T')[0]}` as any);
                    }}
                    size="sm"
                  />
                </View>
              </View>

              {selectedDateEvents.length === 0 ? (
                <View
                  className="rounded-2xl p-6 items-center"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.borderSubtle,
                    ...(isDark ? {} : TILE_SHADOW),
                  }}
                >
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text style={{ color: colors.text }} className="font-semibold mb-1">No upcoming invites yet</Text>
                  {guidanceLoaded && !isEmailGateActive(session) && shouldShowEmptyGuidanceSync("create_invite") && shouldShowEmptyPrompt && (
                    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                    <Text style={{ color: colors.textSecondary }} className="text-sm text-center mb-2">
                      Plans start when someone joins you.
                    </Text>
                  )}
                  {guidanceLoaded && !isEmailGateActive(session) && shouldShowEmptyGuidanceSync("create_invite") && shouldShowEmptyPrompt && (
                    <Button
                      variant="primary"
                      label="Invite a friend"
                      leftIcon={<UserPlus size={16} color={colors.buttonPrimaryText} />}
                      /* INVARIANT_ALLOW_INLINE_HANDLER */
                      onPress={async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        try {
                          await Share.share({
                            message: `Join me on Open Invite - the easiest way to share plans with friends!\n\n${APP_STORE_URL}`,
                            url: APP_STORE_URL,
                          });
                        } catch (error) {
                          devError("Error sharing:", error);
                        }
                      }}
                      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                      style={{ marginBottom: 12 }}
                    />
                  )}
                  <View className="flex-row items-center mt-1 gap-4">
                    <Button
                      variant="ghost"
                      label="Create an Invite"
                      leftIcon={<Plus size={16} color={themeColor} />}
                      /* INVARIANT_ALLOW_INLINE_HANDLER */
                      onPress={() => {
                        if (!guardEmailVerification(session)) return;
                        router.push(`/create?date=${selectedDate.toISOString()}`);
                      }}
                    />
                    {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                    <View style={{ width: 1, height: 16, backgroundColor: colors.border }} />
                    <Button
                      variant="ghost"
                      label="Who's Free?"
                      leftIcon={<Users size={16} color={themeColor} />}
                      /* INVARIANT_ALLOW_INLINE_HANDLER */
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/whos-free?date=${selectedDate.toISOString().split('T')[0]}` as any);
                      }}
                    />
                  </View>
                </View>
              ) : (
                /* INVARIANT_ALLOW_SMALL_MAP */
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
                      onToggleBusy={handleToggleBusy}
                      colorOverride={colorOverrides[event.id]}
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
                    {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                    <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                      Proposed Events
                    </Text>
                    {pendingEventRequestCount > 0 && (
                      <View
                        className="ml-2 w-5 h-5 rounded-full items-center justify-center"
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        style={{ backgroundColor: STATUS.destructive.fg }}
                      >
                        <Text className="text-xs text-white font-bold">
                          {pendingEventRequestCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Pressable
                    /* INVARIANT_ALLOW_INLINE_HANDLER */
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/create-event-request" as any);
                    }}
                    className="flex-row items-center px-3 py-1.5 rounded-full"
                    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                    style={{ backgroundColor: `${themeColor}15` }}
                  >
                    <Plus size={14} color={themeColor} />
                    {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                    <Text className="text-sm font-medium ml-1" style={{ color: themeColor }}>
                      Propose
                    </Text>
                  </Pressable>
                </View>
                {/* INVARIANT_ALLOW_SMALL_MAP */}
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
                        /* INVARIANT_ALLOW_INLINE_HANDLER */
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push(`/event-request/${request.id}` as any);
                        }}
                        className="rounded-xl p-4 mb-3"
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        style={{
                          backgroundColor: needsResponse ? `${themeColor}10` : colors.surface,
                          borderWidth: needsResponse ? 2 : 1,
                          borderColor: needsResponse ? themeColor : colors.borderSubtle,
                          ...(isDark ? {} : TILE_SHADOW),
                        }}
                      >
                        <View className="flex-row items-start">
                          <View
                            className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                            style={{ backgroundColor: colors.surface2 }}
                          >
                            <Text className="text-2xl">{request.emoji}</Text>
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center justify-between">
                              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                              <Text className="font-semibold flex-1 mr-2" style={{ color: colors.text }} numberOfLines={1}>
                                {request.title}
                              </Text>
                              {needsResponse && (
                                <View
                                  className="px-2 py-0.5 rounded-full"
                                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                                  style={{ backgroundColor: STATUS.destructive.fg }}
                                >
                                  <Text className="text-xs text-white font-medium">RSVP</Text>
                                </View>
                              )}
                              {request.status === "confirmed" && (
                                <View
                                  className="px-2 py-0.5 rounded-full flex-row items-center"
                                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                                  style={{ backgroundColor: STATUS.going.bgSoft }}
                                >
                                  <Check size={10} color={STATUS.going.fg} />
                                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                                  <Text className="text-xs font-medium ml-1" style={{ color: STATUS.going.fg }}>
                                    Confirmed
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View className="flex-row items-center mt-1">
                              <Clock size={12} color={colors.textSecondary} />
                              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
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
                              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                              <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>
                                {isCreator ? "You invited " : `${request.creator.name ?? "Someone"} + `}
                                {totalMembers} {totalMembers === 1 ? "friend" : "friends"}
                              </Text>
                              {request.status === "pending" && (
                                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
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
              </View>
            )}
            {/* Upcoming Birthdays Section - Collapsible */}
            <UpcomingBirthdaysSection
              upcomingBirthdays={upcomingBirthdays}
              colors={colors}
            />
          </>
        )}

        </ScrollView>

      {/* Bottom Navigation */}
      <BottomNavigation />

      <CalendarFirstLoginGuideModal
        visible={showFirstLoginGuide}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onOpenGuide={handleOpenGuide}
        onDismiss={handleDismissGuide}
      />

      <CalendarBusyBlockModal
        visible={showBusyModal}
        busyLabel={busyLabel}
        busyStartTime={busyStartTime}
        busyEndTime={busyEndTime}
        selectedDate={selectedDate}
        isPending={createBusyMutation.isPending}
        colors={colors}
        isDark={isDark}
        onClose={() => setShowBusyModal(false)}
        onLabelChange={setBusyLabel}
        onAdjustStart={adjustBusyStart}
        onAdjustEnd={adjustBusyEnd}
        onCreateBusy={handleCreateBusy}
      />

      {/* First-login Welcome Modal - shows only once per user */}
      <WelcomeModal
        visible={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
      />

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
