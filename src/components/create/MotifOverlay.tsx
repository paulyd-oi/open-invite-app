/**
 * MotifOverlay — Page-wide animated motif overlay for the create page.
 *
 * Renders large, sparse, art-directed motifs (petals, hearts, footballs, etc.)
 * using the existing Skia Canvas + Reanimated particle engine.
 *
 * Hero zone (top ~220px): full intensity.
 * Body zone: reduced opacity (~50%) for readability.
 *
 * Each preset has distinct shape language — visually distinguishable at a glance.
 */

import React, { memo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import {
  Canvas,
  _skiaAvailable,
  ParticleField,
  SkiaErrorBoundary,
} from "@/components/ThemeEffectLayer";

// ─── Motif preset configs ────────────────────────────────────
// Art direction: fewer motifs, larger size, slower motion, softer opacity.
// Each preset is visually distinct via shape + color + behavior.

interface MotifConfig {
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
  /** Emoji/icon shown in the swatch picker */
  swatchIcon: string;
  /** Display name */
  label: string;
}

export const MOTIF_PRESETS: Record<string, MotifConfig> = {
  petals: {
    label: "Petals",
    swatchIcon: "🌸",
    particleCount: 7,
    minSize: 14,
    maxSize: 28,
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
    minSize: 18,
    maxSize: 32,
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
    minSize: 8,
    maxSize: 16,
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
  snowfall: {
    label: "Snow",
    swatchIcon: "❄️",
    particleCount: 12,
    minSize: 8,
    maxSize: 20,
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
    minSize: 14,
    maxSize: 28,
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
    minSize: 16,
    maxSize: 36,
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
  sparkle: {
    label: "Sparkle",
    swatchIcon: "✨",
    particleCount: 12,
    minSize: 8,
    maxSize: 16,
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
  football: {
    label: "Football",
    swatchIcon: "🏈",
    particleCount: 5,
    minSize: 18,
    maxSize: 32,
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
    minSize: 10,
    maxSize: 22,
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
};

export type MotifPresetId = keyof typeof MOTIF_PRESETS;

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

  if (!_skiaAvailable || !presetId || reducedMotion) return null;

  const config = MOTIF_PRESETS[presetId];
  if (!config) return null;

  return (
    <SkiaErrorBoundary>
      <Canvas
        style={[styles.container, { opacity: intensity }]}
        pointerEvents="none"
      >
        <ParticleField config={config} width={width} height={height} />
      </Canvas>
    </SkiaErrorBoundary>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});
