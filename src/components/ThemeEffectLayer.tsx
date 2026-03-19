/**
 * ThemeEffectLayer — Ambient particle effects for themed event pages.
 *
 * V1 engine: supports per-theme effect presets with configurable
 * particle behavior (direction, speed, palette, density, sway).
 *
 * Active effects:
 *   worship_night → warm candlelight dust drifting upward
 *   winter_glow   → soft snowfall drifting downward
 *
 * Renders behind the card (absolutely positioned in the atmospheric zone).
 * Returns null for themes with no effect or when reduced motion is enabled.
 *
 * Uses react-native-reanimated for animation (no external deps).
 * Proof tag: [THEME_EFFECT_ENGINE_V1]
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

// ─── Effect preset config ────────────────────────────────────

interface EffectConfig {
  particleCount: number;
  minSize: number;
  maxSize: number;
  minOpacity: number;
  maxOpacity: number;
  /** Milliseconds for one full vertical cycle */
  minDuration: number;
  maxDuration: number;
  /** Horizontal sway range in points */
  swayRange: number;
  /** +1 = fall down, -1 = rise up */
  direction: 1 | -1;
  /** Vertical travel distance in points */
  travelDistance: number;
  /** Max stagger delay for initial start (ms) */
  staggerMs: number;
  /** Fade-in duration (ms) */
  fadeInMs: number;
  colors: string[];
}

// ─── Effect presets ──────────────────────────────────────────

const EFFECT_CONFIGS = {
  ambient_dust: {
    particleCount: 20,
    minSize: 2,
    maxSize: 6,
    minOpacity: 0.15,
    maxOpacity: 0.45,
    minDuration: 8000,
    maxDuration: 15000,
    swayRange: 30,
    direction: -1,
    travelDistance: 600,
    staggerMs: 4000,
    fadeInMs: 2000,
    colors: [
      "rgba(255, 244, 220, 1)", // warm white
      "rgba(255, 223, 170, 1)", // soft gold
      "rgba(255, 210, 140, 1)", // amber glow
      "rgba(240, 200, 150, 1)", // candlelight
    ],
  },
  snowfall: {
    particleCount: 28,
    minSize: 3,
    maxSize: 8,
    minOpacity: 0.2,
    maxOpacity: 0.55,
    minDuration: 10000,
    maxDuration: 18000,
    swayRange: 45,
    direction: 1,
    travelDistance: 700,
    staggerMs: 5000,
    fadeInMs: 2500,
    colors: [
      "rgba(255, 255, 255, 1)",   // pure white
      "rgba(230, 240, 255, 1)",   // ice blue
      "rgba(210, 225, 250, 1)",   // cool periwinkle
      "rgba(200, 215, 255, 1)",   // cornflower frost
    ],
  },
} as const satisfies Record<string, EffectConfig>;

type EffectPresetId = keyof typeof EFFECT_CONFIGS;

// ─── Theme → effect mapping ─────────────────────────────────

const THEME_EFFECTS: Partial<Record<ThemeId, EffectPresetId>> = {
  worship_night: "ambient_dust",
  winter_glow: "snowfall",
};

// ─── Particle seed ──────────────────────────────────────────

interface ParticleSeed {
  x: number;
  startY: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  swayAmount: number;
  color: string;
}

function seedParticles(config: EffectConfig): ParticleSeed[] {
  const particles: ParticleSeed[] = [];
  for (let i = 0; i < config.particleCount; i++) {
    const rand = () => Math.random();
    particles.push({
      x: rand(),
      startY: rand(),
      size: config.minSize + rand() * (config.maxSize - config.minSize),
      opacity: config.minOpacity + rand() * (config.maxOpacity - config.minOpacity),
      duration: config.minDuration + rand() * (config.maxDuration - config.minDuration),
      delay: rand() * config.staggerMs,
      swayAmount: (rand() - 0.5) * 2 * config.swayRange,
      color: config.colors[Math.floor(rand() * config.colors.length)],
    });
  }
  return particles;
}

// ─── Single particle ────────────────────────────────────────

const Particle = memo(function Particle({
  seed,
  config,
}: {
  seed: ParticleSeed;
  config: EffectConfig;
}) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const particleOpacity = useSharedValue(0);

  React.useEffect(() => {
    // Vertical drift: direction determines up (-1) or down (+1)
    translateY.value = withDelay(
      seed.delay,
      withRepeat(
        withTiming(config.direction * 1.2, {
          duration: seed.duration,
          easing: Easing.linear,
        }),
        -1,
        false
      )
    );

    // Horizontal sway
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

    // Fade in gently
    particleOpacity.value = withDelay(
      seed.delay,
      withTiming(seed.opacity, {
        duration: config.fadeInMs,
        easing: Easing.out(Easing.quad),
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: particleOpacity.value,
    transform: [
      { translateY: translateY.value * config.travelDistance },
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

  const presetId = themeId
    ? THEME_EFFECTS[themeId as ThemeId] ?? null
    : null;

  const config = presetId ? EFFECT_CONFIGS[presetId] : null;

  const particles = useMemo(
    () => (config ? seedParticles(config) : []),
    [config]
  );

  if (!config || reducedMotion) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((seed, i) => (
        <Particle key={i} seed={seed} config={config} />
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
