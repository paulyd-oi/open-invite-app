/**
 * EXACT Apple Auth Post-Backend Bootstrap Logic
 *
 * This is the exact working session bootstrap logic extracted from handleAppleSignIn in welcome.tsx.
 * Email auth will call this EXACT function to match Apple's proven working flow.
 *
 * DO NOT modify this logic - it's extracted from the working Apple implementation.
 */

import { devLog, devError } from "./devLog";
import { safeGetItemAsync } from "./safeSecureStore";
import {
  setExplicitCookiePair,
  SESSION_COOKIE_KEY,
} from "./sessionCookie";
import {
  BETTER_AUTH_SESSION_COOKIE_NAME,
  isValidBetterAuthToken,
} from "./authSessionToken";
import { requestBootstrapRefreshOnce } from "@/hooks/useBootAuthority";
import { enableAuthedNetwork } from "./networkAuthGate";

const BETTER_AUTH_EXPO_COOKIE_KEY = "open-invite_cookie";

export interface AppleAuthBootstrapResult {
  success: boolean;
  error?: string;
  tokenLength?: number;
  barrierResult?: any;
}

export interface ExactAppleAuthBootstrapDeps {
  setExplicitCookieValueDirectly: (cookiePair: string) => boolean;
  setAuthToken: (token: string) => Promise<void>;
  setOiSessionToken: (token: string) => Promise<void>;
  ensureSessionReady: () => Promise<{
    ok: boolean;
    status: number | null;
    userId: string | null;
    attempt: number;
    error?: string;
  }>;
  getOiSessionTokenCached: () => string | null;
}

/**
 * The EXACT working Apple Sign-In post-backend bootstrap logic.
 * Extracted from handleAppleSignIn() in welcome.tsx (commit 5ea8f1b).
 *
 * Email auth will call this directly to ensure identical session establishment.
 *
 * @param data - Response data from auth backend
 * @param setCookieHeader - Optional Set-Cookie header from response
 * @param traceLog - Logging function (Apple auth style)
 * @param traceError - Error logging function (Apple auth style)
 * @returns AppleAuthBootstrapResult
 */
