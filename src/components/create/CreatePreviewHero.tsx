import React from "react";
import { View, Text } from "react-native";
import { AnimatedGradientLayer } from "@/components/AnimatedGradientLayer";
import { BackgroundImageLayer } from "@/components/BackgroundImageLayer";
import { ThemeVideoLayer } from "@/components/ThemeVideoLayer";
import { ThemeEffectLayer } from "@/components/ThemeEffectLayer";
import { BuilderEffectPreview } from "@/components/BuilderEffectPreview";
import { ThemeFilterLayer } from "@/components/ThemeFilterLayer";
import { THEME_BACKGROUNDS, THEME_VIDEOS } from "@/lib/eventThemes";
import type { ThemeId, ThemeVisualStack } from "@/lib/eventThemes";
import type { CustomTheme } from "@/lib/customThemeStorage";

interface CreatePreviewHeroProps {
  title: string;
  emoji: string;
  selectedThemeId: ThemeId | null;
  previewTheme: { visualStack?: ThemeVisualStack };
  selectedCustomTheme: CustomTheme | null;
  glassText: string;
  glassSecondary: string;
  themed: boolean;
}

/**
 * Live preview hero — shows the selected theme's visual stack with event
 * title overlaid. Fixed 250px for V1 (may become dynamic for cover photos).
 */
export function CreatePreviewHero({
  title,
  emoji,
  selectedThemeId,
  previewTheme,
  selectedCustomTheme,
  glassText,
  glassSecondary,
  themed,
}: CreatePreviewHeroProps) {
  const hasVisuals = !!selectedThemeId || !!selectedCustomTheme;

  return (
    <View
      style={{
        height: 250,
        overflow: "hidden",
        marginHorizontal: 16,
        borderRadius: 20,
        marginBottom: 16,
        backgroundColor: themed ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.04)",
      }}
    >
      {/* ── Visual stack layers ── */}
      {/* Animated gradient */}
      {selectedThemeId && previewTheme.visualStack?.gradient && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 }} pointerEvents="none">
          <AnimatedGradientLayer config={previewTheme.visualStack.gradient} />
        </View>
      )}
      {selectedCustomTheme?.visualStack?.gradient && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 }} pointerEvents="none">
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

      {/* Particles */}
      {selectedThemeId && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 }} pointerEvents="none">
          <ThemeEffectLayer themeId={selectedThemeId} />
        </View>
      )}
      {selectedCustomTheme && (selectedCustomTheme.visualStack?.particles || selectedCustomTheme.visualStack?.shader) && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 }} pointerEvents="none">
          <BuilderEffectPreview
            particles={selectedCustomTheme.visualStack.particles}
            shader={selectedCustomTheme.visualStack.shader}
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

      {/* ── Title overlay ── */}
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          padding: 20,
        }}
      >
        {!hasVisuals && !title.trim() && (
          <Text
            style={{
              fontSize: 14,
              color: glassSecondary,
              textAlign: "center",
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              textAlignVertical: "center",
              lineHeight: 250,
            }}
          >
            Choose a theme to preview
          </Text>
        )}
        <Text style={{ fontSize: 32, marginBottom: 4 }}>{emoji}</Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: themed ? "#FFFFFF" : glassText,
          }}
          numberOfLines={2}
        >
          {title.trim() || "Event Title"}
        </Text>
      </View>
    </View>
  );
}
