import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

const THEME_COLOR_KEY = "@openinvite_theme_color";
const THEME_MODE_KEY = "@openinvite_theme_mode";
const DEFAULT_THEME_COLOR = "#FF6B4A"; // Coral/Orange

export type ThemeMode = "light" | "dark" | "auto";

export const THEME_COLORS = [
  { name: "Coral", color: "#FF6B4A" },
  { name: "Teal", color: "#4ECDC4" },
  { name: "Sky Blue", color: "#45B7D1" },
  { name: "Sage", color: "#96CEB4" },
  { name: "Purple", color: "#9B59B6" },
  { name: "Rose", color: "#E84393" },
  { name: "Amber", color: "#F39C12" },
  { name: "Indigo", color: "#5B67CA" },
];

// Dark mode color palette
export const DARK_COLORS = {
  background: "#000000",
  surface: "#1C1C1E",
  surfaceElevated: "#2C2C2E",
  surfaceSubtle: "#1C1C1E",
  text: "#FFFFFF",
  textSecondary: "#8E8E93",
  textTertiary: "#636366",
  border: "#38383A",
  borderSubtle: "#2C2C2E",
  separator: "#38383A",
};

// Light mode color palette
export const LIGHT_COLORS = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceSubtle: "#F6F7F9",
  text: "#1F2937",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  border: "#E5E7EB",
  borderSubtle: "#F0F0F0",
  separator: "#F3F4F6",
};

/** Reusable tile shadow style (iOS-style subtle elevation). */
export const TILE_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

interface ThemeContextType {
  themeColor: string;
  setThemeColor: (color: string) => Promise<void>;
  themeColorLight: string;
  themeColorName: string;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
  colors: typeof DARK_COLORS;
}

const ThemeContext = createContext<ThemeContextType>({
  themeColor: DEFAULT_THEME_COLOR,
  setThemeColor: async () => {},
  themeColorLight: DEFAULT_THEME_COLOR + "20",
  themeColorName: "Coral",
  themeMode: "auto",
  setThemeMode: async () => {},
  isDark: false,
  colors: LIGHT_COLORS,
});

// Helper to lighten a color for backgrounds
function getLightColor(hex: string): string {
  return hex + "15"; // 15% opacity version
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeColor, setThemeColorState] = useState(DEFAULT_THEME_COLOR);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("auto");
  const [isLoaded, setIsLoaded] = useState(false);

  // Determine if dark mode should be active
  const isDark =
    themeMode === "dark" ||
    (themeMode === "auto" && systemColorScheme === "dark");

  // Get the appropriate color palette
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  // Load saved theme on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(THEME_COLOR_KEY),
      AsyncStorage.getItem(THEME_MODE_KEY),
    ])
      .then(([savedColor, savedMode]) => {
        if (savedColor) {
          setThemeColorState(savedColor);
        }
        if (savedMode && ["light", "dark", "auto"].includes(savedMode)) {
          setThemeModeState(savedMode as ThemeMode);
        }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const setThemeColor = useCallback(async (color: string) => {
    setThemeColorState(color);
    await AsyncStorage.setItem(THEME_COLOR_KEY, color);
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(THEME_MODE_KEY, mode);
  }, []);

  const themeColorLight = getLightColor(themeColor);
  const themeColorName = THEME_COLORS.find((t) => t.color === themeColor)?.name ?? "Custom";

  // Don't render until theme is loaded to prevent flash
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        themeColor,
        setThemeColor,
        themeColorLight,
        themeColorName,
        themeMode,
        setThemeMode,
        isDark,
        colors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
