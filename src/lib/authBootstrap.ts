/**
 * Auth Bootstrap
 *
 * Deterministic authentication bootstrap that always ends in one of:
 * - loggedOut (redirect to /welcome)
 * - onboarding (redirect to /welcome with state)
 * - authed (stay on current screen)
 *
 * Features:
 * - Comprehensive logging at each step
 * - Error handling with no infinite loops
 * - 15s watchdog timer
 * - Clear session state on errors
 * - Canonical state machine via authState.ts
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { authClient, hasAuthToken, clearAuthToken } from "./authClient";
import { getSessionCached, clearSessionCache } from "./sessionCache";
import { isNetworkError, shouldLogoutOnError, isRateLimitError } from "./networkStatus";
import { isRateLimited, getRateLimitRemaining, setRateLimited, clearRateLimit } from "./rateLimitState";
import { deriveAuthState, assertAuthInvariants, type AuthState } from "./authState";
import { SESSION_TOKEN_KEY, LEGACY_TOKEN_KEYS, SESSION_CACHE_KEY } from "./authKeys";

/**
 * DEV-only trace helper for auth token flow tracing.
 * Never logs token content - only booleans, keys, and function names.
 */
function authTrace(event: string, data: Record<string, boolean | string | number>): void {
  if (!__DEV__) return;
  console.log(`[AUTH_TRACE] ${event}`, data);
}

// Bootstrap states
export type AuthBootstrapState = "loggedOut" | "onboarding" | "authed";

// Bootstrap result
export interface AuthBootstrapResult {
  state: AuthBootstrapState;
  session: any | null;
  error?: string;
  timedOut?: boolean;
}

// Logging helper
function log(step: string, data?: any) {
  if (__DEV__) {
    console.log(`[AuthBootstrap] ${step}`, data || "");
  }
}

/**
 * Reset all session state (for logout and watchdog)
 * 
 * CRITICAL: This function NEVER throws - logout always succeeds locally
 * even if backend is down, offline, or returns 500.
 */
