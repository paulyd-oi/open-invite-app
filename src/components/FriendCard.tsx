import React from "react";
import { View, Text, Pressable } from "react-native";
import { EntityAvatar } from "@/components/EntityAvatar";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Pin, UserMinus, Calendar } from "@/ui/icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";

interface Friend {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface FriendCardProps {
  friendshipId: string;
  friend: Friend;
  isPinned: boolean;
  onPress: () => void;
  onPin: (friendshipId: string) => void;
  onRemove?: (friendshipId: string) => void;
  eventCount?: number;
  index: number;
}

const SWIPE_THRESHOLD = 80;

export function FriendCard({
  friendshipId,
  friend,
  isPinned,
  onPress,
  onPin,
  onRemove,
  eventCount,
  index,
}: FriendCardProps) {
  const { themeColor, isDark, colors } = useTheme();

  const translateX = useSharedValue(0);
  const isSwipingLeft = useSharedValue(false);
  const isSwipingRight = useSharedValue(false);

  const triggerPin = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPin(friendshipId);
  };

  const triggerRemove = () => {
    if (onRemove) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onRemove(friendshipId);
    }
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      isSwipingLeft.value = event.translationX < -30 && !!onRemove;
      isSwipingRight.value = event.translationX > 30;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        // Swipe right -> Pin
        translateX.value = withSpring(0);
        runOnJS(triggerPin)();
      } else if (event.translationX < -SWIPE_THRESHOLD && onRemove) {
        // Swipe left -> Remove (only if handler provided)
        translateX.value = withSpring(0);
        runOnJS(triggerRemove)();
      } else {
        translateX.value = withSpring(0);
      }
      isSwipingLeft.value = false;
      isSwipingRight.value = false;
    });

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedPinStyle = useAnimatedStyle(() => ({
    opacity: isSwipingRight.value ? withTiming(1) : withTiming(0),
    transform: [{ scale: isSwipingRight.value ? withSpring(1) : withSpring(0.8) }],
  }));

  const animatedRemoveStyle = useAnimatedStyle(() => ({
    opacity: isSwipingLeft.value ? withTiming(1) : withTiming(0),
    transform: [{ scale: isSwipingLeft.value ? withSpring(1) : withSpring(0.8) }],
  }));

  return (
    <Animated.View
      entering={FadeIn.delay(index * 30)}
      className="mb-2 relative overflow-hidden"
    >
      {/* Swipe Actions Background */}
      <View className="absolute inset-0 flex-row">
        {/* Pin Action (left side - revealed on swipe right) - Always GREEN to match CircleCard */}
        <Animated.View
          style={animatedPinStyle}
          className="absolute left-4 top-0 bottom-0 justify-center"
        >
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: "#10B981" }}
          >
            <Pin size={18} color="#fff" />
          </View>
        </Animated.View>

        {/* Remove Action (right side - revealed on swipe left) */}
        {onRemove && (
          <Animated.View
            style={animatedRemoveStyle}
            className="absolute right-4 top-0 bottom-0 justify-center"
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: "#EF4444" }}
            >
              <UserMinus size={18} color="#fff" />
            </View>
          </Animated.View>
        )}
      </View>

      {/* Card */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedCardStyle}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPress();
            }}
            className="rounded-xl p-3 flex-row items-center"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Avatar — SSOT via EntityAvatar */}
            <View className="relative">
              <EntityAvatar
                photoUrl={friend.image}
                initials={friend.name?.[0] ?? friend.email?.[0]?.toUpperCase() ?? "?"}
                size={48}
                backgroundColor={friend.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "20"}
                foregroundColor={themeColor}
              />
              {isPinned && (
                <View
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full items-center justify-center"
                  style={{ backgroundColor: "#10B981" }}
                >
                  <Pin size={10} color="#fff" />
                </View>
              )}
            </View>

            {/* Info */}
            <View className="flex-1 ml-3">
              <Text className="font-semibold" style={{ color: colors.text }}>
                {friend.name ?? "Unknown"}
              </Text>
              {eventCount !== undefined && eventCount > 0 && (
                <View className="flex-row items-center mt-0.5">
                  <Calendar size={12} color={colors.textTertiary} />
                  <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>
                    {eventCount} upcoming event{eventCount !== 1 ? "s" : ""}
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
