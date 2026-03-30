import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trackMessageSent, trackInviteShared, lengthBucket } from "@/analytics/analyticsEventsSSOT";
import { buildCircleSharePayload } from "@/lib/shareSSOT";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Platform,
  FlatList,
  RefreshControl,
  Modal,
  Keyboard,
  Share,
  Dimensions,
  Switch,
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  AppState,
  PanResponder,
  InteractionManager,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ViewToken,
} from "react-native";
import { devLog, devWarn, devError, devLogThrottle } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";
import { circleKeys } from "@/lib/circleQueryKeys";
import { refreshAfterCircleMemberRemove } from "@/lib/refreshAfterMutation";
import { refreshCircleListContract } from "@/lib/circleRefreshContract";
import { markTimeline } from "@/lib/devConvergenceTimeline";
import { useLoadedOnce } from "@/lib/loadingInvariant";
import { safeAppendMessage, buildOptimisticMessage, retryFailedMessage, safePrependMessages } from "@/lib/pushRouter";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  MessageCircle,
  Calendar,
  MapPin,
  Users,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Settings,
  X,
  CalendarPlus,
  UserPlus,
  Check,
  UserCheck,
  BellOff,
  Bell,
  RefreshCw,
  Camera,
  Lock,
  type LucideIcon,
} from "@/ui/icons";
import { BlurView } from "expo-blur";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import BottomSheet from "@/components/BottomSheet";
import { UserListRow } from "@/components/UserListRow";
import { HelpSheet, HELP_SHEETS } from "@/components/HelpSheet";
import { CirclePhotoEmoji } from "@/components/CirclePhotoEmoji";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";
import { once } from "@/lib/runtimeInvariants";

import { useSession } from "@/lib/useSession";
import { EntityAvatar } from "@/components/EntityAvatar";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadingTimeoutUI } from "@/components/LoadingTimeoutUI";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { setActiveCircle } from "@/lib/activeCircle";
import { uploadCirclePhoto } from "@/lib/imageUpload";
import { getCircleMessages, setCircleReadHorizon } from "@/lib/circlesApi";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, canAddCircleMember, trackAnalytics, type PaywallContext } from "@/lib/entitlements";
import {
  type GetCircleDetailResponse,
  type GetCircleMessagesResponse,
  type CircleMessage,
  type Circle,
  type GetFriendsResponse,
  type Friendship,
} from "@/shared/contracts";
import { postIdempotent } from "@/lib/idempotencyKey";
import { useCircleRealtime } from "@/lib/realtime/circleRealtime";
import { useTypingRealtime } from "@/lib/realtime/typingRealtime";
import { broadcastReadHorizon, useReadHorizonReceiver } from "@/lib/realtime/readRealtime";
import { MiniCalendar } from "@/components/circle/CircleMembersSection";
import { MessageBubble, formatDateSeparator, parseSystemEventPayload, parseSystemMemberLeftPayload } from "@/components/circle/CircleChatSection";
import { CircleAddMembersModal } from "@/components/circle/CircleAddMembersModal";
import { CircleFriendSuggestionModal } from "@/components/circle/CircleFriendSuggestionModal";
import { CircleRemoveMemberModal } from "@/components/circle/CircleRemoveMemberModal";
import { CircleCreateEventModal } from "@/components/circle/CircleCreateEventModal";
import { CircleEditMessageOverlay } from "@/components/circle/CircleEditMessageOverlay";
import { CircleReactionPicker } from "@/components/circle/CircleReactionPicker";
import { CircleAvailabilitySheet } from "@/components/circle/CircleAvailabilitySheet";
import { CirclePlanLockSheet } from "@/components/circle/CirclePlanLockSheet";
import { CirclePollSheet } from "@/components/circle/CirclePollSheet";
import { CircleNotifyLevelSheet } from "@/components/circle/CircleNotifyLevelSheet";
import { CircleMembersSheet } from "@/components/circle/CircleMembersSheet";
import { CircleSettingsSheet } from "@/components/circle/CircleSettingsSheet";
import { CircleHeaderChrome } from "@/components/circle/CircleHeaderChrome";
import { CircleNextEventCard } from "@/components/circle/CircleNextEventCard";
import { CircleChatOverlays } from "@/components/circle/CircleChatOverlays";
import { CircleLifecycleChips } from "@/components/circle/CircleLifecycleChips";

// Icon components using Ionicons
const TrashIcon: LucideIcon = ({ color, size = 24, style }) => (
  <Ionicons name="trash-outline" size={size} color={color} style={style} />
);

const WarningIcon: LucideIcon = ({ color, size = 24, style }) => (
  <Ionicons name="warning-outline" size={size} color={color} style={style} />
);

