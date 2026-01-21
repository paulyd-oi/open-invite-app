/**
 * Auth State Machine (Canonical)
 *
 * Single source of truth for authentication state derivation.
 * Pure functions only - no side effects, no storage access, no routing.
 *
 * This module formalizes the implicit state machine that was previously
 * scattered across authBootstrap, welcome, login, and index routing logic.
 */

/**
 * Canonical Authentication States
 * 
 * These states represent the complete lifecycle of user authentication
 * and onboarding. The state machine is deterministic and acyclic.
 */
export type AuthState =
  | "logged_out"         // No token exists anywhere
  | "authenticating"     // Login / Apple / email flow in progress
  | "authenticated"      // Token valid, user identity known
  | "onboarding_incomplete"  // Authenticated but onboarding not finished
  | "ready"              // Authenticated + onboarding complete
  | "logging_out";       // resetSession() in progress

/**
 * State Machine Parameters
 * Input data required to derive the current auth state.
 */
export interface AuthStateParams {
  hasToken: boolean;
  tokenValid: boolean;
  onboardingCompleted: boolean;
  hasOnboardingProgress: boolean;
}

/**
 * Derive Authentication State (Pure Function)
 * 
 * This is the canonical state machine logic. All other auth-related
 * code should defer to this function instead of implementing their
 * own state derivation logic.
 * 
 * Rules:
 * - NO side effects (no storage access, no network calls, no routing)
 * - Deterministic (same inputs always produce same output)
 * - Complete (handles all possible input combinations)
 * 
 * State Transitions:
 * logged_out → authenticating → authenticated → onboarding_incomplete → ready
 *                                                                      ↑
 *                                                                      └─ logging_out
 * 
 * @param params - Current auth state indicators
 * @returns Canonical auth state
 */
export function deriveAuthState(params: AuthStateParams): AuthState {
  const { hasToken, tokenValid, onboardingCompleted, hasOnboardingProgress } = params;

  // Rule 1: No token or invalid token → logged_out
  if (!hasToken || !tokenValid) {
    return "logged_out";
  }

  // Rule 2: Valid token + onboarding complete → ready
  if (onboardingCompleted) {
    // DEV-only: warn if progress flags exist when onboarding is complete
    if (__DEV__ && hasOnboardingProgress) {
      console.warn(
        "[AuthState] Invariant warning: onboarding complete but progress flags exist",
        { onboardingCompleted, hasOnboardingProgress }
      );
    }
    return "ready";
  }

  // Rule 3: Valid token + onboarding in progress → onboarding_incomplete
  if (hasOnboardingProgress) {
    return "onboarding_incomplete";
  }

  // Rule 4: Valid token + no onboarding flags → onboarding_incomplete
  // (This handles fresh authenticated users who haven't started onboarding)
  return "onboarding_incomplete";
}

/**
 * State Machine Invariants (DEV-only validation)
 * 
 * These are assertions that should ALWAYS be true for each state.
 * Used for diagnostics and preventing regressions, NOT for enforcement.
 * 
 * If an invariant fails, it indicates:
 * - A bug in deriveAuthState()
 * - Corrupted storage state
 * - Race condition in state updates
 * 
 * @param state - Current auth state to validate
 * @param params - Original parameters used to derive the state
 */
export function assertAuthInvariants(
  state: AuthState,
  params: AuthStateParams
): void {
  if (!__DEV__) return; // Only run in development

  const { hasToken, tokenValid, onboardingCompleted, hasOnboardingProgress } = params;

  switch (state) {
    case "logged_out":
      // Invariant: No valid token should exist
      if (hasToken && tokenValid) {
        console.warn(
          "[AuthState] Invariant violation: logged_out state but valid token exists",
          { hasToken, tokenValid }
        );
      }
      break;

    case "ready":
      // Invariant: Must have valid token AND onboarding complete
      if (!hasToken || !tokenValid) {
        console.warn(
          "[AuthState] Invariant violation: ready state but no valid token",
          { hasToken, tokenValid }
        );
      }
      if (!onboardingCompleted) {
        console.warn(
          "[AuthState] Invariant violation: ready state but onboarding not complete",
          { onboardingCompleted }
        );
      }
      break;

    case "onboarding_incomplete":
      // Invariant: Must have valid token but onboarding NOT complete
      if (!hasToken || !tokenValid) {
        console.warn(
          "[AuthState] Invariant violation: onboarding_incomplete but no valid token",
          { hasToken, tokenValid }
        );
      }
      if (onboardingCompleted) {
        console.warn(
          "[AuthState] Invariant violation: onboarding_incomplete but onboarding is complete",
          { onboardingCompleted }
        );
      }
      break;

    case "authenticated":
      // Invariant: Must have valid token
      // (This state is currently unused but reserved for future use)
      if (!hasToken || !tokenValid) {
        console.warn(
          "[AuthState] Invariant violation: authenticated but no valid token",
          { hasToken, tokenValid }
        );
      }
      break;

    case "authenticating":
    case "logging_out":
      // These are transient states - no storage invariants to check
      break;

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = state;
      console.warn("[AuthState] Unknown state:", _exhaustive);
  }
}

/**
 * Map Legacy Bootstrap States to Canonical Auth States
 * 
 * This helper bridges the old AuthBootstrapState type to the new
 * canonical AuthState type. Used during migration to preserve
 * existing behavior while formalizing the state machine.
 * 
 * @param bootstrapState - Legacy state from authBootstrap
 * @param onboardingCompleted - Whether onboarding is complete
 * @returns Canonical auth state
 */
export function mapBootstrapStateToAuthState(
  bootstrapState: "loggedOut" | "onboarding" | "authed",
  onboardingCompleted: boolean
): AuthState {
  switch (bootstrapState) {
    case "loggedOut":
      return "logged_out";
    
    case "onboarding":
      return "onboarding_incomplete";
    
    case "authed":
      // "authed" in bootstrap means token valid + onboarding complete
      return onboardingCompleted ? "ready" : "onboarding_incomplete";
    
    default:
      const _exhaustive: never = bootstrapState;
      console.warn("[AuthState] Unknown bootstrap state:", _exhaustive);
      return "logged_out";
  }
}
