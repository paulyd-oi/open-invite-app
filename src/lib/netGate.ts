/**
 * Net Gate — auth-aware fetch discipline
 *
 * Thin canonical wrapper around isAuthedForNetwork that:
 * 1. Provides shouldAllowAuthedFetch() / canAuthedNetworkRun() for the task contract
 * 2. Adds [P0_NET_GATE] DEV proof logging on denial
 * 3. Serves as single import for new auth-gated queries
 *
 * INVARIANT: No authenticated query may fire while
 * bootStatus !== "authed" or session has no userId.
 */

import type { BootStatus } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { devLog } from "@/lib/devLog";

// Re-export canonical gate for convenience
export { isAuthedForNetwork } from "@/lib/authedGate";

interface SessionForGate {
  user?: { id?: string } | null;
  effectiveUserId?: string | null;
}

// Dedupe: only log once per (bootStatus, hasUserId) combo per session
let lastLoggedState: string | null = null;

/**
 * shouldAllowAuthedFetch — canonical net gate check
 *
 * Returns true when the app is authenticated and ready for network calls.
 * Logs [P0_NET_GATE] on first denial per state transition (DEV only).
 *
 * Usage:
 *   enabled: shouldAllowAuthedFetch(bootStatus, session)
 *   enabled: shouldAllowAuthedFetch(bootStatus, session) && !!eventId
 */
export function shouldAllowAuthedFetch(
  bootStatus: BootStatus | string | undefined,
  session: SessionForGate | null | undefined,
  tag?: string
): boolean {
  const allowed = isAuthedForNetwork(bootStatus, session);

  if (__DEV__ && !allowed) {
    const stateKey = `${bootStatus ?? "undefined"}:${session?.user?.id ?? session?.effectiveUserId ?? "none"}`;

    // Only log once per state transition to avoid render spam
    if (lastLoggedState !== stateKey) {
      lastLoggedState = stateKey;
      devLog(
        `[P0_NET_GATE] BLOCKED bootStatus=${bootStatus ?? "undefined"} userId=${session?.user?.id ?? session?.effectiveUserId ?? "none"}${tag ? ` tag=${tag}` : ""}`
      );
    }
  }

  if (__DEV__ && allowed && lastLoggedState !== null) {
    // Gate opened — log once
    lastLoggedState = null;
    devLog(`[P0_NET_GATE] OPEN bootStatus=${bootStatus ?? "undefined"}`);
  }

  return allowed;
}

/**
 * canAuthedNetworkRun — task-contract alias for shouldAllowAuthedFetch.
 *
 * Identical semantics: returns true only when bootStatus is authed
 * and session has a userId. Fires [P0_NET_GATE] DEV log on denial.
 */
export const canAuthedNetworkRun = shouldAllowAuthedFetch;
