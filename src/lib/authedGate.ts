/**
 * Authed Network Gate - SSOT
 *
 * Single source of truth for determining if a network call requiring
 * authentication should proceed.
 *
 * Definition of "authed for network":
 *   bootStatus === "authed"
 *   AND session has authenticated user ID (via SSOT helpers)
 *
 * All authed API calls MUST check this gate to prevent:
 *   - Network storms during boot
 *   - Cascading 401s when not authenticated
 *   - Fetch loops when session is stale
 */

import type { BootStatus } from "@/hooks/useBootAuthority";
import { devLog } from "@/lib/devLog";
import { getSessionUserId, validateSessionContract } from "@/lib/sessionSSoT";

// Legacy interface for backwards compatibility
interface SessionForGate {
  user?: { id?: string } | null;
  effectiveUserId?: string | null;
}

// Modern session hook result type
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

/**
 * Check if we're authenticated and ready for network calls.
 *
 * Supports both legacy session data format and new useSession() hook result.
 * Use SSOT helpers when possible for consistency.
 *
 * @param bootStatus - Current boot authority status
 * @param session - Session data OR useSession() hook result
 * @returns true if safe to make authed network calls
 */
export function isAuthedForNetwork(
  bootStatus: BootStatus | string | undefined,
  session: SessionForGate | SessionHookResult | null | undefined
): boolean {
  // Must be fully authed
  if (bootStatus !== "authed") {
    return false;
  }

  // Try SSOT helper first (for useSession() hook results)
  const ssotUserId = getSessionUserId(session as SessionHookResult);
  if (ssotUserId) {
    return true;
  }

  // Fallback to legacy session format for backwards compatibility
  const legacySession = session as SessionForGate;
  const legacyUserId = legacySession?.user?.id ?? legacySession?.effectiveUserId ?? null;
  if (legacyUserId) {
    return true;
  }

  return false;
}

/**
 * Check auth state for React Query enabled conditions.
 * Includes session contract validation logging.
 *
 * Recommended for components using useSession() hook.
 *
 * @param bootStatus - Current boot authority status
 * @param session - Result from useSession() hook
 * @param context - Context for debugging (component name)
 * @returns true if safe to make authed network calls
 */
export function isAuthedForNetworkSSoT(
  bootStatus: BootStatus | string | undefined,
  session: SessionHookResult | null | undefined,
  context: string = "unknown"
): boolean {
  // Check auth state using SSOT helper
  const allowed = isAuthedForNetwork(bootStatus, session);

  // Validate session contract and log violations
  validateSessionContract(bootStatus, session, context);

  return allowed;
}

/**
 * Assert auth state for network call and log on denial (DEV only).
 * Returns same boolean as isAuthedForNetwork.
 *
 * LEGACY: Use isAuthedForNetworkSSoT() for new code.
 *
 * @param params.bootStatus - Current boot authority status
 * @param params.session - Current session object
 * @param params.tag - Identifier for logging (e.g., "calendarRefetch", "friendsQuery")
 * @param params.endpoint - Optional endpoint for logging context
 * @returns true if safe to proceed, false if call should be skipped
 */
export function assertAuthedForNetwork(params: {
  bootStatus: BootStatus | string | undefined;
  session: SessionForGate | SessionHookResult | null | undefined;
  tag: string;
  endpoint?: string;
}): boolean {
  const { bootStatus, session, tag, endpoint } = params;
  const allowed = isAuthedForNetwork(bootStatus, session);

  if (!allowed && __DEV__) {
    // Always-on DEV log with canonical prefix
    const ssotUserId = getSessionUserId(session as SessionHookResult);
    const legacyUserId = (session as SessionForGate)?.user?.id ?? (session as SessionForGate)?.effectiveUserId;
    const userId = ssotUserId ?? legacyUserId ?? "none";
    devLog(
      `[P0_NET_GATE] DENY tag=${tag} bootStatus=${bootStatus ?? "undefined"} userId=${userId}${endpoint ? ` endpoint=${endpoint}` : ""}`
    );
  }

  return allowed;
}
