/**
 * Centralized Configuration
 *
 * Single source of truth for environment-dependent configuration values.
 * This prevents duplication and ensures consistency across the app.
 */

// Production backend URL (Render deployment)
const RENDER_BACKEND_URL = "https://open-invite-api.onrender.com";

// Use Vibecode sandbox URL during development, Render for production
// Check for truthy value (not just undefined) to handle empty string case
const vibecodeSandboxUrl = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL;
const rawBackendUrl =
  vibecodeSandboxUrl && vibecodeSandboxUrl.length > 0
    ? vibecodeSandboxUrl
    : RENDER_BACKEND_URL;

// Remove trailing slashes to prevent double-slash URLs
// e.g., "https://api.com/" + "/api" = "https://api.com//api" (bad)
// e.g., "https://api.com" + "/api" = "https://api.com/api" (good)
export const BACKEND_URL = rawBackendUrl.replace(/\/+$/, "");

// Log configuration in development for debugging
if (__DEV__) {
  console.log("[config] Backend URL:", BACKEND_URL);
}
