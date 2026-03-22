import React from "react";
import { type TextStyle } from "react-native";
import { EntityAvatar } from "./EntityAvatar";

interface CirclePhotoEmojiProps {
  photoUrl?: string | null;
  emoji?: string;
  /** NativeWind className for the emoji Text (e.g. "text-2xl") */
  emojiClassName?: string;
  /** Inline style for the emoji Text (e.g. { fontSize: 28 }) */
  emojiStyle?: TextStyle;
}

/**
 * Circle group icon with optional photo overlay — thin adapter over EntityAvatar.
 *
 * Always renders "👥" as the base icon regardless of any legacy emoji stored
 * in the database (emoji selection was removed from circle creation).
 * Must be placed inside a container with overflow:hidden and fixed dimensions.
 */
export function CirclePhotoEmoji({
  photoUrl,
  emoji: _emoji,
  emojiClassName,
  emojiStyle,
}: CirclePhotoEmojiProps) {
  return (
    <EntityAvatar
      photoUrl={photoUrl}
      emoji="👥"
      emojiClassName={emojiClassName}
      emojiStyle={emojiStyle}
      size={48}
      borderRadius={0}
      backgroundColor="transparent"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
