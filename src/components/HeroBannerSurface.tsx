import React from "react";
import { View, StyleSheet } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { getHeroGlassStyle, getGlassBoostStyle, HERO_BANNER_ASPECT_RATIO } from "@/lib/heroSSOT";
import { toCloudinaryTransformedUrl } from "@/lib/mediaTransformSSOT";
import MotionSurface from "@/components/MotionSurface";
import { devLog } from "@/lib/devLog";

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

// Module-level flag so proof log fires once per session
let _bannerProofLogged = false;

/**
 * Reusable hero banner surface.
 *
 * Renders a full-bleed banner image (when provided) with a subtle tint
 * overlay, then places children inside a glass-panel at the bottom.
 * When no banner is present the surface renders as a simple card.
 *
 * The banner container uses a fixed aspect ratio (HERO_BANNER_ASPECT_RATIO)
 * so the image is never stretched or distorted.
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

  // [BANNER_PREVIEW] DEV-only proof log — fires once per session
  if (__DEV__ && hasBanner && !_bannerProofLogged) {
    _bannerProofLogged = true;
    devLog("[BANNER_PREVIEW]", `source=${bannerRenderUri?.slice(0, 60)} aspect=${HERO_BANNER_ASPECT_RATIO} fit=cover`);
  }

  return (
    <MotionSurface
      preset="hero"
      style={{
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: fallbackBg,
      }}
    >
      {/* Aspect-ratio-locked banner image container */}
      {hasBanner && (
        <View style={{ width: "100%", aspectRatio: HERO_BANNER_ASPECT_RATIO }}>
          <MotionSurface preset="media" style={StyleSheet.absoluteFillObject}>
            <ExpoImage
              source={{ uri: bannerRenderUri! }}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              priority="normal"
              style={StyleSheet.absoluteFillObject}
            />
          </MotionSurface>

          {/* Subtle tint overlay */}
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

          {/* Bottom legibility gradient */}
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

          {/* Content layer — flex-end so glass sits at bottom of the banner */}
          <View style={[StyleSheet.absoluteFillObject, { justifyContent: "flex-end", padding: 12 }]}>
            <View style={{
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
            }}>
              <View style={getGlassBoostStyle(isDark)} />
              {children}
            </View>
          </View>
        </View>
      )}

      {/* No-banner fallback — simple card layout */}
      {!hasBanner && (
        <View style={{ minHeight, justifyContent: "flex-start", padding: 12 }}>
          {children}
        </View>
      )}
    </MotionSurface>
  );
}

export default HeroBannerSurface;
