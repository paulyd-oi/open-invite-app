import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Heart, ChevronRight, Plus } from "@/ui/icons";
import { EntityAvatar } from "@/components/EntityAvatar";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import type { DARK_COLORS } from "@/lib/ThemeContext";

interface Suggestion {
  friend: { id: string; name: string | null; image: string | null };
  friendshipId: string;
  groups: Array<{ id: string; name: string; color: string }>;
  hangoutCount: number;
  lastHangout: string | null;
  daysSinceHangout: number;
}

interface ReconnectReminderProps {
  themeColor: string;
  isDark: boolean;
  colors: typeof DARK_COLORS;
  maxDisplay?: number;
}

export function ReconnectReminder({
  themeColor,
  isDark,
  colors,
  maxDisplay = 3,
}: ReconnectReminderProps) {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();

  const { data: suggestionsData } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () => api.get<{ suggestions: Suggestion[] }>("/api/events/suggestions"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60000, // Cache for 1 minute
  });

  const suggestions = suggestionsData?.suggestions ?? [];

  // Only show friends we haven't seen in more than 14 days
  const friendsToReconnect = suggestions
    .filter((s) => s.daysSinceHangout >= 14)
    .slice(0, maxDisplay);

  if (friendsToReconnect.length === 0) {
    return null;
  }

  const handleFriendPress = (friendshipId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/friend/${friendshipId}` as any);
  };

  const handleCreateEvent = (friendshipId: string, friendName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/create?inviteFriend=${friendshipId}&title=Catch up with ${friendName}` as any);
  };

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/discover");
  };

  return (
    <Animated.View entering={FadeInDown.delay(100).springify()} className="mb-4">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <Heart size={18} color="#FF6B6B" />
          <Text className="font-semibold ml-2" style={{ color: colors.text }}>
            Reconnect
          </Text>
          <View
            className="ml-2 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "#FF6B6B20" }}
          >
            <Text className="text-xs font-medium" style={{ color: "#FF6B6B" }}>
              {friendsToReconnect.length}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={handleSeeAll}
          className="flex-row items-center"
        >
          <Text className="text-sm mr-1" style={{ color: themeColor }}>
            See all
          </Text>
          <ChevronRight size={16} color={themeColor} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 20 }}
        style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
      >
        {friendsToReconnect.map((item, index) => (
          <Pressable
            key={item.friendshipId}
            onPress={() => handleFriendPress(item.friendshipId)}
            className="rounded-xl p-4 mr-3"
            style={{
              width: 160,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View className="items-center">
              <EntityAvatar
                photoUrl={item.friend.image}
                initials={item.friend.name?.[0] ?? "?"}
                size={56}
                backgroundColor={item.friend.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "30"}
                foregroundColor={themeColor}
                style={{ marginBottom: 8 }}
              />
              <Text
                className="font-medium text-center"
                style={{ color: colors.text }}
                numberOfLines={1}
              >
                {item.friend.name ?? "Friend"}
              </Text>
              <Text
                className="text-xs text-center mt-0.5"
                style={{ color: "#FF6B6B" }}
              >
                {item.daysSinceHangout > 100
                  ? "Haven't met yet"
                  : `${item.daysSinceHangout} days ago`}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                handleCreateEvent(item.friendshipId, item.friend.name ?? "Friend");
              }}
              className="flex-row items-center justify-center mt-3 py-2 rounded-lg"
              style={{ backgroundColor: themeColor }}
            >
              <Plus size={14} color="#fff" />
              <Text className="text-white text-xs font-medium ml-1">
                Plan hangout
              </Text>
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}
