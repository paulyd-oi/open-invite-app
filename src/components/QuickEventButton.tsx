import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Zap, Coffee, UtensilsCrossed, Dumbbell, Film, Gamepad2, Beer, Music, BookOpen, ShoppingBag, X } from "@/ui/icons";
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInUp, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";

interface QuickEventTemplate {
  id: string;
  emoji: string;
  title: string;
  description: string;
  duration: number; // minutes
  icon: typeof Coffee;
  color: string;
}

const QUICK_TEMPLATES: QuickEventTemplate[] = [
  { id: "coffee", emoji: "☕", title: "Coffee", description: "Quick coffee catch-up", duration: 60, icon: Coffee, color: "#8B4513" },
  { id: "lunch", emoji: "🍽️", title: "Lunch", description: "Grab lunch together", duration: 90, icon: UtensilsCrossed, color: "#FF6B4A" },
  { id: "workout", emoji: "🏋️", title: "Workout", description: "Gym session", duration: 60, icon: Dumbbell, color: "#22C55E" },
  { id: "movie", emoji: "🎬", title: "Movie", description: "Watch a movie", duration: 180, icon: Film, color: "#9B59B6" },
  { id: "gaming", emoji: "🎮", title: "Gaming", description: "Game night", duration: 120, icon: Gamepad2, color: "#3498DB" },
  { id: "drinks", emoji: "🍻", title: "Drinks", description: "Happy hour", duration: 120, icon: Beer, color: "#F39C12" },
  { id: "concert", emoji: "🎵", title: "Concert", description: "Live music", duration: 180, icon: Music, color: "#E74C3C" },
  { id: "study", emoji: "📚", title: "Study", description: "Study session", duration: 120, icon: BookOpen, color: "#1ABC9C" },
  { id: "shopping", emoji: "🛍️", title: "Shopping", description: "Shopping trip", duration: 120, icon: ShoppingBag, color: "#E91E63" },
];

const TIME_OPTIONS = [
  { label: "In 30 min", value: 30 },
  { label: "In 1 hour", value: 60 },
  { label: "In 2 hours", value: 120 },
  { label: "Tonight", value: "tonight" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "This Weekend", value: "weekend" },
];

export function QuickEventButton() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<QuickEventTemplate | null>(null);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.95, {}, () => {
      scale.value = withSpring(1);
    });
    setShowModal(true);
  };

  const handleSelectTemplate = (template: QuickEventTemplate) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTemplate(template);
  };

  const handleSelectTime = (timeValue: number | string) => {
    if (!selectedTemplate) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
    setSelectedTemplate(null);

    // Calculate start time
    let startTime = new Date();
    if (typeof timeValue === "number") {
      startTime.setMinutes(startTime.getMinutes() + timeValue);
    } else if (timeValue === "tonight") {
      startTime.setHours(19, 0, 0, 0); // 7 PM
      if (startTime < new Date()) {
        startTime.setDate(startTime.getDate() + 1);
      }
    } else if (timeValue === "tomorrow") {
      startTime.setDate(startTime.getDate() + 1);
      startTime.setHours(12, 0, 0, 0); // Noon tomorrow
    } else if (timeValue === "weekend") {
      const day = startTime.getDay();
      const daysUntilSaturday = (6 - day + 7) % 7 || 7;
      startTime.setDate(startTime.getDate() + daysUntilSaturday);
      startTime.setHours(14, 0, 0, 0); // 2 PM Saturday
    }

    // Calculate end time
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + selectedTemplate.duration);

    // Navigate to create screen with prefilled data
    router.push({
      pathname: "/create",
      params: {
        quickEvent: "true",
        title: selectedTemplate.title,
        emoji: selectedTemplate.emoji,
        description: selectedTemplate.description,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });
  };

  const handleClose = () => {
    setShowModal(false);
    setSelectedTemplate(null);
  };

  return (
    <>
      {/* Floating Quick Event Button */}
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={handlePress}
          className="flex-row items-center px-4 py-3 rounded-full"
          style={{
            backgroundColor: themeColor,
            shadowColor: themeColor,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Zap size={20} color="#fff" />
          <Text className="text-white font-bold ml-2">Quick Plan</Text>
        </Pressable>
      </Animated.View>

      {/* Quick Event Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="none"
        onRequestClose={handleClose}
      >
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <Pressable className="flex-1" onPress={handleClose} />

          <Animated.View
            entering={SlideInUp.springify().damping(20)}
            className="rounded-t-3xl"
            style={{ backgroundColor: colors.background, maxHeight: "80%" }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
              <View>
                <Text className="text-xl font-bold" style={{ color: colors.text }}>
                  {selectedTemplate ? "When?" : "Quick Plan"}
                </Text>
                <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                  {selectedTemplate
                    ? `${selectedTemplate.emoji} ${selectedTemplate.title}`
                    : "Tap to create an instant event"
                  }
                </Text>
              </View>
              <Pressable
                onPress={handleClose}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
              {!selectedTemplate ? (
                // Template Selection Grid
                <View className="flex-row flex-wrap -mx-1.5 mt-2">
                  {QUICK_TEMPLATES.map((template, index) => (
                    <Animated.View
                      key={template.id}
                      entering={FadeInDown.delay(index * 30).springify()}
                      className="w-1/3 p-1.5"
                    >
                      <Pressable
                        onPress={() => handleSelectTemplate(template)}
                        className="rounded-2xl p-4 items-center"
                        style={{
                          backgroundColor: isDark ? "#1C1C1E" : "#F9FAFB",
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <View
                          className="w-14 h-14 rounded-xl items-center justify-center mb-2"
                          style={{ backgroundColor: `${template.color}20` }}
                        >
                          <Text className="text-2xl">{template.emoji}</Text>
                        </View>
                        <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                          {template.title}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  ))}
                </View>
              ) : (
                // Time Selection
                <View className="mt-2">
                  {TIME_OPTIONS.map((option, index) => (
                    <Animated.View
                      key={option.label}
                      entering={FadeInDown.delay(index * 50).springify()}
                    >
                      <Pressable
                        onPress={() => handleSelectTime(option.value)}
                        className="flex-row items-center justify-between rounded-xl p-4 mb-2"
                        style={{
                          backgroundColor: isDark ? "#1C1C1E" : "#F9FAFB",
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Text className="font-semibold" style={{ color: colors.text }}>
                          {option.label}
                        </Text>
                        <View
                          className="w-8 h-8 rounded-full items-center justify-center"
                          style={{ backgroundColor: `${themeColor}20` }}
                        >
                          <Text style={{ color: themeColor }}>→</Text>
                        </View>
                      </Pressable>
                    </Animated.View>
                  ))}

                  {/* Back button */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedTemplate(null);
                    }}
                    className="py-4 mt-2 rounded-xl"
                    style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
                  >
                    <Text className="text-center font-semibold" style={{ color: colors.textSecondary }}>
                      ← Choose different activity
                    </Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>

            {/* Safe area bottom padding */}
            <View className="h-8" />
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}
