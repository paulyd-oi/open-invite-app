import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemeEffectLayer } from "@/components/ThemeEffectLayer";
import { MotifOverlay } from "@/components/create/MotifOverlay";
import { ThemeFilterLayer } from "@/components/ThemeFilterLayer";
import { ThemeVideoLayer } from "@/components/ThemeVideoLayer";
import { AnimatedGradientLayer } from "@/components/AnimatedGradientLayer";
import { THEME_VIDEOS, THEME_BACKGROUNDS } from "@/lib/eventThemes";

interface ThemeBackgroundLayersProps {
  pageTheme: any;
  effectId?: string | null;
  customEffectConfig?: any;
  themeId?: string | null;
  customThemeData?: any;
}

/**
 * [PERF_VIDEO_CONTAINMENT_V1]
 *
 * Scroll on event detail becomes janky when a theme video is active because the
 * render tree stacks four simultaneously expensive layers: animated gradient
 * crossfade (Reanimated), looping H.264 video (expo-video), Skia-based particle
 * simulation (per-frame useFrameCallback), and a Skia filter canvas.
 *
 * Containment rule: when a theme video is active and resolvable, the video
 * carries the atmospheric motion. The animated gradient crossfade and particle
 * simulation are suppressed to leave scroll composition headroom. The static
 * filter layer (single Skia canvas, no per-frame work) is preserved — it
 * doesn't animate and gives the video its post-processed look.
 *
 * Poster fallback (reduced motion / video load failure) is handled inside
 * ThemeVideoLayer, so suppressing the gradient is safe — a still poster fills
 * the same real estate.
 */
export function ThemeBackgroundLayers({
  pageTheme,
  effectId,
  customEffectConfig,
  themeId,
  customThemeData,
}: ThemeBackgroundLayersProps) {
  const hasActiveVideo = Boolean(
    pageTheme.visualStack?.video && THEME_VIDEOS[pageTheme.visualStack.video.source]
  );

  return (
    <>
      {/* Animated gradient background — suppressed when a theme video is active
          (video + its poster fallback already cover the atmosphere layer). */}
      {!hasActiveVideo &&
        pageTheme.visualStack?.gradient &&
        pageTheme.visualStack.gradient.colors.length >= 2 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <AnimatedGradientLayer config={pageTheme.visualStack.gradient} />
        </View>
      )}

      {/* Looping video background */}
      {hasActiveVideo && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
          <ThemeVideoLayer
            source={THEME_VIDEOS[pageTheme.visualStack.video.source]}
            poster={pageTheme.visualStack.video.poster ? THEME_BACKGROUNDS[pageTheme.visualStack.video.poster] : undefined}
            opacity={pageTheme.visualStack.video.opacity}
            isActive={true}
          />
        </View>
      )}

      {/* Particle layer — suppressed when a theme video is active to avoid
          stacking per-frame Skia simulation on top of video decode/composite. */}
      {!hasActiveVideo && (
        effectId ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <MotifOverlay
              presetId={effectId}
              customConfig={customEffectConfig ?? undefined}
              intensity={0.70}
            />
          </View>
        ) : (
          <ThemeEffectLayer themeId={themeId} overrideVisualStack={customThemeData?.visualStack} />
        )
      )}

      {/* Atmospheric filter overlay — static Skia canvas, safe to keep with video. */}
      {pageTheme.visualStack?.filter && (
        <ThemeFilterLayer filter={pageTheme.visualStack.filter} />
      )}
    </>
  );
}
