import React from "react";
import { View, Text, Image, Pressable, AccessibilityInfo } from "react-native";
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
import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { devLog, devError } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";
import { trackAnalytics } from "@/lib/entitlements";
import { circleKeys } from "@/lib/circleQueryKeys";

interface CircleCardProps {
  circle: Circle;
  onPin: (circleId: string) => void;
  onDelete: (circleId: string) => void;
  onMute?: (circleId: string, isMuted: boolean) => void;
  index: number;
}

// ── SSOT swipe constants ──────────────────────────────────────
const ACTION_WIDTH_PX = 72;          // single action pill width
const OPEN_LEFT_PX   = ACTION_WIDTH_PX;  // delete reveal distance
const OPEN_RIGHT_PX  = ACTION_WIDTH_PX;  // pin reveal distance
const THRESH_OPEN_PX = 28;               // drag distance to snap open
// ──────────────────────────────────────────────────────────────

export function CircleCard({ circle, onPin, onDelete, onMute, index }: CircleCardProps) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const queryClient = useQueryClient();

  // [P1_CIRCLES_SWIPE_UI] Define actions in strict order: Pin, Mute, Delete
  const swipeActions = React.useMemo(() => [
    { type: 'pin' as const, label: circle.isPinned ? 'Unpin' : 'Pin', color: '#10B981' },
    { type: 'mute' as const, label: circle.isMuted ? 'Unmute' : 'Mute', color: circle.isMuted ? '#10B981' : '#F59E0B' },
    { type: 'delete' as const, label: 'Delete', color: '#EF4444' },
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
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
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

  // Calculate stacked bubble positions for members
  const displayedMembers = members.slice(0, 5);
  const extraCount = members.length - 5;

  return (
    <Animated.View
      entering={FadeIn.delay(index * 50)}
      className="mb-3 relative overflow-hidden"
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
          style={{ backgroundColor: '#10B981' }}
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
          style={{ backgroundColor: '#EF4444' }}
          testID={`circle-action-delete-${circle.id}`}
        >
          <Trash2 size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Card */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedCardStyle}>
          <Pressable
            onPress={handlePress}
            className="rounded-2xl p-4 flex-row items-center"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.3 : 0.08,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            {/* Left Side - Circle Icon */}
            <View 
              className="mr-4"
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
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center"
                style={{ backgroundColor: themeColor + "20" }}
              >
                <Text className="text-2xl">{circle.emoji}</Text>
              </View>
              {circle.isPinned && (
                <View
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full items-center justify-center"
                  style={{ backgroundColor: "#10B981" }}
                >
                  <Pin size={10} color="#fff" />
                </View>
              )}
              {/* [P0_CIRCLE_MUTE_POLISH] Animated muted indicator with crossfade */}
              {circle.isMuted && (
                <Animated.View
                  entering={FadeInDown.duration(150)}
                  exiting={FadeOutDown.duration(150)}
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.textTertiary }}
                >
                  <BellOff size={10} color="#fff" />
                </Animated.View>
              )}
              {/* [P0_CIRCLE_MUTE_POLISH] Animated red dot with outline for muted+unread - min 10px */}
              {circle.isMuted && (circle.unreadCount ?? 0) > 0 && (
                <Animated.View
                  entering={FadeInDown.duration(150)}
                  exiting={FadeOutDown.duration(150)}
                  className="absolute -top-1 -left-1 rounded-full"
                  style={{
                    width: 10,
                    height: 10,
                    backgroundColor: "#EF4444",
                    borderWidth: 1.5,
                    borderColor: isDark ? "#1C1C1E" : "#FFFFFF",
                  }}
                />
              )}
            </View>

            {/* Middle - Circle Info */}
            <View className="flex-1">
              <Text className="text-base font-semibold" style={{ color: colors.text }}>
                {circle.name}
              </Text>
              {circle.description && (
                <Text
                  className="text-sm mt-0.5"
                  style={{ 
                    color: colors.textSecondary,
                    // [P0_CIRCLE_MUTE_POLISH] Softer subtitle when muted
                    opacity: circle.isMuted ? 0.6 : 1,
                  }}
                  numberOfLines={2}
                >
                  {circle.description}
                </Text>
              )}
              <Text 
                className="text-xs mt-0.5" 
                style={{ 
                  color: colors.textTertiary,
                  // [P0_CIRCLE_MUTE_POLISH] Softer meta text when muted
                  opacity: circle.isMuted ? 0.6 : 1,
                }}
              >
                {members.length} member{members.length !== 1 ? "s" : ""}
                {(circle.messageCount ?? 0) > 0 && ` · ${circle.messageCount} messages`}
              </Text>
            </View>

            {/* Right Side - Member Avatars arranged in a circle */}
            <View className="relative" style={{ width: 56, height: 56 }}>
              {displayedMembers.length === 0 ? null : displayedMembers.length === 1 ? (
                // Single member - centered
                <View
                  className="absolute w-10 h-10 rounded-full overflow-hidden border-2"
                  style={{
                    top: 8,
                    left: 8,
                    borderColor: colors.surface,
                    backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB",
                  }}
                >
                  {displayedMembers[0]?.user?.image ? (
                    <Image source={{ uri: displayedMembers[0].user?.image }} className="w-full h-full" />
                  ) : (
                    <View
                      className="w-full h-full items-center justify-center"
                      style={{ backgroundColor: themeColor + "30" }}
                    >
                      <Text className="text-sm font-bold" style={{ color: themeColor }}>
                        {displayedMembers[0]?.user?.name?.[0] ?? "?"}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                // Multiple members - arranged in a circle
                displayedMembers.map((member, i) => {
                  // Skip rendering if member or user is missing
                  if (!member?.user) return null;

                  const memberCount = displayedMembers.length;
                  const avatarSize = memberCount <= 3 ? 28 : 24;
                  const radius = memberCount <= 3 ? 14 : 16; // Distance from center
                  const centerX = 28 - avatarSize / 2;
                  const centerY = 28 - avatarSize / 2;

                  // Calculate position on circle
                  // Start from top (-90 degrees) and go clockwise
                  const angleOffset = -Math.PI / 2;
                  const angle = angleOffset + (i * 2 * Math.PI) / memberCount;
                  const x = centerX + radius * Math.cos(angle);
                  const y = centerY + radius * Math.sin(angle);

                  return (
                    <View
                      key={member.userId}
                      className="absolute rounded-full overflow-hidden border-2"
                      style={{
                        width: avatarSize,
                        height: avatarSize,
                        top: y,
                        left: x,
                        borderColor: colors.surface,
                        backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB",
                        zIndex: memberCount - i,
                      }}
                    >
                      {member.user?.image ? (
                        <Image source={{ uri: member.user?.image }} className="w-full h-full" />
                      ) : (
                        <View
                          className="w-full h-full items-center justify-center"
                          style={{ backgroundColor: themeColor + "30" }}
                        >
                          <Text className="text-[10px] font-bold" style={{ color: themeColor }}>
                            {member.user.name?.[0] ?? "?"}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
              {extraCount > 0 && (
                <View
                  className="absolute w-5 h-5 rounded-full items-center justify-center border"
                  style={{
                    bottom: -2,
                    right: -2,
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                    borderColor: colors.border,
                  }}
                >
                  <Text className="text-[8px] font-medium" style={{ color: colors.textSecondary }}>
                    +{extraCount}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
