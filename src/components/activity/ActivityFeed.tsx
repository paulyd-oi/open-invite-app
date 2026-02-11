import React, { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, RefreshControl, FlatList } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useMarkAllNotificationsSeen, UNSEEN_COUNT_QUERY_KEY } from "@/hooks/useUnseenNotifications";
import { ActivityFeedSkeleton } from "@/components/SkeletonLoader";
import { EntityAvatar } from "@/components/EntityAvatar";
import { safeToast } from "@/lib/safeToast";
import { type GetNotificationsResponse, type Notification } from "@/shared/contracts";

// ── Helpers ────────────────────────────────────────────────────

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

function parseNotificationData(notification: Notification): {
  actorName?: string;
  actorAvatarUrl?: string;
  eventTitle?: string;
  eventId?: string;
  eventEmoji?: string;
  userId?: string;
  commentId?: string;
} {
  try {
    if (!notification.data) return {};
    const data = JSON.parse(notification.data);
    return {
      actorName: data.actorName || data.senderName || data.userName || data.name,
      actorAvatarUrl: data.actorAvatarUrl || data.actorImage || data.senderAvatarUrl || data.userAvatarUrl || data.avatarUrl || data.image,
      eventTitle: data.eventTitle || data.title,
      eventId: data.eventId,
      eventEmoji: data.eventEmoji,
      userId: data.userId || data.senderId || data.actorId,
      commentId: data.commentId,
    };
  } catch {
    return {};
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

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
    if (actorName) {
      return {
        primary: { bold: actorName, rest: " commented" },
        secondary: eventTitle ? `On ${eventTitle}` : undefined,
      };
    }
    return {
      primary: notification.title || "New comment",
      secondary: eventTitle || notification.body || undefined,
    };
  }

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

// ── NotificationCard ───────────────────────────────────────────

function NotificationCard({
  notification,
  index,
  onPress,
}: {
  notification: Notification;
  index: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const config =
    notificationTypeConfig[notification.type] ?? notificationTypeConfig.default;
  const parsed = parseNotificationData(notification);
  const { actorName, actorAvatarUrl, eventEmoji } = parsed;
  const copy = buildNotificationCopy(notification, parsed);

  const hasAvatar = !!actorAvatarUrl && actorAvatarUrl.startsWith("http");
  const isEventType = ["event_invite", "event_reminder", "event_join", "event_comment"].includes(notification.type);
  const resolvedEmoji = eventEmoji || (isEventType ? "📅" : undefined);
  const hasEventEmoji = !hasAvatar && !!resolvedEmoji;
  const hasActorInitials = !hasAvatar && !hasEventEmoji && !!actorName && actorName.length > 0;

  if (__DEV__) {
    const avatarSource = hasAvatar ? "actorAvatar" : hasEventEmoji ? (eventEmoji ? "eventEmoji" : "eventDefault") : hasActorInitials ? "actorInitials" : "typeIcon";
    devLog("[P1_ACTIVITY_AVATAR]", {
      notificationType: notification.type,
      avatarSource,
      hasEventEmoji: !!eventEmoji,
      resolvedEmoji: resolvedEmoji ?? null,
    });
  }

  const categoryTint = notification.read ? colors.surface : config.color + "08";
  const categoryBorder = notification.read ? "transparent" : config.color + "20";

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 300)).springify()}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        className="mx-4 mb-2 px-4 py-3 rounded-2xl flex-row items-center"
        style={{
          backgroundColor: categoryTint,
          borderWidth: notification.read ? 0 : 1,
          borderColor: categoryBorder,
        }}
      >
        {/* Avatar or Icon — SSOT via EntityAvatar */}
        <View style={{ position: "relative" }}>
          <EntityAvatar
            photoUrl={hasAvatar ? actorAvatarUrl : undefined}
            emoji={hasEventEmoji ? resolvedEmoji : undefined}
            initials={hasActorInitials ? getInitials(actorName!) : undefined}
            fallbackIcon={config.iconName}
            size={44}
            backgroundColor={
              hasAvatar
                ? colors.surface
                : hasEventEmoji
                  ? config.color + "15"
                  : config.color + "20"
            }
            foregroundColor={config.color}
            emojiStyle={{ fontSize: 22 }}
          />
          {/* Type badge overlay */}
          {(hasAvatar || hasEventEmoji) && (
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

          {copy.secondary ? (
            <Text
              className="text-sm mt-0.5"
              style={{ color: colors.textSecondary }}
              numberOfLines={1}
            >
              {copy.secondary}
            </Text>
          ) : null}

          <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
            {formatRelativeTime(notification.createdAt)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── EmptyState ─────────────────────────────────────────────────

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
        You'll see friend requests, event updates, and more here
      </Text>
    </View>
  );
}

// ── Notification target resolver ───────────────────────────────

function resolveNotificationTarget(notification: Notification): string | null {
  let data: Record<string, unknown> = {};
  try {
    data = notification.data ? JSON.parse(notification.data) : {};
  } catch {
    return null;
  }

  const eventId = data.eventId;
  if (eventId && typeof eventId === "string") {
    return `/event/${eventId}`;
  }

  const userId = data.userId || data.senderId || data.actorId;
  if (userId && typeof userId === "string") {
    return `/user/${userId}`;
  }

  return null;
}

// ── ActivityFeed (reusable) ────────────────────────────────────

export interface ActivityFeedProps {
  /**
   * When true, renders without SafeAreaView/header chrome.
   * Used when embedded inside another screen (e.g. Friends pane).
   */
  embedded?: boolean;
}

export function ActivityFeed({ embedded = false }: ActivityFeedProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const [refreshing, setRefreshing] = useState(false);
  const { markAllSeen } = useMarkAllNotificationsSeen();

  // Fetch notifications
  const { data: notificationsData, isLoading, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<GetNotificationsResponse>("/api/notifications"),
    enabled: isAuthedForNetwork(bootStatus, session),
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

  // Mark all as seen when visible
  useFocusEffect(
    useCallback(() => {
      if (notificationsData?.unreadCount && notificationsData.unreadCount > 0) {
        markAllSeen();
      }
    }, [notificationsData?.unreadCount, markAllSeen])
  );

  // Defensive de-dupe
  const uniqueNotifications = useMemo(() => {
    const notifications = notificationsData?.notifications ?? [];
    return Array.from(new Map(notifications.map(n => [n.id, n])).values());
  }, [notificationsData?.notifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleNotificationPress = useCallback((notification: Notification) => {
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }

    const target = resolveNotificationTarget(notification);
    if (target) {
      router.push(target as any);
    } else {
      safeToast.info("Unavailable", "This item is no longer available.");
      if (__DEV__) {
        devWarn("[Activity] Notification has no valid navigation target:", notification.id);
      }
    }
  }, [markReadMutation, router]);

  const activityKeyExtractor = useCallback((item: Notification) => item.id, []);
  const renderNotificationItem = useCallback(
    ({ item, index }: { item: Notification; index: number }) => (
      <NotificationCard
        notification={item}
        index={index}
        onPress={() => handleNotificationPress(item)}
      />
    ),
    [handleNotificationPress],
  );

  // Not authenticated — show nothing in embedded mode, callers handle auth
  if (!session && embedded) {
    return null;
  }

  return (
    <FlatList
      data={uniqueNotifications}
      keyExtractor={activityKeyExtractor}
      renderItem={renderNotificationItem}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={9}
      contentContainerStyle={{
        paddingTop: embedded ? 4 : 12,
        paddingBottom: embedded ? 20 : 100,
        flexGrow: uniqueNotifications.length === 0 ? 1 : undefined,
      }}
      ListEmptyComponent={isLoading ? <ActivityFeedSkeleton /> : <EmptyState />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />
      }
      showsVerticalScrollIndicator={false}
      // When embedded inside a ScrollView parent, let the parent handle scrolling
      nestedScrollEnabled={embedded}
      scrollEnabled={!embedded}
    />
  );
}
