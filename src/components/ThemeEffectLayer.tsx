/**
 * ThemeEffectLayer — Ambient particle effects for themed event pages.
 *
 * POC: worship_night only. Renders warm candlelight dust particles
 * drifting slowly upward with gentle horizontal sway.
 *
 * Renders behind the card (absolutely positioned in the atmospheric zone).
 * Returns null for themes with no effect or when reduced motion is enabled.
 *
 * Uses react-native-reanimated for animation (no external deps).
 * Proof tag: [THEME_EFFECT_LAYER_POC]
 */

import React, { memo, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  useReducedMotion,
} from "react-native-reanimated";
import type { ThemeId } from "@/lib/eventThemes";

// ─── Effect registry — only worship_night for this POC ─────

type EffectPreset = "ambient_dust";

const THEME_EFFECTS: Partial<Record<ThemeId, EffectPreset>> = {
  worship_night: "ambient_dust",
};

// ─── Particle config ────────────────────────────────────────

const PARTICLE_COUNT = 20;
const MIN_SIZE = 2;
const MAX_SIZE = 6;
const MIN_OPACITY = 0.15;
const MAX_OPACITY = 0.45;
const MIN_DURATION = 8000;
const MAX_DURATION = 15000;
const SWAY_RANGE = 30; // horizontal sway in points

// Warm white to soft gold palette for worship_night
const PARTICLE_COLORS = [
  "rgba(255, 244, 220, 1)", // warm white
  "rgba(255, 223, 170, 1)", // soft gold
  "rgba(255, 210, 140, 1)", // amber glow
  "rgba(240, 200, 150, 1)", // candlelight
];

// ─── Seed a particle's random properties ────────────────────

interface ParticleSeed {
  x: number; // 0-1 fraction of container width
  startY: number; // 0-1 fraction, starting vertical position
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  swayAmount: number;
  color: string;
}

function seedParticles(count: number): ParticleSeed[] {
  const particles: ParticleSeed[] = [];
  for (let i = 0; i < count; i++) {
    const rand = () => Math.random();
    particles.push({
      x: rand(),
      startY: rand(), // spread across full height initially
      size: MIN_SIZE + rand() * (MAX_SIZE - MIN_SIZE),
      opacity: MIN_OPACITY + rand() * (MAX_OPACITY - MIN_OPACITY),
      duration: MIN_DURATION + rand() * (MAX_DURATION - MIN_DURATION),
      delay: rand() * 4000, // stagger initial start
      swayAmount: (rand() - 0.5) * 2 * SWAY_RANGE,
      color: PARTICLE_COLORS[Math.floor(rand() * PARTICLE_COLORS.length)],
    });
  }
  return particles;
}

// ─── Single particle ────────────────────────────────────────

const Particle = memo(function Particle({ seed }: { seed: ParticleSeed }) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const particleOpacity = useSharedValue(0);

  React.useEffect(() => {
    // Vertical drift: rise from start position to above viewport
    translateY.value = withDelay(
      seed.delay,
      withRepeat(
        withTiming(-1.2, {
          duration: seed.duration,
          easing: Easing.linear,
        }),
        -1, // infinite
        false
      )
    );

    // Horizontal sway: gentle back and forth
    translateX.value = withDelay(
      seed.delay,
      withRepeat(
        withSequence(
          withTiming(seed.swayAmount, {
            duration: seed.duration * 0.5,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(-seed.swayAmount, {
            duration: seed.duration * 0.5,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      )
    );

    // Fade in gently, then hold
    particleOpacity.value = withDelay(
      seed.delay,
      withTiming(seed.opacity, {
        duration: 2000,
        easing: Easing.out(Easing.quad),
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: particleOpacity.value,
    transform: [
      // translateY.value is 0...-1.2 (fraction), multiply by container
      // We use percentage-based positioning via top/left and translate in points
      { translateY: translateY.value * 600 },
      { translateX: translateX.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: `${seed.x * 100}%` as any,
          top: `${seed.startY * 100}%` as any,
          width: seed.size,
          height: seed.size,
          borderRadius: seed.size / 2,
          backgroundColor: seed.color,
        },
        animatedStyle,
      ]}
    />
  );
});

// ─── Main component ─────────────────────────────────────────

interface ThemeEffectLayerProps {
  themeId: string | null | undefined;
}

export const ThemeEffectLayer = memo(function ThemeEffectLayer({
  themeId,
}: ThemeEffectLayerProps) {
  const reducedMotion = useReducedMotion();

  const effectPreset = themeId
    ? THEME_EFFECTS[themeId as ThemeId] ?? null
    : null;

  const particles = useMemo(
    () => (effectPreset ? seedParticles(PARTICLE_COUNT) : []),
    [effectPreset]
  );

  // No effect for this theme, or reduced motion enabled
  if (!effectPreset || reducedMotion) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((seed, i) => (
        <Particle key={i} seed={seed} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
});
