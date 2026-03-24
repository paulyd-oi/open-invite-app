/**
 * ThemeEffectLayer — Ambient particle effects for themed event pages.
 *
 * V2 engine powered by @shopify/react-native-skia Canvas.
 * GPU-accelerated particle rendering with soft-edged circles.
 * Full-page coverage — particles drift across the entire screen.
 *
 * Active effects:
 *   worship_night → warm candlelight dust drifting upward
 *   winter_glow   → soft snowfall drifting downward
 *   chill_hang    → coastal haze (slow aqua mist rising)
 *   game_night    → arcade sparkle (violet/white sparks rising with pulse)
 *   fall_harvest  → falling leaves (warm amber/red circles drifting down)
 *
 * Effect preset mapping lives in eventThemes.ts (effectPreset field).
 * Absolutely positioned at the SafeAreaView level for full-page coverage.
 * Returns null for themes with no effect or when reduced motion is enabled.
 *
 * Proof tag: [THEME_EFFECT_ENGINE_V2]
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import {
  useDerivedValue,
  useSharedValue,
  useFrameCallback,
  useReducedMotion,
} from "react-native-reanimated";
import { resolveEventTheme } from "@/lib/eventThemes";

// ─── Safe Skia import (fail-safe if native binary unavailable) ──
let Canvas: any = null;
let Circle: any = null;
let Group: any = null;
let BlurMask: any = null;
let RRect: any = null;
let Rect: any = null;
let Path: any = null;
let Shader: any = null;
let SkiaNamespace: any = null;
let _skiaAvailable = false;
try {
  const Skia = require("@shopify/react-native-skia");
  Canvas = Skia.Canvas;
  Circle = Skia.Circle;
  Group = Skia.Group;
  BlurMask = Skia.BlurMask;
  RRect = Skia.RRect;
  Rect = Skia.Rect;
  Path = Skia.Path;
  Shader = Skia.Shader;
  SkiaNamespace = Skia.Skia;
  _skiaAvailable = !!(Canvas && Circle && Group && BlurMask);
} catch {
  // Skia native module not available — particles will not render
}

// ─── SkSL shader sources (compiled once at module load) ──────

const AURORA_SKSL = `
uniform float iTime;
uniform float2 iResolution;
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  float wave1 = sin(uv.x * 3.0 + iTime * 0.3) * 0.5 + 0.5;
  float wave2 = sin(uv.y * 2.0 + iTime * 0.2 + 1.0) * 0.5 + 0.5;
  float blend = wave1 * wave2;
  float3 c1 = float3(0.1, 0.6, 0.4);
  float3 c2 = float3(0.3, 0.2, 0.7);
  float3 col = mix(c1, c2, blend);
  return half4(col, 1.0);
}
`;

const SHIMMER_SKSL = `
uniform float iTime;
uniform float2 iResolution;
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  float band = sin(uv.x * 6.28 - iTime * 1.5) * 0.5 + 0.5;
  band = pow(band, 8.0);
  float3 col = float3(1.0, 0.95, 0.8) * band;
  return half4(col, 1.0);
}
`;

const PLASMA_SKSL = `
uniform float iTime;
uniform float2 iResolution;
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  float v = sin(uv.x * 4.0 + iTime * 0.4);
  v += sin(uv.y * 4.0 + iTime * 0.3);
  v += sin((uv.x + uv.y) * 3.0 + iTime * 0.5);
  v = v / 3.0 * 0.5 + 0.5;
  float3 col = mix(float3(0.8, 0.2, 0.5), float3(0.2, 0.5, 0.9), v);
  return half4(col, 1.0);
}
`;

const BOKEH_SKSL = `
uniform float iTime;
uniform float2 iResolution;
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  float acc = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float2 center = float2(
      0.5 + 0.3 * sin(iTime * 0.2 + fi * 1.3),
      0.5 + 0.3 * cos(iTime * 0.15 + fi * 1.7)
    );
    float d = distance(uv, center);
    acc += 0.02 / (d * d + 0.01);
  }
  acc = clamp(acc * 0.05, 0.0, 1.0);
  float3 col = float3(1.0, 0.85, 0.6) * acc;
  return half4(col, 1.0);
}
`;

// ─── Lazy shader compilation (deferred to first access) ─────
// Module-load compilation can fail silently if native Skia hasn't initialized
// the RuntimeEffect factory yet. Lazy-init ensures we compile after the native
// module is fully ready, and caches the result for all subsequent renders.

const SHADER_SOURCES: Record<string, string> = {
  aurora: AURORA_SKSL,
  shimmer: SHIMMER_SKSL,
  plasma: PLASMA_SKSL,
  bokeh: BOKEH_SKSL,
};

const _shaderCache: Record<string, any> = {};

function getShaderEffect(presetId: string): any {
  if (presetId in _shaderCache) return _shaderCache[presetId];

  const sksl = SHADER_SOURCES[presetId];
  if (!sksl || !SkiaNamespace?.RuntimeEffect?.Make) {
    _shaderCache[presetId] = null;
    return null;
  }

  try {
    const effect = SkiaNamespace.RuntimeEffect.Make(sksl);
    _shaderCache[presetId] = effect;
    return effect;
  } catch {
    _shaderCache[presetId] = null;
    return null;
  }
}

// ─── Shape types ─────────────────────────────────────────────

type ShapeType = "circle" | "rect" | "heart" | "star" | "leaf" | "snowflake";

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
  /** Optional per-particle opacity pulse (null = static opacity) */
  pulseRange?: [number, number];
  /** Pulse cycle period range in seconds */
  pulsePeriodRange?: [number, number];
  /** Particle shape: circle (default), rect, or mixed */
  shape?: "circle" | "rect" | "mixed";
  /** Array of shapes — each particle picks randomly. Overrides shape/mixed. */
  shapes?: ShapeType[];
  /** Rotation speed range in radians/sec (0 = no rotation) */
  minRotationSpeed?: number;
  maxRotationSpeed?: number;
  /** Aspect ratio for rect particles (width/height, default 1) */
  rectAspect?: number;
  /** If true, particles don't move vertically — static with fade only */
  staticPosition?: boolean;
  /** If true, render as full-screen color wash instead of particles */
  colorWash?: boolean;
  /** Color wash: hue cycle speed in degrees/sec */
  hueCycleSpeed?: number;
  /** Color wash: base opacity */
  washOpacity?: number;
  /** SkSL shader background layer — renders BEHIND particles at low opacity */
  shaderPreset?: "aurora" | "shimmer" | "plasma" | "bokeh";
  /** Shader background opacity override (default 0.15) */
  shaderOpacity?: number;
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
    shapes: ["snowflake", "circle"],
  },
  coastal_haze: {
    particleCount: 18,
    minSize: 12,
    maxSize: 22,
    minOpacity: 0.09,
    maxOpacity: 0.17,
    minSpeed: 4,
    maxSpeed: 7,
    swayAmplitude: 26,
    minSwayPeriod: 6,
    maxSwayPeriod: 12,
    direction: -1,
    blurSigma: 11,
    colors: [
      "rgba(20, 184, 166, 1)",    // teal / chill_hang accent
      "rgba(110, 220, 200, 1)",   // seafoam
      "rgba(160, 240, 225, 1)",   // light aqua
      "rgba(220, 255, 245, 1)",   // soft white-mint
    ],
    shaderPreset: "aurora",
  },
  arcade_sparkle: {
    particleCount: 28,
    minSize: 3,
    maxSize: 6,
    minOpacity: 0.18,
    maxOpacity: 0.30,
    minSpeed: 8,
    maxSpeed: 13,
    swayAmplitude: 15,
    minSwayPeriod: 3,
    maxSwayPeriod: 6,
    direction: -1,
    blurSigma: 1.8,
    colors: [
      "rgba(139, 92, 246, 1)",    // game_night violet
      "rgba(167, 139, 250, 1)",   // lavender
      "rgba(196, 181, 253, 1)",   // pale violet
      "rgba(240, 240, 255, 1)",   // soft white
    ],
    pulseRange: [0.70, 1.15],
    pulsePeriodRange: [2.2, 4.5],
  },
  confetti_rain: {
    particleCount: 30,
    minSize: 3,
    maxSize: 7,
    minOpacity: 0.7,
    maxOpacity: 0.95,
    minSpeed: 50,
    maxSpeed: 90,
    swayAmplitude: 25,
    minSwayPeriod: 2,
    maxSwayPeriod: 4,
    direction: 1,
    blurSigma: 0.5,
    colors: [
      "rgba(239, 68, 68, 1)",     // red
      "rgba(59, 130, 246, 1)",    // blue
      "rgba(250, 204, 21, 1)",    // yellow
      "rgba(34, 197, 94, 1)",     // green
      "rgba(236, 72, 153, 1)",    // pink
      "rgba(249, 115, 22, 1)",    // orange
    ],
    shape: "mixed",
    minRotationSpeed: 1.5,
    maxRotationSpeed: 4.0,
    rectAspect: 0.5,
  },
  falling_leaves: {
    particleCount: 18,
    minSize: 5,
    maxSize: 12,
    minOpacity: 0.5,
    maxOpacity: 0.85,
    minSpeed: 20,
    maxSpeed: 40,
    swayAmplitude: 45,
    minSwayPeriod: 3,
    maxSwayPeriod: 7,
    direction: 1,
    blurSigma: 1.0,
    colors: [
      "rgba(217, 119, 6, 1)",
      "rgba(194, 65, 12, 1)",
      "rgba(185, 28, 28, 1)",
      "rgba(234, 179, 8, 1)",
    ],
    shapes: ["leaf"],
    minRotationSpeed: 0.8,
    maxRotationSpeed: 2.5,
  },
  firework_burst: {
    particleCount: 25,
    minSize: 2,
    maxSize: 5,
    minOpacity: 0.4,
    maxOpacity: 0.9,
    minSpeed: 60,
    maxSpeed: 120,
    swayAmplitude: 40,
    minSwayPeriod: 1.5,
    maxSwayPeriod: 3,
    direction: -1,
    blurSigma: 1.2,
    colors: [
      "rgba(255, 215, 0, 1)",   // gold
      "rgba(239, 68, 68, 1)",   // red
      "rgba(59, 130, 246, 1)",  // blue
      "rgba(255, 255, 255, 1)", // white
    ],
    shape: "circle",
    minRotationSpeed: 0,
    maxRotationSpeed: 0,
    pulseRange: [0.3, 1.0],
    pulsePeriodRange: [1.5, 3.0],
  },
  glitter_shimmer: {
    particleCount: 25,
    minSize: 1.5,
    maxSize: 3.5,
    minOpacity: 0.0,
    maxOpacity: 0.8,
    minSpeed: 0,
    maxSpeed: 0,
    swayAmplitude: 0,
    minSwayPeriod: 1,
    maxSwayPeriod: 2,
    direction: 1,
    blurSigma: 0.8,
    colors: [
      "rgba(255, 215, 0, 1)",   // gold
      "rgba(192, 192, 192, 1)", // silver
      "rgba(255, 255, 255, 1)", // white
    ],
    shape: "circle",
    minRotationSpeed: 0,
    maxRotationSpeed: 0,
    staticPosition: true,
    pulseRange: [0.0, 1.0],
    pulsePeriodRange: [0.8, 2.0],
  },
  disco_pulse: {
    particleCount: 0,
    minSize: 0,
    maxSize: 0,
    minOpacity: 0.10,
    maxOpacity: 0.15,
    minSpeed: 0,
    maxSpeed: 0,
    swayAmplitude: 0,
    minSwayPeriod: 1,
    maxSwayPeriod: 1,
    direction: 1,
    blurSigma: 0,
    colors: [
      "rgba(139, 92, 246, 1)",  // purple
      "rgba(236, 72, 153, 1)",  // pink
      "rgba(59, 130, 246, 1)",  // blue
      "rgba(16, 185, 129, 1)",  // teal
    ],
    colorWash: true,
    hueCycleSpeed: 20,
    washOpacity: 0.16,
    shaderPreset: "plasma",
  },
  cherry_blossom: {
    particleCount: 16,
    minSize: 4,
    maxSize: 9,
    minOpacity: 0.35,
    maxOpacity: 0.65,
    minSpeed: 12,
    maxSpeed: 25,
    swayAmplitude: 35,
    minSwayPeriod: 4,
    maxSwayPeriod: 8,
    direction: 1,
    blurSigma: 1.8,
    colors: [
      "rgba(244, 163, 188, 1)", // light pink
      "rgba(251, 207, 232, 1)", // soft white-pink
      "rgba(236, 72, 153, 0.6)", // translucent pink
    ],
    shapes: ["leaf", "circle"],
    minRotationSpeed: 0.5,
    maxRotationSpeed: 1.5,
  },
  rose_petals: {
    particleCount: 11,
    minSize: 5,
    maxSize: 10,
    minOpacity: 0.3,
    maxOpacity: 0.6,
    minSpeed: 8,
    maxSpeed: 16,
    swayAmplitude: 22,
    minSwayPeriod: 4,
    maxSwayPeriod: 9,
    direction: 1,
    blurSigma: 2.5,
    colors: [
      "rgba(190, 18, 60, 1)",   // deep rose
      "rgba(220, 38, 38, 1)",   // crimson
      "rgba(136, 19, 55, 1)",   // burgundy
    ],
    shape: "circle",
    minRotationSpeed: 0.3,
    maxRotationSpeed: 1.0,
  },
  floating_hearts: {
    particleCount: 12,
    minSize: 4,
    maxSize: 8,
    minOpacity: 0.25,
    maxOpacity: 0.55,
    minSpeed: 12,
    maxSpeed: 22,
    swayAmplitude: 18,
    minSwayPeriod: 3,
    maxSwayPeriod: 6,
    direction: -1,
    blurSigma: 1.8,
    colors: [
      "rgba(236, 72, 153, 1)",  // pink
      "rgba(239, 68, 68, 1)",   // red
      "rgba(251, 207, 232, 1)", // soft rose
    ],
    shapes: ["heart"],
    minRotationSpeed: 0.3,
    maxRotationSpeed: 1.0,
    pulseRange: [0.8, 1.1],
    pulsePeriodRange: [2.5, 4.5],
  },
  rising_bubbles: {
    particleCount: 20,
    minSize: 4,
    maxSize: 14,
    minOpacity: 0.12,
    maxOpacity: 0.30,
    minSpeed: 10,
    maxSpeed: 25,
    swayAmplitude: 18,
    minSwayPeriod: 3,
    maxSwayPeriod: 7,
    direction: -1,
    blurSigma: 2.5,
    colors: [
      "rgba(255, 255, 255, 1)", // white
      "rgba(186, 230, 253, 1)", // light blue
      "rgba(147, 197, 253, 1)", // blue tint
    ],
    shape: "circle",
    minRotationSpeed: 0,
    maxRotationSpeed: 0,
  },
  light_rays: {
    particleCount: 8,
    minSize: 30,
    maxSize: 60,
    minOpacity: 0.06,
    maxOpacity: 0.15,
    minSpeed: 2,
    maxSpeed: 5,
    swayAmplitude: 40,
    minSwayPeriod: 8,
    maxSwayPeriod: 16,
    direction: -1,
    blurSigma: 25,
    colors: [
      "rgba(255, 215, 0, 1)",   // warm gold
      "rgba(255, 191, 0, 1)",   // amber
      "rgba(255, 235, 180, 1)", // soft warm white
    ],
    shape: "circle",
    minRotationSpeed: 0,
    maxRotationSpeed: 0,
    pulseRange: [0.7, 1.2],
    pulsePeriodRange: [4, 8],
    shaderPreset: "shimmer",
  },
  dandelion_seeds: {
    particleCount: 14,
    minSize: 2,
    maxSize: 5,
    minOpacity: 0.25,
    maxOpacity: 0.45,
    minSpeed: 6,
    maxSpeed: 14,
    swayAmplitude: 30,
    minSwayPeriod: 4,
    maxSwayPeriod: 9,
    direction: -1,
    blurSigma: 1.5,
    colors: [
      "rgba(255, 255, 255, 1)",   // white
      "rgba(255, 253, 240, 1)",   // soft cream
      "rgba(245, 245, 230, 1)",   // pale cream
    ],
    shape: "circle",
    minRotationSpeed: 0.2,
    maxRotationSpeed: 0.8,
  },
  butterfly_flutter: {
    particleCount: 12,
    minSize: 4,
    maxSize: 8,
    minOpacity: 0.4,
    maxOpacity: 0.7,
    minSpeed: 8,
    maxSpeed: 18,
    swayAmplitude: 50,
    minSwayPeriod: 2,
    maxSwayPeriod: 5,
    direction: -1,
    blurSigma: 1.2,
    colors: [
      "rgba(192, 132, 252, 1)",  // pastel purple
      "rgba(251, 146, 60, 1)",   // soft orange
      "rgba(147, 197, 253, 1)",  // light blue
    ],
    shape: "mixed",
    minRotationSpeed: 0.5,
    maxRotationSpeed: 2.0,
    rectAspect: 0.6,
    pulseRange: [0.7, 1.1],
    pulsePeriodRange: [1.5, 3.0],
  },
  easter_confetti: {
    particleCount: 20,
    minSize: 3,
    maxSize: 6,
    minOpacity: 0.5,
    maxOpacity: 0.8,
    minSpeed: 25,
    maxSpeed: 50,
    swayAmplitude: 20,
    minSwayPeriod: 3,
    maxSwayPeriod: 5,
    direction: 1,
    blurSigma: 0.5,
    colors: [
      "rgba(244, 163, 188, 1)",  // pastel pink
      "rgba(196, 181, 253, 1)",  // pastel lavender
      "rgba(167, 243, 208, 1)",  // pastel mint
      "rgba(253, 230, 138, 1)",  // pastel yellow
    ],
    shapes: ["star", "rect", "circle"],
    minRotationSpeed: 1.0,
    maxRotationSpeed: 3.0,
    rectAspect: 0.5,
  },
  graduation_toss: {
    particleCount: 24,
    minSize: 3,
    maxSize: 7,
    minOpacity: 0.6,
    maxOpacity: 0.9,
    minSpeed: 35,
    maxSpeed: 70,
    swayAmplitude: 30,
    minSwayPeriod: 2,
    maxSwayPeriod: 4,
    direction: 1,
    blurSigma: 0.5,
    colors: [
      "rgba(255, 215, 0, 1)",   // gold
      "rgba(255, 215, 0, 1)",   // gold (weighted)
      "rgba(30, 58, 138, 1)",   // navy
      "rgba(255, 255, 255, 1)", // white
    ],
    shapes: ["star", "rect", "circle"],
    minRotationSpeed: 1.5,
    maxRotationSpeed: 4.0,
    rectAspect: 0.8,
  },
  fireflies: {
    particleCount: 15,
    minSize: 2,
    maxSize: 5,
    minOpacity: 0.0,
    maxOpacity: 0.55,
    minSpeed: 2,
    maxSpeed: 6,
    swayAmplitude: 20,
    minSwayPeriod: 4,
    maxSwayPeriod: 10,
    direction: -1,
    blurSigma: 2.5,
    colors: [
      "rgba(251, 191, 36, 1)",   // warm amber
      "rgba(255, 215, 0, 1)",    // gold
      "rgba(253, 224, 71, 1)",   // light gold
    ],
    shape: "circle",
    minRotationSpeed: 0,
    maxRotationSpeed: 0,
    pulseRange: [0.0, 1.0],
    pulsePeriodRange: [2.0, 5.0],
    shaderPreset: "bokeh",
  },
  tropical_drift: {
    particleCount: 18,
    minSize: 4,
    maxSize: 16,
    minOpacity: 0.15,
    maxOpacity: 0.5,
    minSpeed: 8,
    maxSpeed: 18,
    swayAmplitude: 25,
    minSwayPeriod: 4,
    maxSwayPeriod: 8,
    direction: 1,
    blurSigma: 3.0,
    colors: [
      "rgba(251, 113, 133, 1)",  // coral
      "rgba(20, 184, 166, 1)",   // teal
      "rgba(250, 204, 21, 1)",   // golden yellow
      "rgba(255, 255, 255, 1)",  // white
    ],
    shape: "circle",
    minRotationSpeed: 0.2,
    maxRotationSpeed: 0.8,
  },
  patriot_stars: {
    particleCount: 22,
    minSize: 2,
    maxSize: 5,
    minOpacity: 0.4,
    maxOpacity: 0.9,
    minSpeed: 55,
    maxSpeed: 110,
    swayAmplitude: 35,
    minSwayPeriod: 1.5,
    maxSwayPeriod: 3,
    direction: -1,
    blurSigma: 1.0,
    colors: [
      "rgba(178, 34, 52, 1)",    // #B22234 red
      "rgba(255, 255, 255, 1)",  // white
      "rgba(60, 59, 110, 1)",    // #3C3B6E blue
    ],
    shapes: ["star"],
    minRotationSpeed: 0,
    maxRotationSpeed: 0,
    pulseRange: [0.3, 1.0],
    pulsePeriodRange: [1.5, 3.0],
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
  /** Pulse: multiplier amplitude (0 = no pulse) */
  pulseAmp: number;
  /** Pulse: cycle period in seconds */
  pulsePeriod: number;
  /** Pulse: phase offset in radians */
  pulsePhase: number;
  /** Current rotation angle in radians */
  rotation: number;
  /** Rotation speed in radians/sec */
  rotationSpeed: number;
  /** Particle shape */
  shape: ShapeType;
  /** Cached SVG path string for path-based shapes (heart, star, leaf, snowflake) */
  pathData?: string;
  /** Width for rect particles */
  width: number;
  /** Height for rect particles */
  height: number;
}

