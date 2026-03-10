/**
 * Centralized Configuration
 *
 * Single source of truth for environment-dependent configuration values.
 * This prevents duplication and ensures consistency across the app.
 */

import { devLog } from "./devLog";

/** Canonical production API origin. */
export const PRODUCTION_BACKEND_ORIGIN = "https://api.openinvite.cloud";

/** Canonical branded universal-link/share domain. */
export const SHARE_DOMAIN = "https://go.openinvite.cloud";

/** Canonical App Store ID. */
export const APP_STORE_ID = "6757429210";

/** Canonical App Store listing URL — country-neutral, id-only form. */
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

// Use API URL override during development, canonical production origin otherwise
// Check for truthy value (not just undefined) to handle empty string case
const overrideApiUrl = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL;
const rawBackendUrl =
  overrideApiUrl && overrideApiUrl.length > 0
    ? overrideApiUrl
    : PRODUCTION_BACKEND_ORIGIN;

// Remove trailing slashes to prevent double-slash URLs
// e.g., "https://api.com/" + "/api" = "https://api.com//api" (bad)
// e.g., "https://api.com" + "/api" = "https://api.com/api" (good)
export const BACKEND_URL = rawBackendUrl.replace(/\/+$/, "");

// Log configuration in development for debugging
if (__DEV__) {
  devLog("[config] Backend URL:", BACKEND_URL);
}
