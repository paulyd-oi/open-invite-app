import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { getHeroGlassStyle, getGlassBoostStyle } from "@/lib/heroSSOT";

export interface HeroBannerSurfaceProps {
  /** Resolved banner image URI (pass null for no-banner fallback). */
  bannerUri?: string | null;
  /** Current dark-mode flag — drives glass styling. */
  isDark: boolean;
  /** Content rendered inside the glass panel. */
  children: React.ReactNode;
  /** Minimum height of the hero surface (default 200). */
  minHeight?: number;
  /** Optional surface background when no banner is present. */
  fallbackBg?: string;
}

/**
 * Reusable hero banner surface.
 *
 * Renders a full-bleed banner image (when provided) with a subtle tint
 * overlay, then places children inside a glass-panel at the bottom.
 * When no banner is present the surface renders as a simple card.
 */
export function HeroBannerSurface({
  bannerUri,
  isDark,
  children,
  minHeight = 200,
  fallbackBg,
}: HeroBannerSurfaceProps) {
  const hasBanner = typeof bannerUri === "string" && bannerUri.length > 0;

  return (
    <View
      style={{
        minHeight: hasBanner ? minHeight : undefined,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: fallbackBg,
      }}
    >
      {/* Full-bleed banner image */}
      {hasBanner && (
        <Image
          source={{ uri: bannerUri! }}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
        />
      )}

      {/* Subtle tint overlay */}
      {hasBanner && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: isDark
                ? "rgba(0,0,0,0.25)"
                : "rgba(255,255,255,0.15)",
            },
          ]}
        />
      )}

      {/* Content layer — flex-end so glass sits at bottom */}
      <View style={{ flex: 1, justifyContent: hasBanner ? "flex-end" : "flex-start", padding: 12 }}>
        <View style={hasBanner ? getHeroGlassStyle(isDark) : undefined}>
          {/* Legibility boost overlay inside glass */}
          {hasBanner && <View style={getGlassBoostStyle(isDark)} />}
          {children}
        </View>
      </View>
    </View>
  );
}

export default HeroBannerSurface;
