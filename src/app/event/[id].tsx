import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
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
import { openMaps } from "@/utils/openMaps";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
  ChevronRight,
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
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import BottomSheet from "@/components/BottomSheet";
import { UserListRow } from "@/components/UserListRow";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ExpoCalendar from "expo-calendar";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useLoadedOnce } from "@/lib/loadingInvariant";
import { once } from "@/lib/runtimeInvariants";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { uploadImage, uploadEventPhoto } from "@/lib/imageUpload";
import { getEventShareLink } from "@/lib/deepLinks";
import { safeToast } from "@/lib/safeToast";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";
import { guardEmailVerification } from "@/lib/emailVerification";
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
} from "@/shared/contracts";
import { EventReminderPicker } from "@/components/EventReminderPicker";
import { EventPhotoGallery } from "@/components/EventPhotoGallery";
// [P0_DEMO_LEAK] EventCategoryBadge import removed - category field unsupported by create/edit UI
import { EventSummaryModal } from "@/components/EventSummaryModal";
import { FirstRsvpNudge, canShowFirstRsvpNudge, markFirstRsvpNudgeCompleted } from "@/components/FirstRsvpNudge";
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
import {
  eventKeys,
  invalidateEventKeys,
  getRefetchOnEventFocus,
  getInvalidateAfterRsvpJoin,
  getInvalidateAfterJoinRequestAction,
  getInvalidateAfterComment,
  deriveAttendeeCount,
  logRsvpMismatch,
} from "@/lib/eventQueryKeys";

