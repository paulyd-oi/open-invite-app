import React from "react";
import { View, Text, Pressable, FlatList, Platform } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Bell,
  Users,
  List,
  LayoutGrid,
} from "@/ui/icons";
import { EntityAvatar } from "@/components/EntityAvatar";
import { FriendsListSkeleton } from "@/components/SkeletonLoader";
import { ShareAppButton } from "@/components/ShareApp";
import { useTheme } from "@/lib/ThemeContext";
import { devLog } from "@/lib/devLog";
import type {
  Friendship,
  FriendRequest,
} from "@/shared/contracts";

// ── FriendRequestCard (moved from ActivityPane — SSOT) ─────────
function FriendRequestCard({
  request,
  type,
  onAccept,
  onReject,
  actionPending = false,
  themeColor,
  isDark,
  colors,
  onViewProfile,
}: {
  request: FriendRequest;
  type: "received" | "sent";
  onAccept?: () => void;
  onReject?: () => void;
  actionPending?: boolean;
  themeColor: string;
  isDark: boolean;
  colors: any;
  onViewProfile?: () => void;
}) {
  const user = type === "received" ? request.sender : request.receiver;
  const mutualCount = request.mutualCount ?? 0;
  
  // Extract profile info from sender/receiver
  const username = user?.Profile?.handle;
  const calendarBio = user?.Profile?.calendarBio;
  
  // Build metadata line segments (Line 2)
  // Format: "X mutual friends • @username • calendarBio" or "New to Open Invite • @username • calendarBio"
  const metadataSegments: string[] = [];
  
  if (type === "received") {
    if (mutualCount > 0) {
      metadataSegments.push(`👥 ${mutualCount} mutual friend${mutualCount === 1 ? "" : "s"}`);
    } else {
      metadataSegments.push("New to Open Invite");
    }
  } else {
    metadataSegments.push("Pending");
  }
  
  if (username) {
    metadataSegments.push(`@${username}`);
  }
  
  if (calendarBio) {
    metadataSegments.push(calendarBio);
  }
  
  const metadataLine = metadataSegments.join(" • ");

  return (
    <Pressable
      /* INVARIANT_ALLOW_INLINE_HANDLER */
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onViewProfile?.();
      }}
      className="flex-row items-center rounded-xl p-3 mb-2"
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <EntityAvatar
        photoUrl={user?.image}
        initials={user?.name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?"}
        size={40}
        backgroundColor={user?.image ? colors.avatarBg : themeColor + "20"}
        foregroundColor={themeColor}
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        style={{ marginRight: 12 }}
      />
      <View className="flex-1 mr-2">
        {/* Line 1: Name + Badge Pill */}
        <View className="flex-row items-center flex-nowrap gap-1.5">
          <Text 
            className="font-medium" 
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ color: colors.text }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {user?.name ?? user?.email ?? "Unknown"}
          </Text>
        </View>
        {/* Line 2: Metadata (mutual friends • @username • calendarBio) */}
        <Text 
          className="text-xs mt-0.5" 
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{ color: colors.textSecondary }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {metadataLine}
        </Text>
      </View>
      {type === "received" && (
        <View className="flex-row">
          <Pressable
            testID="friend-request-reject"
            /* INVARIANT_ALLOW_INLINE_HANDLER */
            onPress={(e) => {
              e.stopPropagation();
              onReject?.();
            }}
            disabled={actionPending}
            className="w-8 h-8 rounded-full items-center justify-center mr-2"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: colors.inputBg, opacity: actionPending ? 0.4 : 1 }}
          >
            <X size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            testID="friend-request-accept"
            /* INVARIANT_ALLOW_INLINE_HANDLER */
            onPress={(e) => {
              e.stopPropagation();
              onAccept?.();
            }}
            disabled={actionPending}
            className="w-8 h-8 rounded-full items-center justify-center"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: themeColor, opacity: actionPending ? 0.4 : 1 }}
          >
            <Check size={16} color="#fff" />
          </Pressable>
        </View>
      )}
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <ChevronRight size={16} color={colors.textTertiary} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

// ── Props ──────────────────────────────────────────────────────
export interface FriendsPeoplePaneProps {
  // Friend Requests
  receivedRequests: FriendRequest[];
  requestsExpanded: boolean;
  onToggleRequestsExpanded: () => void;
  isAcceptPending: boolean;
  isRejectPending: boolean;
  onAcceptRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
  // Friends list (existing)
  filteredFriends: Friendship[];
  friendsExpanded: boolean;
  onToggleFriendsExpanded: () => void;
  viewMode: "list" | "detailed";
  onViewModeChange: (mode: "list" | "detailed") => void;
  isLoading: boolean;
  pinnedFriendshipIds: Set<string>;
  friendKeyExtractor: (item: Friendship) => string;
  renderFriendListItem: (info: { item: Friendship; index: number }) => React.ReactElement | null;
  renderFriendCard: (info: { item: Friendship; index: number }) => React.ReactElement | null;
}

