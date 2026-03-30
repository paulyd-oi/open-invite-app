import React from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Palette, Check, Sun, Moon, Smartphone } from "@/ui/icons";
import { THEME_COLORS, type ThemeMode } from "@/lib/ThemeContext";

interface SettingsThemeSectionProps {
  themeMode: ThemeMode;
  themeColor: string;
  themeColorName: string;
  showThemeModePicker: boolean;
  showThemePicker: boolean;
  colors: {
    text: string;
    textSecondary: string;
    textTertiary: string;
    surface: string;
    separator: string;
    border: string;
  };
  isDark: boolean;
  onToggleModePicker: () => void;
  onToggleColorPicker: () => void;
  onSaveThemeMode: (mode: ThemeMode) => void;
  onSaveTheme: (color: string) => void;
}

function getThemeModeLabel(mode: ThemeMode) {
  switch (mode) {
    case "light": return "Light";
    case "dark": return "Dark";
    case "auto": return "Auto (System)";
  }
}

function getThemeModeIcon(mode: ThemeMode, themeColor: string) {
  switch (mode) {
    case "light": return <Sun size={20} color={themeColor} />;
    case "dark": return <Moon size={20} color={themeColor} />;
    case "auto": return <Smartphone size={20} color={themeColor} />;
  }
}

export function SettingsThemeSection({
  themeMode,
  themeColor,
  themeColorName,
  showThemeModePicker,
  showThemePicker,
  colors,
  isDark,
  onToggleModePicker,
  onToggleColorPicker,
  onSaveThemeMode,
  onSaveTheme,
}: SettingsThemeSectionProps) {
  return (
    <Animated.View entering={FadeInDown.delay(100).springify()} className="mx-4 mt-6">
      <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">APPEARANCE</Text>
      <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
        {/* Theme Mode Picker */}
        <Pressable
          onPress={onToggleModePicker}
          className="flex-row items-center p-4"
          style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
        >
          <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
            {getThemeModeIcon(themeMode, themeColor)}
          </View>
          <View className="flex-1">
            <Text style={{ color: colors.text }} className="text-base font-medium">Theme Mode</Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm">
              {getThemeModeLabel(themeMode)}
            </Text>
          </View>
          <Text style={{ color: colors.textTertiary }} className="text-lg">{showThemeModePicker ? "\u2039" : "\u203A"}</Text>
        </Pressable>

        {showThemeModePicker && (
          <View className="px-4 pb-4 pt-2">
            {(["light", "dark", "auto"] as ThemeMode[]).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => onSaveThemeMode(mode)}
                className="flex-row items-center py-3 px-2 rounded-xl mb-1"
                style={{ backgroundColor: themeMode === mode ? `${themeColor}15` : "transparent" }}
              >
                <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: themeMode === mode ? `${themeColor}20` : isDark ? "#2C2C2E" : "#F3F4F6" }}>
                  {mode === "light" && <Sun size={18} color={themeMode === mode ? themeColor : colors.textSecondary} />}
                  {mode === "dark" && <Moon size={18} color={themeMode === mode ? themeColor : colors.textSecondary} />}
                  {mode === "auto" && <Smartphone size={18} color={themeMode === mode ? themeColor : colors.textSecondary} />}
                </View>
                <Text style={{ color: themeMode === mode ? themeColor : colors.text }} className="flex-1 font-medium">
                  {getThemeModeLabel(mode)}
                </Text>
                {themeMode === mode && <Check size={18} color={themeColor} />}
              </Pressable>
            ))}
          </View>
        )}

        {/* Theme Color Picker */}
        <Pressable
          onPress={onToggleColorPicker}
          className="flex-row items-center p-4"
        >
          <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
            <Palette size={20} color={themeColor} />
          </View>
          <View className="flex-1">
            <Text style={{ color: colors.text }} className="text-base font-medium">Theme Color</Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm">
              {themeColorName}
            </Text>
          </View>
          <View
            className="w-6 h-6 rounded-full border-2"
            style={{ backgroundColor: themeColor, borderColor: colors.border }}
          />
        </Pressable>

        {showThemePicker && (
          <View className="px-4 pb-4">
            <View className="flex-row flex-wrap">
              {THEME_COLORS.map((theme) => (
                <Pressable
                  key={theme.color}
                  onPress={() => onSaveTheme(theme.color)}
                  className="w-1/4 p-2"
                >
                  <View className="items-center">
                    <View
                      className="w-12 h-12 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: theme.color,
                        borderWidth: themeColor === theme.color ? 2 : 0,
                        borderColor: isDark ? "#FFFFFF" : "#1F2937"
                      }}
                    >
                      {themeColor === theme.color && (
                        <Check size={20} color="#fff" />
                      )}
                    </View>
                    <Text style={{ color: colors.textSecondary }} className="text-xs mt-1 text-center">{theme.name}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}
