import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  RefreshControl,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  UserPlus,
  ChevronLeft,
  Users,
  Check,
  Loader2,
} from "@/ui/icons";
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { SuggestionsSkeleton } from "@/components/SkeletonLoader";
import { EmptyState as EnhancedEmptyState } from "@/components/EmptyState";
import {
  type GetFriendSuggestionsResponse,
  type FriendSuggestion,
  type SendFriendRequestResponse,
} from "@/shared/contracts";

// Suggestion Card Component
function SuggestionCard({
  suggestion,
  index,
  onAddFriend,
  isPending,
  isSuccess,
}: {
  suggestion: FriendSuggestion;
  index: number;
  onAddFriend: () => void;
  isPending: boolean;
  isSuccess: boolean;
}) {
  const { themeColor, colors } = useTheme();
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const userName = suggestion.user?.name || (suggestion.user?.handle ? `@${suggestion.user.handle}` : "Unknown");
  const mutualCount = suggestion.mutualFriendCount;

  const handlePress = () => {
    scale.value = withSpring(0.98, {}, () => {
      scale.value = withSpring(1);
    });
    router.push(`/user/${suggestion.user.id}`);
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={animatedStyle}
    >
      <Pressable
        onPress={handlePress}
        className="mx-4 mb-3 p-4 rounded-2xl"
        style={{ backgroundColor: colors.surface }}
      >
        <View className="flex-row items-center">
          {/* User Avatar */}
          {suggestion.user.avatarUrl ? (
            <Image
              source={{ uri: suggestion.user.avatarUrl }}
              className="w-14 h-14 rounded-full"
            />
          ) : (
            <View
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: themeColor + "20" }}
            >
              <Text
                className="text-xl font-semibold"
                style={{ color: themeColor }}
              >
                {userName?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>
          )}

          {/* User Info */}
          <View className="flex-1 ml-3">
            <Text
              className="text-base font-semibold"
              style={{ color: colors.text }}
              numberOfLines={1}
            >
              {userName}
            </Text>

            {/* Mutual Friends */}
            <View className="flex-row items-center mt-1">
              <Users size={14} color={colors.textSecondary} />
              <Text
                className="text-sm ml-1"
                style={{ color: colors.textSecondary }}
              >
                {mutualCount} mutual friend{mutualCount !== 1 ? "s" : ""}
              </Text>
            </View>

            {/* Mutual Friend Avatars */}
            {suggestion.mutualFriends.length > 0 && (
              <View className="flex-row items-center mt-2">
                {suggestion.mutualFriends.slice(0, 3).map((friend, i) => (
                  <View
                    key={friend.id}
                    className="w-6 h-6 rounded-full border-2 overflow-hidden"
                    style={{
                      borderColor: colors.surface,
                      marginLeft: i > 0 ? -8 : 0,
                      zIndex: 3 - i,
                    }}
                  >
                    {friend.image ? (
                      <Image
                        source={{ uri: friend.image }}
                        className="w-full h-full"
                      />
                    ) : (
                      <View
                        className="w-full h-full items-center justify-center"
                        style={{ backgroundColor: themeColor + "30" }}
                      >
                        <Text
                          className="text-[8px] font-medium"
                          style={{ color: themeColor }}
                        >
                          {(friend.name || "?").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
                {suggestion.mutualFriends.length > 3 && (
                  <Text
                    className="text-xs ml-1"
                    style={{ color: colors.textTertiary }}
                  >
                    +{suggestion.mutualFriends.length - 3}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Add Friend Button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAddFriend();
            }}
            disabled={isPending || isSuccess}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{
              backgroundColor: isSuccess ? "#4CAF50" : themeColor,
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? (
              <Animated.View
                entering={FadeIn}
                style={{ transform: [{ rotate: "0deg" }] }}
              >
                <Loader2 size={18} color="#fff" />
              </Animated.View>
            ) : isSuccess ? (
              <Check size={18} color="#fff" />
            ) : (
              <UserPlus size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// Empty State Component
function EmptyState() {
  return <EnhancedEmptyState type="suggestions" />;
}

export default function SuggestionsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, colors } = useTheme();
  const { data: session, isPending: sessionLoading } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set()); // Track by userId

  // Fetch friend suggestions
  const {
    data: suggestionsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["friendSuggestions"],
    queryFn: () =>
      api.get<GetFriendSuggestionsResponse>("/api/friends/suggestions"),
    enabled: !!session,
    staleTime: 60000, // Cache for 1 minute
  });

  // Send friend request mutation - use userId instead of email since email can be null
  const sendRequestMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<SendFriendRequestResponse>("/api/friends/request", { userId }),
    onSuccess: (_, userId) => {
      setSentRequests((prev) => new Set(prev).add(userId));
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const suggestions = suggestionsData?.suggestions ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleAddFriend = (suggestion: FriendSuggestion) => {
    sendRequestMutation.mutate(suggestion.user.id);
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
            Sign in to see suggestions
          </Text>
          <Text
            className="text-center text-sm mb-6"
            style={{ color: colors.textSecondary }}
          >
            Discover people you might know based on mutual friends.
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
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
          People You May Know
        </Text>
        <View className="w-10" />
      </View>

      {/* Suggestions List */}
      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.user.id}
        renderItem={({ item, index }) => (
          <SuggestionCard
            suggestion={item}
            index={index}
            onAddFriend={() => handleAddFriend(item)}
            isPending={
              sendRequestMutation.isPending &&
              sendRequestMutation.variables === item.user.id
            }
            isSuccess={sentRequests.has(item.user.id)}
          />
        )}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: 100,
          flexGrow: suggestions.length === 0 ? 1 : undefined,
        }}
        ListEmptyComponent={isLoading ? <SuggestionsSkeleton /> : <EmptyState />}
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
