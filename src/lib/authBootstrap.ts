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
import { authClient } from "./authClient";

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
    // Step 1: Check for existing session token
    log("Step 1/4: Checking for existing session token");
    const projectId = process.env.EXPO_PUBLIC_VIBECODE_PROJECT_ID as string;
    const tokenKey = `${projectId}.session-token`;

    let hasToken = false;
    if (Platform.OS === "web") {
      hasToken = typeof localStorage !== "undefined" && localStorage.getItem(tokenKey) !== null;
    } else {
      try {
        const token = await SecureStore.getItemAsync(tokenKey);
        hasToken = !!token;
      } catch (e) {
        log("  ⚠️ Error reading token:", e);
      }
    }
    log(`  Token exists: ${hasToken}`);

    // Step 2: Try to get session from Better Auth
    log("Step 2/4: Fetching session from Better Auth");
    let session: any = null;
    try {
      // Use a timeout to prevent hanging
      const sessionPromise = authClient.$fetch("/api/auth/get-session", {
        method: "GET",
        credentials: "include",
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Session fetch timeout")), 8000);
      });

      session = await Promise.race([sessionPromise, timeoutPromise]) as any;
      log("  ✓ Session fetched:", session && typeof session === 'object' && 'user' in session ? `user: ${(session as any).user?.email}` : "null");
    } catch (error: any) {
      log("  ⚠️ Session fetch error:", error.message);

      // If we have a token but can't fetch session, might be network issue
      // Try cached session
      if (hasToken) {
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

    if (onboardingProgressV2 || onboardingProgress) {
      log("  → State: onboarding (incomplete)");
      const elapsed = Date.now() - startTime;
      log(`✅ Bootstrap complete in ${elapsed}ms`);
      return { state: "onboarding", session };
    }

    // No onboarding flag at all - needs onboarding
    log("  → State: onboarding (no completion flag)");
    const elapsed = Date.now() - startTime;
    log(`✅ Bootstrap complete in ${elapsed}ms`);
    return { state: "onboarding", session };

  } catch (error: any) {
    log("❌ Bootstrap error:", error.message);
    const elapsed = Date.now() - startTime;
    log(`⚠️ Bootstrap failed in ${elapsed}ms`);

    // On any error, treat as logged out to prevent infinite loops
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

  const timeoutPromise = new Promise<AuthBootstrapResult>((resolve) => {
    setTimeout(() => {
      log("⏰ Watchdog timeout triggered (15s)");
      resolve({
        state: "loggedOut",
        session: null,
        error: "Bootstrap timeout",
        timedOut: true,
      });
    }, 15000);
  });

  const bootstrapPromise = bootstrapAuth();

  const result = await Promise.race([bootstrapPromise, timeoutPromise]);

  if (result.timedOut) {
    log("🚨 Bootstrap timed out - returning loggedOut state");
  }

  return result;
}
