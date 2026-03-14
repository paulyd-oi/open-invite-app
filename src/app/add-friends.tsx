/**
 * Add Friends screen — now uses shared FriendDiscoverySurface component
 *
 * Accessible from the Friends header "+ Add" button (any tab).
 * Uses the shared SSOT friend discovery component for consistent UX.
 */
import React from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { FriendDiscoverySurface } from "@/components/FriendDiscoverySurface";
import { useTheme } from "@/lib/ThemeContext";

export default function AddFriendsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  // *** PROOF LOG: Confirm screen renders ***
  if (__DEV__) {
    console.log(`[ADD_FRIENDS_BRANCH] AddFriendsScreen rendering, about to render FriendDiscoverySurface`);
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b" style={{ borderBottomColor: colors.separator }}>
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
          Add Friends
        </Text>
        <View className="w-10" />
      </View>

      {/* Shared Friend Discovery Surface */}
      <FriendDiscoverySurface />
    </SafeAreaView>
  );
}