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
  StyleSheet,
  useWindowDimensions,
  Animated as RNAnimated,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { BlurView } from "expo-blur";
import { openMaps } from "@/utils/openMaps";
import { trackEventRsvp, trackInviteShared, trackRsvpCompleted, trackRsvpShareClicked, trackRsvpSuccessPromptShown, trackRsvpSuccessPromptTap, trackRsvpError, trackEventPageViewed, trackRsvpAttempt, trackRsvpRedirectToAuth, trackRsvpSuccess, trackShareTriggered } from "@/analytics/analyticsEventsSSOT";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { STACK_BOTTOM_PADDING } from "@/lib/layoutSpacing";
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
import { buildEventSharePayload, buildEventSmsBody, buildEventReminderText, getEventUniversalLink } from "@/lib/shareSSOT";
import { safeToast } from "@/lib/safeToast";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";
import { STATUS, HERO_GRADIENT, HERO_WASH } from "@/ui/tokens";
import { ReportModal } from "@/components/event/ReportModal";
import { CalendarSyncModal } from "@/components/event/CalendarSyncModal";
import { ColorPickerSheet } from "@/components/event/ColorPickerSheet";
import { PhotoUploadSheet } from "@/components/event/PhotoUploadSheet";
import { AttendeesSheet } from "@/components/event/AttendeesSheet";
import { EventActionsSheet } from "@/components/event/EventActionsSheet";
import { HostToolsRow } from "@/components/event/HostToolsRow";
import { PostCreateNudge } from "@/components/event/PostCreateNudge";
import { BusyBlockGate } from "@/components/event/BusyBlockGate";
import { PrivacyRestrictedGate } from "@/components/event/PrivacyRestrictedGate";
import { StickyRsvpBar } from "@/components/event/StickyRsvpBar";
import { HostReflectionCard } from "@/components/event/HostReflectionCard";
import { MemoriesRow } from "@/components/event/MemoriesRow";
import { EventSettingsAccordion } from "@/components/event/EventSettingsAccordion";
import { DiscussionCard } from "@/components/event/DiscussionCard";
import { WhosComingCard } from "@/components/event/WhosComingCard";
import { AboutCard } from "@/components/event/AboutCard";
import { SocialProofRow } from "@/components/event/SocialProofRow";
import { RsvpSuccessPrompt } from "@/components/event/RsvpSuccessPrompt";
import { FindFriendsNudge } from "@/components/event/FindFriendsNudge";
import { RsvpStatusDisplay } from "@/components/event/RsvpStatusDisplay";
import { RsvpButtonGroup } from "@/components/event/RsvpButtonGroup";
import { ConfirmedAttendeeBanner } from "@/components/event/ConfirmedAttendeeBanner";
import { PhotoNudge } from "@/components/event/PhotoNudge";
import { EditPhotoButton } from "@/components/event/EditPhotoButton";
import { EventHeroNav } from "@/components/event/EventHeroNav";
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
import { setPendingRsvpIntent, type PendingRsvpStatus } from "@/lib/pendingRsvp";
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
import { getAttributionContext } from "@/lib/attribution";
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
import { resolveEventTheme, buildCustomThemeTokens, THEME_VIDEOS, THEME_BACKGROUNDS } from "@/lib/eventThemes";
import { ThemeEffectLayer } from "@/components/ThemeEffectLayer";
import { MotifOverlay } from "@/components/create/MotifOverlay";
import { ThemeFilterLayer } from "@/components/ThemeFilterLayer";
import { ThemeVideoLayer } from "@/components/ThemeVideoLayer";
import { AnimatedGradientLayer } from "@/components/AnimatedGradientLayer";
import { startLiveActivity, updateLiveActivity, endLiveActivity, getActiveLiveActivityEventId, areLiveActivitiesEnabled, isEligibleForAutoStart, isEligibleForAutoStartOnFocus, cleanupExpiredActivities } from "@/lib/liveActivity";

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

// Build EventShareInput from raw event data (shared by all share surfaces)
const buildShareInput = (event: { id: string; title: string; emoji: string; description?: string | null; location?: string | null; startTime: string; endTime?: string | null }) => {
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
  return { id: event.id, title: event.title, emoji: event.emoji, dateStr, timeStr, location: event.location, description: event.description };
};

