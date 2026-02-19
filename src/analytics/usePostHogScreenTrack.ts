/**
 * usePostHogScreenTrack — Expo Router screen tracking for PostHog.
 *
 * Fires a screen event on each route change, deduped to prevent
 * double-fires on the same path.
 *
 * [P0_POSTHOG_SCREEN] proof tag
 */

import { useEffect, useRef } from "react";
import { usePathname, useSegments } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { posthogScreen, POSTHOG_ENABLED } from "@/analytics/posthogSSOT";

export function usePostHogScreenTrack(): void {
  const pathname = usePathname();
  const segments = useSegments();
  const posthog = usePostHog();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    if (!POSTHOG_ENABLED) return;
    if (!pathname || pathname === lastPathRef.current) return;

    lastPathRef.current = pathname;
    posthogScreen(posthog, pathname, {
      segments: segments.join("/"),
    });
  }, [pathname, segments, posthog]);
}
