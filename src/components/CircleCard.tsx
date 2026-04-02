import React from "react";
import { View, Text, Pressable, AccessibilityInfo } from "react-native";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useRouter } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Pin, Trash2, Bell, BellOff } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { type Circle } from "@/shared/contracts";
import { CirclePhotoEmoji } from "@/components/CirclePhotoEmoji";
import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { devLog, devError } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";
import { trackAnalytics } from "@/lib/entitlements";
import { circleKeys } from "@/lib/circleQueryKeys";
import { STATUS } from "@/ui/tokens";

/** Format timestamp like iMessage: time today, day name this week, date otherwise */
function formatInboxTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Today → "3:42 PM"
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  // Within 7 days → "Monday"
  if (diffDays < 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }
  // Older → "3/10/26"
  return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}

/** Convert raw system message content to human-readable inbox preview text. */
function humanizePreview(text: string): string {
  // __system:event_created:{JSON} → "Created event: {title}"
  if (text.startsWith("__system:event_created:")) {
    try {
      const payload = JSON.parse(text.slice("__system:event_created:".length));
      if (payload?.title) return `Created event: ${payload.title}`;
    } catch { /* fall through */ }
    return "New activity";
  }
  // __system:member_left:{JSON} → "{name} left" / "{name} was removed"
  if (text.startsWith("__system:member_left:")) {
    try {
      const payload = JSON.parse(text.slice("__system:member_left:".length));
      if (payload?.name) {
        return payload.type === "member_removed"
          ? `${payload.name} was removed`
          : `${payload.name} left the circle`;
      }
    } catch { /* fall through */ }
    return "New activity";
  }
  // Catch-all for any future __system: prefix
  if (text.startsWith("__system:")) return "New activity";
  return text;
}

interface CircleCardProps {
  circle: Circle;
  onPin: (circleId: string) => void;
  onDelete: (circleId: string) => void;
  onMute?: (circleId: string, isMuted: boolean) => void;
  index: number;
  /** Per-circle unread count from circleKeys.unreadCount() overlay */
  unreadCount?: number;
}

// ── SSOT swipe constants ──────────────────────────────────────
const ACTION_WIDTH_PX = 72;          // single action pill width
const OPEN_LEFT_PX   = ACTION_WIDTH_PX;  // delete reveal distance
const OPEN_RIGHT_PX  = ACTION_WIDTH_PX;  // pin reveal distance
const THRESH_OPEN_PX = 28;               // drag distance to snap open
// ──────────────────────────────────────────────────────────────

