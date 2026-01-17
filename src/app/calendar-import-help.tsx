import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { ChevronLeft, Share2, CalendarPlus, CheckCircle } from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";

export default function CalendarImportHelpScreen() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b" style={{ borderColor: colors.separator }}>
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xl font-bold" style={{ color: colors.text }}>
            Add Events from Calendar
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <Animated.View entering={FadeInDown.springify()} className="items-center mb-8">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: `${themeColor}20` }}
          >
            <CalendarPlus size={40} color={themeColor} />
          </View>
          <Text className="text-2xl font-bold text-center mb-2" style={{ color: colors.text }}>
            Import Calendar Events
          </Text>
          <Text className="text-center text-base" style={{ color: colors.textSecondary }}>
            Share events from Apple Calendar or Google Calendar directly to Open Invite
          </Text>
        </Animated.View>

        {/* Instructions */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="mb-6">
          <Text className="text-lg font-bold mb-4" style={{ color: colors.text }}>
            How it works
          </Text>

          {/* Step 1 */}
          <View className="mb-6">
            <View className="flex-row items-start mb-2">
              <View
                className="w-8 h-8 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Text className="font-bold" style={{ color: themeColor }}>1</Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold mb-1" style={{ color: colors.text }}>
                  Open your calendar app
                </Text>
                <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
                  Open the Apple Calendar or Google Calendar app on your device
                </Text>
              </View>
            </View>
          </View>

          {/* Step 2 */}
          <View className="mb-6">
            <View className="flex-row items-start mb-2">
              <View
                className="w-8 h-8 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Text className="font-bold" style={{ color: themeColor }}>2</Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold mb-1" style={{ color: colors.text }}>
                  Tap on an event
                </Text>
                <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
                  Select the event you want to share with your friends
                </Text>
              </View>
            </View>
          </View>

          {/* Step 3 */}
          <View className="mb-6">
            <View className="flex-row items-start mb-2">
              <View
                className="w-8 h-8 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Share2 size={16} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold mb-1" style={{ color: colors.text }}>
                  Share to Open Invite
                </Text>
                <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
                  Tap the Share button and select "Open Invite" from the list
                </Text>
              </View>
            </View>
          </View>

          {/* Step 4 */}
          <View className="mb-6">
            <View className="flex-row items-start mb-2">
              <View
                className="w-8 h-8 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <CheckCircle size={16} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold mb-1" style={{ color: colors.text }}>
                  Review and create
                </Text>
                <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
                  The event details will be pre-filled. Review and tap "Create Event" to share it with friends
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Important Notes */}
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          className="rounded-2xl p-4 mb-6"
          style={{ backgroundColor: isDark ? "#1C1C1E" : "#F0F9FF" }}
        >
          <Text className="text-sm font-semibold mb-2" style={{ color: colors.text }}>
            What you should know
          </Text>
          <View className="space-y-2">
            <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
              • Each event is imported one at a time
            </Text>
            <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
              • No background sync or automatic updates
            </Text>
            <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
              • Events become standard Open Invite events
            </Text>
            <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
              • No calendar permissions required
            </Text>
          </View>
        </Animated.View>

        {/* App Store Safe Note */}
        <Animated.View
          entering={FadeInDown.delay(250).springify()}
          className="rounded-2xl p-4"
          style={{ backgroundColor: isDark ? "#1C2127" : "#F3F4F6" }}
        >
          <Text className="text-xs leading-5 text-center" style={{ color: colors.textTertiary }}>
            Open Invite doesn't access your calendar automatically. You control exactly which events to share, one at a time.
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