// ─── SVG path generators (centered at 0,0, scaled to radius) ─

function pathForShape(shape: ShapeType, r: number): string | undefined {
  switch (shape) {
    case "heart":
      return `M 0 ${-r * 0.35} C ${-r} ${-r * 1.1} ${-r} ${r * 0.3} 0 ${r} C ${r} ${r * 0.3} ${r} ${-r * 1.1} 0 ${-r * 0.35} Z`;

    case "star": {
      // 5-pointed star: 10 vertices alternating outer (r) and inner (r*0.4)
      const outerR = r;
      const innerR = r * 0.4;
      const parts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const rad = i % 2 === 0 ? outerR : innerR;
        const x = Math.round(rad * Math.cos(angle) * 100) / 100;
        const y = Math.round(rad * Math.sin(angle) * 100) / 100;
        parts.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
      }
      return parts.join(" ") + " Z";
    }

    case "leaf":
      return `M 0 ${-r} C ${r * 0.55} ${-r * 0.4} ${r * 0.55} ${r * 0.4} 0 ${r} C ${-r * 0.55} ${r * 0.4} ${-r * 0.55} ${-r * 0.4} 0 ${-r} Z`;

    case "snowflake": {
      // Filled 6-pointed star: 12 vertices alternating outer (r) and inner (r*0.45)
      const outerR = r;
      const innerR = r * 0.45;
      const parts: string[] = [];
      for (let i = 0; i < 12; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 6;
        const rad = i % 2 === 0 ? outerR : innerR;
        const x = Math.round(rad * Math.cos(angle) * 100) / 100;
        const y = Math.round(rad * Math.sin(angle) * 100) / 100;
        parts.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
      }
      return parts.join(" ") + " Z";
    }

    default:
      return undefined;
  }
}