export function CircleCard({ circle, onPin, onDelete, onMute, index, unreadCount = 0 }: CircleCardProps) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  // [P1_CIRCLES_SWIPE_UI] Define actions in strict order: Pin, Mute, Delete
  const swipeActions = React.useMemo(() => [
    { type: 'pin' as const, label: circle.isPinned ? 'Unpin' : 'Pin', color: STATUS.going.fg },
    { type: 'mute' as const, label: circle.isMuted ? 'Unmute' : 'Mute', color: circle.isMuted ? STATUS.going.fg : STATUS.warning.fg },
    { type: 'delete' as const, label: 'Delete', color: STATUS.destructive.fg },
  ], [circle.isPinned, circle.isMuted]);

  // [P1_CIRCLES_RENDER] Proof log: card render with state
  if (__DEV__) {
    devLog("[P1_CIRCLES_RENDER]", "card render", {
      id: circle.id.slice(0, 6),
      name: circle.name,
      isPinned: circle.isPinned ?? false,
      isMuted: circle.isMuted ?? false,
      index,
    });
    devLog("[P1_CIRCLES_SWIPE_UI]", "actionsOrder", {
      circleId: circle.id.slice(0, 6),
      actions: swipeActions.map(a => a.type),
    });
  }

  // Ensure members is always an array to prevent crashes
  const members = circle.members ?? [];

  const translateX = useSharedValue(0);
  const isSwipingLeft = useSharedValue(false);
  const isSwipingRight = useSharedValue(false);

  // Mute mutation with optimistic update
  const muteMutation = useMutation({
    mutationFn: async ({ circleId, isMuted }: { circleId: string; isMuted: boolean }) => {
      return api.post(`/api/circles/${circleId}/mute`, { isMuted });
    },
    onMutate: async ({ circleId, isMuted }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: circleKeys.all() });
      
      // Snapshot the previous value
      const previousCircles = queryClient.getQueryData(circleKeys.all());
      
      // Optimistically update
      queryClient.setQueryData(circleKeys.all(), (old: any) => {
        if (!old?.circles) return old;
        return {
          ...old,
          circles: old.circles.map((c: Circle) =>
            c.id === circleId ? { ...c, isMuted } : c
          ),
        };
      });
      
      return { previousCircles };
    },
    onSuccess: (_, { circleId, isMuted }) => {
      devLog("[P1_CIRCLES_CARD]", "action=success", "type=mute", `circleId=${circleId}`, `muted=${isMuted}`);
      // [P0_CIRCLE_MUTE_POLISH] Light selection haptic on success
      Haptics.selectionAsync();
      if (__DEV__) {
        devLog("[P0_CIRCLE_MUTE_POLISH]", {
          circleId,
          prevMuted: !isMuted,
          nextMuted: isMuted,
          entryPoint: "swipe",
          success: true,
        });
        devLog("[P0_CIRCLE_MUTE_ANALYTICS]", {
          eventName: "circle_mute_toggle",
          payload: { circleId, nextMuted: isMuted, entryPoint: "swipe" },
        });
      }
      trackAnalytics("circle_mute_toggle", {
        circleId,
        nextMuted: isMuted,
        entryPoint: "swipe",
      });
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
    },
    onError: (error, { circleId, isMuted }, context) => {
      devError("[P1_CIRCLES_CARD]", "action=failure", "type=mute", `circleId=${circleId}`, `error=${error}`);
      // Revert optimistic update
      if (context?.previousCircles) {
        queryClient.setQueryData(circleKeys.all(), context.previousCircles);
      }
      if (__DEV__) {
        devLog("[P0_CIRCLE_MUTE_POLISH]", {
          circleId,
          prevMuted: !isMuted,
          nextMuted: isMuted,
          entryPoint: "swipe",
          success: false,
        });
      }
      safeToast.error("Oops", "Could not update mute setting");
    },
  });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/circle/${circle.id}` as any);
  };

  const triggerPin = () => {
    devLog("[P1_CIRCLES_CARD]", "action=tap", "type=pin", `circleId=${circle.id}`, `wasPinned=${circle.isPinned}`);
    if (__DEV__) {
      devLog("[P1_CIRCLES_SWIPE_UI]", "action tap", {
        type: 'pin',
        circleId: circle.id.slice(0, 6),
        prevState: circle.isPinned ?? false,
        nextState: !(circle.isPinned ?? false),
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPin(circle.id);
  };

  const triggerMute = () => {
    if (muteMutation.isPending) {
      if (__DEV__) devLog('[P1_DOUBLE_SUBMIT_GUARD]', 'circleMute ignored, circleId=' + circle.id);
      return;
    }
    const nextMuted = !circle.isMuted;
    devLog("[P1_CIRCLES_CARD]", "action=tap", "type=mute", `circleId=${circle.id}`, `wasMuted=${circle.isMuted}`, `nextMuted=${nextMuted}`);
    if (__DEV__) {
      devLog("[P1_CIRCLES_SWIPE_UI]", "action tap", {
        type: 'mute',
        circleId: circle.id.slice(0, 6),
        prevState: circle.isMuted ?? false,
        nextState: nextMuted,
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    muteMutation.mutate({ circleId: circle.id, isMuted: nextMuted });
    if (onMute) {
      onMute(circle.id, nextMuted);
    }
  };

  const triggerDelete = () => {
    devLog("[P1_CIRCLES_CARD]", "action=tap", "type=delete", `circleId=${circle.id}`, `circleName=${circle.name}`);
    if (__DEV__) {
      devLog("[P1_CIRCLES_SWIPE_UI]", "action tap", {
        type: 'delete',
        circleId: circle.id.slice(0, 6),
        circleName: circle.name,
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDelete(circle.id);
  };

  // [P1_CIRCLES_SWIPE_UI] Track card unmount on delete
  React.useEffect(() => {
    return () => {
      if (__DEV__) {
        devLog("[P1_CIRCLES_SWIPE_UI]", "card unmount", {
          circleId: circle.id.slice(0, 6),
          name: circle.name,
        });
      }
    };
  }, [circle.id, circle.name]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      // Clamp to [-OPEN_LEFT_PX, OPEN_RIGHT_PX]
      translateX.value = Math.max(-OPEN_LEFT_PX, Math.min(OPEN_RIGHT_PX, event.translationX));
      isSwipingLeft.value = event.translationX < -20;
      isSwipingRight.value = event.translationX > 20;
    })
    .onEnd((event) => {
      const tx = event.translationX;
      if (tx < -THRESH_OPEN_PX) {
        // Snap open left → reveal Delete
        if (__DEV__) runOnJS(devLog)('[P0_CIRCLE_SWIPE]', 'snap', { dir: 'left', target: -OPEN_LEFT_PX });
        translateX.value = withSpring(-OPEN_LEFT_PX, { damping: 20, stiffness: 200 });
      } else if (tx > THRESH_OPEN_PX) {
        // Snap open right → reveal Pin, then auto-close after action
        if (__DEV__) runOnJS(devLog)('[P0_CIRCLE_SWIPE]', 'snap', { dir: 'right', target: OPEN_RIGHT_PX });
        translateX.value = withSpring(OPEN_RIGHT_PX, { damping: 20, stiffness: 200 });
      } else {
        // Snap closed
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
      isSwipingLeft.value = false;
      isSwipingRight.value = false;
    });

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // For 1:1 DMs, show only the other person's avatar (not self)
  const currentUserId = session?.user?.id;
  const avatarMembers = circle.type === "dm" && currentUserId
    ? members.filter(m => m.userId !== currentUserId)
    : members;

  // Dynamic chat display name: DMs show other person's name, groups use circle.name
  const chatDisplayName = (() => {
    if (circle.type === "dm" && currentUserId && members.length === 2) {
      const other = members.find(m => m.userId !== currentUserId);
      if (other?.user?.name) return other.user.name;
    }
    return circle.name;
  })();

  // Circular arrangement: up to 5 members positioned around a ring
  const displayedMembers = avatarMembers.slice(0, 5);
  const AVATAR_CONTAINER = 48;
  const AVATAR_SIZE = displayedMembers.length <= 2 ? 24 : displayedMembers.length <= 3 ? 20 : 16;
  const RING_RADIUS = displayedMembers.length <= 2 ? 10 : 12;
  const memberPositions = displayedMembers.map((_, i) => {
    const angle = (2 * Math.PI * i) / displayedMembers.length - Math.PI / 2;
    return {
      left: AVATAR_CONTAINER / 2 + RING_RADIUS * Math.cos(angle) - AVATAR_SIZE / 2,
      top: AVATAR_CONTAINER / 2 + RING_RADIUS * Math.sin(angle) - AVATAR_SIZE / 2,
    };
  });

  return (
    <Animated.View
      entering={FadeIn.delay(index * 50)}
      className="relative overflow-hidden"
      testID={`circle-card-${circle.id}`}
    >
      {/* Right-swipe: Pin action (revealed on the left side) */}
      <View
        className="absolute inset-y-0 left-0 items-center justify-center"
        style={{ width: ACTION_WIDTH_PX }}
      >
        <Pressable
          onPress={() => { translateX.value = withSpring(0, { damping: 20, stiffness: 200 }); triggerPin(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-14 h-14 rounded-2xl items-center justify-center"
          style={{ backgroundColor: STATUS.going.fg }}
          testID={`circle-action-pin-${circle.id}`}
        >
          <Pin size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Left-swipe: Delete action (revealed on the right side) */}
      <View
        className="absolute inset-y-0 right-0 items-center justify-center"
        style={{ width: ACTION_WIDTH_PX }}
      >
        <Pressable
          onPress={() => { translateX.value = withSpring(0, { damping: 20, stiffness: 200 }); triggerDelete(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-14 h-14 rounded-2xl items-center justify-center"
          style={{ backgroundColor: STATUS.destructive.fg }}
          testID={`circle-action-delete-${circle.id}`}
        >
          <Trash2 size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Inbox row */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[animatedCardStyle, { backgroundColor: colors.background }]}>
          <Pressable
            onPress={handlePress}
            className="flex-row items-center py-2.5 px-1"
            style={{
              backgroundColor: unreadCount > 0 && !circle.isMuted
                ? (isDark ? themeColor + "08" : themeColor + "06")
                : undefined,
            }}
          >
            {/* LEFT — Avatar cluster */}
            <View
              className="mr-3"
              accessible={true}
              accessibilityLabel={
                circle.isMuted && (circle.unreadCount ?? 0) > 0
                  ? "Muted circle, unread messages"
                  : circle.isMuted
                  ? "Muted circle"
                  : undefined
              }
              accessibilityHint={circle.isMuted ? "Swipe right to unmute" : undefined}
            >
              {/* Group avatar: circle photo or circular member arrangement */}
              {circle.photoUrl ? (
                <View className="w-12 h-12 rounded-full overflow-hidden" style={{ backgroundColor: themeColor + "20" }}>
                  <CirclePhotoEmoji photoUrl={circle.photoUrl} emoji={circle.emoji ?? "👥"} emojiClassName="text-xl" />
                </View>
              ) : displayedMembers.length >= 2 ? (
                /* Circular member arrangement scaled for inbox */
                <View style={{ width: AVATAR_CONTAINER, height: AVATAR_CONTAINER }}>
                  {displayedMembers.map((member, i) => (
                    <View key={member.userId ?? i} style={{ position: "absolute", left: memberPositions[i].left, top: memberPositions[i].top, zIndex: displayedMembers.length - i }}>
                      <EntityAvatar
                        photoUrl={member.user?.image}
                        initials={member.user?.name?.[0] ?? "?"}
                        size={AVATAR_SIZE}
                        backgroundColor={isDark ? "#2C2C2E" : themeColor + "30"}
                        foregroundColor={themeColor}
                        fallbackIcon="person"
                        style={{ borderWidth: 1.5, borderColor: colors.background }}
                      />
                    </View>
                  ))}
                </View>
              ) : displayedMembers.length === 1 ? (
                <EntityAvatar
                  photoUrl={displayedMembers[0]?.user?.image}
                  initials={displayedMembers[0]?.user?.name?.[0] ?? "?"}
                  size={48}
                  backgroundColor={isDark ? "#2C2C2E" : themeColor + "30"}
                  foregroundColor={themeColor}
                  fallbackIcon="person"
                />
              ) : (
                <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: themeColor + "20" }}>
                  <CirclePhotoEmoji photoUrl={null} emoji={circle.emoji ?? "👥"} emojiClassName="text-xl" />
                </View>
              )}
              {/* Pinned badge */}
              {circle.isPinned && (
                <View
                  className="absolute -top-0.5 -right-0.5 rounded-full items-center justify-center"
                  style={{ width: 18, height: 18, backgroundColor: STATUS.going.fg }}
                >
                  <Pin size={10} color="#fff" />
                </View>
              )}
              {/* [P0_CIRCLE_MUTE_POLISH] Muted indicator */}
              {circle.isMuted && (
                <Animated.View
                  entering={FadeInDown.duration(150)}
                  exiting={FadeOutDown.duration(150)}
                  className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.textTertiary }}
                >
                  <BellOff size={8} color="#fff" />
                </Animated.View>
              )}
            </View>

            {/* CENTER — Name + preview */}
            <View className="flex-1 mr-2">
              <View className="flex-row items-center">
                <Text
                  className="flex-1 text-[15px]"
                  style={{
                    color: colors.text,
                    fontWeight: unreadCount > 0 ? "700" : "600",
                  }}
                  numberOfLines={1}
                >
                  {chatDisplayName}
                </Text>
              </View>
              <Text
                className="text-[13px] mt-px"
                style={{
                  color: unreadCount > 0 && !circle.isMuted ? colors.textSecondary : colors.textTertiary,
                  fontWeight: unreadCount > 0 && !circle.isMuted ? "500" : "400",
                  opacity: circle.isMuted ? 0.6 : 1,
                }}
                numberOfLines={1}
              >
                {circle.lastMessageText
                  ? circle.lastMessageSenderName && circle.type !== "dm"
                    ? `${circle.lastMessageSenderName}: ${humanizePreview(circle.lastMessageText)}`
                    : humanizePreview(circle.lastMessageText)
                  : circle.description
                    ? circle.description
                    : "Start the conversation"}
              </Text>
            </View>

            {/* RIGHT — Timestamp + unread */}
            <View className="items-end ml-1">
              {circle.lastMessageAt && (
                <Text className="text-[11px] mt-0.5 mb-1" style={{ color: unreadCount > 0 ? themeColor : colors.textTertiary }}>
                  {formatInboxTime(circle.lastMessageAt)}
                </Text>
              )}
              {/* [P1_CIRCLE_BADGE] Unread badge */}
              {unreadCount > 0 && (
                <View
                  className="rounded-full items-center justify-center"
                  style={{
                    minWidth: circle.isMuted ? 8 : 20,
                    height: circle.isMuted ? 8 : 20,
                    paddingHorizontal: circle.isMuted ? 0 : 5,
                    backgroundColor: circle.isMuted ? colors.textTertiary : themeColor,
                  }}
                >
                  {!circle.isMuted && (
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </Pressable>
          {/* Separator */}
          <View style={{ height: 0.5, backgroundColor: colors.separator, marginLeft: 60 }} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