export async function resetSession(options?: { reason?: string; status?: number; endpoint?: string }): Promise<void> {
  const reason = options?.reason || "unknown";
  const status = options?.status;
  const endpoint = options?.endpoint;
  
  log(`🔄 Resetting all session state... Reason: ${reason}${status ? ` (${status})` : ""}${endpoint ? ` from ${endpoint}` : ""}`);
  authTrace("resetSession:begin", { action: "logout_start" });

  // Step 1: Sign out from Better Auth (BEST-EFFORT ONLY - never blocks logout)
  log("Step 1/5: Signing out from Better Auth (best-effort)");
  try {
    await authClient.signOut();
    log("  ✓ Signed out from Better Auth");
  } catch (e) {
    log("  ⚠️ Better Auth signOut error (continuing anyway):", e);
    // Backend failure does NOT block logout - continue with local cleanup
  }

  // Step 2: Clear SecureStore tokens EXPLICITLY (ALWAYS succeeds)
  // Delete all legacy keys defensively to handle any migration scenarios
  log("Step 2/5: Clearing SecureStore tokens");

  if (Platform.OS === "web") {
    // Web: clear localStorage
    try {
      if (typeof localStorage !== "undefined") {
        LEGACY_TOKEN_KEYS.forEach(key => {
          localStorage.removeItem(key);
        });
        localStorage.removeItem(SESSION_CACHE_KEY);
        log("  ✓ Cleared web localStorage");
      }
    } catch (e) {
      log("  ⚠️ localStorage clear error (continuing anyway):", e);
    }
  } else {
    // Native: clear SecureStore explicitly - delete all legacy keys
    for (const legacyKey of LEGACY_TOKEN_KEYS) {
      try {
        await SecureStore.deleteItemAsync(legacyKey);
      } catch (e) {
        // Key may not exist - this is fine, continue
        if (__DEV__ && legacyKey !== SESSION_TOKEN_KEY) {
          log(`  ℹ️ Legacy key not found: ${legacyKey}`);
        }
      }
    }
    log("  ✓ Cleared SecureStore tokens (all legacy keys)");
  }

  // Step 3: Clear AsyncStorage session cache and onboarding state (ALWAYS succeeds)
  log("Step 3/5: Clearing AsyncStorage state");
  try {
    await AsyncStorage.multiRemove([
      SESSION_CACHE_KEY,
      "onboarding_completed",
      "onboarding_progress_v2",
      "onboarding_progress",
      "verification_deferred",
      "verification_banner_dismissed",
    ]);
    log("  ✓ Cleared AsyncStorage state");
  } catch (e) {
    log("  ⚠️ AsyncStorage clear error (continuing anyway):", e);
  }

  // Step 3b: Clear in-memory session cache
  log("Step 3b/5: Clearing in-memory session cache");
  try {
    await clearSessionCache();
    log("  ✓ Cleared in-memory session cache");
  } catch (e) {
    log("  ⚠️ Session cache clear error (continuing anyway):", e);
  }

  // Step 4: Verify token is cleared (DEV only, never throws)
  log("Step 4/5: Verifying token is cleared");
  if (__DEV__) {
    try {
      // Re-read from SecureStore to verify deletion of all legacy keys
      let secureStoreTokenExists = false;
      const legacyTokensStatus: Record<string, boolean> = {};
      
      for (const legacyKey of LEGACY_TOKEN_KEYS) {
        try {
          const verifyToken = await SecureStore.getItemAsync(legacyKey);
          const exists = !!verifyToken;
          legacyTokensStatus[legacyKey] = exists;
          if (exists) {
            secureStoreTokenExists = true;
          }
        } catch (e) {
          legacyTokensStatus[legacyKey] = false;
        }
      }

      // Re-read from AsyncStorage session cache
      let asyncStorageTokenExists = false;
      try {
        const sessionCache = await AsyncStorage.getItem(SESSION_CACHE_KEY);
        asyncStorageTokenExists = !!sessionCache;
      } catch (e) {
        asyncStorageTokenExists = false;
      }

      const stillAuthed = await hasAuthToken();
      const overallStillHasToken = secureStoreTokenExists || asyncStorageTokenExists || stillAuthed;

      authTrace("resetSession:afterDeleteVerify", {
        secureStoreTokenExists,
        asyncStorageTokenExists,
        overallStillHasToken,
        primaryKeyChecked: SESSION_TOKEN_KEY,
      });

      console.log("[Logout] hasAuthToken after reset:", stillAuthed);
      if (stillAuthed) {
        console.warn("[Logout] ⚠️ Token still exists after reset - this should not happen");
      } else {
        console.log("[Logout] ✓ Token successfully cleared");
      }
    } catch (e) {
      console.log("[Logout] Could not verify token state:", e);
    }
  }

  // Step 5: React Query cache will be cleared by caller
  log("Step 5/5: React Query cache will be cleared by caller");

  log("✅ Session reset successful");
  
  // Assert post-logout invariants in DEV mode
  if (__DEV__) {
    try {
      const tokenStillExists = await hasAuthToken();
      assertAuthInvariants("logged_out", {
        hasToken: tokenStillExists,
        tokenValid: false,
        onboardingCompleted: false,
        hasOnboardingProgress: false,
      });
    } catch (e) {
      // Assertion is diagnostic only - never throw
      console.log("[Logout] Could not assert invariants:", e);
    }
  }
  
  // NEVER throw - logout always succeeds locally
}

/**
 * Bootstrap authentication state
 *
 * This function is called once on app launch to determine the user's auth state.
 * It MUST complete within 15 seconds or the watchdog will trigger.
 */
