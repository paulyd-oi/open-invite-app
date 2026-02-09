import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";
import { Button } from "@/ui/Button";

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
  const insets = useSafeAreaInsets();

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
          className="rounded-t-3xl p-5"
          style={{ backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 20) + 8 }}
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
            <Button
              variant={isDestructive ? "destructive" : "primary"}
              label={confirmText}
              onPress={handleConfirm}
              style={{ borderRadius: 12, paddingVertical: 16 }}
            />

            {/* Cancel Button */}
            <Button
              variant="secondary"
              label={cancelText}
              onPress={handleCancel}
              style={{ borderRadius: 12, paddingVertical: 16, borderWidth: 0 }}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
