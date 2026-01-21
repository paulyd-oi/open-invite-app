import React from "react";
import {
  View,
  Text,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ChevronLeft, Trophy } from "@/ui/icons";

import { useTheme } from "@/lib/ThemeContext";

export default function AchievementsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView className="flex-1" edges={["bottom"]} style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: "Achievements",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} className="mr-4">
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <View className="flex-1 items-center justify-center px-6">
        <View
          className="rounded-2xl p-8 items-center max-w-sm w-full"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Trophy size={48} color="#FFD700" />
          <Text className="text-2xl font-bold mt-4 text-center" style={{ color: colors.text }}>
            Coming Soon
          </Text>
          <Text className="text-base mt-2 text-center leading-6" style={{ color: colors.textSecondary }}>
            Badges and milestones are on the way.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
