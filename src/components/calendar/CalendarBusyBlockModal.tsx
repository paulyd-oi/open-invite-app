import React from "react";
import { View, Text, Pressable, Modal, TextInput } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { ChevronLeft, ChevronRight, Briefcase } from "@/ui/icons";
import { DARK_COLORS } from "@/lib/ThemeContext";

interface CalendarBusyBlockModalProps {
  visible: boolean;
  busyLabel: string;
  busyStartTime: Date | null;
  busyEndTime: Date | null;
  selectedDate: Date;
  isPending: boolean;
  colors: typeof DARK_COLORS;
  isDark: boolean;
  onClose: () => void;
  onLabelChange: (label: string) => void;
  onAdjustStart: (newStart: Date) => void;
  onAdjustEnd: (newEnd: Date) => void;
  onCreateBusy: () => void;
}

export function CalendarBusyBlockModal({
  visible,
  busyLabel,
  busyStartTime,
  busyEndTime,
  selectedDate,
  isPending,
  colors,
  isDark,
  onClose,
  onLabelChange,
  onAdjustStart,
  onAdjustEnd,
  onCreateBusy,
}: CalendarBusyBlockModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center"
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        onPress={onClose}
      >
        {/* INVARIANT_ALLOW_INLINE_HANDLER */}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            entering={FadeIn.duration(200)}
            className="mx-6 rounded-3xl overflow-hidden"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{
              backgroundColor: colors.surface,
              width: 320,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
            }}
          >
            {/* Header */}
            <View className="px-5 pt-5 pb-3">
              <View className="flex-row items-center">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{ backgroundColor: "#6B728020" }}
                >
                  <Briefcase size={20} color="#6B7280" />
                </View>
                <View>
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                    Add Busy Block
                  </Text>
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    {selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Label Input */}
            <View className="px-5 py-3">
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                Label (optional)
              </Text>
              <TextInput
                value={busyLabel}
                onChangeText={onLabelChange}
                placeholder="Busy"
                placeholderTextColor={colors.textTertiary}
                className="px-4 py-3 rounded-xl text-base"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{
                  backgroundColor: colors.inputBg,
                  color: colors.text,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />

                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="text-xs mt-2" style={{ color: colors.textTertiary }}>
                  Busy blocks are private placeholders and can't be joined.
                </Text>

            </View>

            {/* Time Pickers */}
            <View className="px-5 py-2">
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                Time
              </Text>
              <View className="flex-row items-center">
                <Pressable
                  /* INVARIANT_ALLOW_INLINE_HANDLER */
                  onPress={() => {
                    const newTime = new Date(busyStartTime ?? selectedDate);
                    newTime.setMinutes(newTime.getMinutes() - 15);
                    onAdjustStart(newTime);
                  }}
                  className="px-3 py-2"
                >
                  <ChevronLeft size={16} color={colors.textSecondary} />
                </Pressable>
                <View className="flex-1 items-center">
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-base font-medium" style={{ color: colors.text }}>
                    {busyStartTime?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) ?? "9:00 AM"}
                  </Text>
                </View>
                <Pressable
                  /* INVARIANT_ALLOW_INLINE_HANDLER */
                  onPress={() => {
                    const newTime = new Date(busyStartTime ?? selectedDate);
                    newTime.setMinutes(newTime.getMinutes() + 15);
                    onAdjustStart(newTime);
                  }}
                  className="px-3 py-2"
                >
                  <ChevronRight size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-center text-sm my-1" style={{ color: colors.textSecondary }}>to</Text>
              <View className="flex-row items-center">
                <Pressable
                  /* INVARIANT_ALLOW_INLINE_HANDLER */
                  onPress={() => {
                    const newTime = new Date(busyEndTime ?? selectedDate);
                    newTime.setMinutes(newTime.getMinutes() - 15);
                    onAdjustEnd(newTime);
                  }}
                  className="px-3 py-2"
                >
                  <ChevronLeft size={16} color={colors.textSecondary} />
                </Pressable>
                <View className="flex-1 items-center">
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-base font-medium" style={{ color: colors.text }}>
                    {busyEndTime?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) ?? "10:00 AM"}
                  </Text>
                </View>
                <Pressable
                  /* INVARIANT_ALLOW_INLINE_HANDLER */
                  onPress={() => {
                    const newTime = new Date(busyEndTime ?? selectedDate);
                    newTime.setMinutes(newTime.getMinutes() + 15);
                    onAdjustEnd(newTime);
                  }}
                  className="px-3 py-2"
                >
                  <ChevronRight size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            {/* Actions */}
            <View className="px-5 pb-5 pt-3 flex-row gap-3">
              <Pressable
                onPress={onClose}
                className="flex-1 py-3 rounded-xl items-center"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ backgroundColor: colors.surface2 }}
              >
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="font-semibold" style={{ color: colors.text }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                testID="calendar-busy-save"
                onPress={onCreateBusy}
                disabled={isPending}
                className="flex-1 py-3 rounded-xl items-center"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ backgroundColor: colors.textSecondary, opacity: isPending ? 0.6 : 1 }}
              >
                <Text className="font-semibold text-white">
                  {isPending ? "Adding..." : "Add"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