export async function bootstrapAuth(): Promise<AuthBootstrapResult> {
  log("🚀 Starting auth bootstrap...");
  const startTime = Date.now();

  try {
    // Check if we're rate-limited
    if (isRateLimited()) {
      const remaining = getRateLimitRemaining();
      log(`⏸️ Skipping bootstrap: rate-limited for ${remaining} more seconds`);
      
      // Try to use cached session if available
      try {
        const cached = await AsyncStorage.getItem("session_cache_v1");
        if (cached) {
          const cachedSession = JSON.parse(cached);
          log("  ✓ Using cached session during rate limit");
          return { state: "authed", session: cachedSession };
        }
      } catch (e) {
        log("  ⚠️ Error loading cached session:", e);
      }
      
      // No cached session - treat as logged out but don't clear anything
      return { state: "loggedOut", session: null, error: "Rate limited" };
    }

    // Step 1: Check for existing session token
    log("Step 1/4: Checking for existing session token");
    const tokenExists = await hasAuthToken();
    log(`  Token exists: ${tokenExists}`);

    // Step 2: Validate token by calling a protected endpoint
    log("Step 2/4: Validating token with protected endpoint");
    let session: any = null;
    let sessionError: any = null;
    let tokenValid = false;
    
    if (tokenExists) {
      // Use /api/auth/session as the authoritative auth endpoint
      // This endpoint returns 401 if user is null (session.user falsy)
      try {
        // Import api locally to avoid circular dependency
        const { api } = await import('./api');
        
        log("  Calling /api/auth/session to validate auth");
        const response = await api.get<{ user: any; session: any }>('/api/auth/session');
        
        if (response && response.user) {
          log("  ✓ Authentication valid - session has user");
          tokenValid = true;
          session = response;
          sessionError = null;
        } else {
          log("  ⚠️ /api/auth/session returned no user");
          sessionError = new Error('No user in session');
          tokenValid = false;
        }
        
      } catch (error: any) {
        sessionError = error;
        const status = error?.status || error?.response?.status || 'unknown';
        log(`  ❌ /api/auth/session error (${status}):`, error.message);
        tokenValid = false;
        
        // If 401, token is invalid/expired - clear it
        if (status === 401 || error.status === 401) {
          log("  → Clearing invalid token (401 from /api/auth/session)");
          await clearAuthToken();
          await AsyncStorage.removeItem("session_cache_v1");
          authTrace("authBootstrap:token_invalid", { reason: "401_from_session_endpoint" });
          return { state: "loggedOut", session: null, error: "Invalid token (401)" };
        }
        
        // For other errors (500, network), let them fall through to unknown/retry logic below
      }
    } else {
      log("  → No token to validate");
      tokenValid = false;
    }

   // Step 3: Determine auth state based on token validation
log("Step 3/4: Determining auth state");

if (!tokenValid) {
  log("  → State: loggedOut (token validation failed)");
  const elapsed = Date.now() - startTime;
  log(`✅ Bootstrap complete in ${elapsed}ms`);
  return { state: "loggedOut", session: null };
}

// Token is valid – we're authenticated
log("  → Token valid, user is authenticated");

if (session?.user) {
  log(`  ✓ Session info available for user: ${session.user.email || session.user.id}`);
} else {
  // Session is null - check WHY it's null
  // Only reset if we got a 401 (handled above) or session fetch succeeded but user is missing
  // Do NOT reset on 404, 500, network errors - those should fall through to cached session logic
  
  if (sessionError) {
    const errorStatus = sessionError?.status || sessionError?.response?.status;
    log(`  ⚠️ Session fetch failed (${errorStatus}): ${sessionError.message}`);
    
    // Only reset on true auth errors (401/403)
    // 404, 500, network errors should NOT reset - they might be temporary
    if (errorStatus === 401 || errorStatus === 403) {
      log("  → Auth error detected, forcing logout");
      try {
        await resetSession({ reason: "auth_error", status: errorStatus, endpoint: "/api/auth/session" });
      } catch (e) {
        log("  ⚠️ Error during forced logout:", e);
      }
      
      const elapsed = Date.now() - startTime;
      log(`✅ Bootstrap complete in ${elapsed}ms (forced logout)`);
      return { state: "loggedOut", session: null, error: "Auth error" };
    } else {
      // Non-auth error (404, 500, network) - try to use cached session
      log("  → Non-auth error, attempting to use cached session");
      try {
        const cached = await AsyncStorage.getItem("session_cache_v1");
        if (cached) {
          const cachedSession = JSON.parse(cached);
          log("  ✓ Using cached session");
          session = cachedSession;
          // Continue to onboarding check below
        } else {
          log("  ⚠️ No cached session available");
          const elapsed = Date.now() - startTime;
          log(`✅ Bootstrap complete in ${elapsed}ms (no session)`);
          return { state: "loggedOut", session: null, error: sessionError.message };
        }
      } catch (e) {
        log("  ⚠️ Error loading cached session:", e);
        const elapsed = Date.now() - startTime;
        log(`✅ Bootstrap complete in ${elapsed}ms (no session)`);
        return { state: "loggedOut", session: null, error: sessionError.message };
      }
    }
  } else {
    // session is null but no error - unexpected state
    log("  ⚠️ Session is null with no error - unexpected state");
    const elapsed = Date.now() - startTime;
    log(`✅ Bootstrap complete in ${elapsed}ms (unexpected state)`);
    return { state: "loggedOut", session: null, error: "Session null without error" };
  }
}

    // Step 4: Check onboarding status and derive canonical state
    log("Step 4/4: Checking onboarding status");
    
    // Fetch backend onboarding status (source of truth)
    let backendOnboardingCompleted = false;
    try {
      const onboardingStatusResponse = await authClient.$fetch<any>(
        "/api/onboarding/status"
      );
      
      // Robust parsing: handle multiple possible response shapes
      const data = onboardingStatusResponse;
      backendOnboardingCompleted = !!(
        data?.completed ?? 
        data?.onboardingCompleted ?? 
        data?.onboarded ?? 
        data?.data?.completed
      );
      
      if (__DEV__) {
        const responseKeys = data ? Object.keys(data) : [];
        console.log(
          `[OnboardingStatus] fetched keys=[${responseKeys.join(', ')}] completed=${backendOnboardingCompleted}`
        );
      }
    } catch (error: any) {
      if (__DEV__) {
        console.log(`[OnboardingStatus] fetch failed: ${error.message}`);
      }
      // Fall back to local storage check if backend is unreachable
    }

    // Check local onboarding flags
    const onboardingCompleted = await AsyncStorage.getItem("onboarding_completed");
    const onboardingProgressV2 = await AsyncStorage.getItem("onboarding_progress_v2");
    const onboardingProgress = await AsyncStorage.getItem("onboarding_progress");

    // If backend says onboarding is complete, clear all local progress flags
    if (backendOnboardingCompleted) {
      if (__DEV__) {
        log("  ✓ Backend confirms onboarding complete; clearing local progress flags");
      }
      try {
        await AsyncStorage.multiRemove([
          "onboarding_progress_v2",
          "onboarding_progress",
        ]);
        // Ensure onboarding_completed is set
        if (onboardingCompleted !== "true") {
          await AsyncStorage.setItem("onboarding_completed", "true");
        }
      } catch (error: any) {
        if (__DEV__) {
          log("  ⚠️ Could not clear onboarding flags:", error.message);
        }
      }
    }

    // Use canonical state machine to derive auth state
    // Backend status takes precedence over local flags
    const authState = deriveAuthState({
      hasToken: tokenExists,
      tokenValid: tokenValid,
      onboardingCompleted: backendOnboardingCompleted || onboardingCompleted === "true",
      hasOnboardingProgress: backendOnboardingCompleted ? false : !!(onboardingProgressV2 || onboardingProgress),
    });

    // Assert invariants in DEV mode
    assertAuthInvariants(authState, {
      hasToken: tokenExists,
      tokenValid: tokenValid,
      onboardingCompleted: backendOnboardingCompleted || onboardingCompleted === "true",
      hasOnboardingProgress: backendOnboardingCompleted ? false : !!(onboardingProgressV2 || onboardingProgress),
    });

    // Map canonical state to legacy bootstrap state
    let bootstrapState: AuthBootstrapState;
    if (authState === "ready") {
      bootstrapState = "authed";
      log("  → State: authed (onboarding complete)");
    } else if (authState === "onboarding_incomplete") {
      bootstrapState = "onboarding";
      log("  → State: onboarding (incomplete)");
    } else {
      bootstrapState = "loggedOut";
      log("  → State: loggedOut (unexpected state)");
    }

    if (__DEV__) {
      log(`[state machine] Derived state: ${authState} → bootstrap: ${bootstrapState}`);
      log(`[onboarding gate] session: ${session ? 'exists' : 'null'}, progressV2: ${!!onboardingProgressV2}, progress: ${!!onboardingProgress}`);
    }

    const elapsed = Date.now() - startTime;
    log(`✅ Bootstrap complete in ${elapsed}ms`);
    return { state: bootstrapState, session };

  } catch (error: any) {
    log("❌ Bootstrap error:", error.message);
    const elapsed = Date.now() - startTime;
    log(`⚠️ Bootstrap failed in ${elapsed}ms`);

    // Only treat true auth errors as logout
    // For transient errors, return 'loggedOut' but preserve cached session
    if (shouldLogoutOnError(error)) {
      return {
        state: "loggedOut",
        session: null,
        error: error.message
      };
    }
    
    // For transient errors, try to use cached session if available
    try {
      const cached = await AsyncStorage.getItem("session_cache_v1");
      if (cached) {
        const cachedSession = JSON.parse(cached);
        log("  ✓ Using cached session due to transient error");
        return { state: "authed", session: cachedSession };
      }
    } catch (e) {
      log("  ⚠️ Error loading cached session:", e);
    }

    // No cached session available - treat as logged out but don't clear cache
    return {
      state: "loggedOut",
      session: null,
      error: error.message
    };
  }
}

/**
 * Bootstrap with watchdog timer (15 seconds)
 */
export async function bootstrapAuthWithWatchdog(): Promise<AuthBootstrapResult> {
  log("⏱️ Starting bootstrap with 15s watchdog...");
  // Create a watchdog timer that can be cleared when bootstrap completes.
  // Using an explicit timer id lets us avoid the case where the timeout fires
  // after bootstrap has already completed (which produced misleading logs).
  return new Promise<AuthBootstrapResult>(async (resolve) => {
    const watchdog = setTimeout(() => {
      log("⏰ Watchdog timeout triggered (15s)");
      resolve({
        state: "loggedOut",
        session: null,
        error: "Bootstrap timeout",
        timedOut: true,
      });
    }, 15000);

    try {
      const res = await bootstrapAuth();
      clearTimeout(watchdog);
      resolve(res);
    } catch (err: any) {
      clearTimeout(watchdog);
      log("❌ bootstrapAuth threw:", err);
      resolve({ state: "loggedOut", session: null, error: String(err) });
    }
  });
}
