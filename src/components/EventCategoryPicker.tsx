import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { Tag, Check, ChevronDown } from "@/ui/icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";

// Event category type and constants defined locally to avoid import issues
export type EventCategory =
  | "social"
  | "sports"
  | "food"
  | "entertainment"
  | "outdoor"
  | "work"
  | "travel"
  | "wellness"
  | "other";

export const EVENT_CATEGORIES = [
  { value: "social", label: "Social", emoji: "🎉", color: "#FF6B4A" },
  { value: "sports", label: "Sports", emoji: "⚽", color: "#4CAF50" },
  { value: "food", label: "Food & Drinks", emoji: "🍽️", color: "#FF9800" },
  { value: "entertainment", label: "Entertainment", emoji: "🎬", color: "#9C27B0" },
  { value: "outdoor", label: "Outdoor", emoji: "🏕️", color: "#00BCD4" },
  { value: "work", label: "Work", emoji: "💼", color: "#607D8B" },
  { value: "travel", label: "Travel", emoji: "✈️", color: "#3F51B5" },
  { value: "wellness", label: "Wellness", emoji: "🧘", color: "#4ECDC4" },
  { value: "other", label: "Other", emoji: "📅", color: "#78909C" },
] as const;

interface EventCategoryPickerProps {
  selectedCategory: EventCategory | null;
  onCategoryChange: (category: EventCategory | null) => void;
  compact?: boolean;
}

export function EventCategoryPicker({
  selectedCategory,
  onCategoryChange,
  compact = false,
}: EventCategoryPickerProps) {
  const { themeColor, isDark, colors } = useTheme();
  const [showModal, setShowModal] = useState(false);

  const selectedCategoryData = EVENT_CATEGORIES.find((c) => c.value === selectedCategory);

  const handleSelectCategory = (category: EventCategory) => {
    Haptics.selectionAsync();
    onCategoryChange(category);
    setShowModal(false);
  };

  if (compact) {
    return (
      <View className="flex-row flex-wrap">
        {EVENT_CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category.value;
          return (
            <Pressable
              key={category.value}
              onPress={() => {
                Haptics.selectionAsync();
                onCategoryChange(isSelected ? null : category.value as EventCategory);
              }}
              className="rounded-full px-3 py-2 mr-2 mb-2 flex-row items-center"
              style={{
                backgroundColor: isSelected ? `${category.color}20` : isDark ? "#2C2C2E" : "#F3F4F6",
                borderWidth: isSelected ? 1 : 0,
                borderColor: category.color,
              }}
            >
              <Text className="mr-1">{category.emoji}</Text>
              <Text
                className="text-sm font-medium"
                style={{ color: isSelected ? category.color : colors.text }}
              >
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setShowModal(true);
        }}
        className="rounded-xl p-4 flex-row items-center justify-between"
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        <View className="flex-row items-center">
          {selectedCategoryData ? (
            <>
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${selectedCategoryData.color}20` }}
              >
                <Text className="text-xl">{selectedCategoryData.emoji}</Text>
              </View>
              <View>
                <Text className="text-sm" style={{ color: colors.textTertiary }}>Category</Text>
                <Text className="font-semibold" style={{ color: selectedCategoryData.color }}>
                  {selectedCategoryData.label}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <Tag size={20} color={colors.textTertiary} />
              </View>
              <View>
                <Text className="text-sm" style={{ color: colors.textTertiary }}>Category</Text>
                <Text className="font-semibold" style={{ color: colors.text }}>
                  Select a category
                </Text>
              </View>
            </>
          )}
        </View>
        <ChevronDown size={20} color={colors.textTertiary} />
      </Pressable>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowModal(false)}
        >
          <Pressable onPress={() => {}} className="mx-4 mb-8">
            <Animated.View
              entering={FadeInDown.springify()}
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.surface, maxHeight: 500 }}
            >
              {/* Header */}
              <View className="px-5 py-4 border-b" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center justify-center">
                  <Tag size={24} color={themeColor} />
                  <Text className="text-lg font-bold ml-2" style={{ color: colors.text }}>
                    Event Category
                  </Text>
                </View>
                <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                  Help friends find events they're interested in
                </Text>
              </View>

              {/* Category Options */}
              <ScrollView className="max-h-80">
                {/* None Option */}
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    onCategoryChange(null);
                    setShowModal(false);
                  }}
                  className="flex-row items-center px-5 py-3 border-b"
                  style={{
                    borderColor: colors.border,
                    backgroundColor: !selectedCategory ? `${colors.textTertiary}10` : "transparent",
                  }}
                >
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center mr-4"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Text className="text-2xl">🔘</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold" style={{ color: colors.text }}>
                      No Category
                    </Text>
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      Just a general event
                    </Text>
                  </View>
                  {!selectedCategory && <Check size={20} color={themeColor} />}
                </Pressable>

                {EVENT_CATEGORIES.map((category, index) => {
                  const isSelected = selectedCategory === category.value;
                  return (
                    <Animated.View key={category.value} entering={FadeIn.delay(index * 30)}>
                      <Pressable
                        onPress={() => handleSelectCategory(category.value as EventCategory)}
                        className="flex-row items-center px-5 py-3 border-b"
                        style={{
                          borderColor: colors.border,
                          backgroundColor: isSelected ? `${category.color}10` : "transparent",
                        }}
                      >
                        <View
                          className="w-12 h-12 rounded-xl items-center justify-center mr-4"
                          style={{ backgroundColor: `${category.color}20` }}
                        >
                          <Text className="text-2xl">{category.emoji}</Text>
                        </View>
                        <View className="flex-1">
                          <Text
                            className="font-semibold"
                            style={{ color: isSelected ? category.color : colors.text }}
                          >
                            {category.label}
                          </Text>
                        </View>
                        {isSelected && <Check size={20} color={category.color} />}
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </Animated.View>

            {/* Cancel Button */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowModal(false);
              }}
              className="rounded-2xl items-center py-4 mt-2"
              style={{ backgroundColor: colors.surface }}
            >
              <Text className="font-semibold" style={{ color: colors.text }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// Badge component to display category
export function EventCategoryBadge({ category }: { category: string | null | undefined }) {
  const { isDark, colors } = useTheme();

  if (!category) return null;

  const categoryData = EVENT_CATEGORIES.find((c) => c.value === category);
  if (!categoryData) return null;

  return (
    <View
      className="rounded-full px-3 py-1.5 flex-row items-center"
      style={{ backgroundColor: `${categoryData.color}20` }}
    >
      <Text className="mr-1">{categoryData.emoji}</Text>
      <Text className="text-sm font-medium" style={{ color: categoryData.color }}>
        {categoryData.label}
      </Text>
    </View>
  );
}
