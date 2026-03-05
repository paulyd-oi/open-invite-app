import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/lib/ThemeContext";
import { devWarn } from "@/lib/devLog";
import { Calendar, Users, Clock } from "@/ui/icons";
import { Button } from "@/ui/Button";

const POST_EVENT_REPEAT_NUDGE_KEY = "postEventRepeatNudge:v2";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7-day per-event cooldown

interface PostEventRepeatNudgeData {
  /** Map of eventId -> timestamp of last shown */
  shownAt: Record<string, number>;
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
            <Button
              variant="primary"
              label="Invite again"
              onPress={onPrimary}
              leftIcon={<Calendar size={20} color={colors.buttonPrimaryText} />}
              style={{ borderRadius: 12, paddingVertical: 16 }}
            />

            <Button
              variant="secondary"
              label="See what's next"
              onPress={onSecondary}
              leftIcon={<Users size={20} color={colors.text} />}
              style={{ borderRadius: 12, paddingVertical: 16 }}
            />

            <Button
              variant="ghost"
              label="Later"
              onPress={onDismiss}
              size="sm"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

// AsyncStorage helper functions

/** Check if the recap nudge can be shown for this event (7-day per-event cooldown). */
export const canShowPostEventRepeatNudge = async (eventId: string): Promise<boolean> => {
  try {
    const stored = await AsyncStorage.getItem(POST_EVENT_REPEAT_NUDGE_KEY);
    if (!stored) return true;

    const data: PostEventRepeatNudgeData = JSON.parse(stored);
    const lastShown = data.shownAt?.[eventId];
    if (!lastShown) return true;
    return Date.now() - lastShown >= COOLDOWN_MS;
  } catch {
    return true;
  }
};

/** Mark the recap nudge as shown for this event (sets 7-day cooldown). */
export const markPostEventRepeatNudgeCompleted = async (eventId: string): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(POST_EVENT_REPEAT_NUDGE_KEY);
    const data: PostEventRepeatNudgeData = stored
      ? JSON.parse(stored)
      : { shownAt: {} };

    // Migrate legacy format if needed
    if (!data.shownAt) data.shownAt = {};

    data.shownAt[eventId] = Date.now();

    // Prune entries older than 30 days to keep storage clean
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const key of Object.keys(data.shownAt)) {
      if (data.shownAt[key] < cutoff) delete data.shownAt[key];
    }

    await AsyncStorage.setItem(POST_EVENT_REPEAT_NUDGE_KEY, JSON.stringify(data));
  } catch (error) {
    devWarn("Failed to mark post-event repeat nudge as completed:", error);
  }
};