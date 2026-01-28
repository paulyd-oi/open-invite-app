import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { ChevronLeft, Download, RefreshCw, Eye, Lock, Calendar } from "@/ui/icons";
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

  const handleImport = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back(); // Return to import-calendar to proceed
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
            Calendar Import
          </Text>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            How it works
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.springify()} className="items-center mb-6">
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-3"
            style={{ backgroundColor: `${themeColor}20` }}
          >
            <Calendar size={32} color={themeColor} />
          </View>
        </Animated.View>

        {/* Section 1: One-time Import */}
        <Animated.View entering={FadeInDown.delay(50).springify()} className="mb-6">
          <View className="flex-row items-center mb-2">
            <Download size={18} color={themeColor} />
            <Text className="text-base font-bold ml-2" style={{ color: colors.text }}>
              One-time Import
            </Text>
          </View>
          <View
            className="rounded-xl p-4"
            style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
          >
            <Text className="text-sm leading-5 mb-2" style={{ color: colors.textSecondary }}>
              When you import, events are <Text style={{ fontWeight: "600", color: colors.text }}>copied</Text> from your device calendar into Open Invite.
            </Text>
            <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
              Changes you make in your calendar app afterward won't update the event in Open Invite (and vice versa).
            </Text>
          </View>
        </Animated.View>

        {/* Section 2: Not a Live Sync */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="mb-6">
          <View className="flex-row items-center mb-2">
            <RefreshCw size={18} color={colors.textTertiary} />
            <Text className="text-base font-bold ml-2" style={{ color: colors.text }}>
              Not a Live Sync (Yet)
            </Text>
          </View>
          <View
            className="rounded-xl p-4"
            style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
          >
            <Text className="text-sm leading-5 mb-2" style={{ color: colors.textSecondary }}>
              We don't continuously read your calendar. Import is a one-time action per event.
            </Text>
            <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
              Live two-way sync may come in a future update.
            </Text>
          </View>
        </Animated.View>

        {/* Section 3: Privacy */}
        <Animated.View entering={FadeInDown.delay(150).springify()} className="mb-6">
          <View className="flex-row items-center mb-2">
            <Lock size={18} color={themeColor} />
            <Text className="text-base font-bold ml-2" style={{ color: colors.text }}>
              Privacy
            </Text>
          </View>
          <View
            className="rounded-xl p-4"
            style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
          >
            <View className="flex-row items-start mb-3">
              <Eye size={14} color={colors.textSecondary} style={{ marginTop: 2 }} />
              <View className="flex-1 ml-2">
                <Text className="text-sm font-medium mb-1" style={{ color: colors.text }}>
                  What friends can see
                </Text>
                <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
                  Event title, time, and location — based on visibility you choose (Friends, Groups, or Private).
                </Text>
              </View>
            </View>
            <View className="flex-row items-start">
              <Lock size={14} color={colors.textSecondary} style={{ marginTop: 2 }} />
              <View className="flex-1 ml-2">
                <Text className="text-sm font-medium mb-1" style={{ color: colors.text }}>
                  Always private
                </Text>
                <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
                  Notes, attendees, and any private calendar details stay on your device.
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Tip */}
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          className="rounded-xl p-4"
          style={{ backgroundColor: isDark ? "#1C2127" : "#F0F9FF" }}
        >
          <Text className="text-xs leading-5 text-center" style={{ color: colors.textTertiary }}>
            Tip: Mark events as "Private" if you don't want friends to see them at all — they'll still block time on your calendar for scheduling.
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Bottom Buttons */}
      <Animated.View
        entering={FadeInDown.delay(250).springify()}
        className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-4"
        style={{ backgroundColor: colors.background }}
      >
        <Pressable
          onPress={handleImport}
          className="w-full py-4 rounded-xl items-center mb-3"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white font-semibold text-base">Import Calendar</Text>
        </Pressable>
        <Pressable
          onPress={handleBack}
          className="w-full py-3 rounded-xl items-center"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          <Text style={{ color: colors.text }} className="font-medium">Back</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}
