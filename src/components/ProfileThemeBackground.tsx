/**
 * ProfileThemeBackground — Full-page theme backdrop for profile screens.
 *
 * Replicates the event-detail layer stack (gradient → video → effects → filter)
 * but scoped to profile themes only. No particles/effects layer — profiles
 * use calm, ambient themes without bursty animations.
 *
 * Renders as absolute-fill behind all profile content.
 */

import React, { memo } from "react";
import { View, StyleSheet } from "react-native";
import {
  resolveEventTheme,
  THEME_VIDEOS,
  THEME_BACKGROUNDS,
  type ThemeId,
} from "@/lib/eventThemes";
import { AnimatedGradientLayer } from "@/components/AnimatedGradientLayer";
import { ThemeVideoLayer } from "@/components/ThemeVideoLayer";
import { ThemeFilterLayer } from "@/components/ThemeFilterLayer";

interface ProfileThemeBackgroundProps {
  themeId: ThemeId;
  isActive?: boolean;
}

export const ProfileThemeBackground = memo(function ProfileThemeBackground({
  themeId,
  isActive = true,
}: ProfileThemeBackgroundProps) {
  const theme = resolveEventTheme(themeId);
  const vs = theme.visualStack;

  if (!vs) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Layer 1: Animated gradient */}
      {vs.gradient && vs.gradient.colors.length >= 2 && (
        <AnimatedGradientLayer config={vs.gradient} />
      )}

      {/* Layer 2: Looping video */}
      {vs.video && THEME_VIDEOS[vs.video.source] && (
        <ThemeVideoLayer
          source={THEME_VIDEOS[vs.video.source]}
          poster={
            vs.video.poster
              ? THEME_BACKGROUNDS[vs.video.poster]
              : undefined
          }
          opacity={vs.video.opacity}
          isActive={isActive}
        />
      )}

      {/* Layer 3: Atmospheric filter */}
      {vs.filter && <ThemeFilterLayer filter={vs.filter} />}
    </View>
  );
});
