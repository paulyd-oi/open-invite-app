import React from "react";
import { Pressable, Text, View, ActivityIndicator, StyleProp, ViewStyle, TextStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";
import { LucideIcon } from "lucide-react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AnimatedButtonProps {
  onPress: () => void;
  title: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  hapticStyle?: "light" | "medium" | "heavy" | "none";
}

export function AnimatedButton({
  onPress,
  title,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = "left",
  fullWidth = false,
  style,
  textStyle,
  hapticStyle = "light",
}: AnimatedButtonProps) {
  const { themeColor, isDark, colors } = useTheme();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
    opacity.value = withTiming(0.9, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
    opacity.value = withTiming(1, { duration: 100 });
  };

  const handlePress = () => {
    if (disabled || loading) return;

    // Haptic feedback
    if (hapticStyle !== "none") {
      const feedbackStyle = {
        light: Haptics.ImpactFeedbackStyle.Light,
        medium: Haptics.ImpactFeedbackStyle.Medium,
        heavy: Haptics.ImpactFeedbackStyle.Heavy,
      }[hapticStyle];
      Haptics.impactAsync(feedbackStyle);
    }

    onPress();
  };

  // Size styles
  const sizeStyles = {
    sm: { paddingVertical: 8, paddingHorizontal: 16, fontSize: 14, iconSize: 16 },
    md: { paddingVertical: 12, paddingHorizontal: 20, fontSize: 16, iconSize: 18 },
    lg: { paddingVertical: 16, paddingHorizontal: 28, fontSize: 18, iconSize: 20 },
  }[size];

  // Variant styles
  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: disabled ? colors.textTertiary : themeColor,
          borderWidth: 0,
          borderColor: "transparent",
          textColor: "#FFFFFF",
        };
      case "secondary":
        return {
          backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
          borderWidth: 0,
          borderColor: "transparent",
          textColor: colors.text,
        };
      case "outline":
        return {
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderColor: disabled ? colors.textTertiary : themeColor,
          textColor: disabled ? colors.textTertiary : themeColor,
        };
      case "ghost":
        return {
          backgroundColor: "transparent",
          borderWidth: 0,
          borderColor: "transparent",
          textColor: disabled ? colors.textTertiary : themeColor,
        };
      default:
        return {
          backgroundColor: themeColor,
          borderWidth: 0,
          borderColor: "transparent",
          textColor: "#FFFFFF",
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: sizeStyles.paddingVertical,
          paddingHorizontal: sizeStyles.paddingHorizontal,
          borderRadius: 12,
          backgroundColor: variantStyles.backgroundColor,
          borderWidth: variantStyles.borderWidth,
          borderColor: variantStyles.borderColor,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variantStyles.textColor}
        />
      ) : (
        <>
          {Icon && iconPosition === "left" && (
            <Icon
              size={sizeStyles.iconSize}
              color={variantStyles.textColor}
              style={{ marginRight: 8 }}
            />
          )}
          <Text
            style={[
              {
                fontSize: sizeStyles.fontSize,
                fontWeight: "600",
                color: variantStyles.textColor,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
          {Icon && iconPosition === "right" && (
            <Icon
              size={sizeStyles.iconSize}
              color={variantStyles.textColor}
              style={{ marginLeft: 8 }}
            />
          )}
        </>
      )}
    </AnimatedPressable>
  );
}

// Icon-only animated button
interface AnimatedIconButtonProps {
  onPress: () => void;
  icon: LucideIcon;
  size?: number;
  color?: string;
  backgroundColor?: string;
  disabled?: boolean;
  loading?: boolean;
  hapticStyle?: "light" | "medium" | "heavy" | "none";
  style?: StyleProp<ViewStyle>;
}

export function AnimatedIconButton({
  onPress,
  icon: Icon,
  size = 40,
  color,
  backgroundColor,
  disabled = false,
  loading = false,
  hapticStyle = "light",
  style,
}: AnimatedIconButtonProps) {
  const { themeColor, isDark, colors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handlePress = () => {
    if (disabled || loading) return;

    if (hapticStyle !== "none") {
      const feedbackStyle = {
        light: Haptics.ImpactFeedbackStyle.Light,
        medium: Haptics.ImpactFeedbackStyle.Medium,
        heavy: Haptics.ImpactFeedbackStyle.Heavy,
      }[hapticStyle];
      Haptics.impactAsync(feedbackStyle);
    }

    onPress();
  };

  const iconSize = size * 0.5;
  const iconColor = color ?? themeColor;
  const bgColor = backgroundColor ?? (isDark ? "#2C2C2E" : "#F3F4F6");

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : 1,
        },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <Icon size={iconSize} color={iconColor} />
      )}
    </AnimatedPressable>
  );
}
