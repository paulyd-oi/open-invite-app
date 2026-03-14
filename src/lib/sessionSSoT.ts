/**
 * Session SSOT Helpers
 *
 * Canonical way to extract authenticated user identity from useSession().
 * Prevents drift between session.user.id vs session.data.user.id patterns.
 *
 * IMPORTANT: useSession() returns { data: { user: { id } } }
 * The session data is nested under .data property.
 */

import { devLog } from "./devLog";

// Type for the session hook result (from useResilientSession)
interface SessionHookResult {
  data?: {
    user?: {
      id: string;
      name?: string | null;
      displayName?: string | null;
      handle?: string | null;
      image?: string | null;
      email?: string | null;
      emailVerified?: boolean | null;
    };
  } | null;
  isPending?: boolean;
  error?: unknown;
}

// Type for auth gate consumption (just the session data part)
export interface AuthSessionData {
  user?: { id?: string } | null;
  effectiveUserId?: string | null;
}

/**
 * Extract authenticated user ID from session.
 * Returns the canonical user ID or null if not authenticated.
 *
 * @param session - Result from useSession() hook
 * @returns User ID string or null
 */
export function getSessionUserId(session: SessionHookResult | null | undefined): string | null {
  return session?.data?.user?.id ?? null;
}

/**
 * Check if session has authenticated user.
 * @param session - Result from useSession() hook
 * @returns true if user is authenticated with valid ID
 */
export function hasAuthenticatedSession(session: SessionHookResult | null | undefined): boolean {
  return !!getSessionUserId(session);
}

/**
 * Extract session data for auth gate consumption.
 * Converts useSession() result to format expected by isAuthedForNetwork().
 *
 * @param session - Result from useSession() hook
 * @returns Session data in format expected by auth gates
 */
export function getAuthSessionData(session: SessionHookResult | null | undefined): AuthSessionData | null {
  if (!session?.data) {
    return null;
  }

  return {
    user: session.data.user || null,
    // Note: effectiveUserId doesn't exist in current session shape
    // but keeping for backwards compatibility with auth gate interface
    effectiveUserId: null,
  };
}

/**
 * Validate session contract and log violations.
 * Should be called when bootStatus='authed' but session userId is missing.
 *
 * @param bootStatus - Current boot status
 * @param session - Result from useSession() hook
 * @param context - Context for debugging (component name, etc.)
 */
export function validateSessionContract(
  bootStatus: string | undefined,
  session: SessionHookResult | null | undefined,
  context: string
): void {
  if (bootStatus === "authed" && !getSessionUserId(session)) {
    const sessionShape = {
      hasData: !!session?.data,
      hasUser: !!session?.data?.user,
      userId: session?.data?.user?.id ?? "none",
      userEmail: session?.data?.user?.email ?? "none",
      isPending: session?.isPending,
      hasError: !!session?.error,
    };

    // Use console.log for production visibility
    console.log(`[AUTH_SOT_VIOLATION] ${context}: bootStatus='authed' but no session userId`, sessionShape);

    if (__DEV__) {
      devLog(`[AUTH_SOT_VIOLATION] ${context}: bootStatus='authed' but no session userId`, sessionShape);
    }
  }
}