// Helper to share event via native share sheet
const shareEvent = async (event: { id: string; title: string; emoji: string; description?: string | null; location?: string | null; startTime: string; endTime?: string | null }) => {
  try {
    // [P0_SHARE_SSOT] Use SSOT builder — never raw backend URLs
    const payload = buildEventSharePayload(buildShareInput(event));

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
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const isFromCreate = from === "create";
  
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
  const { width: screenWidth } = useWindowDimensions();
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
  const [showRemoveImportedConfirm, setShowRemoveImportedConfirm] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingSync, setIsCheckingSync] = useState(true);
  // [POST_CREATE] Nudge banner — shown once per create entry, dismissible
  const [showCreateNudge, setShowCreateNudge] = useState(isFromCreate);

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
  // [LIVE_ACTIVITY] null = native check pending → toggle hidden until resolved.
  // useFocusEffect sets true/false once the native bridge responds.
  const [liveActivityActive, setLiveActivityActive] = useState<boolean | null>(null);
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
  const [findFriendsNudgeDismissed, setFindFriendsNudgeDismissed] = useState(true); // default hidden until check
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [showMemoriesExpanded, setShowMemoriesExpanded] = useState(false);

  // [GROWTH_FUNNEL] Page view dedup — fire exactly once per mount
  const pageViewFired = useRef(false);

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

  // [GROWTH_FUNNEL] Track page view — once per mount
  // isCreator uses isFromCreate as proxy (event data not yet loaded at mount)
  useEffect(() => {
    if (!id || pageViewFired.current) return;
    pageViewFired.current = true;
    trackEventPageViewed({
      eventId: id,
      from: from ?? null,
      userId: session?.user?.id ?? null,
      isAuthenticated: bootStatus === 'authed',
      isCreator: isFromCreate,
    });
  }, [id]);

  // Check photo nudge dismiss state
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(`dismissedEventPhotoNudge_${id}`).then((v) => {
      if (v === "true") setPhotoNudgeDismissed(true);
    });
  }, [id]);

  // [GROWTH_FIND_FRIENDS] Check global dismiss state
  useEffect(() => {
    AsyncStorage.getItem("dismissedFindFriendsNudge").then((v) => {
      setFindFriendsNudgeDismissed(v === "true");
    });
  }, []);

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

        // [LIVE_ACTIVITY] Foreground cleanup: end expired activities
        const snap = liveActivityAutoStartRef.current;
        if (snap?.event) {
          await cleanupExpiredActivities({
            id: snap.event.id,
            endTime: snap.event.endTime,
            startTime: snap.event.startTime,
          });
        }

        const activeId = await getActiveLiveActivityEventId();
        setLiveActivityActive(activeId === id);

        // [LIVE_ACTIVITY_AUTO_ON] Silent auto-start for qualifying events.
        if (activeId) return; // Another activity already running
        if (liveActivityManuallyDismissed.current) return;

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
          endTime: ev.endTime,
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
    mutationFn: async (status: RsvpStatus) => {
      if (__DEV__) {
        devLog("[P0_RSVP]", "mutationFn", { eventId: id, status });
      }
      if (isBusyBlock) {
        throw new Error("BUSY_BLOCK");
      }
      // [OPERATOR_BACKFLOW] Include attribution context in RSVP body for Operator Engine
      const attribution = status === "going" ? await getAttributionContext().catch(() => null) : null;
      const body: Record<string, unknown> = { status };
      if (attribution) body.attribution = attribution;
      return wrapRace("RSVP_submit", () => postIdempotent(`/api/events/${id}/rsvp`, body));
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
      // [GROWTH_FUNNEL] rsvp_success
      trackRsvpSuccess({ eventId: id ?? "unknown", userId: session?.user?.id ?? null, isCreator: isMyEvent });
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
            endTime: event.endTime,
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
    // [GROWTH_FUNNEL] Track every RSVP attempt
    if (id) trackRsvpAttempt({ eventId: id, userId: session?.user?.id ?? null, isAuthenticated: bootStatus === 'authed', isCreator: isMyEvent });

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
    // Guard: capture RSVP intent and redirect to auth if not authenticated
    if (bootStatus !== 'authed') {
      if (id && (status === 'going' || status === 'interested')) {
        setPendingRsvpIntent({ eventId: id, status: status as PendingRsvpStatus });
        if (__DEV__) devLog('[P0_RSVP] stored pending intent pre-auth', { eventId: id, status });
      }
      if (id) trackRsvpRedirectToAuth({ eventId: id, userId: null, isAuthenticated: false });
      safeToast.info("Sign up to confirm your RSVP");
      router.replace('/welcome');
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

  // [QA-8] Suppress login flash: only show sign-in prompt when definitively logged out
  if (!session) {
    if (bootStatus !== 'loggedOut') return null;
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
        <PrivacyRestrictedGate
          hasHostId={hasHostId}
          hostImage={fb.hostImage}
          hostFirst={fb.hostFirst}
          hostDisplayName={fb.hostDisplayName}
          denyReason={fb.denyReason}
          circleId={fb.circleId}
          isDark={isDark}
          colors={colors}
          onGoToHostProfile={goToHostProfile}
          onViewCircle={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/circle/${fb.circleId}` as any);
          }}
        />
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
      <BusyBlockGate
        colors={colors}
        onGoBack={() => router.canGoBack() ? router.back() : router.replace('/friends')}
      />
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

  const originalStartDate = new Date(event.startTime);
  // For recurring events, use nextOccurrence for display dates and countdown
  const displayStartTime = (event as any).nextOccurrence ?? event.startTime;
  const startDate = new Date(displayStartTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  const dateLabel = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  // Show time range if endTime exists — use original time-of-day with display date
  const timeLabel = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  // [EVENT_LIVE_UI] Countdown label — recalculates on focus (no ticking timer)
  const countdownLabel = (() => {
    const now = new Date();
    const duration = endDate ? endDate.getTime() - originalStartDate.getTime() : 2 * 60 * 60 * 1000;
    const eventEnd = new Date(startDate.getTime() + duration);
    // Recurring events with a future nextOccurrence are never "Ended"
    if (now > eventEnd && !(event as any).nextOccurrence) return "Ended";
    if (now > eventEnd) return ""; // recurring — next occurrence is computed, skip stale label
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
  const pageTheme = event.customThemeData
    ? buildCustomThemeTokens(event.customThemeData)
    : resolveEventTheme(event.themeId);
  const heroFillColor = isDark ? pageTheme.backBgDark : pageTheme.backBgLight;

  // [GROWTH_STICKY_RSVP] Sticky bottom bar visibility
  const showStickyRsvp = !isMyEvent && !event?.isBusy && !!event && !hasJoinRequest && myRsvpStatus !== "going";
  const stickyBarHeight = 64 + insets.bottom;

  return (
    <SafeAreaView testID="event-detail-screen" className="flex-1" style={{ backgroundColor: "transparent" }} edges={[]}>
      <Stack.Screen options={{ headerShown: false, headerTransparent: true, contentStyle: { backgroundColor: "transparent" } }} />
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Animated gradient background (custom themes + catalog themes with gradient) */}
      {pageTheme.visualStack?.gradient && pageTheme.visualStack.gradient.colors.length >= 2 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <AnimatedGradientLayer config={pageTheme.visualStack.gradient} />
        </View>
      )}

      {/* Looping video background — behind particles and content */}
      {pageTheme.visualStack?.video && THEME_VIDEOS[pageTheme.visualStack.video.source] && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
          <ThemeVideoLayer
            source={THEME_VIDEOS[pageTheme.visualStack.video.source]}
            poster={pageTheme.visualStack.video.poster ? THEME_BACKGROUNDS[pageTheme.visualStack.video.poster] : undefined}
            opacity={pageTheme.visualStack.video.opacity}
            isActive={true}
          />
        </View>
      )}

      {/* Particle layer — effectId overrides theme particles to avoid double-rendering.
           Theme gradient/video/filter still render normally; only particles are suppressed. */}
      {event.effectId ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <MotifOverlay
            presetId={event.effectId}
            customConfig={event.customEffectConfig ?? undefined}
            intensity={0.70}
          />
        </View>
      ) : (
        <ThemeEffectLayer themeId={event.themeId} overrideVisualStack={event.customThemeData?.visualStack} />
      )}
      {/* Atmospheric filter overlay — after particles, before content */}
      {pageTheme.visualStack?.filter && (
        <ThemeFilterLayer filter={pageTheme.visualStack.filter} />
      )}

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: showStickyRsvp ? stickyBarHeight + 16 : STACK_BOTTOM_PADDING + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ HERO ZONE — bg matches card plaque so no strip above/below card ═══ */}
        <View style={{ position: "relative", backgroundColor: heroFillColor }}>

          {/* Nav bar — glass-effect over atmosphere */}
          <EventHeroNav
            hasPhoto={!!(eventBannerUri && event.eventPhotoUrl)}
            screenWidth={screenWidth}
            topInset={insets.top}
            colors={colors}
            onBack={() => router.canGoBack() ? router.back() : router.replace("/calendar" as any)}
            onOpenOptions={() => {
              Haptics.selectionAsync();
              if (__DEV__) devLog("[IMPORTED_EVENT]", "options_sheet_open", {
                eventId: id,
                isImported: !!event?.isImported,
                isBusy: !!event?.isBusy,
                isMyEvent,
              });
              setShowEventActionsSheet(true);
            }}
          />

          {/* Floating invite card */}
          <Animated.View entering={FadeInDown.delay(30).springify()}>
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
                  <EditPhotoButton
                    editScale={editScale}
                    onPress={() => {
                      if (__DEV__) devLog("[EVENT_HERO_EDIT_TAP]");
                      RNAnimated.sequence([
                        RNAnimated.timing(editScale, { toValue: 0.94, duration: 60, useNativeDriver: true }),
                        RNAnimated.timing(editScale, { toValue: 1, duration: 60, useNativeDriver: true }),
                      ]).start();
                      setShowPhotoSheet(true);
                    }}
                  />
                ) : undefined
              }
              photoNudge={
                isMyEvent && !event.eventPhotoUrl && !event.isBusy && event.visibility !== "private" && !photoNudgeDismissed ? (
                  <PhotoNudge
                    isDark={isDark}
                    colors={colors}
                    onAddPhoto={() => launchEventPhotoPicker()}
                    onDismiss={async () => {
                      setPhotoNudgeDismissed(true);
                      await AsyncStorage.setItem(`dismissedEventPhotoNudge_${id}`, "true");
                    }}
                  />
                ) : undefined
              }
            />
          </Animated.View>

        </View>

        {/* ═══ HOST ACTION CARD — unified invite + tools ═══ */}
        {isMyEvent && !event?.isBusy && (
          <Animated.View entering={FadeInDown.delay(80).springify()} style={{ marginHorizontal: 16, marginBottom: 4 }}>
            <View style={{
              backgroundColor: isDark ? "rgba(20,20,24,0.62)" : "rgba(255,255,255,0.82)",
              borderRadius: 16,
              padding: 14,
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)",
            }}>
              {/* Header with dismiss — only during post-create nudge */}
              {showCreateNudge && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>Your event is live</Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Invite people to get responses</Text>
                  </View>
                  <Pressable
                    onPress={() => setShowCreateNudge(false)}
                    style={{ padding: 6 }}
                    hitSlop={8}
                  >
                    <X size={14} color={colors.textTertiary} />
                  </Pressable>
                </View>
              )}

              {/* Invite actions — shown during post-create nudge */}
              {showCreateNudge && (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <Pressable
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      trackShareTriggered({ eventId: event.id, method: "copy", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                      const link = getEventUniversalLink(event.id);
                      await Clipboard.setStringAsync(link);
                      safeToast.success("Link copied");
                    }}
                    style={{
                      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      paddingVertical: 10, borderRadius: 12,
                      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                    }}
                  >
                    <Copy size={14} color={colors.text} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 5 }}>Copy Link</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      trackShareTriggered({ eventId: event.id, method: "sms", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                      const body = buildEventSmsBody(buildShareInput({ ...event, location: locationDisplay ?? null }));
                      Linking.openURL(`sms:&body=${encodeURIComponent(body)}`);
                    }}
                    style={{
                      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      paddingVertical: 10, borderRadius: 12,
                      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                    }}
                  >
                    <MessageCircle size={14} color={colors.text} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 5 }}>Text</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      trackShareTriggered({ eventId: event.id, method: "native", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                      shareEvent({ ...event, location: locationDisplay ?? null });
                    }}
                    style={{
                      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      paddingVertical: 10, borderRadius: 12,
                      backgroundColor: themeColor,
                    }}
                  >
                    <Share2 size={14} color="#FFFFFF" />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", marginLeft: 5 }}>More</Text>
                  </Pressable>
                </View>
              )}

              {/* Persistent host tools — Share + Reminder */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    trackInviteShared({ entity: "event", sourceScreen: "host_tools" });
                    trackShareTriggered({ eventId: event.id, method: "native", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                    shareEvent({ ...event, location: locationDisplay ?? null });
                  }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: 12,
                    backgroundColor: showCreateNudge ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : themeColor,
                  }}
                >
                  <Share2 size={14} color={showCreateNudge ? colors.text : "#FFFFFF"} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: showCreateNudge ? colors.text : "#FFFFFF", marginLeft: 6 }}>Share</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const reminderText = buildEventReminderText(buildShareInput({ ...event, location: locationDisplay ?? null }));
                    try { await Clipboard.setStringAsync(reminderText); } catch {}
                    safeToast.success("Reminder copied");
                  }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: 12,
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                  }}
                >
                  <Copy size={14} color={colors.text} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 6 }}>Reminder</Text>
                </Pressable>
              </View>

              {/* Coordination summaries — bring list + pitch in */}
              {(!!event?.bringListEnabled && (event?.bringListItems ?? []).length > 0 || !!event?.pitchInEnabled && !!event?.pitchInHandle) && (
                <View style={{ marginTop: 10 }}>
                  {!!event?.bringListEnabled && (event?.bringListItems ?? []).length > 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                      <ListChecks size={13} color={colors.textSecondary} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                        What to bring: {(event.bringListItems ?? []).filter((i: any) => !!i.claimedByUserId).length}/{(event.bringListItems ?? []).length} claimed
                      </Text>
                    </View>
                  )}
                  {!!event?.pitchInEnabled && !!event?.pitchInHandle && (
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                      <HandCoins size={13} color={colors.textSecondary} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                        Pitch In: {event.pitchInMethod === "venmo" ? "Venmo" : event.pitchInMethod === "cashapp" ? "Cash App" : event.pitchInMethod === "paypal" ? "PayPal" : ""} @{event.pitchInHandle}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* ═══ PRIMARY ACTION BAR (Task 3) ═══ */}
        {!isMyEvent && !event?.isBusy && (
          <Animated.View entering={FadeInDown.delay(80).springify()} style={{ marginHorizontal: 16, marginBottom: 4 }}>
            {hasJoinRequest ? (
              <ConfirmedAttendeeBanner
                effectiveGoingCount={effectiveGoingCount}
                attendees={attendeesList}
                isDark={isDark}
                colors={colors}
              />
            ) : (
              <View style={{ marginBottom: 18 }}>
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
                  <RsvpStatusDisplay
                    myRsvpStatus={myRsvpStatus}
                    isPending={rsvpMutation.isPending}
                    isDark={isDark}
                    themeColor={themeColor}
                    colors={colors}
                    showRsvpOptions={showRsvpOptions}
                    onToggleOptions={() => setShowRsvpOptions(!showRsvpOptions)}
                    onShareWithFriends={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      trackRsvpShareClicked({
                        eventId: event.id,
                        surface: "rsvp_confirmation",
                        visibility: event.visibility ?? "unknown",
                        hasCircleId: !!event.circleId,
                      });
                      trackShareTriggered({ eventId: event.id, method: "native", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                      shareEvent({ ...event, location: locationDisplay ?? null });
                    }}
                  />
                )}

                {/* [GROWTH_V1] Inline success prompt — "Want to bring someone?" */}
                {showRsvpSuccessPrompt && myRsvpStatus === "going" && (
                  <RsvpSuccessPrompt
                    isDark={isDark}
                    colors={colors}
                    onShare={() => {
                      trackRsvpSuccessPromptTap({ source: "event" });
                      trackInviteShared({ entity: "event", sourceScreen: "rsvp_success" });
                      trackShareTriggered({ eventId: event.id, method: "native", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowRsvpSuccessPrompt(false);
                      if (event) shareEvent({ ...event, location: locationDisplay ?? null });
                    }}
                    onDismiss={() => setShowRsvpSuccessPrompt(false)}
                  />
                )}

                {/* [GROWTH_V1] Find Friends nudge — post-RSVP contacts import exposure */}
                {!isMyEvent && myRsvpStatus === "going" && !showRsvpSuccessPrompt && !findFriendsNudgeDismissed && (
                  <FindFriendsNudge
                    isDark={isDark}
                    colors={colors}
                    onFind={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/find-friends" as any);
                    }}
                    onDismiss={async () => {
                      setFindFriendsNudgeDismissed(true);
                      await AsyncStorage.setItem("dismissedFindFriendsNudge", "true");
                    }}
                  />
                )}

                {/* Inline RSVP buttons removed — sticky bottom CTA is single source of truth for guest actions */}
              </View>
            )}
          </Animated.View>
        )}

        {/* HostToolsRow merged into HOST ACTION CARD above */}

        {/* Live Activity CTA moved to overflow menu — see Event Options sheet */}

        {/* ═══ ABOUT CARD — description + details + pitch-in + bring list ═══ */}
        <View style={{ backgroundColor: isDark ? "rgba(20,20,24,0.62)" : "rgba(255,255,255,0.82)", borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>

        <AboutCard
          description={event.description}
          descriptionExpanded={descriptionExpanded}
          onToggleDescription={() => setDescriptionExpanded(!descriptionExpanded)}
          locationDisplay={locationDisplay}
          onGetDirections={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            openEventLocation(locationQuery ?? locationDisplay ?? "", event, event.id);
          }}
          isMyEvent={isMyEvent}
          isBusy={event.isBusy ?? false}
          visibility={event.visibility}
          circleName={event.circleName}
          circleId={event.circleId}
          onOpenCircle={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            devLog('[P0_EVENT_CIRCLE_LINK]', { circleId: event.circleId, eventId: event.id });
            router.push(`/circle/${event.circleId}` as any);
          }}
          eventMeta={eventMeta}
          pitchInEnabled={event.pitchInEnabled}
          pitchInHandle={event.pitchInHandle}
          pitchInMethod={event.pitchInMethod}
          pitchInAmount={event.pitchInAmount}
          pitchInNote={event.pitchInNote}
          onCopyPitchInHandle={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const handle = (event.pitchInMethod === 'venmo' || event.pitchInMethod === 'cashapp') ? `@${event.pitchInHandle}` : event.pitchInHandle!;
            try { await Clipboard.setStringAsync(handle); } catch {}
            safeToast.success('Copied to clipboard');
          }}
          bringListEnabled={event.bringListEnabled}
          bringListItems={event.bringListItems ?? []}
          currentUserId={session?.user?.id}
          isBringListClaimPending={bringListClaimMutation.isPending}
          onClaimItem={(itemId) => {
            Haptics.selectionAsync();
            bringListClaimMutation.mutate({ itemId, action: 'claim' });
          }}
          onUnclaimItem={(itemId) => {
            Haptics.selectionAsync();
            bringListClaimMutation.mutate({ itemId, action: 'unclaim' });
          }}
          isDark={isDark}
          themeColor={themeColor}
          colors={colors}
        />

        </View>{/* close About card */}

        {/* ═══ WHO'S COMING CARD ═══ */}
        <View style={{ backgroundColor: isDark ? "rgba(20,20,24,0.62)" : "rgba(255,255,255,0.82)", borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>

        {/* ═══ Who's Coming / Social Proof ═══ */}
        <WhosComingCard
          attendeesPrivacyDenied={attendeesPrivacyDenied}
          effectiveGoingCount={effectiveGoingCount}
          attendeesList={attendeesList}
          hostId={event?.user?.id}
          hostUser={event?.user}
          myRsvpStatus={myRsvpStatus}
          isMyEvent={isMyEvent}
          interests={interests}
          showInterestedUsers={showInterestedUsers}
          isDark={isDark}
          themeColor={themeColor}
          colors={colors}
          onOpenAttendees={() => {
            Haptics.selectionAsync();
            setShowAttendeesModal(true);
          }}
          onToggleInterestedUsers={() => setShowInterestedUsers(!showInterestedUsers)}
        />
        </View>{/* close Who's Coming card */}

        {/* ═══ DISCUSSION CARD ═══ */}
        <View style={{ backgroundColor: isDark ? "rgba(20,20,24,0.62)" : "rgba(255,255,255,0.82)", borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>

        {/* Comments Section */}
        <DiscussionCard
          comments={comments}
          isLoadingComments={isLoadingComments}
          commentText={commentText}
          commentImage={commentImage}
          isUploadingImage={isUploadingImage}
          isPostingComment={createCommentMutation.isPending}
          isMyEvent={isMyEvent}
          currentUserId={session?.user?.id}
          joinRequests={event.joinRequests}
          eventId={event.id}
          eventTitle={event.title}
          eventDescription={event.description}
          eventLocation={event.location}
          eventStartTime={event.startTime}
          eventEndTime={event.endTime}
          eventVisibility={event.visibility}
          isDark={isDark}
          themeColor={themeColor}
          colors={colors}
          onChangeCommentText={setCommentText}
          onClearCommentImage={() => setCommentImage(null)}
          onPickImage={handlePickImage}
          onPostComment={handlePostComment}
          onDeleteComment={handleDeleteComment}
          onPressUser={(userId) => {
            Haptics.selectionAsync();
            router.push(`/user/${userId}` as any);
          }}
          formatTimeAgo={formatTimeAgo}
        />

        {/* ═══ V4.1 Compact Memories Row — low-emphasis, expandable ═══ */}
        <MemoriesRow
          eventId={event.id}
          eventTitle={event.title}
          eventTime={startDate}
          isOwner={isMyEvent}
          memoriesPhotos={(queryClient.getQueryData(eventKeys.photos(event.id)) as any)?.photos ?? []}
          isPast={startDate < new Date()}
          showExpanded={showMemoriesExpanded}
          isDark={isDark}
          themeColor={themeColor}
          colors={colors}
          onExpand={() => {
            Haptics.selectionAsync();
            setShowMemoriesExpanded(true);
          }}
        />

        </View>{/* close Discussion card */}

        {/* ═══ [EVENT_LIVE_UI] Collapsed Event Settings ═══ */}
        <EventSettingsAccordion
          expanded={settingsExpanded}
          isDark={isDark}
          themeColor={themeColor}
          colors={colors}
          isCheckingSync={isCheckingSync}
          isSynced={isSynced}
          isSyncing={isSyncing}
          onSyncToCalendar={handleSyncToCalendar}
          onOpenSyncModal={() => {
            Haptics.selectionAsync();
            setShowSyncModal(true);
          }}
          eventId={event.id}
          eventTitle={event.title}
          eventEmoji={event.emoji}
          eventTime={startDate}
          selectedReminders={selectedReminders}
          onRemindersChange={setSelectedReminders}
          isAttending={myRsvpStatus === "going" || myRsvpStatus === "interested"}
          isEventMuted={isEventMuted}
          isLoadingMute={isLoadingMute}
          isMutePending={muteMutation.isPending}
          onToggleMute={(value) => muteMutation.mutate(value)}
          showReflectionToggle={isMyEvent && !event.isBusy}
          reflectionEnabled={event.reflectionEnabled === true}
          isReflectionPending={toggleReflectionMutation.isPending}
          onToggleReflection={(value) => toggleReflectionMutation.mutate(value)}
          onToggleExpanded={() => {
            Haptics.selectionAsync();
            setSettingsExpanded((prev) => !prev);
          }}
        />

        {/* ═══ [EVENT_LIVE_UI] Host Reflection (post-event) ═══ */}
        {isMyEvent && !event.isBusy && (() => {
          // Compute effective end for this occurrence (same logic as countdown label)
          // For recurring events, endTime is the *original* occurrence's end — we need
          // to shift it to the displayed occurrence using the event's duration.
          const duration = endDate ? endDate.getTime() - originalStartDate.getTime() : 2 * 60 * 60 * 1000;
          const eventEndTime = new Date(startDate.getTime() + duration);
          const hasEnded = new Date() > eventEndTime;
          const hasSummary = event.summary && event.summary.length > 0;
          const reflectionEnabled = event.reflectionEnabled === true;
          if (!hasEnded || (!reflectionEnabled && !hasSummary)) return null;
          return (
            <HostReflectionCard
              summary={event.summary}
              summaryRating={event.summaryRating}
              isDark={isDark}
              themeColor={themeColor}
              colors={colors}
              onEditReflection={() => {
                Haptics.selectionAsync();
                setShowSummaryModal(true);
              }}
              onAddReflection={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowSummaryModal(true);
              }}
              onDismissReflection={() => toggleReflectionMutation.mutate(false)}
              isDismissPending={toggleReflectionMutation.isPending}
            />
          );
        })()}

      </KeyboardAwareScrollView>

      {/* [GROWTH_STICKY_RSVP] Floating bottom RSVP bar for guests */}
      {showStickyRsvp && (
        <StickyRsvpBar
          effectiveGoingCount={effectiveGoingCount}
          isFull={eventMeta.isFull}
          myRsvpStatus={myRsvpStatus}
          isPending={rsvpMutation.isPending}
          isDark={isDark}
          screenWidth={screenWidth}
          bottomInset={insets.bottom}
          colors={colors}
          themeColor={themeColor}
          onRsvpGoing={() => handleRsvp("going")}
          onRsvpInterested={() => handleRsvp("interested")}
        />
      )}

      <CalendarSyncModal
        visible={showSyncModal}
        colors={colors}
        onClose={() => setShowSyncModal(false)}
        onGoogleCalendar={() => {
          setShowSyncModal(false);
          openGoogleCalendar({ ...event, location: locationDisplay ?? null });
        }}
        onAppleCalendar={() => {
          setShowSyncModal(false);
          addToDeviceCalendar({ ...event, location: locationDisplay ?? null }, safeToast);
        }}
      />

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

      {/* [IMPORTED_EVENT] Remove imported event confirmation */}
      <ConfirmModal
        visible={showRemoveImportedConfirm}
        title="Remove from Open Invite"
        message="This removes the event from Open Invite only. Your device calendar won't be affected."
        confirmText="Remove"
        isDestructive
        onConfirm={() => {
          if (__DEV__) devLog("[IMPORTED_EVENT]", "remove_confirmed", { eventId: id });
          setShowRemoveImportedConfirm(false);
          deleteEventMutation.mutate();
        }}
        onCancel={() => setShowRemoveImportedConfirm(false)}
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

      <EventActionsSheet
        visible={showEventActionsSheet}
        isMyEvent={isMyEvent}
        isBusy={!!event?.isBusy}
        isImported={!!event?.isImported}
        hasEventPhoto={!!event?.eventPhotoUrl}
        isBusyBlock={isBusyBlock}
        currentColorOverride={currentColorOverride}
        myRsvpStatus={myRsvpStatus}
        liveActivity={(() => {
          // Use display-aware start (nextOccurrence for recurring) and compute end via duration
          const effectiveStartMs = startDate.getTime();
          const dur = endDate ? endDate.getTime() - originalStartDate.getTime() : 3600000;
          const effectiveEndMs = effectiveStartMs + dur;
          const now = Date.now();
          const hasEnded = now > effectiveEndMs;
          const startsWithin4h = effectiveStartMs - now < 4 * 3600000;
          const canToggle = liveActivitySupported && startsWithin4h;
          const subtitle = liveActivityActive
            ? "On \u2014 tracking countdown"
            : canToggle
              ? "Off \u2014 tap to start"
              : !liveActivitySupported
                ? "Requires latest app update"
                : "Available closer to event start";
          return { active: liveActivityActive, supported: liveActivitySupported, subtitle, canToggle, hasEnded };
        })()}
        isDark={isDark}
        themeColor={themeColor}
        colors={colors}
        onClose={() => setShowEventActionsSheet(false)}
        onEdit={() => {
          setShowEventActionsSheet(false);
          Haptics.selectionAsync();
          router.push(`/event/edit/${id}`);
        }}
        onDuplicate={() => {
          setShowEventActionsSheet(false);
          handleDuplicateEvent();
        }}
        onChangePhoto={() => {
          setShowEventActionsSheet(false);
          Haptics.selectionAsync();
          setTimeout(() => launchEventPhotoPicker(), 350);
        }}
        onShare={() => {
          setShowEventActionsSheet(false);
          Haptics.selectionAsync();
          shareEvent({ ...event, location: locationDisplay ?? null });
        }}
        onToggleLiveActivity={async () => {
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
              endTime: event.endTime,
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
        onReport={() => {
          setShowEventActionsSheet(false);
          handleReportEvent();
        }}
        onOpenColorPicker={() => {
          if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_start", { from: "event_actions", to: "color", ms: 350 });
          setShowEventActionsSheet(false);
          Haptics.selectionAsync();
          setTimeout(() => {
            setShowColorPicker(true);
            if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_open_child", { from: "event_actions", to: "color", ms: 350 });
          }, 350);
        }}
        onDelete={() => {
          setShowEventActionsSheet(false);
          Haptics.selectionAsync();
          setTimeout(() => setShowDeleteEventConfirm(true), 350);
        }}
        onRemoveImported={() => {
          if (__DEV__) devLog("[IMPORTED_EVENT]", "remove_pressed", { eventId: id });
          setShowEventActionsSheet(false);
          Haptics.selectionAsync();
          setTimeout(() => setShowRemoveImportedConfirm(true), 350);
        }}
      />

      <ReportModal
        visible={showReportModal}
        selectedReportReason={selectedReportReason}
        reportDetails={reportDetails}
        isSubmittingReport={isSubmittingReport}
        themeColor={themeColor}
        colors={colors}
        onClose={() => setShowReportModal(false)}
        onSelectReason={setSelectedReportReason}
        onChangeDetails={setReportDetails}
        onSubmit={submitEventReport}
        onCancel={() => {
          setShowReportModal(false);
          setSelectedReportReason(null);
          setReportDetails("");
        }}
      />

      <AttendeesSheet
        visible={showAttendeesModal}
        isLoading={isLoadingAttendees}
        hasError={!!attendeesError}
        isPrivacyDenied={attendeesPrivacyDenied}
        attendees={attendeesList}
        effectiveGoingCount={effectiveGoingCount}
        hostUserId={event?.user?.id}
        isDark={isDark}
        themeColor={themeColor}
        colors={colors}
        onClose={() => {
          setShowAttendeesModal(false);
          if (__DEV__) devLog('[P1_WHO_COMING_SHEET]', 'close', { eventId: id });
        }}
        onRetry={() => attendeesQuery.refetch()}
        onPressAttendee={(userId) => {
          setShowAttendeesModal(false);
          router.push(`/user/${userId}` as any);
        }}
      />

      <ColorPickerSheet
        visible={showColorPicker}
        currentColorOverride={currentColorOverride}
        colors={colors}
        onClose={() => setShowColorPicker(false)}
        onSelectColor={async (color) => {
          if (!id) return;
          if (isBusyBlock) {
            if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'blocked_busy', { eventId: id, isBusyBlock });
            return;
          }
          if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'color_pick', { eventId: id, color, isMyEvent });
          try {
            await setOverrideColor(id, color);
            if (__DEV__) devLog("[EventColorPicker] Color set:", { eventId: id, color });
          } catch (error) {
            safeToast.error("Save Failed", "Failed to save color");
          }
        }}
        onResetColor={async () => {
          if (!id) return;
          if (isBusyBlock) {
            if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'blocked_reset_busy', { eventId: id, isBusyBlock });
            return;
          }
          try {
            await resetColor(id);
            if (__DEV__) devLog("[EventColorPicker] Color reset to default:", { eventId: id });
          } catch (error) {
            safeToast.error("Save Failed", "Failed to reset color");
          }
        }}
      />

      <PhotoUploadSheet
        visible={showPhotoSheet}
        hasExistingPhoto={!!event?.eventPhotoUrl}
        uploadingPhoto={uploadingPhoto}
        themeColor={themeColor}
        colors={colors}
        onClose={() => setShowPhotoSheet(false)}
        onUploadPhoto={async () => {
          setShowPhotoSheet(false);
          // Wait for sheet dismiss animation before opening picker
          // Prevents iOS gesture/touch blocker overlay freeze
          await new Promise(r => setTimeout(r, 300));
          launchEventPhotoPicker();
        }}
        onRemovePhoto={async () => {
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
      />
    </SafeAreaView>
  );
}
