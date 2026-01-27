/**
 * Auth Bootstrap
 *
 * Deterministic authentication bootstrap that always ends in one of:
 * - loggedOut (BootRouter redirects to /login)
 * - onboarding (BootRouter redirects to /welcome)
 * - authed (BootRouter redirects to / or stays on current screen)
 *
 * Features:
 * - Comprehensive logging at each step
 * - Error handling with no infinite loops
 * - 15s watchdog timer
 * - Transient errors (429, 5xx, network) use cached session when available
 * - Auth errors (401, 403) trigger forced logout
 * - Canonical state machine via authState.ts
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { authClient, hasAuthToken, clearAuthToken, ensureCookieInitialized } from "./authClient";
import { getSessionCached, clearSessionCache } from "./sessionCache";
import { clearSessionCookie, SESSION_COOKIE_KEY } from "./sessionCookie";
import { isNetworkError, shouldLogoutOnError, isRateLimitError } from "./networkStatus";
import { isRateLimited, getRateLimitRemaining, setRateLimited, clearRateLimit } from "./rateLimitState";
import { deriveAuthState, assertAuthInvariants, type AuthState } from "./authState";
import { SESSION_TOKEN_KEY, LEGACY_TOKEN_KEYS, SESSION_CACHE_KEY } from "./authKeys";
import { consumeLogoutIntent } from "./logoutIntent";

/**
 * DEV-only trace helper for auth token flow tracing.
 * Never logs token content - only booleans, keys, and function names.
 */
function authTrace(event: string, data: Record<string, boolean | string | number>): void {
  if (!__DEV__) return;
  console.log(`[AUTH_TRACE] ${event}`, data);
}

// Bootstrap states
export type AuthBootstrapState = "loggedOut" | "onboarding" | "authed" | "degraded";

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
 * In-flight logout guard to prevent multiple simultaneous logout sequences.
 * Multiple 401/403 errors can trigger concurrent resetSession calls.
 */
let logoutInFlight = false;

/**
 * Reset all session state (for logout and watchdog)
 * 
 * CRITICAL: This function NEVER throws - logout always succeeds locally
 * even if backend is down, offline, or returns 500.
 * 
 * GUARD: Only one logout sequence runs at a time (in-flight guard).
 */
