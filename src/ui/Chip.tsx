/**
 * Chip – SSOT pill/tag primitive.
 *
 * Variants:
 *   • neutral → pillBg, textSecondary (default)
 *   • muted   → segmentBg, textTertiary
 *   • accent  → themeColor-tinted bg, themeColor text
 *   • status  → chipStatusBg, chipStatusText (override via `color` prop)
 *
 * When `color` is provided on status variant, bg = color+20, text = color.
 * When `onPress` is provided, renders as Pressable with opacity press feedback;
 * otherwise plain View.
 * Uses ThemeContext tokens exclusively. No inline hex values.
 */
import React from "react";
import {
  View,
  Text,
  Pressable,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { useTheme } from "@/lib/ThemeContext";
import { SPACING, RADIUS } from "./layout";

export interface ChipProps {
  variant?: "neutral" | "muted" | "accent" | "status";
  label: string;
  leftIcon?: React.ReactNode;
  /** Optional right-side adornment (count badge, etc.). */
  rightAdornment?: React.ReactNode;
  /** Tappable when provided. */
  onPress?: () => void;
  /** Container style override (should not introduce colors). */
  style?: StyleProp<ViewStyle>;
  /** Custom color for status variant (bg = color+20, text = color). */
  color?: string;
  size?: "sm" | "md";
}

export function Chip({
  variant = "neutral",
  label,
  leftIcon,
  rightAdornment,
  onPress,
  style,
  color,
  size = "md",
}: ChipProps) {
  const { themeColor, colors } = useTheme();

  const paddingH = size === "sm" ? SPACING.md : SPACING.xl;
  const paddingV = size === "sm" ? 3 : SPACING.sm;
  const fontSize = size === "sm" ? 11 : 13;

  const { bg, fg } = (() => {
    switch (variant) {
      case "muted":
        return { bg: colors.chipMutedBg, fg: colors.chipMutedText };
      case "accent":
        return { bg: `${themeColor}20`, fg: themeColor };
      case "status":
        return color
          ? { bg: `${color}20`, fg: color }
          : { bg: colors.chipStatusBg, fg: colors.chipStatusText };
      default: // neutral
        return { bg: colors.chipNeutralBg, fg: colors.chipNeutralText };
    }
  })();

  const containerStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: paddingH,
    paddingVertical: paddingV,
    borderRadius: RADIUS.pill,
    backgroundColor: bg,
  };

  const content = (
    <>
      {leftIcon != null && leftIcon}
      <Text
        style={{
          color: fg,
          fontSize,
          fontWeight: "500",
          marginLeft: leftIcon != null ? 4 : 0,
        }}
      >
        {label}
      </Text>
      {rightAdornment != null && rightAdornment}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={(state) => [
          containerStyle,
          { opacity: state.pressed ? 0.7 : 1 },
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[containerStyle, style]}>
      {content}
    </View>
  );
}

export default Chip;
