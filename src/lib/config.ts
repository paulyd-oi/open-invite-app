/**
 * Centralized Configuration
 *
 * Single source of truth for environment-dependent configuration values.
 * This prevents duplication and ensures consistency across the app.
 */

import { devLog } from "./devLog";

// Production backend URL (Render deployment)
const RENDER_BACKEND_URL = "https://open-invite-api.onrender.com";

// Use API URL override during development, Render for production
// Check for truthy value (not just undefined) to handle empty string case
const overrideApiUrl = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL;
const rawBackendUrl =
  overrideApiUrl && overrideApiUrl.length > 0
    ? overrideApiUrl
    : RENDER_BACKEND_URL;

// Remove trailing slashes to prevent double-slash URLs
// e.g., "https://api.com/" + "/api" = "https://api.com//api" (bad)
// e.g., "https://api.com" + "/api" = "https://api.com/api" (good)
export const BACKEND_URL = rawBackendUrl.replace(/\/+$/, "");

// Log configuration in development for debugging
if (__DEV__) {
  devLog("[config] Backend URL:", BACKEND_URL);
}