// Helper to open event location using the shared utility
const openEventLocation = (event: any) => {
  const lat = event?.lat ?? event?.latitude ?? event?.latitude;
  const lng = event?.lng ?? event?.longitude ?? event?.longitude;

  if (lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
    openMaps({ lat: Number(lat), lng: Number(lng), label: event?.location ?? event?.title });
  } else {
    openMaps({ query: event?.location ?? event?.title });
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

    // Get the shareable link for this event
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
  const [isSynced, setIsSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingSync, setIsCheckingSync] = useState(true);
  const [showFirstRsvpNudge, setShowFirstRsvpNudge] = useState(false);
  const [showNotificationPrePrompt, setShowNotificationPrePrompt] = useState(false);

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
  const { colorOverrides, getOverrideColor, setOverrideColor, resetColor } = useEventColorOverrides();
  const currentColorOverride = id ? getOverrideColor(id) : undefined;

  // Event Photo Lite state
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const pickerLaunching = useRef(false);
  const [photoNudgeDismissed, setPhotoNudgeDismissed] = useState(false);

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
        location: event.location,
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
        location: event.location ?? "",
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

  const fb = {
    restricted: !!_is403Restricted,
    hostId: _fbHostId,                       // string | undefined
    hostName: _fbHostName,                   // string | null
    hostImage: _fbHostImage,                 // string | null
    hostFirst: _fbHostFirst,                 // first token or "the host"
    hostDisplayName: _fbHostName ?? 'the host',
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
    (r) => r.userId === session?.user?.id
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

  // Fetch event interests/RSVPs
  const { data: interestsData } = useQuery({
    queryKey: eventKeys.interests(id ?? ""),
    queryFn: () => api.get<{ event_interest: Array<{ id: string; userId: string; user: { id: string; name: string | null; image: string | null }; status: string; createdAt: string }> }>(`/api/events/${id}/interests`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !isBusyBlock,
  });

  // Fetch current user's RSVP status
  const { data: myRsvpData } = useQuery({
    queryKey: eventKeys.rsvp(id ?? ""),
    queryFn: () => api.get<{ status: string | null; rsvpId: string | null }>(`/api/events/${id}/rsvp`),
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
  const myRsvpStatus = rawRsvpStatus === "maybe" ? "interested" : (rawRsvpStatus as "going" | "interested" | "not_going" | null);

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
  type RsvpStatus = "going" | "interested" | "not_going";

  const rsvpMutation = useMutation({
    mutationFn: (status: RsvpStatus) => {
      if (__DEV__) {
        devLog("[P0_RSVP]", "mutationFn", { eventId: id, status });
      }
      if (isBusyBlock) {
        throw new Error("BUSY_BLOCK");
      }
      return wrapRace("RSVP_submit", () => api.post(`/api/events/${id}/rsvp`, { status }));
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

      // Optimistically update attendees totalGoing count
      queryClient.setQueryData(eventKeys.attendees(id ?? ""), (old: AttendeesResponse | undefined) => {
        if (!old) return { attendees: [], totalGoing: nextTotalGoing };
        return { ...old, totalGoing: nextTotalGoing };
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
      return { previousRsvp, previousAttendees, previousSingle, prevRsvpStatus, nextStatus };
    },
    onSuccess: async (_, status) => {
      // Haptic feedback only - no intrusive toast popups
      if (status === "going") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      
      if (__DEV__) {
        devLog("[P0_RSVP]", "onSuccess", { eventId: id, nextStatus: status });
        // [P1_EVENT_PROJ] Proof: log which projection keys are invalidated
        devLog('[P1_EVENT_PROJ]', 'rsvp onSuccess invalidation', {
          eventId: id,
          nextStatus: status,
          keys: ['single', 'attendees', 'interests', 'rsvp', 'feed', 'feedPaginated', 'myEvents', 'calendar', 'attending'],
        });
      }
      
      // P0 FIX: Invalidate using SSOT contract
      invalidateEventKeys(queryClient, getInvalidateAfterRsvpJoin(id ?? ""), `rsvp_${status}`);
      setShowRsvpOptions(false);
      
      // Check if we should show notification pre-prompt (Aha moment: first RSVP going/interested)
      if (bootStatus === 'authed' && (status === "going" || status === "interested")) {
        const userId = session?.user?.id;
        const shouldShow = await shouldShowNotificationPrompt(userId);
        if (shouldShow) {
          // Wait 600ms before showing modal
          setTimeout(() => {
            setShowNotificationPrePrompt(true);
          }, 600);
        }
      }
      
      // Also check if we should show first RSVP nudge (different from notification prompt)
      if (bootStatus === 'authed') {
        const canShow = await canShowFirstRsvpNudge();
        if (canShow) {
          setShowFirstRsvpNudge(true);
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

      // Handle 409 EVENT_FULL error
      if (error?.response?.status === 409 || error?.status === 409) {
        safeToast.warning("Full", "This invite is full.");
        // [P1_EVENT_PROJ] Refetch owner + interests + feed on capacity error
        invalidateEventKeys(queryClient, [
          eventKeys.single(id ?? ""),
          eventKeys.interests(id ?? ""),
          eventKeys.feed(),
        ], "rsvp_error_409");
      } else {
        safeToast.error("Oops", "That didn't go through. Please try again.");
      }
    },
  });

  const handleRsvp = (status: RsvpStatus) => {
    // [P0_RSVP] Guard: prevent rapid-tap race conditions
    if (rsvpMutation.isPending) {
      if (__DEV__) {
        devLog('[P0_RSVP]', 'tap ignored (pending)', { eventId: id, nextStatus: status });
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
        router.replace('/login');
      }
      return;
    }
    // Guard: require email verification
    if (!guardEmailVerification(session)) {
      return;
    }
    // Show confirmation modal when removing RSVP
    if (status === "not_going" && myRsvpStatus && myRsvpStatus !== "not_going") {
      setShowRemoveRsvpConfirm(true);
      return;
    }
    rsvpMutation.mutate(status);
  };

  const confirmRemoveRsvp = () => {
    setShowRemoveRsvpConfirm(false);
    
    // [P0_RSVP] Guard: prevent race if mutation already pending
    if (rsvpMutation.isPending) {
      if (__DEV__) {
        devLog('[P0_RSVP]', 'confirm tap ignored (pending)', { eventId: id, nextStatus: 'not_going' });
      }
      return;
    }
    
    rsvpMutation.mutate("not_going");
  };

  // Toggle reflection enabled for event
  const toggleReflectionMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put(`/api/events/${id}`, { reflectionEnabled: enabled }),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Invalidate single event to refresh reflection state
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
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });

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
    setShowFirstRsvpNudge(false);
    router.push("/discover");
  };

  const handleFirstRsvpNudgeSecondary = async () => {
    await markFirstRsvpNudgeCompleted();
    setShowFirstRsvpNudge(false);
    router.push("/create");
  };

  const handleFirstRsvpNudgeDismiss = async () => {
    await markFirstRsvpNudgeCompleted();
    setShowFirstRsvpNudge(false);
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
        safeToast.error("Error", "Could not submit report. Please try again.");
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
              {/* Tappable host avatar - only when host info available */}
              {hasHostId ? (
                <Pressable onPress={goToHostProfile}>
                  {fb.hostImage ? (
                    <Image
                      source={{ uri: fb.hostImage }}
                      className="w-20 h-20 rounded-full mb-4"
                      style={{ borderWidth: 2, borderColor: colors.separator }}
                    />
                  ) : (
                    <View
                      className="w-20 h-20 rounded-full items-center justify-center mb-4"
                      style={{ backgroundColor: colors.background, borderWidth: 2, borderColor: colors.separator }}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: 28, fontWeight: '600' }}>
                        {fb.hostFirst.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
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
                Event details hidden
              </Text>

              {/* Line 3: body */}
              <Text
                className="text-center"
                style={{ color: colors.textSecondary, lineHeight: 22, marginBottom: 28 }}
              >
                {`Connect with ${fb.hostFirst} to see this event.`}
              </Text>

              {/* CTA: View profile (primary) or fallback text */}
              {hasHostId ? (
                <View className="w-full">
                  <Button
                    variant="primary"
                    label="View profile"
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

  return (
    <SafeAreaView testID="event-detail-screen" className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: event.title,
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerRight: () => (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowEventActionsSheet(true);
              }}
              className="p-2 mr-2"
            >
              <MoreHorizontal size={24} color={themeColor} />
            </Pressable>
          ),
        }}
      />

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Event Header */}
        <Animated.View entering={FadeInDown.springify()}>
          {/* Hero header surface — photo with overlay title */}
          {event.eventPhotoUrl && !event.isBusy && event.visibility !== "private" ? (
            <View
              style={{
                height: 240,
                borderRadius: 20,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <Image
                source={{ uri: event.eventPhotoUrl }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
                onLoad={() => {
                  if (__DEV__) devLog("[EVENT_HERO_PHOTO_LOADED]", `url=${event.eventPhotoUrl}`);
                  if (heroLoadedUrl.current === event.eventPhotoUrl) return;
                  heroLoadedUrl.current = event.eventPhotoUrl ?? null;
                  RNAnimated.parallel([
                    RNAnimated.timing(heroTitleOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
                    RNAnimated.timing(heroTitleTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }),
                  ]).start();
                }}
              />
              {/* Gradient-style overlay for title readability (5-layer feather) */}
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 110,
                  backgroundColor: "transparent",
                }}
              >
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.0)" }} />
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.05)" }} />
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.14)" }} />
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.28)" }} />
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.48)" }} />
              </View>
              {/* Title overlay */}
              <RNAnimated.View style={{ position: "absolute", bottom: 22, left: 16, right: 16, opacity: heroTitleOpacity, transform: [{ translateY: heroTitleTranslateY }] }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 22,
                    fontWeight: "700",
                    textShadowColor: "rgba(0,0,0,0.45)",
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 10,
                  }}
                  numberOfLines={2}
                >
                  {event.emoji} {event.title}
                </Text>
              </RNAnimated.View>
              {/* Floating edit button (host only) */}
              {isMyEvent && (
                <RNAnimated.View style={{ position: "absolute", top: editTop, right: 12, transform: [{ scale: editScale }] }}>
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
                      backgroundColor: "rgba(0,0,0,0.65)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.18)",
                    }}
                  >
                    <Pencil size={16} color="#fff" />
                  </Pressable>
                </RNAnimated.View>
              )}
            </View>
          ) : (
            <>
              {/* Host-only photo nudge (no photo yet) */}
              {isMyEvent && !event.eventPhotoUrl && !event.isBusy && event.visibility !== "private" && !photoNudgeDismissed && (
                <View className="rounded-2xl p-4 mb-3 items-center" style={{ backgroundColor: isDark ? "#1C1C1E" : "#F9FAFB", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" }}>
                  <Camera size={28} color={isDark ? "#9CA3AF" : "#6B7280"} />
                  <Text className="text-sm font-medium mt-2" style={{ color: colors.textSecondary }}>Add a photo (optional)</Text>
                  <Pressable
                    onPress={() => setShowPhotoSheet(true)}
                    className="mt-3 rounded-lg px-5 py-2"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-sm font-semibold text-white">Add photo</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      setPhotoNudgeDismissed(true);
                      await AsyncStorage.setItem(`dismissedEventPhotoNudge_${id}`, "true");
                    }}
                    className="mt-2 p-1"
                  >
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>Not now</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            {/* Emoji + title card — only when there's NO hero photo */}
            {!(event.eventPhotoUrl && !event.isBusy && event.visibility !== "private") && (
            <View className="items-center mb-4">
              <View className="w-20 h-20 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}>
                <Text className="text-4xl">{event.emoji}</Text>
              </View>
              <Text className="text-2xl font-bold text-center" style={{ color: colors.text }}>
                {event.title}
              </Text>
            </View>
            )}

            {/* Host Info */}
            {event.user && (
              <View className="border-t" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center py-3">
                  <View className="w-10 h-10 rounded-full mr-3 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                    {event.user?.image ? (
                      <Image source={{ uri: event.user?.image }} className="w-full h-full" />
                    ) : (
                      <View className="w-full h-full items-center justify-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}>
                        <Text className="text-sm font-semibold" style={{ color: themeColor }}>
                          {event.user?.name?.[0] ?? "?"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm" style={{ color: colors.textTertiary }}>Hosted by</Text>
                    <Text className="font-semibold" style={{ color: colors.text }}>
                      {isMyEvent ? "You" : event.user?.name ?? event.user?.email ?? "Guest"}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Date & Time */}
            <View className="flex-row items-center py-3 border-t" style={{ borderColor: colors.border }}>
              <Calendar size={20} color={themeColor} />
              <View className="ml-3">
                <Text className="text-sm" style={{ color: colors.textTertiary }}>Date & Time</Text>
                <Text className="font-semibold" style={{ color: colors.text }}>
                  {dateLabel} at {timeLabel}
                </Text>
              </View>
            </View>

            {/* Location */}
            {event.location && (
              <View className="py-3 border-t" style={{ borderColor: colors.border }}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    openEventLocation(event);
                  }}
                  className="flex-row items-center"
                >
                  <MapPin size={20} color="#4ECDC4" />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm" style={{ color: colors.textTertiary }}>Location</Text>
                    <Text className="font-semibold" style={{ color: colors.text }}>{event.location}</Text>
                  </View>
                  <ChevronRight
                    size={20}
                    color="#9CA3AF"
                    style={{
                      transform: [{ rotate: showMap ? "90deg" : "0deg" }],
                    }}
                  />
                </Pressable>
                <View className="mt-3 ml-8">
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      openEventLocation(event);
                    }}
                    className="bg-teal-500 rounded-xl py-3 flex-row items-center justify-center"
                    style={{
                      shadowColor: "#4ECDC4",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.3,
                      shadowRadius: 4,
                    }}
                  >
                    <ArrowRight size={18} color="#fff" />
                    <Text className="text-white font-semibold ml-2">
                      Get Directions
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Description */}
            {event.description && (
              <View className="py-3 border-t" style={{ borderColor: colors.border }}>
                <View className="flex-row items-start">
                  <MessageCircle size={20} color="#9B59B6" />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm" style={{ color: colors.textTertiary }}>Description</Text>
                    <Text className="mt-1 leading-5" style={{ color: colors.text }}>
                      {event.description}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Visibility - Host only */}
            {isMyEvent && (
            <View className="py-3 border-t" style={{ borderColor: colors.border }}>
              <View className="flex-row items-center">
                {/* Busy blocks always show "Only self" regardless of stored visibility */}
                {event.isBusy ? (
                  <Users size={20} color="#9CA3AF" />
                ) : event.visibility === "all_friends" ? (
                  <Compass size={20} color="#9CA3AF" />
                ) : (
                  <Users size={20} color="#9CA3AF" />
                )}
                <View className="ml-3 flex-1">
                  <Text className="text-sm" style={{ color: colors.textTertiary }}>Visibility</Text>
                  <Text className="font-semibold" style={{ color: colors.text }}>
                    {event.isBusy ? "Only self" : event.visibility === "all_friends" ? "All Friends" : "Specific Groups"}
                  </Text>
                </View>
              </View>

              {/* Show tagged groups if visibility is specific_groups AND not a busy block */}
              {!event.isBusy && event.visibility === "specific_groups" && event.groupVisibility && event.groupVisibility.length > 0 && (
                <View className="mt-3 ml-8">
                  <View className="flex-row flex-wrap">
                    {event.groupVisibility.map((gv) => (
                      <View
                        key={gv.groupId}
                        className="rounded-full px-3 py-1.5 mr-2 mb-2 flex-row items-center"
                        style={{ backgroundColor: gv.group.color + "20" }}
                      >
                        <View
                          className="w-2.5 h-2.5 rounded-full mr-1.5"
                          style={{ backgroundColor: gv.group.color }}
                        />
                        <Text className="font-medium text-xs" style={{ color: gv.group.color }}>
                          {gv.group.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
            )}

            {/* Spots (Capacity) — [P1_EVENT_META] reads from eventMeta (owner query only) */}
            {eventMeta.capacity != null && (
              <View className="py-3 border-t" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center">
                  <Users size={20} color={eventMeta.isFull ? "#EF4444" : "#22C55E"} />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm" style={{ color: colors.textTertiary }}>Spots</Text>
                    <Text className="font-semibold" style={{ color: eventMeta.isFull ? "#EF4444" : colors.text }}>
                      {eventMeta.goingCount ?? 0} / {eventMeta.capacity} filled
                    </Text>
                  </View>
                  {eventMeta.isFull && (
                    <View className="px-3 py-1 rounded-full" style={{ backgroundColor: "#EF444420" }}>
                      <Text className="text-xs font-semibold" style={{ color: "#EF4444" }}>Full</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Sync to Calendar Button / Synced Badge */}
            <View className="py-3 mt-1 border-t" style={{ borderColor: colors.border }}>
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

            {/* Category Badge - HIDDEN until create/edit supports category selection
             * [P0_DEMO_LEAK] The category field exists in schema but no UI to set it.
             * Showing it leaks demo/seed data to production users.
             * Re-enable when EventCategoryPicker is integrated into create.tsx and edit/[id].tsx.
             */}
            {__DEV__ && event.category && (() => {
              devLog(`[P0_DEMO_LEAK] suppressedPill key=category reason=unsupported_by_ui eventIdPrefix=${event.id.slice(0, 6)}`);
              return null;
            })()}
          </View>
        </Animated.View>

        {/* Photo Memories */}
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <EventPhotoGallery
            eventId={event.id}
            eventTitle={event.title}
            eventTime={startDate}
            isOwner={isMyEvent}
          />
        </Animated.View>

        {/* Host Event Summary/Reflection Section - Hidden for busy blocks */}
        {isMyEvent && !event.isBusy && (
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            {(() => {
              const eventEndTime = event.endTime ? new Date(event.endTime) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
              const hasEnded = new Date() > eventEndTime;
              const hasSummary = event.summary && event.summary.length > 0;
              const attendeeCount = event.joinRequests?.filter((r) => r.status === "accepted").length ?? 0;
              const reflectionEnabled = event.reflectionEnabled === true; // default false

              // Show the section if:
              // 1. Event has ended and reflection is enabled
              // 2. A summary already exists
              // 3. Event hasn't ended yet (to allow toggling the setting)
              if (!hasEnded && !hasSummary) {
                // Before event ends, show toggle option in a compact form
                return (
                  <View className="rounded-2xl p-4 mb-4 flex-row items-center justify-between" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center">
                        <NotebookPen size={18} color={colors.textSecondary} />
                        <Text className="ml-2 text-sm" style={{ color: colors.text }}>
                          Post-event reflection
                        </Text>
                      </View>
                      <Text className="text-xs mt-1 ml-6" style={{ color: colors.textTertiary }}>
                        Get a reminder to rate and reflect after the event ends
                      </Text>
                    </View>
                    <Switch
                      value={reflectionEnabled}
                      onValueChange={(value) => toggleReflectionMutation.mutate(value)}
                      trackColor={{ false: isDark ? "#3C3C3E" : "#E5E7EB", true: themeColor + "80" }}
                      thumbColor={reflectionEnabled ? themeColor : isDark ? "#6B6B6B" : "#f4f3f4"}
                      disabled={toggleReflectionMutation.isPending}
                    />
                  </View>
                );
              }

              // After event ends but reflection is disabled, show option to enable
              if (hasEnded && !reflectionEnabled && !hasSummary) {
                return (
                  <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1">
                        <NotebookPen size={18} color={colors.textSecondary} />
                        <Text className="ml-2 text-sm" style={{ color: colors.textSecondary }}>
                          Reflection disabled
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => toggleReflectionMutation.mutate(true)}
                        disabled={toggleReflectionMutation.isPending}
                      >
                        <Text className="text-sm font-medium" style={{ color: themeColor }}>
                          Enable
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }

              // Don't show the full reflection section if disabled and no existing summary
              if (!reflectionEnabled && !hasSummary) return null;

              return (
                <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
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
                    // Show existing summary
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
                    // Prompt to add summary
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
                      {/* Option to disable reflection */}
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
              );
            })()}
          </Animated.View>
        )}

        {/* Who's Coming Section - P0 FIX: Use attendees endpoint */}
        {(() => {
          // 403 privacy denied: show privacy message
          if (attendeesPrivacyDenied) {
            return (
              <Animated.View entering={FadeInDown.delay(75).springify()}>
                <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  <View className="flex-row items-center mb-3">
                    <Lock size={20} color="#9CA3AF" />
                    <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                      Who's Coming
                    </Text>
                  </View>
                  <View className="rounded-xl p-4 items-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                    <Text className="text-sm text-center" style={{ color: colors.textSecondary }}>
                      Attendees visible to invited or going members
                    </Text>
                  </View>
                </View>
              </Animated.View>
            );
          }

          // Has attendees: show compact roster preview (1-row avatar stack)
          if (effectiveGoingCount > 0 || attendeesList.length > 0) {
            // Build preview list: host first (if in list), then others, max 5 visible
            const STACK_MAX = 5;
            const AVATAR_SIZE = 36;
            const OVERLAP = 10;
            const hostId = event?.user?.id;
            const hostInList = attendeesList.find(a => a.id === hostId);
            const nonHostAttendees = attendeesList.filter(a => a.id !== hostId);
            // Host first, then others
            const orderedForStack: AttendeeInfo[] = [
              ...(hostInList ? [hostInList] : []),
              ...nonHostAttendees,
            ];
            // If host not in endpoint list but we know them from event.user, prepend
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
              <Animated.View entering={FadeInDown.delay(75).springify()}>
                <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  {/* Header row: title + count + View all */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <UserCheck size={20} color="#22C55E" />
                      <Text style={{ fontSize: 17, fontWeight: '600', marginLeft: 8, color: colors.text }}>
                        Who's Coming
                      </Text>
                      <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 8 }}>
                        <Text style={{ color: '#166534', fontSize: 12, fontWeight: '700' }}>
                          {effectiveGoingCount}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setShowAttendeesModal(true);
                      }}
                      hitSlop={8}
                    >
                      <Text style={{ color: themeColor, fontSize: 14, fontWeight: '500' }}>
                        View all
                      </Text>
                    </Pressable>
                  </View>

                  {/* Compact avatar stack (1 row, overlapping) */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: stackWidth, height: AVATAR_SIZE, flexDirection: 'row' }}>
                      {visibleAvatars.map((attendee, idx) => {
                        const isHost = attendee.id === hostId || attendee.isHost;
                        return (
                          <View
                            key={attendee.id}
                            style={{
                              position: 'absolute',
                              left: idx * (AVATAR_SIZE - OVERLAP),
                              width: AVATAR_SIZE,
                              height: AVATAR_SIZE,
                              borderRadius: AVATAR_SIZE / 2,
                              backgroundColor: isHost ? (isDark ? '#3C2A1A' : '#FFF7ED') : '#DCFCE7',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 2,
                              borderColor: isHost ? (isDark ? '#92400E' : '#FDBA74') : '#BBF7D0',
                              zIndex: visibleAvatars.length - idx,
                            }}
                          >
                            {attendee.imageUrl ? (
                              <Image
                                source={{ uri: attendee.imageUrl }}
                                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
                              />
                            ) : (
                              <Text style={{ fontSize: 14, fontWeight: '600', color: isHost ? '#92400E' : '#166534' }}>
                                {attendee.name?.[0] ?? '?'}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                      {overflowCount > 0 && (
                        <View
                          style={{
                            position: 'absolute',
                            left: visibleAvatars.length * (AVATAR_SIZE - OVERLAP),
                            width: AVATAR_SIZE,
                            height: AVATAR_SIZE,
                            borderRadius: AVATAR_SIZE / 2,
                            backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 2,
                            borderColor: isDark ? '#3C3C3E' : '#E5E7EB',
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                            +{overflowCount}
                          </Text>
                        </View>
                      )}
                    </View>
                    {/* Host label inline */}
                    {event?.user && (
                      <Text style={{ marginLeft: 12, fontSize: 13, color: colors.textTertiary }}>
                        Hosted by {isMyEvent ? 'you' : event.user.name?.split(' ')[0] ?? 'Host'}
                      </Text>
                    )}
                  </View>
                </View>
              </Animated.View>
            );
          }

          // No one coming yet - show placeholder
          return (
            <Animated.View entering={FadeInDown.delay(75).springify()}>
              <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <View className="flex-row items-center mb-3">
                  <UserCheck size={20} color="#9CA3AF" />
                  <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                    Who's Coming
                  </Text>
                </View>

                {/* Show the host */}
                {event.user && (
                  <View className="mb-3">
                    <Text className="text-xs mb-2" style={{ color: colors.textTertiary }}>HOST</Text>
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full items-center justify-center border-2" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED", borderColor: isDark ? "#3C3C3E" : "#FDBA74" }}>
                        {event.user.image ? (
                          <Image
                            source={{ uri: event.user.image }}
                            className="w-full h-full rounded-full"
                          />
                        ) : (
                          <Text className="font-semibold" style={{ color: themeColor }}>
                            {event.user.name?.[0] ?? "?"}
                          </Text>
                        )}
                      </View>
                      <Text className="ml-3 font-medium" style={{ color: colors.text }}>
                        {isMyEvent ? "You" : event.user.name ?? "Host"}
                      </Text>
                    </View>
                  </View>
                )}

                <View className="rounded-xl p-4 items-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                  <Users size={24} color="#9CA3AF" />
                  <Text className="text-sm mt-2 text-center" style={{ color: colors.textSecondary }}>
                    No one has joined yet.{"\n"}Be the first!
                  </Text>
                </View>
              </View>
            </Animated.View>
          );
        })()}

        {/* Join Request Section (for non-owners) */}
        {!isMyEvent && !event?.isBusy && (
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            {hasJoinRequest ? (
              <View className="rounded-2xl p-5 mb-4 items-center" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <View className="w-12 h-12 rounded-full bg-green-100 items-center justify-center mb-2">
                  <Check size={24} color="#22C55E" />
                </View>
                <Text className="font-semibold" style={{ color: colors.text }}>You're Attending!</Text>
                <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                  This event is on your calendar
                </Text>
              </View>
            ) : (
              <View className="mb-4">
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
                
                {/* Current RSVP status display */}
                {myRsvpStatus && (
                  <View className="mb-3">
                    <View
                      className="rounded-2xl p-4 flex-row items-center justify-between"
                      style={{
                        backgroundColor: myRsvpStatus === "going" ? "#22C55E15" :
                                         myRsvpStatus === "interested" ? "#EC489915" : colors.surface,
                        borderWidth: 1,
                        borderColor: myRsvpStatus === "going" ? "#22C55E" :
                                     myRsvpStatus === "interested" ? "#EC4899" : colors.border,
                      }}
                    >
                      <View className="flex-row items-center">
                        {myRsvpStatus === "going" && <Check size={20} color="#22C55E" />}
                        {myRsvpStatus === "interested" && <Heart size={20} color="#EC4899" />}
                        {myRsvpStatus === "not_going" && <X size={20} color={colors.textTertiary} />}
                        <Text className="font-semibold ml-2" style={{
                          color: myRsvpStatus === "going" ? "#22C55E" :
                                 myRsvpStatus === "interested" ? "#EC4899" : colors.textSecondary
                        }}>
                          {myRsvpStatus === "going" ? "You're In" :
                           myRsvpStatus === "interested" ? "Interested" : "Not Going"}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setShowRsvpOptions(!showRsvpOptions)}
                        disabled={rsvpMutation.isPending}
                        className="px-3 py-1.5 rounded-full"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                      >
                        <Text className="text-sm" style={{ color: colors.textSecondary }}>Change</Text>
                      </Pressable>
                    </View>
                    {myRsvpStatus === "going" && (
                      <Text className="text-xs mt-2 px-4" style={{ color: colors.textSecondary }}>
                        On your calendar · You can change this anytime
                      </Text>
                    )}
                  </View>
                )}

                {/* RSVP Options */}
                {(!myRsvpStatus || showRsvpOptions) && (
                  <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: rsvpMutation.isPending ? 0.6 : 1 }}>
                    {/* Full indicator — [P1_EVENT_META] reads from eventMeta (owner query only) */}
                    {eventMeta.isFull && myRsvpStatus !== "going" && (
                      <View className="flex-row items-center justify-center py-3" style={{ backgroundColor: "#EF444415" }}>
                        <Users size={16} color="#EF4444" />
                        <Text className="ml-2 text-sm font-medium" style={{ color: "#EF4444" }}>This invite is full</Text>
                      </View>
                    )}
                    {/* Pending indicator */}
                    {rsvpMutation.isPending && (
                      <View className="flex-row items-center justify-center py-2" style={{ backgroundColor: colors.surfaceElevated }}>
                        <ActivityIndicator size="small" color={themeColor} />
                        <Text className="ml-2 text-sm" style={{ color: colors.textSecondary }}>Updating…</Text>
                      </View>
                    )}
                    {/* Going - disabled if full and not already going — [P1_EVENT_META] */}
                    {eventMeta.isFull && myRsvpStatus !== "going" ? (
                      <View
                        className="flex-row items-center p-4"
                        style={{ borderBottomWidth: 1, borderBottomColor: colors.separator, opacity: 0.5 }}
                      >
                        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: colors.surfaceElevated }}>
                          <Users size={20} color={colors.textTertiary} />
                        </View>
                        <View className="flex-1">
                          <Text className="font-semibold" style={{ color: colors.textTertiary }}>Full</Text>
                          <Text className="text-xs" style={{ color: colors.textTertiary }}>No spots available</Text>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        testID="rsvp-going-button"
                        onPress={() => handleRsvp("going")}
                        disabled={rsvpMutation.isPending}
                        className="flex-row items-center p-4"
                        style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
                      >
                        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#22C55E20" }}>
                          <Check size={20} color="#22C55E" />
                        </View>
                        <View className="flex-1">
                          <Text className="font-semibold" style={{ color: colors.text }}>You're In</Text>
                          <Text className="text-xs" style={{ color: colors.textSecondary }}>Added to your calendar</Text>
                        </View>
                        {myRsvpStatus === "going" && <Check size={18} color={themeColor} />}
                      </Pressable>
                    )}

                    {/* Interested */}
                    <Pressable
                      testID="rsvp-interested-button"
                      onPress={() => handleRsvp("interested")}
                      disabled={rsvpMutation.isPending}
                      className="flex-row items-center p-4"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
                    >
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#EC489920" }}>
                        <Heart size={20} color="#EC4899" />
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold" style={{ color: colors.text }}>Interested</Text>
                        <Text className="text-xs" style={{ color: colors.textSecondary }}>Save for later (not on calendar)</Text>
                      </View>
                      {myRsvpStatus === "interested" && <Check size={18} color={themeColor} />}
                    </Pressable>

                    {/* Not Going */}
                    <Pressable
                      onPress={() => handleRsvp("not_going")}
                      disabled={rsvpMutation.isPending}
                      className="flex-row items-center p-4"
                    >
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                        <X size={20} color={colors.textTertiary} />
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold" style={{ color: colors.text }}>Can't Make It</Text>
                        <Text className="text-xs" style={{ color: colors.textSecondary }}>Maybe next time</Text>
                      </View>
                      {myRsvpStatus === "not_going" && <Check size={18} color={themeColor} />}
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </Animated.View>
        )}

        {/* Interested Users Section */}
        {interests.length > 0 && (
          <Animated.View entering={FadeInDown.delay(120).springify()} className="mb-4">
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
                    <View
                      className="w-6 h-6 rounded-full overflow-hidden mr-2"
                      style={{ backgroundColor: "#EC489930" }}
                    >
                      {interest.user.image ? (
                        <Image source={{ uri: interest.user.image }} className="w-full h-full" />
                      ) : (
                        <View className="w-full h-full items-center justify-center">
                          <Text className="text-xs font-bold" style={{ color: "#EC4899" }}>
                            {interest.user.name?.[0] ?? "?"}
                          </Text>
                        </View>
                      )}
                    </View>
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
          <Animated.View entering={FadeInDown.delay(100).springify()} className="mb-4">
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

        {/* Comments Section */}
        <Animated.View entering={FadeInDown.delay(125).springify()}>
          <View className="mb-4">
            <View className="flex-row items-center mb-2">
              <MessageCircle size={20} color={themeColor} />
              <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                Discussion
              </Text>
              {comments.length > 0 && (
                <View className="px-2 py-1 rounded-full ml-2" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}>
                  <Text className="text-xs font-semibold" style={{ color: themeColor }}>
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
            <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
              {commentImage && (
                <View className="mb-3 relative">
                  <Image
                    source={{ uri: commentImage }}
                    className="w-full h-40 rounded-xl"
                    resizeMode="cover"
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
                {/* Conversation starter suggestions */}
                <View className="w-full">
                  <Text className="text-xs font-medium mb-2" style={{ color: colors.textTertiary }}>
                    Try asking:
                  </Text>
                  {[
                    "What should I bring? 🎒",
                    "Anyone want to carpool? 🚗",
                    "Running late, start without me? ⏰",
                  ].map((suggestion, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => setCommentText(suggestion)}
                      className="rounded-lg p-2 mb-1"
                      style={{ backgroundColor: isDark ? "#3C3C3E" : "#F3F4F6" }}
                    >
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        {suggestion}
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
                        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}>
                          {comment.user.image ? (
                            <Image
                              source={{ uri: comment.user.image }}
                              className="w-full h-full rounded-full"
                            />
                          ) : (
                            <Text className="font-semibold" style={{ color: themeColor }}>
                              {comment.user.name?.[0] ?? "?"}
                            </Text>
                          )}
                        </View>
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
                            <Image
                              source={{ uri: comment.imageUrl }}
                              className="w-full h-48 rounded-xl mt-2"
                              resizeMode="cover"
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
                  openGoogleCalendar(event);
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
                  addToDeviceCalendar(event, safeToast);
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

      <FirstRsvpNudge
        visible={showFirstRsvpNudge}
        onPrimary={handleFirstRsvpNudgePrimary}
        onSecondary={handleFirstRsvpNudgeSecondary}
        onDismiss={handleFirstRsvpNudgeDismiss}
      />

      {/* Notification Pre-Prompt Modal (Aha moment: first RSVP going/interested) */}
      <NotificationPrePromptModal
        visible={showNotificationPrePrompt}
        onClose={() => setShowNotificationPrePrompt(false)}
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
                      shareEvent(event);
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
                    setShowEventActionsSheet(false);
                    Haptics.selectionAsync();
                    setShowColorPicker(true);
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
                          // Defense-in-depth: block non-host + busy [P0_EVENT_COLOR_GATE]
                          if (!isMyEvent || isBusyBlock) {
                            if (__DEV__) devLog('[P0_EVENT_COLOR_GATE]', 'blocked', { eventId: id, isMyEvent, isBusyBlock });
                            return;
                          }
                          if (__DEV__) devLog('[P0_EVENT_COLOR_GATE]', 'allowed', { eventId: id, isMyEvent });
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          try {
                            await setOverrideColor(id, color);
                            if (__DEV__) {
                              devLog("[EventColorPicker] Color set:", { eventId: id, color });
                            }
                          } catch (error) {
                            safeToast.error("Error", "Failed to save color");
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
                      // Defense-in-depth: block non-host + busy [P0_EVENT_COLOR_GATE]
                      if (!isMyEvent || isBusyBlock) {
                        if (__DEV__) devLog('[P0_EVENT_COLOR_GATE]', 'blocked_reset', { eventId: id, isMyEvent, isBusyBlock });
                        return;
                      }
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      try {
                        await resetColor(id);
                        if (__DEV__) {
                          devLog("[EventColorPicker] Color reset to default:", { eventId: id });
                        }
                      } catch (error) {
                        safeToast.error("Error", "Failed to reset color");
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
              if (uploadingPhoto || pickerLaunching.current) return; // re-entry guard
              pickerLaunching.current = true;
              setShowPhotoSheet(false);
              // Wait for sheet dismiss animation before opening picker
              // Prevents iOS gesture/touch blocker overlay freeze
              await new Promise(r => setTimeout(r, 300));
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
                const upload = await uploadEventPhoto(result.assets[0].uri);
                await api.put(`/api/events/${id}/photo`, {
                  eventPhotoUrl: upload.url,
                  eventPhotoPublicId: upload.publicId,
                });
                queryClient.invalidateQueries({ queryKey: eventKeys.single(id ?? "") });
                queryClient.invalidateQueries({ queryKey: eventKeys.all() });
                safeToast.success("Photo added");
              } catch (e: any) {
                if (__DEV__) devError("[EVENT_PHOTO_UPLOAD]", e);
                safeToast.error("Upload failed", e?.message ?? "Please try again.");
              } finally {
                setUploadingPhoto(false);
                pickerLaunching.current = false;
              }
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
                  queryClient.invalidateQueries({ queryKey: eventKeys.single(id ?? "") });
                  queryClient.invalidateQueries({ queryKey: eventKeys.all() });
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
