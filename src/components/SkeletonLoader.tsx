import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useTheme } from "@/lib/ThemeContext";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
}

export function Skeleton({ width = "100%", height = 20, borderRadius = 8, className = "" }: SkeletonProps) {
  const { isDark } = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200 }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.7, 0.3]),
  }));

  return (
    <Animated.View
      className={className}
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: isDark ? "#3C3C3E" : "#E5E7EB",
        },
        animatedStyle,
      ]}
    />
  );
}

// Event card skeleton
export function EventCardSkeleton() {
  const { isDark, colors } = useTheme();

  return (
    <View
      className="rounded-2xl p-4 mb-3"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View className="flex-row items-start">
        <Skeleton width={56} height={56} borderRadius={12} className="mr-3" />
        <View className="flex-1">
          <Skeleton width="70%" height={20} className="mb-2" />
          <Skeleton width="90%" height={14} className="mb-2" />
          <View className="flex-row items-center">
            <Skeleton width={24} height={24} borderRadius={12} className="mr-2" />
            <Skeleton width={80} height={14} />
          </View>
        </View>
      </View>
      <View className="flex-row mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
        <Skeleton width={80} height={14} className="mr-4" />
        <Skeleton width={60} height={14} className="mr-4" />
        <Skeleton width={100} height={14} />
      </View>
    </View>
  );
}

// Friend card skeleton
export function FriendCardSkeleton() {
  const { colors } = useTheme();

  return (
    <View
      className="rounded-xl p-3 mb-2"
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <View className="flex-row items-center">
        <Skeleton width={48} height={48} borderRadius={24} className="mr-3" />
        <View className="flex-1">
          <Skeleton width="60%" height={16} className="mb-2" />
          <View className="flex-row">
            <Skeleton width={60} height={16} borderRadius={12} className="mr-2" />
            <Skeleton width={50} height={16} borderRadius={12} />
          </View>
        </View>
      </View>
    </View>
  );
}

// Activity item skeleton
export function ActivityItemSkeleton() {
  const { colors } = useTheme();

  return (
    <View className="flex-row mb-4">
      <View className="items-center mr-3">
        <Skeleton width={40} height={40} borderRadius={20} />
        <View className="w-0.5 flex-1 mt-2" style={{ backgroundColor: colors.border }} />
      </View>
      <View className="flex-1 pb-4">
        <View className="flex-row items-center mb-1">
          <Skeleton width={100} height={14} className="mr-2" />
          <Skeleton width={60} height={12} />
        </View>
        <View
          className="rounded-xl p-3 mt-1"
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          <View className="flex-row items-center">
            <Skeleton width={36} height={36} borderRadius={8} className="mr-2" />
            <View className="flex-1">
              <Skeleton width="70%" height={14} className="mb-1" />
              <Skeleton width="50%" height={12} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// Suggestion card skeleton
export function SuggestionCardSkeleton() {
  const { colors } = useTheme();

  return (
    <View
      className="rounded-2xl p-4 mb-3"
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <View className="flex-row items-center">
        <Skeleton width={56} height={56} borderRadius={28} className="mr-3" />
        <View className="flex-1">
          <Skeleton width="60%" height={18} className="mb-2" />
          <View className="flex-row items-center">
            <View className="flex-row mr-2">
              <Skeleton width={20} height={20} borderRadius={10} />
              <Skeleton width={20} height={20} borderRadius={10} className="-ml-2" />
            </View>
            <Skeleton width={100} height={12} />
          </View>
        </View>
        <Skeleton width={32} height={32} borderRadius={16} />
      </View>
    </View>
  );
}

// Feed loading skeleton (multiple event cards)
export function FeedSkeleton() {
  return (
    <View className="px-5">
      <Skeleton width={80} height={20} className="mb-3" />
      <EventCardSkeleton />
      <EventCardSkeleton />
      <Skeleton width={100} height={20} className="mb-3 mt-2" />
      <EventCardSkeleton />
    </View>
  );
}

// Friends list loading skeleton
export function FriendsListSkeleton() {
  return (
    <View>
      <FriendCardSkeleton />
      <FriendCardSkeleton />
      <FriendCardSkeleton />
      <FriendCardSkeleton />
    </View>
  );
}

// Activity feed loading skeleton
export function ActivityFeedSkeleton() {
  return (
    <View className="px-5 pt-4">
      <ActivityItemSkeleton />
      <ActivityItemSkeleton />
      <ActivityItemSkeleton />
    </View>
  );
}

// Suggestions loading skeleton
export function SuggestionsSkeleton() {
  return (
    <View className="px-5 pt-4">
      <SuggestionCardSkeleton />
      <SuggestionCardSkeleton />
      <SuggestionCardSkeleton />
    </View>
  );
}
