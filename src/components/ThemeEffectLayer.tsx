/**
 * ThemeEffectLayer — Ambient particle effects for themed event pages.
 *
 * V1 engine powered by @shopify/react-native-skia Canvas.
 * GPU-accelerated particle rendering with soft-edged circles.
 *
 * Active effects:
 *   worship_night → warm candlelight dust drifting upward
 *   winter_glow   → soft snowfall drifting downward
 *
 * Effect preset mapping lives in eventThemes.ts (effectPreset field).
 * Renders behind the card (absolutely positioned in the atmospheric zone).
 * Returns null for themes with no effect or when reduced motion is enabled.
 *
 * Proof tag: [THEME_EFFECT_ENGINE_V1]
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import {
  Canvas,
  Circle,
  Group,
  BlurMask,
  Mask,
  Rect,
  LinearGradient as SkiaLinearGradient,
  vec,
} from "@shopify/react-native-skia";
import {
  useDerivedValue,
  useSharedValue,
  useFrameCallback,
  useReducedMotion,
} from "react-native-reanimated";
import { resolveEventTheme } from "@/lib/eventThemes";

// ─── Effect preset config ────────────────────────────────────

interface EffectConfig {
  particleCount: number;
  minSize: number;
  maxSize: number;
  minOpacity: number;
  maxOpacity: number;
  /** Pixels per second — vertical drift speed range */
  minSpeed: number;
  maxSpeed: number;
  /** Horizontal sway amplitude in points */
  swayAmplitude: number;
  /** Sway period range in seconds */
  minSwayPeriod: number;
  maxSwayPeriod: number;
  /** +1 = fall down, -1 = rise up */
  direction: 1 | -1;
  /** Blur sigma for soft edges (0 = sharp) */
  blurSigma: number;
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
    minSpeed: 12,
    maxSpeed: 25,
    swayAmplitude: 30,
    minSwayPeriod: 4,
    maxSwayPeriod: 8,
    direction: -1,
    blurSigma: 1.5,
    colors: [
      "rgba(255, 244, 220, 1)", // warm white
      "rgba(255, 223, 170, 1)", // soft gold
      "rgba(255, 210, 140, 1)", // amber glow
      "rgba(240, 200, 150, 1)", // candlelight
    ],
  },
  snowfall: {
    particleCount: 40,
    minSize: 3,
    maxSize: 8,
    minOpacity: 0.3,
    maxOpacity: 0.7,
    minSpeed: 18,
    maxSpeed: 40,
    swayAmplitude: 35,
    minSwayPeriod: 3,
    maxSwayPeriod: 6,
    direction: 1,
    blurSigma: 2,
    colors: [
      "rgba(255, 255, 255, 1)",   // pure white
      "rgba(230, 240, 255, 1)",   // ice blue
      "rgba(210, 225, 250, 1)",   // cool periwinkle
      "rgba(200, 215, 255, 1)",   // cornflower frost
    ],
  },
} as const satisfies Record<string, EffectConfig>;

type EffectPresetId = keyof typeof EFFECT_CONFIGS;

// ─── Particle state ─────────────────────────────────────────

interface ParticleSeed {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  speed: number;
  swayAmplitude: number;
  swayPeriod: number;
  swayOffset: number;
  color: string;
}

function seedParticles(config: EffectConfig, width: number, height: number): ParticleSeed[] {
  const particles: ParticleSeed[] = [];
  for (let i = 0; i < config.particleCount; i++) {
    const r = Math.random;
    particles.push({
      x: r() * width,
      y: r() * height,
      radius: config.minSize + r() * (config.maxSize - config.minSize),
      opacity: config.minOpacity + r() * (config.maxOpacity - config.minOpacity),
      speed: config.minSpeed + r() * (config.maxSpeed - config.minSpeed),
      swayAmplitude: (0.4 + r() * 0.6) * config.swayAmplitude,
      swayPeriod: config.minSwayPeriod + r() * (config.maxSwayPeriod - config.minSwayPeriod),
      swayOffset: r() * Math.PI * 2,
      color: config.colors[Math.floor(r() * config.colors.length)],
    });
  }
  return particles;
}

// ─── Single animated particle ───────────────────────────────

const SkiaParticle = memo(function SkiaParticle({
  index,
  seed,
  particles,
  elapsed,
  blurSigma,
}: {
  index: number;
  seed: ParticleSeed;
  particles: { value: ParticleSeed[] };
  elapsed: { value: number };
  blurSigma: number;
}) {
  const cx = useDerivedValue(() => {
    const p = particles.value[index];
    if (!p) return 0;
    const sway = Math.sin(
      elapsed.value * (Math.PI * 2 / p.swayPeriod) + p.swayOffset
    ) * p.swayAmplitude;
    return p.x + sway;
  });

  const cy = useDerivedValue(() => {
    return particles.value[index]?.y ?? 0;
  });

  return (
    <Circle
      cx={cx}
      cy={cy}
      r={seed.radius}
      color={seed.color}
      opacity={seed.opacity}
    >
      <BlurMask blur={blurSigma} />
    </Circle>
  );
});

// ─── Animated particle field ────────────────────────────────

const ParticleField = memo(function ParticleField({
  config,
  width,
  height,
}: {
  config: EffectConfig;
  width: number;
  height: number;
}) {
  const initialSeeds = useMemo(
    () => seedParticles(config, width, height),
    [config, width, height]
  );

  const particles = useSharedValue(initialSeeds);
  const elapsed = useSharedValue(0);

  useFrameCallback((frameInfo) => {
    "worklet";
    const dt = (frameInfo.timeSincePreviousFrame ?? 16) / 1000;
    elapsed.value += dt;

    const updated = particles.value.map((p) => {
      let newY = p.y + p.speed * config.direction * dt;

      // Respawn at opposite edge when leaving bounds
      if (config.direction === 1 && newY > height + p.radius * 2) {
        newY = -p.radius * 2;
      } else if (config.direction === -1 && newY < -p.radius * 2) {
        newY = height + p.radius * 2;
      }

      return { ...p, y: newY };
    });

    particles.value = updated;
  });

  return (
    <Group>
      {initialSeeds.map((seed, i) => (
        <SkiaParticle
          key={i}
          index={i}
          seed={seed}
          particles={particles}
          elapsed={elapsed}
          blurSigma={config.blurSigma}
        />
      ))}
    </Group>
  );
});

// ─── Main component ─────────────────────────────────────────

interface ThemeEffectLayerProps {
  themeId: string | null | undefined;
  /** Height of the bottom fade zone in points (default 150) */
  fadeHeight?: number;
}

export const ThemeEffectLayer = memo(function ThemeEffectLayer({
  themeId,
  fadeHeight = 80,
}: ThemeEffectLayerProps) {
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const theme = resolveEventTheme(themeId);
  const presetId = theme?.effectPreset as EffectPresetId | undefined;
  const config = presetId && presetId in EFFECT_CONFIGS
    ? EFFECT_CONFIGS[presetId]
    : null;

  if (!config || reducedMotion) return null;

  return (
    <Canvas style={styles.container} pointerEvents="none">
      <Mask
        mode="alpha"
        mask={
          <Rect x={0} y={0} width={width} height={height}>
            <SkiaLinearGradient
              start={vec(0, 0)}
              end={vec(0, height)}
              colors={["white", "white", "transparent"]}
              positions={[0, Math.max(0, (height - fadeHeight) / height), 1]}
            />
          </Rect>
        }
      >
        <ParticleField config={config} width={width} height={height} />
      </Mask>
    </Canvas>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});
