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
// Layer stack: background (canvas) < surface (tile) < surfaceElevated (nested)
// Divider hierarchy: divider (faint) < separator (medium) < borderSubtle < border (strongest)
export const DARK_COLORS = {
  background: "#080808",
  surface: "#1C1C1E",
  surfaceElevated: "#2A2A2E",
  surfaceSubtle: "#141416",
  surface2: "#252528",
  text: "#FFFFFF",
  textSecondary: "#98989F",
  textTertiary: "#6E6E73",
  border: "#3C3C40",
  borderSubtle: "#2E2E32",
  separator: "#252528",
  divider: "#1A1A1C",
  pillBg: "#2A2A2E",
  iconMuted: "#6E6E73",
  avatarBg: "#2C2C2E",
  inputBg: "#1A1A1C",
  segmentBg: "#141416",
  segmentActive: "#2C2C2E",
  // Button tokens
  buttonPrimaryBg: "#FF6B4A",
  buttonPrimaryText: "#FFFFFF",
  buttonPrimaryPressedBg: "#E05A3A",
  buttonPrimaryDisabledBg: "#2C2C2E",
  buttonPrimaryDisabledText: "#6E6E73",
  buttonSecondaryBg: "#2A2A2E",
  buttonSecondaryText: "#FFFFFF",
  buttonSecondaryPressedBg: "#252528",
  buttonSecondaryDisabledBg: "#1C1C1E",
  buttonSecondaryDisabledText: "#6E6E73",
  buttonSecondaryBorder: "#3C3C40",
  buttonGhostText: "#FFFFFF",
  buttonGhostPressedBg: "#141416",
  buttonGhostDisabledText: "#6E6E73",
  buttonDestructiveBg: "#DC2626",
  buttonDestructiveText: "#FFFFFF",
  buttonDestructivePressedBg: "#B91C1C",
  buttonDestructiveDisabledBg: "#2C2C2E",
  buttonDestructiveDisabledText: "#6E6E73",
  // Chip tokens
  chipNeutralBg: "#2A2A2E",
  chipNeutralText: "#98989F",
  chipMutedBg: "#141416",
  chipMutedText: "#6E6E73",
  chipAccentBg: "#FF6B4A20",
  chipAccentText: "#FF6B4A",
  chipStatusBg: "#2C2C2E",
  chipStatusText: "#98989F",
  chipBorder: "#3C3C40",
};

// Light mode color palette
export const LIGHT_COLORS = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceSubtle: "#F6F7F9",
  surface2: "#F3F4F6",
  text: "#1F2937",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  border: "#E5E7EB",
  borderSubtle: "#F0F0F0",
  separator: "#F3F4F6",
  divider: "#F3F4F6",
  pillBg: "#F3F4F6",
  iconMuted: "#9CA3AF",
  avatarBg: "#E5E7EB",
  inputBg: "#F9FAFB",
  segmentBg: "#F2F2F7",
  segmentActive: "#FFFFFF",
  // Button tokens
  buttonPrimaryBg: "#FF6B4A",
  buttonPrimaryText: "#FFFFFF",
  buttonPrimaryPressedBg: "#E05A3A",
  buttonPrimaryDisabledBg: "#E5E7EB",
  buttonPrimaryDisabledText: "#9CA3AF",
  buttonSecondaryBg: "#FFFFFF",
  buttonSecondaryText: "#1F2937",
  buttonSecondaryPressedBg: "#F6F7F9",
  buttonSecondaryDisabledBg: "#F9FAFB",
  buttonSecondaryDisabledText: "#9CA3AF",
  buttonSecondaryBorder: "#E5E7EB",
  buttonGhostText: "#1F2937",
  buttonGhostPressedBg: "#F6F7F9",
  buttonGhostDisabledText: "#9CA3AF",
  buttonDestructiveBg: "#EF4444",
  buttonDestructiveText: "#FFFFFF",
  buttonDestructivePressedBg: "#DC2626",
  buttonDestructiveDisabledBg: "#E5E7EB",
  buttonDestructiveDisabledText: "#9CA3AF",
  // Chip tokens
  chipNeutralBg: "#F3F4F6",
  chipNeutralText: "#6B7280",
  chipMutedBg: "#F2F2F7",
  chipMutedText: "#9CA3AF",
  chipAccentBg: "#FF6B4A15",
  chipAccentText: "#FF6B4A",
  chipStatusBg: "#F3F4F6",
  chipStatusText: "#6B7280",
  chipBorder: "#F0F0F0",
};

/** Reusable tile shadow – Tier 1 (standard). */
export const TILE_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

/** Tile shadow – Tier 2 (accent / featured). Slightly more presence. */
export const TILE_SHADOW_ACCENT = {
  shadowColor: "#000",
  shadowOpacity: 0.10,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
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

  // DEV-only proof log — verifies dark token stack on every theme render
  if (__DEV__ && isDark) {
    console.log(
      "[THEME_DARK_POLISH] canvas=%s surface=%s elevated=%s border=%s divider=%s",
      colors.background,
      colors.surface,
      colors.surfaceElevated,
      colors.border,
      colors.divider,
    );
  }

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
