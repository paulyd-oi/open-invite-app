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
  // Breathing (opacity)
  const breathe1 = useSharedValue(0.6);
  const breathe2 = useSharedValue(0.45);
  const breathe3 = useSharedValue(0.35);

  // Drift (translation) — different ranges and durations per orb for organic feel
  // Orb 1 (top-right, large): ±30px X, ±28px Y
  const drift1X = useSharedValue(0);
  const drift1Y = useSharedValue(0);
  // Orb 2 (bottom-left, medium): ±24px X, ±20px Y
  const drift2X = useSharedValue(0);
  const drift2Y = useSharedValue(0);
  // Orb 3 (center-bottom, small): ±18px X, ±22px Y
  const drift3X = useSharedValue(0);
  const drift3Y = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);

    // Breathing animations
    breathe1.value = withRepeat(withTiming(0.9, { duration: 4000, easing: ease }), -1, true);
    breathe2.value = withRepeat(withTiming(0.7, { duration: 5500, easing: ease }), -1, true);
    breathe3.value = withRepeat(withTiming(0.6, { duration: 6000, easing: ease }), -1, true);

    // Drift animations — slow, varied durations, reverse looping
    drift1X.value = withRepeat(withTiming(30, { duration: 11000, easing: ease }), -1, true);
    drift1Y.value = withRepeat(withTiming(-28, { duration: 13000, easing: ease }), -1, true);

    drift2X.value = withRepeat(withTiming(-24, { duration: 12000, easing: ease }), -1, true);
    drift2Y.value = withRepeat(withTiming(20, { duration: 9500, easing: ease }), -1, true);

    drift3X.value = withRepeat(withTiming(18, { duration: 14000, easing: ease }), -1, true);
    drift3Y.value = withRepeat(withTiming(-22, { duration: 10500, easing: ease }), -1, true);
  }, []);

  const orbStyle1 = useAnimatedStyle(() => ({
    opacity: breathe1.value,
    transform: [{ translateX: drift1X.value }, { translateY: drift1Y.value }],
  }));

  const orbStyle2 = useAnimatedStyle(() => ({
    opacity: breathe2.value,
    transform: [{ translateX: drift2X.value }, { translateY: drift2Y.value }],
  }));

  const orbStyle3 = useAnimatedStyle(() => ({
    opacity: breathe3.value,
    transform: [{ translateX: drift3X.value }, { translateY: drift3Y.value }],
  }));

  // Stronger violet/purple presence
  const violet = isDark ? "rgba(147,51,234,0.32)" : "rgba(147,51,234,0.14)";
  // Warm accent orb
  const accent = isDark
    ? `${themeColor}38`
    : `${themeColor}1A`;
  // Pink/magenta center orb for energy
  const pink = isDark ? "rgba(219,39,119,0.22)" : "rgba(219,39,119,0.10)";
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

      {/* Center-bottom pink orb */}
      <Animated.View style={[styles.orb, styles.orbCenterBottom, orbStyle3]}>
        <LinearGradient
          colors={[pink, transparent]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.4 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>
    </View>
  );
}

const ORB_SIZE = 460;

const styles = StyleSheet.create({
  orb: {
    position: "absolute",
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    overflow: "hidden",
  },
  orbTopRight: {
    top: -80,
    right: -60,
  },
  orbBottomLeft: {
    bottom: 20,
    left: -120,
  },
  orbCenterBottom: {
    bottom: -60,
    alignSelf: "center",
    left: "15%",
  },
});
