import React, { useEffect } from "react";
import { View, StyleSheet, type ViewStyle, type DimensionValue } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useTheme } from "@/lib/ThemeContext";

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = "100%",
  height = 20,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const { isDark } = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]);
    return { opacity };
  });

  const baseColor = isDark ? "#3A3A3C" : "#E5E7EB";

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: baseColor,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

// Pre-built skeleton layouts
export function EventCardSkeleton() {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.eventCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.eventCardContent}>
        <Skeleton width={48} height={48} borderRadius={12} />
        <View style={styles.eventCardText}>
          <Skeleton width="70%" height={18} />
          <Skeleton width="50%" height={14} style={{ marginTop: 8 }} />
          <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
        </View>
      </View>
    </View>
  );
}

export function EventRequestCardSkeleton() {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.requestCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.requestCardContent}>
        <Skeleton width={48} height={48} borderRadius={12} />
        <View style={styles.requestCardText}>
          <View style={styles.requestCardHeader}>
            <Skeleton width="60%" height={16} />
            <Skeleton width={50} height={20} borderRadius={10} />
          </View>
          <Skeleton width="45%" height={12} style={{ marginTop: 8 }} />
          <Skeleton width="55%" height={12} style={{ marginTop: 6 }} />
        </View>
      </View>
    </View>
  );
}

export function FriendCardSkeleton() {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.friendCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Skeleton width={56} height={56} borderRadius={28} />
      <View style={styles.friendCardText}>
        <Skeleton width="65%" height={16} />
        <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={24} height={24} borderRadius={12} />
    </View>
  );
}

export function CalendarDaySkeleton() {
  return (
    <View style={styles.calendarDay}>
      <Skeleton width={28} height={28} borderRadius={14} />
      <View style={styles.calendarDayDots}>
        <Skeleton width={4} height={4} borderRadius={2} />
        <Skeleton width={4} height={4} borderRadius={2} style={{ marginLeft: 2 }} />
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.profile}>
      <Skeleton width={100} height={100} borderRadius={50} />
      <Skeleton width={150} height={24} style={{ marginTop: 16 }} />
      <Skeleton width={200} height={14} style={{ marginTop: 8 }} />
      <View style={[styles.statsRow, { marginTop: 24 }]}>
        <View style={styles.statItem}>
          <Skeleton width={40} height={28} />
          <Skeleton width={60} height={12} style={{ marginTop: 4 }} />
        </View>
        <View style={styles.statItem}>
          <Skeleton width={40} height={28} />
          <Skeleton width={60} height={12} style={{ marginTop: 4 }} />
        </View>
        <View style={styles.statItem}>
          <Skeleton width={40} height={28} />
          <Skeleton width={60} height={12} style={{ marginTop: 4 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eventCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  eventCardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  eventCardText: {
    flex: 1,
    marginLeft: 12,
  },
  requestCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  requestCardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  requestCardText: {
    flex: 1,
    marginLeft: 12,
  },
  requestCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  friendCardText: {
    flex: 1,
    marginLeft: 12,
  },
  calendarDay: {
    alignItems: "center",
    padding: 4,
  },
  calendarDayDots: {
    flexDirection: "row",
    marginTop: 4,
  },
  profile: {
    alignItems: "center",
    padding: 20,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  statItem: {
    alignItems: "center",
  },
});
