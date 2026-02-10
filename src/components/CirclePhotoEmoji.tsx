import React from "react";
import { type TextStyle } from "react-native";
import { EntityAvatar } from "./EntityAvatar";

interface CirclePhotoEmojiProps {
  photoUrl?: string | null;
  emoji: string;
  /** NativeWind className for the emoji Text (e.g. "text-2xl") */
  emojiClassName?: string;
  /** Inline style for the emoji Text (e.g. { fontSize: 28 }) */
  emojiStyle?: TextStyle;
}

/**
 * Circle emoji with photo overlay — thin adapter over EntityAvatar (identity SSOT).
 *
 * Must be placed inside a container with overflow:hidden and fixed dimensions.
 * Delegates rendering + fallback chain to EntityAvatar; preserves the same
 * emoji-base + photo-fade-in visual via EntityAvatar → EventPhotoEmoji path.
 */
export function CirclePhotoEmoji({
  photoUrl,
  emoji,
  emojiClassName,
  emojiStyle,
}: CirclePhotoEmojiProps) {
  return (
    <EntityAvatar
      photoUrl={photoUrl}
      emoji={emoji}
      emojiClassName={emojiClassName}
      emojiStyle={emojiStyle}
      size={48}
      borderRadius={0}
      backgroundColor="transparent"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
