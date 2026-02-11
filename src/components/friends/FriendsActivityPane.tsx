import React from "react";
import { View } from "react-native";
import { ActivityFeed } from "@/components/activity/ActivityFeed";

// ── Component ──────────────────────────────────────────────────
// Inline Activity feed embedded inside the Friends tab.
// Add Friend + Friend Requests now live in FriendsPeoplePane.
export function FriendsActivityPane() {
  return (
    <View className="flex-1">
      <ActivityFeed embedded />
    </View>
  );
}