function seedParticles(config: EffectConfig, width: number, height: number): ParticleSeed[] {
  const particles: ParticleSeed[] = [];
  const hasPulse = !!(config.pulseRange && config.pulsePeriodRange);
  for (let i = 0; i < config.particleCount; i++) {
    const r = Math.random;
    const baseOpacity = config.minOpacity + r() * (config.maxOpacity - config.minOpacity);
    // Pulse amplitude: half the range between pulseRange[0] and pulseRange[1] scaled by baseOpacity
    let pulseAmp = 0;
    let pulsePeriod = 1;
    if (hasPulse) {
      const [pMin, pMax] = config.pulseRange!;
      pulseAmp = baseOpacity * (pMax - pMin) / 2;
      const [tMin, tMax] = config.pulsePeriodRange!;
      pulsePeriod = tMin + r() * (tMax - tMin);
    }

    // Shape and rotation seeding
    const shapeType: ShapeType = config.shapes
      ? config.shapes[Math.floor(r() * config.shapes.length)]
      : config.shape === "mixed"
        ? (r() > 0.5 ? "circle" : "rect")
        : (config.shape ?? "circle") as ShapeType;
    const radius = config.minSize + r() * (config.maxSize - config.minSize);
    const aspect = config.rectAspect ?? 1;
    const rotSpeed = (config.minRotationSpeed ?? 0) + r() * ((config.maxRotationSpeed ?? 0) - (config.minRotationSpeed ?? 0));
    // Cache path data at seed time — never generate per frame
    const pathData = (shapeType !== "circle" && shapeType !== "rect")
      ? pathForShape(shapeType, radius)
      : undefined;

    particles.push({
      x: r() * width,
      y: r() * height,
      radius,
      opacity: baseOpacity,
      speed: config.minSpeed + r() * (config.maxSpeed - config.minSpeed),
      swayAmplitude: (0.4 + r() * 0.6) * config.swayAmplitude,
      swayPeriod: config.minSwayPeriod + r() * (config.maxSwayPeriod - config.minSwayPeriod),
      swayOffset: r() * Math.PI * 2,
      color: config.colors[Math.floor(r() * config.colors.length)],
      pulseAmp,
      pulsePeriod,
      pulsePhase: r() * Math.PI * 2,
      rotation: r() * Math.PI * 2,
      rotationSpeed: (r() > 0.5 ? 1 : -1) * rotSpeed,
      shape: shapeType,
      pathData,
      width: shapeType === "rect" ? radius * 2 * aspect : radius * 2,
      height: radius * 2,
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

  const opacity = useDerivedValue(() => {
    const p = particles.value[index];
    if (!p || p.pulseAmp === 0) return seed.opacity;
    const pulse = Math.sin(
      elapsed.value * (Math.PI * 2 / p.pulsePeriod) + p.pulsePhase
    );
    return Math.max(0, p.opacity + pulse * p.pulseAmp);
  });

  const rotation = useDerivedValue(() => {
    return particles.value[index]?.rotation ?? 0;
  });

  // CRITICAL: Full transform must be a derived value for Skia to animate per-frame.
  // Dereferencing .value in JSX evaluates once at render, not per-frame.
  const rectTransform = useDerivedValue(() => [
    { translateX: cx.value },
    { translateY: cy.value },
    { rotate: rotation.value },
    { translateX: -seed.width / 2 },
    { translateY: -seed.height / 2 },
  ]);

  const circleTransform = useDerivedValue(() => [
    { translateX: cx.value },
    { translateY: cy.value },
    { rotate: rotation.value },
  ]);

  if (seed.shape === "rect" && RRect) {
    return (
      <Group transform={rectTransform} opacity={opacity}>
        <RRect
          x={0}
          y={0}
          width={seed.width}
          height={seed.height}
          r={seed.width * 0.15}
          color={seed.color}
        >
          <BlurMask blur={blurSigma} />
        </RRect>
      </Group>
    );
  }

  // Path-based shapes: heart, star, leaf, snowflake
  if (seed.pathData && Path) {
    return (
      <Group transform={circleTransform} opacity={opacity}>
        <Path path={seed.pathData} color={seed.color}>
          <BlurMask blur={blurSigma} style="normal" />
        </Path>
      </Group>
    );
  }

  return (
    <Group transform={circleTransform} opacity={opacity}>
      <Circle cx={0} cy={0} r={seed.radius} color={seed.color}>
        <BlurMask blur={blurSigma} />
      </Circle>
    </Group>
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
      let newY = p.y;

      if (!config.staticPosition) {
        newY = p.y + p.speed * config.direction * dt;

        // Respawn at opposite edge when leaving bounds
        if (config.direction === 1 && newY > height + p.radius * 2) {
          newY = -p.radius * 2;
        } else if (config.direction === -1 && newY < -p.radius * 2) {
          newY = height + p.radius * 2;
        }
      }

      return { ...p, y: newY, rotation: p.rotation + p.rotationSpeed * dt };
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

// ─── Color wash field (for disco_pulse-style effects) ────────

/** Parse "rgba(r,g,b,a)" to [r,g,b] — called once at mount, not in worklet */
function parseRgba(rgba: string): [number, number, number] {
  const m = rgba.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
}

const ColorWashField = memo(function ColorWashField({
  config,
  width,
  height,
}: {
  config: EffectConfig;
  width: number;
  height: number;
}) {
  const elapsed = useSharedValue(0);
  // Pre-parse colors to RGB arrays for worklet interpolation
  const parsedColors = useMemo(
    () => config.colors.map(parseRgba),
    [config.colors]
  );
  const cycleDuration = 360 / (config.hueCycleSpeed ?? 20); // seconds per full cycle

  useFrameCallback((frameInfo) => {
    "worklet";
    const dt = (frameInfo.timeSincePreviousFrame ?? 16) / 1000;
    elapsed.value += dt;
  });

  // Smoothly interpolate between adjacent colors
  const currentColor = useDerivedValue(() => {
    const n = parsedColors.length;
    if (n === 0) return "rgba(128,128,128,1)";
    const pos = ((elapsed.value % cycleDuration) / cycleDuration) * n;
    const idx = Math.floor(pos) % n;
    const nextIdx = (idx + 1) % n;
    const t = pos - Math.floor(pos); // 0..1 blend factor
    const [r1, g1, b1] = parsedColors[idx];
    const [r2, g2, b2] = parsedColors[nextIdx];
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgba(${r},${g},${b},1)`;
  });

  const washOpacity = config.washOpacity ?? 0.12;

  if (!Rect) return null;

  return (
    <Group opacity={washOpacity}>
      <Rect x={0} y={0} width={width} height={height} color={currentColor}>
        <BlurMask blur={40} />
      </Rect>
    </Group>
  );
});

// ─── Shader background layer (SkSL RuntimeEffect) ───────────

const ShaderBackgroundField = memo(function ShaderBackgroundField({
  shaderPreset,
  shaderOpacity,
  width,
  height,
}: {
  shaderPreset: string;
  shaderOpacity: number;
  width: number;
  height: number;
}) {
  // Lazy-compile on first render (cached after first call)
  const effect = getShaderEffect(shaderPreset);

  // Hooks MUST be called unconditionally (Rules of Hooks) — lightweight no-ops when effect is null
  const elapsed = useSharedValue(0);

  useFrameCallback((frameInfo) => {
    "worklet";
    elapsed.value += (frameInfo.timeSincePreviousFrame ?? 16) / 1000;
  });

  const uniforms = useDerivedValue(() => ({
    iTime: elapsed.value,
    iResolution: [width, height],
  }));

  if (!effect || !Shader || !Rect) return null;

  return (
    <Group opacity={shaderOpacity}>
      <Rect x={0} y={0} width={width} height={height}>
        <Shader source={effect} uniforms={uniforms} />
      </Rect>
    </Group>
  );
});

// ─── Skia error boundary (fail-safe, not fail-hard) ─────────

class SkiaErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// ─── Main component ─────────────────────────────────────────

interface ThemeEffectLayerProps {
  themeId: string | null | undefined;
}

export const ThemeEffectLayer = memo(function ThemeEffectLayer({
  themeId,
}: ThemeEffectLayerProps) {
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const theme = resolveEventTheme(themeId);
  const presetId = theme.effectPreset as EffectPresetId | undefined;
  const config = presetId && presetId in EFFECT_CONFIGS
    ? EFFECT_CONFIGS[presetId]
    : null;


  if (!_skiaAvailable || !config || reducedMotion) return null;

  const isColorWash = (config as EffectConfig).colorWash === true;
  const shaderPreset = (config as EffectConfig).shaderPreset;
  const shaderOpacity = (config as EffectConfig).shaderOpacity ?? 0.15;

  return (
    <SkiaErrorBoundary>
      <Canvas style={styles.container} pointerEvents="none">
        {shaderPreset && (
          <ShaderBackgroundField
            shaderPreset={shaderPreset}
            shaderOpacity={shaderOpacity}
            width={width}
            height={height}
          />
        )}
        {isColorWash ? (
          <ColorWashField config={config} width={width} height={height} />
        ) : (
          <ParticleField config={config} width={width} height={height} />
        )}
      </Canvas>
    </SkiaErrorBoundary>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});
