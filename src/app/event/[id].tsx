import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Linking,
  Platform,
  ActivityIndicator,
  Modal,
  Share,
  Switch,
  Dimensions,
  Animated as RNAnimated,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { openMaps } from "@/utils/openMaps";
import { trackEventRsvp, trackInviteShared, trackRsvpCompleted, trackRsvpShareClicked, trackRsvpSuccessPromptShown, trackRsvpSuccessPromptTap, trackRsvpError } from "@/analytics/analyticsEventsSSOT";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { getDiscussionPrompts, inferEventTags } from "@/lib/discussionPromptSSOT";
import { refreshAfterFriendRequestSent } from "@/lib/refreshAfterMutation";
import { markTimeline } from "@/lib/devConvergenceTimeline";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import {
  MapPin,
  Clock,
  Users,
  Compass,
  UserPlus,
  Check,
  X,
  Calendar,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Settings,
  UserCheck,
  Pencil,
  MessageCircle,
  ImagePlus,
  Trash2,
  Share2,
  AlertTriangle,
  Heart,
  Bell,
  Copy,
  Star,
  NotebookPen,
  CalendarCheck,
  RefreshCw,
  Lock,
  MoreHorizontal,
  Palette,
  Camera,
  HandCoins,
  ListChecks,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn, useSharedValue, withSpring, useAnimatedStyle } from "react-native-reanimated";
import BottomSheet from "@/components/BottomSheet";
import { UserListRow } from "@/components/UserListRow";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ExpoCalendar from "expo-calendar";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useSession } from "@/lib/useSession";
import { EntityAvatar } from "@/components/EntityAvatar";
import { EventPhotoEmoji } from "@/components/EventPhotoEmoji";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useLoadedOnce } from "@/lib/loadingInvariant";
import { once } from "@/lib/runtimeInvariants";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { uploadImage, uploadEventPhoto } from "@/lib/imageUpload";
import { buildEventSharePayload, getEventUniversalLink } from "@/lib/shareSSOT";
import { safeToast } from "@/lib/safeToast";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";
import { STATUS, HERO_GRADIENT, HERO_WASH } from "@/ui/tokens";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import { shouldMaskEvent } from "@/lib/eventVisibility";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  type GetEventsResponse,
  type Event,
  type GetEventCommentsResponse,
  type EventComment,
  type CreateCommentResponse,
  type EventReportReason,
  type SendFriendRequestResponse,
  type RsvpStatusMutation,
} from "@/shared/contracts";
import { EventReminderPicker } from "@/components/EventReminderPicker";
import { EventPhotoGallery } from "@/components/EventPhotoGallery";
// [P0_DEMO_LEAK] EventCategoryBadge import removed - category field unsupported by create/edit UI
import { EventSummaryModal } from "@/components/EventSummaryModal";
import { FirstRsvpNudge, canShowFirstRsvpNudge, markFirstRsvpNudgeCompleted } from "@/components/FirstRsvpNudge";
import { PostValueInvitePrompt, canShowPostValueInvite } from "@/components/PostValueInvitePrompt";
import { NotificationPrePromptModal } from "@/components/NotificationPrePromptModal";
import { shouldShowNotificationPrompt } from "@/lib/notificationPrompt";
// MapPreview removed; use native maps via openMaps
import {
  checkCalendarPermission,
  isEventSynced,
  syncEventToDeviceCalendar,
  requestCalendarPermissions,
} from "@/lib/calendarSync";
import { useEventColorOverrides } from "@/hooks/useEventColorOverrides";
import { COLOR_PALETTE } from "@/lib/eventColorOverrides";
import { wrapRace } from "@/lib/devStress";
import { postIdempotent } from "@/lib/idempotencyKey";
import {
  eventKeys,
  invalidateEventKeys,
  getRefetchOnEventFocus,
  getInvalidateAfterRsvpJoin,
  getInvalidateAfterJoinRequestAction,
  getInvalidateAfterComment,
  getInvalidateAfterEventDelete,
  deriveAttendeeCount,
  logRsvpMismatch,
} from "@/lib/eventQueryKeys";
import { invalidateEventMedia } from "@/lib/mediaInvalidation";
import HeroBannerSurface from "@/components/HeroBannerSurface";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { resolveBannerUri, getHeroTextColor, getHeroSubTextColor } from "@/lib/heroSSOT";
import { InviteFlipCard } from "@/components/InviteFlipCard";
import { resolveEventTheme } from "@/lib/eventThemes";
import { ThemeEffectLayer } from "@/components/ThemeEffectLayer";
import { startLiveActivity, updateLiveActivity, endLiveActivity, getActiveLiveActivityEventId, areLiveActivitiesEnabled, isEligibleForAutoStart, isEligibleForAutoStartOnFocus } from "@/lib/liveActivity";

// Helper to open event location using the shared utility
// Accepts pre-computed query + optional event for lat/lng coords.
const openEventLocation = (query: string, event?: any, eventId?: string) => {
  try {
    const lat = event?.lat ?? event?.latitude;
    const lng = event?.lng ?? event?.longitude;

    if (lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      openMaps({ lat: Number(lat), lng: Number(lng), label: query });
    } else {
      openMaps({ query });
    }
  } catch (error: any) {
    if (__DEV__) {
      devError("[P0_EVENT_LOCATION_OPEN_FAIL]", { eventId, locationQuery: query, error: error?.message ?? error });
    }
  }
};

// Helper to format date for calendar URLs
const formatDateForCalendar = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
};

