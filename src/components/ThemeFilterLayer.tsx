/**
 * ThemeFilterLayer — Atmospheric Skia image filters overlaid on themed pages.
 *
 * Renders AFTER particles/shaders as a subtle post-processing pass.
 * Supported filters: film_grain, vignette, noise, color_shift.
 *
 * Uses the same safe-import pattern as ThemeEffectLayer to gracefully
 * degrade when Skia native binary is unavailable.
 */

import React, { memo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";

// ─── Safe Skia import ──────────────────────────────────────
let Canvas: any = null;
let Rect: any = null;
let Group: any = null;
let Fill: any = null;
let FractalNoise: any = null;
let ColorMatrix: any = null;
let RadialGradient: any = null;
let vec: any = null;
let _skiaAvailable = false;
try {
  const Skia = require("@shopify/react-native-skia");
  Canvas = Skia.Canvas;
  Rect = Skia.Rect;
  Group = Skia.Group;
  Fill = Skia.Fill;
  FractalNoise = Skia.FractalNoise;
  ColorMatrix = Skia.ColorMatrix;
  RadialGradient = Skia.RadialGradient;
  vec = Skia.vec;
  _skiaAvailable = !!(Canvas && Fill);
} catch {
  // Skia native module not available — filters will not render
}

// ─── Filter type ───────────────────────────────────────────
export type FilterPreset = "film_grain" | "vignette" | "noise" | "color_shift";

interface ThemeFilterLayerProps {
  filter: FilterPreset | undefined;
}

// ─── Sepia-tinted color matrix (subtle warm shift for film grain) ──
const SEPIA_MATRIX = [
  0.95, 0.05, 0.0, 0, 0,
  0.0, 0.93, 0.02, 0, 0,
  0.0, 0.0, 0.90, 0, 0,
  0, 0, 0, 0.07, 0,
];

// ─── Warm color shift matrix (+red, -blue) ─────────────────
const WARM_SHIFT_MATRIX = [
  1.1, 0, 0, 0, 0,
  0, 1.0, 0, 0, 0,
  0, 0, 0.95, 0, 0,
  0, 0, 0, 0.12, 0,
];

// ─── Component ─────────────────────────────────────────────
export const ThemeFilterLayer = memo(function ThemeFilterLayer({
  filter,
}: ThemeFilterLayerProps) {
  const { width, height } = useWindowDimensions();

  if (!filter || !_skiaAvailable) return null;

  return (
    <Canvas style={styles.fill} pointerEvents="none">
      {filter === "film_grain" && (
        <Group>
          {/* Fractal noise grain */}
          <Rect x={0} y={0} width={width} height={height}>
            <FractalNoise
              freqX={0.9}
              freqY={0.7}
              octaves={4}
              seed={42}
            />
          </Rect>
          {/* Subtle sepia tint overlay */}
          <Fill>
            <ColorMatrix matrix={SEPIA_MATRIX} />
          </Fill>
        </Group>
      )}

      {filter === "vignette" && (
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(width / 2, height / 2)}
            r={Math.max(width, height) * 0.7}
            colors={["transparent", "rgba(0,0,0,0.3)"]}
          />
        </Rect>
      )}

      {filter === "noise" && (
        <Group opacity={0.04}>
          <Rect x={0} y={0} width={width} height={height}>
            <FractalNoise
              freqX={0.5}
              freqY={0.5}
              octaves={2}
              seed={17}
            />
          </Rect>
        </Group>
      )}

      {filter === "color_shift" && (
        <Fill>
          <ColorMatrix matrix={WARM_SHIFT_MATRIX} />
        </Fill>
      )}
    </Canvas>
  );
});

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default ThemeFilterLayer;
