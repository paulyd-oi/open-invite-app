import React from "react";
import { View, Text } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { AnimatedGradientLayer } from "@/components/AnimatedGradientLayer";
import { BackgroundImageLayer } from "@/components/BackgroundImageLayer";
import { ThemeVideoLayer } from "@/components/ThemeVideoLayer";
import { ThemeFilterLayer } from "@/components/ThemeFilterLayer";
import { THEME_BACKGROUNDS, THEME_VIDEOS } from "@/lib/eventThemes";
import type { ThemeId, ThemeVisualStack } from "@/lib/eventThemes";
import type { CustomTheme } from "@/lib/customThemeStorage";

interface CreatePreviewHeroProps {
  title: string;
  selectedThemeId: ThemeId | null;
  previewTheme: { visualStack?: ThemeVisualStack };
  selectedCustomTheme: CustomTheme | null;
  glassText: string;
  glassSecondary: string;
  themed: boolean;
  /** Cover image URL to display over the visual stack. */
  coverImageUrl?: string | null;
}

/**
 * Live preview hero — shows the selected theme's visual stack with event
 * title overlaid. Fixed 220px for V1 (may become dynamic for cover photos).
 */
export function CreatePreviewHero({
  title,
  selectedThemeId,
  previewTheme,
  selectedCustomTheme,
  glassText,
  glassSecondary,
  themed,
  coverImageUrl,
}: CreatePreviewHeroProps) {
  const hasVisuals = !!selectedThemeId || !!selectedCustomTheme;
  const hasTitle = !!title.trim();

  const hasCover = !!coverImageUrl;

  return (
    <View
      style={{
        height: 220,
        overflow: "hidden",
        marginHorizontal: 16,
        borderRadius: 20,
        marginBottom: 16,
        backgroundColor: "#0A0A12",
      }}
    >
      {/* Default background — subtle gradient when no theme selected */}
      {!hasVisuals && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <LinearGradient
            colors={["rgba(25,25,30,0.95)", "rgba(40,40,50,0.85)", "rgba(25,25,30,0.95)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          />
        </View>
      )}

      {/* Cover image — renders directly on the opaque base */}
      {hasCover && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <ExpoImage
            source={{ uri: coverImageUrl! }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={300}
          />
        </View>
      )}

      {/* ── Visual stack layers — only when NO cover photo ── */}
      {!hasCover && (
        <>
          {/* Themed base fill */}
          {hasVisuals && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.3)" }} />
          )}

          {/* Animated gradient */}
          {selectedThemeId && previewTheme.visualStack?.gradient && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.6 }} pointerEvents="none">
              <AnimatedGradientLayer config={previewTheme.visualStack.gradient} />
            </View>
          )}
          {selectedCustomTheme?.visualStack?.gradient && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.6 }} pointerEvents="none">
              <AnimatedGradientLayer config={selectedCustomTheme.visualStack.gradient} />
            </View>
          )}

          {/* Static background image */}
          {selectedThemeId && previewTheme.visualStack?.image && THEME_BACKGROUNDS[previewTheme.visualStack.image.source] && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
              <BackgroundImageLayer
                source={THEME_BACKGROUNDS[previewTheme.visualStack.image.source]}
                opacity={previewTheme.visualStack.image.opacity}
              />
            </View>
          )}
          {selectedCustomTheme?.visualStack?.image && THEME_BACKGROUNDS[selectedCustomTheme.visualStack.image.source] && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
              <BackgroundImageLayer
                source={THEME_BACKGROUNDS[selectedCustomTheme.visualStack.image.source]}
                opacity={selectedCustomTheme.visualStack.image.opacity}
              />
            </View>
          )}

          {/* Looping video */}
          {selectedThemeId && previewTheme.visualStack?.video && THEME_VIDEOS[previewTheme.visualStack.video.source] && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
              <ThemeVideoLayer
                source={THEME_VIDEOS[previewTheme.visualStack.video.source]}
                poster={previewTheme.visualStack.video.poster ? THEME_BACKGROUNDS[previewTheme.visualStack.video.poster] : undefined}
                opacity={previewTheme.visualStack.video.opacity}
                isActive={true}
              />
            </View>
          )}

          {/* Filter overlay */}
          {selectedThemeId && previewTheme.visualStack?.filter && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
              <ThemeFilterLayer filter={previewTheme.visualStack.filter} />
            </View>
          )}
          {selectedCustomTheme?.visualStack?.filter && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
              <ThemeFilterLayer filter={selectedCustomTheme.visualStack.filter} />
            </View>
          )}
        </>
      )}

      {/* Motif overlay — handled page-wide in create.tsx, not hero-scoped */}

      {/* Bottom scrim for title readability */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: hasCover ? 88 : 100 }} pointerEvents="none">
        <LinearGradient
          colors={["transparent", hasCover ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.6)"]}
          style={{ flex: 1 }}
        />
      </View>

      {/* ── Title overlay ── */}
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        {!hasVisuals && !hasTitle && !hasCover && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.06)", justifyContent: "center", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 22 }}>✨</Text>
            </View>
            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: "500" }}>
              Pick a theme to preview your invite
            </Text>
          </View>
        )}
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: "#FFFFFF",
            textShadowColor: "rgba(0,0,0,0.4)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
          numberOfLines={2}
        >
          {hasTitle ? title : "Your Event Title"}
        </Text>
      </View>
    </View>
  );
}
