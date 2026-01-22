import React from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { Crown } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import * as Haptics from "expo-haptics";

interface SoftLimitModalProps {
  visible: boolean;
  onUpgrade: () => void;
  onDismiss: () => void;
  title: string;
  description: string;
}

/**
 * Lightweight modal for soft-limit upgrade prompts
 * Shows two CTAs: "Upgrade" and "Not now"
 * Used when free users hit soft limits (like MAX_ACTIVE_EVENTS_FREE)
 */
export function SoftLimitModal({
  visible,
  onUpgrade,
  onDismiss,
  title,
  description,
}: SoftLimitModalProps) {
  const { colors, themeColor } = useTheme();

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onUpgrade();
  };

  const handleDismiss = () => {
    Haptics.selectionAsync();
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable
        className="flex-1 bg-black/60 items-center justify-center px-6"
        onPress={handleDismiss}
      >
        <Pressable
          className="w-full max-w-sm rounded-3xl p-6"
          style={{ backgroundColor: colors.surface }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Crown Icon */}
          <View className="items-center mb-4">
            <View
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <Crown size={32} color={themeColor} />
            </View>
          </View>

          {/* Title */}
          <Text
            className="text-2xl font-bold text-center mb-2"
            style={{ color: colors.text }}
          >
            {title}
          </Text>

          {/* Description */}
          <Text
            className="text-base text-center mb-6"
            style={{ color: colors.textSecondary }}
          >
            {description}
          </Text>

          {/* Buttons */}
          <View className="gap-3">
            {/* Upgrade Button */}
            <Pressable
              onPress={handleUpgrade}
              className="py-4 rounded-full items-center"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white text-lg font-semibold">Upgrade</Text>
            </Pressable>

            {/* Dismiss Button */}
            <Pressable
              onPress={handleDismiss}
              className="py-4 rounded-full items-center"
              style={{ backgroundColor: colors.border }}
            >
              <Text
                className="text-base font-medium"
                style={{ color: colors.text }}
              >
                Not now
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
