import React from "react";
import { View, Text } from "react-native";
import { useColorScheme } from "react-native";

/** Solid token overrides per badge variant. null = use default tierColor logic. */
const SOLID_TOKENS: Record<string, { bg: string; border: string; text: string; borderWidth: number }> = {
  og:   { bg: "#1F1A08", border: "#6B5600", text: "#FFD54A", borderWidth: 1 },
  // pro / gift reserved — add tokens here when ready
};

interface BadgePillProps {
  name: string;
  tierColor: string;
  size?: "small" | "medium";
  /** Solid-surface variant. Call sites set this based on badge identity. */
  variant?: "default" | "og" | "pro" | "gift";
}

/**
 * Calculate luminance of a hex color to determine if text should be light or dark.
 * Uses relative luminance formula from WCAG guidelines.
 */
function getTextColorForBackground(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace("#", "");
  
  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  // Apply gamma correction
  const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  
  // Calculate relative luminance
  const luminance = 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  
  // Return dark text for light backgrounds (luminance > 0.5), white text for dark backgrounds
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

/**
 * Text-only badge pill component.
 * - NO emoji
 * - Shows badge name only
 * - Solid tokens for specific variants (og, pro, gift)
 * - Default: tierColor with opacity (higher alpha in dark mode for better contrast)
 * - Text color auto-determined for contrast (light bg → dark text, dark bg → white text)
 * - Small size for cards, medium for profile header
 */
export function BadgePill({ name, tierColor, size = "small", variant = "default" }: BadgePillProps) {
  const isSmall = size === "small";
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const tokens = variant !== "default" ? SOLID_TOKENS[variant] : undefined;
  const bgColor = tokens?.bg ?? tierColor + (isDark ? "40" : "20");
  const borderColor = tokens?.border ?? tierColor;
  const textColor = tokens?.text ?? getTextColorForBackground(tierColor);
  const bw = tokens?.borderWidth ?? 0.5;
  
  return (
    <View
      className={`rounded-full items-center justify-center ${isSmall ? "px-2 py-1" : "px-3 py-1.5"}`}
      style={{
        backgroundColor: bgColor,
        borderWidth: bw,
        borderColor,
      }}
    >
      <Text
        className={`font-semibold ${isSmall ? "text-xs" : "text-sm"}`}
        style={{ color: textColor, fontWeight: "600" }}
      >
        {name}
      </Text>
    </View>
  );
}
