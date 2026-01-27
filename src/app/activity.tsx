import React, { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, Pressable, RefreshControl, FlatList, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useMarkAllNotificationsSeen, UNSEEN_COUNT_QUERY_KEY } from "@/hooks/useUnseenNotifications";
import { ActivityFeedSkeleton } from "@/components/SkeletonLoader";
import { ChevronRight } from "@/ui/icons";
import { type GetNotificationsResponse, type Notification } from "@/shared/contracts";

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
const notificationTypeConfig: Record<
  string,
  { iconName: React.ComponentProps<typeof Ionicons>["name"]; color: string }
> = {
  friend_request: { iconName: "person-add-outline", color: "#2196F3" },
  friend_accepted: { iconName: "people-outline", color: "#4CAF50" },
  event_invite: { iconName: "calendar-outline", color: "#FF6B4A" },
  event_reminder: { iconName: "notifications-outline", color: "#F59E0B" },
  event_join: { iconName: "checkmark-circle-outline", color: "#10B981" },
  event_comment: { iconName: "chatbubble-outline", color: "#8B5CF6" },
  achievement: { iconName: "star-outline", color: "#9333EA" },
  referral: { iconName: "gift-outline", color: "#EC4899" },
  default: { iconName: "notifications-outline", color: "#6B7280" },
};

// Helper to extract actor info from notification data
function parseNotificationData(notification: Notification): {
  actorName?: string;
  actorAvatarUrl?: string;
  eventTitle?: string;
  eventId?: string;
  commentId?: string;
} {
  try {
    if (!notification.data) return {};
    const data = JSON.parse(notification.data);
    return {
      // Support both old and new key names for actor info
      actorName: data.actorName || data.senderName || data.userName,
      actorAvatarUrl: data.actorAvatarUrl || data.actorImage || data.senderAvatarUrl || data.userAvatarUrl,
      // Event info
      eventTitle: data.eventTitle || data.title,
      eventId: data.eventId,
      // Comment-specific
      commentId: data.commentId,
    };
  } catch {
    return {};
  }
}

// Helper to get initials from a name
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Helper to build notification copy based on type and parsed data
type ParsedNotificationData = ReturnType<typeof parseNotificationData>;

function buildNotificationCopy(
  notification: Notification,
  parsed: ParsedNotificationData
): {
  primary: { bold: string; rest: string } | string;
  secondary: string | undefined;
} {
  const { actorName, eventTitle } = parsed;

  if (notification.type === "event_comment") {
    // event_comment: "{actorName} commented" / "On {eventTitle}"
    if (actorName) {
      return {
        primary: { bold: actorName, rest: " commented" },
        secondary: eventTitle ? `On ${eventTitle}` : undefined,
      };
    }
    // Fallback if no actorName
    return {
      primary: notification.title || "New comment",
      secondary: eventTitle || notification.body || undefined,
    };
  }

  // Default handling for other notification types
  if (actorName) {
    return {
      primary: { bold: actorName, rest: "" },
      secondary: eventTitle || notification.body || undefined,
    };
  }

  return {
    primary: notification.title,
    secondary: notification.body !== notification.title ? notification.body : undefined,
  };
}

