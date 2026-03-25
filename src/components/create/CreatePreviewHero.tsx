import React from "react";
import { View, Text, Pressable } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
  /** Cover image URL to display over the visual stack. */
  coverImageUrl?: string | null;
  /** Called when user taps the hero to open the cover picker. */
  onPressCover?: () => void;
}

/**
 * Live preview hero — shows the selected theme's visual stack with event
 * title overlaid. Fixed 220px for V1 (may become dynamic for cover photos).
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
  coverImageUrl,
  onPressCover,
}: CreatePreviewHeroProps) {
  const hasVisuals = !!selectedThemeId || !!selectedCustomTheme;
  const hasTitle = !!title.trim();

  const hasCover = !!coverImageUrl;

  return (
    <Pressable
      onPress={onPressCover}
      style={{
        height: 220,
        overflow: "hidden",
        marginHorizontal: 16,
        borderRadius: 20,
        marginBottom: 16,
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

      {/* Themed base fill */}
      {hasVisuals && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.3)" }} />
      )}

      {/* Cover image — overlays everything when set */}
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

      {/* ── Visual stack layers ── */}
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

      {/* Bottom fade for text readability */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 100 }} pointerEvents="none">
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.6)"]}
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
        <Text style={{ fontSize: 28, marginBottom: 2 }}>{emoji}</Text>
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
    </Pressable>
  );
}
