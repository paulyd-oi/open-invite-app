import React from "react";
import { View, Text, Pressable, Image } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  interpolateColor,
} from "react-native-reanimated";
import { SLIDE_MS } from "@/ui/motion";
import { Check, X, Clock, Users } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTheme, type DARK_COLORS } from "@/lib/ThemeContext";
import type { EventRequest } from "@/shared/contracts";

const SWIPE_THRESHOLD = 100;

interface SwipeableEventRequestCardProps {
  request: EventRequest;
  userId: string;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}

export function SwipeableEventRequestCard({
  request,
  userId,
  onAccept,
  onDecline,
}: SwipeableEventRequestCardProps) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const translateX = useSharedValue(0);
  const isGestureActive = useSharedValue(false);

  const isCreator = request.creatorId === userId;
  const myResponse = request.members.find((m) => m.userId === userId);
  const needsResponse = !isCreator && myResponse?.status === "pending" && request.status === "pending";
  const acceptedCount = request.members.filter((m) => m.status === "accepted").length;
  const totalMembers = request.members.length;
  const startDate = new Date(request.startTime);
  const endDate = request.endTime ? new Date(request.endTime) : null;

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleAccept = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAccept(request.id);
  };

  const handleDecline = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDecline(request.id);
  };

  const panGesture = Gesture.Pan()
    .enabled(needsResponse)
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onStart(() => {
      isGestureActive.value = true;
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;

      // Haptic feedback at threshold
      if (Math.abs(e.translationX) >= SWIPE_THRESHOLD && Math.abs(translateX.value - e.translationX) > 5) {
        runOnJS(triggerHaptic)();
      }
    })
    .onEnd((e) => {
      isGestureActive.value = false;

      if (e.translationX > SWIPE_THRESHOLD) {
        // Swipe right - Accept
        translateX.value = withTiming(300, { duration: SLIDE_MS });
        runOnJS(handleAccept)();
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        // Swipe left - Decline
        translateX.value = withTiming(-300, { duration: SLIDE_MS });
        runOnJS(handleDecline)();
      } else {
        // Return to center
        translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const acceptBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1]
    );
    return {
      opacity: Math.max(0, opacity),
    };
  });

  const declineBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0]
    );
    return {
      opacity: Math.max(0, opacity),
    };
  });

  const acceptIconStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD / 2, SWIPE_THRESHOLD],
      [0.5, 0.8, 1.2]
    );
    return {
      transform: [{ scale: Math.max(0.5, scale) }],
    };
  });

  const declineIconStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD / 2, 0],
      [1.2, 0.8, 0.5]
    );
    return {
      transform: [{ scale: Math.max(0.5, scale) }],
    };
  });

  return (
    <View className="mb-3 overflow-hidden rounded-xl">
      {/* Background actions */}
      <View className="absolute inset-0 flex-row">
        {/* Accept background (right swipe) */}
        <Animated.View
          className="flex-1 justify-center pl-6"
          style={[{ backgroundColor: "#22C55E" }, acceptBgStyle]}
        >
          <Animated.View style={acceptIconStyle}>
            <Check size={32} color="#fff" />
          </Animated.View>
        </Animated.View>

        {/* Decline background (left swipe) */}
        <Animated.View
          className="flex-1 justify-center items-end pr-6"
          style={[{ backgroundColor: "#EF4444" }, declineBgStyle]}
        >
          <Animated.View style={declineIconStyle}>
            <X size={32} color="#fff" />
          </Animated.View>
        </Animated.View>
      </View>

      {/* Card content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardAnimatedStyle}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/event-request/${request.id}` as any);
            }}
            className="rounded-xl p-4"
            style={{
              backgroundColor: needsResponse ? `${themeColor}10` : colors.surface,
              borderWidth: needsResponse ? 2 : 1,
              borderColor: needsResponse ? themeColor : colors.border,
            }}
          >
            <View className="flex-row items-start">
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <Text className="text-2xl">{request.emoji}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text
                    className="font-semibold flex-1 mr-2"
                    style={{ color: colors.text }}
                    numberOfLines={1}
                  >
                    {request.title}
                  </Text>
                  {needsResponse && (
                    <View
                      className="px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#FF3B30" }}
                    >
                      <Text className="text-xs text-white font-medium">RSVP</Text>
                    </View>
                  )}
                  {request.status === "confirmed" && (
                    <View
                      className="px-2 py-0.5 rounded-full flex-row items-center"
                      style={{ backgroundColor: "#22C55E20" }}
                    >
                      <Check size={10} color="#22C55E" />
                      <Text className="text-xs font-medium ml-1" style={{ color: "#22C55E" }}>
                        Confirmed
                      </Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center mt-1">
                  <Clock size={12} color={colors.textSecondary} />
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
                    {endDate && ` – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                  </Text>
                </View>
                <View className="flex-row items-center mt-2">
                  <Users size={12} color={colors.textTertiary} />
                  <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>
                    {isCreator ? "You invited " : `${request.creator.name ?? "Someone"} + `}
                    {totalMembers} {totalMembers === 1 ? "friend" : "friends"}
                  </Text>
                  {request.status === "pending" && (
                    <Text className="text-xs ml-2" style={{ color: colors.textTertiary }}>
                      • {acceptedCount}/{totalMembers} accepted
                    </Text>
                  )}
                </View>

                {/* Swipe hint for pending responses */}
                {needsResponse && (
                  <View className="flex-row items-center justify-center mt-3 pt-2" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>
                      ← Decline • Swipe • Accept →
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
