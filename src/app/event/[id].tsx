import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Linking,
  Platform,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  useWindowDimensions,
  Animated as RNAnimated,
  KeyboardAvoidingView,
} from "react-native";
import { trackEventRsvp, trackRsvpCompleted, trackRsvpError, trackEventPageViewed, trackRsvpAttempt, trackRsvpRedirectToAuth, trackRsvpSuccess, trackShareTriggered } from "@/analytics/analyticsEventsSSOT";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { STACK_BOTTOM_PADDING } from "@/lib/layoutSpacing";
import { refreshAfterFriendRequestSent } from "@/lib/refreshAfterMutation";
import { markTimeline } from "@/lib/devConvergenceTimeline";

import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import Animated, { FadeInDown, FadeIn, useSharedValue, withSpring, useAnimatedStyle, useAnimatedScrollHandler, interpolate, Extrapolation, runOnJS } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useLoadedOnce } from "@/lib/loadingInvariant";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { uploadImage, uploadEventPhoto } from "@/lib/imageUpload";
import { buildEventSmsBody, getEventUniversalLink } from "@/lib/shareSSOT";
import { copyPlainText } from "@/lib/clipboard";
import { safeToast } from "@/lib/safeToast";
import { BusyBlockGate } from "@/components/event/BusyBlockGate";
import { PrivacyRestrictedGate } from "@/components/event/PrivacyRestrictedGate";
import { StickyRsvpBar } from "@/components/event/StickyRsvpBar";
import { HostReflectionCard } from "@/components/event/HostReflectionCard";
import { MemoriesRow } from "@/components/event/MemoriesRow";
import { EventSettingsAccordion } from "@/components/event/EventSettingsAccordion";
import { DiscussionCard } from "@/components/event/DiscussionCard";
import { WhosComingCard } from "@/components/event/WhosComingCard";
import { AboutCard } from "@/components/event/AboutCard";
import { ConfirmedAttendeeBanner } from "@/components/event/ConfirmedAttendeeBanner";
import { PhotoNudge } from "@/components/event/PhotoNudge";
import { EventHeroNav } from "@/components/event/EventHeroNav";
import { EventDetailErrorState } from "@/components/event/EventDetailErrorState";
import { HostActionCard } from "@/components/event/HostActionCard";
import { ThemeBackgroundLayers } from "@/components/event/ThemeBackgroundLayers";
import { EventModals } from "@/components/event/EventModals";
import { ShareFlyerSheet } from "@/components/event/ShareFlyerSheet";
import { ShareToFriendsSheet } from "@/components/event/ShareToFriendsSheet";
import { InviteViaTextSheet } from "@/components/event/InviteViaTextSheet";
import { useSaveEvent } from "@/hooks/useSaveEvent";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import { shouldMaskEvent } from "@/lib/eventVisibility";
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
import { canShowFirstRsvpNudge, markFirstRsvpNudgeCompleted } from "@/components/FirstRsvpNudge";
import { canShowPostValueInvite } from "@/components/PostValueInvitePrompt";
import { shouldShowNotificationPrompt } from "@/lib/notificationPrompt";
import { setPendingRsvpIntent, type PendingRsvpStatus } from "@/lib/pendingRsvp";
import {
  checkCalendarPermission,
  isEventSynced,
  syncEventToDeviceCalendar,
  requestCalendarPermissions,
} from "@/lib/calendarSync";
import { useEventColorOverrides } from "@/hooks/useEventColorOverrides";
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
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { resolveBannerUri } from "@/lib/heroSSOT";
import { BlurView } from "expo-blur";
import { InviteFlipCard } from "@/components/InviteFlipCard";
import { isEventRevealed, markEventRevealed } from "@/lib/revealGate";
import { trackEventRevealed } from "@/analytics/analyticsEventsSSOT";
import { resolveEventTheme, buildCustomThemeTokens } from "@/lib/eventThemes";
import { startLiveActivity, updateLiveActivity, endLiveActivity, getActiveLiveActivityEventId, areLiveActivitiesEnabled, isEligibleForAutoStart, isEligibleForAutoStartOnFocus, cleanupExpiredActivities } from "@/lib/liveActivity";
import { openEventLocation, openGoogleCalendar, addToDeviceCalendar, buildShareInput, shareEvent, formatTimeAgo, deriveLocationDisplay, deriveDateLabels } from "@/lib/eventDetailUtils";
import { getEventDetailTheme } from "@/lib/eventDetailThemes";

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
  const [showDeleteCommentConfirm, setShowDeleteCommentConfirm] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [showRemoveRsvpConfirm, setShowRemoveRsvpConfirm] = useState(false);
  const [showDeleteEventConfirm, setShowDeleteEventConfirm] = useState(false);
  const [showRemoveImportedConfirm, setShowRemoveImportedConfirm] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingSync, setIsCheckingSync] = useState(true);
  // [POST_CREATE] Nudge banner — shown once per create entry, dismissible

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
  const [showShareFlyerSheet, setShowShareFlyerSheet] = useState(false);
  const [showShareToFriendsSheet, setShowShareToFriendsSheet] = useState(false);
  const [showInviteViaTextSheet, setShowInviteViaTextSheet] = useState(false);

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

  // ── Scroll-driven flip shared value ──
  const scrollFlipProgress = useSharedValue(0);
  const scrollYValue = useSharedValue(0);
  const flipTriggeredRef = useRef(false);

  // ── Flip-to-reveal gate (Phase 6C) ──
  const [contentRevealed, setContentRevealed] = useState(() => isEventRevealed(id as string));
  const [hasBeenFlipped, setHasBeenFlipped] = useState(() => isEventRevealed(id as string));

  // ── Scroll-driven flip handler ──
  const FLIP_SCROLL_THRESHOLD = 280;

  const handleScrollFlipReveal = useCallback(() => {
    if (!flipTriggeredRef.current) {
      flipTriggeredRef.current = true;
      setContentRevealed(true);
      setHasBeenFlipped(true);
      markEventRevealed(id as string);
      trackEventRevealed({ eventId: id as string, userId: session?.user?.id ?? null });
    }
  }, [id, session?.user?.id]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      scrollYValue.value = y;
      const progress = interpolate(y, [0, FLIP_SCROLL_THRESHOLD], [0, 1], Extrapolation.CLAMP);
      scrollFlipProgress.value = progress;
      if (progress >= 0.5 && !flipTriggeredRef.current) {
        runOnJS(handleScrollFlipReveal)();
      }
    },
  });

  // During flip phase (scrollY 0→FLIP_SCROLL_THRESHOLD): content stays pinned
  // by counteracting scroll offset. After flip: scrolls normally.
  const contentPinStyle = useAnimatedStyle(() => {
    const compensate = Math.min(scrollYValue.value, FLIP_SCROLL_THRESHOLD);
    return { transform: [{ translateY: -compensate }] };
  });

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

  // Fetch comments — cursor-paginated
  const COMMENTS_PAGE_SIZE = 30;
  const {
    data: commentsInfiniteData,
    isLoading: isLoadingComments,
    fetchNextPage: fetchMoreComments,
    hasNextPage: hasMoreComments,
    isFetchingNextPage: isFetchingMoreComments,
  } = useInfiniteQuery({
    queryKey: eventKeys.comments(id ?? ""),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(COMMENTS_PAGE_SIZE) });
      if (pageParam) params.set("cursor", pageParam);
      return api.get<GetEventCommentsResponse>(`/api/events/${id}/comments?${params}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthedForNetwork(bootStatus, session) && !!id,
  });

  const comments = useMemo(
    () => commentsInfiniteData?.pages.flatMap((p) => p.comments ?? []) ?? [],
    [commentsInfiniteData?.pages],
  );

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
  // Content card surface — theme-derived only (cardColor scoped to InviteFlipCard via its own prop)
  const cardSurfaceBg = isDark ? "rgba(20,20,24,0.62)" : "rgba(255,255,255,0.82)";
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

  // Fetch grouped RSVPs (includes going, interested, not_going, maybe)
  type RsvpUser = { id: string; name: string | null; image: string | null };
  type GroupedRsvps = { going: RsvpUser[]; interested: RsvpUser[]; not_going: RsvpUser[]; maybe: RsvpUser[] };
  const { data: groupedRsvpsData } = useQuery({
    queryKey: eventKeys.rsvps(id ?? ""),
    queryFn: () => api.get<GroupedRsvps>(`/api/events/${id}/rsvps`),
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

  // Guest RSVPs from event detail response (Phase 1 — no additional fetch)
  const guestRsvps = event?.guestRsvps;
  const guestGoingList = (guestRsvps ?? []).filter((g) => g.status === "going");
  const guestNotGoingList = (guestRsvps ?? []).filter((g) => g.status === "not_going");
  const guestGoingCount = guestGoingList.length;
  // Privacy flags from event detail
  const showGuestList = (event as any)?.showGuestList !== false;
  const showGuestCount = (event as any)?.showGuestCount !== false;
  const hideDetailsUntilRsvp = (event as any)?.hideDetailsUntilRsvp === true;

  // [P1_EVENT_META] COUNT SSOT — single source of truth for displayed count.
  // INVARIANT: displayedCount MUST derive exclusively from eventMeta.goingCount (owner: eventKeys.single).
  // attendeesData is for roster list only, NOT for count display.
  // guestGoingCount adds web guest RSVPs (from event detail response, not from array length when counts hidden).
  const baseGoingCount = eventMeta.goingCount ?? 0;
  const effectiveGoingCount = showGuestCount ? baseGoingCount + guestGoingCount : baseGoingCount;
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

  // Derive interests from grouped RSVPs (replaces removed /api/events/:id/interests endpoint)
  const interests = (groupedRsvpsData?.interested ?? []).map((u) => ({
    id: u.id,
    userId: u.id,
    user: { id: u.id, name: u.name, image: u.image },
    status: "interested" as const,
    createdAt: "",
  }));
  const notGoingUsers = groupedRsvpsData?.not_going ?? [];

  // Friends-first social proof: read cached friends (zero-cost, no new fetch)
  const friendIdSet = useMemo(() => {
    const cached = queryClient.getQueryData<{ friendships?: Array<{ friendId: string }> }>(["friends"]);
    if (!cached?.friendships?.length) return undefined;
    return new Set(cached.friendships.map((f) => f.friendId));
  }, [queryClient]);

  // ============================================
  // INVARIANT [P0_RSVP]: myRsvpStatus is the SOLE source of truth for RSVP display.
  // Owner: eventKeys.rsvp(id) query → myRsvpData.
  // No screen may read event.viewerRsvpStatus for display.
  // Optimistic updates target eventKeys.rsvp(id) only.
  // ============================================
  const rawRsvpStatus = myRsvpData?.status;
  // Normalize: "maybe" → "interested", "invited" → null (pending RSVP, show controls)
  const myRsvpStatus = rawRsvpStatus === "maybe" ? "interested" : rawRsvpStatus === "invited" ? null : (rawRsvpStatus as "going" | "interested" | "not_going" | null);

  // When hideDetailsUntilRsvp is enabled, blur Who's Coming and Discussion for non-going, non-host viewers
  const shouldBlurDetails = hideDetailsUntilRsvp && myRsvpStatus !== "going" && !isMyEvent;

  // Shared save/unsave hook — MUST be above all early returns for stable hook order
  const saveEvent = useSaveEvent({ eventId: id ?? "", viewerRsvpStatus: myRsvpStatus });

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
          keys: ['single', 'attendees', 'rsvps', 'rsvp', 'feed', 'feedPaginated', 'myEvents', 'calendar', 'attending'],
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
        // Only show celebratory prompts for "going" responses
        if (status === "going") {
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
        // [P1_EVENT_PROJ] Refetch owner + rsvps + feed on capacity error
        invalidateEventKeys(queryClient, [
          eventKeys.single(id ?? ""),
          eventKeys.rsvps(id ?? ""),
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
    // Guard: block attendance RSVPs when deadline has passed
    if (status === "going" && event?.rsvpDeadline && new Date(event.rsvpDeadline) < new Date()) {
      safeToast.warning("RSVPs Closed", "The RSVP deadline for this event has passed.");
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
            "event.rsvps",
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
      queryClient.invalidateQueries({ queryKey: eventKeys.rsvps(id ?? "") });
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
    if (createCommentMutation.isPending) return;
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
        router.push(`/user/${fb.hostId}`);
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
            router.push(`/circle/${fb.circleId}`);
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

  const ET = getEventDetailTheme(isDark, colors).default;

  const { originalStartDate, startDate, endDate, dateLabel, timeLabel, countdownLabel } = deriveDateLabels(event);

  if (__DEV__) {
    devLog("[EVENT_LIVE_UI]", "countdown", { countdownLabel, eventId: event.id.slice(0, 8) });
  }

  // [P0_EVENT_LOCATION_NORMALIZE] Derive locationDisplay (UI) + locationQuery (maps).
  const { locationDisplay, locationQuery } = deriveLocationDisplay(event);

  if (__DEV__) {
    devLog("[P0_EVENT_LOCATION_NORMALIZE]", {
      eventId: event.id,
      rawLocation: event.location,
      locationDisplay,
      locationQuery,
    });
  }

  // [LB-1] Location privacy: hide full location from non-eligible viewers
  // when host has set showLocationPreRsvp to false (default).
  // Eligible: host, co-host, or user who has RSVP'd going/interested.
  const locationHiddenByPrivacy =
    event.showLocationPreRsvp === false &&
    !isMyEvent &&
    myRsvpStatus !== "going" &&
    myRsvpStatus !== "interested";
  const effectiveLocationDisplay = locationHiddenByPrivacy ? null : locationDisplay;
  const effectiveLocationQuery = locationHiddenByPrivacy ? null : locationQuery;

  // Hero banner URI — maps event photo → hero surface (no schema change)
  const eventBannerUri = resolveBannerUri({
    bannerPhotoUrl: event?.eventPhotoUrl ?? null,
    bannerUrl: event?.eventPhotoUrl ?? null,
  });

  // Themed canvas — theme owns the page background behind the card
  const pageTheme = event.customThemeData
    ? buildCustomThemeTokens(event.customThemeData)
    : resolveEventTheme(event.themeId);

  // [GROWTH_STICKY_RSVP] Sticky bottom bar visibility — persists after RSVP
  const showStickyRsvp = !isMyEvent && !event?.isBusy && !!event && !hasJoinRequest;
  const stickyBarHeight = 64 + insets.bottom;

  return (
    <SafeAreaView testID="event-detail-screen" className="flex-1" style={{ backgroundColor: "transparent" }} edges={[]}>
      <Stack.Screen options={{ headerShown: false, headerTransparent: true, contentStyle: { backgroundColor: "transparent" } }} />
      <StatusBar style={isDark ? "light" : "dark"} />

      <ThemeBackgroundLayers
        pageTheme={pageTheme}
        effectId={event.effectId}
        customEffectConfig={event.customEffectConfig}
        themeId={event.themeId}
        customThemeData={event.customThemeData}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
      <Animated.ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: showStickyRsvp ? stickyBarHeight + 16 : STACK_BOTTOM_PADDING + insets.bottom }}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* ═══ HERO ZONE — card floats directly on page atmosphere ═══ */}
        <View style={{ position: "relative", paddingTop: insets.top + 44 }}>

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
              locationDisplay={effectiveLocationDisplay}
              goingCount={effectiveGoingCount}
              notGoingCount={notGoingUsers.length + guestNotGoingList.length}
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
              coHostNames={(event.hostIds ?? [])
                .filter((hid: string) => hid !== event.user?.id)
                .map((hid: string) => attendeesList.find((a: AttendeeInfo) => a.id === hid)?.name)
                .filter((n): n is string => !!n)}
              eventHook={event.eventHook}

              isMyEvent={isMyEvent}
              capacity={eventMeta.capacity}
              currentGoing={effectiveGoingCount}
              themeColor={themeColor}
              isDark={isDark}
              colors={colors}
              themeId={event.themeId ?? null}
              cardColor={(event as any)?.cardColor ?? null}
              scrollFlipProgress={scrollFlipProgress}
              onFirstFlip={handleScrollFlipReveal}
              editButton={undefined}
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

        {/* Spacer consumed by scroll during flip phase */}
        <View style={{ height: FLIP_SCROLL_THRESHOLD }} />

        {/* ═══ FLIP-TO-REVEAL GATE (Phase 6C) ═══ */}
        {/* Content stays pinned during flip phase, then scrolls normally */}
        <Animated.View style={[{ position: "relative" }, contentPinStyle]}>
        {!isMyEvent && !contentRevealed && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, borderRadius: 16, overflow: "hidden" }}>
            <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={{ flex: 1 }} />
          </View>
        )}

        {/* ═══ HOST ACTION CARD — unified invite + tools ═══ */}
        {isMyEvent && !event?.isBusy && (
          <Animated.View entering={FadeInDown.delay(80).springify()} style={{ marginHorizontal: 16, marginBottom: 10 }}>
            <HostActionCard
              isDark={isDark}
              colors={colors}
              themeColor={themeColor}
              bringListEnabled={event?.bringListEnabled}
              bringListItems={event?.bringListItems ?? []}
              pitchInEnabled={event?.pitchInEnabled}
              pitchInHandle={event?.pitchInHandle}
              pitchInMethod={event?.pitchInMethod}
              onCopyLink={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                trackShareTriggered({ eventId: event.id, method: "copy", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                const link = getEventUniversalLink(event.id);
                await copyPlainText(link);
                safeToast.success("Link copied");
              }}
              onText={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                trackShareTriggered({ eventId: event.id, method: "sms", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                const body = buildEventSmsBody(buildShareInput({ ...event, location: locationDisplay ?? null }));
                Linking.openURL(`sms:${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(body)}`);
              }}
              onShare={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                trackShareTriggered({ eventId: event.id, method: "native", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                shareEvent({ ...event, location: locationDisplay ?? null });
              }}
              onInviteViaText={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                trackShareTriggered({ eventId: event.id, method: "sms", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                setShowInviteViaTextSheet(true);
              }}
              onSendInApp={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowShareToFriendsSheet(true);
              }}
            />
          </Animated.View>
        )}

        {/* ═══ JOIN REQUEST BANNER — only for pending join requests ═══ */}
        {!isMyEvent && !event?.isBusy && hasJoinRequest && (
          <Animated.View entering={FadeInDown.delay(80).springify()} style={{ marginHorizontal: 16, marginBottom: 10 }}>
            <ConfirmedAttendeeBanner
              effectiveGoingCount={effectiveGoingCount}
              attendees={attendeesList}
              isDark={isDark}
              colors={colors}
            />
          </Animated.View>
        )}
        {/* Inline RSVP status removed — sticky bottom bar is now single source of truth for guest RSVP state */}

        {/* HostToolsRow merged into HOST ACTION CARD above */}

        {/* Live Activity CTA moved to overflow menu — see Event Options sheet */}

        {/* ═══ ABOUT CARD — description + details + pitch-in + bring list ═══ */}
        <View style={{ backgroundColor: cardSurfaceBg, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>

        <AboutCard
          description={event.description}
          descriptionExpanded={descriptionExpanded}
          onToggleDescription={() => setDescriptionExpanded(!descriptionExpanded)}
          locationDisplay={effectiveLocationDisplay}
          onGetDirections={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            openEventLocation(effectiveLocationQuery ?? effectiveLocationDisplay ?? "", event, event.id);
          }}
          isMyEvent={isMyEvent}
          isBusy={event.isBusy ?? false}
          visibility={event.visibility}
          circleName={event.circleName}
          circleId={event.circleId}
          groupVisibility={(event as any).groupVisibility}
          onOpenCircle={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            devLog('[P0_EVENT_CIRCLE_LINK]', { circleId: event.circleId, eventId: event.id });
            router.push(`/circle/${event.circleId}`);
          }}
          eventMeta={eventMeta}
          rsvpDeadline={event.rsvpDeadline}
          costPerPerson={event.costPerPerson}
          pitchInEnabled={event.pitchInEnabled}
          pitchInHandle={event.pitchInHandle}
          pitchInMethod={event.pitchInMethod}
          pitchInAmount={event.pitchInAmount}
          pitchInNote={event.pitchInNote}
          onCopyPitchInHandle={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const handle = (event.pitchInMethod === 'venmo' || event.pitchInMethod === 'cashapp') ? `@${event.pitchInHandle}` : event.pitchInHandle!;
            try {
              await Clipboard.setStringAsync(handle);
              safeToast.success('Copied to clipboard');
            } catch {
              safeToast.error("Copy failed", "Please try again");
            }
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

        {/* ═══ WHO'S COMING CARD — hidden for imported/busy calendar events ═══ */}
        {!isBusyBlock && (
        <View style={{ backgroundColor: cardSurfaceBg, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)", position: "relative", overflow: "hidden" }}>

        {/* Blur overlay when hideDetailsUntilRsvp is enabled */}
        {shouldBlurDetails && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
            <BlurView intensity={25} tint={isDark ? "dark" : "light"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            <Text style={{ color: isDark ? "#FFFFFF" : "#000000", fontSize: 14, fontWeight: "600", textAlign: "center", zIndex: 11 }}>RSVP to see who's coming</Text>
          </View>
        )}

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
          notGoingUsers={notGoingUsers}
          guestGoingList={showGuestList ? guestGoingList : []}
          guestNotGoingList={showGuestList ? guestNotGoingList : []}
          showGuestList={showGuestList}
          showGuestCount={showGuestCount}
          showInterestedUsers={showInterestedUsers}
          friendIds={friendIdSet}
          isDark={isDark}
          themeColor={themeColor}
          colors={colors}
          onOpenAttendees={() => {
            Haptics.selectionAsync();
            setShowAttendeesModal(true);
          }}
          onToggleInterestedUsers={() => setShowInterestedUsers(!showInterestedUsers)}
        />
        </View>
        )}

        {/* ═══ DISCUSSION CARD — hidden for imported/busy calendar events ═══ */}
        {!isBusyBlock && (
        <View style={{ backgroundColor: cardSurfaceBg, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)", position: "relative", overflow: "hidden" }}>

        {/* Blur overlay when hideDetailsUntilRsvp is enabled */}
        {shouldBlurDetails && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
            <BlurView intensity={25} tint={isDark ? "dark" : "light"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            <Text style={{ color: isDark ? "#FFFFFF" : "#000000", fontSize: 14, fontWeight: "600", textAlign: "center", zIndex: 11 }}>RSVP to see discussion</Text>
          </View>
        )}

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
            router.push(`/user/${userId}`);
          }}
          formatTimeAgo={formatTimeAgo}
          hasMoreComments={hasMoreComments ?? false}
          isFetchingMoreComments={isFetchingMoreComments}
          onLoadMoreComments={fetchMoreComments}
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

        </View>
        )}

        {/* ═══ [EVENT_LIVE_UI] Collapsed Event Settings — hidden for imported/busy ═══ */}
        {!isBusyBlock && (
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
        )}

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

        </Animated.View>{/* close flip-to-reveal gate wrapper */}

      </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* Persistent header controls — fixed above scroll content */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <EventHeroNav
          hasPhoto={!!(eventBannerUri && event.eventPhotoUrl)}
          screenWidth={screenWidth}
          topInset={insets.top}
          colors={colors}
          onBack={() => router.canGoBack() ? router.back() : router.replace("/calendar")}
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
      </View>

      {/* [GROWTH_STICKY_RSVP] Floating bottom RSVP bar for guests */}
      {showStickyRsvp && (
        <StickyRsvpBar
          effectiveGoingCount={effectiveGoingCount}
          isFull={eventMeta.isFull}
          isDeadlinePassed={!!event.rsvpDeadline && new Date(event.rsvpDeadline) < new Date()}
          isPastEvent={new Date(event.endTime ?? event.startTime) < new Date()}
          myRsvpStatus={myRsvpStatus}
          isPending={rsvpMutation.isPending}
          isDark={isDark}
          screenWidth={screenWidth}
          bottomInset={insets.bottom}
          colors={colors}
          themeColor={themeColor}
          onRsvpGoing={() => handleRsvp("going")}
          onRsvpInterested={() => saveEvent.toggleSave()}
          onRsvpNotGoing={() => handleRsvp("not_going")}
          onShare={() => event && shareEvent({ ...event, location: locationDisplay ?? null })}
        />
      )}

      <EventModals
        // Calendar sync
        showSyncModal={showSyncModal}
        onCloseSyncModal={() => setShowSyncModal(false)}
        onGoogleCalendar={() => {
          setShowSyncModal(false);
          openGoogleCalendar({ ...event, location: locationDisplay ?? null });
        }}
        onAppleCalendar={() => {
          setShowSyncModal(false);
          addToDeviceCalendar({ ...event, location: locationDisplay ?? null }, safeToast);
        }}
        colors={colors}

        // Event Summary
        showSummaryModal={showSummaryModal}
        onCloseSummaryModal={() => setShowSummaryModal(false)}
        eventId={event.id}
        eventTitle={event.title}
        eventEmoji={event.emoji}
        eventDate={startDate}
        attendeeCount={event.joinRequests?.filter((r) => r.status === "accepted").length ?? 0}
        existingSummary={event.summary}
        existingRating={event.summaryRating}

        // Confirm modals
        showDeleteCommentConfirm={showDeleteCommentConfirm}
        onConfirmDeleteComment={confirmDeleteComment}
        onCancelDeleteComment={() => {
          setShowDeleteCommentConfirm(false);
          setCommentToDelete(null);
        }}
        showRemoveRsvpConfirm={showRemoveRsvpConfirm}
        onConfirmRemoveRsvp={confirmRemoveRsvp}
        onCancelRemoveRsvp={() => setShowRemoveRsvpConfirm(false)}
        showDeleteEventConfirm={showDeleteEventConfirm}
        onConfirmDeleteEvent={() => {
          if (deleteEventMutation.isPending) return;
          setShowDeleteEventConfirm(false);
          deleteEventMutation.mutate();
        }}
        onCancelDeleteEvent={() => setShowDeleteEventConfirm(false)}
        showRemoveImportedConfirm={showRemoveImportedConfirm}
        onConfirmRemoveImported={() => {
          if (deleteEventMutation.isPending) return;
          if (__DEV__) devLog("[IMPORTED_EVENT]", "remove_confirmed", { eventId: id });
          setShowRemoveImportedConfirm(false);
          deleteEventMutation.mutate();
        }}
        onCancelRemoveImported={() => setShowRemoveImportedConfirm(false)}

        // RSVP prompt arbitration
        rsvpPromptChoice={rsvpPromptChoice}
        onFirstRsvpNudgePrimary={handleFirstRsvpNudgePrimary}
        onFirstRsvpNudgeSecondary={handleFirstRsvpNudgeSecondary}
        onFirstRsvpNudgeDismiss={handleFirstRsvpNudgeDismiss}
        onPostValueInviteClose={handlePostValueInviteClose}
        onNotificationPromptClose={() => setRsvpPromptChoice("none")}
        sessionUserId={session?.user?.id}

        // Event Actions Sheet
        showEventActionsSheet={showEventActionsSheet}
        eventActionsProps={{
          isMyEvent,
          isBusy: !!event?.isBusy,
          isImported: !!event?.isImported,
          hasEventPhoto: !!event?.eventPhotoUrl,
          isBusyBlock,
          currentColorOverride,
          myRsvpStatus,
          liveActivity: (() => {
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
          })(),
          isDark,
          themeColor,
          colors,
          onClose: () => setShowEventActionsSheet(false),
          onEdit: () => {
            setShowEventActionsSheet(false);
            Haptics.selectionAsync();
            router.push(`/create?editEventId=${id}&emoji=${encodeURIComponent(event?.emoji ?? "📅")}`);
          },
          onDuplicate: () => {
            setShowEventActionsSheet(false);
            handleDuplicateEvent();
          },
          onChangePhoto: () => {
            setShowEventActionsSheet(false);
            Haptics.selectionAsync();
            setTimeout(() => launchEventPhotoPicker(), 350);
          },
          onSendInApp: () => {
            setShowEventActionsSheet(false);
            Haptics.selectionAsync();
            setTimeout(() => setShowShareToFriendsSheet(true), 350);
          },
          onShare: () => {
            setShowEventActionsSheet(false);
            Haptics.selectionAsync();
            shareEvent({ ...event, location: locationDisplay ?? null });
          },
          onShareFlyer: () => {
            setShowEventActionsSheet(false);
            Haptics.selectionAsync();
            setTimeout(() => setShowShareFlyerSheet(true), 350);
          },
          onToggleLiveActivity: async () => {
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
          },
          onReport: () => {
            setShowEventActionsSheet(false);
            handleReportEvent();
          },
          onOpenColorPicker: () => {
            if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_start", { from: "event_actions", to: "color", ms: 350 });
            setShowEventActionsSheet(false);
            Haptics.selectionAsync();
            setTimeout(() => {
              setShowColorPicker(true);
              if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_open_child", { from: "event_actions", to: "color", ms: 350 });
            }, 350);
          },
          onDelete: () => {
            setShowEventActionsSheet(false);
            Haptics.selectionAsync();
            setTimeout(() => setShowDeleteEventConfirm(true), 350);
          },
          onRemoveImported: () => {
            if (__DEV__) devLog("[IMPORTED_EVENT]", "remove_pressed", { eventId: id });
            setShowEventActionsSheet(false);
            Haptics.selectionAsync();
            setTimeout(() => setShowRemoveImportedConfirm(true), 350);
          },
        }}

        // Report Modal
        showReportModal={showReportModal}
        selectedReportReason={selectedReportReason}
        reportDetails={reportDetails}
        isSubmittingReport={isSubmittingReport}
        themeColor={themeColor}
        onCloseReport={() => setShowReportModal(false)}
        onSelectReportReason={setSelectedReportReason}
        onChangeReportDetails={setReportDetails}
        onSubmitReport={submitEventReport}
        onCancelReport={() => {
          setShowReportModal(false);
          setSelectedReportReason(null);
          setReportDetails("");
        }}

        // Attendees Sheet
        showAttendeesModal={showAttendeesModal}
        isLoadingAttendees={isLoadingAttendees}
        hasAttendeesError={!!attendeesError}
        attendeesPrivacyDenied={attendeesPrivacyDenied}
        attendeesList={attendeesList}
        guestGoingList={showGuestList ? guestGoingList : []}
        effectiveGoingCount={effectiveGoingCount}
        hostUserId={event?.user?.id}
        isDark={isDark}
        onCloseAttendees={() => {
          setShowAttendeesModal(false);
          if (__DEV__) devLog('[P1_WHO_COMING_SHEET]', 'close', { eventId: id });
        }}
        onRetryAttendees={() => attendeesQuery.refetch()}
        onPressAttendee={(userId) => {
          setShowAttendeesModal(false);
          router.push(`/user/${userId}`);
        }}

        // Color Picker Sheet
        showColorPicker={showColorPicker}
        currentColorOverride={currentColorOverride}
        onCloseColorPicker={() => setShowColorPicker(false)}
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

        // Photo Upload Sheet
        showPhotoSheet={showPhotoSheet}
        hasExistingPhoto={!!event?.eventPhotoUrl}
        uploadingPhoto={uploadingPhoto}
        onClosePhotoSheet={() => setShowPhotoSheet(false)}
        onUploadPhoto={async () => {
          setShowPhotoSheet(false);
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

      {/* Share Flyer Sheet */}
      <ShareFlyerSheet
        visible={showShareFlyerSheet}
        onClose={() => setShowShareFlyerSheet(false)}
        flyerData={(() => {
          const shareInput = buildShareInput({ ...event, location: locationDisplay ?? null });
          return {
            title: shareInput.title,
            dateStr: shareInput.dateStr,
            timeStr: shareInput.timeStr,
            location: event.hideWebLocation ? null : (locationDisplay ?? null),
            hostName: event.user?.name ?? null,
            coHostNames: (event.hostIds ?? [])
              .filter((hid: string) => hid !== event.user?.id)
              .map((hid: string) => attendeesList.find((a: AttendeeInfo) => a.id === hid)?.name)
              .filter((n): n is string => !!n),
            coverImageUrl: event.eventPhotoUrl && !event.isBusy && event.visibility !== "private"
              ? event.eventPhotoUrl
              : null,
            themeColor,
          };
        })()}
        hasCoverImage={!!event.eventPhotoUrl && !event.isBusy && event.visibility !== "private"}
        isDark={isDark}
        themeColor={themeColor}
      />

      {/* Invite via Text (Contact Picker → SMS) */}
      {event && (
        <InviteViaTextSheet
          visible={showInviteViaTextSheet}
          onClose={() => setShowInviteViaTextSheet(false)}
          smsBody={buildEventSmsBody(buildShareInput({ ...event, location: locationDisplay ?? null }))}
          themeColor={themeColor}
        />
      )}

      {/* Send to Friends/Circles Sheet */}
      <ShareToFriendsSheet
        visible={showShareToFriendsSheet}
        onClose={() => setShowShareToFriendsSheet(false)}
        eventId={event.id}
        eventTitle={event.title}
        eventStartTime={event.startTime}
        eventEndTime={event.endTime ?? undefined}
        eventEmoji={event.emoji}
        eventPhotoUrl={event.eventPhotoUrl}
        hostName={event.user?.name ?? "Someone"}
        themeColor={themeColor}
      />
    </SafeAreaView>
  );
}
