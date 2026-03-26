/**
 * MotifOverlay — Page-wide animated motif overlay for the create page.
 *
 * Renders large, sparse, art-directed motifs (petals, hearts, footballs, etc.)
 * using the existing Skia Canvas + Reanimated particle engine.
 *
 * V2 engine changes:
 *   - Content-safe zone: top 80px and bottom 80px get reduced opacity (0.3×)
 *     so motifs never obscure title text or bottom dock controls.
 *   - Size ceiling: no motif exceeds MAX_MOTIF_RADIUS (28px radius = 56px diameter).
 *   - Density ceiling: no preset exceeds MAX_MOTIF_COUNT (14 particles).
 *
 * Hero zone (top ~220px): full intensity.
 * Body zone: reduced opacity (~50%) for readability.
 *
 * Each preset has distinct shape language — visually distinguishable at a glance.
 */

import React, { memo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import LottieView, { type AnimationObject } from "lottie-react-native";
import {
  Canvas,
  _skiaAvailable,
  ParticleField,
  SpriteField,
  SkiaErrorBoundary,
} from "@/components/ThemeEffectLayer";
import type { SpriteOverlayConfig } from "@/components/ThemeEffectLayer";

// ─── Rendering ceilings ─────────────────────────────────────
/** Max particle radius in points — clamps all presets at seed time */
const MAX_MOTIF_RADIUS = 28;
/** Max particle count per preset — prevents density overload */
const MAX_MOTIF_COUNT = 14;

// ─── Motif preset configs ────────────────────────────────────
// Art direction: fewer motifs, larger size, slower motion, softer opacity.
// Each preset is visually distinct via shape + color + behavior.

/** Shared picker fields for all effect classes */
interface MotifPickerFields {
  /** Emoji/icon shown in the swatch picker (fallback when no swatchImage) */
  swatchIcon: string;
  /** Optional swatch image (require() to 88x88 PNG) */
  swatchImage?: number;
  /** Display name */
  label: string;
}

/** Particle-based effect config (Skia path drawing) */
interface ParticleMotifConfig extends MotifPickerFields {
  effectClass?: "particle"; // default when absent
  particleCount: number;
  minSize: number;
  maxSize: number;
  minOpacity: number;
  maxOpacity: number;
  minSpeed: number;
  maxSpeed: number;
  swayAmplitude: number;
  minSwayPeriod: number;
  maxSwayPeriod: number;
  direction: 1 | -1;
  blurSigma: number;
  colors: string[];
  shapes?: ("circle" | "rect" | "heart" | "star" | "leaf" | "snowflake" | "football")[];
  shape?: "circle" | "rect" | "mixed";
  minRotationSpeed?: number;
  maxRotationSpeed?: number;
  rectAspect?: number;
  pulseRange?: [number, number];
  pulsePeriodRange?: [number, number];
  staticPosition?: boolean;
}

/** Sprite overlay effect config (Skia image drawing) */
interface SpriteMotifConfig extends MotifPickerFields {
  effectClass: "sprite_overlay";
  spriteConfig: SpriteOverlayConfig;
}

/** Lottie overlay effect config (pre-authored animation) */
interface LottieMotifConfig extends MotifPickerFields {
  effectClass: "lottie_overlay";
  /** Lottie animation source — use require("./animation.json") */
  lottieSource: AnimationObject;
  /** Playback speed multiplier (default: 1) */
  speed?: number;
  /** Overlay opacity 0-1 (default: 0.6) */
  opacity?: number;
  /** Resize mode (default: "cover") */
  resizeMode?: "cover" | "contain" | "center";
}

type MotifConfig = ParticleMotifConfig | SpriteMotifConfig | LottieMotifConfig;

// ─── Picker categories (used by EffectTray) ─────────────────
export interface MotifCategory {
  label: string;
  ids: readonly string[];
}

export const MOTIF_CATEGORIES: readonly MotifCategory[] = [
  { label: "Featured", ids: ["confetti", "sparkle", "petals", "hearts"] },
  { label: "Celebration", ids: ["balloons", "fireworks", "graduation", "house_party"] },
  { label: "Scenes", ids: ["scene_confetti", "scene_hearts", "scene_fireworks", "scene_balloons"] },
  { label: "Sports", ids: ["football", "basketball", "baseball", "soccer"] },
  { label: "Seasonal", ids: ["snowfall", "leaves", "bubbles", "halloween"] },
  { label: "Romance", ids: ["petals", "hearts", "stars"] },
] as const;

export const MOTIF_PRESETS: Record<string, MotifConfig> = {
  // ── Featured ──
  petals: {
    label: "Petals",
    swatchIcon: "🌸",
    particleCount: 7,
    minSize: 12,
    maxSize: 24,
    minOpacity: 0.25,
    maxOpacity: 0.50,
    minSpeed: 8,
    maxSpeed: 16,
    swayAmplitude: 40,
    minSwayPeriod: 4,
    maxSwayPeriod: 8,
    direction: 1,
    blurSigma: 1.5,
    colors: [
      "rgba(244, 163, 188, 0.9)",
      "rgba(251, 207, 232, 0.9)",
      "rgba(236, 72, 153, 0.5)",
    ],
    shapes: ["leaf", "circle"],
    minRotationSpeed: 0.3,
    maxRotationSpeed: 1.0,
  },
  hearts: {
    label: "Hearts",
    swatchIcon: "💕",
    particleCount: 6,
    minSize: 14,
    maxSize: 26,
    minOpacity: 0.30,
    maxOpacity: 0.55,
    minSpeed: 6,
    maxSpeed: 14,
    swayAmplitude: 20,
    minSwayPeriod: 4,
    maxSwayPeriod: 8,
    direction: -1,
    blurSigma: 1.2,
    colors: [
      "rgba(236, 72, 153, 0.9)",
      "rgba(239, 68, 68, 0.9)",
      "rgba(251, 207, 232, 0.9)",
    ],
    shapes: ["heart"],
    minRotationSpeed: 0.2,
    maxRotationSpeed: 0.6,
    pulseRange: [0.8, 1.1],
    pulsePeriodRange: [3, 6],
  },
  confetti: {
    label: "Confetti",
    swatchIcon: "🎉",
    particleCount: 12,
    minSize: 6,
    maxSize: 14,
    minOpacity: 0.50,
    maxOpacity: 0.80,
    minSpeed: 18,
    maxSpeed: 35,
    swayAmplitude: 30,
    minSwayPeriod: 2,
    maxSwayPeriod: 5,
    direction: 1,
    blurSigma: 0.5,
    colors: [
      "rgba(239, 68, 68, 1)",
      "rgba(59, 130, 246, 1)",
      "rgba(250, 204, 21, 1)",
      "rgba(34, 197, 94, 1)",
      "rgba(236, 72, 153, 1)",
      "rgba(249, 115, 22, 1)",
    ],
    shapes: ["rect", "circle", "star"],
    minRotationSpeed: 1.5,
    maxRotationSpeed: 4.0,
    rectAspect: 0.4,
  },
  sparkle: {
    label: "Sparkle",
    swatchIcon: "✨",
    particleCount: 12,
    minSize: 6,
    maxSize: 14,
    minOpacity: 0.15,
    maxOpacity: 0.80,
    minSpeed: 0,
    maxSpeed: 0,
    swayAmplitude: 0,
    minSwayPeriod: 1,
    maxSwayPeriod: 2,
    direction: 1,
    blurSigma: 0.8,
    colors: [
      "rgba(255, 223, 0, 1)",
      "rgba(255, 255, 255, 1)",
      "rgba(255, 245, 200, 1)",
    ],
    shapes: ["star"],
    staticPosition: true,
    pulseRange: [0.0, 1.0],
    pulsePeriodRange: [0.8, 2.5],
  },
  snowfall: {
    label: "Snow",
    swatchIcon: "❄️",
    particleCount: 12,
    minSize: 8,
    maxSize: 18,
    minOpacity: 0.25,
    maxOpacity: 0.55,
    minSpeed: 8,
    maxSpeed: 18,
    swayAmplitude: 30,
    minSwayPeriod: 3,
    maxSwayPeriod: 7,
    direction: 1,
    blurSigma: 2.0,
    colors: [
      "rgba(255, 255, 255, 1)",
      "rgba(230, 240, 255, 1)",
      "rgba(200, 215, 255, 1)",
    ],
    shapes: ["snowflake", "circle"],
  },
  leaves: {
    label: "Leaves",
    swatchIcon: "🍂",
    particleCount: 6,
    minSize: 12,
    maxSize: 24,
    minOpacity: 0.35,
    maxOpacity: 0.65,
    minSpeed: 8,
    maxSpeed: 18,
    swayAmplitude: 45,
    minSwayPeriod: 3,
    maxSwayPeriod: 7,
    direction: 1,
    blurSigma: 1.0,
    colors: [
      "rgba(217, 119, 6, 0.9)",
      "rgba(194, 65, 12, 0.9)",
      "rgba(185, 28, 28, 0.9)",
      "rgba(234, 179, 8, 0.9)",
    ],
    shapes: ["leaf"],
    minRotationSpeed: 0.5,
    maxRotationSpeed: 2.0,
  },
  bubbles: {
    label: "Bubbles",
    swatchIcon: "🫧",
    particleCount: 6,
    minSize: 12,
    maxSize: 28,
    minOpacity: 0.18,
    maxOpacity: 0.35,
    minSpeed: 5,
    maxSpeed: 12,
    swayAmplitude: 20,
    minSwayPeriod: 4,
    maxSwayPeriod: 9,
    direction: -1,
    blurSigma: 2.5,
    colors: [
      "rgba(255, 255, 255, 1)",
      "rgba(220, 240, 255, 1)",
      "rgba(200, 225, 255, 1)",
    ],
    shape: "circle",
  },
  football: {
    label: "Football",
    swatchIcon: "🏈",
    particleCount: 5,
    minSize: 14,
    maxSize: 24,
    minOpacity: 0.28,
    maxOpacity: 0.50,
    minSpeed: 4,
    maxSpeed: 10,
    swayAmplitude: 25,
    minSwayPeriod: 5,
    maxSwayPeriod: 10,
    direction: 1,
    blurSigma: 1.0,
    colors: [
      "rgba(160, 82, 45, 1)",
      "rgba(184, 115, 51, 1)",
      "rgba(139, 90, 43, 1)",
    ],
    shapes: ["football"],
    minRotationSpeed: 0.3,
    maxRotationSpeed: 1.0,
  },
  stars: {
    label: "Stars",
    swatchIcon: "⭐",
    particleCount: 8,
    minSize: 8,
    maxSize: 18,
    minOpacity: 0.20,
    maxOpacity: 0.50,
    minSpeed: 3,
    maxSpeed: 8,
    swayAmplitude: 15,
    minSwayPeriod: 5,
    maxSwayPeriod: 10,
    direction: -1,
    blurSigma: 1.2,
    colors: [
      "rgba(255, 215, 0, 0.9)",
      "rgba(255, 255, 255, 0.9)",
      "rgba(255, 183, 77, 0.9)",
    ],
    shapes: ["star"],
    minRotationSpeed: 0.1,
    maxRotationSpeed: 0.4,
    pulseRange: [0.6, 1.0],
    pulsePeriodRange: [2, 5],
  },

  // ── Celebration ──
  balloons: {
    label: "Balloons",
    swatchIcon: "🎈",
    swatchImage: require("../../../assets/effects/swatches/balloons.png"),
    effectClass: "sprite_overlay",
    spriteConfig: {
      sprites: [
        require("../../../assets/effects/sprites/balloons/placeholder_red.png"),
        require("../../../assets/effects/sprites/balloons/placeholder_blue.png"),
        require("../../../assets/effects/sprites/balloons/placeholder_yellow.png"),
        null,
        null,
      ],
      particleCount: 8,
      minSize: 28,
      maxSize: 48,
      minOpacity: 0.5,
      maxOpacity: 0.8,
      minSpeed: 6,
      maxSpeed: 14,
      swayAmplitude: 18,
      minSwayPeriod: 4,
      maxSwayPeriod: 8,
      direction: -1,
      minRotationSpeed: 0.05,
      maxRotationSpeed: 0.2,
      pulseRange: [0.9, 1.05],
      pulsePeriodRange: [3, 6],
    },
  },
  fireworks: {
    label: "Fireworks",
    swatchIcon: "🎆",
    particleCount: 14,
    minSize: 3,
    maxSize: 8,
    minOpacity: 0.4,
    maxOpacity: 0.95,
    minSpeed: 30,
    maxSpeed: 60,
    swayAmplitude: 35,
    minSwayPeriod: 1.5,
    maxSwayPeriod: 3,
    direction: -1,
    blurSigma: 1.0,
    colors: [
      "rgba(255, 215, 0, 1)",     // gold
      "rgba(239, 68, 68, 1)",     // red
      "rgba(59, 130, 246, 1)",    // blue
      "rgba(255, 255, 255, 1)",   // white
    ],
    shapes: ["star", "circle"],
    pulseRange: [0.2, 1.0],
    pulsePeriodRange: [1.2, 2.8],
  },
  graduation: {
    label: "Graduation",
    swatchIcon: "🎓",
    swatchImage: require("../../../assets/effects/swatches/graduation.png"),
    effectClass: "sprite_overlay",
    spriteConfig: {
      sprites: [
        require("../../../assets/effects/sprites/graduation/placeholder_cap.png"),
        require("../../../assets/effects/sprites/graduation/placeholder_diploma.png"),
        require("../../../assets/effects/sprites/graduation/placeholder_tassel.png"),
        null,
        null,
      ],
      spriteWeights: [3, 2, 2],
      particleCount: 8,
      minSize: 24,
      maxSize: 42,
      minOpacity: 0.5,
      maxOpacity: 0.85,
      minSpeed: 15,
      maxSpeed: 35,
      swayAmplitude: 28,
      minSwayPeriod: 2,
      maxSwayPeriod: 5,
      direction: 1,
      minRotationSpeed: 0.8,
      maxRotationSpeed: 2.5,
    },
  },
  house_party: {
    label: "House Party",
    swatchIcon: "🏠",
    swatchImage: require("../../../assets/effects/swatches/house_party.png"),
    effectClass: "sprite_overlay",
    spriteConfig: {
      sprites: [
        require("../../../assets/effects/sprites/house_party/placeholder_cup.png"),
        require("../../../assets/effects/sprites/house_party/placeholder_horn.png"),
        null,
        null,
        null,
      ],
      spriteWeights: [3, 2],
      particleCount: 7,
      minSize: 22,
      maxSize: 38,
      minOpacity: 0.45,
      maxOpacity: 0.75,
      minSpeed: 10,
      maxSpeed: 22,
      swayAmplitude: 22,
      minSwayPeriod: 3,
      maxSwayPeriod: 6,
      direction: 1,
      minRotationSpeed: 0.6,
      maxRotationSpeed: 2.0,
    },
  },

  // ── Sports ──
  basketball: {
    label: "Basketball",
    swatchIcon: "🏀",
    particleCount: 5,
    minSize: 14,
    maxSize: 24,
    minOpacity: 0.25,
    maxOpacity: 0.45,
    minSpeed: 5,
    maxSpeed: 12,
    swayAmplitude: 20,
    minSwayPeriod: 4,
    maxSwayPeriod: 9,
    direction: 1,
    blurSigma: 1.2,
    colors: [
      "rgba(234, 88, 12, 1)",     // orange
      "rgba(194, 65, 12, 1)",     // dark orange
      "rgba(251, 146, 60, 0.8)",  // light orange
    ],
    shape: "circle",
    minRotationSpeed: 0.5,
    maxRotationSpeed: 1.5,
  },
  baseball: {
    label: "Baseball",
    swatchIcon: "⚾",
    particleCount: 5,
    minSize: 12,
    maxSize: 22,
    minOpacity: 0.22,
    maxOpacity: 0.42,
    minSpeed: 4,
    maxSpeed: 10,
    swayAmplitude: 18,
    minSwayPeriod: 5,
    maxSwayPeriod: 10,
    direction: 1,
    blurSigma: 1.0,
    colors: [
      "rgba(255, 255, 255, 1)",   // white
      "rgba(220, 220, 220, 1)",   // off-white
      "rgba(185, 28, 28, 0.6)",   // red stitching hint
    ],
    shape: "circle",
    minRotationSpeed: 0.4,
    maxRotationSpeed: 1.2,
  },
  soccer: {
    label: "Soccer",
    swatchIcon: "⚽",
    particleCount: 5,
    minSize: 14,
    maxSize: 22,
    minOpacity: 0.22,
    maxOpacity: 0.42,
    minSpeed: 5,
    maxSpeed: 12,
    swayAmplitude: 22,
    minSwayPeriod: 4,
    maxSwayPeriod: 9,
    direction: 1,
    blurSigma: 1.0,
    colors: [
      "rgba(255, 255, 255, 1)",   // white
      "rgba(30, 30, 30, 0.7)",    // black panels
      "rgba(220, 220, 220, 1)",   // grey
    ],
    shape: "circle",
    minRotationSpeed: 0.6,
    maxRotationSpeed: 1.8,
  },

  // ── Scenes (Lottie-based premium effects) ──
  scene_confetti: {
    label: "Confetti Scene",
    swatchIcon: "🎊",
    effectClass: "lottie_overlay",
    lottieSource: require("../../../assets/effects/lottie/confetti_burst.json") as AnimationObject,
    speed: 0.8,
    opacity: 0.7,
  },
  scene_hearts: {
    label: "Hearts Scene",
    swatchIcon: "💗",
    effectClass: "lottie_overlay",
    lottieSource: require("../../../assets/effects/lottie/rising_hearts.json") as AnimationObject,
    speed: 0.6,
    opacity: 0.55,
  },
  scene_fireworks: {
    label: "Fireworks Scene",
    swatchIcon: "🎇",
    effectClass: "lottie_overlay",
    lottieSource: require("../../../assets/effects/lottie/fireworks_display.json") as AnimationObject,
    speed: 1.0,
    opacity: 0.75,
  },
  scene_balloons: {
    label: "Balloons Scene",
    swatchIcon: "🎈",
    effectClass: "lottie_overlay",
    lottieSource: require("../../../assets/effects/lottie/balloons_rising.json") as AnimationObject,
    speed: 0.7,
    opacity: 0.6,
  },
  // ── Seasonal ──
  halloween: {
    label: "Halloween",
    swatchIcon: "🎃",
    particleCount: 10,
    minSize: 5,
    maxSize: 14,
    minOpacity: 0.30,
    maxOpacity: 0.65,
    minSpeed: 6,
    maxSpeed: 14,
    swayAmplitude: 30,
    minSwayPeriod: 3,
    maxSwayPeriod: 7,
    direction: 1,
    blurSigma: 1.2,
    colors: [
      "rgba(249, 115, 22, 0.9)",  // orange
      "rgba(168, 85, 247, 0.8)",  // purple
      "rgba(34, 197, 94, 0.6)",   // sickly green
      "rgba(255, 255, 255, 0.5)", // ghostly white
    ],
    shapes: ["star", "leaf", "circle"],
    minRotationSpeed: 0.3,
    maxRotationSpeed: 1.2,
  },
};

export type MotifPresetId = keyof typeof MOTIF_PRESETS;

// ─── Clamped config helper ───────────────────────────────────
// Enforces rendering ceilings at config resolution so fields
// never receive oversized or overdense presets.

function clampParticleConfig(config: ParticleMotifConfig): ParticleMotifConfig {
  return {
    ...config,
    particleCount: Math.min(config.particleCount, MAX_MOTIF_COUNT),
    maxSize: Math.min(config.maxSize, MAX_MOTIF_RADIUS),
    minSize: Math.min(config.minSize, MAX_MOTIF_RADIUS),
  };
}

function clampSpriteConfig(config: SpriteMotifConfig): SpriteMotifConfig {
  return {
    ...config,
    spriteConfig: {
      ...config.spriteConfig,
      particleCount: Math.min(config.spriteConfig.particleCount, MAX_MOTIF_COUNT),
    },
  };
}

/** Type guard for sprite_overlay configs */
function isSpriteConfig(config: MotifConfig): config is SpriteMotifConfig {
  return config.effectClass === "sprite_overlay";
}

/** Type guard for lottie_overlay configs */
function isLottieConfig(config: MotifConfig): config is LottieMotifConfig {
  return config.effectClass === "lottie_overlay";
}

// ─── Component ──────────────────────────────────────────────

interface MotifOverlayProps {
  presetId: string | null;
  /** Opacity multiplier — 1.0 for hero, 0.50 for body */
  intensity?: number;
}

export const MotifOverlay = memo(function MotifOverlay({
  presetId,
  intensity = 1.0,
}: MotifOverlayProps) {
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  if (!presetId || reducedMotion) return null;

  const rawConfig = MOTIF_PRESETS[presetId];
  if (!rawConfig) return null;

  // Lottie effects render via native LottieView — no Skia dependency
  if (isLottieConfig(rawConfig)) {
    return (
      <View style={[styles.container, { opacity: intensity }]} pointerEvents="none">
        <LottieView
          source={rawConfig.lottieSource}
          autoPlay
          loop
          speed={rawConfig.speed ?? 1}
          resizeMode={rawConfig.resizeMode ?? "cover"}
          style={[StyleSheet.absoluteFill, { opacity: rawConfig.opacity ?? 0.6 }]}
        />
        <View style={styles.safeZoneTop} />
        <View style={styles.safeZoneBottom} />
      </View>
    );
  }

  // Particle and sprite effects require Skia
  if (!_skiaAvailable) return null;

  const isSprite = isSpriteConfig(rawConfig);

  return (
    <SkiaErrorBoundary>
      <View style={[styles.container, { opacity: intensity }]} pointerEvents="none">
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          {isSprite ? (
            <SpriteField
              config={clampSpriteConfig(rawConfig).spriteConfig}
              width={width}
              height={height}
            />
          ) : (
            <ParticleField
              config={clampParticleConfig(rawConfig)}
              width={width}
              height={height}
            />
          )}
        </Canvas>
        {/* Content-safe zone: darken top/bottom edges so motifs don't
            obscure title text or bottom dock controls. */}
        <View style={styles.safeZoneTop} />
        <View style={styles.safeZoneBottom} />
      </View>
    </SkiaErrorBoundary>
  );
});

const SAFE_ZONE_HEIGHT = 80;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  safeZoneTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SAFE_ZONE_HEIGHT,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  safeZoneBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SAFE_ZONE_HEIGHT,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
});