// Notification Card Component - Enhanced social UI
function NotificationCard({
  notification,
  index,
  onPress,
}: {
  notification: Notification;
  index: number;
  onPress: () => void;
}) {
  const { themeColor, colors } = useTheme();
  const config =
    notificationTypeConfig[notification.type] ?? notificationTypeConfig.default;
  const parsed = parseNotificationData(notification);
  const { actorName, actorAvatarUrl } = parsed;
  const copy = buildNotificationCopy(notification, parsed);

  // Use actor avatar if available, otherwise fall back to type icon
  const hasAvatar = !!actorAvatarUrl;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 300)).springify()}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        className="mx-4 mb-2 px-4 py-3 rounded-2xl flex-row items-center"
        style={{
          backgroundColor: notification.read ? colors.surface : themeColor + "08",
          borderWidth: notification.read ? 0 : 1,
          borderColor: notification.read ? "transparent" : themeColor + "20",
        }}
      >
        {/* Avatar or Icon */}
        <View style={{ position: "relative" }}>
          {hasAvatar ? (
            <Image
              source={{ uri: actorAvatarUrl }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.surface,
              }}
            />
          ) : actorName ? (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: config.color + "20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: config.color }}>
                {getInitials(actorName)}
              </Text>
            </View>
          ) : (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: config.color + "20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={config.iconName} size={22} color={config.color} />
            </View>
          )}
          {/* Type badge overlay */}
          {hasAvatar && (
            <View
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: config.color,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: colors.background,
              }}
            >
              <Ionicons name={config.iconName} size={10} color="#fff" />
            </View>
          )}
        </View>

        {/* Content */}
        <View className="flex-1 ml-3">
          {/* Title line - using buildNotificationCopy */}
          <Text
            className="text-sm"
            style={{ color: colors.text }}
            numberOfLines={2}
          >
            {typeof copy.primary === "object" ? (
              <>
                <Text style={{ fontWeight: "700" }}>{copy.primary.bold}</Text>
                <Text>{copy.primary.rest}</Text>
              </>
            ) : (
              <Text style={{ fontWeight: "600" }}>{copy.primary}</Text>
            )}
          </Text>
          
          {/* Subtitle */}
          {copy.secondary ? (
            <Text
              className="text-sm mt-0.5"
              style={{ color: colors.textSecondary }}
              numberOfLines={1}
            >
              {copy.secondary}
            </Text>
          ) : null}

          {/* Timestamp */}
          <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
            {formatRelativeTime(notification.createdAt)}
          </Text>
        </View>

        {/* Unread indicator */}
        <View className="flex-row items-center ml-2">
          {!notification.seen && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: themeColor,
              }}
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
        <Ionicons name="notifications-outline" size={36} color="#9CA3AF" />
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
  const { status: bootStatus } = useBootAuthority();
  const [refreshing, setRefreshing] = useState(false);
  const { markAllSeen } = useMarkAllNotificationsSeen();

  // Fetch notifications
  const { data: notificationsData, isLoading, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<GetNotificationsResponse>("/api/notifications"),
    enabled: bootStatus === 'authed',
    staleTime: 30000,
  });

  // Mark notification as read (individual)
  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      api.put(`/api/notifications/${notificationId}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: UNSEEN_COUNT_QUERY_KEY });
    },
  });

  // Instagram-style: Mark all as seen when screen gains focus
  useFocusEffect(
    useCallback(() => {
      // Only mark as seen if we have unread notifications
      if (notificationsData?.unreadCount && notificationsData.unreadCount > 0) {
        markAllSeen();
      }
    }, [notificationsData?.unreadCount, markAllSeen])
  );

  // Defensive de-dupe: ensure no duplicate notification IDs in list
  const uniqueNotifications = useMemo(() => {
    const notifications = notificationsData?.notifications ?? [];
    return Array.from(new Map(notifications.map(n => [n.id, n])).values());
  }, [notificationsData?.notifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleNotificationPress = (notification: Notification) => {
    // Mark as read if not already
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }
    
    // Parse notification data once
    let data: Record<string, unknown> = {};
    try {
      data = notification.data ? JSON.parse(notification.data) : {};
    } catch {
      // If data parsing fails, just stay on screen
      return;
    }

    // Handle event_comment: navigate to event if eventId exists
    if (notification.type === "event_comment") {
      if (data.eventId && typeof data.eventId === "string") {
        router.push(`/event/${data.eventId}` as any);
      }
      return;
    }

    // Handle other notification types with eventId
    if (data.eventId && typeof data.eventId === "string") {
      router.push(`/event/${data.eventId}` as any);
      return;
    }

    // Friend-related notifications
    if (
      data.friendId ||
      notification.type === "friend_request" ||
      notification.type === "friend_accepted"
    ) {
      router.push("/friends" as any);
      return;
    }

    // Achievement notifications
    if (data.achievementId) {
      router.push("/achievements" as any);
      return;
    }
  };

  // Show login prompt if not authenticated
  if (!session && !sessionLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-8">
          <Text
            className="text-xl font-semibold text-center mb-2"
            style={{ color: colors.text }}
          >
            Sign in to see notifications
          </Text>
          <Text className="text-center text-sm mb-6" style={{ color: colors.textSecondary }}>
            Stay updated with friend requests, event invites, and more.
          </Text>
          <Pressable
            onPress={() => router.replace("/login")}
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
      <View
        className="flex-row items-center justify-between px-4 py-3 border-b"
        style={{ borderBottomColor: colors.separator }}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          className="w-10 h-10 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>

        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
          Activity
        </Text>

        <View className="w-10" />
      </View>

      {/* Content */}
      <FlatList
        data={uniqueNotifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <NotificationCard
            notification={item}
            index={index}
            onPress={() => handleNotificationPress(item)}
          />
        )}
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: 100,
          flexGrow: uniqueNotifications.length === 0 ? 1 : undefined,
        }}
        ListEmptyComponent={isLoading ? <ActivityFeedSkeleton /> : <EmptyState />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
