import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  RefreshControl,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Calendar,
  UserPlus,
  ChevronLeft,
  Bell,
  Users,
  CheckCircle,
  Gift,
  Star,
} from "lucide-react-native";
import Animated, {
  FadeInDown,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { ActivityFeedSkeleton } from "@/components/SkeletonLoader";
import {
  type GetNotificationsResponse,
  type Notification,
} from "@/shared/contracts";

// Helper to format relative time
function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Notification type config
const notificationTypeConfig: Record<string, { icon: typeof Bell; color: string }> = {
  friend_request: { icon: UserPlus, color: "#2196F3" },
  friend_accepted: { icon: Users, color: "#4CAF50" },
  event_invite: { icon: Calendar, color: "#FF6B4A" },
  event_reminder: { icon: Bell, color: "#F59E0B" },
  event_join: { icon: CheckCircle, color: "#10B981" },
  achievement: { icon: Star, color: "#9333EA" },
  referral: { icon: Gift, color: "#EC4899" },
  default: { icon: Bell, color: "#6B7280" },
};

// Notification Card Component
function NotificationCard({
  notification,
  index,
  onPress,
  onMarkRead,
}: {
  notification: Notification;
  index: number;
  onPress: () => void;
  onMarkRead: () => void;
}) {
  const { themeColor, colors } = useTheme();
  const config = notificationTypeConfig[notification.type] ?? notificationTypeConfig.default;
  const IconComponent = config.icon;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          if (!notification.read) {
            onMarkRead();
          }
          onPress();
        }}
        className="mx-4 mb-3 p-4 rounded-2xl"
        style={{
          backgroundColor: notification.read ? colors.surface : (themeColor + "10"),
          borderWidth: notification.read ? 0 : 1,
          borderColor: notification.read ? "transparent" : (themeColor + "30"),
        }}
      >
        <View className="flex-row items-start">
          {/* Icon */}
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: config.color + "20" }}
          >
            <IconComponent size={20} color={config.color} />
          </View>

          {/* Content */}
          <View className="flex-1 ml-3">
            <Text
              className="text-sm font-semibold"
              style={{ color: colors.text }}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            <Text
              className="text-sm mt-1"
              style={{ color: colors.textSecondary }}
              numberOfLines={2}
            >
              {notification.body}
            </Text>
            <Text className="text-xs mt-2" style={{ color: colors.textTertiary }}>
              {formatRelativeTime(notification.createdAt)}
            </Text>
          </View>

          {/* Unread indicator */}
          {!notification.read && (
            <View
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: themeColor }}
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// Empty State Component
function EmptyState() {
  const { colors } = useTheme();

  return (
    <View className="flex-1 items-center justify-center px-8 py-20">
      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-4"
        style={{ backgroundColor: colors.surface }}
      >
        <Bell size={36} color="#9CA3AF" />
      </View>
      <Text className="text-lg font-semibold text-center" style={{ color: colors.text }}>
        No notifications yet
      </Text>
      <Text className="text-sm text-center mt-2" style={{ color: colors.textSecondary }}>
        You'll see friend requests, event updates, achievements, and more here
      </Text>
    </View>
  );
}

export default function ActivityScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, colors } = useTheme();
  const { data: session, isPending: sessionLoading } = useSession();
  const [refreshing, setRefreshing] = useState(false);

  // Fetch notifications
  const {
    data: notificationsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<GetNotificationsResponse>("/api/notifications"),
    enabled: !!session,
    staleTime: 30000,
  });

  // Mark notification as read
  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      api.put(`/api/notifications/${notificationId}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Mark all notifications as read
  const markAllReadMutation = useMutation({
    mutationFn: () => api.put("/api/notifications/read-all", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = notificationsData?.notifications ?? [];
  const unreadCount = notificationsData?.unreadCount ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleNotificationPress = (notification: Notification) => {
    // Parse notification data to route appropriately
    try {
      const data = notification.data ? JSON.parse(notification.data) : {};
      if (data.eventId) {
        router.push(`/event/${data.eventId}` as any);
      } else if (data.friendId || notification.type === "friend_request" || notification.type === "friend_accepted") {
        router.push("/friends" as any);
      } else if (data.achievementId) {
        router.push("/achievements" as any);
      }
    } catch {
      // If data parsing fails, just mark as read
    }
  };

  // Show login prompt if not authenticated
  if (!session && !sessionLoading) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <View className="flex-1 items-center justify-center px-8">
          <Text
            className="text-xl font-semibold text-center mb-2"
            style={{ color: colors.text }}
          >
            Sign in to see notifications
          </Text>
          <Text
            className="text-center text-sm mb-6"
            style={{ color: colors.textSecondary }}
          >
            Stay updated with friend requests, event invites, and more.
          </Text>
          <Pressable
            onPress={() => router.push("/login")}
            className="px-6 py-3 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      edges={["top"]}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b" style={{ borderBottomColor: colors.separator }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          className="w-10 h-10 items-center justify-center"
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View className="flex-row items-center">
          <Text className="text-lg font-semibold" style={{ color: colors.text }}>
            Notifications
          </Text>
          {unreadCount > 0 && (
            <View
              className="ml-2 px-2 py-0.5 rounded-full min-w-[24px] items-center"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-xs font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </View>
        {unreadCount > 0 ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              markAllReadMutation.mutate();
            }}
            className="px-3 py-1"
          >
            <Text className="text-sm font-medium" style={{ color: themeColor }}>
              Mark all
            </Text>
          </Pressable>
        ) : (
          <View className="w-16" />
        )}
      </View>

      {/* Content */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <NotificationCard
            notification={item}
            index={index}
            onPress={() => handleNotificationPress(item)}
            onMarkRead={() => markReadMutation.mutate(item.id)}
          />
        )}
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: 100,
          flexGrow: notifications.length === 0 ? 1 : undefined,
        }}
        ListEmptyComponent={isLoading ? <ActivityFeedSkeleton /> : <EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColor}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
