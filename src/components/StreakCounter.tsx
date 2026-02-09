import React from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Flame, Calendar, Sparkles, Award } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";

interface StreakCounterProps {
  currentStreak: number;
  longestStreak: number;
  totalHangouts: number;
  onPress?: () => void;
}

export function StreakCounter({
  currentStreak,
  longestStreak,
  totalHangouts,
  onPress,
}: StreakCounterProps) {
  const { themeColor, isDark, colors } = useTheme();

  // Get streak status
  const isOnFire = currentStreak >= 7;
  const isWarming = currentStreak >= 3;
  const streakColor = isOnFire ? "#FF4500" : isWarming ? "#FF8C00" : "#FFA500";

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        entering={FadeIn.springify()}
        className="rounded-2xl p-5 overflow-hidden"
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View className="flex-row items-center justify-between">
          {/* Streak Display */}
          <View className="flex-row items-center">
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center"
              style={{ backgroundColor: `${streakColor}20` }}
            >
              <Flame
                size={36}
                color={streakColor}
              />
            </View>

            <View className="ml-4">
              <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                Current Streak
              </Text>
              <View className="flex-row items-baseline">
                <Text
                  className="text-4xl font-black"
                  style={{ color: streakColor }}
                >
                  {currentStreak}
                </Text>
                <Text className="text-lg font-semibold ml-1" style={{ color: colors.textTertiary }}>
                  {currentStreak === 1 ? "week" : "weeks"}
                </Text>
              </View>

              {/* Streak message */}
              <Text className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>
                {currentStreak === 0
                  ? "Start your streak this week!"
                  : currentStreak >= 10
                  ? "Legendary! Keep it going!"
                  : currentStreak >= 7
                  ? "You're on fire!"
                  : currentStreak >= 3
                  ? "Nice! Getting warmer"
                  : "Building momentum!"}
              </Text>
            </View>
          </View>

          {/* Best streak badge */}
          {longestStreak > 0 && (
            <View className="items-center">
              <View
                className="w-10 h-10 rounded-full items-center justify-center mb-1"
                style={{ backgroundColor: "#FFD70020" }}
              >
                {/* INVARIANT: No Trophy icons. Using Award for best streak. */}
                <Award size={20} color="#FFD700" />
              </View>
              <Text className="text-xs" style={{ color: colors.textTertiary }}>Best</Text>
              <Text className="text-sm font-bold" style={{ color: "#FFD700" }}>
                {longestStreak}
              </Text>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <View className="flex-row mt-4 pt-4 border-t" style={{ borderColor: colors.border }}>
          <View className="flex-1 items-center">
            <View className="flex-row items-center">
              <Calendar size={14} color={colors.textTertiary} />
              <Text className="text-lg font-bold ml-1.5" style={{ color: colors.text }}>
                {totalHangouts}
              </Text>
            </View>
            <Text className="text-xs" style={{ color: colors.textTertiary }}>
              Total Hangouts
            </Text>
          </View>

          <View className="w-px mx-4" style={{ backgroundColor: colors.border }} />

          <View className="flex-1 items-center">
            <View className="flex-row items-center">
              <Sparkles size={14} color={colors.textTertiary} />
              <Text className="text-lg font-bold ml-1.5" style={{ color: colors.text }}>
                {Math.round(totalHangouts / Math.max(currentStreak, 1) * 10) / 10}
              </Text>
            </View>
            <Text className="text-xs" style={{ color: colors.textTertiary }}>
              Avg per Week
            </Text>
          </View>
        </View>

        {/* Streak Progress */}
        {currentStreak > 0 && currentStreak < 10 && (
          <View className="mt-4">
            <View className="flex-row justify-between mb-1">
              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                Progress to Fire Status
              </Text>
              <Text className="text-xs font-medium" style={{ color: streakColor }}>
                {currentStreak}/10 weeks
              </Text>
            </View>
            <View
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
            >
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(currentStreak * 10, 100)}%`,
                  backgroundColor: streakColor,
                }}
              />
            </View>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Mini streak badge for compact display
export function StreakBadge({ streak }: { streak: number }) {
  const isOnFire = streak >= 7;
  const isWarming = streak >= 3;
  const streakColor = isOnFire ? "#FF4500" : isWarming ? "#FF8C00" : "#FFA500";

  if (streak === 0) return null;

  return (
    <View
      className="flex-row items-center px-2 py-1 rounded-full"
      style={{ backgroundColor: `${streakColor}20` }}
    >
      <Flame size={12} color={streakColor} />
      <Text
        className="text-xs font-bold ml-1"
        style={{ color: streakColor }}
      >
        {streak}
      </Text>
    </View>
  );
}
