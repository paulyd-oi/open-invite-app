/**
 * Button – SSOT button primitive.
 *
 * Variants:
 *   • primary   → solid themeColor bg, white text
 *   • secondary → surfaceElevated bg + border, default text
 *   • ghost     → transparent bg, themeColor text
 *
 * Uses ThemeContext tokens exclusively. No inline hex values.
 * Pressed state via Pressable style callback.
 */
import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { useTheme } from "@/lib/ThemeContext";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  /** Container style override (should not introduce colors). */
  style?: StyleProp<ViewStyle>;
  size?: "sm" | "md";
}

export function Button({
  variant = "primary",
  label,
  onPress,
  disabled = false,
  loading = false,
  leftIcon,
  style,
  size = "md",
}: ButtonProps) {
  const { themeColor, colors } = useTheme();

  const isDisabled = disabled || loading;

  const paddingH = size === "sm" ? 12 : 16;
  const paddingV = size === "sm" ? 6 : 10;
  const fontSize = size === "sm" ? 13 : 15;

  const getContainerStyle = (pressed: boolean): ViewStyle => {
    const base: ViewStyle = {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: paddingH,
      paddingVertical: paddingV,
      borderRadius: 9999,
    };

    if (variant === "primary") {
      return {
        ...base,
        backgroundColor: isDisabled
          ? colors.buttonPrimaryDisabledBg
          : pressed
          ? themeColor + "CC"
          : themeColor,
      };
    }

    if (variant === "secondary") {
      return {
        ...base,
        backgroundColor: isDisabled
          ? colors.buttonSecondaryDisabledBg
          : pressed
          ? colors.buttonSecondaryPressedBg
          : colors.buttonSecondaryBg,
        borderWidth: 1,
        borderColor: colors.buttonSecondaryBorder,
      };
    }

    // ghost
    return {
      ...base,
      backgroundColor: pressed ? colors.buttonGhostPressedBg : "transparent",
    };
  };

  const textColor = (() => {
    if (variant === "primary") {
      return isDisabled
        ? colors.buttonPrimaryDisabledText
        : colors.buttonPrimaryText;
    }
    if (variant === "secondary") {
      return isDisabled ? colors.buttonSecondaryDisabledText : themeColor;
    }
    // ghost
    return isDisabled ? colors.buttonGhostDisabledText : themeColor;
  })();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={(state) => [getContainerStyle(state.pressed), style]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {leftIcon != null && leftIcon}
          <Text
            style={{
              color: textColor,
              fontFamily: "Sora_600SemiBold",
              fontSize,
              marginLeft: leftIcon != null ? 6 : 0,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export default Button;
