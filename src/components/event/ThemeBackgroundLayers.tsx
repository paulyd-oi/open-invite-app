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

export function ThemeBackgroundLayers({
  pageTheme,
  effectId,
  customEffectConfig,
  themeId,
  customThemeData,
}: ThemeBackgroundLayersProps) {
  return (
    <>
      {/* Animated gradient background */}
      {pageTheme.visualStack?.gradient && pageTheme.visualStack.gradient.colors.length >= 2 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <AnimatedGradientLayer config={pageTheme.visualStack.gradient} />
        </View>
      )}

      {/* Looping video background */}
      {pageTheme.visualStack?.video && THEME_VIDEOS[pageTheme.visualStack.video.source] && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
          <ThemeVideoLayer
            source={THEME_VIDEOS[pageTheme.visualStack.video.source]}
            poster={pageTheme.visualStack.video.poster ? THEME_BACKGROUNDS[pageTheme.visualStack.video.poster] : undefined}
            opacity={pageTheme.visualStack.video.opacity}
            isActive={true}
          />
        </View>
      )}

      {/* Particle layer */}
      {effectId ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <MotifOverlay
            presetId={effectId}
            customConfig={customEffectConfig ?? undefined}
            intensity={0.70}
          />
        </View>
      ) : (
        <ThemeEffectLayer themeId={themeId} overrideVisualStack={customThemeData?.visualStack} />
      )}

      {/* Atmospheric filter overlay */}
      {pageTheme.visualStack?.filter && (
        <ThemeFilterLayer filter={pageTheme.visualStack.filter} />
      )}
    </>
  );
}
