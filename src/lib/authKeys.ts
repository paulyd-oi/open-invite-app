/**
 * Authentication Keys (Single Source of Truth)
 *
 * Canonical storage keys for auth tokens and session data.
 * Used by authClient.ts, authBootstrap.ts, and sessionCache.ts
 * to ensure consistent key usage across all auth operations.
 */

// Main session token key (project-specific)
const projectId = process.env.EXPO_PUBLIC_VIBECODE_PROJECT_ID || "open-invite";
export const SESSION_TOKEN_KEY = `${projectId}.session-token`;

/**
 * Legacy token keys from previous implementations.
 * During logout, all these keys are deleted defensively to
 * handle any migration or debug scenarios where tokens may
 * have been stored under different keys.
 */
export const LEGACY_TOKEN_KEYS = [
  SESSION_TOKEN_KEY, // Primary key (included here for completeness)
  "undefined.session-token", // Bug: dynamic projectId evaluated to undefined
  "session-token", // Bare key without project prefix
  "openinvite.session-token", // Old project name variant
];

/**
 * Session cache key for persistent caching
 */
export const SESSION_CACHE_KEY = "session_cache_v1";
