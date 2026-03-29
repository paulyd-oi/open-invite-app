import React from "react";
import { Modal, Pressable, View, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { ChevronRight } from "@/ui/icons";

interface CalendarSyncModalColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  surface: string;
  border: string;
}

interface CalendarSyncModalProps {
  visible: boolean;
  colors: CalendarSyncModalColors;
  onClose: () => void;
  onGoogleCalendar: () => void;
  onAppleCalendar: () => void;
}

export function CalendarSyncModal({
  visible,
  colors,
  onClose,
  onGoogleCalendar,
  onAppleCalendar,
}: CalendarSyncModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}} className="mx-4 mb-8">
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Header */}
            <View className="px-5 py-4 border-b" style={{ borderColor: colors.border }}>
              <Text className="text-lg font-bold text-center" style={{ color: colors.text }}>
                Sync to Calendar
              </Text>
              <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                Choose where to add this event
              </Text>
            </View>

            {/* Google Calendar Option */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onGoogleCalendar();
              }}
              className="flex-row items-center px-5 py-4 border-b"
              style={{ borderColor: colors.border }}
            >
              <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: "#4285F4" + "15" }}>
                <Text className="text-2xl">📅</Text>
              </View>
              <View className="flex-1 ml-4">
                <Text className="font-semibold text-base" style={{ color: colors.text }}>
                  Google Calendar
                </Text>
                <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                  Opens in browser to add event
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </Pressable>

            {/* Apple Calendar Option */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onAppleCalendar();
              }}
              className="flex-row items-center px-5 py-4"
            >
              <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: "#FF3B30" + "15" }}>
                <Text className="text-2xl">🗓️</Text>
              </View>
              <View className="flex-1 ml-4">
                <Text className="font-semibold text-base" style={{ color: colors.text }}>
                  Apple Calendar
                </Text>
                <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                  Adds event directly to calendar
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </Pressable>
          </View>

          {/* Cancel Button */}
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onClose();
            }}
            className="rounded-2xl items-center py-4 mt-2"
            style={{ backgroundColor: colors.surface }}
          >
            <Text className="font-semibold text-base" style={{ color: colors.text }}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
