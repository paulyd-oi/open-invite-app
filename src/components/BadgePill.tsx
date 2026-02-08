import React from "react";
import { View, Text } from "react-native";
import { useColorScheme } from "react-native";

interface BadgePillProps {
  name: string;
  tierColor: string;
  variant?: "small" | "medium";
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
 * - Background uses tierColor with opacity (higher alpha in dark mode for better contrast)
 * - Text color auto-determined for contrast (light bg → dark text, dark bg → white text)
 * - Small variant for cards, medium for profile header
 */
export function BadgePill({ name, tierColor, variant = "small" }: BadgePillProps) {
  const isSmall = variant === "small";
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // OG badge: solid surface treatment for dark-mode readability
  const isOG = name.toUpperCase() === "OG";
  const bgColor = isOG
    ? "#1F1A08"
    : tierColor + (isDark ? "40" : "20");
  const borderColor = isOG ? "#6B5600" : tierColor;
  const textColor = isOG ? "#FFD54A" : getTextColorForBackground(tierColor);
  
  return (
    <View
      className={`rounded-full items-center justify-center ${isSmall ? "px-2 py-1" : "px-3 py-1.5"}`}
      style={{
        backgroundColor: bgColor,
        borderWidth: isOG ? 1 : 0.5,
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
