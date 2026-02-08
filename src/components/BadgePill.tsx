import React from "react";
import { View, Text } from "react-native";
import { useColorScheme } from "react-native";

/** Solid token overrides per badge variant. null = use default tierColor logic. */
const SOLID_TOKENS: Record<string, { bg: string; border: string; text: string; borderWidth: number }> = {
  og:  { bg: "#8C6D2A", border: "#6F541F", text: "#141414", borderWidth: 1 },
  pro: { bg: "#1F6F4A", border: "#165237", text: "#F7F7F7", borderWidth: 1 },
};

interface BadgePillProps {
  name: string;
  tierColor: string;
  size?: "small" | "medium";
  /** Solid-surface variant. Call sites set this based on badge identity. */
  variant?: "default" | "og" | "pro" | "gift";
}

/**
 * Calculate relative luminance of a hex color (WCAG formula).
 * Returns a value between 0 (black) and 1 (white).
 */
function getLuminance(hexColor: string): number {
  const hex = hexColor.replace("#", "");
  if (hex.length < 6) return 0;
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const rL = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gL = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bL = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  return 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
}

/**
 * Compute the effective background color when a tierColor with alpha is over white or dark bg.
 * alpha is 0-255 (e.g. 0x20 = 32 for light mode, 0x40 = 64 for dark mode).
 */
function blendAlpha(hexColor: string, alpha: number, isDark: boolean): string {
  const hex = hexColor.replace("#", "");
  if (hex.length < 6) return isDark ? "#1A1A1A" : "#FFFFFF";
  const a = alpha / 255;
  const fR = parseInt(hex.substring(0, 2), 16);
  const fG = parseInt(hex.substring(2, 4), 16);
  const fB = parseInt(hex.substring(4, 6), 16);
  // Background: white in light mode, near-black in dark mode
  const base = isDark ? 26 : 255; // #1A1A1A or #FFFFFF
  const rr = Math.round(fR * a + base * (1 - a));
  const gg = Math.round(fG * a + base * (1 - a));
  const bb = Math.round(fB * a + base * (1 - a));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
}

/**
 * Text-only badge pill component.
 * - NO emoji
 * - Shows badge name only
 * - Solid tokens for specific variants (og, pro, gift)
 * - Default: tierColor with opacity (higher alpha in dark mode for better contrast)
 * - Text color auto-determined via luminance of effective bg (light bg → dark text)
 * - Small size for cards, medium for profile header
 */
export function BadgePill({ name, tierColor, size = "small", variant = "default" }: BadgePillProps) {
  const isSmall = size === "small";
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const tokens = variant !== "default" ? SOLID_TOKENS[variant] : undefined;
  const bgColor = tokens?.bg ?? tierColor + (isDark ? "40" : "20");
  const borderColor = tokens?.border ?? tierColor;
  const bw = tokens?.borderWidth ?? 0.5;

  // Text color: use solid token if set, otherwise compute from effective bg luminance
  let textColor: string;
  if (tokens?.text) {
    textColor = tokens.text;
  } else {
    const effectiveBg = blendAlpha(tierColor, isDark ? 0x40 : 0x20, isDark);
    const lum = getLuminance(effectiveBg);
    textColor = lum > 0.4 ? "#1A1A1A" : "#F5F5F5";
  }

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
