/**
 * Authed Network Gate - SSOT
 * 
 * Single source of truth for determining if a network call requiring
 * authentication should proceed.
 * 
 * Definition of "authed for network":
 *   bootStatus === "authed"
 *   AND (session?.user?.id exists OR session?.effectiveUserId exists)
 * 
 * All authed API calls MUST check this gate to prevent:
 *   - Network storms during boot
 *   - Cascading 401s when not authenticated
 *   - Fetch loops when session is stale
 */

import type { BootStatus } from "@/hooks/useBootAuthority";
import { devLog } from "@/lib/devLog";

// Minimal session shape for gate check
interface SessionForGate {
  user?: { id?: string } | null;
  effectiveUserId?: string | null;
}

/**
 * Check if we're authenticated and ready for network calls.
 * 
 * @param bootStatus - Current boot authority status
 * @param session - Current session object (from useSession)
 * @returns true if safe to make authed network calls
 */
export function isAuthedForNetwork(
  bootStatus: BootStatus | string | undefined,
  session: SessionForGate | null | undefined
): boolean {
  // Must be fully authed
  if (bootStatus !== "authed") {
    return false;
  }

  // Must have a userId (user.id or effectiveUserId)
  const userId = session?.user?.id ?? session?.effectiveUserId ?? null;
  if (!userId) {
    return false;
  }

  return true;
}

/**
 * Assert auth state for network call and log on denial (DEV only).
 * Returns same boolean as isAuthedForNetwork.
 * 
 * Usage in hooks/components:
 *   if (!assertAuthedForNetwork({ bootStatus, session, tag: "calendarRefetch" })) return;
 * 
 * Usage in react-query:
 *   enabled: isAuthedForNetwork(bootStatus, session)
 * 
 * @param params.bootStatus - Current boot authority status
 * @param params.session - Current session object
 * @param params.tag - Identifier for logging (e.g., "calendarRefetch", "friendsQuery")
 * @param params.endpoint - Optional endpoint for logging context
 * @returns true if safe to proceed, false if call should be skipped
 */
export function assertAuthedForNetwork(params: {
  bootStatus: BootStatus | string | undefined;
  session: SessionForGate | null | undefined;
  tag: string;
  endpoint?: string;
}): boolean {
  const { bootStatus, session, tag, endpoint } = params;
  const allowed = isAuthedForNetwork(bootStatus, session);

  if (!allowed && __DEV__) {
    // Always-on DEV log with canonical prefix
    const userId = session?.user?.id ?? session?.effectiveUserId ?? "none";
    devLog(
      `[P1_NET_GATE] DENY tag=${tag} bootStatus=${bootStatus ?? "undefined"} userId=${userId}${endpoint ? ` endpoint=${endpoint}` : ""}`
    );
  }

  return allowed;
}
