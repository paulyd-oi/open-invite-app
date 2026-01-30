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
} from "react-native";
import { openMaps } from "@/utils/openMaps";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
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
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ExpoCalendar from "expo-calendar";

import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { uploadImage } from "@/lib/imageUpload";
import { getEventShareLink } from "@/lib/deepLinks";
import { safeToast } from "@/lib/safeToast";
import { guardEmailVerification } from "@/lib/emailVerification";
import { ConfirmModal } from "@/components/ConfirmModal";
import { BadgePill } from "@/components/BadgePill";
import {
  type GetEventsResponse,
  type Event,
  type GetEventCommentsResponse,
  type EventComment,
  type CreateCommentResponse,
  type EventReportReason,
} from "@/shared/contracts";
import { EventReminderPicker } from "@/components/EventReminderPicker";
import { EventPhotoGallery } from "@/components/EventPhotoGallery";
import { EventCategoryBadge } from "@/components/EventCategoryPicker";
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
    console.error("Error adding to calendar:", error);

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
    console.error("Error sharing event:", error);
  }
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [joinMessage, setJoinMessage] = useState("");
  const [showJoinForm, setShowJoinForm] = useState(false);
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
          console.error("Failed to check sync status:", error);
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
  const { data: singleEventData, isLoading: isLoadingEvent } = useQuery({
    queryKey: ["events", "single", id],
    queryFn: () => api.get<{ event: Event }>(`/api/events/${id}`),
    enabled: bootStatus === 'authed' && !!id,
  });

  // Fallback: Also fetch from lists in case the single endpoint fails
  const { data: myEventsData } = useQuery({
    queryKey: ["events", "mine"],
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: bootStatus === 'authed' && !singleEventData?.event,
  });

  const { data: feedData } = useQuery({
    queryKey: ["events", "feed"],
    queryFn: () => api.get<GetEventsResponse>("/api/events/feed"),
    enabled: bootStatus === 'authed' && !singleEventData?.event,
  });

  // Fetch comments
  const { data: commentsData, isLoading: isLoadingComments } = useQuery({
    queryKey: ["events", id, "comments"],
    queryFn: () => api.get<GetEventCommentsResponse>(`/api/events/${id}/comments`),
    enabled: bootStatus === 'authed' && !!id,
  });

  const comments = commentsData?.comments ?? [];

  // Fetch event mute status
  const { data: muteData, isLoading: isLoadingMute } = useQuery({
    queryKey: ["events", id, "mute"],
    queryFn: () => api.get<{ muted: boolean }>(`/api/notifications/event/${id}`),
    enabled: bootStatus === 'authed' && !!id,
  });

  const isEventMuted = muteData?.muted ?? false;

  // Mute toggle mutation
  const muteMutation = useMutation({
    mutationFn: (muted: boolean) =>
      api.post(`/api/notifications/event/${id}`, { muted }),
    onSuccess: (_, muted) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.setQueryData(["events", id, "mute"], { muted });
    },
    onError: () => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Find the event - prefer direct fetch, fallback to lists
  const event =
    singleEventData?.event ??
    myEventsData?.events.find((e) => e.id === id) ??
    feedData?.events.find((e) => e.id === id);

  const isBusyBlock = !!event?.isBusy;

  const isMyEvent = event?.userId === session?.user?.id;
  const hasJoinRequest = event?.joinRequests?.some(
    (r) => r.userId === session?.user?.id
  );
  const myJoinRequest = event?.joinRequests?.find(
    (r) => r.userId === session?.user?.id
  );

  const joinMutation = useMutation({
    mutationFn: (message?: string) => {
      if (isBusyBlock) {
        throw new Error("BUSY_BLOCK");
      }
      return api.post(`/api/events/${id}/join`, { message });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("You're Attending!", "This event has been added to your calendar.");
      setShowJoinForm(false);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: () => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  const handleJoinRequestAction = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: "accepted" | "rejected" }) => {
      if (isBusyBlock) {
        throw new Error("BUSY_BLOCK");
      }
      return api.put(`/api/events/${id}/join/${requestId}`, { status });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["events"] });
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
      queryClient.invalidateQueries({ queryKey: ["events", id, "comments"] });
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
      queryClient.invalidateQueries({ queryKey: ["events", id, "comments"] });
    },
    onError: () => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Fetch event interests/RSVPs
  const { data: interestsData } = useQuery({
    queryKey: ["events", id, "interests"],
    queryFn: () => api.get<{ event_interest: Array<{ id: string; userId: string; user: { id: string; name: string | null; image: string | null }; status: string; createdAt: string }> }>(`/api/events/${id}/interests`),
    enabled: bootStatus === 'authed' && !!id && !isBusyBlock,
  });

  // Fetch current user's RSVP status
  const { data: myRsvpData } = useQuery({
    queryKey: ["events", id, "rsvp"],
    queryFn: () => api.get<{ status: string | null; rsvpId: string | null }>(`/api/events/${id}/rsvp`),
    enabled: bootStatus === 'authed' && !!id && !isBusyBlock,
  });

  const interests = interestsData?.event_interest ?? [];
  
  // Normalize RSVP status from backend (map "maybe" -> "interested")
  const rawRsvpStatus = myRsvpData?.status;
  const myRsvpStatus = rawRsvpStatus === "maybe" ? "interested" : (rawRsvpStatus as "going" | "interested" | "not_going" | null);

  // RSVP mutation (unified)
  type RsvpStatus = "going" | "interested" | "not_going";

  const rsvpMutation = useMutation({
    mutationFn: (status: RsvpStatus) => {
      if (isBusyBlock) {
        throw new Error("BUSY_BLOCK");
      }
      return api.post(`/api/events/${id}/rsvp`, { status });
    },
    onSuccess: async (_, status) => {
      // Haptic feedback only - no intrusive toast popups
      if (status === "going") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      queryClient.invalidateQueries({ queryKey: ["events", id, "interests"] });
      queryClient.invalidateQueries({ queryKey: ["events", id, "rsvp"] });
      // Invalidate calendar events so RSVP "going" events appear immediately
      queryClient.invalidateQueries({ queryKey: ["events", "calendar"] });
      // Invalidate attending events so Social tab updates immediately
      queryClient.invalidateQueries({ queryKey: ["events", "attending"] });
      // Refetch event details to update capacity
      queryClient.invalidateQueries({ queryKey: ["events", id] });
      queryClient.invalidateQueries({ queryKey: ["events", "feed"] });
      setShowRsvpOptions(false);
      
      // Check if we should show notification pre-prompt (Aha moment: first RSVP going/interested)
      if (bootStatus === 'authed' && (status === "going" || status === "interested")) {
        const shouldShow = await shouldShowNotificationPrompt();
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
    onError: (error: any) => {
      // Handle 409 EVENT_FULL error
      if (error?.response?.status === 409 || error?.status === 409) {
        safeToast.warning("Full", "This invite is full.");
        // Refetch event details to show updated state
        queryClient.invalidateQueries({ queryKey: ["events", id] });
        queryClient.invalidateQueries({ queryKey: ["events", id, "interests"] });
        queryClient.invalidateQueries({ queryKey: ["events", "feed"] });
      } else {
        safeToast.error("Oops", "That didn't go through. Please try again.");
      }
    },
  });

  const removeRsvpMutation = useMutation({
    mutationFn: () => {
      if (isBusyBlock) {
        throw new Error("BUSY_BLOCK");
      }
      return api.delete(`/api/events/${id}/rsvp`);
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["events", id, "interests"] });
      queryClient.invalidateQueries({ queryKey: ["events", id, "rsvp"] });
      // Invalidate calendar events so removed RSVP updates calendar immediately
      queryClient.invalidateQueries({ queryKey: ["events", "calendar"] });
      // Invalidate attending events so Social tab updates immediately
      queryClient.invalidateQueries({ queryKey: ["events", "attending"] });
    },
  });

  const handleRsvp = (status: RsvpStatus) => {
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
    rsvpMutation.mutate("not_going");
  };

  // Toggle reflection enabled for event
  const toggleReflectionMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put(`/api/events/${id}`, { reflectionEnabled: enabled }),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

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
        console.error("Image upload failed:", error);
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
    try {
      await api.post("/api/reports/event", {
        eventId: event.id,
        reason: selectedReportReason,
        details: selectedReportReason === "other" ? reportDetails.trim() || undefined : undefined,
      });
      safeToast.success("Report submitted", "Thanks - we received your report.");
      setShowReportModal(false);
      setSelectedReportReason(null);
      setReportDetails("");
    } catch (error) {
      safeToast.error("Error", "Could not submit report. Please try again.");
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
        <Stack.Screen options={{ title: "Event" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!id) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Event" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Invalid event ID</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoadingEvent) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Event Details" }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Event" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Event not found</Text>
        </View>
      </SafeAreaView>
    );
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: event.title,
          headerStyle: { backgroundColor: colors.background },
          headerRight: () => (
            <View className="flex-row items-center">
              {/* Duplicate Button */}
              <Pressable
                onPress={handleDuplicateEvent}
                className="p-2"
              >
                <Copy size={20} color={themeColor} />
              </Pressable>
              {/* Share Button */}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  shareEvent(event);
                }}
                className="p-2"
              >
                <MessageCircle size={20} color={themeColor} />
              </Pressable>
              {/* Report Button (only for non-owners) */}
              {!isMyEvent && !event?.isBusy && (
                <Pressable
                  onPress={handleReportEvent}
                  className="p-2"
                >
                  <AlertTriangle size={20} color={colors.textSecondary} />
                </Pressable>
              )}
              {/* Edit Button (only for owner) */}
              {isMyEvent && (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push(`/event/edit/${id}`);
                  }}
                  className="mr-2 p-2"
                >
                  <Pencil size={20} color={themeColor} />
                </Pressable>
              )}
            </View>
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
          <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <View className="items-center mb-4">
              <View className="w-20 h-20 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}>
                <Text className="text-4xl">{event.emoji}</Text>
              </View>
              <Text className="text-2xl font-bold text-center" style={{ color: colors.text }}>
                {event.title}
              </Text>
            </View>

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
                    {/* Featured Badge */}
                    {event.user?.featuredBadge && (
                      <View className="mt-1">
                        <BadgePill
                          name={event.user.featuredBadge.name}
                          tierColor={event.user.featuredBadge.tierColor}
                          variant="small"
                        />
                      </View>
                    )}
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

            {/* Visibility */}
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

            {/* Spots (Capacity) */}
            {event.capacity != null && (
              <View className="py-3 border-t" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center">
                  <Users size={20} color={event.isFull ? "#EF4444" : "#22C55E"} />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm" style={{ color: colors.textTertiary }}>Spots</Text>
                    <Text className="font-semibold" style={{ color: event.isFull ? "#EF4444" : colors.text }}>
                      {event.goingCount ?? 0} / {event.capacity} filled
                    </Text>
                  </View>
                  {event.isFull && (
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
                  <Pressable
                    onPress={handleSyncToCalendar}
                    disabled={isSyncing}
                    className="flex-row items-center px-3 py-2 rounded-full"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    {isSyncing ? (
                      <ActivityIndicator size="small" color={themeColor} />
                    ) : (
                      <>
                        <RefreshCw size={14} color={themeColor} />
                        <Text className="font-medium text-sm ml-1.5" style={{ color: themeColor }}>
                          Update
                        </Text>
                      </>
                    )}
                  </Pressable>
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
                  <Pressable
                    onPress={handleSyncToCalendar}
                    disabled={isSyncing}
                    className="flex-row items-center px-4 py-2 rounded-full"
                    style={{ backgroundColor: themeColor }}
                  >
                    {isSyncing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text className="font-semibold text-sm text-white">Sync</Text>
                    )}
                  </Pressable>
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

            {/* Category Badge */}
            {event.category && (
              <View className="py-3 border-t" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center">
                  <EventCategoryBadge category={event.category} />
                </View>
              </View>
            )}
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

        {/* Who's Coming Section */}
        {event.joinRequests && event.joinRequests.filter((r) => r.status === "accepted").length > 0 && (
          <Animated.View entering={FadeInDown.delay(75).springify()}>
            <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <View className="flex-row items-center mb-4">
                <UserCheck size={20} color="#22C55E" />
                <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                  Who's Coming
                </Text>
                <View className="bg-green-100 px-2 py-1 rounded-full ml-2">
                  <Text className="text-green-700 text-xs font-semibold">
                    {event.joinRequests.filter((r) => r.status === "accepted").length}
                  </Text>
                </View>
              </View>

              <View className="flex-row flex-wrap">
                {event.joinRequests
                  .filter((r) => r.status === "accepted")
                  .map((attendee, index) => (
                    <Pressable
                      key={attendee.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        router.push(`/user/${attendee.userId}` as any);
                      }}
                      className="items-center mr-4 mb-3"
                      style={{ width: 60 }}
                    >
                      <View className="w-12 h-12 rounded-full bg-green-100 items-center justify-center mb-1 border-2 border-green-200">
                        {attendee.user?.image ? (
                          <Image
                            source={{ uri: attendee.user.image }}
                            className="w-full h-full rounded-full"
                          />
                        ) : (
                          <Text className="text-lg font-semibold text-green-600">
                            {attendee.user?.name?.[0] ?? "?"}
                          </Text>
                        )}
                      </View>
                      <Text
                        className="text-xs text-center"
                        style={{ color: colors.textSecondary }}
                        numberOfLines={1}
                      >
                        {attendee.user?.name?.split(" ")[0] ?? "Guest"}
                      </Text>
                    </Pressable>
                  ))}
              </View>

              {/* Show the host too */}
              {event.user && (
                <View className="border-t pt-3 mt-2" style={{ borderColor: colors.border }}>
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
            </View>
          </Animated.View>
        )}

        {/* No one coming yet - show placeholder */}
        {event.joinRequests && event.joinRequests.filter((r) => r.status === "accepted").length === 0 && (
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
        )}

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
                    {/* Full indicator */}
                    {event.isFull && myRsvpStatus !== "going" && (
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
                    {/* Going - disabled if full and not already going */}
                    {event.isFull && myRsvpStatus !== "going" ? (
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
                                onPress={() => handleDeleteComment(comment.id)}
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
      />

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
              
              <Pressable
                className="flex-1 py-4 rounded-xl items-center"
                style={{ 
                  backgroundColor: selectedReportReason ? themeColor : colors.surface,
                  opacity: selectedReportReason ? 1 : 0.5,
                }}
                onPress={submitEventReport}
                disabled={!selectedReportReason || isSubmittingReport}
              >
                <Text className="text-base font-medium" style={{ color: selectedReportReason ? "#FFFFFF" : colors.textSecondary }}>
                  {isSubmittingReport ? "Submitting..." : "Submit Report"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
