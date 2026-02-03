import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/lib/ThemeContext";
import { devWarn } from "@/lib/devLog";
import { Calendar, Users, Clock } from "@/ui/icons";

const POST_EVENT_REPEAT_NUDGE_KEY = "postEventRepeatNudge:v1";

interface PostEventRepeatNudgeData {
  completedEventIds: string[];
}

interface PostEventRepeatNudgeProps {
  visible: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  onDismiss: () => void;
}

export const PostEventRepeatNudge: React.FC<PostEventRepeatNudgeProps> = ({
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
              <Clock size={32} color={themeColor} />
            </View>
            <Text
              style={{ color: colors.text }}
              className="text-xl font-bold text-center"
            >
              Good plans make good memories
            </Text>
            <Text
              style={{ color: colors.textSecondary }}
              className="text-center mt-2 leading-5"
            >
              Want to do something like that again?
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="space-y-3">
            <Pressable
              onPress={onPrimary}
              className="rounded-xl p-4 flex-row items-center justify-center"
              style={{ backgroundColor: themeColor }}
            >
              <Calendar size={20} color="white" />
              <Text className="text-white font-semibold ml-2">
                Invite again
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
              <Users size={20} color={colors.text} />
              <Text
                style={{ color: colors.text }}
                className="font-medium ml-2"
              >
                See what's next
              </Text>
            </Pressable>

            <Pressable
              onPress={onDismiss}
              className="py-3 items-center"
            >
              <Text
                style={{ color: colors.textTertiary }}
                className="text-sm"
              >
                Later
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// AsyncStorage helper functions
export const canShowPostEventRepeatNudge = async (eventId: string): Promise<boolean> => {
  try {
    const stored = await AsyncStorage.getItem(POST_EVENT_REPEAT_NUDGE_KEY);
    if (!stored) return true;
    
    const data: PostEventRepeatNudgeData = JSON.parse(stored);
    return !data.completedEventIds.includes(eventId);
  } catch {
    return true;
  }
};

export const markPostEventRepeatNudgeCompleted = async (eventId: string): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(POST_EVENT_REPEAT_NUDGE_KEY);
    const data: PostEventRepeatNudgeData = stored 
      ? JSON.parse(stored) 
      : { completedEventIds: [] };
    
    if (!data.completedEventIds.includes(eventId)) {
      data.completedEventIds.push(eventId);
      await AsyncStorage.setItem(POST_EVENT_REPEAT_NUDGE_KEY, JSON.stringify(data));
    }
  } catch (error) {
    devWarn("Failed to mark post-event repeat nudge as completed:", error);
  }
};