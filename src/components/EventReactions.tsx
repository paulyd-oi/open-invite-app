import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";

export type ReactionType = "fire" | "love" | "hype" | "maybe" | "down";

interface Reaction {
  type: ReactionType;
  emoji: string;
  label: string;
  color: string;
}

const REACTIONS: Reaction[] = [
  { type: "fire", emoji: "🔥", label: "Fire", color: "#FF4500" },
  { type: "love", emoji: "😍", label: "Love it", color: "#E91E63" },
  { type: "hype", emoji: "🙌", label: "Hyped", color: "#9C27B0" },
  { type: "down", emoji: "👇", label: "I'm down", color: "#22C55E" },
  { type: "maybe", emoji: "🤔", label: "Maybe", color: "#F39C12" },
];

interface EventReactionButtonProps {
  eventId: string;
  currentReaction?: ReactionType | null;
  reactionCounts?: Record<ReactionType, number>;
  onReact: (eventId: string, reaction: ReactionType | null) => void;
  compact?: boolean;
}

export function EventReactionButton({
  eventId,
  currentReaction,
  reactionCounts = {} as Record<ReactionType, number>,
  onReact,
  compact = false,
}: EventReactionButtonProps) {
  const { themeColor, isDark, colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const scale = useSharedValue(1);

  const currentReactionData = currentReaction
    ? REACTIONS.find((r) => r.type === currentReaction)
    : null;

  // Get top reactions to display
  const topReactions = Object.entries(reactionCounts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => REACTIONS.find((r) => r.type === type)!);

  const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(true);
  };

  const handleReaction = (reaction: Reaction) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scale.value = withSequence(
      withSpring(1.3),
      withSpring(1)
    );

    // Toggle off if same reaction, otherwise set new one
    if (currentReaction === reaction.type) {
      onReact(eventId, null);
    } else {
      onReact(eventId, reaction.type);
    }
    setShowPicker(false);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (compact) {
    // Compact version - just shows emoji reactions inline
    return (
      <>
        <Pressable
          onPress={handlePress}
          className="flex-row items-center"
        >
          {topReactions.length > 0 ? (
            <View className="flex-row items-center">
              {topReactions.map((reaction, idx) => (
                <Text key={reaction.type} className="text-sm" style={{ marginLeft: idx > 0 ? -4 : 0 }}>
                  {reaction.emoji}
                </Text>
              ))}
              {totalReactions > 0 && (
                <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>
                  {totalReactions}
                </Text>
              )}
            </View>
          ) : (
            <Animated.View style={animatedStyle}>
              <Text className="text-base">
                {currentReactionData?.emoji || "😊"}
              </Text>
            </Animated.View>
          )}
        </Pressable>

        {/* Reaction Picker Modal */}
        <ReactionPickerModal
          visible={showPicker}
          currentReaction={currentReaction}
          onSelect={handleReaction}
          onClose={() => setShowPicker(false)}
        />
      </>
    );
  }

  // Full version with button
  return (
    <>
      <Pressable
        onPress={handlePress}
        className="flex-row items-center px-3 py-2 rounded-full"
        style={{
          backgroundColor: currentReactionData
            ? `${currentReactionData.color}20`
            : isDark ? "#2C2C2E" : "#F3F4F6",
          borderWidth: currentReactionData ? 1 : 0,
          borderColor: currentReactionData?.color,
        }}
      >
        <Animated.View style={animatedStyle}>
          <Text className="text-lg">
            {currentReactionData?.emoji || "👀"}
          </Text>
        </Animated.View>
        <Text
          className="text-sm font-medium ml-1.5"
          style={{ color: currentReactionData?.color || colors.textSecondary }}
        >
          {currentReactionData?.label || "Vibe Check"}
        </Text>
        {totalReactions > 0 && (
          <View
            className="ml-2 px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: isDark ? "#3C3C3E" : "#E5E7EB" }}
          >
            <Text className="text-xs font-bold" style={{ color: colors.textSecondary }}>
              {totalReactions}
            </Text>
          </View>
        )}
      </Pressable>

      {/* Reaction Picker Modal */}
      <ReactionPickerModal
        visible={showPicker}
        currentReaction={currentReaction}
        onSelect={handleReaction}
        onClose={() => setShowPicker(false)}
      />
    </>
  );
}

// Reaction Picker Modal Component
function ReactionPickerModal({
  visible,
  currentReaction,
  onSelect,
  onClose,
}: {
  visible: boolean;
  currentReaction?: ReactionType | null;
  onSelect: (reaction: Reaction) => void;
  onClose: () => void;
}) {
  const { isDark, colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-center items-center"
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        onPress={onClose}
      >
        <Animated.View
          entering={FadeIn.springify()}
          exiting={FadeOut.duration(150)}
          className="flex-row rounded-full px-2 py-2"
          style={{
            backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {REACTIONS.map((reaction, index) => {
            const isSelected = currentReaction === reaction.type;
            return (
              <ReactionItem
                key={reaction.type}
                reaction={reaction}
                isSelected={isSelected}
                index={index}
                onPress={() => onSelect(reaction)}
              />
            );
          })}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// Individual Reaction Item with animation
function ReactionItem({
  reaction,
  isSelected,
  index,
  onPress,
}: {
  reaction: Reaction;
  isSelected: boolean;
  index: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(1.4);
    translateY.value = withSpring(-10);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    translateY.value = withSpring(0);
    onPress();
  };

  return (
    <Animated.View
      entering={FadeIn.delay(index * 50).springify()}
      style={animatedStyle}
    >
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className="w-12 h-12 items-center justify-center rounded-full mx-1"
        style={{
          backgroundColor: isSelected ? `${reaction.color}30` : "transparent",
        }}
      >
        <Text className="text-2xl">{reaction.emoji}</Text>
      </Pressable>
    </Animated.View>
  );
}

// Component to show reaction summary on event cards
export function ReactionSummary({
  reactionCounts,
  onPress,
}: {
  reactionCounts: Record<ReactionType, number>;
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  const topReactions = Object.entries(reactionCounts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => REACTIONS.find((r) => r.type === type)!);

  const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);

  if (totalReactions === 0) return null;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center"
    >
      <View className="flex-row">
        {topReactions.map((reaction, idx) => (
          <View
            key={reaction.type}
            className="w-5 h-5 rounded-full items-center justify-center"
            style={{
              marginLeft: idx > 0 ? -6 : 0,
              backgroundColor: `${reaction.color}30`,
              borderWidth: 1.5,
              borderColor: "#fff",
              zIndex: 10 - idx,
            }}
          >
            <Text className="text-xs">{reaction.emoji}</Text>
          </View>
        ))}
      </View>
      <Text className="text-xs ml-1.5" style={{ color: colors.textTertiary }}>
        {totalReactions}
      </Text>
    </Pressable>
  );
}
