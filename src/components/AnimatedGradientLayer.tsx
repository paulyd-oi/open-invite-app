/**
 * AnimatedGradientLayer — Slowly cycling gradient background for themed pages.
 *
 * Sits BELOW particles/shaders as the base atmosphere layer.
 * Uses two overlapping LinearGradients with animated opacity crossfade
 * to produce a gentle breathing effect.
 *
 * Respects useReducedMotion — renders static gradient when active.
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
} from "react-native-reanimated";
import { useEffect } from "react";

export interface GradientConfig {
  colors: string[];
  speed?: number;
  angle?: number;
}

interface AnimatedGradientLayerProps {
  config: GradientConfig;
  style?: ViewStyle;
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

/**
 * Convert angle in degrees to LinearGradient start/end points.
 * 0° = left-to-right, 90° = top-to-bottom, 180° = right-to-left, etc.
 * Default 180° = top-to-bottom.
 */
function angleToPoints(deg: number): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const rad = ((deg - 90) * Math.PI) / 180;
  const x = Math.cos(rad);
  const y = Math.sin(rad);
  return {
    start: { x: 0.5 - x * 0.5, y: 0.5 - y * 0.5 },
    end: { x: 0.5 + x * 0.5, y: 0.5 + y * 0.5 },
  };
}

/**
 * Shift colors array by one position to create the alternate state.
 * [A, B, C] → [B, C, A] — gives a gentle color rotation on crossfade.
 */
function shiftColors(colors: string[]): string[] {
  if (colors.length < 2) return colors;
  return [...colors.slice(1), colors[0]];
}

export const AnimatedGradientLayer = memo(function AnimatedGradientLayer({
  config,
  style,
}: AnimatedGradientLayerProps) {
  const { colors, speed = 3, angle = 180 } = config;
  const reducedMotion = useReducedMotion();

  const { start, end } = useMemo(() => angleToPoints(angle), [angle]);
  const altColors = useMemo(() => shiftColors(colors), [colors]);

  // Crossfade opacity between the two gradient layers
  const crossfade = useSharedValue(0);

  // Cycle duration: speed 1 = 20s, speed 3 = 12s, speed 10 = 5s
  const duration = useMemo(() => {
    if (speed <= 0) return 0;
    return Math.max(5000, 22000 - speed * 2000);
  }, [speed]);

  useEffect(() => {
    if (reducedMotion || speed <= 0 || duration === 0) {
      crossfade.value = 0;
      return;
    }
    crossfade.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reducedMotion, speed, duration, crossfade]);

  const altStyle = useAnimatedStyle(() => ({
    opacity: crossfade.value,
  }));

  // Static gradient when no animation needed
  if (speed <= 0 || reducedMotion) {
    return (
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        start={start}
        end={end}
        style={[styles.fill, style]}
        pointerEvents="none"
      />
    );
  }

  return (
    <>
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        start={start}
        end={end}
        style={[styles.fill, style]}
        pointerEvents="none"
      />
      <AnimatedLinearGradient
        colors={altColors as [string, string, ...string[]]}
        start={end}
        end={start}
        style={[styles.fill, style, altStyle]}
        pointerEvents="none"
      />
    </>
  );
});

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default AnimatedGradientLayer;
