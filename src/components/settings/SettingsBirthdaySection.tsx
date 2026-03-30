import React from "react";
import { View, Text, Switch, Platform } from "react-native";
import { Pressable } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Cake, ChevronDown } from "@/ui/icons";
import { Button } from "@/ui/Button";

export function formatBirthdayDisplay(date: Date | null): string {
  if (!date) return "Not set";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

interface SettingsBirthdaySectionProps {
  showBirthdaySection: boolean;
  birthday: Date | null;
  showDatePicker: boolean;
  showBirthdayToFriends: boolean;
  omitBirthdayYear: boolean;
  hideBirthdays: boolean;
  colors: { text: string; textSecondary: string; textTertiary: string; separator: string; surface: string; background: string };
  isDark: boolean;
  themeColor: string;
  onToggleSection: () => void;
  onSetShowDatePicker: (show: boolean) => void;
  onDateChange: (event: unknown, selectedDate?: Date) => void;
  onBirthdayToggle: (field: "showBirthdayToFriends" | "hideBirthdays" | "omitBirthdayYear", value: boolean) => void;
}

export function SettingsBirthdaySection({
  showBirthdaySection,
  birthday,
  showDatePicker,
  showBirthdayToFriends,
  omitBirthdayYear,
  hideBirthdays,
  colors,
  isDark,
  themeColor,
  onToggleSection,
  onSetShowDatePicker,
  onDateChange,
  onBirthdayToggle,
}: SettingsBirthdaySectionProps) {
  return (
    <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
      {/* Birthday Date Picker */}
      <Pressable
        onPress={onToggleSection}
        className="flex-row items-center p-4"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
      >
        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
          <Cake size={20} color={themeColor} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text }} className="text-base font-medium">My Birthday</Text>
          <Text style={{ color: colors.textSecondary }} className="text-sm">
            {formatBirthdayDisplay(birthday)}
          </Text>
        </View>
        <ChevronDown
          size={18}
          color={colors.textTertiary}
          style={{ transform: [{ rotate: showBirthdaySection ? "180deg" : "0deg" }] }}
        />
      </Pressable>

      {showBirthdaySection && (
        <View className="px-4 py-3">
          {/* Date Picker Button */}
          <Button
            variant="secondary"
            label={birthday ? "Change Birthday" : "Set Birthday"}
            onPress={() => onSetShowDatePicker(true)}
            style={{ borderRadius: 12, marginBottom: 16 }}
          />

          {showDatePicker && (
            <View className="mb-4">
              <DateTimePicker
                value={birthday || new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                themeVariant={isDark ? "dark" : "light"}
              />
              {Platform.OS === "ios" && (
                <Button
                  variant="primary"
                  label="Done"
                  onPress={() => onSetShowDatePicker(false)}
                  size="sm"
                  style={{ marginTop: 8, borderRadius: 12 }}
                />
              )}
            </View>
          )}

          {/* Birthday Options */}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, paddingTop: 12 }}>
            {/* Show to Friends */}
            <View className="flex-row items-center justify-between py-3">
              <View className="flex-1 mr-3">
                <Text style={{ color: colors.text }} className="text-sm font-medium">Show to Friends</Text>
                <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                  Your birthday will appear on friends' calendars
                </Text>
              </View>
              <Switch
                value={showBirthdayToFriends}
                onValueChange={(value) => onBirthdayToggle("showBirthdayToFriends", value)}
                trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
                thumbColor="#fff"
              />
            </View>

            {/* Omit Birth Year */}
            <View className="flex-row items-center justify-between py-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
              <View className="flex-1 mr-3">
                <Text style={{ color: colors.text }} className="text-sm font-medium">Hide Age/Year</Text>
                <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                  Only show month and day to friends
                </Text>
              </View>
              <Switch
                value={omitBirthdayYear}
                onValueChange={(value) => onBirthdayToggle("omitBirthdayYear", value)}
                trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
                thumbColor="#fff"
              />
            </View>

            {/* Hide Others' Birthdays */}
            <View className="flex-row items-center justify-between py-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
              <View className="flex-1 mr-3">
                <Text style={{ color: colors.text }} className="text-sm font-medium">Hide Birthdays</Text>
                <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                  Don't show friends' birthdays on my calendar
                </Text>
              </View>
              <Switch
                value={hideBirthdays}
                onValueChange={(value) => onBirthdayToggle("hideBirthdays", value)}
                trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
