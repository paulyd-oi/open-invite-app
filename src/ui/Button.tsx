/**
 * Button – SSOT button primitive.
 *
 * Variants:
 *   • primary     → solid themeColor bg, white text
 *   • secondary   → surfaceElevated bg + border, default text
 *   • ghost       → transparent bg, themeColor text
 *   • destructive → solid red bg, white text
 *   • success     → solid green bg, white text
 *
 * Uses ThemeContext tokens exclusively. No inline hex values.
 * Pressed state via useState + onPressIn/onPressOut (NativeWind compat).
 */
import React, { useState } from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "@/lib/ThemeContext";
import { SPACING, RADIUS } from "./layout";
import { PRESS_SCALE, SPRING_PRESS } from "./motion";
import { p15, once } from "@/lib/runtimeInvariants";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "success";
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  /** Container style override (should not introduce colors). */
  style?: StyleProp<ViewStyle>;
  size?: "sm" | "md";
  testID?: string;
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
  testID,
}: ButtonProps) {
  const { themeColor, isDark, colors } = useTheme();

  const isDisabled = disabled || loading;
  const [pressed, setPressed] = useState(false);

  // P2 press-scale spring animation
  const scale = useSharedValue(1);
  const animatedScale = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const paddingH = size === "sm" ? SPACING.xl : SPACING.xxl;
  const paddingV = size === "sm" ? SPACING.sm : SPACING.lg;
  const fontSize = size === "sm" ? 13 : 15;

  const getContainerStyle = (pressed: boolean): ViewStyle => {
    const base: ViewStyle = {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: paddingH,
      paddingVertical: paddingV,
      borderRadius: RADIUS.pill,
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

    if (variant === "destructive") {
      return {
        ...base,
        backgroundColor: isDisabled
          ? colors.buttonDestructiveDisabledBg
          : pressed
          ? colors.buttonDestructivePressedBg
          : colors.buttonDestructiveBg,
      };
    }

    if (variant === "success") {
      return {
        ...base,
        backgroundColor: isDisabled
          ? colors.buttonSuccessDisabledBg
          : pressed
          ? colors.buttonSuccessPressedBg
          : colors.buttonSuccessBg,
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
    if (variant === "destructive") {
      return isDisabled
        ? colors.buttonDestructiveDisabledText
        : colors.buttonDestructiveText;
    }
    if (variant === "success") {
      return isDisabled
        ? colors.buttonSuccessDisabledText
        : colors.buttonSuccessText;
    }
    // ghost
    return isDisabled ? colors.buttonGhostDisabledText : themeColor;
  })();

  // [P15_UI_INVAR] DEV-only: detect press attempts while disabled/loading
  const wrappedOnPress = onPress
    ? () => {
        if (__DEV__ && isDisabled && once(`btn_disabled_${label}_${variant}`)) {
          p15('[P15_UI_INVAR]', {
            pressWhileDisabled: true,
            label,
            variant,
            loading,
            disabled,
          });
        }
        onPress();
      }
    : undefined;

  return (
    <AnimatedPressable
      onPress={wrappedOnPress}
      onPressIn={() => {
        setPressed(true);
        scale.value = withSpring(PRESS_SCALE, SPRING_PRESS);
      }}
      onPressOut={() => {
        setPressed(false);
        scale.value = withSpring(1, SPRING_PRESS);
      }}
      disabled={isDisabled}
      testID={testID}
      style={[getContainerStyle(pressed), animatedScale, style]}
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
    </AnimatedPressable>
  );
}

export default Button;
