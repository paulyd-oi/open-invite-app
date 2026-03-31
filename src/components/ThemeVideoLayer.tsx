/**
 * ThemeVideoLayer — Looping video background for premium theme atmosphere.
 *
 * Renders a full-bleed muted video that loops seamlessly behind particle
 * and filter layers. Falls back to a poster image when:
 * - Reduced motion is enabled
 * - Video fails to load
 * - App is backgrounded (pauses playback, resumes on foreground)
 *
 * Proof tag: [THEME_VIDEO_LAYER_V1]
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View, type AppStateStatus } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useReducedMotion } from "react-native-reanimated";
import { BackgroundImageLayer } from "@/components/BackgroundImageLayer";
import { THEME_BACKGROUNDS } from "@/lib/eventThemes";
import type { ImageSourcePropType } from "react-native";

interface ThemeVideoLayerProps {
  /** Video source (require() result from THEME_VIDEOS) */
  source: number;
  /** Optional poster image source (require() result from THEME_BACKGROUNDS) */
  poster?: ImageSourcePropType;
  /** Layer opacity (0-1, default 0.7) */
  opacity?: number;
  /** Whether this theme is currently active/visible */
  isActive?: boolean;
}

export const ThemeVideoLayer = memo(function ThemeVideoLayer({
  source,
  poster,
  opacity = 0.7,
  isActive = true,
}: ThemeVideoLayerProps) {
  const reducedMotion = useReducedMotion();
  const [videoFailed, setVideoFailed] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // Pause/resume on app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        appStateRef.current.match(/active/) &&
        nextState.match(/inactive|background/)
      ) {
        player.pause();
      } else if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        player.play();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [player]);

  // Play/pause based on isActive
  useEffect(() => {
    if (isActive && !reducedMotion) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, reducedMotion, player]);

  // Listen for status changes to detect failure
  useEffect(() => {
    const sub = player.addListener("statusChange", (payload) => {
      if (payload.status === "error") {
        setVideoFailed(true);
      }
    });
    return () => sub.remove();
  }, [player]);

  // Reduced motion or video failed → show poster only
  if (reducedMotion || videoFailed) {
    if (poster) {
      return (
        <View style={[styles.container, { opacity }]}>
          <BackgroundImageLayer source={poster} opacity={1} />
        </View>
      );
    }
    return null;
  }

  return (
    <View style={[styles.container, { opacity }]} pointerEvents="none">
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  video: {
    flex: 1,
  },
});
