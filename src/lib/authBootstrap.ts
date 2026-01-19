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
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { authClient, hasAuthToken } from "./authClient";
import { getSessionCached } from "./sessionCache";
import { isNetworkError, shouldLogoutOnError, isRateLimitError } from "./networkStatus";
import { isRateLimited, getRateLimitRemaining, setRateLimited, clearRateLimit } from "./rateLimitState";

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
 */
export async function resetSession(): Promise<void> {
  log("🔄 Resetting all session state...");

  try {
    // Step 1: Sign out from Better Auth FIRST (best-effort, catch errors)
    log("Step 1/5: Signing out from Better Auth");
    try {
      await authClient.signOut();
      log("  ✓ Signed out from Better Auth");
    } catch (e) {
      log("  ⚠️ Better Auth signOut error (continuing anyway):", e);
      // Continue even if signOut fails (e.g., offline, server error)
    }

    // Step 2: Clear SecureStore tokens (Better Auth tokens)
    log("Step 2/5: Clearing SecureStore tokens");
    const projectId = process.env.EXPO_PUBLIC_VIBECODE_PROJECT_ID as string;
    const tokenKey = `${projectId}.session-token`;

    if (Platform.OS === "web") {
      // Web: clear localStorage
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem("session_cache_v1");
        log("  ✓ Cleared web localStorage");
      }
    } else {
      // Native: clear SecureStore
      try {
        await SecureStore.deleteItemAsync(tokenKey);
        log("  ✓ Cleared SecureStore token");
      } catch (e) {
        log("  ⚠️ SecureStore clear error (may not exist):", e);
      }
    }

    // Step 3: Clear AsyncStorage session cache and onboarding state
    log("Step 3/5: Clearing AsyncStorage state");
    await AsyncStorage.multiRemove([
      "session_cache_v1",
      "onboarding_completed",
      "onboarding_progress_v2",
      "onboarding_progress",
      "verification_deferred",
      "verification_banner_dismissed",
    ]);
    log("  ✓ Cleared AsyncStorage state");

    // Step 4: React Query cache will be cleared by the app when needed
    log("Step 4/5: React Query cache will be cleared by caller");

    // Step 5: Session reset complete
    log("Step 5/5: Session reset complete");

    log("✅ Session reset successful");
  } catch (error) {
    log("❌ Error during session reset:", error);
    // Continue anyway - best effort reset
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

    // Step 2: Try to get session from Better Auth with rate-limit aware retry
    log("Step 2/4: Fetching session from Better Auth");
    let session: any = null;
    let sessionError: any = null;
    
    // Use cached session implementation to prevent request storms
    try {
      session = await getSessionCached();
      log("  ✓ Session fetched:", session && typeof session === 'object' && 'user' in session ? `user: ${(session as any).user?.email}` : "null");
      sessionError = null;
      
    } catch (error: any) {
      sessionError = error;
      log(`  ⚠️ Session fetch error:`, error.message);
      
      // getSessionCached handles 429 gracefully by returning cached session
      // Only treat as real error if it's not a rate limit
      if (!isRateLimitError(error) && error?.status !== 429) {
        const status = error?.status || error?.response?.status;
        
        // Check if this is a 404 (endpoint doesn't exist on backend)
        if (status === 404) {
          if (__DEV__) {
            log(`  ℹ️ 404 - session endpoint not implemented on backend, treating as no session`);
          }
        }
        
        // If it's an auth error (401/403), getSessionCached already handled clearing cache
        if (shouldLogoutOnError(error)) {
          if (__DEV__) {
            log(`  ❌ Auth error detected (${status}), session cleared by cache`);
          }
        }
      }
    }
    
    // If session fetch failed but we have a token, try cached session
    if (!session && sessionError && tokenExists) {
      log("  Attempting to load cached session...");
      try {
        const cached = await AsyncStorage.getItem("session_cache_v1");
        if (cached) {
          session = JSON.parse(cached);
          log("  ✓ Loaded cached session");
        }
      } catch (e) {
        log("  ⚠️ Error loading cached session:", e);
      }
    }

    // Step 3: Determine auth state based on session
    log("Step 3/4: Determining auth state");
    if (!session || !session.user?.id) {
      log("  → State: loggedOut (no valid session)");
      const elapsed = Date.now() - startTime;
      log(`✅ Bootstrap complete in ${elapsed}ms`);
      return { state: "loggedOut", session: null };
    }

    // We have a valid session - check onboarding status
    log(`  Valid session for user: ${session.user.email || session.user.id}`);

    // Step 4: Check onboarding completion
    log("Step 4/4: Checking onboarding status");
    const onboardingCompleted = await AsyncStorage.getItem("onboarding_completed");

    if (onboardingCompleted === "true") {
      log("  → State: authed (onboarding complete)");
      const elapsed = Date.now() - startTime;
      log(`✅ Bootstrap complete in ${elapsed}ms`);
      return { state: "authed", session };
    }

    // Check for in-progress onboarding
    const onboardingProgressV2 = await AsyncStorage.getItem("onboarding_progress_v2");
    const onboardingProgress = await AsyncStorage.getItem("onboarding_progress");

    if (__DEV__) {
      log(`[onboarding gate] session: ${session ? 'exists' : 'null'}, progressV2: ${!!onboardingProgressV2}, progress: ${!!onboardingProgress}`);
    }

    if (onboardingProgressV2 || onboardingProgress) {
      log("  → State: onboarding (incomplete)");
      const elapsed = Date.now() - startTime;
      log(`✅ Bootstrap complete in ${elapsed}ms`);
      return { state: "onboarding", session };
    }

    // No onboarding flag at all - needs onboarding
    if (__DEV__) {
      log("[onboarding gate] redirecting to welcome because no completion flags found");
    }
    log("  → State: onboarding (no completion flag)");
    const elapsed = Date.now() - startTime;
    log(`✅ Bootstrap complete in ${elapsed}ms`);
    return { state: "onboarding", session };

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
