import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Users } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { ActivityFeed } from "@/components/activity/ActivityFeed";

function FriendsEmptyState() {
  const { colors, themeColor } = useTheme();
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center px-8 py-20">
      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-4"
        style={{ backgroundColor: `${themeColor}15` }}
      >
        <Users size={36} color={themeColor} />
      </View>
      <Text className="text-lg font-semibold text-center" style={{ color: colors.text }}>
        No activity yet
      </Text>
      <Text className="text-sm text-center mt-2 mb-5" style={{ color: colors.textSecondary }}>
        Your friends' activity will show up here
      </Text>
      <Pressable
        onPress={() => router.push("/add-friends")}
        className="px-5 py-2.5 rounded-full"
        style={{ backgroundColor: themeColor }}
      >
        <Text className="text-sm font-semibold" style={{ color: "#fff" }}>Find Friends</Text>
      </Pressable>
    </View>
  );
}

// ── Component ──────────────────────────────────────────────────
// Inline Activity feed embedded inside the Friends tab.
// Add Friend + Friend Requests now live in FriendsPeoplePane.
export function FriendsActivityPane() {
  return (
    <View className="flex-1">
      <ActivityFeed embedded emptyComponent={<FriendsEmptyState />} />
    </View>
  );
}
