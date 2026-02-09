/**
 * IconButton – SSOT icon-only button primitive.
 *
 * Variants:
 *   • ghost  → transparent bg, icon inherits color
 *   • filled → surfaceElevated bg, icon inherits color
 *
 * Enforces 44px minimum tap target via hitSlop.
 * Uses ThemeContext tokens exclusively. No inline hex values.
 */
import React from "react";
import { Pressable, type ViewStyle, type StyleProp } from "react-native";
import { useTheme } from "@/lib/ThemeContext";
import { hitSlop as computeHitSlop } from "./layout";

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  variant?: "ghost" | "filled";
  testID?: string;
  accessibilityLabel: string;
  /** Container style override (should not introduce colors). */
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  disabled = false,
  size = "md",
  variant = "ghost",
  testID,
  accessibilityLabel,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();

  const dim = size === "sm" ? 32 : 40;
  const hitPad = computeHitSlop(dim);

  const getContainerStyle = (pressed: boolean): ViewStyle => {
    const base: ViewStyle = {
      width: dim,
      height: dim,
      borderRadius: dim / 2,
      alignItems: "center",
      justifyContent: "center",
      opacity: disabled ? 0.4 : 1,
    };

    if (variant === "filled") {
      return {
        ...base,
        backgroundColor: pressed
          ? colors.buttonSecondaryPressedBg
          : colors.surfaceElevated,
      };
    }

    // ghost
    return {
      ...base,
      backgroundColor: pressed ? colors.buttonGhostPressedBg : "transparent",
    };
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      hitSlop={hitPad}
      style={(state) => [getContainerStyle(state.pressed), style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {icon}
    </Pressable>
  );
}

export default IconButton;
