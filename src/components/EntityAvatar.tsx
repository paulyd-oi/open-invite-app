import React, { useState } from "react";
import { View, Text, Image, StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EventPhotoEmoji } from "./EventPhotoEmoji";

export interface EntityAvatarProps {
  /** Remote image URL (actor avatar or event cover photo) */
  photoUrl?: string | null;
  /** Emoji character — when paired with photoUrl, photo overlays emoji via EventPhotoEmoji */
  emoji?: string | null;
  /** Initials fallback text (e.g. "PD") */
  initials?: string | null;
  /** Diameter in px */
  size: number;
  /** Border radius — defaults to size / 2 (circle) */
  borderRadius?: number;
  /** Container background color */
  backgroundColor?: string;
  /** Color for initials text and fallback icon */
  foregroundColor?: string;
  /** Ionicons name for lowest-priority fallback */
  fallbackIcon?: React.ComponentProps<typeof Ionicons>["name"];
  /** NativeWind className for emoji Text (pass-through to EventPhotoEmoji) */
  emojiClassName?: string;
  /** Inline style for emoji Text (pass-through to EventPhotoEmoji) */
  emojiStyle?: TextStyle;
  /** Pre-built RN Image source with optional headers (e.g. Authorization).
   *  Takes priority over photoUrl for plain-image rendering (Tier 2). */
  imageSource?: { uri: string; headers?: Record<string, string> } | null;
  /** Badge overlay — rendered at absolute position inside the container */
  badge?: React.ReactNode;
  /** Extra styles applied to the outer container (e.g. margin for layout spacing) */
  style?: ViewStyle;
}

/**
 * SSOT avatar / thumbnail primitive.
 *
 * Rendering priority (first truthy wins):
 *   1. photoUrl + emoji → EventPhotoEmoji (photo fades in over emoji)
 *   2. photoUrl only   → plain Image filling the container
 *   3. emoji only      → EventPhotoEmoji (emoji text, no photo)
 *   4. initials        → centered Text
 *   5. fallbackIcon    → centered Ionicons
 *
 * Container always provides fixed size, borderRadius, overflow:hidden.
 * Callers no longer need to wrap EventPhotoEmoji in a sized View.
 */
export function EntityAvatar({
  photoUrl,
  emoji,
  initials,
  size,
  borderRadius,
  backgroundColor = "transparent",
  foregroundColor = "#6B7280",
  fallbackIcon,
  emojiClassName,
  emojiStyle,
  imageSource,
  badge,
  style,
}: EntityAvatarProps) {
  const radius = borderRadius ?? size / 2;
  // [P0_ENTITY_AVATAR_ERROR_FALLBACK] Track broken image loads
  const [imageFailed, setImageFailed] = useState(false);
  // Resolve effective photo source: imageSource (pre-built with headers) wins over photoUrl string
  const effectiveSource = imageSource?.uri
    ? imageSource
    : photoUrl
      ? { uri: photoUrl }
      : null;
  const hasPhoto = !!effectiveSource && !imageFailed;
  const hasEmoji = !!emoji;
  const hasInitials = !!initials && initials.length > 0;

  let content: React.ReactNode;

  if (hasPhoto && hasEmoji) {
    // Tier 1 — event thumbnail: photo fades in over emoji base layer
    // EventPhotoEmoji handles its own image error internally (falls back to emoji)
    content = (
      <EventPhotoEmoji
        photoUrl={photoUrl ?? imageSource?.uri}
        emoji={emoji}
        emojiClassName={emojiClassName}
        emojiStyle={emojiStyle ?? { fontSize: Math.round(size * 0.5) }}
      />
    );
  } else if (hasPhoto) {
    // Tier 2 — actor avatar: standalone image (supports auth headers via imageSource)
    content = (
      <Image
        source={effectiveSource!}
        style={StyleSheet.absoluteFill}
        onError={() => setImageFailed(true)}
      />
    );
  } else if (hasEmoji) {
    // Tier 3 — emoji only (no photo available)
    content = (
      <EventPhotoEmoji
        emoji={emoji}
        emojiClassName={emojiClassName}
        emojiStyle={emojiStyle ?? { fontSize: Math.round(size * 0.5) }}
      />
    );
  } else if (hasInitials) {
    // Tier 4 — initials
    content = (
      <Text
        style={{
          fontSize: Math.round(size * 0.36),
          fontWeight: "600",
          color: foregroundColor,
        }}
      >
        {initials}
      </Text>
    );
  } else if (fallbackIcon) {
    // Tier 5 — type icon
    content = (
      <Ionicons
        name={fallbackIcon}
        size={Math.round(size * 0.5)}
        color={foregroundColor}
      />
    );
  } else {
    content = null;
  }

  return (
    <View
      style={[{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }, style]}
    >
      {content}
      {badge}
    </View>
  );
}
