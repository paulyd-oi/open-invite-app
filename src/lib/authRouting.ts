/**
 * Auth Routing SSOT
 *
 * Single source of truth for post-authentication routing logic.
 * Prevents drift between login.tsx and welcome.tsx routing.
 *
 * INVARIANT: All screens that complete authentication MUST use this module
 * to determine the next route, ensuring consistent onboarding flow.
 */

import { devLog, devWarn, devError } from "@/lib/devLog";

/**
 * Route user to appropriate screen after successful authentication.
 * Handles both login completion and signup completion consistently.
 *
 * @param router - Expo Router instance
 * @param context - Context about the auth completion (for logging)
 * @returns Promise that resolves when routing is complete
 */
export async function routeAfterAuthSuccess(
  router: any,
  context: { source: 'login' | 'signup' | 'apple-login' | 'apple-signup' }
): Promise<void> {
  try {
    if (__DEV__) {
      devLog(`[P0_AUTH_ROUTING] Starting post-auth routing, source=${context.source}`);
    }

    // ✅ CRITICAL: Force bootstrap re-run after authentication
    // Singleton bootstrap won't re-run automatically - must explicitly trigger it
    // This ensures bootStatus updates from 'loggedOut' to 'authed'/'onboarding'
    const { rebootstrapAfterLogin } = await import("@/hooks/useBootAuthority");
    if (__DEV__) {
      devLog("[P0_AUTH_ROUTING] Forcing bootstrap re-run after auth...");
    }
    const finalStatus = await rebootstrapAfterLogin();

    // ✅ FIX: Route directly to the correct destination based on bootstrap result
    // This prevents white screen from navigating to "/" which returns null during loading
    if (__DEV__) {
      devLog(`[P0_AUTH_ROUTING] Bootstrap complete, finalStatus=${finalStatus}, source=${context.source}`);
    }

    if (finalStatus === 'authed') {
      // User has completed onboarding - go to main app
      if (__DEV__) {
        devLog(`[P0_AUTH_ROUTING] finalStatus=authed → /calendar (source=${context.source})`);
      }
      router.replace("/calendar");
    } else if (finalStatus === 'onboarding') {
      // User needs to complete onboarding
      if (__DEV__) {
        devLog(`[P0_AUTH_ROUTING] finalStatus=onboarding → /welcome (source=${context.source})`);
      }
      router.replace("/welcome");
    } else {
      // Error or degraded state - route to welcome for safe recovery
      devWarn(`[P0_AUTH_ROUTING] Unexpected status after auth: ${finalStatus} (source=${context.source})`);
      router.replace("/welcome");
    }
  } catch (error) {
    devError(`[P0_AUTH_ROUTING] Error during post-auth routing (source=${context.source}):`, error);

    // Fail-safe: Route to welcome for safe recovery
    // Don't stay on login to avoid trapping user
    if (__DEV__) {
      devLog(`[P0_AUTH_ROUTING] Routing to /welcome due to error (source=${context.source})`);
    }
    router.replace("/welcome");
  }
}

/**
 * DEVELOPMENT ONLY: Verify that post-auth routing is using SSOT.
 * Call this in screens that handle auth completion to catch drift.
 */
export function assertAuthRoutingSSoT(screenName: string): void {
  if (__DEV__) {
    // This function exists to make it easy to grep for SSOT compliance
    devLog(`[AUTH_ROUTING_SSOT] Screen ${screenName} using shared auth routing`);
  }
}