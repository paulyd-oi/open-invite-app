import React from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";

export default function RedeemCodeScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      edges={["top"]}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text }} className="text-xl font-bold">
          Feature Unavailable
        </Text>
      </View>

      {/* Deprecated Message */}
      <View className="flex-1 items-center justify-center px-8">
        <Text
          className="text-center text-lg font-semibold mb-4"
          style={{ color: colors.text }}
        >
          Feature Unavailable
        </Text>
        <Text
          className="text-center text-base leading-relaxed"
          style={{ color: colors.textSecondary }}
        >
          This feature is no longer available.
        </Text>
      </View>
    </SafeAreaView>
  );
}
