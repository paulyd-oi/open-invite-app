import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { BookOpen } from "@/ui/icons";
import { DARK_COLORS } from "@/lib/ThemeContext";

interface CalendarFirstLoginGuideModalProps {
  visible: boolean;
  colors: typeof DARK_COLORS;
  isDark: boolean;
  themeColor: string;
  onOpenGuide: () => void;
  onDismiss: () => void;
}

export function CalendarFirstLoginGuideModal({
  visible,
  colors,
  isDark,
  themeColor,
  onOpenGuide,
  onDismiss,
}: CalendarFirstLoginGuideModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
        <Animated.View
          entering={FadeIn.duration(300)}
          className="mx-6 rounded-3xl overflow-hidden"
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{
            backgroundColor: colors.surface,
            maxWidth: 340,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
          }}
        >
          {/* Header with icon */}
          <View
            className="px-6 pt-8 pb-4 items-center"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: `${themeColor}15` }}
          >
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-4"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ backgroundColor: themeColor }}
            >
              <BookOpen size={32} color="#fff" />
            </View>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-xl font-bold text-center" style={{ color: colors.text }}>
              Welcome to Open Invite!
            </Text>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-sm text-center mt-2" style={{ color: colors.textSecondary }}>
              Take a quick tour to learn how to share plans with friends
            </Text>
          </View>

          {/* Content */}
          <View className="px-6 py-5">
            <View className="flex-row items-center mb-3">
              <Text className="text-2xl mr-3">📅</Text>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text style={{ color: colors.text }} className="flex-1">See friends' plans on your calendar</Text>
            </View>
            <View className="flex-row items-center mb-3">
              <Text className="text-2xl mr-3">🎉</Text>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text style={{ color: colors.text }} className="flex-1">Create and share events easily</Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">👥</Text>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text style={{ color: colors.text }} className="flex-1">Find who's free to hang out</Text>
            </View>
          </View>

          {/* Buttons */}
          <View className="px-6 pb-6">
            <Pressable
              onPress={onOpenGuide}
              className="py-4 rounded-xl items-center"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white font-semibold text-base">Get Started Guide</Text>
            </Pressable>
            <Pressable
              onPress={onDismiss}
              className="py-3 mt-2 items-center"
            >
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text style={{ color: colors.textSecondary }} className="text-sm">
                Maybe later
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
