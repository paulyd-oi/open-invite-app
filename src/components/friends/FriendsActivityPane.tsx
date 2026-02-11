import React from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Activity } from "@/ui/icons";
import { Button } from "@/ui/Button";
import { useTheme } from "@/lib/ThemeContext";

// ── Component ──────────────────────────────────────────────────
// Minimal Activity launcher — Add Friend + Friend Requests
// now live in FriendsPeoplePane.
export function FriendsActivityPane() {
  const { themeColor, colors } = useTheme();
  const router = useRouter();

  return (
    <View className="mb-4">
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <View className="rounded-xl p-5 items-center" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <View className="w-12 h-12 rounded-full items-center justify-center mb-3" style={{ backgroundColor: "#2196F315" }}>
          <Activity size={24} color="#2196F3" />
        </View>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text className="text-base font-semibold mb-1" style={{ color: colors.text }}>
          Activity
        </Text>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text className="text-sm text-center mb-4" style={{ color: colors.textSecondary }}>
          See notifications, RSVP updates, and suggestions.
        </Text>
        <Button
          variant="primary"
          label="Open Activity"
          /* INVARIANT_ALLOW_INLINE_HANDLER */
          onPress={() => router.push("/activity")}
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{ borderRadius: 10, paddingHorizontal: 24 }}
        />
      </View>
    </View>
  );
}
