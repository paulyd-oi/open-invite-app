import React, { useState, useCallback, useRef, useMemo } from "react";
import { View, Text, Pressable, RefreshControl, FlatList, ActivityIndicator, ScrollView } from "react-native";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { devLog, devWarn } from "@/lib/devLog";
import { trackNotificationMarkRead, trackNotifsEngagement } from "@/analytics/analyticsEventsSSOT";
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
import { usePaginatedNotifications } from "@/hooks/usePaginatedNotifications";
import { ActivityFeedSkeleton } from "@/components/SkeletonLoader";
import { EntityAvatar } from "@/components/EntityAvatar";
import { safeToast } from "@/lib/safeToast";
import { qk } from "@/lib/queryKeys";
import { type Notification } from "@/shared/contracts";

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
  const { colors, themeColor } = useTheme();
  const router = useRouter();

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
      <Text className="text-sm text-center mt-2 mb-5" style={{ color: colors.textSecondary }}>
        You'll see friend requests, event updates, and more here
      </Text>
      <Pressable
        onPress={() => router.push("/social" as any)}
        className="px-5 py-2.5 rounded-full"
        style={{ backgroundColor: themeColor }}
      >
        <Text className="text-sm font-semibold" style={{ color: "#fff" }}>Go to Feed</Text>
      </Pressable>
    </View>
  );
}

// ── ErrorState ───────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { colors, themeColor } = useTheme();

  return (
    <View className="flex-1 items-center justify-center px-8 py-20">
      <Ionicons name="cloud-offline-outline" size={36} color={colors.textTertiary} />
      <Text className="text-sm text-center mt-3 mb-4" style={{ color: colors.textSecondary }}>
        Couldn't load notifications
      </Text>
      <Pressable onPress={onRetry} className="px-5 py-2 rounded-full" style={{ backgroundColor: themeColor }}>
        <Text className="text-sm font-semibold" style={{ color: "#fff" }}>Try Again</Text>
      </Pressable>
    </View>
  );
}

// ── FilteredEmptyState ────────────────────────────────────────

function FilteredEmptyState({ filter, colors, onReset }: { filter: NotificationFilter; colors: any; onReset: () => void }) {
  const label = NOTIFICATION_FILTERS.find(f => f.key === filter)?.label ?? filter;
  return (
    <View className="items-center justify-center px-8 py-16">
      <Ionicons name="filter-outline" size={28} color={colors.textTertiary} />
      <Text className="text-sm text-center mt-3" style={{ color: colors.textSecondary }}>
        No {label.toLowerCase()} notifications
      </Text>
      <Pressable onPress={onReset} className="mt-3 px-4 py-1.5 rounded-full" style={{ backgroundColor: colors.surface }}>
        <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>Show all</Text>
      </Pressable>
    </View>
  );
}

// ── Pagination footer ──────────────────────────────────────────