// Helper to open Google Calendar with event details
const openGoogleCalendar = (event: { title: string; description?: string | null; location?: string | null; startTime: string; endTime?: string | null }) => {
  const startDate = new Date(event.startTime);
  // Default to 1 hour event if no end time
  const endDate = event.endTime ? new Date(event.endTime) : new Date(startDate.getTime() + 60 * 60 * 1000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatDateForCalendar(startDate)}/${formatDateForCalendar(endDate)}`,
  });

  if (event.description) {
    params.append("details", event.description);
  }
  if (event.location) {
    params.append("location", event.location);
  }

  const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
  Linking.openURL(url);
};

// Helper to add event to device calendar (Apple Calendar on iOS)
const addToDeviceCalendar = async (event: { title: string; description?: string | null; location?: string | null; startTime: string; endTime?: string | null }, showToast: typeof safeToast) => {
  try {
    // Request calendar permissions
    const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();

    if (status !== "granted") {
      showToast.warning("Permission Required", "Please allow calendar access in Settings to add events.");
      Linking.openSettings();
      return;
    }

    const startDate = new Date(event.startTime);
    // Default to 1 hour event if no end time
    const endDate = event.endTime ? new Date(event.endTime) : new Date(startDate.getTime() + 60 * 60 * 1000);

    // Get available calendars
    const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);

    // On iOS, try to get the default calendar first
    let targetCalendar: typeof calendars[0] | undefined;

    if (Platform.OS === "ios") {
      try {
        const defaultCalendar = await ExpoCalendar.getDefaultCalendarAsync();
        if (defaultCalendar?.id) {
          targetCalendar = calendars.find(c => c.id === defaultCalendar.id);
        }
      } catch (e) {
      }
    }

    // If no default calendar found, try to find iCloud calendar
    if (!targetCalendar) {
      targetCalendar = calendars.find(
        (cal) => cal.allowsModifications && cal.source?.name === "iCloud"
      );
    }

    // If no iCloud, try primary calendar
    if (!targetCalendar) {
      targetCalendar = calendars.find(
        (cal) => cal.allowsModifications && cal.isPrimary
      );
    }

    // If still no calendar, find any modifiable calendar
    if (!targetCalendar) {
      targetCalendar = calendars.find((cal) => cal.allowsModifications);
    }

    if (!targetCalendar) {
      showToast.error("No Calendar Found", "Please set up at least one calendar on your device.");
      return;
    }

    // Create the event
    const eventId = await ExpoCalendar.createEventAsync(targetCalendar.id, {
      title: event.title,
      startDate: startDate,
      endDate: endDate,
      location: event.location ?? undefined,
      notes: event.description ?? undefined,
      alarms: [{ relativeOffset: -30 }], // Reminder 30 minutes before
    });

    showToast.success("Event Added!", `Added to your ${targetCalendar.title} calendar.`);
  } catch (error: any) {
    devError("Error adding to calendar:", error);

    // Check if it's a permission error
    if (error?.message?.includes("permission") || error?.code === "E_MISSING_PERMISSION") {
      showToast.warning("Permission Required", "Calendar access is required. Please enable it in Settings.");
      Linking.openSettings();
    } else {
      showToast.error("Oops", "That didn't go through. Please try again.");
    }
  }
};

// Helper to share event via native share sheet
const shareEvent = async (event: { id: string; title: string; emoji: string; description?: string | null; location?: string | null; startTime: string; endTime?: string | null }) => {
  try {
    const startDate = new Date(event.startTime);
    const endDate = event.endTime ? new Date(event.endTime) : null;
    const dateStr = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const timeStr = endDate
      ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
      : startDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });

    // [P0_SHARE_SSOT] Use SSOT builder — never raw backend URLs
    const payload = buildEventSharePayload({
      id: event.id,
      title: event.title,
      emoji: event.emoji,
      dateStr,
      timeStr,
      location: event.location,
      description: event.description,
    });

    trackInviteShared({ entity: "event", sourceScreen: "event_detail" });
    await Share.share({
      message: payload.message,
      title: event.title,
      url: payload.url,
    });
  } catch (error) {
    devError("Error sharing event:", error);
  }
};

// [P1_EVENT_400] EventDetailErrorState: Deterministic error UI component
interface EventDetailErrorStateProps {
  title: string;
  subtitle: string;
  onBack: () => void;
  onRetry?: () => void;
  testID?: string;
  themeColor: string;
  colors: any;
}

const EventDetailErrorState: React.FC<EventDetailErrorStateProps> = ({
  title,
  subtitle,
  onBack,
  onRetry,
  testID = "event-detail-error",
  themeColor,
  colors,
}) => {
  return (
    <SafeAreaView testID={testID} className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Event", headerBackTitle: "Back" }} />
      <View className="flex-1 items-center justify-center px-8">
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-6"
          style={{ backgroundColor: colors.surfaceElevated }}
        >
          <AlertTriangle size={40} color={colors.textTertiary} />
        </View>
        <Text className="text-xl font-bold text-center mb-3" style={{ color: colors.text }}>
          {title}
        </Text>
        <Text className="text-center mb-8" style={{ color: colors.textSecondary }}>
          {subtitle}
        </Text>
        <View className="flex-row gap-3">
          <Button
            variant="secondary"
            label="Back"
            onPress={onBack}
            style={{ flex: 1 }}
          />
          {onRetry && (
            <Button
              variant="primary"
              label="Try Again"
              onPress={onRetry}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  
  // [P1_EVENT_400] Guard: Log route params immediately
  if (__DEV__) {
    devLog("[P1_EVENT_400]", "route params", { eventId: id ?? "missing", type: typeof id });
  }
  
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const editTop = Math.max(12, (insets?.top ?? 0) + 6);
  const [showMap, _setShowMap] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showInterestedUsers, setShowInterestedUsers] = useState(false);
  const [selectedReminders, setSelectedReminders] = useState<number[]>([]);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showRsvpOptions, setShowRsvpOptions] = useState(false);
  const [showDeleteCommentConfirm, setShowDeleteCommentConfirm] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [showRemoveRsvpConfirm, setShowRemoveRsvpConfirm] = useState(false);
  const [showDeleteEventConfirm, setShowDeleteEventConfirm] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingSync, setIsCheckingSync] = useState(true);
  // Prompt arbitration: only ONE modal per RSVP success
  type RsvpPromptChoice = "post_value_invite" | "first_rsvp_nudge" | "notification" | "none";
  const [rsvpPromptChoice, setRsvpPromptChoice] = useState<RsvpPromptChoice>("none");

  // Event Report Modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReportReason, setSelectedReportReason] = useState<EventReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Event Actions Sheet state
  const [showEventActionsSheet, setShowEventActionsSheet] = useState(false);

  // Attendees modal state (P0: Who's Coming)
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);

  // Color picker state
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Live Activity state
  const [liveActivityActive, setLiveActivityActive] = useState(false);
  const [liveActivitySupported, setLiveActivitySupported] = useState(false);
  // Track if user manually turned off Live Activity this session (don't auto-restart)
  const liveActivityManuallyDismissed = useRef(false);
  // Ref for auto-start payload — updated every render, read by useFocusEffect callback
  // to avoid hook-order issues (useFocusEffect must be above early returns).
  const liveActivityAutoStartRef = useRef<{
    event: any;
    isMyEvent: boolean;
    myRsvpStatus: string | null;
    effectiveGoingCount: number;
  } | null>(null);

  // [EVENT_LIVE_UI] Event settings accordion — collapsed by default
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // [EVENT_LIVE_UI_2] RSVP micro-interaction state
  const [rsvpSavedVisible, setRsvpSavedVisible] = useState(false);
  const rsvpSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rsvpButtonScale = useSharedValue(1);
  const rsvpButtonAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: rsvpButtonScale.value }] }));

  // [RSVP_FRICTION] Inline success prompt state (once per event per session)
  const [showRsvpSuccessPrompt, setShowRsvpSuccessPrompt] = useState(false);
  const rsvpSuccessPromptFired = useRef(false);

  // [EVENT_LIVE_UI_2] Live chip state — shows briefly after RSVP or when recently active
  const [liveChipText, setLiveChipText] = useState<string | null>(null);
  const liveChipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCommentCount = useRef<number | null>(null);
  const { colorOverrides, getOverrideColor, setOverrideColor, resetColor } = useEventColorOverrides();
  const currentColorOverride = id ? getOverrideColor(id) : undefined;

  // Event Photo Lite state
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const pickerLaunching = useRef(false);
  const [photoNudgeDismissed, setPhotoNudgeDismissed] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [showMemoriesExpanded, setShowMemoriesExpanded] = useState(false);

  // ── Shared photo-picker logic (used by nudge CTA + bottom sheet) ──
  const launchEventPhotoPicker = useCallback(async () => {
    if (uploadingPhoto || pickerLaunching.current) return;
    pickerLaunching.current = true;
    try {
      if (__DEV__) devLog('[EVENT_PHOTO_PICK_START]');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        safeToast.warning("Permission Required", "Please allow access to your photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) {
        if (__DEV__) devLog('[EVENT_PHOTO_PICK_CANCEL]');
        return;
      }
      if (__DEV__) devLog('[EVENT_PHOTO_PICK_OK]', { uri: result.assets[0].uri.slice(-30) });
      setUploadingPhoto(true);
      const upload = await uploadEventPhoto(result.assets[0].uri, id ?? undefined);
      await api.put(`/api/events/${id}/photo`, {
        eventPhotoUrl: upload.url,
        eventPhotoPublicId: upload.publicId,
      });
      invalidateEventMedia(queryClient, id ?? undefined);
      safeToast.success("Photo added");
    } catch (e: any) {
      if (__DEV__) devError("[EVENT_PHOTO_UPLOAD]", e);
      safeToast.error("Upload failed", e?.message ?? "Please try again.");
    } finally {
      setUploadingPhoto(false);
      pickerLaunching.current = false;
    }
  }, [uploadingPhoto, id, queryClient]);

  // Hero micro-animation refs (title reveal + edit tap)
  const heroTitleOpacity = useRef(new RNAnimated.Value(0)).current;
  const heroTitleTranslateY = useRef(new RNAnimated.Value(6)).current;
  const editScale = useRef(new RNAnimated.Value(1)).current;
  const heroLoadedUrl = useRef<string | null>(null);

  // Check photo nudge dismiss state
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(`dismissedEventPhotoNudge_${id}`).then((v) => {
      if (v === "true") setPhotoNudgeDismissed(true);
    });
  }, [id]);

  // Check sync status when event loads
  useEffect(() => {
    if (!id) return;

    const checkSyncStatus = async () => {
      setIsCheckingSync(true);
      try {
        const synced = await isEventSynced(id);
        setIsSynced(synced);
      } catch (error) {
        if (__DEV__) {
          devError("Failed to check sync status:", error);
        }
      } finally {
        setIsCheckingSync(false);
      }
    };

    checkSyncStatus();
  }, [id]);

  // Re-check sync status when returning to this screen (e.g., from import-calendar)
  useFocusEffect(
    React.useCallback(() => {
      if (!id) return;

      const recheckSync = async () => {
        try {
          const synced = await isEventSynced(id);
          setIsSynced(synced);
        } catch (error) {
          // Ignore errors on recheck
        }
      };

      recheckSync();
    }, [id])
  );

  // Live Activity: check support + active state on focus, then auto-start if eligible.
  // HOOK ORDER: This must stay above all early returns (loading gate, error gate, busy gate)
  // to keep hook count stable across renders. Auto-start reads from liveActivityAutoStartRef
  // (updated every render) to avoid stale closures without needing post-early-return deps.
  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== "ios" || !id) return;
      (async () => {
        const supported = await areLiveActivitiesEnabled();
        setLiveActivitySupported(supported);
        if (!supported) return;

        const activeId = await getActiveLiveActivityEventId();
        setLiveActivityActive(activeId === id);

        // [LIVE_ACTIVITY_AUTO_ON] Silent auto-start for qualifying events.
        if (activeId) return; // Another activity already running
        if (liveActivityManuallyDismissed.current) return;

        const snap = liveActivityAutoStartRef.current;
        if (!snap) return; // Event data not loaded yet

        const { event: ev, isMyEvent: host, myRsvpStatus: rsvp, effectiveGoingCount: going } = snap;
        if (!host && rsvp !== "going") return;
        if (!isEligibleForAutoStartOnFocus(ev)) return;

        // Derive location from event for the Live Activity payload
        const loc = ev.locationName ?? ev.placeName ?? ev.venueName ?? ev.address ?? ev.location ?? null;

        const ok = await startLiveActivity({
          eventId: ev.id,
          eventTitle: ev.title,
          startTime: ev.startTime,
          locationName: loc,
          rsvpStatus: host ? "going" : (rsvp ?? "going"),
          emoji: ev.emoji,
          goingCount: going ?? 0,
          themeAccentColor: resolveEventTheme(ev.themeId).backAccent,
        });
        if (ok) {
          setLiveActivityActive(true);
          devLog("[LIVE_ACTIVITY_AUTO_ON]", "auto-started for event", id);
        }
      })();
    }, [id])
  );

  // P0 FIX: Refetch event data on focus to ensure cross-account sync
  useFocusEffect(
    React.useCallback(() => {
      if (!id || bootStatus !== 'authed') return;

      // Refetch core event queries to pick up changes from other accounts
      const keysToRefetch = getRefetchOnEventFocus(id);
      invalidateEventKeys(queryClient, keysToRefetch, `focus_refetch event=${id}`);
    }, [id, bootStatus, queryClient])
  );

  // Handle sync to device calendar with permission check
  const handleSyncToCalendar = async () => {
    if (!event || !id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSyncing(true);

    try {
      // Check calendar permission first
      const permission = await checkCalendarPermission();

      if (!permission.granted) {
        if (permission.canAskAgain) {
          // Request permission
          const granted = await requestCalendarPermissions();
          if (!granted) {
            setIsSyncing(false);
            // User declined, redirect to import-calendar for proper flow
            router.push({
              pathname: "/import-calendar" as any,
              params: { returnTo: "eventDetails", eventId: id },
            });
            return;
          }
        } else {
          // Can't ask again, need to go to settings via import-calendar
          setIsSyncing(false);
          router.push({
            pathname: "/import-calendar" as any,
            params: { returnTo: "eventDetails", eventId: id },
          });
          return;
        }
      }

      // Permission granted, proceed with sync
      const result = await syncEventToDeviceCalendar({
        id: event.id,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        location: locationDisplay,
        description: event.description,
        emoji: event.emoji,
      });

      if (result.success) {
        setIsSynced(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (result.isUpdate) {
          safeToast.success(
            "Calendar Updated",
            `Event updated in ${result.calendarTitle ?? "your calendar"}`
          );
        } else {
          safeToast.success(
            "Added to Calendar",
            `Synced to ${result.calendarTitle ?? "your calendar"}`
          );
        }
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        safeToast.error("Sync Failed", "That didn't go through. Please try again.");
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Sync Failed", "That didn't go through. Please try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Handler to duplicate event
  const handleDuplicateEvent = () => {
    if (!event) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Navigate to create screen with event data pre-filled
    router.push({
      pathname: "/create",
      params: {
        duplicate: "true",
        title: event.title,
        description: event.description ?? "",
        location: locationDisplay ?? "",
        emoji: event.emoji,
        visibility: event.visibility,
        category: event.category ?? "",
      },
    });
  };

  // Fetch single event by ID directly - this handles past events too
  const { data: singleEventData, isLoading: isLoadingEvent, isFetching: isFetchingEvent, isSuccess: isEventSuccess, error: eventError } = useQuery({
    queryKey: eventKeys.single(id ?? ""),
    queryFn: async () => {
      if (__DEV__) {
        devLog("[P1_EVENT_400]", "query start", { eventId: id });
      }
      try {
        const result = await api.get<{ event: Event }>(`/api/events/${id}`);
        if (__DEV__) {
          devLog("[P1_EVENT_400]", "query success", { eventId: id, title: result.event?.title });
        }
        return result;
      } catch (error: any) {
        if (__DEV__) {
          devError("[P1_EVENT_400]", "query error", {
            eventId: id,
            status: error?.status ?? error?.response?.status,
            code: error?.data?.code ?? error?.response?.data?.code,
            message: error?.message,
          });
        }
        throw error;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id,
    retry: false, // Don't retry on 403/404 privacy errors
  });

  // [P1_LOADING_INV] loadedOnce discipline: never show spinner after first successful load
  const { showInitialLoading: showEventLoading, showRefetchIndicator: showEventRefetch } = useLoadedOnce(
    { isLoading: isLoadingEvent, isFetching: isFetchingEvent, isSuccess: isEventSuccess, data: singleEventData },
    "event-detail",
  );

  // ============================================
  // P0 FIX: Event Visibility Classification (SSOT)
  // ============================================
  // Classify why an event is not visible to properly show copy + CTAs
  // Types: 'private_event' (need to add host) | 'busy_block' | 'authorized' | 'unknown'
  
  const eventErrorStatus = (eventError as any)?.status;
  const eventErrorCode = (eventError as any)?.data?.code;
  
  // [P0_CIRCLE_EVENT_TAP] Proof log: event fetch result
  if (__DEV__ && !isLoadingEvent) {
    if (singleEventData?.event) {
      devLog('[P0_CIRCLE_EVENT_TAP] fetch status=200 authed=true', {
        eventId: id,
        eventTitle: singleEventData.event.title,
      });
    }
  }
  
  // Check if event is privacy-restricted
  // INV_FRIEND_2: 403 + body.restricted === true + host.id → friend-boundary UI
  const errorBody = (eventError as any)?.data;
  const isPrivacyRestricted = !!(eventError && (
    (eventErrorStatus === 403 && errorBody?.restricted === true) ||
    eventErrorStatus === 404 ||
    eventErrorCode === 'EVENT_NOT_VISIBLE' ||
    eventErrorCode === 'NOT_FRIEND' ||
    eventErrorCode === 'FORBIDDEN'
  ));

  // ============================================
  // Canonical friend-boundary object (SSOT for ALL render + CTA gating)
  // Created at FETCH interception; no other hostId derivation should exist.
  // Only populated when status === 403 AND errorBody?.restricted === true.
  // ============================================
  const _is403Restricted = eventErrorStatus === 403 && errorBody?.restricted === true;
  const _fbHostId: string | undefined = _is403Restricted ? errorBody?.host?.id : undefined;
  const _fbHostName: string | null = _is403Restricted
    ? (errorBody?.host?.name ?? errorBody?.host?.displayName ?? null)
    : null;
  const _fbHostImage: string | null = _is403Restricted
    ? (errorBody?.host?.image ?? null)
    : null;
  const _fbHostFirst: string = _fbHostName ? _fbHostName.split(' ')[0] : 'the host';

  const _fbDenyReason: string | undefined = _is403Restricted ? errorBody?.denyReason : undefined;
  const _fbCircleId: string | undefined = _is403Restricted ? errorBody?.circleId : undefined;

  const fb = {
    restricted: !!_is403Restricted,
    hostId: _fbHostId,                       // string | undefined
    hostName: _fbHostName,                   // string | null
    hostImage: _fbHostImage,                 // string | null
    hostFirst: _fbHostFirst,                 // first token or "the host"
    hostDisplayName: _fbHostName ?? 'the host',
    denyReason: _fbDenyReason,               // "circle_only" | "friends_only" | undefined
    circleId: _fbCircleId,                   // string | undefined (if backend includes it)
  };

  // Legacy aliases — kept for copy that still references them
  const restrictedHostName = fb.hostDisplayName;
  const restrictedFirstName = fb.hostFirst;

  // [P0_EVENT_FRIEND_BOUNDARY_FETCH] DEV LOG at interception
  if (__DEV__ && !isLoadingEvent && eventError) {
    if (isPrivacyRestricted) {
      devLog('[P0_EVENT_FRIEND_BOUNDARY_FETCH]', {
        status: eventErrorStatus,
        restricted: fb.restricted,
        denyReason: fb.denyReason,
        hostId: fb.hostId,
        hostName: fb.hostName,
      });
    } else {
      devLog('[P0_EVENT_FETCH_ERROR]', {
        eventId: id,
        status: eventErrorStatus,
        code: eventErrorCode,
      });
    }
  }

  // Fallback: Also fetch from lists in case the single endpoint fails
  const { data: myEventsData } = useQuery({
    queryKey: eventKeys.mine(),
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: isAuthedForNetwork(bootStatus, session) && !singleEventData?.event && !isPrivacyRestricted,
  });

  const { data: feedData } = useQuery({
    queryKey: eventKeys.feed(),
    queryFn: () => api.get<GetEventsResponse>("/api/events/feed"),
    enabled: isAuthedForNetwork(bootStatus, session) && !singleEventData?.event && !isPrivacyRestricted,
  });

  // Fetch comments
  const { data: commentsData, isLoading: isLoadingComments } = useQuery({
    queryKey: eventKeys.comments(id ?? ""),
    queryFn: () => api.get<GetEventCommentsResponse>(`/api/events/${id}/comments`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!id,
  });

  const comments = commentsData?.comments ?? [];

  // [EVENT_LIVE_UI_2] Show "Recently active" chip when new comments appear on focus
  useFocusEffect(
    React.useCallback(() => {
      const count = comments.length;
      if (prevCommentCount.current !== null && count > prevCommentCount.current) {
        setLiveChipText("Recently active");
        if (liveChipTimer.current) clearTimeout(liveChipTimer.current);
        liveChipTimer.current = setTimeout(() => setLiveChipText(null), 5000);
      }
      prevCommentCount.current = count;
    }, [comments.length])
  );

  // Fetch event mute status
  const { data: muteData, isLoading: isLoadingMute } = useQuery({
    queryKey: eventKeys.mute(id ?? ""),
    queryFn: () => api.get<{ muted: boolean }>(`/api/notifications/event/${id}`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!id,
  });

  const isEventMuted = muteData?.muted ?? false;

  // Mute toggle mutation
  const muteMutation = useMutation({
    mutationFn: (muted: boolean) =>
      api.post(`/api/notifications/event/${id}`, { muted }),
    onSuccess: (_, muted) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.setQueryData(eventKeys.mute(id ?? ""), { muted });
    },
    onError: () => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Find the event - prefer direct fetch, fallback to lists
  // INVARIANT [P0_RSVP]: This `event` object is for METADATA only (title, location, isFull, goingCount).
  // RSVP *status* display must NEVER read from event.viewerRsvpStatus.
  // RSVP status is SSOT-owned by eventKeys.rsvp(id) → myRsvpData → myRsvpStatus.
  const event =
    singleEventData?.event ??
    myEventsData?.events.find((e) => e.id === id) ??
    feedData?.events.find((e) => e.id === id);

  const isBusyBlock = !!event?.isBusy;

  // Reset hero title animation when photo URL changes
  useEffect(() => {
    heroTitleOpacity.setValue(0);
    heroTitleTranslateY.setValue(6);
    heroLoadedUrl.current = null;
  }, [event?.eventPhotoUrl]);

  // ============================================
  // INVARIANT [P1_EVENT_META]: Capacity + counts are SSOT-owned by eventKeys.single(id).
  // These fields must NEVER fall back to feed/list caches for rendering or gating.
  // The `event` object above may use feed/list fallback for non-critical display
  // (title, location, description), but capacity fields are owner-only.
  // ============================================
  const eventMeta = {
    capacity: singleEventData?.event?.capacity ?? null,
    goingCount: singleEventData?.event?.goingCount ?? null,
    isFull: singleEventData?.event?.isFull ?? false,
  };

  // ============================================
  // P0 FIX: Final event visibility classification
  // ============================================
  type EventBlockedReason = 'private_event' | 'busy_block' | 'authorized' | 'unknown';
  
  const getBlockedReason = (): { reason: EventBlockedReason; authorized: boolean } => {
    // If we have an event, check if it's a busy block
    if (event) {
      if (isBusyBlock) {
        return { reason: 'busy_block', authorized: false };
      }
      return { reason: 'authorized', authorized: true };
    }
    
    // No event - check why
    if (isPrivacyRestricted) {
      return { reason: 'private_event', authorized: false };
    }
    
    // Unknown reason (deleted, network error, etc.)
    return { reason: 'unknown', authorized: false };
  };
  
  const blockedState = getBlockedReason();
  
  // [P0_VISIBILITY] DEV logging for visibility decision (canonical audit tag)
  if (__DEV__ && !isLoadingEvent) {
    devLog('[P0_VISIBILITY] Event details visibility decision:', {
      sourceSurface: 'event-details',
      eventIdPrefix: id?.slice(0, 6),
      hostIdPrefix: event?.userId?.slice(0, 6) ?? fb.hostId?.slice(0, 6) ?? 'unknown',
      isBusy: !!event?.isBusy,
      viewerFriendOfHost: blockedState.reason === 'authorized' ? true : blockedState.reason === 'private_event' ? false : 'unknown',
      decision: blockedState.reason === 'busy_block' ? 'busy_inert' : blockedState.reason === 'authorized' ? 'full_details' : 'private_gate',
      reason: blockedState.reason,
    });
  }

  const isMyEvent = event?.userId === session?.user?.id;
  const hasJoinRequest = event?.joinRequests?.some(
    (r) => r.userId === session?.user?.id && r.status === "accepted"
  );
  const myJoinRequest = event?.joinRequests?.find(
    (r) => r.userId === session?.user?.id
  );

  const handleJoinRequestAction = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: "accepted" | "rejected" }) => {
      if (isBusyBlock) {
        throw new Error("BUSY_BLOCK");
      }
      return api.put(`/api/events/${id}/join/${requestId}`, { status });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // P0 FIX: Invalidate using SSOT contract
      invalidateEventKeys(queryClient, getInvalidateAfterJoinRequestAction(id ?? ""), "join_request_action");
    },
    onError: () => {
      safeToast.error("Couldn't process request", "Please try again.");
    },
  });

  // Comment mutations
  const createCommentMutation = useMutation({
    mutationFn: (data: { content: string; imageUrl?: string }) =>
      api.post<CreateCommentResponse>(`/api/events/${id}/comments`, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCommentText("");
      setCommentImage(null);
      // P0 FIX: Invalidate using SSOT contract
      invalidateEventKeys(queryClient, getInvalidateAfterComment(id ?? ""), "comment_create");
    },
    onError: () => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/api/events/${id}/comments/${commentId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // P0 FIX: Invalidate using SSOT contract
      invalidateEventKeys(queryClient, getInvalidateAfterComment(id ?? ""), "comment_delete");
    },
    onError: () => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: () => api.delete(`/api/events/${id}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateEventKeys(queryClient, getInvalidateAfterEventDelete(), "event_delete");
      router.back();
    },
    onError: () => {
      safeToast.error("Couldn't delete", "Please try again.");
    },
  });

  // Fetch event interests/RSVPs
  const { data: interestsData } = useQuery({
    queryKey: eventKeys.interests(id ?? ""),
    queryFn: () => api.get<{ event_interest: Array<{ id: string; userId: string; user: { id: string; name: string | null; image: string | null }; status: string; createdAt: string }> }>(`/api/events/${id}/interests`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !isBusyBlock,
  });

  // Fetch current user's RSVP status
  const { data: myRsvpData } = useQuery({
    queryKey: eventKeys.rsvp(id ?? ""),
    queryFn: () => api.get<{ status: "going" | "interested" | "not_going" | "maybe" | "invited" | null; rsvpId: string | null }>(`/api/events/${id}/rsvp`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !isBusyBlock,
  });

  // ============================================
  // P0 FIX: Fetch attendees for "Who's Coming" section
  // ============================================
  // Type for attendees response
  type AttendeeInfo = { id: string; name: string | null; imageUrl?: string | null; isHost?: boolean };
  type AttendeesResponse = { attendees: AttendeeInfo[]; totalGoing: number };

  // [P0_DISCOVER_ROSTER] Fetch ALL attendees (includeAll=true bypasses friend-only filter)
  // Per UX CONTRACT: If viewer can see event, they can see ALL attendees regardless of friend status
  // For open_invite events, backend now returns full roster to any authenticated user.
  // TASK 2: enabled is gated on showAttendeesModal so the fetch fires when the sheet opens.
  const attendeesQuery = useQuery({
    queryKey: eventKeys.attendees(id ?? ""), // [P0_RSVP_SOT] Use canonical key
    queryFn: async () => {
      if (__DEV__) {
        devLog('[P0_ROSTER_FETCH]', { eventId: id, rosterOpen: showAttendeesModal });
        devLog('[P0_DISCOVER_ROSTER] fetch started', { eventId: id, endpoint: `/api/events/${id}/attendees?includeAll=true` });
      }
      try {
        // includeAll=true: return ALL attendees, not just friends (per ATTENDEE VISIBILITY CONTRACT)
        const raw = await api.get<any>(`/api/events/${id}/attendees?includeAll=true`);
        // [P0_ROSTER_FETCH_RAW] Proof: log raw response shape before normalization
        if (__DEV__) {
          devLog('[P0_ROSTER_FETCH_RAW]', {
            eventId: id,
            rawKeys: Object.keys(raw ?? {}),
            attendeesLen: (raw?.attendees ?? []).length,
            totalGoing: raw?.totalGoing,
            responseType: typeof raw,
            firstThreeIds: (raw?.attendees ?? []).slice(0, 3).map((a: any) => a.id?.slice(0, 8) ?? 'null'),
          });
        }
        // [P0_DISCOVER_ROSTER] Normalize: backend returns {image} but frontend expects {imageUrl}
        const normalized: AttendeesResponse = {
          attendees: (raw?.attendees ?? []).map((a: any) => ({
            id: a.id,
            name: a.name ?? null,
            imageUrl: a.imageUrl ?? a.image ?? null,
            isHost: a.isHost ?? false,
          })),
          totalGoing: raw?.totalGoing ?? raw?.attendeeCount ?? 0,
        };
        if (__DEV__) {
          devLog('[P0_DISCOVER_ROSTER] fetch status=200', {
            eventId: id,
            rawAttendeesLen: raw?.attendees?.length ?? 0,
            normalizedLen: normalized.attendees.length,
            totalGoing: normalized.totalGoing,
            rawKeys: raw ? Object.keys(raw) : [],
            firstThreeIds: normalized.attendees.slice(0, 3).map((a: AttendeeInfo) => a.id?.slice(0, 6) ?? 'null'),
          });
        }
        return normalized;
      } catch (err: any) {
        if (__DEV__) {
          devLog('[P0_ROSTER_FETCH_ERROR]', {
            eventId: id,
            message: err?.message ?? String(err),
            name: err?.name ?? 'unknown',
            status: err?.status ?? err?.response?.status ?? null,
          });
        }
        throw err;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && showAttendeesModal && !!id,
    retry: (failureCount, error: any) => {
      // Don't retry 403/404 (privacy/not-found), but retry 5xx once
      if (error?.status === 403 || error?.status === 404) return false;
      return failureCount < 1;
    },
  });

  // Destructure query result for backward compatibility with existing code
  const attendeesData = attendeesQuery.data;
  const attendeesError = attendeesQuery.error;
  const isLoadingAttendees = attendeesQuery.isLoading;

  // [P0_ROSTER_FETCH_STATE] Dev-only: track query state transitions when sheet is open
  React.useEffect(() => {
    if (!showAttendeesModal) return;
    if (__DEV__) devLog('[P0_ROSTER_FETCH_STATE]', {
      eventId: id,
      isLoading: attendeesQuery.isLoading,
      isFetching: attendeesQuery.isFetching,
      hasData: !!attendeesQuery.data,
      dataKeys: attendeesQuery.data ? Object.keys(attendeesQuery.data) : [],
      attendeesLen: attendeesQuery.data?.attendees?.length ?? null,
      error: attendeesQuery.error ? String(attendeesQuery.error) : null,
    });
  }, [showAttendeesModal, attendeesQuery.isLoading, attendeesQuery.isFetching, attendeesQuery.data, attendeesQuery.error]);

  // TASK 3: Force refetch every time the sheet opens (prevents stale cache)
  React.useEffect(() => {
    if (showAttendeesModal) {
      const screenH = Dimensions.get('window').height;
      const sheetH = Math.round(screenH * 0.65);
      if (__DEV__) {
        devLog('[P0_WHO_COMING_SHEET_LAYOUT]', {
          sheetHeightPx: sheetH,
          sheetHeightPct: '65%',
          backdropOpacity: 0.5,
        });
      }
      if (__DEV__) devLog('[P0_ROSTER_FETCH] sheet opened \u2192 refetch');
      if (__DEV__) devLog('[P1_WHO_COMING_SHEET]', 'open', { eventId: id });
      attendeesQuery.refetch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAttendeesModal]);

  // Handle attendees 403 gracefully (privacy denied — expected for circle/private events)
  const attendeesPrivacyDenied = (attendeesError as any)?.status === 403;
  if (__DEV__ && attendeesError && !isLoadingAttendees) {
    devLog('[P0_DISCOVER_ROSTER] fetch error', {
      eventId: id,
      status: (attendeesError as any)?.status,
      privacyDenied: attendeesPrivacyDenied,
      visibility: event?.visibility ?? 'unknown',
    });
  }

  // [P0_RSVP_SOT] SSOT - derive attendees from event.joinRequests if attendees endpoint returns empty
  // This ensures "Who's Coming" matches the "going" count shown on cards
  const attendeesFromEndpoint = attendeesData?.attendees ?? [];
  const attendeesFromJoinRequests: AttendeeInfo[] = (event?.joinRequests ?? [])
    .filter((r) => r.status === "accepted")
    .map((r) => ({
      id: r.user.id,
      name: r.user.name,
      imageUrl: r.user.image,
      isHost: false,
    }));
  
  // Use endpoint data if available, fallback to joinRequests
  const attendeesList = attendeesFromEndpoint.length > 0 ? attendeesFromEndpoint : attendeesFromJoinRequests;
  
  // [P0_RSVP_SOT] Use canonical derivation for count
  const derivedCount = deriveAttendeeCount(event);
  
  // [P1_EVENT_META] COUNT SSOT — single source of truth for displayed count.
  // INVARIANT: displayedCount MUST derive exclusively from eventMeta.goingCount (owner: eventKeys.single).
  // attendeesData is for roster list only, NOT for count display.
  const effectiveGoingCount = eventMeta.goingCount ?? 0;
  // Alias for backward compat — all UI must use effectiveGoingCount
  const totalGoing = effectiveGoingCount;

  // [P1_EVENT_META] Render proof: log capacity + counts from owner query (DEV only)
  React.useEffect(() => {
    if (__DEV__ && id && !isLoadingEvent) {
      devLog('[P1_EVENT_META] render', {
        eventId: id.slice(0, 8),
        source: 'eventKeys.single(id)',
        isFull: eventMeta.isFull,
        capacity: eventMeta.capacity,
        goingCount: eventMeta.goingCount,
        displayedCount: effectiveGoingCount,
        ownerLoaded: !!singleEventData?.event,
      });
    }
  }, [id, eventMeta.isFull, eventMeta.capacity, eventMeta.goingCount, effectiveGoingCount, isLoadingEvent]);

  // [P0_WHO_COMING_UI] Canonical proof log: rendered count (DEV only, fires once per render cycle)
  React.useEffect(() => {
    if (__DEV__ && event && id && !isLoadingAttendees) {
      devLog('[P0_WHO_COMING_UI]', {
        eventId: id.slice(0, 8),
        displayedCount: effectiveGoingCount,
        sourceUsed: 'eventMeta.goingCount',
        attendeesLen: attendeesList.length,
        visibility: event?.visibility ?? 'unknown',
      });
    }
  }, [id, effectiveGoingCount, attendeesList.length, isLoadingAttendees]);

  // [P0_RSVP_SOT] DEV proof log for RSVP consistency - only logs on mismatch
  if (__DEV__ && event && id) {
    logRsvpMismatch(id, derivedCount, eventMeta.goingCount, "event_details_owner");
    logRsvpMismatch(id, derivedCount, attendeesData?.totalGoing, "event_details_endpoint");
  }

  const interests = interestsData?.event_interest ?? [];
  
  // ============================================
  // INVARIANT [P0_RSVP]: myRsvpStatus is the SOLE source of truth for RSVP display.
  // Owner: eventKeys.rsvp(id) query → myRsvpData.
  // No screen may read event.viewerRsvpStatus for display.
  // Optimistic updates target eventKeys.rsvp(id) only.
  // ============================================
  const rawRsvpStatus = myRsvpData?.status;
  // Normalize: "maybe" → "interested", "invited" → null (pending RSVP, show controls)
  const myRsvpStatus = rawRsvpStatus === "maybe" ? "interested" : rawRsvpStatus === "invited" ? null : (rawRsvpStatus as "going" | "interested" | "not_going" | null);

  // [LIVE_ACTIVITY_AUTO_ON] Keep ref in sync with latest derived values.
  // The useFocusEffect callback reads from this ref (declared above early returns).
  liveActivityAutoStartRef.current = event ? {
    event,
    isMyEvent: isMyEvent,
    myRsvpStatus: myRsvpStatus,
    effectiveGoingCount: effectiveGoingCount,
  } : null;

  // [P0_RSVP] Render proof: log current RSVP status and its source on every render
  if (__DEV__ && id && !isBusyBlock) {
    devLog('[P0_RSVP] render', {
      eventId: id.slice(0, 8),
      myRsvpStatus,
      rawRsvpStatus: rawRsvpStatus ?? null,
      source: 'eventKeys.rsvp(id)',
      isPending: false,
    });
  }

  // RSVP mutation (unified)
  type RsvpStatus = RsvpStatusMutation;

  const rsvpMutation = useMutation({
    mutationFn: (status: RsvpStatus) => {
      if (__DEV__) {
        devLog("[P0_RSVP]", "mutationFn", { eventId: id, status });
      }
      if (isBusyBlock) {
        throw new Error("BUSY_BLOCK");
      }
      return wrapRace("RSVP_submit", () => postIdempotent(`/api/events/${id}/rsvp`, { status }));
    },
    onMutate: async (nextStatus: RsvpStatus) => {
      // [P0_RSVP] Optimistic update: snapshot cache, update RSVP status and totalGoing immediately
      const prevRsvpStatus = myRsvpStatus; // Already normalized (null | "going" | "interested" | "not_going")
      const prevTotalGoing = totalGoing;

      // Calculate count delta based on status transition
      // Only "going" status counts toward totalGoing, "interested"/"not_going"/null do not
      let countDelta = 0;
      const isGoingBefore = prevRsvpStatus === "going";
      const isGoingAfter = nextStatus === "going";
      
      if (!isGoingBefore && isGoingAfter) {
        countDelta = 1; // Add to count
      } else if (isGoingBefore && !isGoingAfter) {
        countDelta = -1; // Remove from count
      }

      const nextTotalGoing = Math.max(1, prevTotalGoing + countDelta); // Never go below 1 (host)

      if (__DEV__) {
        devLog("[P0_RSVP]", "onMutate optimistic", {
          eventId: id,
          prevStatus: prevRsvpStatus,
          nextStatus,
          prevTotalGoing,
          nextTotalGoing,
          countDelta,
        });
      }

      // [P0_OPTIMISTIC] DEV proof: optimistic_apply phase
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'event_rsvp',
          eventId: id,
          phase: 'optimistic_apply',
          status: nextStatus,
        }));
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'attendees',
          eventId: id,
          phase: 'optimistic_apply',
          attendeeCount: nextTotalGoing,
        }));
      }

      // Cancel outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: eventKeys.rsvp(id ?? "") });
      await queryClient.cancelQueries({ queryKey: eventKeys.attendees(id ?? "") });
      await queryClient.cancelQueries({ queryKey: eventKeys.single(id ?? "") });

      // Snapshot previous values for rollback
      const previousRsvp = queryClient.getQueryData(eventKeys.rsvp(id ?? ""));
      const previousAttendees = queryClient.getQueryData(eventKeys.attendees(id ?? ""));
      const previousSingle = queryClient.getQueryData(eventKeys.single(id ?? ""));

      // Optimistically update RSVP status cache
      queryClient.setQueryData(eventKeys.rsvp(id ?? ""), (old: any) => {
        if (!old) return { status: nextStatus, rsvpId: null };
        return { ...old, status: nextStatus };
      });

      // Optimistically update attendees totalGoing count + insert user avatar
      queryClient.setQueryData(eventKeys.attendees(id ?? ""), (old: AttendeesResponse | undefined) => {
        if (!old) return { attendees: [], totalGoing: nextTotalGoing };
        // [GROWTH_RSVP_FRICTION] Insert current user into roster on "going"
        let nextAttendees = old.attendees;
        const uid = session?.user?.id;
        if (nextStatus === "going" && uid) {
          const alreadyPresent = old.attendees.some(a => a.id === uid);
          if (!alreadyPresent) {
            nextAttendees = [
              ...old.attendees,
              { id: uid, name: session?.user?.name ?? null, imageUrl: session?.user?.image ?? null, isHost: false },
            ];
          }
        } else if (prevRsvpStatus === "going" && nextStatus !== "going" && uid) {
          // Remove user from roster when un-going
          nextAttendees = old.attendees.filter(a => a.id !== uid);
        }
        return { attendees: nextAttendees, totalGoing: nextTotalGoing };
      });

      // [P1_EVENT_META] Optimistically update owner query (eventKeys.single) for capacity coherence
      queryClient.setQueryData(eventKeys.single(id ?? ""), (old: any) => {
        if (!old?.event) return old;
        const updatedGoingCount = nextTotalGoing;
        const cap = old.event.capacity;
        const updatedIsFull = cap != null ? updatedGoingCount >= cap : false;
        if (__DEV__) {
          devLog('[P1_EVENT_META]', 'onMutate owner update', {
            eventId: id,
            prevGoingCount: old.event.goingCount,
            nextGoingCount: updatedGoingCount,
            capacity: cap,
            prevIsFull: old.event.isFull,
            nextIsFull: updatedIsFull,
          });
        }
        return { ...old, event: { ...old.event, goingCount: updatedGoingCount, isFull: updatedIsFull } };
      });

      // Return snapshot for rollback on error
      return { previousRsvp, previousAttendees, previousSingle, prevRsvpStatus, nextStatus, _t0: Date.now() };
    },
    onSuccess: async (_, status, context) => {
      // Haptic feedback only - no intrusive toast popups
      if (status === "going") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      // [P0_ANALYTICS_EVENT] event_rsvp
      trackEventRsvp({ rsvpStatus: status, sourceScreen: "event_detail" });
      // [P0_POSTHOG_VALUE] rsvp_completed — canonical retention event
      trackRsvpCompleted({
        eventId: id ?? "unknown",
        rsvpStatus: status,
        isOpenInvite: event?.visibility === "all_friends",
        source: "event_detail",
        hasGuests: totalGoing ?? 0,
        ts: new Date().toISOString(),
      });
      if (__DEV__) {
        devLog("[P0_POSTHOG_VALUE]", { event: "rsvp_completed", eventId: (id ?? "").slice(0, 8) + "..." });
      }
      
      if (__DEV__) {
        devLog("[P0_RSVP]", "onSuccess", { eventId: id, nextStatus: status });
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'event_rsvp',
          eventId: id,
          phase: 'server_commit',
          status,
        }));
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'attendees',
          eventId: id,
          phase: 'server_commit',
          attendeeCount: 'pending_refetch',
        }));
        // [P1_EVENT_PROJ] Proof: log which projection keys are invalidated
        devLog('[P1_EVENT_PROJ]', 'rsvp onSuccess invalidation', {
          eventId: id,
          nextStatus: status,
          keys: ['single', 'attendees', 'interests', 'rsvp', 'feed', 'feedPaginated', 'myEvents', 'calendar', 'attending'],
        });
        devLog('[ACTION_FEEDBACK]', JSON.stringify({
          action: 'event_rsvp',
          state: 'success',
          eventId: id,
          status,
          durationMs: context?._t0 ? Date.now() - context._t0 : 0,
        }));
      }
      
      // P0 FIX: Invalidate using SSOT contract
      invalidateEventKeys(queryClient, getInvalidateAfterRsvpJoin(id ?? ""), `rsvp_${status}`);
      setShowRsvpOptions(false);

      // [LIVE_ACTIVITY_V2] Auto-start on Going, end on un-RSVP, update otherwise
      if (event && Platform.OS === "ios") {
        if (status === "not_going") {
          // End tracking if user un-RSVPs
          if (liveActivityActive) {
            await endLiveActivity(event.id);
            setLiveActivityActive(false);
          }
        } else if (status === "going" && !liveActivityActive && liveActivitySupported && isEligibleForAutoStart(event)) {
          // Auto-start on Going for eligible events
          const ok = await startLiveActivity({
            eventId: event.id,
            eventTitle: event.title,
            startTime: event.startTime,
            locationName: locationDisplay,
            rsvpStatus: "going",
            emoji: event.emoji,
            goingCount: effectiveGoingCount,
            themeAccentColor: resolveEventTheme(event.themeId).backAccent,
          });
          if (ok) setLiveActivityActive(true);
        } else if (liveActivityActive) {
          // Update existing activity with new RSVP status
          updateLiveActivity({
            eventId: event.id,
            rsvpStatus: status,
            goingCount: effectiveGoingCount,
          });
        }
      }
      
      // ── Prompt arbitration: at most ONE modal per RSVP success ──
      // Priority: PostValueInvite > FirstRsvpNudge > NotificationPrePrompt
      if (bootStatus === 'authed') {
        let postValueEligible = false;
        let firstRsvpEligible = false;
        let notifEligible = false;

        // 1. Check PostValueInvitePrompt eligibility (highest priority)
        try {
          postValueEligible = await canShowPostValueInvite("rsvp");
        } catch {
          postValueEligible = false;
        }

        // 2. Check FirstRsvpNudge eligibility
        try {
          firstRsvpEligible = await canShowFirstRsvpNudge();
        } catch {
          firstRsvpEligible = false;
        }

        // 3. Check NotificationPrePrompt eligibility (only for going/interested)
        if (status === "going" || status === "interested") {
          try {
            notifEligible = await shouldShowNotificationPrompt(session?.user?.id) ?? false;
          } catch {
            notifEligible = false;
          }
        }

        // Arbitrate: pick exactly one
        let chosen: "post_value_invite" | "first_rsvp_nudge" | "notification" | "none" = "none";
        if (postValueEligible) {
          chosen = "post_value_invite";
        } else if (firstRsvpEligible) {
          chosen = "first_rsvp_nudge";
        } else if (notifEligible) {
          chosen = "notification";
        }

        if (__DEV__) {
          devLog("[P1_PROMPT_ARB_RSVP]", `chosen=${chosen} postValueEligible=${postValueEligible} firstRsvpEligible=${firstRsvpEligible} notifEligible=${notifEligible}`);
        }

        // Lock choice immediately, then apply delay if needed
        if (chosen !== "none") {
          setRsvpPromptChoice(chosen);
          // PostValueInvite uses 800ms delay for smoother UX; others show immediately
          // Since choice is already locked, no other prompt can appear in the meantime
        }

        // [GROWTH_V1] Always show inline success prompt for "going" — non-blocking card
        // Coexists with modal prompts since it's inline, not a modal
        if (status === "going" && !rsvpSuccessPromptFired.current) {
          rsvpSuccessPromptFired.current = true;
          setShowRsvpSuccessPrompt(true);
          trackRsvpSuccessPromptShown({ source: "event" });
        }
      }
    },
    onError: (error: any, _nextStatus, context) => {
      // [P0_RSVP] Rollback optimistic update on error
      if (__DEV__) {
        devLog("[P0_RSVP]", "rollback", {
          eventId: id,
          reason: "mutation error",
          prevStatus: context?.prevRsvpStatus,
          attemptedStatus: context?.nextStatus,
          status: error?.response?.status ?? error?.status,
          code: error?.data?.code ?? error?.response?.data?.code,
        });
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'event_rsvp',
          eventId: id,
          phase: 'rollback',
          status: context?.prevRsvpStatus ?? null,
        }));
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'attendees',
          eventId: id,
          phase: 'rollback',
          attendeeCount: 'restored_from_snapshot',
        }));
      }

      // Restore cache to previous state
      if (context?.previousRsvp !== undefined) {
        queryClient.setQueryData(eventKeys.rsvp(id ?? ""), context.previousRsvp);
      }
      if (context?.previousAttendees !== undefined) {
        queryClient.setQueryData(eventKeys.attendees(id ?? ""), context.previousAttendees);
      }
      // [P1_EVENT_META] Rollback owner query capacity fields
      if (context?.previousSingle !== undefined) {
        queryClient.setQueryData(eventKeys.single(id ?? ""), context.previousSingle);
      }

      // [GROWTH_RSVP_FRICTION] Track RSVP errors for edge-state visibility
      const httpStatus = error?.response?.status ?? error?.status;
      const isNetwork = !httpStatus || httpStatus === 0;
      trackRsvpError({
        errorCode: httpStatus === 409 ? "EVENT_FULL" : String(httpStatus ?? "unknown"),
        network: isNetwork,
      });

      // Handle 409 EVENT_FULL error
      if (error?.response?.status === 409 || error?.status === 409) {
        safeToast.warning("Full", "This invite is full.");
        // [P1_EVENT_PROJ] Refetch owner + interests + feed on capacity error
        invalidateEventKeys(queryClient, [
          eventKeys.single(id ?? ""),
          eventKeys.interests(id ?? ""),
          eventKeys.feed(),
        ], "rsvp_error_409");
      } else if (isNetwork) {
        safeToast.error("Offline", "You're offline. Your RSVP will be saved when you reconnect.");
      } else {
        safeToast.error("Oops", "That didn't go through. Please try again.", error);
      }
      if (__DEV__) {
        devLog('[ACTION_FEEDBACK]', JSON.stringify({
          action: 'event_rsvp',
          state: 'error',
          eventId: id,
          durationMs: context?._t0 ? Date.now() - context._t0 : 0,
        }));
      }
    },
    onSettled: (_data, error) => {
      // [P0_OPTIMISTIC] Guard: after every mutation (success or error), verify cache
      // converges to server truth via the invalidation that already fired.
      if (__DEV__) {
        const currentRsvp = queryClient.getQueryData(eventKeys.rsvp(id ?? "")) as any;
        const currentAttendees = queryClient.getQueryData(eventKeys.attendees(id ?? "")) as any;
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'event_rsvp',
          eventId: id,
          phase: 'converged',
          hadError: !!error,
          cacheStatus: currentRsvp?.status ?? null,
        }));
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'attendees',
          eventId: id,
          phase: 'converged',
          hadError: !!error,
          attendeeCount: currentAttendees?.totalGoing ?? null,
        }));
        // [P0_TIMELINE] Mark RSVP UI converged
        if (id) markTimeline(id, "ui_converged");
      }
    },
  });

  const handleRsvp = (status: RsvpStatus) => {
    // [P0_RSVP] Guard: prevent rapid-tap race conditions
    if (rsvpMutation.isPending) {
      if (__DEV__) {
        devLog('[P0_SINGLEFLIGHT]', 'blocked action=rsvp');
        devLog('[P0_RSVP]', 'tap ignored (pending)', { eventId: id, nextStatus: status });
        devLog('[P0_SINGLEFLIGHT]', 'blocked action=rsvp');
      }
      return;
    }
    
    // [P0_RSVP] Tap proof: log status transition on every accepted RSVP tap
    if (__DEV__) {
      devLog('[P0_RSVP] tap', {
        eventId: id,
        nextStatus: status,
        prevStatus: myRsvpStatus,
        source: 'eventKeys.rsvp(id)',
        isFull: eventMeta.isFull,
      });
    }
    
    if (isBusyBlock) {
      return;
    }
    // Guard: only allow RSVP when authenticated
    if (bootStatus !== 'authed') {
      if (bootStatus === 'onboarding') {
        router.replace('/welcome');
      } else {
        router.replace('/welcome');
      }
      return;
    }
    // Guard: require email verification
    if (!guardEmailVerification(session)) {
      return;
    }
    // Guard: block "going" when event is full (unless already going)
    if (status === "going" && eventMeta.isFull && myRsvpStatus !== "going") {
      safeToast.warning("Full", "This invite is full.");
      return;
    }
    // Show confirmation modal when removing RSVP
    if (status === "not_going" && myRsvpStatus && myRsvpStatus !== "not_going") {
      setShowRemoveRsvpConfirm(true);
      return;
    }

    // [EVENT_LIVE_UI_2] RSVP micro-interaction: scale bounce + haptic + saved text + live chip
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    rsvpButtonScale.value = withSpring(1.05, { damping: 8, stiffness: 400 }, () => {
      rsvpButtonScale.value = withSpring(1, { damping: 12, stiffness: 200 });
    });
    setRsvpSavedVisible(true);
    if (rsvpSavedTimer.current) clearTimeout(rsvpSavedTimer.current);
    rsvpSavedTimer.current = setTimeout(() => setRsvpSavedVisible(false), 1200);
    setLiveChipText("Updated just now");
    if (liveChipTimer.current) clearTimeout(liveChipTimer.current);
    liveChipTimer.current = setTimeout(() => setLiveChipText(null), 5000);

    rsvpMutation.mutate(status);
  };

  const confirmRemoveRsvp = () => {
    setShowRemoveRsvpConfirm(false);
    
    // [P0_RSVP] Guard: prevent race if mutation already pending
    if (rsvpMutation.isPending) {
      if (__DEV__) {
        devLog('[P0_SINGLEFLIGHT]', 'blocked action=rsvp');
        devLog('[P0_RSVP]', 'confirm tap ignored (pending)', { eventId: id, nextStatus: 'not_going' });
        devLog('[P0_SINGLEFLIGHT]', 'blocked action=rsvp');
      }
      return;
    }
    
    rsvpMutation.mutate("not_going");
  };

  // Toggle reflection enabled for event
  const toggleReflectionMutation = useMutation({
    mutationFn: (enabled: boolean) => {
      if (__DEV__) devLog("[P0_EVENT_REFLECTION_DEFAULT]", "toggle_update", { eventId: id, reflectionEnabled: enabled });
      return api.put(`/api/events/${id}`, { reflectionEnabled: enabled });
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Invalidate single event to refresh reflection state
      queryClient.invalidateQueries({ queryKey: eventKeys.single(id ?? "") });
    },
  });

  // What to Bring — atomic claim/unclaim via dedicated backend endpoints.
  // Uses optimistic update for instant UI; backend enforces concurrency via
  // row-level lock (SELECT FOR UPDATE). 409 = conflict, 403 = not claimer.
  const bringListClaimMutation = useMutation({
    mutationFn: ({ itemId, action }: { itemId: string; action: "claim" | "unclaim" }) => {
      return api.post<{ ok: boolean; item: any; alreadyClaimed?: boolean; alreadyUnclaimed?: boolean }>(
        `/api/events/${id}/bring-list/${itemId}/${action}`
      );
    },
    onMutate: async ({ itemId, action }) => {
      await queryClient.cancelQueries({ queryKey: eventKeys.single(id ?? "") });
      const prev = queryClient.getQueryData(eventKeys.single(id ?? ""));
      queryClient.setQueryData(eventKeys.single(id ?? ""), (old: any) => {
        if (!old?.event?.bringListItems) return old;
        return {
          ...old,
          event: {
            ...old.event,
            bringListItems: old.event.bringListItems.map((item: any) => {
              if (item.id !== itemId) return item;
              if (action === "claim") {
                return { ...item, claimedByUserId: session?.user?.id ?? null, claimedByName: session?.user?.name ?? "Someone" };
              }
              return { ...item, claimedByUserId: null, claimedByName: null };
            }),
          },
        };
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return { prev };
    },
    onError: (err: any, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(eventKeys.single(id ?? ""), context.prev);
      }
      if (err?.status === 409) {
        safeToast.warning("Already Claimed", "Someone else just claimed this item.");
      } else if (err?.status === 403) {
        safeToast.warning("Can\u2019t Unclaim", "Only the person who claimed it or the host can unclaim.");
      } else {
        safeToast.error("Something went wrong", "Please try again.", err);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.single(id ?? "") });
    },
  });

  // ============================================
  // P0 FIX: addHostMutation moved to top level to fix hook order violation
  // This mutation is used when viewing a privacy-restricted event to add the host as a friend
  // ============================================
  const addHostMutation = useMutation({
    mutationFn: () => {
      if (__DEV__) {
        devLog("[P0_EVENT_FRIEND_BOUNDARY] add_host_press", {
          hostIdPrefix: fb.hostId?.slice(0, 6),
        });
      }
      return api.post<SendFriendRequestResponse>("/api/friends/request", {
        userId: fb.hostId,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Request Sent", "Friend request sent to " + restrictedHostName);

      if (__DEV__) {
        devLog("[P0_EVENT_FRIEND_BOUNDARY] add_host_success", {
          hostIdPrefix: fb.hostId?.slice(0, 6),
          invalidated: [
            "friendRequests",
            "event.single",
            "event.attendees",
            "event.rsvp",
            "event.interests",
          ],
        });
      }

      // Invalidate queries so page refreshes after becoming friends
      refreshAfterFriendRequestSent(queryClient, fb.hostId ?? undefined);

      // Core event hydration SSOT
      queryClient.invalidateQueries({ queryKey: eventKeys.single(id ?? "") });

      // Optional hardening: adjacent event/[id] surfaces that depend on visibility
      queryClient.invalidateQueries({ queryKey: eventKeys.attendees(id ?? "") });
      queryClient.invalidateQueries({ queryKey: eventKeys.rsvp(id ?? "") });
      queryClient.invalidateQueries({ queryKey: eventKeys.interests(id ?? "") });
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = error?.data?.message || error?.message || "Could not send request";
      // Handle already sent / already friends cases gracefully
      if (message.includes("already")) {
        safeToast.info("Already Sent", message);
      } else {
        safeToast.error("Oops", message);
      }
      if (__DEV__) {
        devLog("[P0_EVENT_FRIEND_BOUNDARY] add_host_error", { message });
      }
    },
  });

  // [P0_UI_CONVERGENCE] Event RSVP convergence guard (DEV only)
  // Proves displayed RSVP status always converges to the query snapshot after reconciliation.
  useEffect(() => {
    if (!__DEV__) return;
    if (!id || !myRsvpData) return;
    const raw = myRsvpData.status;
    const normalized = raw === 'maybe' ? 'interested' : raw === 'invited' ? null : raw;
    devLog('[P0_UI_CONVERGENCE]', {
      domain: 'event_rsvp',
      eventId: id,
      rsvpStatus: normalized,
      source: 'query',
      queryKey: 'eventKeys.rsvp(id)',
    });
  }, [id, myRsvpData]);

  // [P0_UI_CONVERGENCE] Attendee list convergence guard (DEV only)
  // Proves attendee roster re-renders from query snapshot — no stale memoized lists survive refetch.
  useEffect(() => {
    if (!__DEV__) return;
    if (!id || !attendeesQuery.data) return;
    devLog('[P0_UI_CONVERGENCE]', {
      domain: 'attendees',
      eventId: id,
      attendeeCount: attendeesQuery.data.attendees?.length ?? 0,
      source: 'query',
      queryKey: 'eventKeys.attendees(id)',
      isFetching: attendeesQuery.isFetching,
    });
  }, [id, attendeesQuery.data, attendeesQuery.isFetching]);

  // ============================================
  // P0_HOOK_ORDER: Proof log on mount - all hooks called unconditionally above this point
  // ============================================
  useEffect(() => {
    if (__DEV__) {
      devLog("[P0_HOOK_ORDER] EventDetailScreen mount", {
        eventId: id ?? "none",
        hasEvent: !!event,
        isBusyBlock: !!event?.isBusy,
        isPrivacyRestricted,
        eventErrorStatus: eventErrorStatus ?? null,
        eventErrorCode: eventErrorCode ?? null,
        bootStatus,
      });
    }
  }, []); // Empty deps = mount only

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setIsUploadingImage(true);
      try {
        // Compress and upload the image to the server
        const uploadResponse = await uploadImage(result.assets[0].uri, true);
        setCommentImage(uploadResponse.url);
      } catch (error) {
        devError("Image upload failed:", error);
        safeToast.error("Oops", "That didn't go through. Please try again.");
      } finally {
        setIsUploadingImage(false);
      }
    }
  };

  const handlePostComment = () => {
    if (!commentText.trim() && !commentImage) return;

    createCommentMutation.mutate({
      content: commentText.trim(),
      imageUrl: commentImage ?? undefined,
    });
  };

  const handleDeleteComment = (commentId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setCommentToDelete(commentId);
    setShowDeleteCommentConfirm(true);
  };

  const confirmDeleteComment = () => {
    if (deleteCommentMutation.isPending) {
      if (__DEV__) devLog('[P1_DOUBLE_SUBMIT_GUARD]', 'deleteComment ignored, commentId=' + commentToDelete);
      return;
    }
    if (commentToDelete) {
      deleteCommentMutation.mutate(commentToDelete);
    }
    setShowDeleteCommentConfirm(false);
    setCommentToDelete(null);
  };

  // First RSVP nudge handlers (REMOVED: old notification nudge logic)
  const handleFirstRsvpNudgePrimary = async () => {
    await markFirstRsvpNudgeCompleted();
    setRsvpPromptChoice("none");
    router.push("/discover");
  };

  const handleFirstRsvpNudgeSecondary = async () => {
    await markFirstRsvpNudgeCompleted();
    setRsvpPromptChoice("none");
    router.push("/create");
  };

  const handleFirstRsvpNudgeDismiss = async () => {
    await markFirstRsvpNudgeCompleted();
    setRsvpPromptChoice("none");
  };

  const handlePostValueInviteClose = () => {
    setRsvpPromptChoice("none");
  };

  // REMOVED: handleNotificationNudgeClose - now handled by pre-prompt modal

  // Event Report handlers
  const handleReportEvent = () => {
    Haptics.selectionAsync();
    setShowReportModal(true);
  };

  const submitEventReport = async () => {
    if (!selectedReportReason || !event?.id) return;
    setIsSubmittingReport(true);
    const notesTrimmed = reportDetails.trim().slice(0, 1000) || undefined;
    if (__DEV__) devLog("[P0_REPORT_EVENT_SUBMIT]", { eventId: event.id, reason: selectedReportReason, notesLen: notesTrimmed?.length ?? 0 });
    try {
      const res = await api.post<{ ok: boolean }>(`/api/events/${event.id}/report`, {
        reason: selectedReportReason,
        notes: notesTrimmed,
      });
      if (!res?.ok) throw new Error("Unexpected response");
      if (__DEV__) devLog("[P0_REPORT_EVENT_OK]", { eventId: event.id });
      safeToast.success("Report submitted", "Thanks - we received your report.");
      setShowReportModal(false);
      setSelectedReportReason(null);
      setReportDetails("");
    } catch (error: any) {
      const status = error?.status ?? error?.statusCode;
      if (status === 409) {
        if (__DEV__) devWarn("[P0_REPORT_DUPLICATE_UI]", { eventId: event.id });
        safeToast.warning("Already reported", "You've already reported this event.");
      } else if (status === 429) {
        if (__DEV__) devWarn("[P0_REPORT_RATE_LIMIT_UI]", { eventId: event.id });
        safeToast.warning("Slow down", "You're reporting too quickly. Try again later.");
      } else {
        if (__DEV__) devError("[P0_REPORT_EVENT_ERR]", { eventId: event.id, message: error?.message ?? "unknown" });
        safeToast.error("Report Failed", "Could not submit report. Please try again.");
      }
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Format relative time
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Event", headerBackTitle: "Back" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in to view events</Text>
        </View>
      </SafeAreaView>
    );
  }

  // [P1_EVENT_400] Guard: Missing or invalid eventId
  if (!id || typeof id !== "string" || id.trim() === "") {
    if (__DEV__) {
      devError("[P1_EVENT_400]", "invalid eventId detected", { id, type: typeof id });
    }
    return (
      <EventDetailErrorState
        title="Invalid Event"
        subtitle="This event link is missing or invalid. Please check the link and try again."
        onBack={() => router.back()}
        themeColor={themeColor}
        colors={colors}
      />
    );
  }

  if (showEventLoading) {
    // [P1_RSVP_FLOW] Proof log: event detail loading
    if (__DEV__) {
      devLog('[P1_RSVP_FLOW]', 'event detail loading', { eventId: id });
    }
    
    return (
      <SafeAreaView testID="event-detail-loading" className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Event Details", headerBackTitle: "Back" }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    // [P1_EVENT_400] Determine error type and show appropriate error UI
    const errorStatus = eventErrorStatus;
    const errorCode = eventErrorCode;
    
    // [P0_EVENT_FRIEND_BOUNDARY] Friend-boundary gate: viewer is not connected to host
    if (isPrivacyRestricted) {
      // Derive hasHostId from canonical fb (strict string check — not just truthiness)
      const hasHostId = typeof fb.hostId === "string" && fb.hostId.length > 0;

      if (__DEV__) {
        devLog('[P0_EVENT_FRIEND_BOUNDARY_RENDER]', {
          hostId: fb.hostId,
          hostName: fb.hostName,
          hasHostId,
          denyReason: fb.denyReason,
        });
        devLog('[P0_CIRCLE_EVENT_AUTHZ]', {
          eventId: id,
          denyReason: fb.denyReason,
          isCircleOnly: fb.denyReason === 'circle_only',
          viewerIsMember: false,
          allowed: false,
        });
        if (!hasHostId) {
          devLog('[P0_EVENT_FRIEND_BOUNDARY_HOSTID_MISSING]', {
            eventId: id,
            status: eventErrorStatus,
            restricted: fb.restricted,
            rawHostId: fb.hostId,
          });
        }
      }

      // SSOT handler: navigate to host profile (used by avatar tap AND button)
      const goToHostProfile = () => {
        if (!hasHostId) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (__DEV__) {
          devLog('[P0_EVENT_FRIEND_BOUNDARY] nav_to_host_profile', {
            eventIdPrefix: id?.slice(0, 6),
            hostIdPrefix: fb.hostId!.slice(0, 6),
          });
        }
        router.push(`/user/${fb.hostId}` as any);
      };

      return (
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
          <Stack.Screen options={{ title: "Event", headerBackTitle: "Back" }} />
          <View className="flex-1 items-center justify-center px-6">
            {/* Locked-state card */}
            <View
              className="w-full rounded-2xl items-center px-6 py-8"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                ...(Platform.OS === "ios" ? {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.3 : 0.08,
                  shadowRadius: 8,
                } : { elevation: 2 }),
              }}
            >
              {/* Tappable host avatar — SSOT via EntityAvatar */}
              {hasHostId ? (
                <Pressable onPress={goToHostProfile}>
                  {(() => {
                    if (__DEV__) {
                      devLog('[P0_MEDIA_IDENTITY]', {
                        surface: 'EventHero',
                        usedPrimitive: 'EntityAvatar',
                        hasPhotoUrl: !!fb.hostImage,
                      });
                    }
                    return null;
                  })()}
                  <View style={{ marginBottom: 16, borderWidth: 2, borderColor: colors.separator, borderRadius: 40, overflow: 'hidden' }}>
                    <EntityAvatar
                      photoUrl={fb.hostImage}
                      initials={fb.hostFirst ? fb.hostFirst.charAt(0).toUpperCase() : undefined}
                      size={80}
                      borderRadius={40}
                      backgroundColor={colors.background}
                      foregroundColor={colors.textSecondary}
                      fallbackIcon="person-outline"
                    />
                  </View>
                </Pressable>
              ) : (
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-4"
                  style={{ backgroundColor: colors.background }}
                >
                  <Lock size={28} color={colors.textSecondary} />
                </View>
              )}

              {/* Line 1: tertiary hosted-by attribution */}
              <Text
                className="text-sm text-center"
                style={{ color: colors.textSecondary, marginBottom: 6 }}
              >
                {`Event hosted by ${fb.hostDisplayName}`}
              </Text>

              {/* Line 2: headline */}
              <Text
                className="text-xl font-semibold text-center"
                style={{ color: colors.text, marginBottom: 8 }}
              >
                {fb.denyReason === "circle_only" ? "Circle-only event" : "Event details hidden"}
              </Text>

              {/* Line 3: body */}
              <Text
                className="text-center"
                style={{ color: colors.textSecondary, lineHeight: 22, marginBottom: 28 }}
              >
                {fb.denyReason === "circle_only"
                  ? "Join the circle to view this event."
                  : `Connect with ${fb.hostFirst} to see this event.`}
              </Text>

              {/* CTA: View Circle (preferred for circle_only) → View profile → fallback */}
              {fb.denyReason === "circle_only" && fb.circleId ? (
                <View className="w-full" style={{ gap: 10 }}>
                  <Button
                    variant="primary"
                    label="View Circle"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/circle/${fb.circleId}` as any);
                    }}
                  />
                  {hasHostId && (
                    <Button
                      variant="secondary"
                      label="View host profile"
                      onPress={goToHostProfile}
                    />
                  )}
                </View>
              ) : hasHostId ? (
                <View className="w-full">
                  <Button
                    variant="primary"
                    label={fb.denyReason === "circle_only" ? "View host profile" : "View profile"}
                    onPress={goToHostProfile}
                  />
                </View>
              ) : (
                <Text
                  className="text-sm text-center"
                  style={{ color: colors.textTertiary }}
                >
                  Profile unavailable right now.
                </Text>
              )}
            </View>
          </View>
        </SafeAreaView>
      );
    }

    // [P1_EVENT_400] Non-privacy error: show deterministic error UI
    let errorTitle = "Event Not Found";
    let errorSubtitle = "This event may have been deleted or is no longer available.";
    
    if (errorStatus === 400) {
      errorTitle = "Invalid Request";
      errorSubtitle = "The event link appears to be invalid or malformed. Please check the link and try again.";
    } else if (errorStatus === 404) {
      errorTitle = "Event Not Found";
      errorSubtitle = "This event may have been deleted or is no longer available.";
    } else if (errorStatus === 403) {
      errorTitle = "Access Denied";
      errorSubtitle = "You don't have permission to view this event.";
    } else if (eventError) {
      // Generic network or server error
      errorTitle = "Unable to load event";
      errorSubtitle = "There was a problem loading this event. Please check your connection and try again.";
    }
    
    if (__DEV__) {
      devLog("[P1_EVENT_400]", "rendering error state", {
        eventId: id,
        errorStatus,
        errorCode,
        errorTitle,
      });
    }
    
    return (
      <EventDetailErrorState
        title={errorTitle}
        subtitle={errorSubtitle}
        onBack={() => router.back()}
        onRetry={() => {
          if (__DEV__) {
            devLog("[P1_EVENT_400]", "retry tapped", { eventId: id });
          }
          queryClient.invalidateQueries({ queryKey: eventKeys.single(id) });
        }}
        themeColor={themeColor}
        colors={colors}
      />
    );
  }

  // [P0_BUSY_DETAIL_GUARD] Busy block: non-owner sees safe screen, no title leak, no friend-boundary CTA
  // INV_BUSY_1 + INV_BUSY_3: shouldMaskEvent is the SSOT privacy predicate
  const busyMasked = event ? shouldMaskEvent({ isBusy: event.isBusy, isWork: (event as any).isWork, isOwn: isMyEvent }, isMyEvent) : false;
  if (isBusyBlock && busyMasked && !isMyEvent) {
    if (__DEV__) {
      devLog('[P0_BUSY_DETAIL_GUARD]', { eventId: id, maskedBusy: true, viewerIsOwner: isMyEvent });
    }
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Busy", headerBackTitle: "Back" }} />
        <View className="flex-1 items-center justify-center px-6">
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.surface }}
          >
            <Lock size={28} color={colors.textSecondary} />
          </View>
          <Text
            className="text-xl font-semibold text-center mb-2"
            style={{ color: colors.text }}
          >
            Busy
          </Text>
          <Text
            className="text-center mb-6"
            style={{ color: colors.textSecondary, lineHeight: 22 }}
          >
            This time is blocked on the host's calendar.
          </Text>
          <Button
            variant="ghost"
            label="Go Back"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/friends')}
          />
        </View>
      </SafeAreaView>
    );
  }

  // [P1_RSVP_FLOW] Proof log: event loaded successfully
  if (__DEV__) {
    devLog('[P1_RSVP_FLOW]', 'event loaded', {
      eventId: event.id,
      title: event.title,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENT DETAIL THEMES — keyed map, only "default" renders today.
  // Future themes (warm, midnight) are real entries, not rendered.
  // ═══════════════════════════════════════════════════════════════
  const EVENT_DETAIL_THEMES = {
    default: {
      heroGradientColors: isDark
        ? (["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.6)", "rgba(0,0,0,0.88)"] as const)
        : (["transparent", "rgba(0,0,0,0.12)", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.78)"] as const),
      heroGradientLocations: [0, 0.25, 0.55, 1] as const,
      heroWashColors: isDark ? HERO_WASH.dark.colors : HERO_WASH.light.colors,
      heroWashLocations: isDark ? HERO_WASH.dark.locations : HERO_WASH.light.locations,
      heroFallbackBg: isDark ? colors.surface : "#FAFAFA",
      accentPrimary: STATUS.going.fg,
      accentSecondary: STATUS.interested.fg,
      chipTone: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
      sectionTint: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)",
    },
    warm: {
      heroGradientColors: isDark
        ? (["transparent", "rgba(30,15,0,0.35)", "rgba(30,15,0,0.6)", "rgba(20,10,0,0.88)"] as const)
        : (["transparent", "rgba(40,20,0,0.1)", "rgba(40,20,0,0.35)", "rgba(30,15,0,0.72)"] as const),
      heroGradientLocations: [0, 0.25, 0.55, 1] as const,
      heroWashColors: isDark
        ? (["rgba(40,25,15,0.6)", "rgba(0,0,0,0)"] as const)
        : (["rgba(255,245,230,0.9)", "rgba(255,255,255,0)"] as const),
      heroWashLocations: [0, 1] as const,
      heroFallbackBg: isDark ? "#1A1410" : "#FFF8F0",
      accentPrimary: "#F59E0B",
      accentSecondary: "#EC4899",
      chipTone: isDark ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.06)",
      sectionTint: isDark ? "rgba(245,158,11,0.04)" : "rgba(245,158,11,0.02)",
    },
    midnight: {
      heroGradientColors: isDark
        ? (["transparent", "rgba(10,10,30,0.4)", "rgba(10,10,30,0.65)", "rgba(5,5,20,0.92)"] as const)
        : (["transparent", "rgba(15,15,40,0.15)", "rgba(15,15,40,0.45)", "rgba(10,10,30,0.8)"] as const),
      heroGradientLocations: [0, 0.25, 0.55, 1] as const,
      heroWashColors: isDark
        ? (["rgba(15,15,45,0.7)", "rgba(0,0,0,0)"] as const)
        : (["rgba(230,230,255,0.9)", "rgba(255,255,255,0)"] as const),
      heroWashLocations: [0, 1] as const,
      heroFallbackBg: isDark ? "#0D0D1A" : "#F0F0FF",
      accentPrimary: "#818CF8",
      accentSecondary: "#A78BFA",
      chipTone: isDark ? "rgba(129,140,248,0.1)" : "rgba(129,140,248,0.06)",
      sectionTint: isDark ? "rgba(129,140,248,0.04)" : "rgba(129,140,248,0.02)",
    },
  } as const;

  const ET = EVENT_DETAIL_THEMES.default;

  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  const dateLabel = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  // Show time range if endTime exists
  const timeLabel = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  // [EVENT_LIVE_UI] Countdown label — recalculates on focus (no ticking timer)
  const countdownLabel = (() => {
    const now = new Date();
    const eventEnd = endDate ?? new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
    if (now > eventEnd) return "Ended";
    if (now >= startDate && now <= eventEnd) return "Happening now";
    const diffMs = startDate.getTime() - now.getTime();
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const isToday = startDate.toDateString() === now.toDateString();
    if (isToday) {
      if (hours > 0) return `Today \u2022 Starts in ${hours}h ${minutes}m`;
      return `Today \u2022 Starts in ${minutes}m`;
    }
    if (days > 0 && hours > 0) return `Starts in ${days}d ${hours}h`;
    if (days > 0) return `Starts in ${days}d`;
    return `Starts in ${hours}h ${minutes}m`;
  })();

  if (__DEV__) {
    devLog("[EVENT_LIVE_UI]", "countdown", { countdownLabel, eventId: event.id.slice(0, 8) });
  }

  // [P0_EVENT_LOCATION_NORMALIZE] Derive locationDisplay (UI) + locationQuery (maps).
  // Dedup rule: if one string contains the other, keep the longer one.
  const _ev = event as any;
  const _str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const _rawLocation  = _str(event.location);
  const _rawName      = _str(_ev.locationName);
  const _rawAddress   = _str(_ev.address);
  const _rawPlace     = _str(_ev.placeName);
  const _rawVenue     = _str(_ev.venueName);

  // Collapse repeated commas / excess whitespace in any raw value
  const _clean = (s: string): string =>
    s.replace(/,{2,}/g, ",").replace(/\s{2,}/g, " ").replace(/^[,\s]+|[,\s]+$/g, "");

  let locationDisplay: string | null = null;
  let locationQuery: string | null = null;

  // Priority: if we have a name AND an address, compose "Name — Address" with dedup.
  const _name = _rawName ?? _rawPlace ?? _rawVenue;
  const _addr = _rawAddress;

  if (_name && _addr) {
    // Dedup: if one fully contains the other, keep the longer one
    const nameLC = _name.toLowerCase();
    const addrLC = _addr.toLowerCase();
    if (addrLC.includes(nameLC)) {
      locationDisplay = _clean(_addr);
    } else if (nameLC.includes(addrLC)) {
      locationDisplay = _clean(_name);
    } else {
      locationDisplay = _clean(`${_name} \u2014 ${_addr}`);
    }
  } else if (_rawLocation) {
    locationDisplay = _clean(_rawLocation);
  } else {
    locationDisplay = _name ? _clean(_name) : _addr ? _clean(_addr) : null;
  }

  // Query for maps: prefer raw address (best geocoding), else fall back to display
  locationQuery = _addr ?? locationDisplay;

  // [P0_EVENT_LOCATION_NORMALIZE] DEV-only proof log
  if (__DEV__) {
    devLog("[P0_EVENT_LOCATION_NORMALIZE]", {
      eventId: event.id,
      rawLocation: event.location,
      rawLocationName: _ev.locationName,
      rawAddress: _ev.address,
      locationDisplay,
      locationQuery,
    });
  }

  // Hero banner URI — maps event photo → hero surface (no schema change)
  const eventBannerUri = resolveBannerUri({
    bannerPhotoUrl: event?.eventPhotoUrl ?? null,
    bannerUrl: event?.eventPhotoUrl ?? null,
  });

  // Themed canvas — theme owns the page background behind the card
  const pageTheme = resolveEventTheme(event.themeId);
  const canvasColor = isDark ? pageTheme.backBgDark : pageTheme.backBgLight;

  return (
    <SafeAreaView testID="event-detail-screen" className="flex-1" style={{ backgroundColor: canvasColor }} edges={["bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Full-page particle effect — behind all content */}
      <ThemeEffectLayer themeId={event.themeId} />

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ V4.2 ATMOSPHERIC ZONE — blurred backdrop + floating card ═══ */}
        <View style={{ position: "relative", overflow: "hidden", backgroundColor: canvasColor }}>
          {/* Ambient blurred background — cinematic atmosphere */}
          {eventBannerUri && event.eventPhotoUrl && !event.isBusy && event.visibility !== "private" ? (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
              <ExpoImage
                source={{ uri: toCloudinaryTransformedUrl(eventBannerUri, CLOUDINARY_PRESETS.AVATAR_THUMB) }}
                style={{ width: "100%", height: "100%", opacity: isDark ? 0.7 : 0.55 }}
                contentFit="cover"
                blurRadius={70}
                cachePolicy="memory-disk"
              />
              {/* Layered scrim: let color through, fade to canvas */}
              <LinearGradient
                colors={[
                  isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.02)",
                  isDark ? "rgba(0,0,0,0.15)" : "transparent",
                  isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.03)",
                  canvasColor,
                ]}
                locations={[0, 0.25, 0.7, 1]}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              />
              {/* Theme tint wash over photo backdrop */}
              {(() => {
                const tint = isDark ? pageTheme.pageTintDark : pageTheme.pageTintLight;
                return tint && tint !== "transparent" ? (
                  <LinearGradient
                    colors={[tint, "transparent"]}
                    locations={[0, 0.65]}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                ) : null;
              })()}
            </View>
          ) : (
            /* No-photo: warmer gradient atmosphere (theme-aware) */
            (() => {
              const tint = isDark ? pageTheme.pageTintDark : pageTheme.pageTintLight;
              const baseTint = tint && tint !== "transparent" ? tint : undefined;
              return (
                <LinearGradient
                  colors={isDark
                    ? [baseTint ?? `${themeColor}30`, baseTint ? "transparent" : `${themeColor}12`, canvasColor]
                    : [baseTint ?? `${themeColor}20`, baseTint ? "transparent" : `${themeColor}0A`, canvasColor]
                  }
                  locations={[0, 0.4, 1]}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                />
              );
            })()
          )}

          {/* Theme effect moved to full-page level (SafeAreaView) */}

          {/* Nav bar — glass-effect over atmosphere */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 14,
            paddingTop: insets.top + 6,
            paddingBottom: 6,
            zIndex: 10,
          }}>
            {eventBannerUri && event.eventPhotoUrl ? (
              <Pressable
                onPress={() => router.canGoBack() ? router.back() : router.replace("/calendar" as any)}
                style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden" }}
              >
                <BlurView intensity={30} tint="dark" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.15)" }}>
                  <ChevronLeft size={24} color="#FFFFFF" />
                </BlurView>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.canGoBack() ? router.back() : router.replace("/calendar" as any)}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
              >
                <ChevronLeft size={24} color={colors.text} />
              </Pressable>
            )}
            {eventBannerUri && event.eventPhotoUrl ? (
              <Pressable
                testID="event-detail-menu-open"
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowEventActionsSheet(true);
                }}
                style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden" }}
              >
                <BlurView intensity={30} tint="dark" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.15)" }}>
                  <MoreHorizontal size={22} color="#FFFFFF" />
                </BlurView>
              </Pressable>
            ) : (
              <Pressable
                testID="event-detail-menu-open"
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowEventActionsSheet(true);
                }}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
              >
                <MoreHorizontal size={22} color={colors.text} />
              </Pressable>
            )}
          </View>

          {/* Floating invite card */}
          <Animated.View entering={FadeInDown.delay(30).springify()} style={{ paddingTop: 2, paddingBottom: 14 }}>
            <InviteFlipCard
              title={event.title}
              imageUri={
                event.eventPhotoUrl && !event.isBusy && event.visibility !== "private"
                  ? toCloudinaryTransformedUrl(eventBannerUri!, CLOUDINARY_PRESETS.HERO_DETAIL)
                  : null
              }
              emoji={event.emoji}
              countdownLabel={countdownLabel}
              dateLabel={dateLabel}
              timeLabel={timeLabel}
              locationDisplay={locationDisplay}
              goingCount={effectiveGoingCount}
              attendeeAvatars={(() => {
                const hostId = event?.user?.id;
                const hostInList = attendeesList.find((a: AttendeeInfo) => a.id === hostId);
                const nonHost = attendeesList.filter((a: AttendeeInfo) => a.id !== hostId);
                const ordered: AttendeeInfo[] = [...(hostInList ? [hostInList] : []), ...nonHost];
                const hostFallback: AttendeeInfo | null = (!hostInList && event?.user)
                  ? { id: event.user.id ?? "host", name: event.user.name ?? "Host", imageUrl: event.user.image ?? null, isHost: true }
                  : null;
                return (hostFallback ? [hostFallback, ...ordered] : ordered).slice(0, 5);
              })()}
              description={event.description ?? null}
              hostName={event.user?.name ?? null}
              hostImageUrl={event.user?.image ?? null}
              isMyEvent={isMyEvent}
              capacity={eventMeta.capacity}
              currentGoing={effectiveGoingCount}
              themeColor={themeColor}
              isDark={isDark}
              colors={colors}
              themeId={event.themeId ?? null}
              editButton={
                isMyEvent && event.eventPhotoUrl && !event.isBusy && event.visibility !== "private" ? (
                  <RNAnimated.View style={{ transform: [{ scale: editScale }] }}>
                    <Pressable
                      onPress={() => {
                        if (__DEV__) devLog("[EVENT_HERO_EDIT_TAP]");
                        RNAnimated.sequence([
                          RNAnimated.timing(editScale, { toValue: 0.94, duration: 60, useNativeDriver: true }),
                          RNAnimated.timing(editScale, { toValue: 1, duration: 60, useNativeDriver: true }),
                        ]).start();
                        setShowPhotoSheet(true);
                      }}
                      style={{
                        borderRadius: 20,
                        padding: 8,
                        backgroundColor: "rgba(0,0,0,0.55)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.15)",
                      }}
                    >
                      <Pencil size={16} color="#fff" />
                    </Pressable>
                  </RNAnimated.View>
                ) : undefined
              }
              photoNudge={
                isMyEvent && !event.eventPhotoUrl && !event.isBusy && event.visibility !== "private" && !photoNudgeDismissed ? (
                  <Pressable
                    onPress={() => launchEventPhotoPicker()}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 12,
                      marginTop: 10,
                      backgroundColor: isDark ? "rgba(28,28,30,0.8)" : "rgba(255,255,255,0.8)",
                      borderWidth: 1,
                      borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
                      borderStyle: "dashed",
                      borderRadius: RADIUS.lg,
                    }}
                  >
                    <Camera size={18} color={isDark ? "#9CA3AF" : "#6B7280"} />
                    <Text style={{ fontSize: 14, marginLeft: 8, color: isDark ? "#9CA3AF" : colors.textSecondary }}>Add a cover photo</Text>
                    <Pressable
                      onPress={async (e) => {
                        e.stopPropagation();
                        setPhotoNudgeDismissed(true);
                        await AsyncStorage.setItem(`dismissedEventPhotoNudge_${id}`, "true");
                      }}
                      style={{ marginLeft: "auto", padding: 4 }}
                      hitSlop={8}
                    >
                      <X size={14} color={colors.textTertiary} />
                    </Pressable>
                  </Pressable>
                ) : undefined
              }
            />
          </Animated.View>

        </View>

        {/* ═══ SOCIAL ENERGY PULSE — attendee names below card ═══ */}
        {effectiveGoingCount > 0 && attendeesList.length > 0 && (
          <Animated.View entering={FadeInDown.delay(45).springify()}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 2, paddingBottom: 2 }}>
              {attendeesList.slice(0, 3).map((a: AttendeeInfo, i: number) => (
                <View key={a.id} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 3 - i }}>
                  <EntityAvatar
                    photoUrl={a.imageUrl ?? null}
                    initials={a.name ? a.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() : "?"}
                    size={20}
                  />
                </View>
              ))}
              <Text style={{ marginLeft: 8, fontSize: 13, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>
                {(() => {
                  const names = attendeesList.slice(0, 2).map((a: AttendeeInfo) => a.name?.split(" ")[0] ?? "Someone");
                  const remaining = effectiveGoingCount - names.length;
                  if (remaining > 0) return `${names.join(", ")} + ${remaining} going`;
                  return `${names.join(" & ")} going`;
                })()}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ═══ PRIMARY ACTION BAR (Task 3) ═══ */}
        {!isMyEvent && !event?.isBusy && (
          <Animated.View entering={FadeInDown.delay(80).springify()} style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4 }}>
            {hasJoinRequest ? (
              <Animated.View entering={FadeInDown.duration(300)}>
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 16,
                  paddingHorizontal: 18,
                  marginBottom: 18,
                  borderRadius: RADIUS.xxl,
                  backgroundColor: STATUS.going.bgSoft,
                  borderWidth: 0.5,
                  borderColor: STATUS.going.border,
                }}>
                  <Check size={18} color={STATUS.going.fg} />
                  <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: "600", color: STATUS.going.fg }}>You're Attending</Text>
                  <Text style={{ marginLeft: 6, fontSize: 13, color: colors.textSecondary }}>· on your calendar</Text>
                </View>
              </Animated.View>
            ) : (
              <View style={{ marginBottom: 18, padding: 16, borderRadius: RADIUS.xl, backgroundColor: isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.012)", borderWidth: 0.5, borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}>
                {/* [P0_RSVP] Proof log: Render RSVP state and count */}
                {__DEV__ && (() => {
                  devLog("[P0_RSVP]", "ui render", {
                    eventId: id,
                    myRsvpStatus,
                    totalGoing,
                    attendeesListCount: attendeesList.length,
                    isPending: rsvpMutation.isPending,
                  });
                  return null;
                })()}

                {/* Current RSVP status — compact inline */}
                {myRsvpStatus && (
                  <Animated.View entering={FadeInDown.duration(250)} style={{ marginBottom: 12 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        borderRadius: RADIUS.xl,
                        backgroundColor: myRsvpStatus === "going" ? STATUS.going.bgSoft :
                                         myRsvpStatus === "interested" ? STATUS.interested.bgSoft : colors.surface,
                        borderWidth: 1,
                        borderColor: myRsvpStatus === "going" ? STATUS.going.border :
                                     myRsvpStatus === "interested" ? STATUS.interested.border : colors.border,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {myRsvpStatus === "going" && <Check size={18} color={STATUS.going.fg} />}
                        {myRsvpStatus === "interested" && <Heart size={18} color={STATUS.interested.fg} />}
                        {myRsvpStatus === "not_going" && <X size={18} color={colors.textTertiary} />}
                        <Text style={{
                          marginLeft: 8,
                          fontSize: 15,
                          fontWeight: "600",
                          color: myRsvpStatus === "going" ? STATUS.going.fg :
                                 myRsvpStatus === "interested" ? STATUS.interested.fg : colors.textSecondary,
                        }}>
                          {myRsvpStatus === "going" ? "You're In" :
                           myRsvpStatus === "interested" ? "Saved" : "Not Going"}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setShowRsvpOptions(!showRsvpOptions)}
                        disabled={rsvpMutation.isPending}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textSecondary }}>Change</Text>
                      </Pressable>
                    </View>
                    {myRsvpStatus === "going" && (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          trackRsvpShareClicked({
                            eventId: event.id,
                            surface: "rsvp_confirmation",
                            visibility: event.visibility ?? "unknown",
                            hasCircleId: !!event.circleId,
                          });
                          shareEvent({ ...event, location: locationDisplay ?? null });
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          alignSelf: "flex-start",
                          marginTop: 8,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 16,
                          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                        }}
                      >
                        <Share2 size={14} color={themeColor} />
                        <Text style={{ fontSize: 13, fontWeight: "500", marginLeft: 6, color: themeColor }}>Share with friends</Text>
                      </Pressable>
                    )}
                  </Animated.View>
                )}

                {/* [GROWTH_V1] Inline success prompt — "Want to bring someone?" */}
                {showRsvpSuccessPrompt && myRsvpStatus === "going" && (
                  <Animated.View entering={FadeInDown.duration(300)} style={{ marginBottom: 10 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 14,
                        borderRadius: RADIUS.lg,
                        backgroundColor: isDark ? "#1C2520" : "#F0FDF4",
                        borderWidth: 1,
                        borderColor: STATUS.going.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: STATUS.going.fg }}>You're in!</Text>
                        <Text style={{ fontSize: 12, marginTop: 2, color: colors.textSecondary }}>Let friends know — share this event</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          trackRsvpSuccessPromptTap({ source: "event" });
                          trackInviteShared({ entity: "event", sourceScreen: "rsvp_success" });
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setShowRsvpSuccessPrompt(false);
                          if (event) shareEvent({ ...event, location: locationDisplay ?? null });
                        }}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, marginLeft: 8, backgroundColor: STATUS.going.fg }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF" }}>Share</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setShowRsvpSuccessPrompt(false)}
                        style={{ marginLeft: 8, padding: 4 }}
                      >
                        <X size={14} color={colors.textTertiary} />
                      </Pressable>
                    </View>
                  </Animated.View>
                )}

                {/* [SOCIAL_PROOF_V2] Momentum nudge above action buttons */}
                {!myRsvpStatus && !eventMeta.isFull && effectiveGoingCount >= 3 && (
                  <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 8,
                    marginBottom: 4,
                  }}>
                    <Users size={13} color={STATUS.going.fg} />
                    <Text style={{ fontSize: 12, fontWeight: "500", color: STATUS.going.fg, marginLeft: 5 }}>
                      {effectiveGoingCount >= 10
                        ? `${effectiveGoingCount} people are going — don\u2019t miss out`
                        : effectiveGoingCount >= 5
                        ? `${effectiveGoingCount} people are in — join them`
                        : `${effectiveGoingCount} people are going`}
                    </Text>
                  </View>
                )}

                {/* Primary action buttons — Going (primary) + Save (secondary) side-by-side */}
                {(!myRsvpStatus || showRsvpOptions) && (
                  <Animated.View style={rsvpButtonAnimStyle}>
                    {/* Full indicator */}
                    {eventMeta.isFull && myRsvpStatus !== "going" && (
                      <View style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 10,
                        marginBottom: 8,
                        borderRadius: RADIUS.sm,
                        backgroundColor: STATUS.destructive.bgSoft,
                      }}>
                        <Users size={14} color={STATUS.destructive.fg} />
                        <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "500", color: STATUS.destructive.fg }}>This invite is full</Text>
                      </View>
                    )}
                    {/* Pending indicator */}
                    {rsvpMutation.isPending && (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginBottom: 6 }}>
                        <ActivityIndicator size="small" color={themeColor} />
                        <Text style={{ marginLeft: 8, fontSize: 13, color: colors.textSecondary }}>Updating…</Text>
                      </View>
                    )}
                    {/* Two-button action bar */}
                    <View style={{ flexDirection: "row", gap: 12, opacity: rsvpMutation.isPending ? 0.6 : 1 }}>
                      {/* Going — Primary */}
                      {eventMeta.isFull && myRsvpStatus !== "going" ? (
                        <View style={{
                          flex: 1.2,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          paddingVertical: 16,
                          borderRadius: RADIUS.pill,
                          backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB",
                          opacity: 0.5,
                        }}>
                          <Users size={18} color={colors.textTertiary} />
                          <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: "600", color: colors.textTertiary }}>Full</Text>
                        </View>
                      ) : (
                        <Pressable
                          testID="event-detail-action-going"
                          onPress={() => handleRsvp("going")}
                          disabled={rsvpMutation.isPending}
                          style={({ pressed }) => ({
                            flex: 1.2,
                            flexDirection: "row" as const,
                            alignItems: "center" as const,
                            justifyContent: "center" as const,
                            paddingVertical: 16,
                            borderRadius: RADIUS.pill,
                            backgroundColor: myRsvpStatus === "going"
                              ? pageTheme.backAccent
                              : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)"),
                            borderWidth: myRsvpStatus === "going" ? 0 : 1.5,
                            borderColor: myRsvpStatus === "going" ? "transparent" : pageTheme.backAccent,
                            opacity: pressed ? 0.88 : 1,
                            ...(myRsvpStatus === "going" && Platform.OS === "ios" ? {
                              shadowColor: pageTheme.backAccent,
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.35,
                              shadowRadius: 12,
                            } : myRsvpStatus === "going" ? { elevation: 4 } : {}),
                          })}
                        >
                          <Check size={18} color={myRsvpStatus === "going" ? "#FFFFFF" : pageTheme.backAccent} />
                          <Text style={{
                            marginLeft: 8,
                            fontSize: 16,
                            fontWeight: "700",
                            color: myRsvpStatus === "going" ? "#FFFFFF" : pageTheme.backAccent,
                            letterSpacing: 0.2,
                          }}>
                            {myRsvpStatus === "going" ? "Going ✓" : "I'm In"}
                          </Text>
                        </Pressable>
                      )}

                      {/* Save — Secondary (ghost when inactive, accent tint when active) */}
                      <Pressable
                        testID="event-detail-action-save"
                        onPress={() => handleRsvp("interested")}
                        disabled={rsvpMutation.isPending}
                        style={({ pressed }) => ({
                          flex: 1,
                          flexDirection: "row" as const,
                          alignItems: "center" as const,
                          justifyContent: "center" as const,
                          paddingVertical: 16,
                          borderRadius: RADIUS.pill,
                          backgroundColor: myRsvpStatus === "interested"
                            ? (pageTheme.backAccent + "18")
                            : "transparent",
                          borderWidth: myRsvpStatus === "interested" ? 1 : 0.5,
                          borderColor: myRsvpStatus === "interested"
                            ? (pageTheme.backAccent + "40")
                            : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"),
                          opacity: pressed ? 0.88 : 1,
                        })}
                      >
                        <Heart size={18} color={myRsvpStatus === "interested" ? pageTheme.backAccent : colors.textTertiary} />
                        <Text style={{
                          marginLeft: 8,
                          fontSize: 15,
                          fontWeight: "600",
                          color: myRsvpStatus === "interested" ? pageTheme.backAccent : colors.textSecondary,
                        }}>
                          Save
                        </Text>
                      </Pressable>
                    </View>

                    {/* Not Going — tertiary text link */}
                    {myRsvpStatus && myRsvpStatus !== "not_going" && (
                      <Pressable
                        testID="event-detail-action-not-going"
                        onPress={() => handleRsvp("not_going")}
                        disabled={rsvpMutation.isPending}
                        style={{ alignSelf: "center", marginTop: 12, paddingVertical: 6 }}
                      >
                        <Text style={{ fontSize: 13, color: colors.textTertiary }}>Can't make it</Text>
                      </Pressable>
                    )}
                  </Animated.View>
                )}
                {/* [EVENT_LIVE_UI_2] Saved confirmation text */}
                {rsvpSavedVisible && (
                  <View style={{ alignItems: "center", marginTop: 6 }}>
                    <Text style={{ fontSize: 12, color: STATUS.interested.fg, fontWeight: "500" }}>Saved — you'll find this in your Saved tab</Text>
                  </View>
                )}
              </View>
            )}
          </Animated.View>
        )}

        {/* ═══ HOST TOOLS V2 — turnout tools + host guidance ═══ */}
        {isMyEvent && !event?.isBusy && (() => {
          const hasBringList = event?.bringListEnabled && (event?.bringListItems ?? []).length > 0;
          const bringItems = event?.bringListItems ?? [];
          const bringClaimed = bringItems.filter((i) => !!i.claimedByUserId).length;
          const hasPitchIn = event?.pitchInEnabled && event?.pitchInHandle;

          const startMs = new Date(event.startTime).getTime();
          const now = Date.now();
          const hoursUntil = (startMs - now) / (1000 * 60 * 60);
          const startsSoon = hoursUntil > 0 && hoursUntil <= 4;

          // ── Build reminder text ──
          const eventTitle = event.title ?? "the event";
          const eventLink = getEventUniversalLink(event.id);
          const reminderText = startsSoon
            ? `Hey \u2014 ${eventTitle} starts soon! Come through: ${eventLink}`
            : `${eventTitle} is coming up soon. You in? ${eventLink}`;

          return (
            <Animated.View entering={FadeInDown.delay(85).springify()} style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4 }}>
              {/* ── Compact action row ── */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                {/* Share */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    trackInviteShared({ entity: "event", sourceScreen: "host_tools" });
                    shareEvent({ ...event, location: locationDisplay ?? null });
                  }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: RADIUS.md,
                    backgroundColor: themeColor,
                  }}
                >
                  <Share2 size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", marginLeft: 6 }}>Share</Text>
                </Pressable>
                {/* Copy reminder */}
                <Pressable
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    try { await Clipboard.setStringAsync(reminderText); } catch {}
                    safeToast.success("Reminder copied");
                  }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: RADIUS.md,
                    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  }}
                >
                  <Copy size={14} color={colors.text} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 6 }}>Reminder</Text>
                </Pressable>
                {/* Edit */}
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push(`/event/edit/${id}`);
                  }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: RADIUS.md,
                    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  }}
                >
                  <Pencil size={14} color={colors.text} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 6 }}>Edit</Text>
                </Pressable>
              </View>

              {/* ── Coordination summaries ── */}
              {(hasBringList || hasPitchIn) && (
                <View style={{ marginTop: 10 }}>
                  {hasBringList && (
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                      <ListChecks size={13} color={colors.textSecondary} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                        What to bring: {bringClaimed}/{bringItems.length} claimed
                      </Text>
                    </View>
                  )}
                  {hasPitchIn && (
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                      <HandCoins size={13} color={colors.textSecondary} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                        Pitch In: {event.pitchInMethod === "venmo" ? "Venmo" : event.pitchInMethod === "cashapp" ? "Cash App" : event.pitchInMethod === "paypal" ? "PayPal" : ""} @{event.pitchInHandle}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </Animated.View>
          );
        })()}

        {/* Live Activity CTA moved to overflow menu — see Event Options sheet */}

        {/* ═══ ABOUT CARD — description + details + pitch-in + bring list ═══ */}
        <View style={{ backgroundColor: isDark ? "rgba(20,20,24,0.52)" : "rgba(255,255,255,0.76)", borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>

        {/* ═══ DESCRIPTION / VIBE ═══ */}
        {event.description && (
          <Animated.View entering={FadeInDown.delay(90).springify()} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" }}>
              About
            </Text>
            <Text
              style={{ fontSize: 15, lineHeight: 24, color: colors.text, letterSpacing: 0.05 }}
              numberOfLines={descriptionExpanded ? undefined : 4}
            >
              {event.description}
            </Text>
            {event.description.length > 200 && (
              <Pressable onPress={() => setDescriptionExpanded(!descriptionExpanded)} style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: themeColor }}>
                  {descriptionExpanded ? "Show less" : "Read more"}
                </Text>
              </Pressable>
            )}
          </Animated.View>
        )}

        {/* ═══ DETAILS BLOCK ═══ */}
        <Animated.View entering={FadeInDown.delay(95).springify()} style={{ marginBottom: 18 }}>
          {/* Get Directions */}
          {locationDisplay && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                openEventLocation(locationQuery ?? locationDisplay, event, event.id);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 14,
                paddingHorizontal: 16,
                marginBottom: 12,
                borderRadius: RADIUS.lg,
                backgroundColor: isDark ? "rgba(20,184,166,0.08)" : "rgba(20,184,166,0.05)",
                borderWidth: 0.5,
                borderColor: isDark ? "rgba(20,184,166,0.18)" : "rgba(20,184,166,0.15)",
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: isDark ? "rgba(20,184,166,0.15)" : "rgba(20,184,166,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Compass size={18} color="#14B8A6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }} numberOfLines={1}>{locationDisplay}</Text>
                <Text style={{ fontSize: 12, color: "#14B8A6", marginTop: 2, fontWeight: "500" }}>Get Directions</Text>
              </View>
              <ArrowRight size={16} color="#14B8A6" />
            </Pressable>
          )}

          {/* Visibility - Host only */}
          {isMyEvent && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
              {(() => {
                const isCircleTappable = event.visibility === "circle_only" && !!event.circleId;
                const RowWrapper = isCircleTappable ? Pressable : View;
                const rowProps = isCircleTappable
                  ? {
                      onPress: () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        devLog("[P0_EVENT_CIRCLE_LINK]", { circleId: event.circleId, eventId: event.id });
                        router.push(`/circle/${event.circleId}` as any);
                      },
                      accessibilityRole: "button" as const,
                      accessibilityLabel: "Open circle chat",
                    }
                  : {};
                return (
                  <RowWrapper className="flex-row items-center flex-1" {...rowProps}>
                    {event.isBusy ? (
                      <Users size={16} color={colors.textTertiary} />
                    ) : event.visibility === "all_friends" ? (
                      <Compass size={16} color={colors.textTertiary} />
                    ) : event.visibility === "circle_only" ? (
                      <Lock size={16} color={colors.textTertiary} />
                    ) : event.visibility === "private" ? (
                      <Lock size={16} color={colors.textTertiary} />
                    ) : (
                      <Users size={16} color={colors.textTertiary} />
                    )}
                    <Text style={{ fontSize: 13, marginLeft: 8, color: colors.textSecondary }}>
                      {event.isBusy ? "Only self" : event.visibility === "all_friends" ? "All Friends" : event.visibility === "circle_only" ? (event.circleName ? `Circle: ${event.circleName}` : "Circle Only") : event.visibility === "private" ? "Private" : "Specific Groups"}
                    </Text>
                    {isCircleTappable && <ChevronRight size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />}
                  </RowWrapper>
                );
              })()}
            </View>
          )}

          {/* Spots (Capacity) */}
          {eventMeta.capacity != null && (() => {
            const goingNow = eventMeta.goingCount ?? 0;
            const spotsRemaining = Math.max(0, eventMeta.capacity - goingNow);
            const almostFull = !eventMeta.isFull && spotsRemaining > 0 && spotsRemaining <= 3;
            return (
              <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
                <Users size={16} color={eventMeta.isFull ? STATUS.destructive.fg : almostFull ? STATUS.soon.fg : STATUS.going.fg} />
                <Text style={{ fontSize: 13, marginLeft: 8, color: eventMeta.isFull ? STATUS.destructive.fg : colors.textSecondary }}>
                  {goingNow} / {eventMeta.capacity} spots
                </Text>
                {eventMeta.isFull ? (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8, backgroundColor: STATUS.destructive.bgSoft }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: STATUS.destructive.fg }}>Full</Text>
                  </View>
                ) : almostFull ? (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8, backgroundColor: STATUS.soon.bgSoft }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS.soon.fg }}>
                      {spotsRemaining} {spotsRemaining === 1 ? "spot" : "spots"} left
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })()}
        </Animated.View>

        {/* ═══ PITCH IN V1 — Payment handle display ═══ */}
        {event?.pitchInEnabled && event?.pitchInHandle && (
          <Animated.View entering={FadeInDown.delay(92).springify()} style={{ marginBottom: 14 }}>
            <View style={{
              borderTopWidth: 0.5,
              borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
              paddingTop: 14,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <HandCoins size={16} color={themeColor} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, marginLeft: 8 }}>
                  {event.pitchInAmount ? "Suggested contribution" : "Optional contribution"}
                </Text>
                {event.pitchInAmount && (
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textSecondary, marginLeft: 6 }}>
                    {/^[\$€£¥]/.test(event.pitchInAmount) ? event.pitchInAmount : `$${event.pitchInAmount}`}
                  </Text>
                )}
              </View>
              {event.pitchInNote && (
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 10, lineHeight: 18 }}>
                  {event.pitchInNote}
                </Text>
              )}
              {/* Handle display row with inline copy pill */}
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: RADIUS.md,
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
              }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {event.pitchInMethod === "venmo" ? "Venmo" : event.pitchInMethod === "cashapp" ? "Cash App" : event.pitchInMethod === "paypal" ? "PayPal" : "Send to"}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, marginLeft: 8, flex: 1 }} numberOfLines={1}>
                  {(event.pitchInMethod === "venmo" || event.pitchInMethod === "cashapp") ? "@" : ""}{event.pitchInHandle}
                </Text>
                <Pressable
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const handle = (event.pitchInMethod === "venmo" || event.pitchInMethod === "cashapp") ? `@${event.pitchInHandle}` : event.pitchInHandle!;
                    try { await Clipboard.setStringAsync(handle); } catch {}
                    safeToast.success("Copied to clipboard");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginLeft: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 10,
                    backgroundColor: `${themeColor}14`,
                  }}
                >
                  <Copy size={12} color={themeColor} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: themeColor, marginLeft: 4 }}>Copy</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ═══ WHAT TO BRING V2 — Lightweight claim system ═══ */}
        {event?.bringListEnabled && (event?.bringListItems ?? []).length > 0 && (() => {
          const items = event.bringListItems ?? [];
          const unclaimed = items.filter((i) => !i.claimedByUserId);
          const claimed = items.filter((i) => !!i.claimedByUserId);
          const myId = session?.user?.id;
          return (
            <Animated.View entering={FadeInDown.delay(93).springify()} style={{ marginBottom: 14 }}>
              <View style={{
                borderTopWidth: 0.5,
                borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                paddingTop: 14,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                  <ListChecks size={16} color={themeColor} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, marginLeft: 8 }}>
                    What to bring
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary, marginLeft: 8 }}>
                    {claimed.length}/{items.length} claimed
                  </Text>
                </View>
                {/* Unclaimed items first */}
                {unclaimed.length > 0 && (
                  <View style={{ gap: 6, marginBottom: claimed.length > 0 ? 6 : 0 }}>
                    {/* INVARIANT_ALLOW_SMALL_MAP */}
                    {unclaimed.map((item) => (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: RADIUS.md,
                          backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                        }}
                      >
                        <View style={{
                          width: 6, height: 6, borderRadius: 3,
                          backgroundColor: colors.textTertiary,
                          marginRight: 10,
                        }} />
                        <Text style={{ fontSize: 14, color: colors.text, flex: 1 }}>{item.label}</Text>
                        <Pressable
                          onPress={() => {
                            Haptics.selectionAsync();
                            bringListClaimMutation.mutate({ itemId: item.id, action: "claim" });
                          }}
                          disabled={bringListClaimMutation.isPending}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 8,
                            backgroundColor: `${themeColor}14`,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "600", color: themeColor }}>I'll bring this</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
                {/* Claimed items */}
                {claimed.length > 0 && (
                  <View style={{ gap: 6 }}>
                    {/* INVARIANT_ALLOW_SMALL_MAP */}
                    {claimed.map((item) => {
                      const isMine = item.claimedByUserId === myId;
                      return (
                        <View
                          key={item.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: RADIUS.md,
                            backgroundColor: isMine
                              ? (isDark ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.05)")
                              : (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)"),
                          }}
                        >
                          <Check size={14} color={STATUS.going.fg} style={{ marginRight: 10 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, color: colors.text }}>{item.label}</Text>
                            <Text style={{ fontSize: 11, color: isMine ? STATUS.going.fg : colors.textTertiary, marginTop: 1 }}>
                              {isMine ? "You're bringing this" : `${item.claimedByName ?? "Someone"}`}
                            </Text>
                          </View>
                          {isMine && (
                            <Pressable
                              onPress={() => {
                                Haptics.selectionAsync();
                                bringListClaimMutation.mutate({ itemId: item.id, action: "unclaim" });
                              }}
                              disabled={bringListClaimMutation.isPending}
                              hitSlop={8}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textTertiary }}>Unclaim</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </Animated.View>
          );
        })()}

        </View>{/* close About card */}

        {/* ═══ WHO'S COMING CARD ═══ */}
        <View style={{ backgroundColor: isDark ? "rgba(20,20,24,0.52)" : "rgba(255,255,255,0.76)", borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>

        {/* ═══ Who's Coming / Social Proof (Task 4 — reduced card fatigue) ═══ */}
        {(() => {
          // 403 privacy denied: show privacy message
          if (attendeesPrivacyDenied) {
            return (
              <Animated.View entering={FadeInDown.delay(95).springify()}>
                <View style={{ paddingVertical: 14, marginBottom: 10, borderTopWidth: 0.5, borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Lock size={16} color="#9CA3AF" />
                    <Text style={{ fontSize: 14, fontWeight: "600", marginLeft: 8, color: colors.text }}>
                      Who's Coming
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 6 }}>
                    Attendees visible to invited or going members
                  </Text>
                </View>
              </Animated.View>
            );
          }

          // Has attendees: show compact roster preview (1-row avatar stack)
          if (effectiveGoingCount > 0 || attendeesList.length > 0) {
            const STACK_MAX = 5;
            const AVATAR_SIZE = 40;
            const OVERLAP = 11;
            const hostId = event?.user?.id;
            const hostInList = attendeesList.find(a => a.id === hostId);
            const nonHostAttendees = attendeesList.filter(a => a.id !== hostId);
            const orderedForStack: AttendeeInfo[] = [
              ...(hostInList ? [hostInList] : []),
              ...nonHostAttendees,
            ];
            const hostAttendee: AttendeeInfo | null = (!hostInList && event?.user) ? {
              id: event.user.id ?? 'host',
              name: event.user.name ?? 'Host',
              imageUrl: event.user.image ?? null,
              isHost: true,
            } : null;
            const stackSource = hostAttendee ? [hostAttendee, ...orderedForStack] : orderedForStack;
            const visibleAvatars = stackSource.slice(0, STACK_MAX);
            const overflowCount = Math.max(0, effectiveGoingCount - visibleAvatars.length);
            const stackWidth = visibleAvatars.length * (AVATAR_SIZE - OVERLAP) + OVERLAP + (overflowCount > 0 ? AVATAR_SIZE - OVERLAP + OVERLAP : 0);

            return (
              <Animated.View entering={FadeInDown.delay(100).springify()} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
                  Who's Coming
                </Text>
                <Pressable
                  testID="event-detail-whos-coming-open"
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowAttendeesModal(true);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    borderRadius: RADIUS.lg,
                    backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)",
                    borderWidth: 0.5,
                    borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  }}
                >
                  {/* Avatar stack */}
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <View style={{ width: stackWidth, height: AVATAR_SIZE, flexDirection: "row" }}>
                      {visibleAvatars.map((attendee, idx) => {
                        const isHostAvatar = attendee.id === hostId || attendee.isHost;
                        return (
                          <View
                            key={attendee.id}
                            style={{
                              position: "absolute",
                              left: idx * (AVATAR_SIZE - OVERLAP),
                              width: AVATAR_SIZE,
                              height: AVATAR_SIZE,
                              borderRadius: AVATAR_SIZE / 2,
                              backgroundColor: isHostAvatar ? (isDark ? "#3C2A1A" : "#FFF7ED") : "#DCFCE7",
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 2,
                              borderColor: isHostAvatar ? (isDark ? "#92400E" : "#FDBA74") : "#BBF7D0",
                              zIndex: visibleAvatars.length - idx,
                            }}
                          >
                            <EntityAvatar
                              photoUrl={attendee.imageUrl}
                              initials={attendee.name?.[0] ?? "?"}
                              size={AVATAR_SIZE - 4}
                              backgroundColor={isHostAvatar ? (isDark ? "#3C2A1A" : "#FFF7ED") : "#DCFCE7"}
                              foregroundColor={isHostAvatar ? "#92400E" : "#166534"}
                            />
                          </View>
                        );
                      })}
                      {overflowCount > 0 && (
                        <View
                          style={{
                            position: "absolute",
                            left: visibleAvatars.length * (AVATAR_SIZE - OVERLAP),
                            width: AVATAR_SIZE,
                            height: AVATAR_SIZE,
                            borderRadius: AVATAR_SIZE / 2,
                            backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 2,
                            borderColor: isDark ? "#3C3C3E" : "#E5E7EB",
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textSecondary }}>
                            +{overflowCount}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ marginLeft: 10, fontSize: 13, fontWeight: "500", color: colors.textSecondary }}>
                      {myRsvpStatus === "going" && effectiveGoingCount === 1
                        ? "You\u2019re in — be the first to invite friends"
                        : myRsvpStatus === "going" && effectiveGoingCount === 2
                        ? "You + 1 other going"
                        : myRsvpStatus === "going" && effectiveGoingCount > 2
                        ? `You + ${effectiveGoingCount - 1} others going`
                        : effectiveGoingCount >= 10
                        ? `${effectiveGoingCount} going \u00B7 Popular`
                        : effectiveGoingCount >= 5
                        ? `${effectiveGoingCount} going \u00B7 Filling up`
                        : `${effectiveGoingCount} going`}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: `${themeColor}12` }}>
                    <Text style={{ color: themeColor, fontSize: 13, fontWeight: "600" }}>View all</Text>
                    <ChevronRight size={14} color={themeColor} style={{ marginLeft: 2 }} />
                  </View>
                </Pressable>
              </Animated.View>
            );
          }

          // No one coming yet - warm, inviting placeholder
          return (
            <Animated.View entering={FadeInDown.delay(95).springify()}>
              <View style={{ paddingVertical: 14, marginBottom: 10, borderTopWidth: 0.5, borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{
                    width: 28, height: 28, borderRadius: 14,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: STATUS.going.bgSoft,
                  }}>
                    <Users size={14} color={STATUS.going.fg} />
                  </View>
                  <Text style={{ fontSize: 13, marginLeft: 8, color: colors.textSecondary }}>
                    {isMyEvent ? "No one\u2019s joined yet \u2014 share to get the word out" : "Be the first to join this event"}
                  </Text>
                </View>
              </View>
            </Animated.View>
          );
        })()}

        {/* Interested Users Section */}
        {interests.length > 0 && (
          <Animated.View entering={FadeInDown.delay(110).springify()} className="mb-3">
            <Pressable
              onPress={() => setShowInterestedUsers(!showInterestedUsers)}
              className="flex-row items-center justify-between"
            >
              <View className="flex-row items-center">
                <Heart size={16} color="#EC4899" />
                <Text className="font-semibold ml-2" style={{ color: colors.text }}>
                  {interests.length} Interested
                </Text>
              </View>
              <ChevronRight
                size={18}
                color={colors.textTertiary}
                style={{ transform: [{ rotate: showInterestedUsers ? "90deg" : "0deg" }] }}
              />
            </Pressable>
            {showInterestedUsers && (
              <View className="mt-3 flex-row flex-wrap">
                {interests.map((interest) => (
                  <View
                    key={interest.id}
                    className="flex-row items-center rounded-full px-3 py-1.5 mr-2 mb-2"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
                  >
                    <EntityAvatar
                      photoUrl={interest.user.image}
                      initials={interest.user.name?.[0] ?? "?"}
                      size={24}
                      backgroundColor="#EC489930"
                      foregroundColor="#EC4899"
                      style={{ marginRight: 8 }}
                    />
                    <Text className="text-sm" style={{ color: colors.text }}>
                      {interest.user.name ?? "Unknown"}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* Interested Count for Event Owners */}
        {isMyEvent && interests.length > 0 && (
          <Animated.View entering={FadeInDown.delay(115).springify()} className="mb-3">
            <View
              className="rounded-xl p-4 flex-row items-center"
              style={{ backgroundColor: "#EC489910", borderWidth: 1, borderColor: "#EC489930" }}
            >
              <Heart size={20} color="#EC4899" />
              <View className="ml-3 flex-1">
                <Text className="font-semibold" style={{ color: colors.text }}>
                  {interests.length} people interested
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  They might attend if the timing works
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        </View>{/* close Who's Coming card */}

        {/* ═══ DISCUSSION CARD ═══ */}
        <View style={{ backgroundColor: isDark ? "rgba(20,20,24,0.52)" : "rgba(255,255,255,0.76)", borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>

        {/* Comments Section */}
        <Animated.View entering={FadeInDown.delay(130).springify()}>
          <View className="mb-3">
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Discussion
              </Text>
              {comments.length > 0 && (
                <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: `${themeColor}14` }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: themeColor }}>
                    {comments.length}
                  </Text>
                </View>
              )}
            </View>

            {/* Conversation encouragement for events with attendees */}
            {event.joinRequests && event.joinRequests.filter((r) => r.status === "accepted").length >= 2 && comments.length === 0 && (
              <View
                className="rounded-xl p-3 mb-3 flex-row items-center"
                style={{ backgroundColor: `${themeColor}15`, borderWidth: 1, borderColor: `${themeColor}30` }}
              >
                <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${themeColor}25` }}>
                  <MessageCircle size={16} color={themeColor} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium" style={{ color: colors.text }}>
                    Start the conversation!
                  </Text>
                  <Text className="text-xs" style={{ color: colors.textSecondary }}>
                    Coordinate plans with others who are attending
                  </Text>
                </View>
              </View>
            )}

            {/* Comment Input */}
            <View className="rounded-2xl p-4 mb-3" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
              {commentImage && (
                <View className="mb-3 relative">
                  {/* INVARIANT_ALLOW_RAW_IMAGE_CONTENT — comment image preview, Cloudinary-transformed */}
                  <ExpoImage
                    source={{ uri: toCloudinaryTransformedUrl(commentImage, CLOUDINARY_PRESETS.THUMBNAIL_SQUARE) }}
                    style={{ width: "100%", height: 160, borderRadius: 12 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                    priority="normal"
                  />
                  <Pressable
                    onPress={() => setCommentImage(null)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full items-center justify-center"
                    style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
                  >
                    <X size={16} color="#fff" />
                  </Pressable>
                </View>
              )}
              <View className="flex-row items-end">
                <View className="flex-1 rounded-xl mr-2" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                  <TextInput
                    testID="event-detail-comment-input"
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder="Add a comment..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    className="p-3 max-h-24"
                    style={{ color: colors.text }}
                  />
                </View>
                <Pressable
                  onPress={handlePickImage}
                  disabled={isUploadingImage}
                  className="w-10 h-10 rounded-full items-center justify-center mr-2"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  {isUploadingImage ? (
                    <ActivityIndicator size="small" color={themeColor} />
                  ) : (
                    <ImagePlus size={20} color={commentImage ? themeColor : "#9CA3AF"} />
                  )}
                </Pressable>
                <Pressable
                  testID="event-detail-comment-submit"
                  onPress={handlePostComment}
                  disabled={createCommentMutation.isPending || isUploadingImage || (!commentText.trim() && !commentImage)}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: commentText.trim() || commentImage ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB"
                  }}
                >
                  {createCommentMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MessageCircle size={18} color={commentText.trim() || commentImage ? "#fff" : "#9CA3AF"} />
                  )}
                </Pressable>
              </View>
            </View>

            {/* Comments List */}
            {isLoadingComments ? (
              <View className="items-center py-8">
                <ActivityIndicator size="small" color={themeColor} />
              </View>
            ) : comments.length === 0 ? (
              <View className="rounded-xl p-6 items-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                <MessageCircle size={32} color="#9CA3AF" />
                <Text className="font-medium mt-2" style={{ color: colors.text }}>
                  No messages yet
                </Text>
                <Text className="text-center text-sm mt-1 mb-4" style={{ color: colors.textSecondary }}>
                  Break the ice! Start a conversation
                </Text>
                {/* [DISCUSS_PROMPTS] Smart conversation starters */}
                <View className="w-full">
                  <Text className="text-xs font-medium mb-2" style={{ color: colors.textTertiary }}>
                    Try asking:
                  </Text>
                  {(() => {
                    const prompts = getDiscussionPrompts({
                      eventId: event?.id,
                      title: event?.title ?? undefined,
                      description: event?.description ?? undefined,
                      locationName: event?.location ?? undefined,
                      startAt: event?.startTime ?? undefined,
                      endAt: event?.endTime ?? undefined,
                      isHost: isMyEvent,
                      visibility: event?.visibility ?? undefined,
                    });
                    if (__DEV__) {
                      devLog("[DISCUSS_PROMPTS]", `eventId=${event?.id?.slice(0, 8)} tags=${inferEventTags(event?.title ?? undefined, event?.location ?? undefined, event?.description ?? undefined).join(",")||"none"} prompts="${prompts.map(p=>p.text).join("|")}"`);
                    }
                    return prompts;
                  })().map((prompt) => (
                    <Pressable
                      key={prompt.id}
                      onPress={() => setCommentText(prompt.text)}
                      className="rounded-lg p-2 mb-1"
                      style={{ backgroundColor: isDark ? "#3C3C3E" : "#F3F4F6" }}
                    >
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        {prompt.text}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View>
                {comments.map((comment, index) => (
                  <Animated.View
                    key={comment.id}
                    entering={FadeIn.delay(index * 50)}
                  >
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        router.push(`/user/${comment.userId}` as any);
                      }}
                      className="rounded-xl p-4 mb-2"
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                    >
                      <View className="flex-row">
                        <EntityAvatar
                          photoUrl={comment.user.image}
                          initials={comment.user.name?.[0] ?? "?"}
                          size={40}
                          backgroundColor={isDark ? "#2C2C2E" : "#FFF7ED"}
                          foregroundColor={themeColor}
                          style={{ marginRight: 12 }}
                        />
                        <View className="flex-1">
                          <View className="flex-row items-center justify-between">
                            <Text className="font-semibold" style={{ color: colors.text }}>
                              {comment.user.name ?? "User"}
                            </Text>
                            <View className="flex-row items-center">
                              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                                {formatTimeAgo(comment.createdAt)}
                              </Text>
                              {(comment.userId === session?.user?.id || isMyEvent) && (
                                <Pressable
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleDeleteComment(comment.id);
                                  }}
                                  className="ml-2 p-1"
                                >
                                  <Trash2 size={14} color="#9CA3AF" />
                                </Pressable>
                              )}
                            </View>
                          </View>
                          {comment.content && (
                            <Text className="mt-1" style={{ color: colors.textSecondary }}>{comment.content}</Text>
                          )}
                          {comment.imageUrl && (
                            // INVARIANT_ALLOW_RAW_IMAGE_CONTENT — comment image display, Cloudinary-transformed
                            <ExpoImage
                              source={{ uri: toCloudinaryTransformedUrl(comment.imageUrl, CLOUDINARY_PRESETS.THUMBNAIL_SQUARE) }}
                              style={{ width: "100%", height: 192, borderRadius: 12, marginTop: 8 }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              transition={200}
                              priority="normal"
                            />
                          )}
                        </View>
                      </View>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            )}
          </View>
        </Animated.View>

        {/* ═══ V4.1 Compact Memories Row — low-emphasis, expandable ═══ */}
        {(() => {
          const memoriesPhotos: { imageUrl: string }[] =
            (queryClient.getQueryData(eventKeys.photos(event.id)) as any)?.photos ?? [];
          const hasMemories = memoriesPhotos.length > 0;
          const isPastForMemories = startDate < new Date();

          // 0 photos AND event hasn't happened yet → hide entirely
          if (!hasMemories && !isPastForMemories) return null;

          return (
            <Animated.View entering={FadeInDown.delay(130).springify()}>
              {showMemoriesExpanded ? (
                <EventPhotoGallery
                  eventId={event.id}
                  eventTitle={event.title}
                  eventTime={startDate}
                  isOwner={isMyEvent}
                />
              ) : (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowMemoriesExpanded(true);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    marginBottom: 10,
                    borderTopWidth: 0.5,
                    borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                  }}
                >
                  {/* Thumbnail preview (first photo or camera icon) */}
                  {hasMemories && memoriesPhotos[0]?.imageUrl ? (
                    <View style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", marginRight: 12 }}>
                      <ExpoImage
                        source={{ uri: toCloudinaryTransformedUrl(memoriesPhotos[0].imageUrl, CLOUDINARY_PRESETS.AVATAR_THUMB) }}
                        style={{ width: 36, height: 36 }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </View>
                  ) : (
                    <View style={{
                      width: 36, height: 36, borderRadius: 10, marginRight: 12,
                      alignItems: "center", justifyContent: "center",
                      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                    }}>
                      <Camera size={16} color={colors.textTertiary} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                      {hasMemories ? "Memories" : "Add memories"}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>
                      {hasMemories
                        ? `${memoriesPhotos.length} photo${memoriesPhotos.length !== 1 ? "s" : ""}`
                        : "Share moments from this event"}
                    </Text>
                  </View>

                  {hasMemories && (
                    <View style={{
                      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                      backgroundColor: `${themeColor}14`,
                      marginRight: 4,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: themeColor }}>
                        {memoriesPhotos.length}
                      </Text>
                    </View>
                  )}
                  <ChevronRight size={16} color={colors.textTertiary} />
                </Pressable>
              )}
            </Animated.View>
          );
        })()}

        </View>{/* close Discussion card */}

        {/* ═══ [EVENT_LIVE_UI] Collapsed Event Settings ═══ */}
        <Animated.View entering={FadeInDown.delay(140).springify()} style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <View className="rounded-2xl" style={{ backgroundColor: isDark ? "rgba(20,20,24,0.52)" : "rgba(255,255,255,0.76)", borderRadius: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setSettingsExpanded((prev) => !prev);
              }}
              className="flex-row items-center justify-between p-4"
            >
              <View className="flex-row items-center">
                <Settings size={18} color={colors.textSecondary} />
                <Text className="ml-2 font-semibold text-sm" style={{ color: colors.text }}>
                  Event settings
                </Text>
              </View>
              {settingsExpanded ? (
                <ChevronUp size={18} color={colors.textTertiary} />
              ) : (
                <ChevronDown size={18} color={colors.textTertiary} />
              )}
            </Pressable>

            {settingsExpanded && (
              <View className="px-4 pb-4">
                {/* Sync to Calendar Button / Synced Badge */}
                <View className="py-3 border-t" style={{ borderColor: colors.border }}>
                  {isCheckingSync ? (
                    <View className="flex-row items-center justify-center">
                      <ActivityIndicator size="small" color={colors.textTertiary} />
                    </View>
                  ) : isSynced ? (
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <View
                          className="w-8 h-8 rounded-full items-center justify-center mr-2"
                          style={{ backgroundColor: "#22C55E20" }}
                        >
                          <CalendarCheck size={16} color="#22C55E" />
                        </View>
                        <View>
                          <Text className="font-semibold text-sm" style={{ color: "#22C55E" }}>
                            Synced to Calendar
                          </Text>
                          <Text className="text-xs" style={{ color: colors.textTertiary }}>
                            Tap to update
                          </Text>
                        </View>
                      </View>
                      <Button
                        variant="secondary"
                        size="sm"
                        label="Update"
                        onPress={handleSyncToCalendar}
                        disabled={isSyncing}
                        loading={isSyncing}
                        leftIcon={!isSyncing ? <RefreshCw size={14} color={themeColor} /> : undefined}
                      />
                    </View>
                  ) : (
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1">
                        <Calendar size={18} color={themeColor} />
                        <View className="ml-2">
                          <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                            Sync to Calendar
                          </Text>
                          <Text className="text-xs" style={{ color: colors.textSecondary }}>
                            Add to your device calendar
                          </Text>
                        </View>
                      </View>
                      <Button
                        variant="primary"
                        size="sm"
                        label="Sync"
                        onPress={handleSyncToCalendar}
                        disabled={isSyncing}
                        loading={isSyncing}
                      />
                    </View>
                  )}
                </View>

                {/* More Options Button - Opens modal for Google Calendar etc. */}
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowSyncModal(true);
                  }}
                  className="flex-row items-center justify-center py-2"
                >
                  <Text className="text-xs" style={{ color: colors.textTertiary }}>
                    More calendar options
                  </Text>
                  <ChevronRight size={14} color={colors.textTertiary} />
                </Pressable>

                {/* Event Reminders */}
                <EventReminderPicker
                  eventId={event.id}
                  eventTitle={event.title}
                  eventEmoji={event.emoji}
                  eventTime={startDate}
                  selectedReminders={selectedReminders}
                  onRemindersChange={setSelectedReminders}
                />

                {/* Mute Event Notifications */}
                <View className="py-3 border-t" style={{ borderColor: colors.border }}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 mr-3">
                      <Bell size={18} color={isEventMuted ? colors.textTertiary : themeColor} />
                      <View className="ml-3">
                        <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                          Mute this event
                        </Text>
                        <Text className="text-xs" style={{ color: colors.textSecondary }}>
                          Stops push notifications for this event.{"\n"}Activity will still show updates.
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={isEventMuted}
                      onValueChange={(value) => muteMutation.mutate(value)}
                      disabled={isLoadingMute || muteMutation.isPending}
                      trackColor={{ false: isDark ? "#3C3C3E" : "#E5E7EB", true: themeColor + "80" }}
                      thumbColor={isEventMuted ? themeColor : isDark ? "#6B6B6B" : "#f4f3f4"}
                    />
                  </View>
                </View>

                {/* Post-event reflection toggle (host only) */}
                {isMyEvent && !event.isBusy && (() => {
                  const reflectionEnabled = event.reflectionEnabled === true;
                  if (__DEV__) devLog("[P0_EVENT_REFLECTION_DEFAULT]", "toggle_render", { raw: event.reflectionEnabled, resolved: reflectionEnabled, eventId: id });
                  return (
                    <View className="py-3 border-t" style={{ borderColor: colors.border }}>
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center flex-1 mr-3">
                          <NotebookPen size={18} color={colors.textSecondary} />
                          <View className="ml-3">
                            <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                              Post-event reflection
                            </Text>
                            <Text className="text-xs" style={{ color: colors.textTertiary }}>
                              Get a reminder to rate and reflect after it ends
                            </Text>
                          </View>
                        </View>
                        <Switch
                          testID="event-detail-settings-reflection"
                          value={reflectionEnabled}
                          onValueChange={(value) => toggleReflectionMutation.mutate(value)}
                          trackColor={{ false: isDark ? "#3C3C3E" : "#E5E7EB", true: themeColor + "80" }}
                          thumbColor={reflectionEnabled ? themeColor : isDark ? "#6B6B6B" : "#f4f3f4"}
                          disabled={toggleReflectionMutation.isPending}
                        />
                      </View>
                    </View>
                  );
                })()}
              </View>
            )}
          </View>
        </Animated.View>

        {/* ═══ [EVENT_LIVE_UI] Host Reflection (post-event) ═══ */}
        {isMyEvent && !event.isBusy && (() => {
          const eventEndTime = event.endTime ? new Date(event.endTime) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
          const hasEnded = new Date() > eventEndTime;
          const hasSummary = event.summary && event.summary.length > 0;
          const reflectionEnabled = event.reflectionEnabled === true;

          // Only show full reflection card after event ends with data
          if (!hasEnded || (!reflectionEnabled && !hasSummary)) return null;

          return (
            <Animated.View entering={FadeInDown.delay(150).springify()} style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <View className="rounded-2xl p-5" style={{ backgroundColor: isDark ? "rgba(20,20,24,0.52)" : "rgba(255,255,255,0.76)", borderRadius: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <NotebookPen size={20} color={themeColor} />
                    <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                      Your Reflection
                    </Text>
                  </View>
                  <View className="px-2 py-1 rounded-full" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>Private</Text>
                  </View>
                </View>

                {hasSummary ? (
                  <View>
                    {event.summaryRating && (
                      <View className="flex-row items-center mb-3">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={18}
                            color={star <= event.summaryRating! ? "#F59E0B" : isDark ? "#3C3C3E" : "#E5E7EB"}
                          />
                        ))}
                      </View>
                    )}
                    <Text style={{ color: colors.text, lineHeight: 22 }}>
                      {event.summary}
                    </Text>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setShowSummaryModal(true);
                      }}
                      className="mt-3 flex-row items-center"
                    >
                      <Pencil size={14} color={themeColor} />
                      <Text className="ml-1 font-medium" style={{ color: themeColor }}>
                        Edit reflection
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setShowSummaryModal(true);
                      }}
                      className="rounded-xl p-4 items-center"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}
                    >
                      <View className="flex-row items-center mb-2">
                        <Star size={20} color="#F59E0B" />
                        <Text className="ml-2 font-semibold" style={{ color: colors.text }}>
                          How did it go?
                        </Text>
                      </View>
                      <Text className="text-sm text-center" style={{ color: colors.textSecondary }}>
                        Take a moment to reflect on this event. Add notes and rate how it went!
                      </Text>
                      <View
                        className="mt-3 px-4 py-2 rounded-full"
                        style={{ backgroundColor: themeColor }}
                      >
                        <Text className="text-white font-medium">Add Reflection</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => toggleReflectionMutation.mutate(false)}
                      disabled={toggleReflectionMutation.isPending}
                      className="mt-3 items-center"
                    >
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>
                        Don't ask for this event
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </Animated.View>
          );
        })()}

      </KeyboardAwareScrollView>

      {/* Calendar Sync Modal */}
      <Modal
        visible={showSyncModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSyncModal(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowSyncModal(false)}
        >
          <Pressable onPress={() => {}} className="mx-4 mb-8">
            <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surface }}>
              {/* Header */}
              <View className="px-5 py-4 border-b" style={{ borderColor: colors.border }}>
                <Text className="text-lg font-bold text-center" style={{ color: colors.text }}>
                  Sync to Calendar
                </Text>
                <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                  Choose where to add this event
                </Text>
              </View>

              {/* Google Calendar Option */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowSyncModal(false);
                  openGoogleCalendar({ ...event, location: locationDisplay ?? null });
                }}
                className="flex-row items-center px-5 py-4 border-b"
                style={{ borderColor: colors.border }}
              >
                <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: "#4285F4" + "15" }}>
                  <Text className="text-2xl">📅</Text>
                </View>
                <View className="flex-1 ml-4">
                  <Text className="font-semibold text-base" style={{ color: colors.text }}>
                    Google Calendar
                  </Text>
                  <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                    Opens in browser to add event
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textTertiary} />
              </Pressable>

              {/* Apple Calendar Option */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowSyncModal(false);
                  addToDeviceCalendar({ ...event, location: locationDisplay ?? null }, safeToast);
                }}
                className="flex-row items-center px-5 py-4"
              >
                <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: "#FF3B30" + "15" }}>
                  <Text className="text-2xl">🗓️</Text>
                </View>
                <View className="flex-1 ml-4">
                  <Text className="font-semibold text-base" style={{ color: colors.text }}>
                    Apple Calendar
                  </Text>
                  <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                    Adds event directly to calendar
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textTertiary} />
              </Pressable>
            </View>

            {/* Cancel Button */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowSyncModal(false);
              }}
              className="rounded-2xl items-center py-4 mt-2"
              style={{ backgroundColor: colors.surface }}
            >
              <Text className="font-semibold text-base" style={{ color: colors.text }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Event Summary Modal */}
      <EventSummaryModal
        visible={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        eventId={event.id}
        eventTitle={event.title}
        eventEmoji={event.emoji}
        eventDate={startDate}
        attendeeCount={event.joinRequests?.filter((r) => r.status === "accepted").length ?? 0}
        existingSummary={event.summary}
        existingRating={event.summaryRating}
      />

      <ConfirmModal
        visible={showDeleteCommentConfirm}
        title="Delete Comment"
        message="Are you sure you want to delete this comment?"
        confirmText="Delete"
        isDestructive
        onConfirm={confirmDeleteComment}
        onCancel={() => {
          setShowDeleteCommentConfirm(false);
          setCommentToDelete(null);
        }}
      />

      <ConfirmModal
        visible={showRemoveRsvpConfirm}
        title="Remove RSVP?"
        message="You can RSVP again anytime."
        confirmText="Remove"
        cancelText="Keep RSVP"
        isDestructive
        onConfirm={confirmRemoveRsvp}
        onCancel={() => setShowRemoveRsvpConfirm(false)}
      />

      <ConfirmModal
        visible={showDeleteEventConfirm}
        title="Delete Event"
        message="This will permanently delete the event for everyone. This can't be undone."
        confirmText="Delete"
        isDestructive
        onConfirm={() => {
          setShowDeleteEventConfirm(false);
          deleteEventMutation.mutate();
        }}
        onCancel={() => setShowDeleteEventConfirm(false)}
      />

      {/* Prompt arbitration: exactly one modal per RSVP success */}
      <FirstRsvpNudge
        visible={rsvpPromptChoice === "first_rsvp_nudge"}
        onPrimary={handleFirstRsvpNudgePrimary}
        onSecondary={handleFirstRsvpNudgeSecondary}
        onDismiss={handleFirstRsvpNudgeDismiss}
      />

      <PostValueInvitePrompt
        visible={rsvpPromptChoice === "post_value_invite"}
        surface="rsvp"
        onClose={handlePostValueInviteClose}
      />

      <NotificationPrePromptModal
        visible={rsvpPromptChoice === "notification"}
        onClose={() => setRsvpPromptChoice("none")}
        userId={session?.user?.id}
      />

      {/* Event Actions Bottom Sheet (uses shared BottomSheet) */}
      <BottomSheet
        visible={showEventActionsSheet}
        onClose={() => setShowEventActionsSheet(false)}
        heightPct={0}
        backdropOpacity={0.5}
        title="Event Options"
      >
              {/* Actions */}
              <View style={{ paddingHorizontal: 20 }}>
                {/* Owner Actions */}
                {isMyEvent && !event?.isBusy && (
                  <>
                    <Pressable
                      testID="event-detail-menu-edit"
                      className="flex-row items-center py-4"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                      onPress={() => {
                        setShowEventActionsSheet(false);
                        Haptics.selectionAsync();
                        router.push(`/event/edit/${id}`);
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                      >
                        <Pencil size={20} color={themeColor} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: 16 }}>Edit Event</Text>
                    </Pressable>

                    <Pressable
                      className="flex-row items-center py-4"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                      onPress={() => {
                        setShowEventActionsSheet(false);
                        handleDuplicateEvent();
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                      >
                        <Copy size={20} color={themeColor} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: 16 }}>Duplicate Event</Text>
                    </Pressable>

                    <Pressable
                      className="flex-row items-center py-4"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                      onPress={() => {
                        setShowEventActionsSheet(false);
                        Haptics.selectionAsync();
                        setTimeout(() => launchEventPhotoPicker(), 350);
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                      >
                        <Camera size={20} color={themeColor} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: 16 }}>
                        {event?.eventPhotoUrl ? "Change Banner Photo" : "Add Banner Photo"}
                      </Text>
                    </Pressable>
                  </>
                )}

                {/* Share - available to everyone (unless busy block) */}
                {!event?.isBusy && (
                  <Pressable
                    className="flex-row items-center py-4"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => {
                      setShowEventActionsSheet(false);
                      Haptics.selectionAsync();
                      shareEvent({ ...event, location: locationDisplay ?? null });
                    }}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                    >
                      <Share2 size={20} color={themeColor} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 16 }}>Share Event</Text>
                  </Pressable>
                )}

                {/* Lock Screen Updates — iOS live activity toggle (always visible on iOS for eligible events) */}
                {Platform.OS === "ios" && !event?.isBusy && (isMyEvent || myRsvpStatus === "going") && (() => {
                  const startMs = new Date(event.startTime).getTime();
                  const endMs = event.endTime ? new Date(event.endTime).getTime() : startMs + 3600000;
                  const now = Date.now();
                  const hasEnded = now > endMs;
                  if (hasEnded) return null;
                  const startsWithin4h = startMs - now < 4 * 3600000;
                  // Can toggle = native module available + within 4h window
                  const canToggle = liveActivitySupported && startsWithin4h;
                  const subtitle = liveActivityActive
                    ? "On — tracking countdown"
                    : canToggle
                      ? "Off — tap to start"
                      : !liveActivitySupported
                        ? "Requires latest app update"
                        : "Available closer to event start";
                  return (
                    <Pressable
                      className="flex-row items-center py-4"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border, opacity: canToggle || liveActivityActive ? 1 : 0.55 }}
                      disabled={!canToggle && !liveActivityActive}
                      onPress={async () => {
                        if (!canToggle && !liveActivityActive) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (liveActivityActive) {
                          await endLiveActivity(event.id);
                          setLiveActivityActive(false);
                          liveActivityManuallyDismissed.current = true;
                          safeToast.success("Stopped", "Lock Screen updates off");
                        } else {
                          const ok = await startLiveActivity({
                            eventId: event.id,
                            eventTitle: event.title,
                            startTime: event.startTime,
                            locationName: locationDisplay,
                            rsvpStatus: isMyEvent ? "going" : (myRsvpStatus ?? "going"),
                            emoji: event.emoji,
                            goingCount: effectiveGoingCount,
                            themeAccentColor: resolveEventTheme(event.themeId).backAccent,
                          });
                          if (ok) {
                            setLiveActivityActive(true);
                            liveActivityManuallyDismissed.current = false;
                            safeToast.success("Started", "Tracking on Lock Screen");
                          } else {
                            safeToast.error("Couldn't start", "Check Live Activities in Settings");
                          }
                        }
                        setShowEventActionsSheet(false);
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: liveActivityActive ? `${STATUS.going.fg}12` : (isDark ? "#2C2C2E" : "#F3F4F6") }}
                      >
                        <Bell size={20} color={liveActivityActive ? STATUS.going.fg : themeColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 16 }}>Lock Screen Updates</Text>
                        <Text style={{ color: liveActivityActive ? STATUS.going.fg : colors.textTertiary, fontSize: 12, marginTop: 1 }}>
                          {subtitle}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })()}

                {/* Report - only for non-owners, non-busy */}
                {!isMyEvent && !event?.isBusy && (
                  <Pressable
                    className="flex-row items-center py-4"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => {
                      setShowEventActionsSheet(false);
                      handleReportEvent();
                    }}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                    >
                      <AlertTriangle size={20} color={colors.textSecondary} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 16 }}>Report Event</Text>
                  </Pressable>
                )}

                {/* Block Color - host-only invariant [P0_EVENT_COLOR_GATE] */}
                {isMyEvent && !isBusyBlock && (
                <Pressable
                  className="flex-row items-center py-4"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => {
                    // [P0_MODAL_GUARD] Close actions sheet FIRST, then open color picker
                    // after a short delay. Two simultaneous Modals freeze iOS touch handling.
                    if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_start", { from: "event_actions", to: "color", ms: 350 });
                    setShowEventActionsSheet(false);
                    Haptics.selectionAsync();
                    setTimeout(() => {
                      setShowColorPicker(true);
                      if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_open_child", { from: "event_actions", to: "color", ms: 350 });
                    }, 350);
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Palette size={20} color={themeColor} />
                  </View>
                  <View className="flex-1 flex-row items-center justify-between">
                    <Text style={{ color: colors.text, fontSize: 16 }}>Block Color</Text>
                    {currentColorOverride && (
                      <View
                        className="w-6 h-6 rounded-full mr-2"
                        style={{ backgroundColor: currentColorOverride, borderWidth: 2, borderColor: colors.border }}
                      />
                    )}
                  </View>
                </Pressable>
                )}

                {/* Delete Event - host-only destructive action */}
                {isMyEvent && !event?.isBusy && (
                <Pressable
                  testID="event-detail-menu-delete"
                  className="flex-row items-center py-4"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => {
                    setShowEventActionsSheet(false);
                    Haptics.selectionAsync();
                    setTimeout(() => setShowDeleteEventConfirm(true), 350);
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
                  >
                    <Trash2 size={20} color={STATUS.destructive.fg} />
                  </View>
                  <Text style={{ color: STATUS.destructive.fg, fontSize: 16, fontWeight: "500" }}>Delete Event</Text>
                </Pressable>
                )}

                {/* Cancel */}
                <Pressable
                  className="flex-row items-center justify-center py-4 mt-2"
                  onPress={() => setShowEventActionsSheet(false)}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: "500" }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
      </BottomSheet>

      {/* Report Event Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReportModal(false)}
      >
        <Pressable 
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowReportModal(false)}
        >
          <Pressable 
            className="rounded-t-3xl p-6 pb-10"
            style={{ backgroundColor: colors.background }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-xl font-bold mb-2" style={{ color: colors.text }}>
              Report Event
            </Text>
            <Text className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              Select a reason for your report
            </Text>
            
            {(["spam", "inappropriate", "safety", "other"] as const).map((reason) => {
              const labels: Record<typeof reason, string> = {
                spam: "Spam",
                inappropriate: "Inappropriate Content",
                safety: "Safety Concern",
                other: "Other",
              };
              const isSelected = selectedReportReason === reason;
              return (
                <Pressable
                  key={reason}
                  className="flex-row items-center py-3 px-4 rounded-xl mb-2"
                  style={{ 
                    backgroundColor: isSelected ? themeColor + "20" : colors.surface,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? themeColor : colors.border,
                  }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedReportReason(reason);
                  }}
                >
                  <View 
                    className="w-5 h-5 rounded-full border-2 mr-3 items-center justify-center"
                    style={{ borderColor: isSelected ? themeColor : colors.border }}
                  >
                    {isSelected && (
                      <View 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: themeColor }}
                      />
                    )}
                  </View>
                  <Text style={{ color: colors.text }}>{labels[reason]}</Text>
                </Pressable>
              );
            })}
            
            {selectedReportReason === "other" && (
              <TextInput
                className="rounded-xl p-4 mt-2"
                style={{ 
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.text,
                  minHeight: 80,
                  textAlignVertical: "top",
                }}
                placeholder="Please describe the issue..."
                placeholderTextColor={colors.textTertiary}
                multiline
                value={reportDetails}
                onChangeText={setReportDetails}
              />
            )}
            
            <View className="flex-row mt-4 gap-3">
              <Pressable
                className="flex-1 py-4 rounded-xl items-center"
                style={{ backgroundColor: colors.surface }}
                onPress={() => {
                  setShowReportModal(false);
                  setSelectedReportReason(null);
                  setReportDetails("");
                }}
              >
                <Text className="text-base font-medium" style={{ color: colors.textSecondary }}>
                  Cancel
                </Text>
              </Pressable>
              
              <Button
                variant="primary"
                label={isSubmittingReport ? "Submitting..." : "Submit Report"}
                onPress={submitEventReport}
                disabled={!selectedReportReason || isSubmittingReport}
                loading={isSubmittingReport}
                style={{ flex: 1, borderRadius: RADIUS.md }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Attendees Modal - P0: View all attendees (uses shared BottomSheet) */}
      <BottomSheet
        visible={showAttendeesModal}
        onClose={() => {
          setShowAttendeesModal(false);
          if (__DEV__) devLog('[P1_WHO_COMING_SHEET]', 'close', { eventId: id });
        }}
        heightPct={0.65}
        backdropOpacity={0.5}
      >
        {/* Custom title row — uses effectiveGoingCount (SSOT) */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <UserCheck size={20} color="#22C55E" />
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, marginLeft: 8 }}>
              Who's Coming
            </Text>
            <View style={{ backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.md, marginLeft: 8 }}>
              <Text style={{ color: "#166534", fontSize: 12, fontWeight: "700" }}>
                {effectiveGoingCount}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setShowAttendeesModal(false)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Attendees List - P0: guarded for loading / empty / list */}
        <KeyboardAwareScrollView
          style={{ flex: 1, paddingHorizontal: 20 }}
          contentContainerStyle={{ paddingBottom: 36 }}
        >
                {isLoadingAttendees ? (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <ActivityIndicator size="large" color={themeColor} />
                    <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSecondary }}>Loading attendees…</Text>
                  </View>
                ) : attendeesError && !attendeesPrivacyDenied && attendeesList.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 32 }}>
                    <AlertTriangle size={32} color={colors.textTertiary} />
                    <Text style={{ marginTop: 12, fontSize: 15, fontWeight: "600", color: colors.text, textAlign: "center" }}>
                      Couldn’t load guest list
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 13, color: colors.textSecondary, textAlign: "center" }}>
                      Something went wrong — tap to try again
                    </Text>
                    <Pressable
                      onPress={() => attendeesQuery.refetch()}
                      style={{
                        marginTop: 16,
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: themeColor,
                        paddingHorizontal: 20,
                        paddingVertical: 10,
                        borderRadius: 20,
                        gap: 6,
                      }}
                    >
                      <RefreshCw size={14} color="#FFFFFF" />
                      <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>Retry</Text>
                    </Pressable>
                  </View>
                ) : attendeesList.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 32 }}>
                    <Users size={32} color={colors.textTertiary} />
                    <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSecondary, textAlign: "center" }}>
                      No attendees yet
                    </Text>
                  </View>
                ) : (
                  <>
                {__DEV__ && attendeesList.length > 0 && once('P0_USERROW_SHEET_SOT_event') && void devLog('[P0_USERROW_SHEET_SOT]', { screen: 'event_attendees_sheet', showChevron: false, usesPressedState: true, rowsSampled: attendeesList.length })}
                {attendeesList.map((attendee) => (
                  <View
                    key={attendee.id}
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <UserListRow
                      handle={null}
                      displayName={attendee.name ?? "Guest"}
                      bio={null}
                      avatarUri={attendee.imageUrl}
                      badgeText={(attendee.isHost || attendee.id === event?.user?.id) ? "Host" : null}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setShowAttendeesModal(false);
                        router.push(`/user/${attendee.id}` as any);
                      }}
                    />
                  </View>
                ))}
                  </>
                )}
              </KeyboardAwareScrollView>
      </BottomSheet>

      {/* Color Picker (uses shared BottomSheet) */}
      <BottomSheet
        visible={showColorPicker}
        onClose={() => setShowColorPicker(false)}
        heightPct={0}
        backdropOpacity={0.5}
        title="Block Color"
      >
              <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                  Customize how this event appears on your calendar
                </Text>
              </View>

              {/* Color Palette Grid */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  {COLOR_PALETTE.map((color) => {
                    const isSelected = currentColorOverride === color;
                    return (
                      <Pressable
                        key={color}
                        onPress={async () => {
                          if (!id) return;
                          // Busy blocks cannot be recolored [P0_EVENT_COLOR_UI]
                          if (isBusyBlock) {
                            if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'blocked_busy', { eventId: id, isBusyBlock });
                            return;
                          }
                          if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'color_pick', { eventId: id, color, isMyEvent });
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          try {
                            await setOverrideColor(id, color);
                            if (__DEV__) {
                              devLog("[EventColorPicker] Color set:", { eventId: id, color });
                            }
                          } catch (error) {
                            safeToast.error("Save Failed", "Failed to save color");
                          }
                        }}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: color,
                          borderWidth: isSelected ? 3 : 0,
                          borderColor: colors.text,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isSelected && (
                          <Check size={24} color="#FFFFFF" />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Reset to Default */}
              {currentColorOverride && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                  <Button
                    variant="secondary"
                    label="Reset to Default"
                    onPress={async () => {
                      if (!id) return;
                      // Busy blocks cannot be reset [P0_EVENT_COLOR_UI]
                      if (isBusyBlock) {
                        if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'blocked_reset_busy', { eventId: id, isBusyBlock });
                        return;
                      }
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      try {
                        await resetColor(id);
                        if (__DEV__) {
                          devLog("[EventColorPicker] Color reset to default:", { eventId: id });
                        }
                      } catch (error) {
                        safeToast.error("Save Failed", "Failed to reset color");
                      }
                    }}
                    style={{ borderRadius: RADIUS.md }}
                  />
                </View>
              )}

              {/* Done Button */}
              <View style={{ paddingHorizontal: 20 }}>
                <Button
                  variant="primary"
                  label="Done"
                  onPress={() => setShowColorPicker(false)}
                  style={{ borderRadius: RADIUS.md, paddingVertical: 14 }}
                />
              </View>
      </BottomSheet>

      {/* Event Photo Upload Sheet */}
      <BottomSheet visible={showPhotoSheet} onClose={() => setShowPhotoSheet(false)} title="Event Photo">
        <View className="px-5 pb-6">
          <Pressable
            onPress={async () => {
              setShowPhotoSheet(false);
              // Wait for sheet dismiss animation before opening picker
              // Prevents iOS gesture/touch blocker overlay freeze
              await new Promise(r => setTimeout(r, 300));
              launchEventPhotoPicker();
            }}
            className="flex-row items-center py-3"
          >
            <Camera size={20} color={themeColor} />
            <Text className="ml-3 text-base font-medium" style={{ color: colors.text }}>
              {event?.eventPhotoUrl ? "Replace photo" : "Upload photo"}
            </Text>
            {uploadingPhoto && <ActivityIndicator size="small" className="ml-auto" color={themeColor} />}
          </Pressable>
          {event?.eventPhotoUrl && (
            <Pressable
              onPress={async () => {
                try {
                  setShowPhotoSheet(false);
                  await api.put(`/api/events/${id}/photo`, { remove: true });
                  invalidateEventMedia(queryClient, id ?? undefined);
                  safeToast.success("Photo removed");
                } catch (e: any) {
                  if (__DEV__) devError("[EVENT_PHOTO_REMOVE]", e);
                  safeToast.error("Failed to remove photo");
                }
              }}
              className="flex-row items-center py-3"
            >
              <Trash2 size={20} color="#EF4444" />
              <Text className="ml-3 text-base font-medium" style={{ color: "#EF4444" }}>Remove photo</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setShowPhotoSheet(false)}
            className="flex-row items-center py-3"
          >
            <X size={20} color={colors.textSecondary} />
            <Text className="ml-3 text-base" style={{ color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
