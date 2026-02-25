/**
 * [P0_DEV_TOAST_FILTER] DEV-only LogBox filter for harmless SDK warnings.
 *
 * React Native's LogBox converts console.warn messages into yellow in-app
 * banner toasts during development. Some SDKs (PostHog, etc.) emit frequent
 * harmless warnings that clutter the dev UI without actionable information.
 *
 * This module registers LogBox.ignoreLogs patterns so those warnings are
 * suppressed from the in-app banner layer ONLY — console output is preserved.
 *
 * IMPORTANT:
 *   - Gated behind __DEV__ — zero production impact.
 *   - Does NOT override console.warn globally.
 *   - Does NOT affect analytics behavior.
 *   - Only call installDevToastFilter() once from the app entry point.
 */
import { LogBox } from "react-native";

/**
 * Substring patterns for warnings that should NOT appear as in-app banners.
 * Console output is unaffected — these only suppress the LogBox UI overlay.
 */
const SUPPRESSED_WARNING_PATTERNS: string[] = [
  // PostHog SDK remote config / feature flag noise
  "[PostHog]",
  "Remote config has no feature flags",
  "Session replay",
  "featureflags {}",
];

/**
 * Install DEV-only LogBox filters. Safe to call multiple times (idempotent
 * because LogBox.ignoreLogs merges patterns internally).
 */
export function installDevToastFilter(): void {
  if (!__DEV__) return;
  LogBox.ignoreLogs(SUPPRESSED_WARNING_PATTERNS);
}
