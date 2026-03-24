/**
 * BackgroundImageLayer — Static atmospheric background image for themed pages.
 *
 * Renders between the animated gradient layer (below) and particle/shader
 * layers (above). Uses plain React Native Image — no Skia dependency.
 *
 * All images are bundled assets resolved via THEME_BACKGROUNDS registry
 * in eventThemes.ts. CDN-hosted images are a future extension.
 */

import React, { memo } from "react";
import { Image, StyleSheet, View, type ImageSourcePropType, type ViewStyle } from "react-native";

interface BackgroundImageLayerProps {
  source: ImageSourcePropType;
  opacity?: number;
  style?: ViewStyle;
}

export const BackgroundImageLayer = memo(function BackgroundImageLayer({
  source,
  opacity = 0.25,
  style,
}: BackgroundImageLayerProps) {
  return (
    <View style={[styles.fill, { opacity }, style]} pointerEvents="none">
      <Image source={source} style={styles.fill} resizeMode="cover" />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default BackgroundImageLayer;
