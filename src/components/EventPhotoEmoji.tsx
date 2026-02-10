import React, { useState, useRef, useCallback } from "react";
import { Text, Animated, StyleSheet, type TextStyle } from "react-native";
import { devLog } from "@/lib/devLog";

interface EventPhotoEmojiProps {
  photoUrl?: string | null;
  emoji: string;
  /** NativeWind className for the emoji Text (e.g. "text-2xl") */
  emojiClassName?: string;
  /** Inline style for the emoji Text (e.g. { fontSize: 28 }) */
  emojiStyle?: TextStyle;
  /** Optional callback fired when the photo overlay finishes loading (e.g. hero title animation) */
  onPhotoLoad?: () => void;
}

/**
 * Renders event emoji as the base layer with photo overlay that fades in on load.
 * Always shows emoji immediately — photo loads on top without flicker.
 * Must be placed inside a container with overflow:'hidden' and fixed dimensions.
 *
 * Privacy: callers MUST guard photoUrl — never pass it for isBusy or visibility==="private".
 */
export function EventPhotoEmoji({
  photoUrl,
  emoji,
  emojiClassName,
  emojiStyle,
  onPhotoLoad,
}: EventPhotoEmojiProps) {
  const [errored, setErrored] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  const handleLoad = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    onPhotoLoad?.();
  }, [opacity, onPhotoLoad]);

  const handleError = useCallback(() => {
    setErrored(true);
    if (__DEV__) {
      devLog("[EVENT_PHOTO_LOAD_FAIL] url=" + photoUrl);
    }
  }, [photoUrl]);

  const showPhoto = !!photoUrl && !errored;

  return (
    <>
      <Text className={emojiClassName} style={emojiStyle}>
        {emoji}
      </Text>
      {showPhoto && (
        <Animated.Image
          source={{ uri: photoUrl }}
          style={[StyleSheet.absoluteFill, { opacity }]}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </>
  );
}
