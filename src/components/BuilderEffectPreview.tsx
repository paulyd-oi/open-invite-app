/**
 * BuilderEffectPreview — Renders particle/shader effects in the theme builder
 * without requiring a themeId.
 *
 * Thin wrapper around exported ThemeEffectLayer sub-components.
 * Accepts effect preset keys directly from the builder store.
 */

import React, { memo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import {
  Canvas,
  _skiaAvailable,
  EFFECT_CONFIGS,
  ParticleField,
  ColorWashField,
  ShaderBackgroundField,
  SkiaErrorBoundary,
} from "@/components/ThemeEffectLayer";

interface BuilderEffectPreviewProps {
  /** Particle effect preset key (e.g. "snowfall", "confetti_rain") */
  particles?: string;
  /** Shader preset key (e.g. "aurora", "shimmer") */
  shader?: string;
}

export const BuilderEffectPreview = memo(function BuilderEffectPreview({
  particles,
  shader,
}: BuilderEffectPreviewProps) {
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  if (!_skiaAvailable || reducedMotion) return null;

  // Cast to `any` to access optional fields (colorWash, shaderPreset, etc.)
  // that exist on some presets but not all in the narrow `as const` union.
  const config: any =
    particles && particles in EFFECT_CONFIGS
      ? EFFECT_CONFIGS[particles as keyof typeof EFFECT_CONFIGS]
      : null;

  const isColorWash = config?.colorWash === true;
  const configShader = config?.shaderPreset as string | undefined;

  // Nothing to render
  if (!config && !shader) return null;

  return (
    <SkiaErrorBoundary>
      <Canvas style={styles.container} pointerEvents="none">
        {/* Standalone shader (from shader picker) */}
        {shader && !configShader && (
          <ShaderBackgroundField
            shaderPreset={shader}
            shaderOpacity={0.15}
            width={width}
            height={height}
          />
        )}

        {/* Effect's built-in shader (from particle config) */}
        {configShader && (
          <ShaderBackgroundField
            shaderPreset={configShader}
            shaderOpacity={config?.shaderOpacity ?? 0.15}
            width={width}
            height={height}
          />
        )}

        {/* Particles or color wash */}
        {config && (
          isColorWash ? (
            <ColorWashField config={config} width={width} height={height} />
          ) : (
            <ParticleField config={config} width={width} height={height} />
          )
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
