import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Sparkles, ArrowRight } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { devLog } from "@/lib/devLog";

interface CreateDateTimeSectionProps {
  startDate: Date;
  endDate: Date;
  isSmartMode: boolean;
  isDark: boolean;
  themeColor: string;
  glassSurface: string;
  glassBorder: string;
  glassSecondary: string;
  onStartDateChange: (date: Date) => void;
  onEndDateChange: (date: Date) => void;
  onFindBestTime: () => void;
}

export function CreateDateTimeSection({
  startDate,
  endDate,
  isSmartMode,
  isDark,
  themeColor,
  glassSurface,
  glassBorder,
  glassSecondary,
  onStartDateChange,
  onEndDateChange,
  onFindBestTime,
}: CreateDateTimeSectionProps) {
  return (
    <>
      <View
        style={{
          borderColor: isSmartMode ? themeColor : "transparent",
          borderWidth: isSmartMode ? 1 : 0,
          borderRadius: 12,
        }}
      >
        <View
          className="rounded-xl p-4 mb-4"
          style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}
        >
          {/* Start Row */}
          <View className="flex-row items-center justify-between mb-3">
            <Text style={{ color: glassSecondary }} className="text-xs font-medium w-12">START</Text>
            <View className="flex-row flex-1 items-center justify-end">
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === "ios" ? "compact" : "default"}
                themeVariant={isDark ? "dark" : "light"}
                onChange={(_, date) => date && onStartDateChange(date)}
              />
              <DateTimePicker
                value={startDate}
                mode="time"
                display={Platform.OS === "ios" ? "compact" : "default"}
                themeVariant={isDark ? "dark" : "light"}
                onChange={(_, date) => date && onStartDateChange(date)}
              />
            </View>
          </View>

          {/* End Row */}
          <View className="flex-row items-center justify-between">
            <Text style={{ color: glassSecondary }} className="text-xs font-medium w-12">END</Text>
            <View className="flex-row flex-1 items-center justify-end">
              <DateTimePicker
                value={endDate}
                mode="date"
                display={Platform.OS === "ios" ? "compact" : "default"}
                themeVariant={isDark ? "dark" : "light"}
                onChange={(_, date) => date && onEndDateChange(date)}
              />
              <DateTimePicker
                value={endDate}
                mode="time"
                display={Platform.OS === "ios" ? "compact" : "default"}
                themeVariant={isDark ? "dark" : "light"}
                onChange={(_, date) => date && onEndDateChange(date)}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Find Best Time — routes to Who's Free SSOT */}
      <View className="mb-4">
        <Pressable
          onPress={onFindBestTime}
          className="rounded-xl p-4 flex-row items-center"
          style={{
            backgroundColor: glassSurface,
            borderWidth: 1,
            borderColor: glassBorder,
          }}
        >
          <View
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: `${themeColor}20` }}
          >
            <Sparkles size={20} color={themeColor} />
          </View>
          <View className="flex-1">
            <Text className="font-semibold" style={{ color: themeColor }}>
              Find Best Time
            </Text>
            <Text className="text-sm" style={{ color: glassSecondary }}>
              See when friends are free
            </Text>
          </View>
          <ArrowRight size={20} color={themeColor} />
        </Pressable>
      </View>
    </>
  );
}
