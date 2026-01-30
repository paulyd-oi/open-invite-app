/**
 * Feature Flags
 *
 * Centralized configuration for feature availability.
 * Set flags to false to disable features in production.
 */

export const FEATURES = {
  /**
   * Reserved for future features
   */
  reserved: false,
} as const;

export type FeatureFlag = keyof typeof FEATURES;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: FeatureFlag): boolean {
  return FEATURES[feature];
}