export async function runExactAppleAuthBootstrap(
  data: any,
  setCookieHeader: string | null,
  traceLog: (stage: string, data: Record<string, unknown>) => void,
  traceError: (stage: string, error: any) => void,
  deps: ExactAppleAuthBootstrapDeps
): Promise<AppleAuthBootstrapResult> {
  // FIRST LOG: Prove function entry immediately
  if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] ENTRY - function called with data keys: ${JSON.stringify(Object.keys(data || {}))}`);

  try {
    // CRITICAL: Store session cookie for React Native
    // Backend should return mobileSessionToken (preferred) or token/session.token
    // We store in SESSION_COOKIE_KEY and set module cache directly for immediate use

    let tokenValue: string | null = null;
    let tokenSource: string = "none";

    // Priority 1: mobileSessionToken (canonical Better Auth format)
    if (data.mobileSessionToken && typeof data.mobileSessionToken === 'string') {
      tokenValue = data.mobileSessionToken;
      tokenSource = "mobileSessionToken";
    }
    // Priority 2: token field
    else if (data.token && typeof data.token === 'string') {
      tokenValue = data.token;
      tokenSource = "token";
    }
    // Priority 3: session.token field
    else if (data.session?.token && typeof data.session.token === 'string') {
      tokenValue = data.session.token;
      tokenSource = "session.token";
    }
    // Priority 4: sessionToken field (alternate shape)
    else if (data.sessionToken && typeof data.sessionToken === 'string') {
      tokenValue = data.sessionToken;
      tokenSource = "sessionToken";
    }
    // Priority 5: session.sessionToken field (alternate shape)
    else if (data.session?.sessionToken && typeof data.session.sessionToken === 'string') {
      tokenValue = data.session.sessionToken;
      tokenSource = "session.sessionToken";
    }
    // Priority 6: Extract from Set-Cookie header (if accessible in RN)
    else if (setCookieHeader) {
      const sessionMatch = setCookieHeader.match(/__Secure-better-auth\.session_token=([^;]+)/);
      if (sessionMatch && sessionMatch[1]) {
        tokenValue = sessionMatch[1];
        tokenSource = "Set-Cookie";
      }
    }

    traceLog("token_extraction", {
      found: !!tokenValue,
      source: tokenSource,
      tokenLength: tokenValue?.length || 0,
      responseKeys: Object.keys(data || {}),
    });

    // PROOF LOG: Token extraction result (never log token value)
    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] tokenExtracted=${!!tokenValue} source=${tokenSource} responseKeys=${JSON.stringify(Object.keys(data || {}))}`);

    if (!tokenValue) {
      const betterAuthCookie = await safeGetItemAsync(BETTER_AUTH_EXPO_COOKIE_KEY);
      if (betterAuthCookie && betterAuthCookie !== "{}") {
        try {
          const parsedCookie = JSON.parse(betterAuthCookie);
          const storedCookie = parsedCookie?.[BETTER_AUTH_SESSION_COOKIE_NAME];
          const storedToken = typeof storedCookie === "string"
            ? storedCookie.split(";")[0].split(",")[0].trim()
            : storedCookie?.value ?? null;
          if (typeof storedToken === "string" && storedToken.trim().length > 0) {
            tokenValue = storedToken.trim();
            tokenSource = "expoSecureStore";
          }
        } catch {
          const storedMatch = betterAuthCookie.match(
            new RegExp(`${BETTER_AUTH_SESSION_COOKIE_NAME}=([^;]+)`)
          );
          if (storedMatch?.[1]) {
            tokenValue = storedMatch[1].trim();
            tokenSource = "expoSecureStoreRaw";
          }
        }
      }

      if (!tokenValue) {
        const explicitCookie = await safeGetItemAsync(SESSION_COOKIE_KEY);
        const explicitMatch = explicitCookie?.match(
          new RegExp(`${BETTER_AUTH_SESSION_COOKIE_NAME}=([^;]+)`)
        );
        if (explicitMatch?.[1]) {
          tokenValue = explicitMatch[1].trim();
          tokenSource = "explicitSessionCookie";
        }
      }

      if (tokenValue) {
        traceLog("token_recovered_from_storage", {
          source: tokenSource,
          tokenLength: tokenValue.length,
        });
        if (__DEV__) {
          devLog(
            `[EXACT_APPLE_BOOTSTRAP] tokenRecoveredFromStorage=true source=${tokenSource} tokenLength=${tokenValue.length}`
          );
        }
      }
    }

    if (!tokenValue) {
      if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] EARLY_RETURN - no token found in response with keys: ${JSON.stringify(Object.keys(data || {}))}`);
      console.log(`[EXACT_APPLE_BOOTSTRAP_FAIL] token_missing - responseKeys=${JSON.stringify(Object.keys(data || {}))}`);
      traceError("token_missing", {
        message: "No session token in response",
        responseKeys: Object.keys(data || {}),
        hasSetCookie: !!setCookieHeader,
      });
      return { success: false, error: "No session token in response" };
    }

    // CRITICAL: Validate token before storing to prevent UUID/invalid values
    const tokenValidation = isValidBetterAuthToken(tokenValue);
    if (!tokenValidation.isValid) {
      if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] EARLY_RETURN - token validation failed: ${tokenValidation.reason}`);
      console.log(`[EXACT_APPLE_BOOTSTRAP_FAIL] token_validation_failed - reason=${tokenValidation.reason} source=${tokenSource} tokenLength=${tokenValue.length}`);
      traceError("token_validation_failed", {
        reason: tokenValidation.reason,
        source: tokenSource,
        tokenLength: tokenValue.length,
      });
      return { success: false, error: `Invalid token: ${tokenValidation.reason}` };
    }

    traceLog("token_validated", { reason: tokenValidation.reason, source: tokenSource });
    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] tokenValidated=true reason=${tokenValidation.reason} tokenLength=${tokenValue.length}`);

    // Store token in SecureStore (via setExplicitCookiePair which formats as cookie pair)
    try {
      const stored = await setExplicitCookiePair(tokenValue);
      if (!stored) {
        console.log(`[EXACT_APPLE_BOOTSTRAP_FAIL] cookie_persist_rejected - setExplicitCookiePair returned false`);
        traceError("cookie_persist_rejected", { message: "setExplicitCookiePair rejected token" });
        return { success: false, error: "Failed to store session token" };
      }
      traceLog("cookie_persist_securestore", { success: true, key: "SESSION_COOKIE_KEY" });
      if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] cookiePersisted=true`);
    } catch (storeErr: any) {
      console.log(`[EXACT_APPLE_BOOTSTRAP_FAIL] cookie_persist_exception - ${storeErr?.message || 'unknown error'}`);
      traceError("cookie_persist_securestore_fail", storeErr);
      return { success: false, error: `Failed to store session token: ${storeErr.message}` };
    }

    // Set module cache directly for immediate use (no read-back delay)
    const cacheSet = deps.setExplicitCookieValueDirectly(`${BETTER_AUTH_SESSION_COOKIE_NAME}=${tokenValue}`);
    if (!cacheSet) {
      console.log(`[EXACT_APPLE_BOOTSTRAP_FAIL] cookie_cache_rejected - setExplicitCookieValueDirectly returned false`);
      traceError("cookie_cache_rejected", { message: "setExplicitCookieValueDirectly rejected token" });
      return { success: false, error: "Failed to cache session token" };
    }
    traceLog("cookie_cache_set", { success: true });
    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] cookieCached=true`);

    // Also store as legacy auth token (for any code still using token auth)
    await deps.setAuthToken(tokenValue);
    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] legacyTokenStored=true`);

    // CRITICAL: Store OI session token for header fallback (iOS cookie jar is unreliable)
    await deps.setOiSessionToken(tokenValue);
    traceLog("oi_token_stored", { tokenLength: tokenValue.length });
    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] oiTokenStored=true`);

    // TEMP DEBUG: Verify token is set in memory immediately
    const verifyToken = deps.getOiSessionTokenCached();
    traceLog("oi_token_verify", {
      immediatelyAvailable: !!verifyToken,
      lengthMatches: verifyToken?.length === tokenValue.length
    });
    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] oiTokenVerified=${!!verifyToken} lengthMatches=${verifyToken?.length === tokenValue.length}`);

    // NOTE: We deliberately do NOT call refreshExplicitCookie() here!
    // The memory cache is already set by setExplicitCookieValueDirectly.
    // Calling refreshExplicitCookie() can CLEAR the cache if SecureStore read
    // happens before the write is committed (race condition).

    // ============ SESSION BARRIER ============
    // CRITICAL: Use ensureSessionReady() to verify session works BEFORE proceeding.
    // This blocks until we have proof that x-oi-session-token is working.
    traceLog("session_barrier_start", { tokenLength: tokenValue.length });
    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] sessionBarrierStarting=true`);

    const barrierResult = await deps.ensureSessionReady();

    // Log the AUTH_BARRIER result explicitly
    if (__DEV__) devLog(`[AUTH_BARRIER_RESULT] ok=${barrierResult.ok} status=${barrierResult.status} userId=${barrierResult.userId ? barrierResult.userId.substring(0, 8) + '...' : 'null'} attempt=${barrierResult.attempt}${barrierResult.error ? ' error=' + barrierResult.error : ''}`);

    if (!barrierResult.ok) {
      console.log(`[EXACT_APPLE_BOOTSTRAP_FAIL] session_barrier_failed - status=${barrierResult.status} attempt=${barrierResult.attempt} error=${barrierResult.error || 'none'}`);
      traceError("session_barrier_fail", {
        status: barrierResult.status,
        attempt: barrierResult.attempt,
        error: barrierResult.error,
      });
      // Log clearly and return error - do NOT proceed silently
      devError("[EXACT_APPLE_BOOTSTRAP] Session barrier FAILED - cannot proceed:", barrierResult);
      return { success: false, error: `Session barrier failed: ${barrierResult.error || barrierResult.status}`, barrierResult };
    }

    // PROOF LOG with required format
    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] barrierPassed=true userId=${barrierResult.userId?.substring(0, 8)}...`);
    traceLog("session_barrier_success", { userId: barrierResult.userId?.substring(0, 8) });
    // ============ END SESSION BARRIER ============

    // [P0_ONBOARD_UPLOAD] Re-enable authed network IMMEDIATELY after session is proven.
    // After a prior logout, the gate is disabled. The bootstrap re-run (below) will
    // eventually set bootStatus = 'onboarding' which also enables the gate, but there
    // is a race window between requestBootstrapRefreshOnce() and the user picking a
    // photo. Enabling here closes that window.
    enableAuthedNetwork();

    // CRITICAL: Request bootstrap refresh so bootStatus updates from loggedOut → onboarding/authed
    // Without this, BootRouter may redirect to /login because bootStatus is stale
    requestBootstrapRefreshOnce();
    traceLog("bootstrap_refresh_requested", { success: true });
    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] bootstrapRefreshRequested=true`);

    if (__DEV__) devLog(`[EXACT_APPLE_BOOTSTRAP] SUCCESS - all steps completed`);
    return { success: true, tokenLength: tokenValue.length, barrierResult };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(`[EXACT_APPLE_BOOTSTRAP_FAIL] unexpected_exception - ${message}`);
    devError("[EXACT_APPLE_BOOTSTRAP] UNEXPECTED ERROR:", message);
    return { success: false, error: message };
  }
}
