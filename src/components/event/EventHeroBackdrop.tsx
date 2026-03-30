import React from "react";
import { View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";

interface EventHeroBackdropProps {
  eventBannerUri: string | null;
  hasPhoto: boolean;
  canvasColor: string;
  isDark: boolean;
  themeColor: string;
  pageTintDark: string | undefined;
  pageTintLight: string | undefined;
}

export function EventHeroBackdrop({
  eventBannerUri,
  hasPhoto,
  canvasColor,
  isDark,
  themeColor,
  pageTintDark,
  pageTintLight,
}: EventHeroBackdropProps) {
  if (hasPhoto && eventBannerUri) {
    const tint = isDark ? pageTintDark : pageTintLight;
    return (
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <ExpoImage
          source={{ uri: toCloudinaryTransformedUrl(eventBannerUri, CLOUDINARY_PRESETS.AVATAR_THUMB) }}
          style={{ width: "100%", height: "100%", opacity: isDark ? 0.7 : 0.55 }}
          contentFit="cover"
          blurRadius={70}
          cachePolicy="memory-disk"
        />
        {/* Layered scrim: let color through, fade to canvas */}
        <LinearGradient
          colors={[
            isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.02)",
            isDark ? "rgba(0,0,0,0.15)" : "transparent",
            isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.03)",
            canvasColor,
          ]}
          locations={[0, 0.25, 0.7, 1]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* Theme tint wash over photo backdrop */}
        {tint && tint !== "transparent" ? (
          <LinearGradient
            colors={[tint, "transparent"]}
            locations={[0, 0.65]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : null}
      </View>
    );
  }

  // No-photo: warmer gradient atmosphere (theme-aware)
  const tint = isDark ? pageTintDark : pageTintLight;
  const baseTint = tint && tint !== "transparent" ? tint : undefined;
  return (
    <LinearGradient
      colors={isDark
        ? [baseTint ?? `${themeColor}30`, baseTint ? "transparent" : `${themeColor}12`, canvasColor]
        : [baseTint ?? `${themeColor}20`, baseTint ? "transparent" : `${themeColor}0A`, canvasColor]
      }
      locations={[0, 0.4, 1]}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}
