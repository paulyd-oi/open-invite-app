/**
 * PostHog Analytics SSOT
 *
 * Single source of truth for PostHog product analytics integration.
 * Reads EXPO_PUBLIC_POSTHOG_KEY and EXPO_PUBLIC_POSTHOG_HOST from env.
 * When key is missing, all exports are safe no-ops (app never crashes).
 *
 * [P0_POSTHOG_BOOT] proof tag
 */

import { devLog } from "@/lib/devLog";

// ---------------------------------------------------------------------------
// Env contract
// ---------------------------------------------------------------------------

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

/** True when PostHog is configured and should be active */
export const POSTHOG_ENABLED = POSTHOG_KEY.length > 0;

if (__DEV__) {
  devLog("[P0_POSTHOG_BOOT]", {
    ok: POSTHOG_ENABLED ? 1 : 0,
    reason: POSTHOG_ENABLED ? "enabled" : "missing_key",
    host: POSTHOG_HOST,
  });
}

// ---------------------------------------------------------------------------
// Provider props (consumed by _layout.tsx)
// ---------------------------------------------------------------------------

/**
 * Returns props for <PostHogProvider> if enabled, or null if disabled.
 * Caller should conditionally render the provider.
 */
export function getPostHogProviderProps() {
  if (!POSTHOG_ENABLED) return null;
  return {
    apiKey: POSTHOG_KEY,
    options: { host: POSTHOG_HOST },
    autocapture: {
      captureTouches: false,
      captureLifecycleEvents: true,
      captureScreens: false, // We do manual screen tracking via Expo Router
    },
    debug: __DEV__,
  } as const;
}

// ---------------------------------------------------------------------------
// Safe helpers (always callable, no-op when disabled)
// ---------------------------------------------------------------------------

/**
 * Identify the current user. Call once per session after auth resolves.
 * Properties should be minimal — no secrets/tokens.
 */
export function posthogIdentify(
  posthog: { identify: (id: string, props?: Record<string, any>) => void } | null,
  userId: string,
  properties?: Record<string, any>,
): void {
  if (!POSTHOG_ENABLED || !posthog) return;
  try {
    posthog.identify(userId, properties);
    if (__DEV__) {
      devLog("[P0_POSTHOG_IDENTIFY]", { userId: userId.substring(0, 8) + "..." });
    }
  } catch {
    // Never crash the app for analytics
  }
}

/**
 * Reset PostHog identity. Call on logout.
 */
export function posthogReset(
  posthog: { reset: () => void } | null,
): void {
  if (!POSTHOG_ENABLED || !posthog) return;
  try {
    posthog.reset();
    if (__DEV__) {
      devLog("[P0_POSTHOG_RESET]", "identity_cleared");
    }
  } catch {
    // Never crash the app for analytics
  }
}

/**
 * Capture a custom event.
 */
export function posthogCapture(
  posthog: { capture: (event: string, props?: Record<string, any>) => void } | null,
  event: string,
  properties?: Record<string, any>,
): void {
  if (!POSTHOG_ENABLED || !posthog) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Never crash the app for analytics
  }
}

/**
 * Track a screen view. Used by usePostHogScreenTrack.
 */
export function posthogScreen(
  posthog: { screen: (name: string, props?: Record<string, any>) => void } | null,
  name: string,
  properties?: Record<string, any>,
): void {
  if (!POSTHOG_ENABLED || !posthog) return;
  try {
    posthog.screen(name, properties);
    if (__DEV__) {
      devLog("[P0_POSTHOG_SCREEN]", { path: name, ...properties });
    }
  } catch {
    // Never crash the app for analytics
  }
}