export default function CircleScreen() {
  const { id, draftMessage, draftVariants: draftVariantsRaw } = useLocalSearchParams<{ id: string; draftMessage?: string; draftVariants?: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  // [P0_WS_MSG_APPLY] Subscribe to realtime circle messages via WS
  useCircleRealtime(id, bootStatus, session);
  // [P0_WS_TYPING_UI] Realtime typing indicator via WebSocket
  const { typingUserIds, setTyping } = useTypingRealtime(id, session?.user?.id);
  // [P0_WS_READ_APPLY] Receive remote read horizon signals
  useReadHorizonReceiver(bootStatus, session);
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  const pendingScrollRef = useRef(false);
  // [P0_CHAT_ANCHOR] Scroll metrics for QA snapshot
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const AUTO_SCROLL_THRESHOLD = 120;
  const unseenCountRef = useRef(0);
  const [unseenCount, setUnseenCount] = useState(0);
  const prevMessageCountRef = useRef<number | null>(null);
  // [P1_CIRCLE_LEAVE_VIS] Track previous member count for roster-change detection
  const prevMemberCountRef = useRef<number | null>(null);
  // [P0_CIRCLE_LIST_REFRESH] Dedup set so contract fires once per member_left message
  const memberLeftSeenRef = useRef(new Set<string>());

  const bumpUnseen = useCallback((delta: number) => {
    unseenCountRef.current = Math.max(0, unseenCountRef.current + delta);
    setUnseenCount(unseenCountRef.current);
  }, []);

  const clearUnseen = useCallback(() => {
    unseenCountRef.current = 0;
    setUnseenCount(0);
  }, []);

  // [P1_CHAT_PILL] Log when pill becomes visible
  useEffect(() => {
    if (__DEV__ && unseenCount > 0) {
      devLog("[P1_CHAT_PILL]", "pill_show", { unseen: unseenCount });
    }
  }, [unseenCount > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // [P2_CHAT_SCROLL_BTN] Scroll-to-bottom button state
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const prevScrollBtnVisibleRef = useRef(false);

  // [P2_CHAT_SCROLL_BTN] Hide button when unseen pill takes over
  useEffect(() => {
    if (unseenCount > 0 && prevScrollBtnVisibleRef.current) {
      prevScrollBtnVisibleRef.current = false;
      setShowScrollToBottom(false);
      if (__DEV__) devLog("[P2_CHAT_SCROLL_BTN]", "hide", { reason: "unseen_pill_active" });
    }
  }, [unseenCount]);

  // [P1_CHAT_PAGINATION] Pagination state — compound cursor (createdAt + id)
  const PAGE_SIZE = 30;
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const cursorCreatedAtRef = useRef<string | null>(null);
  const cursorIdRef = useRef<string | null>(null);
  const isPrependingRef = useRef(false);

  // [P1_READ_HORIZON] Monotonic read horizon — only send when strictly newer
  const lastSentReadAtRef = useRef<string | null>(null);

  // Viewability tracking for scroll anchor on prepend
  const firstVisibleIdRef = useRef<string | null>(null);
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!viewableItems?.length) return;
      const first = viewableItems[0]?.item;
      if (first?.id) firstVisibleIdRef.current = first.id;
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;

  // [P1_READ_HORIZON] Send monotonic read horizon to server
  // Reads messages from query cache (not the `circle` local) to avoid declaration-order issues
  const sendReadHorizon = useCallback(
    (reason: string) => {
      if (!id || !isAuthedForNetwork(bootStatus, session)) {
        if (__DEV__) devLog("[P1_READ_HORIZON]", "skip", { reason: "not_authed" });
        return;
      }
      if (isPrependingRef.current) {
        if (__DEV__) devLog("[P1_READ_HORIZON]", "skip", { reason: "prepending" });
        return;
      }
      const cached = queryClient.getQueryData(circleKeys.single(id)) as any;
      const msgs = cached?.circle?.messages;
      if (!msgs?.length) {
        if (__DEV__) devLog("[P1_READ_HORIZON]", "skip", { reason: "no_messages" });
        return;
      }
      // Newest message is last in the sorted array
      const newest = msgs[msgs.length - 1];
      const lastReadAt = newest.createdAt as string;
      // Monotonic guard: only send if strictly newer
      if (lastSentReadAtRef.current && lastReadAt <= lastSentReadAtRef.current) {
        if (__DEV__) devLog("[P1_READ_HORIZON]", "skip", { reason: "not_newer", lastReadAt, lastSent: lastSentReadAtRef.current });
        return;
      }
      lastSentReadAtRef.current = lastReadAt;
      if (__DEV__) devLog("[P1_READ_HORIZON]", "send", { circleId: id, lastReadAt, reason });

      setCircleReadHorizon({ circleId: id, lastReadAt })
        .then((res) => {
          // Optimistic clear — exact per-circle using byCircle SSOT
          queryClient.setQueryData(
            circleKeys.unreadCount(),
            (prev: any) => {
              if (!prev) return prev;
              const currentCircle = (prev.byCircle?.[id!] as number) ?? 0;
              const nextTotal = Math.max(0, ((prev.totalUnread as number) ?? 0) - currentCircle);
              return {
                ...prev,
                totalUnread: nextTotal,
                byCircle: { ...(prev.byCircle ?? {}), [id!]: 0 },
              };
            },
          );
          // Background reconcile — inactive only
          queryClient.invalidateQueries({ queryKey: circleKeys.unreadCount(), refetchType: "inactive" });
          queryClient.invalidateQueries({ queryKey: circleKeys.all(), refetchType: "inactive" });
          // [P0_WS_READ_APPLY] Broadcast over WS so other devices update immediately
          broadcastReadHorizon(id!, lastReadAt);
          if (__DEV__) devLog("[P1_READ_HORIZON]", "ok", {
            endpoint: `/api/circles/${id}/read-horizon`,
            circleId: id,
            providedLastReadAt: lastReadAt,
            serverLastReadAt: res?.lastReadAt,
          });
        })
        .catch((e) => {
          // Non-fatal: horizon will be retried on next trigger
          if (__DEV__) devLog("[P1_READ_HORIZON]", "error", { circleId: id, error: String(e) });
        });
    },
    [id, bootStatus, session, queryClient],
  );

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    // [P0_CHAT_ANCHOR] Store metrics for QA snapshot
    scrollOffsetRef.current = contentOffset.y;
    contentHeightRef.current = contentSize.height;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const wasNearBottom = isNearBottomRef.current;
    isNearBottomRef.current = distanceFromBottom < AUTO_SCROLL_THRESHOLD;
    // [P1_NEW_MSG] Clear indicator when user scrolls back to bottom
    if (!wasNearBottom && isNearBottomRef.current) {
      clearUnseen();
      sendReadHorizon("return_to_bottom");
      if (__DEV__) {
        devLog("[P1_CHAT_PILL]", "pill_clear", { reason: "return_to_bottom" });
      }
    }
    // [P2_CHAT_SCROLL_BTN] Show when scrolled up AND unseen pill not active
    const shouldShow = !isNearBottomRef.current && unseenCountRef.current === 0;
    if (shouldShow !== prevScrollBtnVisibleRef.current) {
      prevScrollBtnVisibleRef.current = shouldShow;
      setShowScrollToBottom(shouldShow);
      if (__DEV__) {
        devLog("[P2_CHAT_SCROLL_BTN]", shouldShow ? "show" : "hide", {
          reason: shouldShow ? "scrolled_up" : isNearBottomRef.current ? "near_bottom" : "unseen_pill_active",
        });
      }
    }
  }, [AUTO_SCROLL_THRESHOLD, clearUnseen, sendReadHorizon]);

  const scheduleAutoScroll = useCallback(() => {
    if (pendingScrollRef.current) return;
    pendingScrollRef.current = true;
    requestAnimationFrame(() => {
      pendingScrollRef.current = false;
      flatListRef.current?.scrollToEnd({ animated: true });
      if (__DEV__) {
        devLog("[P1_SCROLL_ANCHOR]", "auto-scroll");
        devLog("[P0_CHAT_ANCHOR]", "auto_scroll", { scrollY: Math.round(scrollOffsetRef.current), contentH: Math.round(contentHeightRef.current), firstVisibleId: firstVisibleIdRef.current });
      }
    });
  }, []);

  const [message, setMessage] = useState(draftMessage ?? "");

  // Draft variant cycling (from Ideas deck)
  const draftVariants = React.useMemo<string[] | null>(() => {
    if (!draftVariantsRaw) return null;
    try { const arr = JSON.parse(decodeURIComponent(draftVariantsRaw)); return Array.isArray(arr) ? arr : null; } catch { return null; }
  }, [draftVariantsRaw]);
  const variantIndexRef = useRef(0);
  const [showTryAnother, setShowTryAnother] = useState(!!draftVariants);

  // [P0_WS_TYPING_UI] typingUserIds comes from useTypingRealtime hook above
  const [chromeHeight, setChromeHeight] = useState(0);
  const [showCalendar, setShowCalendar] = useState(true);
  const [upNextExpanded, setUpNextExpanded] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [createEventVisibility, setCreateEventVisibility] = useState<"open_invite" | "circle_only">("circle_only");
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showNotifySheet, setShowNotifySheet] = useState(false);
  const [showMembersSheet, setShowMembersSheet] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [selectedMemberToRemove, setSelectedMemberToRemove] = useState<string | null>(null);

  // DEV: Log when selectedMemberToRemove changes
  React.useEffect(() => {
    if (__DEV__) {
      devLog('[CircleRemoveMember] selectedMemberToRemove changed:', {
        selectedMemberToRemove,
        confirmModalShouldBeVisible: !!selectedMemberToRemove,
      });
    }
  }, [selectedMemberToRemove]);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  const [settingsSheetView, setSettingsSheetView] = useState<"settings" | "photo">("settings");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [friendSuggestions, setFriendSuggestions] = useState<Array<{
    newMemberName: string;
    existingMemberName: string;
    newMemberId: string;
  }>>([]);
  const [showFriendSuggestionModal, setShowFriendSuggestionModal] = useState(false);
  const [calendarCollapsedByKeyboard, setCalendarCollapsedByKeyboard] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Paywall state for member limit gating
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("CIRCLE_MEMBERS_LIMIT");

  // Fetch entitlements for gating
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements();

  // Auto-collapse calendar when keyboard shows
  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardWillShow", () => {
      if (showCalendar) {
        setShowCalendar(false);
        setCalendarCollapsedByKeyboard(true);
      }
      // [P1_SCROLL_ANCHOR] keyboard safety: auto-scroll when user is near bottom
      if (isNearBottomRef.current) {
        scheduleAutoScroll();
      }
    });

    const hideSubscription = Keyboard.addListener("keyboardWillHide", () => {
      if (calendarCollapsedByKeyboard) {
        setShowCalendar(true);
        setCalendarCollapsedByKeyboard(false);
      }
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [showCalendar, calendarCollapsedByKeyboard]);

  const { data, isLoading, isFetching, isSuccess, isError, refetch } = useQuery({
    queryKey: circleKeys.single(id),
    queryFn: async () => {
      const response = await api.get<GetCircleDetailResponse>(`/api/circles/${id}`);
      const cached = queryClient.getQueryData(circleKeys.single(id)) as GetCircleDetailResponse | undefined;
      // [P0_MUTE_TOGGLE] Carry forward cached isMuted when backend omits it.
      // The detail endpoint declares isMuted as optional; when it returns undefined
      // the 10s poll (or any invalidation-triggered refetch) would overwrite the
      // optimistic value, causing the toggle to flip back to OFF.
      if (response?.circle && response.circle.isMuted === undefined) {
        if (cached?.circle?.isMuted !== undefined) {
          if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "carry_forward_isMuted", { circleId: id, cachedValue: cached.circle.isMuted });
          (response as any).circle = { ...response.circle, isMuted: cached.circle.isMuted };
        }
      }
      // [P0_MSG_RETRY] Carry forward failed optimistic messages across poll refetches.
      // Without this, the 10s poll replaces the cache and silently wipes failed
      // messages before the user can retry or dismiss them.
      const failedMsgs = ((cached as any)?.circle?.messages ?? []).filter(
        (m: any) => m.status === "failed" && m.id?.startsWith("optimistic-"),
      );
      if (failedMsgs.length > 0 && response?.circle?.messages) {
        (response as any).circle = {
          ...response.circle,
          messages: [...response.circle.messages, ...failedMsgs],
        };
        if (__DEV__) devLog("[P0_MSG_RETRY]", "carry_forward_failed", { circleId: id, count: failedMsgs.length });
      }
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "refetch_settled", { circleId: id, isMuted: response?.circle?.isMuted });
      return response;
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id,
    refetchInterval: 10000, // Poll every 10 seconds for new messages
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
  });

  // [P1_LOADING_INV] loadedOnce discipline: prevent "Loading..." flash on 10s poll
  const { showInitialLoading: showCircleLoading, showRefetchIndicator: showCircleRefetch } = useLoadedOnce(
    { isLoading, isFetching, isSuccess, data },
    "circle-detail",
  );

  // [P0_TIMELINE] Mark UI converged when circle detail refetch settles
  const prevFetchingRef = useRef(false);
  useEffect(() => {
    if (__DEV__ && prevFetchingRef.current && !isFetching && id) {
      markTimeline(id, "ui_converged");
    }
    prevFetchingRef.current = isFetching;
  }, [isFetching, id]);

  // [P0_LOADING_ESCAPE] Timeout safety for initial load
  const { isTimedOut: isCircleTimedOut, reset: resetCircleTimeout } = useLoadingTimeout(
    !!(showCircleLoading || (!data?.circle && !isError)) && !!id,
    { timeout: 3000 },
  );
  const [isRetrying, setIsRetrying] = useState(false);
  const handleLoadingRetry = useCallback(() => {
    setIsRetrying(true);
    resetCircleTimeout();
    refetch();
    setTimeout(() => setIsRetrying(false), 1500);
  }, [resetCircleTimeout, refetch]);

  // [P1_SCROLL_ANCHOR] + [P1_NEW_MSG] Message append watcher — depends on count only, not full array
  const circle = data?.circle;
  const messageCount = circle?.messages?.length ?? 0;
  useEffect(() => {
    if (prevMessageCountRef.current == null) {
      prevMessageCountRef.current = messageCount;
      return;
    }
    // [P1_CHAT_PAGINATION] Skip watcher during older-message prepend
    if (isPrependingRef.current) {
      prevMessageCountRef.current = messageCount;
      if (__DEV__) {
        devLog("[P1_CHAT_PAGINATION]", "skip-new-msg-watcher (prepend)");
      }
      return;
    }
    const prev = prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;
    const delta = messageCount - prev;
    if (delta <= 0) return;

    if (isNearBottomRef.current) {
      clearUnseen();
      scheduleAutoScroll();
      sendReadHorizon("near_bottom_new_msg");
      if (__DEV__) {
        devLog("[P1_CHAT_PILL]", "pill_clear", { reason: "near_bottom", delta });
      }
    } else {
      bumpUnseen(delta);
      if (__DEV__) {
        devLog("[P1_CHAT_PILL]", "unseen_inc", { delta, unseenAfter: unseenCountRef.current });
      }
    }
  }, [messageCount, scheduleAutoScroll, clearUnseen, bumpUnseen]);

  // [P1_CHAT_CURSOR_V2] Init compound cursor from initial data
  useEffect(() => {
    if (!circle?.messages?.length) return;
    // Only seed cursor once (when null)
    if (cursorCreatedAtRef.current != null) return;
    const msgs = circle.messages;
    const oldest = msgs.reduce(
      (min: any, m: any) => (m.createdAt < min.createdAt ? m : min),
      msgs[0],
    );
    cursorCreatedAtRef.current = oldest.createdAt;
    cursorIdRef.current = oldest.id;
    if (__DEV__) {
      devLog("[P1_CHAT_CURSOR_V2]", "init", {
        oldestCreatedAt: oldest.createdAt,
        oldestId: oldest.id,
        initialCount: msgs.length,
      });
    }
  }, [circle?.messages]);

  // Fetch friends list for adding members
  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session) && showAddMembers,
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ content, clientMessageId, reply }: { content: string; clientMessageId: string; reply?: { messageId: string; userId: string; userName: string; snippet: string } }) =>
      postIdempotent(`/api/circles/${id}/messages`, { content, clientMessageId, ...(reply ? { reply } : {}) }),
    onMutate: async ({ content, clientMessageId, reply }: { content: string; clientMessageId: string; reply?: { messageId: string; userId: string; userName: string; snippet: string } }) => {
      // Build optimistic message and insert into cache immediately
      const userId = session?.user?.id ?? "unknown";
      const userName = session?.user?.name ?? undefined;
      const userImage = session?.user?.image ?? null;
      const optimistic = buildOptimisticMessage(id, userId, content, userName, userImage);
      // Override clientMessageId so retry reuses the same one
      optimistic.clientMessageId = clientMessageId;
      // Attach reply metadata to optimistic message for immediate render
      if (reply) (optimistic as any).reply = reply;

      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: circleKeys.single(id) });

      // [P0_CHAT_BUMP_UI] Optimistically bump lastMessageAt in circles list so chat reorders to top
      const nowISO = new Date().toISOString();
      queryClient.setQueryData(circleKeys.all(), (old: any) => {
        if (!old?.circles) return old;
        return {
          ...old,
          circles: old.circles.map((c: any) =>
            c.id === id ? { ...c, lastMessageAt: nowISO } : c
          ),
        };
      });
      if (__DEV__) {
        devLog('[P0_CHAT_BUMP_UI]', { circleId: id, lastMessageAt: nowISO, source: 'send' });
      }

      queryClient.setQueryData(
        circleKeys.single(id),
        (prev: any) => safeAppendMessage(prev, optimistic),
      );

      if (__DEV__) {
        devLog("[P1_MSG_IDEMP]", "mutate", { clientMessageId, optimisticId: optimistic.id });
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'optimistic_apply',
          result: 'message_insert',
        }));
      }

      // Clear input immediately for instant feel
      setMessage("");

      return { optimisticId: optimistic.id, content, clientMessageId, _t0: Date.now() };
    },
    onSuccess: (serverResponse: any, _vars, context) => {
      // Reconcile: replace optimistic message with server response, mark sent
      const serverMsg = serverResponse?.message;
      if (serverMsg?.id && context?.optimisticId) {
        // Try matching by clientMessageId first (covers push-arrived-first), fallback to optimisticId
        const cmi = context.clientMessageId;
        let foundOptimistic = false;
        queryClient.setQueryData(
          circleKeys.single(id),
          (prev: any) => {
            if (!prev?.circle?.messages) return prev;
            return {
              ...prev,
              circle: {
                ...prev.circle,
                messages: prev.circle.messages.map((m: any) => {
                  if (m.id === context.optimisticId || (cmi && m.clientMessageId === cmi && m.id !== serverMsg.id)) {
                    foundOptimistic = true;
                    return { ...serverMsg, status: "sent", clientMessageId: cmi };
                  }
                  return m;
                }),
              },
            };
          },
        );
        if (__DEV__) {
          devLog("[P1_MSG_IDEMP]", "reconcile_via_http", {
            clientMessageId: cmi,
            serverId: serverMsg.id,
            foundOptimistic,
          });
        }
      }

      // Background reconcile — inactive only
      queryClient.invalidateQueries({
        queryKey: circleKeys.single(id),
        refetchType: "inactive",
      });
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'server_commit',
          result: 'message_reconciled',
        }));
        devLog('[ACTION_FEEDBACK]', JSON.stringify({
          action: 'message_send',
          state: 'success',
          circleId: id,
          durationMs: context?._t0 ? Date.now() - context._t0 : 0,
        }));
      }
      // [P0_ANALYTICS_EVENT] message_sent
      trackMessageSent({
        hasMedia: 0,
        lengthBucket: lengthBucket(context?.content?.length ?? 0),
        sourceScreen: "circle",
      });
    },
    onError: (error, _vars, context) => {
      // Mark as failed — do NOT remove. Message stays visible for retry.
      if (context?.optimisticId) {
        queryClient.setQueryData(
          circleKeys.single(id),
          (prev: any) => {
            if (!prev?.circle?.messages) return prev;
            return {
              ...prev,
              circle: {
                ...prev.circle,
                messages: prev.circle.messages.map(
                  (m: any) => m.id === context.optimisticId
                    ? { ...m, status: "failed" }
                    : m,
                ),
              },
            };
          },
        );
        if (__DEV__) {
          devLog("[P1_MSG_DELIVERY]", `failed ${context.optimisticId}`);
          devLog('[P0_OPTIMISTIC]', JSON.stringify({
            domain: 'circle_action',
            circleId: id,
            phase: 'rollback',
            result: 'message_marked_failed',
          }));
        }
      }
      safeToast.error("Message Failed", "Message failed to send. Tap to retry.", error);
      if (__DEV__) {
        devLog('[ACTION_FEEDBACK]', JSON.stringify({
          action: 'message_send',
          state: 'error',
          circleId: id,
          durationMs: context?._t0 ? Date.now() - context._t0 : 0,
        }));
      }
    },
  });

  // Add members mutation
  const addMembersMutation = useMutation({
    mutationFn: (memberIds: string[]) =>
      api.post<{ success: boolean; addedCount: number }>(`/api/circles/${id}/members`, { memberIds }),
    onSuccess: async (_data, memberIds) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // [P0_OPTIMISTIC] DEV proof: server_commit for add members (no optimistic, invalidate only)
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'server_commit',
          result: `members_added_${memberIds.length}`,
        }));
      }
      setShowAddMembers(false);
      setSelectedFriends([]);

      // Invalidate and refetch circle data to update calendar with new members
      await queryClient.invalidateQueries({ queryKey: circleKeys.single(id) });
      await queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      await refetch();

      // Check if new members are friends with all existing circle members
      if (circle && friendsData?.friends) {
        checkFriendSuggestions(memberIds);
      }
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // [P0_OPTIMISTIC] DEV proof: no optimistic to rollback, just log failure
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'rollback',
          result: 'add_members_failed',
        }));
      }
      safeToast.error("Add Members Failed", "Failed to add members. Please try again.");
    },
  });

  // Remove member mutation (host only)
  const removeMemberMutation = useMutation({
    mutationFn: (memberUserId: string) => {
      if (__DEV__) {
        devLog('[CircleRemoveMember] Mutation executing:', {
          circleId: id,
          memberUserId,
          endpoint: `/api/circles/${id}/members/${memberUserId}`,
        });
      }
      return api.delete(`/api/circles/${id}/members/${memberUserId}`);
    },
    onSuccess: async (_data, memberUserId) => {
      if (__DEV__) {
        devLog('[CircleRemoveMember] Mutation SUCCESS:', { circleId: id, memberUserId });
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'server_commit',
          result: 'member_removed',
        }));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Removed", "Member has been removed from the circle.");
      setSelectedMemberToRemove(null);
      // Invalidate and refetch circle data
      refreshAfterCircleMemberRemove(queryClient, id);
      await refetch();
    },
    onError: (error: any, memberUserId) => {
      if (__DEV__) {
        devLog('[CircleRemoveMember] Mutation ERROR:', {
          circleId: id,
          memberUserId,
          status: error?.status,
          message: error?.message,
          body: error?.body,
        });
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'rollback',
          result: 'remove_member_failed',
        }));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error?.status === 403) {
        safeToast.error("Not Allowed", "Only the host can remove members.");
      } else if (error?.status === 400) {
        safeToast.error("Cannot Remove", "The host cannot be removed from the circle.");
      } else {
        safeToast.error("Remove Failed", "Failed to remove member. Please try again.");
      }
      setSelectedMemberToRemove(null);
    },
  });

  // [P1_READ_HORIZON] markAsReadMutation removed — replaced by sendReadHorizon()

  // Update circle mutation (for description editing)
  const updateCircleMutation = useMutation({
    mutationFn: (updates: { description?: string }) =>
      api.put<{ circle: Circle }>(`/api/circles/${id}`, updates),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Saved", "Description updated");
      queryClient.invalidateQueries({ queryKey: circleKeys.single(id) });
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      setEditingDescription(false);
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error?.status === 403) {
        safeToast.error("Not Allowed", "Only the host can edit this.");
      } else {
        safeToast.error("Update Failed", "Failed to update. Please try again.");
      }
    },
  });

  // [P0_CIRCLE_MUTE_V1] Mute toggle mutation
  const muteMutation = useMutation({
    mutationFn: async (isMuted: boolean) => {
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "mutation_start", { circleId: id, desiredMuted: isMuted });
      return api.post(`/api/circles/${id}/mute`, { isMuted });
    },
    onMutate: async (isMuted) => {
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "optimistic_update", { circleId: id, isMuted });
      // [P0_OPTIMISTIC] DEV proof: optimistic_apply phase for circle mute
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'optimistic_apply',
          result: `mute_${isMuted}`,
        }));
      }
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: circleKeys.all() });
      await queryClient.cancelQueries({ queryKey: circleKeys.single(id) });

      // Snapshot current values
      const previousCircles = queryClient.getQueryData(circleKeys.all());
      const previousCircle = queryClient.getQueryData(circleKeys.single(id));

      // Optimistically update circles list
      queryClient.setQueryData(circleKeys.all(), (old: any) => {
        if (!old?.circles) return old;
        return {
          ...old,
          circles: old.circles.map((c: Circle) =>
            c.id === id ? { ...c, isMuted } : c
          ),
        };
      });

      // Optimistically update circle detail
      queryClient.setQueryData(circleKeys.single(id), (old: any) => {
        if (!old?.circle) return old;
        return { ...old, circle: { ...old.circle, isMuted } };
      });

      return { previousCircles, previousCircle };
    },
    onSuccess: (_, isMuted) => {
      // [P0_CIRCLE_MUTE_POLISH] Light selection haptic on success
      Haptics.selectionAsync();
      if (__DEV__) {
        devLog("[P0_CIRCLE_MUTE_POLISH]", {
          circleId: id,
          prevMuted: !isMuted,
          nextMuted: isMuted,
          entryPoint: "details",
          success: true,
        });
        devLog("[P0_CIRCLE_MUTE_ANALYTICS]", {
          eventName: "circle_mute_toggle",
          payload: { circleId: id, nextMuted: isMuted, entryPoint: "details" },
        });
      }
      trackAnalytics("circle_mute_toggle", {
        circleId: id,
        nextMuted: isMuted,
        entryPoint: "details",
      });
      // [P0_CIRCLE_SETTINGS] Only invalidate list — do NOT invalidate single() here.
      // The detail endpoint returns isMuted as optional; a refetch can overwrite
      // the optimistic update with undefined → false, causing the toggle to revert.
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "mutation_success", { circleId: id, persistedMuted: isMuted });
      if (__DEV__) devLog("[P0_CIRCLE_SETTINGS]", "mute_persist_ok", { circleId: id, isMuted });
      // [P0_OPTIMISTIC] DEV proof: server_commit phase for circle mute
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'server_commit',
          result: `mute_${isMuted}_committed`,
        }));
      }
    },
    onError: (error, isMuted, context) => {
      // Revert optimistic updates
      if (context?.previousCircles) {
        queryClient.setQueryData(circleKeys.all(), context.previousCircles);
      }
      if (context?.previousCircle) {
        queryClient.setQueryData(circleKeys.single(id), context.previousCircle);
      }
      if (__DEV__) {
        devLog("[P0_CIRCLE_MUTE_POLISH]", {
          circleId: id,
          prevMuted: !isMuted,
          nextMuted: isMuted,
          entryPoint: "details",
          success: false,
        });
      }
      if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "mutation_error", { circleId: id, desiredMuted: isMuted, error: String(error) });
      // [P0_OPTIMISTIC] DEV proof: rollback phase for circle mute
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'rollback',
          result: 'mute_reverted',
        }));
      }
      safeToast.error("Oops", "Could not update mute setting");
    },
  });

  // [P1_READ_HORIZON] Mark as read on focus + track active circle for push routing
  useFocusEffect(
    useCallback(() => {
      if (session && id && isAuthedForNetwork(bootStatus, session)) {
        setActiveCircle(id);
        sendReadHorizon("focus");
      }
      return () => {
        setActiveCircle(null);
      };
    }, [session, id, bootStatus, sendReadHorizon]),
  );

  // [P1_CIRCLE_LEAVE_VIS] Refetch circle on focus + detect roster changes
  useFocusEffect(
    useCallback(() => {
      if (!id || !isAuthedForNetwork(bootStatus, session)) return;
      refetch().then((result) => {
        const nextMembers = result.data?.circle?.members;
        if (!nextMembers) return;
        const nextCount = nextMembers.length;
        const prevCount = prevMemberCountRef.current;
        if (prevCount !== null && prevCount !== nextCount) {
          if (__DEV__) {
            devLog("[P1_CIRCLE_LEAVE_VIS]", "roster_changed", {
              circleId: id,
              prevCount,
              nextCount,
              delta: nextCount - prevCount,
            });
          }
          safeToast.info("Roster updated", `${nextCount} member${nextCount === 1 ? "" : "s"}`);
        }
        prevMemberCountRef.current = nextCount;
      });
    }, [id, bootStatus, session, refetch]),
  );

  // [P0_WS_TYPING_UI] Send/receive handled by useTypingRealtime hook;
  // clear typing on screen blur via useFocusEffect.
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Best-effort clear typing on blur so others don't see stale indicator
        setTyping(false);
      };
    }, [setTyping]),
  );

  // [P1_CHAT_CURSOR_V2] Fetch older messages with compound cursor pagination
  const fetchOlderMessages = useCallback(async () => {
    if (!id || !hasMoreOlder || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    isPrependingRef.current = true;

    try {
      const res = await getCircleMessages({
        circleId: id,
        beforeCreatedAt: cursorCreatedAtRef.current,
        beforeId: cursorIdRef.current,
        limit: PAGE_SIZE,
      });

      const older = res.messages ?? [];
      const serverHasMore = res.hasMore ?? false;

      // Update compound cursor to oldest returned message
      if (older.length > 0) {
        const oldest = older.reduce((min, m) =>
          m.createdAt < min.createdAt ? m : min, older[0],
        );
        cursorCreatedAtRef.current = oldest.createdAt;
        cursorIdRef.current = oldest.id;
      }

      // Trust server for hasMore; fallback if empty
      setHasMoreOlder(older.length === 0 ? false : serverHasMore);

      // Patch cache: prepend older messages into circleKeys.single
      if (older.length > 0) {
        queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
          if (!prev?.circle) return prev;
          const prevMsgs = prev.circle.messages ?? [];
          const merged = safePrependMessages(prevMsgs, older);
          return { ...prev, circle: { ...prev.circle, messages: merged } };
        });
      }

      if (__DEV__) {
        devLog("[P1_CHAT_CURSOR_V2]", "prepend", {
          olderCount: older.length,
          hasMore: serverHasMore,
          oldestCreatedAt: cursorCreatedAtRef.current,
          oldestId: cursorIdRef.current,
        });
      }
    } catch (e) {
      safeToast.error("Oops", "Couldn't load older messages");
      if (__DEV__) {
        devLog("[P1_CHAT_CURSOR_V2]", "load-earlier error", { circleId: id, error: String(e) });
      }
    } finally {
      // Allow rAF to settle layout before clearing prepend flag
      requestAnimationFrame(() => {
        isPrependingRef.current = false;
      });
      setIsLoadingEarlier(false);
    }
  }, [id, hasMoreOlder, isLoadingEarlier, queryClient, PAGE_SIZE]);

  // [P0_SHEET_PRIMITIVE_GROUP_SETTINGS] proof log – once per open
  useEffect(() => {
    if (__DEV__ && showGroupSettings) {
      const capPx = Math.round(Dimensions.get("window").height * 0.85);
      devLog("[P0_SHEET_PRIMITIVE_GROUP_SETTINGS] open", { maxHeightPct: 0.85, capPx });
      devLog("[CIRCLE_SETTINGS_SHEET] view=settings");
    }
  }, [showGroupSettings]);

  // [CIRCLE_SETTINGS_SHEET] proof log – view mode switching
  useEffect(() => {
    if (__DEV__ && showGroupSettings && settingsSheetView === "photo") {
      devLog("[CIRCLE_SETTINGS_SHEET] view=photo");
    }
  }, [settingsSheetView, showGroupSettings]);

  const isHost = circle?.createdById === session?.user?.id;

  // Check if new members need friend suggestions
  const checkFriendSuggestions = (newMemberIds: string[]) => {
    if (!circle || !circle.members || !friendsData?.friends) return;

    const existingMemberIds = circle.members.map(m => m.userId);
    const myFriendIds = new Set(friendsData.friends.map(f => f.friendId));
    const suggestions: Array<{
      newMemberName: string;
      existingMemberName: string;
      newMemberId: string;
    }> = [];

    // For each new member, check if they are friends with existing members
    // We can only suggest adding them as friends to the current user
    for (const newMemberId of newMemberIds) {
      const newMember = friendsData.friends.find(f => f.friendId === newMemberId);
      if (!newMember) continue;

      // Check each existing member
      for (const existingMember of circle.members) {
        // Skip if this is the current user
        if (existingMember.userId === session?.user?.id) continue;

        // Check if the existing member is in the new member's potential friends
        // Since we can't check another user's friend list, we note this for the suggestion
        // The suggestion is: "New member might not be friends with existing member"
        if (!myFriendIds.has(existingMember.userId)) {
          // Current user isn't friends with this existing member (shouldn't happen in a circle)
          continue;
        }

        // Add a suggestion that encourages adding each other
        suggestions.push({
          newMemberName: newMember.friend.name ?? "Unknown",
          existingMemberName: existingMember.user.name ?? "Unknown",
          newMemberId: newMemberId,
        });
      }
    }

    // Show unique suggestions (one per new member)
    const uniqueSuggestions = newMemberIds.map(id => {
      const newMember = friendsData.friends.find(f => f.friendId === id);
      if (!newMember) return null;

      return {
        newMemberName: newMember.friend.name ?? "Unknown",
        existingMemberName: "", // Will show general message
        newMemberId: id,
      };
    }).filter((s): s is NonNullable<typeof s> => s !== null);

    if (uniqueSuggestions.length > 0) {
      setFriendSuggestions(uniqueSuggestions);
      // Show suggestion modal after a brief delay
      setTimeout(() => setShowFriendSuggestionModal(true), 500);
    }
  };

  const handleSend = () => {
    // [P0_SINGLEFLIGHT] Prevent double-submit while mutation is in-flight
    if (sendMessageMutation.isPending) {
      if (__DEV__) devLog("[P0_SINGLEFLIGHT]", "blocked action=sendMessage");
      return;
    }
    if (message.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTyping(false);
      const clientMessageId = `cmi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      // [P2_CHAT_REPLY_UI2] Build reply payload for API
      let reply: { messageId: string; userId: string; userName: string; snippet: string } | undefined;
      if (replyTarget) {
        reply = {
          messageId: replyTarget.messageId,
          userId: replyTarget.userId,
          userName: replyTarget.name,
          snippet: replyTarget.snippet,
        };
        if (__DEV__) devLog("[P2_CHAT_REPLY_UI2]", "send_attach", { messageId: replyTarget.messageId });
        clearReplyTarget("sent");
      }
      sendMessageMutation.mutate({
        content: message.trim(),
        clientMessageId,
        ...(reply ? { reply } : {}),
      });
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    Haptics.selectionAsync();
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleAddMembers = () => {
    if (selectedFriends.length === 0) {
      safeToast.warning("Select Friends", "Please select at least one friend to add.");
      return;
    }

    // Check member limit before adding (fail-open while loading — backend validates)
    const currentMembersCount = circle?.members?.length ?? 0;
    const newTotalCount = currentMembersCount + selectedFriends.length;
    if (!entitlementsLoading) {
      const check = canAddCircleMember(entitlements, currentMembersCount);
      if (!check.allowed && check.context) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPaywallContext(check.context);
        setShowPaywallModal(true);
        return;
      }
    }

    addMembersMutation.mutate(selectedFriends);
  };

  // Filter out friends who are already members
  const availableFriends = useMemo(() => {
    if (!friendsData?.friends || !circle || !circle.members) return [];
    const memberIds = new Set(circle.members.map(m => m.userId));
    return friendsData.friends.filter(f => !memberIds.has(f.friendId));
  }, [friendsData?.friends, circle]);

  // ═══ HOOK_ORDER_STABLE: All hooks declared before any early return ═══
  // [P1_AVAIL_SUMMARY_UI] Availability summary query — graceful 404 fallback
  const [showAvailSheet, setShowAvailSheet] = useState(false);
  const { data: availData } = useQuery({
    queryKey: circleKeys.availabilitySummary(id!),
    queryFn: async () => {
      try {
        const res = await api.get<{
          tonight: { free: number; busy: number; tentative?: number; unknown: number; total: number };
          members?: Array<{ userId: string; name: string; status: string }>;
        }>(`/api/circles/${id}/availability-summary`);
        return res;
      } catch (e: any) {
        if (__DEV__) devLog("[P1_AVAIL_SUMMARY_UI]", "hidden_nonok", { status: e?.status ?? "unknown" });
        return null;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  // Derive strip data; hide if query failed / not yet loaded
  const availTonight = availData?.tonight ?? null;
  const availMembers = availData?.members ?? null;
  // [P1_AVAIL_SUMMARY_UI] mounted log removed (noise reduction)
  useEffect(() => {
    if (__DEV__ && availTonight) {
      devLog("[P1_AVAIL_SUMMARY_UI]", "shown", {
        free: availTonight.free,
        busy: availTonight.busy,
        unknown: availTonight.unknown,
        tentative: availTonight.tentative,
        total: availTonight.total,
      });
    }
  }, [availTonight]);

  // [P1_PLAN_LOCK_UI] Plan lock query — graceful 404 fallback
  const [showPlanLockSheet, setShowPlanLockSheet] = useState(false);
  const [planLockDraftNote, setPlanLockDraftNote] = useState("");
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const { data: planLockData } = useQuery({
    queryKey: circleKeys.planLock(id!),
    queryFn: async () => {
      try {
        const res = await api.get<{
          locked: boolean;
          note?: string;
        }>(`/api/circles/${id}/plan-lock`);
        return res;
      } catch (e: any) {
        if (__DEV__) devLog("[P1_PLAN_LOCK_UI]", "hidden_nonok", { status: e?.status ?? "unknown" });
        return null;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  const planLock = planLockData ?? null;
  // [P1_PLAN_LOCK_UI] mounted log removed (noise reduction)
  // [P1_LIFECYCLE_UI] Lifecycle query — graceful 404 fallback
  const { data: lifecycleData } = useQuery({
    queryKey: circleKeys.lifecycle(id!),
    queryFn: async () => {
      try {
        const res = await api.get<{ state: string; note?: string }>(`/api/circles/${id}/lifecycle`);
        return res;
      } catch (e: any) {
        if (__DEV__) devLog("[P1_LIFECYCLE_UI]", "hidden_nonok", { status: e?.status ?? "unknown" });
        return null;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  const lifecycleState = lifecycleData?.state ?? null;
  const lifecycleNote = lifecycleData?.note ?? null;

  // [P1_LIFECYCLE_UI] Run-it-back mutation
  const lifecycleMutation = useMutation({
    mutationFn: async (body: { state: string }) => {
      return api.post<{ state: string }>(`/api/circles/${id}/lifecycle`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: circleKeys.lifecycle(id!) });
      queryClient.invalidateQueries({ queryKey: circleKeys.polls(id!) });
      queryClient.invalidateQueries({ queryKey: circleKeys.planLock(id!) });
    },
  });

  // [P1_NOTIFY_LEVEL_UI] Notification level query — graceful fallback to "all"
  type CircleNotificationLevel = "all" | "decisions" | "mentions" | "mute";
  const { data: notifyLevelData } = useQuery({
    queryKey: circleKeys.notificationLevel(id!),
    queryFn: async () => {
      try {
        const res = await api.get<{ ok: boolean; level: CircleNotificationLevel }>(`/api/circles/${id}/notification-level`);
        return res;
      } catch (e: any) {
        if (__DEV__) devLog("[P1_NOTIFY_LEVEL_UI]", "query_fallback", { status: e?.status ?? "unknown" });
        return { ok: true, level: "all" as CircleNotificationLevel };
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  const notifyLevel: CircleNotificationLevel = (notifyLevelData?.level as CircleNotificationLevel) ?? "all";

  const notifyLevelMutation = useMutation({
    mutationFn: async (level: CircleNotificationLevel) => {
      return api.post<{ ok: boolean; level: CircleNotificationLevel }>(`/api/circles/${id}/notification-level`, { level });
    },
    onMutate: async (level) => {
      await queryClient.cancelQueries({ queryKey: circleKeys.notificationLevel(id!) });
      const prev = queryClient.getQueryData(circleKeys.notificationLevel(id!));
      queryClient.setQueryData(circleKeys.notificationLevel(id!), { ok: true, level });
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'optimistic_apply',
          result: `notify_level_${level}`,
        }));
      }
      return { prev };
    },
    onError: (_err, _level, context) => {
      if (context?.prev) {
        queryClient.setQueryData(circleKeys.notificationLevel(id!), context.prev);
      }
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'rollback',
          result: 'notify_level_reverted',
        }));
      }
      safeToast.error("Update Failed", "Failed to update notifications");
      if (__DEV__) devLog("[P1_NOTIFY_LEVEL_UI]", "save_error", { level: _level });
    },
    onSuccess: (_data, level) => {
      if (__DEV__) devLog("[P1_NOTIFY_LEVEL_UI]", "save_success", { level });
      // [P0_OPTIMISTIC] DEV proof: server_commit phase for notify level
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'server_commit',
          result: `notify_level_${level}_committed`,
        }));
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: circleKeys.notificationLevel(id!) });
    },
  });

  // [P1_NOTIFY_LEVEL_UI] mounted log removed (noise reduction)

  // [P1_COORDINATION_FLOW] Log lock highlight on transition
  const prevLockedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (planLock?.locked && prevLockedRef.current === false && __DEV__) {
      devLog("[P1_COORDINATION_FLOW]", "lock_highlight");
    }
    prevLockedRef.current = planLock?.locked ?? null;
  }, [planLock?.locked]);

  // [P1_PLAN_LOCK_UI] Save mutation with optimistic update
  const planLockMutation = useMutation({
    mutationFn: async ({ locked, note }: { locked: boolean; note: string }) => {
      return api.post<{ locked: boolean; note?: string }>(`/api/circles/${id}/plan-lock`, { locked, note });
    },
    onMutate: async ({ locked, note }) => {
      await queryClient.cancelQueries({ queryKey: circleKeys.planLock(id!) });
      const prev = queryClient.getQueryData(circleKeys.planLock(id!));
      queryClient.setQueryData(circleKeys.planLock(id!), { locked, note: note || undefined });
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'optimistic_apply',
          result: `plan_lock_${locked}`,
        }));
      }
      return { prev };
    },
    onSuccess: () => {
      if (__DEV__) devLog("[P1_PLAN_LOCK_UI]", "save", { circleId: id });
      // [P0_OPTIMISTIC] DEV proof: server_commit phase for plan lock
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'server_commit',
          result: 'plan_lock_committed',
        }));
      }
      queryClient.invalidateQueries({ queryKey: circleKeys.planLock(id!), refetchType: "inactive" });
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(circleKeys.planLock(id!), context.prev);
      }
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'rollback',
          result: 'plan_lock_reverted',
        }));
      }
      safeToast.error("Update Failed", "Could not update plan lock");
    },
  });

  // [P1_POLL_UI] Poll query — graceful 404 fallback
  const [showPollSheet, setShowPollSheet] = useState(false);
  const [activePollIdx, setActivePollIdx] = useState(0);
  const { data: pollsRaw } = useQuery({
    queryKey: circleKeys.polls(id!),
    queryFn: async () => {
      try {
        return await api.get<{
          polls: Array<{
            id: string;
            question: string;
            options: Array<{ id: string; label: string; count: number; votedByMe: boolean }>;
          }>;
        }>(`/api/circles/${id}/polls`);
      } catch (e: any) {
        if (__DEV__) devLog("[P1_POLL_UI]", "hidden_nonok", { status: e?.status ?? "unknown" });
        return null;
      }
    },
    enabled: isAuthedForNetwork(bootStatus, session) && !!id && !!data?.circle,
    retry: false,
    staleTime: 60_000,
  });
  const polls = pollsRaw?.polls ?? null;
  const pollLogFiredRef = useRef(false);
  useEffect(() => {
    if (!pollLogFiredRef.current && __DEV__) {
      // [P1_POLL_UI] mount, [P1_POLLS_E2E_UI] mounted, [P2_TYPING_UI] mounted removed (noise reduction)
      devLog("[P1_COORDINATION_FLOW]", "mounted");
      devLog("[P1_CIRCLE_POLLS_DISABLED]", { applied: true });
      pollLogFiredRef.current = true;
    }
  }, []);
  useEffect(() => {
    if (__DEV__ && polls && polls.length > 0) {
      devLogThrottle("[P1_POLL_UI]", "refresh", 30_000, { count: polls.length });
      devLogThrottle("[P1_POLLS_E2E_UI]", "polls_refetched", 30_000, { count: polls.length });
    }
  }, [polls]);

  // [P1_POLL_UI] Vote mutation with optimistic update
  const voteMutation = useMutation({
    mutationFn: async ({ pollId, optionId }: { pollId: string; optionId: string }) => {
      return api.post(`/api/circles/${id}/polls/${pollId}/vote`, { optionId });
    },
    onMutate: async ({ pollId, optionId }) => {
      await queryClient.cancelQueries({ queryKey: circleKeys.polls(id!) });
      const prev = queryClient.getQueryData(circleKeys.polls(id!));
      queryClient.setQueryData(circleKeys.polls(id!), (old: any) => {
        if (!old?.polls) return old;
        return {
          ...old,
          polls: old.polls.map((p: any) => {
            if (p.id !== pollId) return p;
            return {
              ...p,
              options: p.options.map((o: any) => {
                const wasVoted = o.votedByMe;
                const isTarget = o.id === optionId;
                if (isTarget) return { ...o, votedByMe: true, count: wasVoted ? o.count : o.count + 1 };
                if (wasVoted) return { ...o, votedByMe: false, count: Math.max(0, o.count - 1) };
                return o;
              }),
            };
          }),
        };
      });
      if (__DEV__) devLog("[P1_POLL_UI]", "vote", { pollId, optionId });
      if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "vote_attempt", { pollId, optionId });
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'optimistic_apply',
          result: `vote_${pollId}_${optionId}`,
        }));
      }
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: circleKeys.polls(id!) });
      if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "vote_success");
      // [P0_OPTIMISTIC] DEV proof: server_commit phase for vote
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'server_commit',
          result: 'vote_committed',
        }));
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(circleKeys.polls(id!), context.prev);
      }
      if (__DEV__) {
        devLog('[P0_OPTIMISTIC]', JSON.stringify({
          domain: 'circle_action',
          circleId: id,
          phase: 'rollback',
          result: 'vote_reverted',
        }));
      }
      safeToast.error("Vote Failed", "Could not submit vote");
      if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "vote_error", { error: String(_err) });
    },
  });

  // Derive messages safely (circle may be null before loading gate)
  const messages = circle?.messages ?? [];

  // [P1_NEXT_EVENT_ANCHOR] Derive next upcoming event that belongs to THIS circle
  const nextCircleEvent = useMemo(() => {
    if (!circle?.circleEvents) return null;
    const now = Date.now();
    let best: { id: string; title: string; startTime: string; endTime?: string | null; emoji?: string; location?: string | null; color?: string; coverUrl?: string | null; eventPhotoUrl?: string | null; description?: string | null } | null = null;
    let bestTime = Infinity;
    for (const ce of circle.circleEvents) {
      const ev = ce.event;
      if (!ev) continue;
      const t = new Date(ev.startTime).getTime();
      if (t > now && t < bestTime) {
        bestTime = t;
        best = {
          id: ev.id,
          title: ev.title,
          startTime: ev.startTime,
          endTime: ev.endTime ?? null,
          emoji: ev.emoji,
          location: ev.location ?? null,
          color: ev.color ?? undefined,
          coverUrl: ev.eventPhotoUrl ?? null,
          eventPhotoUrl: ev.eventPhotoUrl ?? null,
          description: ev.description ?? null,
        };
      }
    }
    return best;
  }, [circle?.circleEvents]);

  // Lookup map: eventId → { eventPhotoUrl, description } from circleEvents for thread card enrichment
  const circleEventMetaMap = useMemo(() => {
    const map: Record<string, { eventPhotoUrl?: string | null; description?: string | null }> = {};
    if (!circle?.circleEvents) return map;
    for (const ce of circle.circleEvents) {
      if (ce.event) {
        map[ce.eventId] = { eventPhotoUrl: ce.event.eventPhotoUrl, description: ce.event.description };
      }
    }
    return map;
  }, [circle?.circleEvents]);

  // [P1_CHAT_SEND_UI] Derive send-status flags for pending/failed indicators
  const hasPending = messages.some((m: any) => m.status === "sending");
  const latestFailed = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as any;
      if (m.status === "failed" && m.id?.startsWith("optimistic-")) return m;
    }
    return null;
  }, [messages]);
  const hasFailed = !!latestFailed;

  // [P1_CHAT_SEND_UI] DEV log when failed banner becomes visible
  useEffect(() => {
    if (__DEV__ && hasFailed && latestFailed) {
      devLog("[P1_CHAT_SEND_UI]", "banner_shown", { failedId: latestFailed.id });
    }
  }, [hasFailed, latestFailed]);

  // [P1_CHAT_TS] Tap-to-toggle timestamp state
  const [activeTimestampId, setActiveTimestampId] = useState<string | null>(null);
  const activeTimestampTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBubbleTap = useCallback((msgId: string | undefined) => {
    if (!msgId) return;
    if (activeTimestampTimerRef.current) clearTimeout(activeTimestampTimerRef.current);
    if (activeTimestampId === msgId) {
      setActiveTimestampId(null);
      return;
    }
    setActiveTimestampId(msgId);
    if (__DEV__) devLog("[P1_CHAT_TS]", "toggle_on", { id: msgId, reason: "tap" });
    activeTimestampTimerRef.current = setTimeout(() => {
      setActiveTimestampId(null);
      if (__DEV__) devLog("[P1_CHAT_TS]", "auto_hide", { id: msgId });
    }, 3000);
  }, [activeTimestampId]);

  // [P2_CHAT_REACTIONS] Local-only reactions overlay state
  const [reactionsByStableId, setReactionsByStableId] = useState<Record<string, string[]>>({});
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const REACTION_EMOJI = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDE4F"];
  // [P2_CHAT_REACTIONS] mounted log removed (noise reduction)

  // [P2_CHAT_REPLY] Reply state (wired to API)
  const [replyTarget, setReplyTarget] = useState<{ messageId: string; userId: string; name: string; snippet: string } | null>(null);
  // [P2_CHAT_REPLY_UI2] mounted log removed (noise reduction)
  const clearReplyTarget = useCallback((reason: "x" | "sent" | "blur" | "system_guard") => {
    setReplyTarget(null);
    if (__DEV__) devLog("[P2_CHAT_REPLY_UI2]", "clear", { reason });
  }, []);

  // [P2_CHAT_EDITDEL] Local-only edit/delete state
  const [editedContentByStableId, setEditedContentByStableId] = useState<Record<string, { content: string; editedAt: number }>>({});
  const [deletedStableIds, setDeletedStableIds] = useState<Record<string, true>>({});
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editDraftContent, setEditDraftContent] = useState("");
  // [P2_CHAT_EDITDEL] mounted log removed (noise reduction)

  // [P1_CHAT_GROUP] One-time mount log
  const groupLogFired = useRef(false);
  useEffect(() => {
    if (!groupLogFired.current && __DEV__) {
      devLog("[P1_CHAT_GROUP]", "enabled windowMs=120000");
      devLog("[P2_CHAT_DATESEP]", "enabled");
      // [P2_TYPING_UI] mounted removed (noise reduction)
      groupLogFired.current = true;
    }
  }, []);

  // ─── [P0_CHAT_ANCHOR] DEV-only QA Panel state & helpers ───
  const [qaExpanded, setQaExpanded] = useState(false);
  const qaSnap = useCallback(() => ({
    isNearBottom: isNearBottomRef.current,
    firstVisibleId: firstVisibleIdRef.current,
    scrollY: scrollOffsetRef.current,
    contentH: contentHeightRef.current,
    ts: Date.now(),
  }), []);
  const qaLog = useCallback((action: string, before: { isNearBottom: boolean; firstVisibleId: string | null; scrollY: number; contentH: number; ts: number }, didAutoScroll: boolean) => {
    if (!__DEV__) return;
    requestAnimationFrame(() => {
      devLog("[P0_CHAT_ANCHOR]", action, {
        before: { isNearBottom: before.isNearBottom, firstVisibleId: before.firstVisibleId, scrollY: Math.round(before.scrollY), contentH: Math.round(before.contentH) },
        after: { isNearBottom: isNearBottomRef.current, firstVisibleId: firstVisibleIdRef.current, scrollY: Math.round(scrollOffsetRef.current), contentH: Math.round(contentHeightRef.current) },
        didAutoScroll,
        elapsedMs: Date.now() - before.ts,
      });
    });
  }, []);

  // [P0_UI_CONVERGENCE] Circle roster convergence guard (DEV only)
  // Proves the member list rendered is always the query snapshot — never stale optimistic data.
  useEffect(() => {
    if (!__DEV__) return;
    const qMembers = data?.circle?.members;
    if (!qMembers || !id) return;
    devLog('[P0_UI_CONVERGENCE]', {
      domain: 'circle_roster',
      circleId: id,
      memberCount: qMembers.length,
      source: 'query',
      queryKey: 'circleKeys.single(id)',
      isFetching,
    });
  }, [data?.circle?.members, id, isFetching]);

  // [P0_HOOK_FIX] hooks normalized — all hooks above, early return below
  if (__DEV__) devLog("[P0_HOOK_FIX]", "hooks normalized");

  // ═══ Loading gate (AFTER all hooks — HOOK_ORDER_STABLE invariant) ═══
  if (!session || showCircleLoading || !circle) {
    // [P0_LOADING_ESCAPE] Timeout / error escape
    if (isCircleTimedOut || (isError && !circle)) {
      return (
        <LoadingTimeoutUI
          context="circle"
          onRetry={handleLoadingRetry}
          isRetrying={isRetrying}
          showBottomNav={false}
          message={isError ? "Something went wrong loading this circle." : undefined}
        />
      );
    }
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // [P0_CHAT_ANCHOR] QA action helpers (DEV only, not perf-sensitive)
  const qaInjectMessages = (n: number) => {
    const snap = qaSnap();
    const now = Date.now();
    const fakes = Array.from({ length: n }, (_, i) => ({
      id: `qa-msg-${now}-${i}`,
      circleId: id,
      userId: "qa-user",
      content: `QA message #${i + 1} of ${n}`,
      createdAt: new Date(now + i).toISOString(),
      user: { id: "qa-user", name: "QA Bot", image: null },
    }));
    queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
      if (!prev?.circle) return prev;
      return { ...prev, circle: { ...prev.circle, messages: [...(prev.circle.messages ?? []), ...fakes] } };
    });
    const shouldScroll = isNearBottomRef.current;
    if (shouldScroll) scheduleAutoScroll();
    qaLog(`inject_${n}`, snap, shouldScroll);
  };
  const qaToggleTyping = () => {
    const snap = qaSnap();
    // QA: typing state now driven by WS hook; toggle send signal only
    setTyping(true);
    qaLog("toggle_typing", snap, false);
  };
  const qaToggleFailed = () => {
    const snap = qaSnap();
    queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
      if (!prev?.circle?.messages) return prev;
      const has = prev.circle.messages.some((m: any) => m.id === "optimistic-qa-fail");
      const next = has
        ? prev.circle.messages.filter((m: any) => m.id !== "optimistic-qa-fail")
        : [...prev.circle.messages, { id: "optimistic-qa-fail", circleId: id, userId: session?.user?.id ?? "qa", content: "QA failed msg", createdAt: new Date().toISOString(), user: { id: session?.user?.id ?? "qa", name: "QA", image: null }, status: "failed", clientMessageId: "cmi-qa-fail" }];
      return { ...prev, circle: { ...prev.circle, messages: next } };
    });
    qaLog("toggle_failed", snap, false);
  };
  const qaTogglePending = () => {
    const snap = qaSnap();
    queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
      if (!prev?.circle?.messages) return prev;
      const has = prev.circle.messages.some((m: any) => m.id === "optimistic-qa-pending");
      const next = has
        ? prev.circle.messages.filter((m: any) => m.id !== "optimistic-qa-pending")
        : [...prev.circle.messages, { id: "optimistic-qa-pending", circleId: id, userId: session?.user?.id ?? "qa", content: "QA pending msg", createdAt: new Date().toISOString(), user: { id: session?.user?.id ?? "qa", name: "QA", image: null }, status: "sending", clientMessageId: "cmi-qa-pending" }];
      return { ...prev, circle: { ...prev.circle, messages: next } };
    });
    qaLog("toggle_pending", snap, false);
  };
  const qaToggleReactions = () => {
    const snap = qaSnap();
    const tid = firstVisibleIdRef.current ?? messages[0]?.id;
    if (!tid) return;
    setReactionsByStableId(prev => {
      const ex = prev[tid] ?? [];
      return { ...prev, [tid]: ex.length > 0 ? [] : ["\uD83D\uDC4D", "\u2764\uFE0F"] };
    });
    qaLog("toggle_reactions", snap, false);
  };
  const qaToggleReply = () => {
    const snap = qaSnap();
    setReplyTarget(prev => prev ? null : { messageId: "qa-reply", userId: "qa-user", name: "QA Alice", snippet: "QA reply preview text" });
    qaLog("toggle_reply", snap, false);
  };
  const qaToggleEdit = () => {
    const snap = qaSnap();
    const tid = firstVisibleIdRef.current ?? messages[0]?.id;
    if (!tid) return;
    setEditedContentByStableId(prev => {
      if (prev[tid]) { const { [tid]: _, ...rest } = prev; return rest; }
      return { ...prev, [tid]: { content: "[QA edited]", editedAt: Date.now() } };
    });
    qaLog("toggle_edit", snap, false);
  };
  const qaToggleDelete = () => {
    const snap = qaSnap();
    const tid = firstVisibleIdRef.current ?? messages[0]?.id;
    if (!tid) return;
    setDeletedStableIds(prev => {
      if (prev[tid]) { const { [tid]: _, ...rest } = prev; return rest; }
      return { ...prev, [tid]: true as const };
    });
    qaLog("toggle_delete", snap, false);
  };
  const qaSimulatePrepend = () => {
    const snap = qaSnap();
    isPrependingRef.current = true;
    const now = Date.now();
    const fakes = Array.from({ length: 5 }, (_, i) => ({
      id: `qa-old-${now}-${i}`,
      circleId: id,
      userId: "qa-user",
      content: `QA older #${i + 1}`,
      createdAt: new Date(now - 86400000 - i * 60000).toISOString(),
      user: { id: "qa-user", name: "QA Bot", image: null },
    }));
    queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
      if (!prev?.circle) return prev;
      return { ...prev, circle: { ...prev.circle, messages: [...fakes, ...(prev.circle.messages ?? [])] } };
    });
    requestAnimationFrame(() => { isPrependingRef.current = false; });
    qaLog("simulate_prepend", snap, false);
  };

  const members = circle!.members ?? [];
  const currentUserId = session!.user?.id;

  return (
    <SafeAreaView className="flex-1" edges={[]} style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Floating BlurView header chrome */}
      <CircleHeaderChrome
        circleName={circle.name}
        circleEmoji={circle.emoji}
        circlePhotoUrl={circle.photoUrl}
        members={members}
        insetsTop={insets.top}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onLayout={(h) => { if (h !== chromeHeight) setChromeHeight(h); }}
        onBack={() => router.back()}
        onOpenSettings={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowGroupSettings(true);
        }}
        onCreateEvent={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowCreateEvent(true);
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, paddingTop: chromeHeight }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Calendar Toggle */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCalendar(!showCalendar);
            setCalendarCollapsedByKeyboard(false);
          }}
          className="flex-row items-center justify-center py-2 border-b"
          style={{ borderColor: colors.border }}
        >
          <Calendar size={14} color={themeColor} />
          <Text className="text-sm font-medium ml-1.5" style={{ color: themeColor }}>
            {showCalendar ? "Hide" : "Show"} Calendar
          </Text>
          {showCalendar ? (
            <ChevronUp size={14} color={themeColor} style={{ marginLeft: 4 }} />
          ) : (
            <ChevronDown size={14} color={themeColor} style={{ marginLeft: 4 }} />
          )}
        </Pressable>

        {/* Mini Calendar */}
        {showCalendar && circle.memberEvents && (() => {
          const totalEvents = circle.memberEvents.reduce((sum, m) => sum + m.events.length, 0);
          
          if (totalEvents === 0) {
            return (
              <Animated.View entering={FadeInDown.duration(200)} className="px-4 pt-3 pb-4">
                <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: colors.surface }}>
                  <View
                    className="w-16 h-16 rounded-full items-center justify-center mb-3"
                    style={{ backgroundColor: colors.surfaceElevated }}
                  >
                    <Calendar size={24} color={colors.textTertiary} />
                  </View>
                  <Text className="text-base font-semibold mb-1" style={{ color: colors.text }}>
                    Nothing planned yet
                  </Text>
                  <Text className="text-center text-sm mb-4" style={{ color: colors.textSecondary }}>
                    Create the first event for this group
                  </Text>
                  <Button
                    variant="primary"
                    size="sm"
                    label="Create Event"
                    onPress={() => {
                      router.push({
                        pathname: "/create",
                        params: { circleId: id },
                      } as any);
                    }}
                  />
                </View>
              </Animated.View>
            );
          }
          
          return (
            <Animated.View entering={FadeInDown.duration(200)} className="px-4 pt-3">
              <MiniCalendar
                memberEvents={circle.memberEvents}
                members={members}
                themeColor={themeColor}
                colors={colors}
                isDark={isDark}
                circleId={id!}
                currentUserId={session?.user?.id ?? null}
              />
            </Animated.View>
          );
        })()}

        {/* [P1_LIFECYCLE_UI] Finalized Chip + Completion Prompt */}
        <CircleLifecycleChips
          lifecycleState={lifecycleState}
          lifecycleNote={lifecycleNote}
          planLockNote={planLock?.note}
          completionDismissed={completionDismissed}
          colors={colors}
          isDark={isDark}
          onFinalizedChipPress={() => {
            if (__DEV__) devLog("[P1_LIFECYCLE_UI]", "chip_render");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPlanLockDraftNote(planLock?.note ?? "");
            setShowPlanLockSheet(true);
          }}
          onRunItBack={() => {
            if (__DEV__) devLog("[P1_LIFECYCLE_UI]", "run_it_back");
            lifecycleMutation.mutate({ state: "planning" });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCompletionDismissed(true);
          }}
          onDismissCompletion={() => setCompletionDismissed(true)}
        />

        {/* [P1_AVAIL_SUMMARY_UI] Availability Summary Strip */}
        {availTonight && lifecycleState !== "finalized" && lifecycleState !== "completed" && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (__DEV__) devLog("[P1_AVAIL_SUMMARY_UI]", "tap_open");
              setShowAvailSheet(true);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderColor: colors.border,
              backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Tonight:</Text>
            <Text style={{ fontSize: 13, color: colors.text }}>{"\uD83D\uDFE2"} {availTonight.free}</Text>
            <Text style={{ fontSize: 13, color: colors.text }}>{"\uD83D\uDFE1"} {availTonight.busy}</Text>
            {(availTonight.tentative ?? 0) > 0 && (
              <Text style={{ fontSize: 13, color: colors.text }}>{"\uD83D\uDFE0"} {availTonight.tentative}</Text>
            )}
            <Text style={{ fontSize: 13, color: colors.text }}>{"\u26AA"} {availTonight.unknown}</Text>
            <ChevronRight size={14} color={colors.textTertiary} />
          </Pressable>
        )}

        {/* [P1_POLL_UI] Poll Strip — [P0_POLL_HIDDEN] gated off */}
        {(() => {
          const POLLS_ENABLED = false;
          if (!POLLS_ENABLED) return null;
          return polls && polls.length > 0 && lifecycleState !== "finalized" && lifecycleState !== "completed" && polls.map((poll, pIdx) => (
            <Pressable
              key={poll.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActivePollIdx(pIdx);
                // [P0_MODAL_GUARD] Close other sheets FIRST, then open poll
                // after a short delay. Two simultaneous Modals freeze iOS touch handling.
                if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_start", { from: "poll_strip", to: "poll", ms: 350 });
                setShowNotifySheet(false);
                setShowPlanLockSheet(false);
                setTimeout(() => {
                  setShowPollSheet(true);
                  if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_open_child", { from: "poll_strip", to: "poll", ms: 350 });
                  if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "sheet_open", { sheet: "poll", pollIdx: pIdx });
                }, 350);
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderColor: colors.border,
                backgroundColor: isDark ? "rgba(99,102,241,0.06)" : "rgba(99,102,241,0.04)",
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 3 }}>{"\uD83D\uDCCA"} Poll</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 }} numberOfLines={1}>{poll.question}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {poll.options.map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.selectionAsync();
                      voteMutation.mutate({ pollId: poll.id, optionId: opt.id });
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: opt.votedByMe ? themeColor : (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"),
                      backgroundColor: opt.votedByMe ? (themeColor + "18") : "transparent",
                      gap: 4,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: opt.votedByMe ? "600" : "400", color: opt.votedByMe ? themeColor : colors.text }}>{opt.label}</Text>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: opt.votedByMe ? themeColor : colors.textTertiary }}>({opt.count})</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          ));
        })()}

        {/* [P1_NEXT_EVENT_ANCHOR] Collapsible next-event anchor */}
        {nextCircleEvent && (
          <CircleNextEventCard
            event={nextCircleEvent}
            expanded={upNextExpanded}
            colors={colors}
            isDark={isDark}
            themeColor={themeColor}
            onToggleExpand={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setUpNextExpanded((v) => !v);
            }}
            onNavigateToEvent={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/event/${nextCircleEvent.id}` as any);
            }}
          />
        )}

        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={11}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          removeClippedSubviews={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={themeColor} />
          }
          ListHeaderComponent={
            hasMoreOlder ? (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <Pressable
                  onPress={fetchOlderMessages}
                  disabled={isLoadingEarlier}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 16,
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {isLoadingEarlier ? (
                    <>
                      <ActivityIndicator size="small" color={colors.textTertiary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>
                        Loading earlier…
                      </Text>
                    </>
                  ) : (
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>
                      Load earlier messages
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="py-12 items-center">
              <Users size={40} color={colors.textTertiary} />
              <Text className="mt-4 text-center" style={{ color: colors.textSecondary }}>
                Start planning your next hangout!
              </Text>
              <Text className="mt-1 text-center text-sm" style={{ color: colors.textTertiary }}>
                Send a message or create an event
              </Text>
            </View>
          }
          ListFooterComponent={
            hasPending ? (
              <View className="flex-row items-center justify-center py-2" style={{ gap: 6 }}>
                <ActivityIndicator size="small" color={colors.textTertiary} />
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>Sending…</Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            // -- Run grouping: consecutive same-sender within 2 min --
            const RUN_WINDOW_MS = 120_000;
            const isGroupable = (m: any) => !!m?.userId && !!m?.user && !m.content?.startsWith("\u{1F4C5}") && !m.content?.startsWith("__system:");
            const prev = index > 0 ? messages[index - 1] : null;
            const isRunContinuation =
              !!prev &&
              isGroupable(prev) &&
              isGroupable(item) &&
              prev.userId === item.userId &&
              Math.abs(new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime()) <= RUN_WINDOW_MS;

            const isFailedOptimistic = (item as any).status === "failed" && (item as any).id?.startsWith("optimistic-");

            // [P0_CIRCLE_LIST_REFRESH] Invalidate circle list when a member_left pill renders
            if (
              item.content?.startsWith("__system:member_left:") &&
              !memberLeftSeenRef.current.has(item.id)
            ) {
              memberLeftSeenRef.current.add(item.id);
              refreshCircleListContract({
                reason: "system_member_left_render",
                circleId: id,
                queryClient,
              });
            }

            const handleCopy = async () => {
              try {
                await Clipboard.setStringAsync(item.content);
                safeToast.success("Copied", "Message text copied");
                if (__DEV__) devLog("[P1_MSG_ACTIONS]", "copy", { id: item.id });
              } catch { safeToast.error("Copy Failed", "Could not copy text"); }
            };

            const handleRetry = () => {
              retryFailedMessage(
                id,
                (item as any).id,
                queryClient,
                () => sendMessageMutation.mutate({
                  content: item.content,
                  clientMessageId: (item as any).clientMessageId ?? `cmi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                }),
              );
              if (__DEV__) devLog("[P1_MSG_ACTIONS]", "retry", { id: item.id, clientMessageId: (item as any).clientMessageId });
            };

            const handleRemove = () => {
              queryClient.setQueryData(circleKeys.single(id), (prev: any) => {
                if (!prev?.circle?.messages) return prev;
                return {
                  ...prev,
                  circle: { ...prev.circle, messages: prev.circle.messages.filter((m: any) => m.id !== item.id) },
                };
              });
              if (__DEV__) devLog("[P1_MSG_ACTIONS]", "remove", { id: item.id });
            };

            const handleLongPress = () => {
              if (!item.content || item.content.startsWith("📅") || item.content.startsWith("__system:")) return;
              const isOwnMsg = item.userId === currentUserId;
              const isDeletedMsg = !!deletedStableIds[item.id ?? (item as any).clientMessageId];
              // Guard: no actions on deleted messages except Copy
              if (isDeletedMsg) return;
              if (__DEV__) devLog("[P1_MSG_ACTIONS]", "open_actions", { id: item.id, status: (item as any).status });

              if (Platform.OS === "ios") {
                const options = ["Reply", "Add Reaction", "Copy Text"];
                if (isOwnMsg && !isFailedOptimistic) { options.push("Edit Message"); options.push("Delete Message"); }
                if (isFailedOptimistic && (item as any).clientMessageId) options.push("Retry Send");
                if (isFailedOptimistic) options.push("Remove Failed Message");
                options.push("Cancel");
                const destructiveIdx = Math.max(options.indexOf("Remove Failed Message"), options.indexOf("Delete Message"));
                ActionSheetIOS.showActionSheetWithOptions(
                  { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: destructiveIdx },
                  (idx) => {
                    const picked = options[idx];
                    if (picked === "Reply") {
                      // Guard: can't reply to optimistic messages that haven't been persisted
                      if (!item.id || item.id.startsWith("optimistic-")) {
                        safeToast.warning("Hold on", "Can't reply until sent");
                        return;
                      }
                      const senderName = item.user?.name?.split(" ")[0] ?? "Unknown";
                      const snippet = item.content.slice(0, 80).replace(/\n/g, " ");
                      setReplyTarget({ messageId: item.id, userId: item.userId, name: senderName, snippet });
                      if (__DEV__) devLog("[P2_CHAT_REPLY_UI2]", "set", { messageId: item.id });
                      inputRef.current?.focus();
                    }
                    else if (picked === "Add Reaction") {
                      if (__DEV__) devLog("[P2_CHAT_REACTIONS]", "open_picker", { messageId: stableId });
                      setReactionTargetId(stableId);
                    }
                    else if (picked === "Copy Text") handleCopy();
                    else if (picked === "Edit Message") {
                      const existing = editedContentByStableId[stableId];
                      setEditDraftContent(existing?.content ?? item.content);
                      setEditTargetId(stableId);
                      if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "edit_open", { messageId: stableId });
                    }
                    else if (picked === "Delete Message") {
                      if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "delete_confirm", { messageId: stableId });
                      Alert.alert("Delete Message", "This message will be removed from your view.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => {
                          setDeletedStableIds((prev) => ({ ...prev, [stableId]: true }));
                          if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "delete_apply", { messageId: stableId });
                        }},
                      ]);
                    }
                    else if (picked === "Retry Send") handleRetry();
                    else if (picked === "Remove Failed Message") handleRemove();
                  },
                );
              } else {
                // non-iOS: use a simple alert-style approach with Modal state
                // For simplicity and zero-dep constraint, use built-in Alert
                const buttons: Array<{ text: string; onPress: () => void; style?: "cancel" | "destructive" | "default" }> = [
                  { text: "Reply", onPress: () => {
                    // Guard: can't reply to optimistic messages that haven't been persisted
                    if (!item.id || item.id.startsWith("optimistic-")) {
                      safeToast.warning("Hold on", "Can't reply until sent");
                      return;
                    }
                    const senderName = item.user?.name?.split(" ")[0] ?? "Unknown";
                    const snippet = item.content.slice(0, 80).replace(/\n/g, " ");
                    setReplyTarget({ messageId: item.id, userId: item.userId, name: senderName, snippet });
                    if (__DEV__) devLog("[P2_CHAT_REPLY_UI2]", "set", { messageId: item.id });
                    inputRef.current?.focus();
                  }},
                  { text: "Add Reaction", onPress: () => {
                    if (__DEV__) devLog("[P2_CHAT_REACTIONS]", "open_picker", { messageId: stableId });
                    setReactionTargetId(stableId);
                  }},
                  { text: "Copy Text", onPress: handleCopy },
                ];
                if (isOwnMsg && !isFailedOptimistic) {
                  buttons.push({ text: "Edit Message", onPress: () => {
                    const existing = editedContentByStableId[stableId];
                    setEditDraftContent(existing?.content ?? item.content);
                    setEditTargetId(stableId);
                    if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "edit_open", { messageId: stableId });
                  }});
                  buttons.push({ text: "Delete Message", style: "destructive", onPress: () => {
                    if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "delete_confirm", { messageId: stableId });
                    Alert.alert("Delete Message", "This message will be removed from your view.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => {
                        setDeletedStableIds((prev) => ({ ...prev, [stableId]: true }));
                        if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "delete_apply", { messageId: stableId });
                      }},
                    ]);
                  }});
                }
                if (isFailedOptimistic && (item as any).clientMessageId) {
                  buttons.push({ text: "Retry Send", onPress: handleRetry });
                }
                if (isFailedOptimistic) {
                  buttons.push({ text: "Remove Failed Message", onPress: handleRemove, style: "destructive" });
                }
                buttons.push({ text: "Cancel", style: "cancel", onPress: () => {} });
                Alert.alert("Message", undefined, buttons);
              }
            };

            const stableId = item.id ?? (item as any).clientMessageId;
            const showTimestamp = !isRunContinuation || activeTimestampId === stableId;

            // -- Date separator: show pill when calendar day changes --
            let showDateSep = false;
            if (!prev) {
              showDateSep = true;
            } else {
              const prevDay = new Date(prev.createdAt);
              const curDay = new Date(item.createdAt);
              showDateSep =
                prevDay.getFullYear() !== curDay.getFullYear() ||
                prevDay.getMonth() !== curDay.getMonth() ||
                prevDay.getDate() !== curDay.getDate();
            }

            return (
              <>
                {showDateSep && (
                  <View style={{ alignItems: "center", marginVertical: 12 }}>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 10,
                        backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                      }}
                    >
                      <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: "500" }}>
                        {formatDateSeparator(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                )}
                <MessageBubble
                message={item}
                isOwn={item.userId === currentUserId}
                themeColor={themeColor}
                colors={colors}
                isDark={isDark}
                isRunContinuation={isRunContinuation}
                showTimestamp={showTimestamp}
                onPress={() => handleBubbleTap(stableId)}
                onRetry={isFailedOptimistic
                  ? handleRetry
                  : undefined
                }
                onLongPress={handleLongPress}
                reactions={stableId ? reactionsByStableId[stableId] : undefined}
                editedContent={stableId ? editedContentByStableId[stableId]?.content : undefined}
                isDeleted={stableId ? !!deletedStableIds[stableId] : false}
                eventMeta={(() => {
                  const parsed = parseSystemEventPayload(item.content);
                  return parsed ? circleEventMetaMap[parsed.eventId] ?? null : null;
                })()}
                onViewEvent={(eventId) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/event/${eventId}` as any);
                }}
              />
              </>
            );
          }}
        />

        {/* Chat overlays: scroll-to-bottom, new messages pill, failed banner, typing */}
        <CircleChatOverlays
          showScrollToBottom={showScrollToBottom}
          unseenCount={unseenCount}
          hasFailed={hasFailed}
          failedBannerVisible={!!latestFailed}
          typingNames={typingUserIds.map((uid) => {
            const m = members.find((mb) => mb.userId === uid);
            return m?.user?.name ?? "Someone";
          })}
          colors={colors}
          isDark={isDark}
          onScrollToBottom={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            flatListRef.current?.scrollToEnd({ animated: true });
            if (__DEV__) devLog("[P2_CHAT_SCROLL_BTN]", "tap", {});
          }}
          onPillTap={() => {
            if (__DEV__) devLog("[P1_CHAT_PILL]", "pill_tap", { unseen: unseenCount });
            clearUnseen();
            scheduleAutoScroll();
            sendReadHorizon("pill_tap");
            if (__DEV__) devLog("[P1_CHAT_PILL]", "pill_clear", { reason: "tap" });
          }}
          onRetryFailed={() => {
            if (!latestFailed) return;
            const cmi = latestFailed.clientMessageId;
            if (!cmi) {
              safeToast.error("Retry Failed", "Cannot retry this message");
              return;
            }
            if (__DEV__) devLog("[P1_CHAT_SEND_UI]", "retry_from_banner", { failedId: latestFailed.id, clientMessageId: cmi });
            retryFailedMessage(
              id,
              latestFailed.id,
              queryClient,
              () => sendMessageMutation.mutate({
                content: latestFailed.content,
                clientMessageId: cmi,
              }),
            );
          }}
        />

        {/* [P2_CHAT_REPLY] Reply preview bar */}
        {replyTarget && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderTopWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <View style={{ width: 3, borderRadius: 1.5, backgroundColor: themeColor, alignSelf: "stretch", marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: themeColor }} numberOfLines={1}>
                Replying to {replyTarget.name}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
                {replyTarget.snippet}
              </Text>
            </View>
            <Pressable
              onPress={() => clearReplyTarget("x")}
              hitSlop={8}
              style={{ padding: 4, marginLeft: 8 }}
            >
              <X size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        )}

        {/* Message Input */}
        {showTryAnother && draftVariants && draftVariants.length > 1 && (
          <View className="px-4 py-1.5 border-t flex-row items-center" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
            <RefreshCw size={12} color={colors.textTertiary} />
            <Pressable
              onPress={() => {
                variantIndexRef.current = (variantIndexRef.current + 1) % draftVariants.length;
                setMessage(draftVariants[variantIndexRef.current]!);
                Haptics.selectionAsync();
                if (__DEV__) devLog("[P1_DRAFT_VARIANTS]", { idx: variantIndexRef.current, total: draftVariants.length });
              }}
              hitSlop={8}
            >
              <Text className="text-[12px] font-medium ml-1.5" style={{ color: themeColor }}>Try another message</Text>
            </Pressable>
          </View>
        )}
        <View
          className="px-4 py-3 border-t flex-row items-end"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <View
            className="flex-1 flex-row items-end rounded-2xl px-4 py-2 mr-2"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6", minHeight: 44, maxHeight: 100 }}
          >
            <TextInput
              ref={inputRef}
              value={message}
              onChangeText={(text) => {
                setMessage(text);
                if (text.trim().length > 0) setTyping(true);
                else setTyping(false);
              }}
              onBlur={() => {
                setTyping(false);
                if (replyTarget && !message.trim()) clearReplyTarget("blur");
              }}
              placeholder="Message..."
              placeholderTextColor={colors.textTertiary}
              multiline
              className="flex-1 py-1"
              style={{ color: colors.text, fontSize: 16, maxHeight: 80 }}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!message.trim() || sendMessageMutation.isPending}
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{
              backgroundColor: message.trim() ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB",
              opacity: !message.trim() || sendMessageMutation.isPending ? 0.5 : 1,
            }}
          >
            <MessageCircle
              size={18}
              color={message.trim() ? "#fff" : colors.textTertiary}
              style={{ marginLeft: 2 }}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Add Members Modal */}
      <CircleAddMembersModal
        visible={showAddMembers}
        availableFriends={availableFriends}
        selectedFriends={selectedFriends}
        isPending={addMembersMutation.isPending}
        selectedCount={selectedFriends.length}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onClose={() => {
          setShowAddMembers(false);
          setSelectedFriends([]);
        }}
        onToggleFriend={toggleFriendSelection}
        onAddMembers={handleAddMembers}
      />

      {/* Friend Suggestion Modal */}
      <CircleFriendSuggestionModal
        visible={showFriendSuggestionModal}
        suggestions={friendSuggestions}
        colors={colors}
        themeColor={themeColor}
        onClose={() => setShowFriendSuggestionModal(false)}
      />

      {/* [P1_AVAIL_SUMMARY_UI] Availability Roster Sheet */}
      <CircleAvailabilitySheet
        visible={showAvailSheet}
        availTonight={availTonight}
        availMembers={availMembers}
        circleMembers={members}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onClose={() => setShowAvailSheet(false)}
      />

      {/* [P1_PLAN_LOCK_UI] Plan Lock Sheet */}
      <CirclePlanLockSheet
        visible={showPlanLockSheet}
        isLocked={planLock?.locked ?? false}
        draftNote={planLockDraftNote}
        isHost={isHost}
        isPending={planLockMutation.isPending}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onClose={() => setShowPlanLockSheet(false)}
        onDraftNoteChange={setPlanLockDraftNote}
        onToggleLock={(val) => {
          if (__DEV__) devLog("[P1_PLAN_LOCK_UI]", "toggle", { locked: val });
          planLockMutation.mutate({ locked: val, note: planLockDraftNote.trim() });
        }}
        onSave={() => {
          if (__DEV__) devLog("[P1_PLAN_LOCK_UI]", "save", { locked: planLock?.locked ?? false, note: planLockDraftNote.trim() });
          planLockMutation.mutate({ locked: planLock?.locked ?? false, note: planLockDraftNote.trim() });
          setShowPlanLockSheet(false);
        }}
        onUnlock={async () => {
          if (__DEV__) devLog("[P1_LOCK_POLISH]", "unlock_attempt");
          try {
            await api.post(`/api/circles/${id}/plan-lock`, { locked: false, note: "" });
            queryClient.invalidateQueries({ queryKey: circleKeys.planLock(id!) });
            if (__DEV__) devLog("[P1_LOCK_POLISH]", "unlock_success");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setShowPlanLockSheet(false);
          } catch (e: any) {
            if (__DEV__) devLog("[P1_LOCK_POLISH]", "unlock_error", { status: e?.status ?? "unknown" });
            safeToast.error("Unlock Failed", "Failed to unlock plan");
          }
        }}
      />

      {/* [P1_POLL_UI] Poll Detail Sheet */}
      <CirclePollSheet
        visible={showPollSheet}
        title={polls?.[activePollIdx]?.question ?? "Poll"}
        options={polls?.[activePollIdx]?.options}
        isLocked={planLock?.locked ?? false}
        isHost={isHost}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onClose={() => { setShowPollSheet(false); if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "sheet_close", { sheet: "poll" }); }}
        onVote={(optionId) => {
          Haptics.selectionAsync();
          voteMutation.mutate({ pollId: polls![activePollIdx].id, optionId });
        }}
        onLockWithWinner={async (winnerLabel) => {
          const activePoll = polls?.[activePollIdx];
          if (!activePoll) return;
          const note = `Locked plan: ${winnerLabel}`;
          const winner = activePoll.options.find((o: any) => o.label === winnerLabel);
          if (__DEV__) devLog("[P1_POLL_LOCK_BRIDGE]", "bridge_attempt", { pollId: activePoll.id, winnerId: winner?.id, winnerLabel, note });
          try {
            await api.post(`/api/circles/${id}/plan-lock`, { locked: true, note });
            queryClient.invalidateQueries({ queryKey: circleKeys.planLock(id!) });
            queryClient.invalidateQueries({ queryKey: circleKeys.polls(id!) });
            queryClient.invalidateQueries({ queryKey: circleKeys.availabilitySummary(id!) });
            if (__DEV__) devLog("[P1_POLL_LOCK_BRIDGE]", "bridge_success", { note });
            if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "bridge_lock_success", { pollId: activePoll.id, winner: winnerLabel });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setShowPollSheet(false);
          } catch (e: any) {
            if (__DEV__) devLog("[P1_POLL_LOCK_BRIDGE]", "bridge_error", { status: e?.status ?? "unknown" });
            if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "bridge_lock_error", { status: e?.status ?? "unknown" });
            safeToast.error("Lock Failed", "Failed to lock plan");
          }
        }}
      />

      {/* [P0_CIRCLE_INFO] Info Sheet */}
      <BottomSheet
        visible={showInfoSheet}
        onClose={() => {
          setShowInfoSheet(false);
          if (__DEV__) devLog("[P1_CIRCLE_INFO_OPEN]", "closed");
        }}
        heightPct={0}
        maxHeightPct={0.5}
        backdropOpacity={0.5}
        title="Everyone's Free"
      >
        <ScrollView style={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
            Based on events in Open Invite. If someone hasn't added their plans yet, their schedule may look more open than it really is. Encourage your circle to add events for more accurate times.
          </Text>
          {__DEV__ && (
            <Text style={{ fontSize: 10, marginTop: 12, color: colors.textTertiary, fontStyle: "italic" }}>
              [P0_FREE_INFO_COPY]
            </Text>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Circle Settings Sheet */}
      <CircleSettingsSheet
        visible={showGroupSettings}
        circleName={circle?.name}
        circleEmoji={circle?.emoji}
        circlePhotoUrl={circle?.photoUrl}
        circleDescription={circle?.description}
        isMuted={circle?.isMuted ?? false}
        memberCount={members.length}
        settingsView={settingsSheetView}
        isHost={isHost}
        editingDescription={editingDescription}
        descriptionText={descriptionText}
        uploadingPhoto={uploadingPhoto}
        isMutePending={muteMutation.isPending}
        isSaveDescriptionPending={updateCircleMutation.isPending}
        notifyLevel={notifyLevel}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onClose={() => { setShowGroupSettings(false); setSettingsSheetView("settings"); }}
        onSetView={setSettingsSheetView}
        onEditDescription={() => {
          setDescriptionText(circle?.description ?? "");
          setEditingDescription(true);
        }}
        onCancelEditDescription={() => setEditingDescription(false)}
        onDescriptionChange={setDescriptionText}
        onSaveDescription={() => {
          const newDescription = descriptionText.trim() || undefined;
          updateCircleMutation.mutate({ description: newDescription ?? "" });
        }}
        onMuteToggle={(value) => {
          if (__DEV__) devLog("[P0_MUTE_TOGGLE]", "toggle_press", { circleId: id, userId: session?.user?.id, desiredValue: value, currentValue: circle?.isMuted, sourceField: "circle?.isMuted via circleKeys.single" });
          if (muteMutation.isPending) {
            if (__DEV__) devLog('[P1_DOUBLE_SUBMIT_GUARD]', 'circleMute ignored, circleId=' + id);
            return;
          }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          muteMutation.mutate(value);
        }}
        onShareGroup={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          trackInviteShared({ entity: "circle", sourceScreen: "circle_detail" });
          const cp = buildCircleSharePayload(circle?.name ?? "my group", id);
          Share.share({ message: cp.message, title: cp.title }).catch(() => {});
        }}
        onOpenMembers={() => {
          // [P0_MODAL_GUARD] Close settings FIRST, then open members
          if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_start", { from: "settings", to: "members", ms: 350 });
          setShowGroupSettings(false);
          setTimeout(() => {
            setShowMembersSheet(true);
            if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_open_child", { from: "settings", to: "members", ms: 350 });
          }, 350);
        }}
        onOpenNotifyLevel={() => {
          if (__DEV__) devLog("[P0_CIRCLE_SETTINGS]", "notify_level_tap");
          setShowPollSheet(false);
          setShowGroupSettings(false);
          setTimeout(() => {
            setShowNotifySheet(true);
            if (__DEV__) devLog("[P0_CIRCLE_SETTINGS]", "notify_sheet_opened");
          }, 350);
        }}
        onLeaveGroup={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setShowGroupSettings(false);
          router.back();
          safeToast.info("Leave Group", "To leave this group, swipe left on it in your Friends tab.");
        }}
        onUploadPhoto={async () => {
          if (uploadingPhoto) return;
          setShowGroupSettings(false);
          setSettingsSheetView("settings");
          await new Promise(r => setTimeout(r, 300));
          try {
            if (__DEV__) devLog('[CIRCLE_PHOTO_PICK_START]');
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== "granted") {
              safeToast.warning("Permission Required", "Please allow access to your photos.");
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (result.canceled || !result.assets?.[0]) {
              if (__DEV__) devLog('[CIRCLE_PHOTO_PICK_CANCEL]');
              return;
            }
            if (__DEV__) devLog('[CIRCLE_PHOTO_PICK_OK]', { uri: result.assets[0].uri.slice(-30) });
            setUploadingPhoto(true);
            const uploadResult = await uploadCirclePhoto(result.assets[0].uri);
            if (__DEV__) devLog('[CIRCLE_PHOTO_SAVE]', { photoUrl: uploadResult.url, photoPublicId: uploadResult.publicId ?? null });
            await api.put(`/api/circles/${id}`, { photoUrl: uploadResult.url, photoPublicId: uploadResult.publicId });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            safeToast.success("Saved", "Circle photo updated");
            queryClient.invalidateQueries({ queryKey: circleKeys.single(id) });
            queryClient.invalidateQueries({ queryKey: circleKeys.all() });
          } catch (error: any) {
            if (__DEV__) devError("[CIRCLE_PHOTO]", "upload failed", error);
            safeToast.error("Upload Failed", error?.message || "Please try again.");
          } finally {
            setUploadingPhoto(false);
          }
        }}
        onRemovePhoto={async () => {
          try {
            await api.put(`/api/circles/${id}`, { photoUrl: null, photoPublicId: null });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            safeToast.success("Removed", "Circle photo removed");
            queryClient.invalidateQueries({ queryKey: circleKeys.single(id) });
            queryClient.invalidateQueries({ queryKey: circleKeys.all() });
          } catch (error: any) {
            if (__DEV__) devError("[CIRCLE_PHOTO]", "remove failed", error);
            safeToast.error("Remove Failed", "Failed to remove photo.");
          }
          setSettingsSheetView("settings");
        }}
      />

      {/* [P1_NOTIFY_LEVEL_UI] Notification Level Sheet */}
      <CircleNotifyLevelSheet
        visible={showNotifySheet}
        currentLevel={notifyLevel}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onClose={() => { setShowNotifySheet(false); if (__DEV__) devLog("[P1_POLLS_E2E_UI]", "sheet_close", { sheet: "notification_level" }); }}
        onSelect={(level) => {
          if (__DEV__) devLog("[P1_NOTIFY_LEVEL_UI]", "select", { level });
          Haptics.selectionAsync();
          notifyLevelMutation.mutate(level);
        }}
      />

      {/* Members Sheet Modal */}
      <CircleMembersSheet
        visible={showMembersSheet}
        members={members}
        availableFriends={availableFriends}
        selectedFriends={selectedFriends}
        isHost={isHost}
        circleCreatedById={circle?.createdById}
        isPending={addMembersMutation.isPending}
        selectedCount={selectedFriends.length}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        bottomInset={insets.bottom}
        onClose={() => {
          setShowMembersSheet(false);
          setSelectedFriends([]);
        }}
        onToggleFriend={toggleFriendSelection}
        onAddMembers={handleAddMembers}
        onRemoveMember={(userId) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (__DEV__) {
            const member = members.find(m => m.userId === userId);
            devLog('[CircleRemoveMember] Trash pressed, member snapshot:', {
              memberId: member?.id,
              memberUserId: userId,
              memberUserIdFromUser: member?.user?.id,
              memberName: member?.user?.name,
              circleId: id,
            });
          }
          if (!userId) {
            devError('[CircleRemoveMember] ERROR: No userId found for member');
            safeToast.error("Member Not Found", "Unable to identify member. Please try again.");
            return;
          }
          setShowMembersSheet(false);
          setTimeout(() => {
            setSelectedMemberToRemove(userId);
          }, 100);
        }}
        onViewProfile={(userId) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowMembersSheet(false);
          setSelectedFriends([]);
          router.push(`/user/${userId}`);
        }}
      />

      {/* Remove Member Confirmation Modal */}
      <CircleRemoveMemberModal
        visible={!!selectedMemberToRemove}
        memberName={members.find(m => m.userId === selectedMemberToRemove)?.user.name ?? null}
        isPending={removeMemberMutation.isPending}
        colors={colors}
        isDark={isDark}
        onCancel={() => setSelectedMemberToRemove(null)}
        onConfirm={() => {
          if (selectedMemberToRemove) {
            if (__DEV__) {
              devLog('[CircleRemoveMember] Confirm pressed:', {
                circleId: id,
                memberUserIdToRemove: selectedMemberToRemove,
                apiPath: `/api/circles/${id}/members/${selectedMemberToRemove}`,
              });
            }
            removeMemberMutation.mutate(selectedMemberToRemove);
          }
        }}
      />

      {/* Create Event Modal */}
      <CircleCreateEventModal
        visible={showCreateEvent}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onClose={() => setShowCreateEvent(false)}
        onCreatePress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowCreateEvent(false);
          router.push(`/create?circleId=${id}&visibility=circle_only` as any);
        }}
      />

      {/* Paywall Modal for member limit gating */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
      />

      {/* [P2_CHAT_EDITDEL] Edit message overlay */}
      <CircleEditMessageOverlay
        visible={editTargetId !== null}
        draftContent={editDraftContent}
        colors={colors}
        isDark={isDark}
        themeColor={themeColor}
        onClose={() => { setEditTargetId(null); setEditDraftContent(""); }}
        onChangeText={setEditDraftContent}
        onSave={() => {
          const trimmed = editDraftContent.trim();
          if (!trimmed) {
            safeToast.error("Message Empty", "Message cannot be empty");
            return;
          }
          setEditedContentByStableId((prev) => ({ ...prev, [editTargetId!]: { content: trimmed, editedAt: Date.now() } }));
          if (__DEV__) devLog("[P2_CHAT_EDITDEL]", "edit_save", { messageId: editTargetId });
          setEditTargetId(null);
          setEditDraftContent("");
        }}
      />

      {/* [P2_CHAT_REACTIONS] Emoji reaction picker overlay */}
      <CircleReactionPicker
        visible={reactionTargetId !== null}
        selectedReactions={reactionTargetId !== null ? (reactionsByStableId[reactionTargetId] ?? []) : []}
        isDark={isDark}
        onClose={() => setReactionTargetId(null)}
        onSelect={(emoji) => {
          setReactionsByStableId((prev) => {
            const existing = prev[reactionTargetId!] ?? [];
            const next = existing.includes(emoji)
              ? existing.filter((e) => e !== emoji)
              : [...existing, emoji];
            if (__DEV__) devLog("[P2_CHAT_REACTIONS]", existing.includes(emoji) ? "clear" : "select", { emoji, messageId: reactionTargetId });
            return { ...prev, [reactionTargetId!]: next };
          });
          setReactionTargetId(null);
        }}
      />

      {/* ─── [P0_CHAT_ANCHOR] DEV-only Chat QA Panel ─── */}
      {__DEV__ && (
        <View style={{ position: "absolute", top: insets.top + 56, right: 8, zIndex: 9999 }} pointerEvents="box-none">
          <Pressable
            onPress={() => setQaExpanded(p => !p)}
            style={{
              backgroundColor: "rgba(220,38,38,0.9)",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
              alignSelf: "flex-end",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
              {qaExpanded ? "\u25BC QA" : "\u25B6 QA"}
            </Text>
          </Pressable>
          {qaExpanded && (
            <View style={{
              backgroundColor: isDark ? "rgba(30,30,32,0.97)" : "rgba(255,255,255,0.97)",
              borderRadius: 12,
              padding: 8,
              marginTop: 4,
              width: 200,
              maxHeight: 400,
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 10,
            }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {([
                  { label: "+1 msg", fn: () => qaInjectMessages(1) },
                  { label: "+3 msgs", fn: () => qaInjectMessages(3) },
                  { label: "+10 msgs", fn: () => qaInjectMessages(10) },
                  { label: "\u2328 Typing 0\u21942\u21940", fn: qaToggleTyping },
                  { label: "\u2717 Failed banner", fn: qaToggleFailed },
                  { label: "\u23F3 Pending footer", fn: qaTogglePending },
                  { label: "\uD83D\uDC4D Reactions", fn: qaToggleReactions },
                  { label: "\u21A9 Reply preview", fn: qaToggleReply },
                  { label: "\u270E Edit indicator", fn: qaToggleEdit },
                  { label: "\uD83D\uDDD1 Delete tombstone", fn: qaToggleDelete },
                  { label: "\u2B06 Prepend 5 old", fn: qaSimulatePrepend },
                ] as const).map(({ label, fn }) => (
                  <Pressable
                    key={label}
                    onPress={fn}
                    style={{
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                      borderRadius: 6,
                      marginBottom: 3,
                      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500" }}>{label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