// ── Component ──────────────────────────────────────────────────
export function FriendsPeoplePane({
  receivedRequests,
  requestsExpanded,
  onToggleRequestsExpanded,
  isAcceptPending,
  isRejectPending,
  onAcceptRequest,
  onRejectRequest,
  filteredFriends,
  friendsExpanded,
  onToggleFriendsExpanded,
  viewMode,
  onViewModeChange,
  isLoading,
  pinnedFriendshipIds,
  friendKeyExtractor,
  renderFriendListItem,
  renderFriendCard,
}: FriendsPeoplePaneProps) {
  const { themeColor, isDark, colors } = useTheme();
  const router = useRouter();

  return (
    <>
      {/* ── Friend Requests ────────────────────────────────── */}
      {receivedRequests.length > 0 && (
        <View testID="friends-requests" className="mb-4">
          <Pressable
            /* INVARIANT_ALLOW_INLINE_HANDLER */
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleRequestsExpanded();
            }}
            className="flex-row items-center justify-between mb-2"
          >
            <View className="flex-row items-center">
              <Bell size={16} color={themeColor} />
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
                Friend Requests ({receivedRequests.length})
              </Text>
            </View>
            {requestsExpanded ? (
              <ChevronUp size={18} color={colors.textTertiary} />
            ) : (
              <ChevronDown size={18} color={colors.textTertiary} />
            )}
          </Pressable>
          {requestsExpanded && (
            <Animated.View entering={FadeInDown.duration(200)}>
              {/* INVARIANT_ALLOW_SMALL_MAP */}
              {receivedRequests.map((request: FriendRequest) => {
                const senderId = request.sender?.id;
                return (
                  <FriendRequestCard
                    key={request.id}
                    request={request}
                    type="received"
                    themeColor={themeColor}
                    isDark={isDark}
                    colors={colors}
                    actionPending={isAcceptPending || isRejectPending}
                    onAccept={() => {
                      if (isAcceptPending || isRejectPending) {
                        if (__DEV__) devLog('[P0_FRIEND_REQUEST_RACE_GUARD]', 'accept tap ignored, requestId=' + request.id);
                        return;
                      }
                      onAcceptRequest(request.id);
                    }}
                    onReject={() => {
                      if (isAcceptPending || isRejectPending) {
                        if (__DEV__) devLog('[P0_FRIEND_REQUEST_RACE_GUARD]', 'reject tap ignored, requestId=' + request.id);
                        return;
                      }
                      onRejectRequest(request.id);
                    }}
                    onViewProfile={() => {
                      if (senderId) {
                        router.push(`/user/${senderId}` as any);
                      }
                    }}
                  />
                );
              })}
            </Animated.View>
          )}
        </View>
      )}

      {/* ── Friends List - Collapsible (existing) ────────────── */}
      <View className="mb-2">
        {/* Section Header Row */}
        <Pressable
          /* INVARIANT_ALLOW_INLINE_HANDLER */
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggleFriendsExpanded();
          }}
          className="flex-row items-center justify-between"
        >
          <View className="flex-row items-center">
            <Users size={16} color="#4ECDC4" />
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
              Friends ({filteredFriends.length})
            </Text>
          </View>
          {friendsExpanded ? (
            <ChevronUp size={18} color={colors.textTertiary} />
          ) : (
            <ChevronDown size={18} color={colors.textTertiary} />
          )}
        </Pressable>

        {/* View Mode Toggle & Filter - Only show when expanded */}
        {friendsExpanded && (
          <View className="flex-row items-center justify-between mt-2">
            {/* View Mode Toggle */}
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <View className="flex-row items-center rounded-lg p-0.5" style={{ backgroundColor: colors.surface2 }}>
              <Pressable
                /* INVARIANT_ALLOW_INLINE_HANDLER */
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onViewModeChange("list");
                }}
                className="flex-row items-center px-2.5 py-1 rounded-md"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ backgroundColor: viewMode === "list" ? colors.surface : "transparent" }}
              >
                <List size={14} color={viewMode === "list" ? themeColor : colors.textSecondary} />
                <Text
                  className="text-xs font-medium ml-1"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ color: viewMode === "list" ? themeColor : colors.textSecondary }}
                >
                  List
                </Text>
              </Pressable>
              <Pressable
                /* INVARIANT_ALLOW_INLINE_HANDLER */
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onViewModeChange("detailed");
                }}
                className="flex-row items-center px-2.5 py-1 rounded-md"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ backgroundColor: viewMode === "detailed" ? colors.surface : "transparent" }}
              >
                <LayoutGrid size={14} color={viewMode === "detailed" ? themeColor : colors.textSecondary} />
                <Text
                  className="text-xs font-medium ml-1"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ color: viewMode === "detailed" ? themeColor : colors.textSecondary }}
                >
                  Detailed
                </Text>
              </Pressable>
            </View>
            {/* [LEGACY_GROUPS_PURGED] Group Filter Button removed */}
          </View>
        )}
      </View>

      {friendsExpanded && (
        <Animated.View entering={FadeInDown.duration(200)}>
          {isLoading ? (
            <FriendsListSkeleton />
          ) : filteredFriends.length === 0 ? (
            <View className="py-12 items-center px-8">
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: `${themeColor}15` }}>
                <Users size={36} color={themeColor} />
              </View>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-xl font-semibold text-center mb-2" style={{ color: colors.text }}>
                No friends yet
              </Text>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-sm text-center leading-5 mb-6" style={{ color: colors.textSecondary }}>
                Invite friends to see their plans and share yours
              </Text>
              <ShareAppButton variant="full" />
            </View>
          ) : (
            <FlatList
              data={filteredFriends}
              keyExtractor={friendKeyExtractor}
              renderItem={viewMode === "list" ? renderFriendListItem : renderFriendCard}
              // Virtualization tuning for smooth scroll with 50+ friends
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={9}
              updateCellsBatchingPeriod={50}
              removeClippedSubviews={Platform.OS === 'android'} // Safe on Android, can cause issues on iOS
              // Allow nested scrolling inside parent ScrollView
              nestedScrollEnabled
              scrollEnabled={false} // Let parent ScrollView handle scrolling
              // Stable list - avoid re-renders
              extraData={pinnedFriendshipIds}
            />
          )}
        </Animated.View>
      )}
    </>
  );
}
