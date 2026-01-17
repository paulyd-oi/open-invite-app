/**
 * Feature Flags
 *
 * Centralized configuration for feature availability.
 * Set flags to false to disable features in production.
 */

export const FEATURES = {
  /**
   * Business Accounts feature (future scope)
   * When false:
   * - All business-related routes redirect to home
   * - Backend business endpoints return 404
   * - Navigation entry points are hidden
   * - Deep links to business routes are blocked
   */
  businessAccounts: false,
} as const;

export type FeatureFlag = keyof typeof FEATURES;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: FeatureFlag): boolean {
  return FEATURES[feature];
}
