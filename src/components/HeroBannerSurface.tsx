import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { getHeroGlassStyle, getGlassBoostStyle } from "@/lib/heroSSOT";
import { toCloudinaryTransformedUrl } from "@/lib/mediaTransformSSOT";
import MotionSurface from "@/components/MotionSurface";

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
  // [MEDIA_TRANSFORM_SSOT_V1] — decode-optimised hero render URL
  const bannerRenderUri = hasBanner
    ? toCloudinaryTransformedUrl(bannerUri!, { w: 1200, h: 600, crop: "fill", format: "auto" })
    : null;

  return (
    <MotionSurface
      preset="hero"
      style={{
        minHeight: hasBanner ? minHeight : undefined,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: fallbackBg,
      }}
    >
      {/* Full-bleed banner image */}
      {hasBanner && (
        <MotionSurface preset="media" style={StyleSheet.absoluteFillObject}>
          <Image
            source={{ uri: bannerRenderUri! }}
            resizeMode="cover"
            style={StyleSheet.absoluteFillObject}
          />
        </MotionSurface>
      )}

      {/* Subtle tint overlay */}
      {hasBanner && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: isDark
                ? "rgba(0,0,0,0.28)"
                : "rgba(255,255,255,0.18)",
            },
          ]}
        />
      )}

      {/* Bottom legibility gradient */}
      {hasBanner && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            backgroundColor: isDark
              ? "rgba(0,0,0,0.35)"
              : "rgba(255,255,255,0.25)",
          }}
        />
      )}

      {/* Content layer — flex-end so glass sits at bottom */}
      <View style={{ flex: 1, justifyContent: hasBanner ? "flex-end" : "flex-start", padding: 12 }}>
        <View style={hasBanner ? {
          ...getHeroGlassStyle(isDark),
          backgroundColor: isDark
            ? "rgba(0,0,0,0.46)"
            : "rgba(255,255,255,0.82)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.06)",
          shadowColor: "#000",
          shadowOpacity: isDark ? 0.35 : 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        } : undefined}>
          {/* Legibility boost overlay inside glass */}
          {hasBanner && <View style={getGlassBoostStyle(isDark)} />}
          {children}
        </View>
      </View>
    </MotionSurface>
  );
}

export default HeroBannerSurface;
