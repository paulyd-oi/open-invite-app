import React from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Plus } from "@/ui/icons";
import { CircleCard } from "@/components/CircleCard";
import { useTheme } from "@/lib/ThemeContext";
import type { Circle } from "@/shared/contracts";

// ── Props ──────────────────────────────────────────────────────
export interface FriendsChatsPaneProps {
  circles: Circle[];
  onCreateCirclePress: () => void;
  byCircle: Record<string, number>;
  onPinCircle: (circleId: string) => void;
  onLeaveCircle: (circleId: string, circleName: string) => void;
}

// ── Component ──────────────────────────────────────────────────
export function FriendsChatsPane({
  circles,
  onCreateCirclePress,
  byCircle,
  onPinCircle,
  onLeaveCircle,
}: FriendsChatsPaneProps) {
  const { colors } = useTheme();

  return (
    <View className="mb-4">
      <Animated.View entering={FadeInDown.duration(200)}>
        {circles.length === 0 ? (
          <Pressable
            /* INVARIANT_ALLOW_INLINE_HANDLER */
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCreateCirclePress();
            }}
            className="rounded-xl p-4 mb-2 border border-dashed items-center"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ borderColor: "#9333EA50" }}
          >
            <View
              className="w-12 h-12 rounded-full items-center justify-center mb-2"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ backgroundColor: "#9333EA20" }}
            >
              <Plus size={24} color="#9333EA" />
            </View>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="font-medium text-center" style={{ color: colors.text }}>
              Create a Group
            </Text>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-xs text-center mt-1" style={{ color: colors.textSecondary }}>
              Plan events with friends in a group chat
            </Text>
          </Pressable>
        ) : (
          /* INVARIANT_ALLOW_SMALL_MAP */
          circles.map((circle, index) => (
            <CircleCard
              key={circle.id}
              circle={circle}
              index={index}
              unreadCount={byCircle[circle.id] ?? 0}
              onPin={(id) => onPinCircle(id)}
              onDelete={(id) => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onLeaveCircle(id, circle.name);
              }}
            />
          ))
        )}
      </Animated.View>
    </View>
  );
}
