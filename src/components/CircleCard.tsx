import React from "react";
import { View, Text, Image, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  FadeIn,
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
import { devLog } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";

interface CircleCardProps {
  circle: Circle;
  onPin: (circleId: string) => void;
  onDelete: (circleId: string) => void;
  onMute?: (circleId: string, isMuted: boolean) => void;
  index: number;
}

const SWIPE_THRESHOLD = 80;

export function CircleCard({ circle, onPin, onDelete, onMute, index }: CircleCardProps) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const queryClient = useQueryClient();

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
      await queryClient.cancelQueries({ queryKey: ["circles"] });
      
      // Snapshot the previous value
      const previousCircles = queryClient.getQueryData(["circles"]);
      
      // Optimistically update
      queryClient.setQueryData(["circles"], (old: any) => {
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
      if (__DEV__) {
        devLog("[P0_CIRCLE_MUTE_UI]", {
          circleId,
          prevMuted: !isMuted,
          nextMuted: isMuted,
          success: true,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["circles"] });
    },
    onError: (error, { circleId, isMuted }, context) => {
      // Revert optimistic update
      if (context?.previousCircles) {
        queryClient.setQueryData(["circles"], context.previousCircles);
      }
      if (__DEV__) {
        devLog("[P0_CIRCLE_MUTE_UI]", {
          circleId,
          prevMuted: !isMuted,
          nextMuted: isMuted,
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPin(circle.id);
  };

  const triggerMute = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const nextMuted = !circle.isMuted;
    muteMutation.mutate({ circleId: circle.id, isMuted: nextMuted });
    if (onMute) {
      onMute(circle.id, nextMuted);
    }
  };

  const triggerDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDelete(circle.id);
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      isSwipingLeft.value = event.translationX < -30;
      isSwipingRight.value = event.translationX > 30;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        // Swipe right -> Mute/Unmute
        translateX.value = withSpring(0);
        runOnJS(triggerMute)();
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        // Swipe left -> Delete
        translateX.value = withTiming(-300, { duration: 200 }, () => {
          runOnJS(triggerDelete)();
        });
      } else {
        translateX.value = withSpring(0);
      }
      isSwipingLeft.value = false;
      isSwipingRight.value = false;
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(600) // 600ms for long press
    .onEnd(() => {
      runOnJS(triggerPin)();
    });

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedPinStyle = useAnimatedStyle(() => ({
    opacity: isSwipingRight.value ? withTiming(1) : withTiming(0),
    transform: [{ scale: isSwipingRight.value ? withSpring(1) : withSpring(0.8) }],
  }));

  const animatedDeleteStyle = useAnimatedStyle(() => ({
    opacity: isSwipingLeft.value ? withTiming(1) : withTiming(0),
    transform: [{ scale: isSwipingLeft.value ? withSpring(1) : withSpring(0.8) }],
  }));

  // Calculate stacked bubble positions for members
  const displayedMembers = members.slice(0, 5);
  const extraCount = members.length - 5;

  return (
    <Animated.View
      entering={FadeIn.delay(index * 50)}
      className="mb-3 relative overflow-hidden"
    >
      {/* Swipe Actions Background */}
      <View className="absolute inset-0 flex-row">
        {/* Mute Action (left side - revealed on swipe right) */}
        <Animated.View
          style={animatedPinStyle}
          className="absolute left-4 top-0 bottom-0 justify-center"
        >
          <View
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: circle.isMuted ? "#10B981" : "#F59E0B" }}
          >
            {circle.isMuted ? (
              <Bell size={20} color="#fff" />
            ) : (
              <BellOff size={20} color="#fff" />
            )}
          </View>
        </Animated.View>

        {/* Delete Action (right side - revealed on swipe left) */}
        <Animated.View
          style={animatedDeleteStyle}
          className="absolute right-4 top-0 bottom-0 justify-center"
        >
          <View
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: "#EF4444" }}
          >
            <Trash2 size={20} color="#fff" />
          </View>
        </Animated.View>
      </View>

      {/* Card */}
      <GestureDetector gesture={Gesture.Simultaneous(panGesture, longPressGesture)}>
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
            <View className="mr-4">
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
              {circle.isMuted && (
                <View
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.textTertiary }}
                >
                  <BellOff size={10} color="#fff" />
                </View>
              )}
              {/* [P0_CIRCLE_MUTE_V1] Show red dot for muted circles with unread messages */}
              {circle.isMuted && (circle.unreadCount ?? 0) > 0 && (
                <View
                  className="absolute -top-1 -left-1 w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#EF4444" }}
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
                  style={{ color: colors.textSecondary }}
                  numberOfLines={2}
                >
                  {circle.description}
                </Text>
              )}
              <Text className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>
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