function PaginationFooter({ colors }: { colors: { textTertiary: string } }) {
  return (
    <View style={{ paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
      <ActivityIndicator size="small" color={colors.textTertiary} />
      <Text style={{ color: colors.textTertiary, fontSize: 13 }}>Loading more…</Text>
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

// ── Filter definitions ────────────────────────────────────────

type NotificationFilter = "all" | "events" | "friends" | "reminders";

const NOTIFICATION_FILTERS: { key: NotificationFilter; label: string; iconName: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "all", label: "All", iconName: "list-outline" },
  { key: "events", label: "Events", iconName: "calendar-outline" },
  { key: "friends", label: "Friends", iconName: "people-outline" },
  { key: "reminders", label: "Reminders", iconName: "notifications-outline" },
];

const FILTER_TYPE_MAP: Record<NotificationFilter, Set<string> | null> = {
  all: null, // null = no filter, show everything
  events: new Set(["event_invite", "event_join", "event_comment"]),
  friends: new Set(["friend_request", "friend_accepted"]),
  reminders: new Set(["event_reminder", "reminder"]),
};

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
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const { markAllSeen } = useMarkAllNotificationsSeen();

  // Fetch notifications via paginated hook (fallback-safe)
  const {
    notifications: uniqueNotifications,
    unreadCount,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    onEndReached,
  } = usePaginatedNotifications({
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // [NOTIFICATIONS] Filter notifications by active filter
  const filteredNotifications = useMemo(() => {
    const typeSet = FILTER_TYPE_MAP[activeFilter];
    const all = uniqueNotifications;
    const filtered = typeSet ? all.filter(n => typeSet.has(n.type)) : all;

    if (__DEV__ && all.length > 0) {
      // Compute type distribution
      const typeCounts: Record<string, number> = {};
      for (const n of all) {
        typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;
      }
      devLog('[NOTIFICATIONS]', {
        total: all.length,
        activeFilter,
        displayed: filtered.length,
        typeCounts,
      });
    }
    return filtered;
  }, [uniqueNotifications, activeFilter]);

  // [P1_ENDREACHED_GUARD] Block onEndReached while fetching next page
  const guardedOnEndReached = useCallback(() => {
    if (isFetchingNextPage) {
      if (__DEV__) devLog("[P1_ENDREACHED_GUARD]", "screen=activity", "reason=inflight");
      return;
    }
    onEndReached();
  }, [isFetchingNextPage, onEndReached]);

  // [P1_NOTIF_OPTIMISTIC_READ] Concurrency guard — prevent duplicate mark-read for same id
  const markingReadRef = useRef(new Set<string>());

  // Mark notification as read (individual) with optimistic cache update
  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      api.put(`/api/notifications/${notificationId}/read`, {}),
    onMutate: async (notificationId: string) => {
      if (markingReadRef.current.has(notificationId)) {
        if (__DEV__) devLog("[P1_NOTIF_OPTIMISTIC_READ]", { id: notificationId, optimisticApplied: false, reason: "duplicate" });
        return { skipped: true };
      }
      markingReadRef.current.add(notificationId);

      await queryClient.cancelQueries({ queryKey: qk.notifications() });
      const prevData = queryClient.getQueriesData({ queryKey: qk.notifications() });

      // Optimistic: set read=true + decrement unreadCount
      queryClient.setQueriesData<InfiniteData<{ notifications: Notification[]; unreadCount: number; nextCursor?: string | null }>>(
        { queryKey: qk.notifications() },
        (old) => {
          if (!old) return old;
          let flipped = false;
          const pages = old.pages.map((page) => {
            const notifications = page.notifications.map((n) => {
              if (n.id === notificationId && !n.read) {
                flipped = true;
                return { ...n, read: true };
              }
              return n;
            });
            return { ...page, notifications };
          });
          if (flipped && pages.length > 0 && pages[0].unreadCount > 0) {
            pages[0] = { ...pages[0], unreadCount: pages[0].unreadCount - 1 };
          }
          return { ...old, pages };
        },
      );

      if (__DEV__) devLog("[P1_NOTIF_OPTIMISTIC_READ]", { id: notificationId, optimisticApplied: true });
      trackNotificationMarkRead({ sourceScreen: "activity", optimisticApplied: true, rollbackUsed: false });
      return { prevData, skipped: false };
    },
    onError: (_err, notificationId, context) => {
      if (context && !context.skipped && context.prevData) {
        for (const [key, data] of context.prevData) {
          queryClient.setQueryData(key, data);
        }
        if (__DEV__) devLog("[P1_NOTIF_OPTIMISTIC_READ]", { id: notificationId, rollbackUsed: true });
        trackNotificationMarkRead({ sourceScreen: "activity", optimisticApplied: true, rollbackUsed: true });
      }
    },
    onSettled: (_data, _err, notificationId) => {
      markingReadRef.current.delete(notificationId);
      queryClient.invalidateQueries({ queryKey: UNSEEN_COUNT_QUERY_KEY });
    },
  });

  // Mark all as seen when visible
  useFocusEffect(
    useCallback(() => {
      trackNotifsEngagement({ action: "view_list", routeTargeted: false });
      if (unreadCount > 0) {
        markAllSeen();
      }
    }, [unreadCount, markAllSeen])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const { mutate: markRead } = markReadMutation;

  const handleNotificationPress = useCallback((notification: Notification) => {
    if (!notification.read) {
      markRead(notification.id);
    }

    const target = resolveNotificationTarget(notification);
    trackNotifsEngagement({ action: "tap_item", routeTargeted: !!target });
    if (target) {
      router.push(target as any);
    } else {
      safeToast.info("Unavailable", "This item is no longer available.");
      if (__DEV__) {
        devWarn("[Activity] Notification has no valid navigation target:", notification.id);
      }
    }
  }, [markRead, router]);

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

  // [NOTIFICATIONS] Filter chips — shown above the list
  // MUST be above all early returns to satisfy React's hooks-order invariant.
  const filterChipsHeader = useMemo(() => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{ flexGrow: 0 }}
    >
      {/* INVARIANT_ALLOW_SMALL_MAP */}
      {NOTIFICATION_FILTERS.map((f) => {
        const isActive = activeFilter === f.key;
        return (
          <Pressable
            key={f.key}
            /* INVARIANT_ALLOW_INLINE_HANDLER */
            onPress={() => {
              Haptics.selectionAsync();
              setActiveFilter(f.key);
            }}
            className="flex-row items-center rounded-full px-3.5 py-1.5"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{
              backgroundColor: isActive ? themeColor : colors.surface,
              borderWidth: 1,
              borderColor: isActive ? themeColor : colors.border,
            }}
          >
            <Ionicons
              name={f.iconName}
              size={14}
              color={isActive ? "#fff" : colors.textSecondary}
              style={{ marginRight: 4 }}
            />
            <Text
              className="text-xs font-semibold"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ color: isActive ? "#fff" : colors.textSecondary }}
            >
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  ), [activeFilter, themeColor, colors]);

  // Not authenticated — show nothing in embedded mode, callers handle auth
  if (!session && embedded) {
    return null;
  }

  // Empty state for filtered view (different from "no notifications at all")
  const filteredEmptyState = activeFilter !== "all" && filteredNotifications.length === 0 && uniqueNotifications.length > 0;

  return (
    <FlatList
      data={filteredNotifications}
      keyExtractor={activityKeyExtractor}
      renderItem={renderNotificationItem}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={9}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={true}
      contentContainerStyle={{
        paddingTop: embedded ? 4 : 12,
        paddingBottom: embedded ? 20 : 100,
        flexGrow: filteredNotifications.length === 0 ? 1 : undefined,
      }}
      ListHeaderComponent={uniqueNotifications.length > 0 || activeFilter !== "all" ? filterChipsHeader : null}
      ListEmptyComponent={
        isLoading ? <ActivityFeedSkeleton /> :
        isError ? <ErrorState onRetry={onRefresh} /> :
        filteredEmptyState ? <FilteredEmptyState filter={activeFilter} colors={colors} onReset={() => setActiveFilter("all")} /> :
        <EmptyState />
      }
      ListFooterComponent={isFetchingNextPage ? <PaginationFooter colors={colors} /> : null}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />
      }
      showsVerticalScrollIndicator={false}
      onEndReached={hasNextPage ? guardedOnEndReached : undefined}
      onEndReachedThreshold={0.3}
      // When embedded inside a ScrollView parent, let the parent handle scrolling
      nestedScrollEnabled={embedded}
      scrollEnabled={!embedded}
    />
  );
}
