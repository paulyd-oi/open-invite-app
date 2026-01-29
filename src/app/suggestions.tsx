import React, { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Calendar } from "@/ui/icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import BottomNavigation from "@/components/BottomNavigation";

/**
 * SUGGESTIONS SCREEN - DISABLED
 * 
 * This screen is temporarily disabled (P2.1 pre-launch removal).
 * Issues:
 * - "Join event" cards have dead tap (haptics but no navigation)
 * - Floating orange/yellow dot artifact on cards
 * 
 * The entry point (Suggestions button in friends.tsx) has been removed.
 * This route is left as a "Coming soon" placeholder in case someone
 * bookmarked it or it's reached via deep link.
 */
export default function SuggestionsScreen() {
  const router = useRouter();
  const { themeColor, colors } = useTheme();

  // DEV-only log for detecting accidental navigation to disabled screen
  useEffect(() => {
    if (__DEV__) {
      console.warn(
        '[SUGGESTIONS_DISABLED] User reached /suggestions route - this screen is disabled. ' +
        'Entry point should have been removed from friends.tsx. ' +
        'Check for stale deep links or bookmarks.'
      );
    }
  }, []);

  return (
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          className="w-10 h-10 items-center justify-center"
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
          Suggestions
        </Text>
        <View className="w-10" />
      </View>

      {/* Coming Soon Placeholder */}
      <View className="flex-1 items-center justify-center px-6">
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-4"
          style={{ backgroundColor: themeColor + "15" }}
        >
          <Calendar size={40} color={themeColor} />
        </View>
        
        <Text
          className="text-xl font-semibold text-center mb-2"
          style={{ color: colors.text }}
        >
          Coming Soon
        </Text>
        
        <Text
          className="text-center text-sm leading-5 mb-6"
          style={{ color: colors.textSecondary }}
        >
          Personalized suggestions are being improved.{"\n"}
          Check back soon!
        </Text>
        
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.back();
          }}
          className="px-6 py-3 rounded-full"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </View>

      <BottomNavigation />
    </SafeAreaView>
  );
}
