import React from "react";
import { View, Text, Pressable, FlatList, Platform } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Users, ChevronUp, ChevronDown, List, LayoutGrid } from "@/ui/icons";
import { FriendsListSkeleton } from "@/components/SkeletonLoader";
import { ShareAppButton } from "@/components/ShareApp";
import { useTheme } from "@/lib/ThemeContext";
import type { Friendship } from "@/shared/contracts";

// ── Props ──────────────────────────────────────────────────────
export interface FriendsPeoplePaneProps {
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
  const { themeColor, colors } = useTheme();

  return (
    <>
      {/* Friends List - Collapsible */}
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
