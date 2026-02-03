import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Bell, BellOff, Check, ChevronRight, Clock } from "@/ui/icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { scheduleEventReminder, cancelEventReminders } from "@/lib/notifications";
import { devError } from "@/lib/devLog";

interface ReminderOption {
  label: string;
  minutesBefore: number;
  icon: string;
}

const REMINDER_OPTIONS: ReminderOption[] = [
  { label: "5 minutes before", minutesBefore: 5, icon: "⏱️" },
  { label: "15 minutes before", minutesBefore: 15, icon: "⏰" },
  { label: "30 minutes before", minutesBefore: 30, icon: "🕐" },
  { label: "1 hour before", minutesBefore: 60, icon: "⏳" },
  { label: "2 hours before", minutesBefore: 120, icon: "🕑" },
  { label: "1 day before", minutesBefore: 1440, icon: "📅" },
];

interface EventReminderPickerProps {
  eventId: string;
  eventTitle: string;
  eventEmoji: string;
  eventTime: Date;
  selectedReminders: number[];
  onRemindersChange: (reminders: number[]) => void;
}

export function EventReminderPicker({
  eventId,
  eventTitle,
  eventEmoji,
  eventTime,
  selectedReminders,
  onRemindersChange,
}: EventReminderPickerProps) {
  const { themeColor, isDark, colors } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const hasReminders = selectedReminders.length > 0;

  const handleToggleReminder = async (minutesBefore: number) => {
    Haptics.selectionAsync();

    const isSelected = selectedReminders.includes(minutesBefore);
    let newReminders: number[];

    if (isSelected) {
      newReminders = selectedReminders.filter((m) => m !== minutesBefore);
    } else {
      newReminders = [...selectedReminders, minutesBefore];
    }

    onRemindersChange(newReminders);
  };

  const handleSaveReminders = async () => {
    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Cancel existing reminders
      await cancelEventReminders(eventId);

      // Schedule new reminders
      for (const minutesBefore of selectedReminders) {
        await scheduleEventReminder({
          eventId,
          eventTitle,
          eventEmoji,
          eventTime,
          reminderMinutesBefore: minutesBefore,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
    } catch (error) {
      devError("Error saving reminders:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const formatReminderSummary = () => {
    if (selectedReminders.length === 0) return "No reminders set";
    if (selectedReminders.length === 1) {
      const option = REMINDER_OPTIONS.find((o) => o.minutesBefore === selectedReminders[0]);
      return option?.label ?? "1 reminder set";
    }
    return `${selectedReminders.length} reminders set`;
  };

  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setShowModal(true);
        }}
        className="flex-row items-center py-3"
        style={{ borderTopWidth: 1, borderTopColor: colors.border }}
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: hasReminders ? `${themeColor}20` : isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          {hasReminders ? (
            <Bell size={20} color={themeColor} />
          ) : (
            <BellOff size={20} color={colors.textTertiary} />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-sm" style={{ color: colors.textTertiary }}>Reminders</Text>
          <Text className="font-semibold" style={{ color: hasReminders ? themeColor : colors.text }}>
            {formatReminderSummary()}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.textTertiary} />
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
              style={{ backgroundColor: colors.surface }}
            >
              {/* Header */}
              <View className="px-5 py-4 border-b" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center justify-center">
                  <Bell size={24} color={themeColor} />
                  <Text className="text-lg font-bold ml-2" style={{ color: colors.text }}>
                    Set Reminders
                  </Text>
                </View>
                <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                  Get notified before "{eventTitle}"
                </Text>
              </View>

              {/* Reminder Options */}
              <View className="py-2">
                {REMINDER_OPTIONS.map((option, index) => {
                  const isSelected = selectedReminders.includes(option.minutesBefore);
                  const reminderTime = new Date(eventTime.getTime() - option.minutesBefore * 60 * 1000);
                  const isPast = reminderTime <= new Date();

                  return (
                    <Animated.View
                      key={option.minutesBefore}
                      entering={FadeIn.delay(index * 50)}
                    >
                      <Pressable
                        onPress={() => !isPast && handleToggleReminder(option.minutesBefore)}
                        disabled={isPast}
                        className="flex-row items-center px-5 py-3"
                        style={{
                          backgroundColor: isSelected ? `${themeColor}10` : "transparent",
                          opacity: isPast ? 0.5 : 1,
                        }}
                      >
                        <Text className="text-xl mr-3">{option.icon}</Text>
                        <View className="flex-1">
                          <Text
                            className="font-medium"
                            style={{ color: isSelected ? themeColor : colors.text }}
                          >
                            {option.label}
                          </Text>
                          {isPast && (
                            <Text className="text-xs" style={{ color: colors.textTertiary }}>
                              Already passed
                            </Text>
                          )}
                        </View>
                        <View
                          className="w-6 h-6 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: isSelected ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB",
                            borderWidth: isSelected ? 0 : 2,
                            borderColor: colors.border,
                          }}
                        >
                          {isSelected && <Check size={14} color="#fff" />}
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>

              {/* Save Button */}
              <View className="px-5 py-4 border-t" style={{ borderColor: colors.border }}>
                <Pressable
                  onPress={handleSaveReminders}
                  disabled={isSaving}
                  className="rounded-xl py-4 items-center"
                  style={{
                    backgroundColor: themeColor,
                    opacity: isSaving ? 0.7 : 1,
                  }}
                >
                  <Text className="text-white font-semibold">
                    {isSaving ? "Saving..." : "Save Reminders"}
                  </Text>
                </Pressable>
              </View>
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