export async function resetSession(options?: { reason?: string; status?: number; endpoint?: string }): Promise<void> {
  const reason = options?.reason || "unknown";
  const status = options?.status;
  const endpoint = options?.endpoint;
  
  // DEV guardrail: if we ever reset without an explicit reason, print a stack trace.
  if (__DEV__ && reason === "unknown") {
    console.warn("[resetSession] CALLED WITHOUT REASON — add reason+endpoint at callsite");
    console.trace("[resetSession] stack");
  }

  // Capture token state BEFORE clearing for logging
  const tokenExistedBeforeReset = await hasAuthToken();
  
  // POLICY: Only clear tokens on true auth failures or explicit user actions
  // Auth errors (401/403) trigger hard reset. Other errors are logged but tokens remain.
  const isUserInitiated = reason === "user_logout" || reason === "account_deletion";
  const isAuthCleanup = reason === "auth_cleanup"; // Login screen cleanup - no intent required
  const isAuthFailure = reason === "auth_error" && (status === 401 || status === 403);
  const shouldClearTokens = isUserInitiated || isAuthCleanup || isAuthFailure;
  
  if (!shouldClearTokens) {
    // Non-auth error (404, 500, network, etc.) - log warning but DO NOT clear tokens
    console.warn(
      `[AUTH_WARN] Skipping token clear - non-auth error: reason=${reason} status=${status || 'N/A'} endpoint=${endpoint || 'N/A'} tokenExists=${tokenExistedBeforeReset}`
    );
    log(`⚠️ Non-auth error detected - tokens NOT cleared. Reason: ${reason}, Status: ${status || 'N/A'}`);
    return; // Early exit - no token clearing
  }
  
  // IN-FLIGHT GUARD: Prevent concurrent logout sequences
  if (logoutInFlight) {
    log(`⏭️ Logout already in progress - skipping duplicate resetSession call (reason=${reason})`);
    return;
  }
  
  logoutInFlight = true;
  
  try {
  
  // LOGOUT INTENT GATE: For user-initiated logouts, require explicit intent flag
  if (isUserInitiated) {
    const hasIntent = consumeLogoutIntent();
    if (!hasIntent) {
      // User logout WITHOUT intent flag - this is suspicious (possible automatic trigger)
      console.error(
        `[HARD_RESET_BLOCKED] reason=${reason} endpoint=${endpoint || 'N/A'} tokenExists=${tokenExistedBeforeReset} - Missing logout intent flag!`
      );
      log(`🚫 BLOCKED: User logout called without intent flag. This should only happen from explicit user action.`);
      
      // Perform soft reset only (clear caches but preserve token)
      log(`Performing soft reset: clearing session cache and query cache only`);
      try {
        await clearSessionCache();
        await AsyncStorage.removeItem(SESSION_CACHE_KEY);
      } catch (e) {
        log("  ⚠️ Error during soft reset:", e);
      }
      
      return; // Early exit - no token clearing
    }
  }
  
  // Log HARD_RESET with full context (only when actually clearing tokens)
  console.log(
    `[HARD_RESET] reason=${reason} status=${status || 'N/A'} endpoint=${endpoint || 'N/A'} tokenExists=${tokenExistedBeforeReset}`
  );
  
  log(`🔄 Resetting all session state... Reason: ${reason}${status ? ` (${status})` : ""}${endpoint ? ` from ${endpoint}` : ""}`);
  authTrace("resetSession:begin", { action: "logout_start" });

  // Step 1: Sign out from Better Auth (BEST-EFFORT ONLY - never blocks logout)
  log("Step 1/5: Signing out from Better Auth (best-effort)");
  try {
    const result = await authClient.signOut();
    if (result.ok) {
      log("  ✓ Signed out from Better Auth");
    } else {
      const errorStatus = (result.error as any)?.status || 'unknown';
      log(`  ⚠️ [SignOut] non-2xx status=${errorStatus} (continuing with local signout)`);
    }
  } catch (e: any) {
    const errorStatus = e?.status || 'unknown';
    log(`  ⚠️ [SignOut] error status=${errorStatus} (continuing with local signout):`, e);
    // Backend failure does NOT block logout - continue with local cleanup
  }

  // Step 2: Clear SecureStore tokens EXPLICITLY (ALWAYS succeeds)
  // Delete all legacy keys defensively to handle any migration scenarios
  log("Step 2/5: Clearing SecureStore tokens");

  // Enumerate all known auth storage keys for consolidated deletion and verification
  const SECURESTORE_AUTH_KEYS = [
    ...LEGACY_TOKEN_KEYS,                    // open-invite.session-token, undefined.session-token, etc.
    "open-invite_cookie",                    // Better Auth cookie storage
    "open-invite_session",                   // Better Auth session storage
    SESSION_COOKIE_KEY,                      // open-invite_session_cookie (explicit cookie storage)
  ];
  
  const ASYNCSTORAGE_AUTH_KEYS = [
    SESSION_CACHE_KEY,                       // session_cache_v1
    "onboarding_completed",
    "onboarding_progress_v2",
    "onboarding_progress",
    "verification_deferred",
    "verification_banner_dismissed",
  ];

  // Track deletion results for invariant log
  const deletionResults: Record<string, boolean> = {};

  if (Platform.OS === "web") {
    // Web: clear localStorage
    try {
      if (typeof localStorage !== "undefined") {
        SECURESTORE_AUTH_KEYS.forEach(key => {
          try {
            localStorage.removeItem(key);
            deletionResults[`ls:${key}`] = true;
          } catch {
            deletionResults[`ls:${key}`] = false;
          }
        });
        ASYNCSTORAGE_AUTH_KEYS.forEach(key => {
          try {
            localStorage.removeItem(key);
            deletionResults[`ls:${key}`] = true;
          } catch {
            deletionResults[`ls:${key}`] = false;
          }
        });
      }
    } catch (e) {
      log("  ⚠️ localStorage clear error (continuing anyway):", e);
    }
  } else {
    // Native: clear SecureStore explicitly - delete all auth keys
    for (const key of SECURESTORE_AUTH_KEYS) {
      try {
        await SecureStore.deleteItemAsync(key);
        deletionResults[`ss:${key}`] = true;
      } catch (e) {
        deletionResults[`ss:${key}`] = false;
        // Key may not exist - this is fine, continue
      }
    }
  }

  // Step 3: Clear AsyncStorage session cache and onboarding state (ALWAYS succeeds)
  log("Step 3/5: Clearing AsyncStorage state");
  try {
    await AsyncStorage.multiRemove(ASYNCSTORAGE_AUTH_KEYS);
    ASYNCSTORAGE_AUTH_KEYS.forEach(key => {
      deletionResults[`as:${key}`] = true;
    });
  } catch (e) {
    ASYNCSTORAGE_AUTH_KEYS.forEach(key => {
      deletionResults[`as:${key}`] = false;
    });
    log("  ⚠️ AsyncStorage clear error (continuing anyway):", e);
  }

  // Step 3b: Clear in-memory session cache + explicit cookie cache
  log("Step 3b/5: Clearing in-memory caches");
  try {
    await clearSessionCache();
    deletionResults["mem:sessionCache"] = true;
  } catch (e) {
    deletionResults["mem:sessionCache"] = false;
    log("  ⚠️ Session cache clear error (continuing anyway):", e);
  }

  // Step 4: Verify and emit consolidated LOGOUT_INVARIANT log
  log("Step 4/5: Verifying deletion and emitting invariant log");
  
  // Verify key SecureStore keys are actually cleared
  const verifyResults: Record<string, boolean> = {};
  if (Platform.OS !== "web") {
    for (const key of SECURESTORE_AUTH_KEYS) {
      try {
        const value = await SecureStore.getItemAsync(key);
        verifyResults[key] = !value; // true = cleared successfully
      } catch {
        verifyResults[key] = true; // error reading = likely cleared
      }
    }
  }
  
  const stillAuthed = await hasAuthToken();
  
  // Emit ONE consolidated invariant log line
  console.log("[LOGOUT_INVARIANT]", JSON.stringify({
    keysDeleted: Object.keys(deletionResults).filter(k => deletionResults[k]),
    keysFailed: Object.keys(deletionResults).filter(k => !deletionResults[k]),
    verifyCleared: Object.keys(verifyResults).filter(k => verifyResults[k]),
    verifyRemaining: Object.keys(verifyResults).filter(k => !verifyResults[k]),
    explicitCookieCacheCleared: true, // Always true after clearSessionCache
    hasAuthTokenAfter: stillAuthed,
    success: !stillAuthed,
  }));

  // Step 5: React Query cache will be cleared by caller
  log("Step 5/5: React Query cache will be cleared by caller");

  log("✅ Session reset successful");
  
  // NEVER throw - logout always succeeds locally
  } finally {
    // Clear in-flight flag so future logouts can proceed
    logoutInFlight = false;
  }
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
    // CRITICAL: Ensure cookie cache is initialized from SecureStore BEFORE any API calls.
    // This fixes the force-close logout bug where cookie wasn't loaded before session check.
    log("Step 0/4: Ensuring cookie cache is initialized from SecureStore...");
    await ensureCookieInitialized();
    log("  ✓ Cookie cache ready");
    
    // Check if we're rate-limited
    if (isRateLimited()) {
      const remaining = getRateLimitRemaining();
      log(`⏸️ Skipping bootstrap: rate-limited for ${remaining} more seconds`);
      
      // Try to use cached session if available
      try {
        const cached = await AsyncStorage.getItem(SESSION_CACHE_KEY);
        if (cached) {
          const cachedSession = JSON.parse(cached);
          log("  ✓ Using cached session during rate limit");
          return { state: "authed", session: cachedSession };
        }
      } catch (e) {
        log("  ⚠️ Error loading cached session:", e);
      }
      
      // No cached session during rate limit - return degraded
      log("  → Rate limited with no cache - returning degraded");
      return { state: "degraded", session: null, error: "Rate limited" };
    }

    // Step 1: Fetch session from /api/auth/session (cookie auth via Better Auth expoClient)
    // NOTE: With cookie auth, we don't gate on SecureStore token existence.
    // The expoClient plugin attaches cookies automatically.
    log("Step 1/4: Fetching session from /api/auth/session (cookie auth)");
    let session: any = null;
    let sessionError: any = null;
    let hasValidSession = false;
    
    try {
      log("  Calling /api/auth/session with 3s timeout");
      
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const err: any = new Error('Request timeout');
          err.isTimeout = true;
          reject(err);
        }, 3000);
      });
      
      // Race between API call and timeout
      const response = await Promise.race([
        authClient.$fetch<any>('/api/auth/session'),
        timeoutPromise
      ]);
      
      // Check if response has a valid user
      const hasUserId = !!(response?.user?.id);
      
      if (__DEV__) {
        console.log(`[AuthBootstrap] /api/auth/session response: hasUserId=${hasUserId}`);
      }
      
      if (hasUserId) {
        // Valid session with user - authenticated
        log("  ✓ Session valid (user.id present)");
        hasValidSession = true;
        session = response;
        sessionError = null;
      } else {
        // Response OK but no user - not authenticated
        log("  → Session response OK but no user.id - not authenticated");
        hasValidSession = false;
        session = null;
      }
        
    } catch (error: any) {
      sessionError = error;
      const status = error?.status || error?.response?.status;
      const isTimeout = error?.isTimeout === true;
      
      if (isTimeout) {
        log("  ⏱️ /api/auth/session timeout (3s)");
      } else {
        log(`  ❌ /api/auth/session error (${status || 'unknown'}):`, error.message);
      }
      
      hasValidSession = false;
      
      // STATUS-CODE BASED DECISION:
      // 401/403 = not authenticated → return loggedOut (no need to reset, just not authed)
      if (status === 401 || status === 403) {
        log(`  → Not authenticated (${status}) - returning loggedOut`);
        authTrace("authBootstrap:not_authenticated", { status });
        return { state: "loggedOut", session: null };
      }
      
      // Network error or timeout → return degraded (try cached session)
      if (isTimeout || isNetworkError(error)) {
        log("  → Network/timeout error - attempting cached session");
        try {
          const cached = await AsyncStorage.getItem(SESSION_CACHE_KEY);
          if (cached) {
            const cachedSession = JSON.parse(cached);
            // Use effectiveUserId for unified auth check
            const effectiveUserId = cachedSession?.effectiveUserId ?? cachedSession?.user?.id ?? null;
            if (effectiveUserId) {
              log(`    ✓ Using cached session (effectiveUserId: ${effectiveUserId})`);
              hasValidSession = true;
              session = cachedSession;
            } else {
              log("    → Cached session has no effectiveUserId - returning degraded");
              return { state: "degraded", session: null, error: "Network timeout or unreachable" };
            }
          } else {
            log("    → No cache - returning degraded");
            return { state: "degraded", session: null, error: "Network timeout or unreachable" };
          }
        } catch (e) {
          log("    ⚠️ Cache read error - returning degraded:", e);
          return { state: "degraded", session: null, error: "Cache error" };
        }
      }
      
      // 429/5xx → transient error, try cached session
      if (status === 429 || (status >= 500 && status < 600)) {
        log(`  → Transient error (${status}) - attempting cached session`);
        try {
          const cached = await AsyncStorage.getItem(SESSION_CACHE_KEY);
          if (cached) {
            const cachedSession = JSON.parse(cached);
            // Use effectiveUserId for unified auth check
            const effectiveUserId = cachedSession?.effectiveUserId ?? cachedSession?.user?.id ?? null;
            if (effectiveUserId) {
              log(`    ✓ Using cached session (effectiveUserId: ${effectiveUserId})`);
              hasValidSession = true;
              session = cachedSession;
            } else {
              log("    → Cached session has no effectiveUserId - returning degraded");
              return { state: "degraded", session: null, error: `Transient error (${status})` };
            }
          } else {
            log("    → No cache - returning degraded");
            return { state: "degraded", session: null, error: `Transient error (${status})` };
          }
        } catch (e) {
          log("    ⚠️ Cache read error:", e);
          return { state: "degraded", session: null, error: "Cache error" };
        }
      }
      
      // Unknown error (non-401/403, non-network) - attempt cached session, return degraded
      // This prevents false logouts on transient/unknown errors
      log("  → Unknown error - attempting cached session before degraded");
      try {
        const cached = await AsyncStorage.getItem(SESSION_CACHE_KEY);
        if (cached) {
          const cachedSession = JSON.parse(cached);
          const effectiveUserId = cachedSession?.effectiveUserId ?? cachedSession?.user?.id ?? null;
          if (effectiveUserId) {
            log(`    ✓ Using cached session (effectiveUserId: ${effectiveUserId}) - returning degraded`);
            hasValidSession = true;
            session = cachedSession;
            // Fall through to continue with cached session
          } else {
            log("    → Cached session has no effectiveUserId - returning degraded");
            return { state: "degraded", session: null, error: error.message ?? "Unknown error" };
          }
        } else {
          log("    → No cached session - returning degraded (not loggedOut)");
          return { state: "degraded", session: null, error: error.message ?? "Unknown error" };
        }
      } catch (e) {
        log("    ⚠️ Cache read error - returning degraded:", e);
        return { state: "degraded", session: null, error: "Cache error" };
      }
    }

    // Step 2: Determine auth state based on session validation
    log("Step 2/4: Determining auth state");

    if (!hasValidSession) {
      log("  → State: loggedOut (no valid session)");
      const elapsed = Date.now() - startTime;
      log(`✅ Bootstrap complete in ${elapsed}ms`);
      return { state: "loggedOut", session: null };
    }

    // Session is valid – we're authenticated
    log("  → Session valid, user is authenticated");
    log("  ✓ Session info available (user present)");


    // DEV-only: Call auth-snapshot endpoint to log auth header state
    if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_AUTH_SNAPSHOT === "1") {
      try {
        log("[DEBUG] Calling /api/_debug/auth-snapshot");
        const snapshotResponse = await authClient.$fetch<any>(
          "/api/_debug/auth-snapshot",
          { method: "GET" }
        );
        
        if (snapshotResponse) {
          const { hasAuthorizationHeader, authorizationScheme, hasCookieHeader, requestId, timestamp } = snapshotResponse;
          console.log(
            `[AUTH_SNAPSHOT] hasAuth=${hasAuthorizationHeader} scheme=${authorizationScheme} hasCookie=${hasCookieHeader} requestId=${requestId} xRequestId=${snapshotResponse.xRequestId || 'N/A'}`
          );
        }
      } catch (err: any) {
        // Non-fatal: log but don't block bootstrap
        const status = err?.status || 'unknown';
        if (__DEV__) {
          log(`[DEBUG] auth-snapshot call failed (${status}): ${err?.message}`);
        }
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
    // NOTE: With cookie auth, hasToken/tokenValid are based on session.user.id existence
    const authState = deriveAuthState({
      hasToken: hasValidSession, // session.user.id is our "token" for state machine
      tokenValid: hasValidSession,
      onboardingCompleted: backendOnboardingCompleted || onboardingCompleted === "true",
      hasOnboardingProgress: backendOnboardingCompleted ? false : !!(onboardingProgressV2 || onboardingProgress),
    });

    // Assert invariants in DEV mode
    assertAuthInvariants(authState, {
      hasToken: hasValidSession,
      tokenValid: hasValidSession,
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
      const cached = await AsyncStorage.getItem(SESSION_CACHE_KEY);
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
