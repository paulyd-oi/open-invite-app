import { useEffect } from "react";
import { Image } from "react-native";

/**
 * Lightweight image preloader.
 *
 * Opportunistically prefetches a remote image URI into the native
 * image cache so that the first render of a hero/banner is instant.
 *
 * Failure is silent — preloading is best-effort, never blocks UI.
 */
export function usePreloadImage(uri?: string | null): void {
  useEffect(() => {
    if (!uri) return;

    Image.prefetch(uri).catch(() => {
      // silent fail — preload is opportunistic
    });
  }, [uri]);
}
