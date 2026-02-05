/**
 * Session Hook
 *
 * Re-exports the resilient session hook that provides offline support.
 * Use this hook instead of authClient.useSession() directly.
 *
 * Features:
 * - Caches session data locally
 * - Returns cached session when offline (prevents "logged out" state)
 * - [P0_AUTH_403_NO_LOGOUT] Only clears session on 401 (not 403)
 * - Never clears session on network errors
 */

// Re-export the resilient session hook
export { useResilientSession as useSession, useIsAuthenticated } from "./useResilientSession";

// Also export the original for cases where it's needed
export { authClient } from "./authClient";
