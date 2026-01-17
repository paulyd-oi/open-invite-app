import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { colors, isDark, themeColor } = useTheme();

  const handleConfirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm();
  };

  const handleCancel = () => {
    Haptics.selectionAsync();
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      >
        <Pressable className="flex-1" onPress={onCancel} />

        <Animated.View
          entering={SlideInDown.springify().damping(20)}
          exiting={SlideOutDown.duration(200)}
          className="rounded-t-3xl p-5 pb-8"
          style={{ backgroundColor: colors.surface }}
        >
          {/* Title */}
          <Text
            className="text-xl font-bold text-center mb-2"
            style={{ color: colors.text }}
          >
            {title}
          </Text>

          {/* Message */}
          <Text
            className="text-base text-center mb-6"
            style={{ color: colors.textSecondary }}
          >
            {message}
          </Text>

          {/* Buttons */}
          <View className="gap-3">
            {/* Confirm Button */}
            <Pressable
              onPress={handleConfirm}
              className="py-4 rounded-xl items-center"
              style={{
                backgroundColor: isDestructive ? "#EF4444" : themeColor,
              }}
            >
              <Text className="text-white font-semibold text-base">
                {confirmText}
              </Text>
            </Pressable>

            {/* Cancel Button */}
            <Pressable
              onPress={handleCancel}
              className="py-4 rounded-xl items-center"
              style={{
                backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
              }}
            >
              <Text
                className="font-semibold text-base"
                style={{ color: colors.text }}
              >
                {cancelText}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
