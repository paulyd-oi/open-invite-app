import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/lib/ThemeContext";
import { Sparkles, Users, Calendar } from "@/ui/icons";

const FIRST_RSVP_NUDGE_KEY = "firstRsvpNudge:v1";

interface FirstRsvpNudgeProps {
  visible: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  onDismiss: () => void;
}

export const FirstRsvpNudge: React.FC<FirstRsvpNudgeProps> = ({
  visible,
  onPrimary,
  onSecondary,
  onDismiss,
}) => {
  const { colors, isDark, themeColor } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 justify-center items-center px-6" style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}>
        <View
          className="rounded-2xl p-6 w-full max-w-sm"
          style={{ backgroundColor: colors.background }}
        >
          {/* Header */}
          <View className="items-center mb-4">
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <Sparkles size={32} color={themeColor} />
            </View>
            <Text
              style={{ color: colors.text }}
              className="text-xl font-bold text-center"
            >
              Nice — you're in!
            </Text>
            <Text
              style={{ color: colors.textSecondary }}
              className="text-center mt-2 leading-5"
            >
              Keep the momentum going and make your social calendar even better
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="space-y-3">
            <Pressable
              onPress={onPrimary}
              className="rounded-xl p-4 flex-row items-center justify-center"
              style={{ backgroundColor: themeColor }}
            >
              <Users size={20} color="white" />
              <Text className="text-white font-semibold ml-2">
                Invite Friends
              </Text>
            </Pressable>

            <Pressable
              onPress={onSecondary}
              className="rounded-xl p-4 flex-row items-center justify-center"
              style={{
                backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Calendar size={20} color={colors.text} />
              <Text
                style={{ color: colors.text }}
                className="font-semibold ml-2"
              >
                Create Event
              </Text>
            </Pressable>

            <Pressable
              onPress={onDismiss}
              className="py-3 items-center"
            >
              <Text
                style={{ color: colors.textSecondary }}
                className="font-medium"
              >
                Got it
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Helper functions for persistence
export const canShowFirstRsvpNudge = async (): Promise<boolean> => {
  try {
    const data = await AsyncStorage.getItem(FIRST_RSVP_NUDGE_KEY);
    if (!data) return true;
    const { completed } = JSON.parse(data);
    return !completed;
  } catch {
    return true;
  }
};

export const markFirstRsvpNudgeCompleted = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      FIRST_RSVP_NUDGE_KEY,
      JSON.stringify({ completed: true })
    );
  } catch {
    // Silently fail
  }
};