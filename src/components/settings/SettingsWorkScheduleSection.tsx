import React from "react";
import { View, Text, Switch, Platform, Pressable } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Briefcase, ChevronDown, Plus, X } from "@/ui/icons";

export interface WorkScheduleDay {
  id: string;
  dayOfWeek: number;
  dayName: string;
  isEnabled: boolean;
  startTime: string | null;
  endTime: string | null;
  label: string;
  block2StartTime?: string | null;
  block2EndTime?: string | null;
}

export interface WorkScheduleSettings {
  showOnCalendar: boolean;
}

export function formatTimeDisplay(time: string | null): string {
  if (!time) return "--:--";
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

export function parseTimeToDate(time: string | null): Date {
  const date = new Date();
  if (time) {
    const [hours, minutes] = time.split(":");
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

interface SettingsWorkScheduleSectionProps {
  showWorkScheduleSection: boolean;
  workSchedules: WorkScheduleDay[];
  workSettings: WorkScheduleSettings;
  showTimePicker: { day: number; type: "start" | "end" | "block2Start" | "block2End" } | null;
  expandedBlock2Days: Set<number>;
  colors: { text: string; textSecondary: string; textTertiary: string; separator: string; surface: string; background: string };
  isDark: boolean;
  themeColor: string;
  onToggleSection: () => void;
  onSetShowTimePicker: (val: { day: number; type: "start" | "end" | "block2Start" | "block2End" } | null) => void;
  onWorkScheduleToggle: (dayOfWeek: number, isEnabled: boolean) => void;
  onWorkScheduleTimeChange: (dayOfWeek: number, type: "start" | "end" | "block2Start" | "block2End", date: Date) => void;
  onToggleBlock2: (dayOfWeek: number) => void;
  onUpdateWorkSettings: (data: { showOnCalendar: boolean }) => void;
}

export function SettingsWorkScheduleSection({
  showWorkScheduleSection,
  workSchedules,
  workSettings,
  showTimePicker,
  expandedBlock2Days,
  colors,
  isDark,
  themeColor,
  onToggleSection,
  onSetShowTimePicker,
  onWorkScheduleToggle,
  onWorkScheduleTimeChange,
  onToggleBlock2,
  onUpdateWorkSettings,
}: SettingsWorkScheduleSectionProps) {
  return (
    <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
      {/* Work Schedule Header */}
      <Pressable
        onPress={onToggleSection}
        className="flex-row items-center p-4"
        style={{ borderBottomWidth: showWorkScheduleSection ? 1 : 0, borderBottomColor: colors.separator }}
      >
        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
          <Briefcase size={20} color={themeColor} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text }} className="text-base font-medium">Weekly Schedule</Text>
          <Text style={{ color: colors.textSecondary }} className="text-sm">
            {workSchedules.filter((s) => s.isEnabled).length} work days set
          </Text>
        </View>
        <ChevronDown
          size={18}
          color={colors.textTertiary}
          style={{ transform: [{ rotate: showWorkScheduleSection ? "180deg" : "0deg" }] }}
        />
      </Pressable>

      {showWorkScheduleSection && (
        <View className="px-4 py-3">
          <Text style={{ color: colors.textTertiary }} className="text-xs mb-3">
            Set your regular work hours. These will show as "Busy" on your calendar and help friends see when you're free. Tap (+) to add a second time block for split schedules.
          </Text>

          {/* Day-by-day schedule */}
          {workSchedules.map((schedule, index) => {
            const hasBlock2 = expandedBlock2Days.has(schedule.dayOfWeek) ||
              (schedule.block2StartTime && schedule.block2EndTime);

            return (
              <View
                key={schedule.dayOfWeek}
                className="py-3"
                style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.separator }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1">
                    <Text
                      style={{ color: schedule.isEnabled ? colors.text : colors.textTertiary }}
                      className="text-sm font-medium w-20"
                    >
                      {schedule.dayName}
                    </Text>
                    {schedule.isEnabled && (
                      <View className="flex-row items-center ml-2">
                        <Pressable
                          onPress={() => onSetShowTimePicker({ day: schedule.dayOfWeek, type: "start" })}
                          className="px-2 py-1 rounded-lg mr-1"
                          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                        >
                          <Text style={{ color: themeColor }} className="text-xs font-medium">
                            {formatTimeDisplay(schedule.startTime)}
                          </Text>
                        </Pressable>
                        <Text style={{ color: colors.textTertiary }} className="text-xs">to</Text>
                        <Pressable
                          onPress={() => onSetShowTimePicker({ day: schedule.dayOfWeek, type: "end" })}
                          className="px-2 py-1 rounded-lg ml-1"
                          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                        >
                          <Text style={{ color: themeColor }} className="text-xs font-medium">
                            {formatTimeDisplay(schedule.endTime)}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                  <Switch
                    value={schedule.isEnabled}
                    onValueChange={(value) => onWorkScheduleToggle(schedule.dayOfWeek, value)}
                    trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
                    thumbColor="#fff"
                  />
                </View>

                {/* Block 2 (split schedule) */}
                {schedule.isEnabled && hasBlock2 && (
                  <View className="flex-row items-center mt-2 ml-20">
                    <Pressable
                      onPress={() => onSetShowTimePicker({ day: schedule.dayOfWeek, type: "block2Start" })}
                      className="px-2 py-1 rounded-lg mr-1"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                    >
                      <Text style={{ color: themeColor }} className="text-xs font-medium">
                        {formatTimeDisplay(schedule.block2StartTime ?? null)}
                      </Text>
                    </Pressable>
                    <Text style={{ color: colors.textTertiary }} className="text-xs">to</Text>
                    <Pressable
                      onPress={() => onSetShowTimePicker({ day: schedule.dayOfWeek, type: "block2End" })}
                      className="px-2 py-1 rounded-lg ml-1"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                    >
                      <Text style={{ color: themeColor }} className="text-xs font-medium">
                        {formatTimeDisplay(schedule.block2EndTime ?? null)}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onToggleBlock2(schedule.dayOfWeek)}
                      className="ml-2 w-6 h-6 rounded-full items-center justify-center"
                      style={{ backgroundColor: isDark ? "#3A3A3C" : "#E5E7EB" }}
                    >
                      <X size={14} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                )}

                {/* Add Block 2 button */}
                {schedule.isEnabled && !hasBlock2 && (
                  <Pressable
                    onPress={() => onToggleBlock2(schedule.dayOfWeek)}
                    className="flex-row items-center mt-2 ml-20"
                  >
                    <View
                      className="w-5 h-5 rounded-full items-center justify-center mr-1"
                      style={{ backgroundColor: `${themeColor}20` }}
                    >
                      <Plus size={12} color={themeColor} />
                    </View>
                    <Text style={{ color: themeColor }} className="text-xs">
                      Add second block
                    </Text>
                  </Pressable>
                )}

                {/* Time Picker for this day */}
                {showTimePicker?.day === schedule.dayOfWeek && (
                  <View className="mt-3">
                    <DateTimePicker
                      value={parseTimeToDate(
                        showTimePicker.type === "start" ? schedule.startTime :
                        showTimePicker.type === "end" ? schedule.endTime :
                        showTimePicker.type === "block2Start" ? (schedule.block2StartTime ?? null) :
                        (schedule.block2EndTime ?? null)
                      )}
                      mode="time"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_event, selectedDate) => {
                        if (Platform.OS !== "ios") {
                          onSetShowTimePicker(null);
                        }
                        if (selectedDate) {
                          onWorkScheduleTimeChange(schedule.dayOfWeek, showTimePicker.type, selectedDate);
                        }
                      }}
                      themeVariant={isDark ? "dark" : "light"}
                      style={{ height: 120 }}
                    />
                    {Platform.OS === "ios" && (
                      <Pressable
                        onPress={() => onSetShowTimePicker(null)}
                        className="py-2 mt-2 rounded-xl"
                        style={{ backgroundColor: themeColor }}
                      >
                        <Text className="text-center text-white font-medium">Done</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {/* Show on Calendar Toggle */}
          <View
            className="flex-row items-center justify-between py-3 mt-2"
            style={{ borderTopWidth: 1, borderTopColor: colors.separator }}
          >
            <View className="flex-1 mr-3">
              <Text style={{ color: colors.text }} className="text-sm font-medium">Show on Calendar</Text>
              <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                Display work hours as bubbles on your calendar
              </Text>
            </View>
            <Switch
              value={workSettings.showOnCalendar}
              onValueChange={(value) => onUpdateWorkSettings({ showOnCalendar: value })}
              trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
              thumbColor="#fff"
            />
          </View>
        </View>
      )}
    </View>
  );
}
