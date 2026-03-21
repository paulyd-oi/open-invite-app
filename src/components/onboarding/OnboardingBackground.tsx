/**
 * OnboardingBackground — shared ambient glow for all onboarding screens.
 *
 * Renders soft radial gradient orbs with gentle animated opacity to create
 * a calm, premium atmosphere. Uses LinearGradient (already in the app)
 * and Reanimated for lightweight opacity breathing.
 *
 * Does NOT use Skia — keeps this lightweight and safe.
 */
import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface OnboardingBackgroundProps {
  themeColor: string;
  isDark: boolean;
}

export function OnboardingBackground({ themeColor, isDark }: OnboardingBackgroundProps) {
  const breathe1 = useSharedValue(0.45);
  const breathe2 = useSharedValue(0.3);

  useEffect(() => {
    breathe1.value = withRepeat(
      withTiming(0.7, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    breathe2.value = withRepeat(
      withTiming(0.55, { duration: 5500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const orbStyle1 = useAnimatedStyle(() => ({
    opacity: breathe1.value,
  }));

  const orbStyle2 = useAnimatedStyle(() => ({
    opacity: breathe2.value,
  }));

  // Soft violet/lilac tint for ambient glow
  const violet = isDark ? "rgba(147,51,234,0.18)" : "rgba(147,51,234,0.08)";
  const accent = isDark
    ? `${themeColor}20`
    : `${themeColor}10`;
  const transparent = "transparent";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Top-right violet orb */}
      <Animated.View style={[styles.orb, styles.orbTopRight, orbStyle1]}>
        <LinearGradient
          colors={[violet, transparent]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.7, y: 0 }}
          end={{ x: 0.2, y: 1 }}
        />
      </Animated.View>

      {/* Bottom-left accent orb */}
      <Animated.View style={[styles.orb, styles.orbBottomLeft, orbStyle2]}>
        <LinearGradient
          colors={[accent, transparent]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.2, y: 0.8 }}
          end={{ x: 0.9, y: 0.1 }}
        />
      </Animated.View>
    </View>
  );
}

const ORB_SIZE = 340;

const styles = StyleSheet.create({
  orb: {
    position: "absolute",
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    overflow: "hidden",
  },
  orbTopRight: {
    top: -60,
    right: -80,
  },
  orbBottomLeft: {
    bottom: 40,
    left: -100,
  },
});
