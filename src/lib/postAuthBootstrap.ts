/**
 * Shared Post-Auth Bootstrap Helper
 *
 * This is the exact working session bootstrap flow extracted from Apple Sign-In.
 * Used by both Apple Sign-In and email authentication to ensure identical session establishment.
 *
 * SSOT for post-authentication session bootstrap across all auth methods.
 */

import { devLog, devError } from "./devLog";
import {
  setExplicitCookiePair,
  setExplicitCookieValueDirectly,
  setAuthToken,
  setOiSessionToken,
  ensureSessionReady,
  isValidBetterAuthToken,
  type SessionReadyResult,
} from "./authClient";
import { requestBootstrapRefreshOnce } from "@/hooks/useBootAuthority";

export interface PostAuthBootstrapResult {
  ok: boolean;
  success: boolean;
  error?: string;
  sessionReady?: SessionReadyResult;
}

/**
 * Extract session token from auth response using Apple's exact priority logic.
 * Handles multiple possible response shapes from different auth endpoints.
 */
function extractSessionTokenFromResponse(data: any, setCookieHeader?: string | null): { tokenValue: string | null; tokenSource: string } {
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

  return { tokenValue, tokenSource };
}

/**
 * Shared post-authentication bootstrap function.
 *
 * Performs the exact same session establishment flow that Apple Sign-In uses:
 * 1. Extract session token from response using priority logic
 * 2. Validate token format before storing
 * 3. Store token via setExplicitCookiePair (SecureStore)
 * 4. Set immediate cache via setExplicitCookieValueDirectly
 * 5. Store legacy auth token via setAuthToken
 * 6. Store OI session token for header fallback via setOiSessionToken
 * 7. Verify session works via ensureSessionReady (session barrier)
 * 8. Request bootstrap refresh via requestBootstrapRefreshOnce
 *
 * @param authResponseData - The response data from auth endpoint
 * @param authPrefix - Prefix for logging (e.g., "🍎 [Apple Auth]", "🔐 [Email Auth]")
 * @param setCookieHeader - Optional Set-Cookie header from response
 * @returns PostAuthBootstrapResult indicating success/failure
 */
export async function bootstrapPostAuthSession(
  authResponseData: any,
  authPrefix: string = "🔐 [Auth]",
  setCookieHeader?: string | null
): Promise<PostAuthBootstrapResult> {
  try {
    devLog(`${authPrefix} Starting post-auth bootstrap...`);

    // Step 1: Extract session token using Apple's exact priority logic
    const { tokenValue, tokenSource } = extractSessionTokenFromResponse(authResponseData, setCookieHeader);

    devLog(`${authPrefix} Token extraction: found=${!!tokenValue} source=${tokenSource}`);

    if (!tokenValue) {
      const error = "No session token found in auth response";
      devError(`${authPrefix} ${error}`);
      return { ok: false, success: false, error };
    }

    // Step 2: Validate token before storing (prevents UUID/invalid values)
    const tokenValidation = isValidBetterAuthToken(tokenValue);
    if (!tokenValidation.isValid) {
      const error = `Invalid session token: ${tokenValidation.reason}`;
      devError(`${authPrefix} ${error}`);
      return { ok: false, success: false, error };
    }

    devLog(`${authPrefix} Token validated: ${tokenValidation.reason}`);

    // Step 3: Store token in SecureStore (via setExplicitCookiePair which formats as cookie pair)
    try {
      const stored = await setExplicitCookiePair(tokenValue);
      if (!stored) {
        throw new Error("setExplicitCookiePair rejected token");
      }
      devLog(`${authPrefix} Token stored in SecureStore`);
    } catch (storeErr: any) {
      const error = `Failed to store session token: ${storeErr.message}`;
      devError(`${authPrefix} ${error}`);
      return { ok: false, success: false, error };
    }

    // Step 4: Set module cache directly for immediate use (no read-back delay)
    const cacheSet = setExplicitCookieValueDirectly(`__Secure-better-auth.session_token=${tokenValue}`);
    if (!cacheSet) {
      const error = "Failed to cache session token";
      devError(`${authPrefix} ${error}`);
      return { ok: false, success: false, error };
    }
    devLog(`${authPrefix} Token cached in memory`);

    // Step 5: Store as legacy auth token (for any code still using token auth)
    await setAuthToken(tokenValue);
    devLog(`${authPrefix} Legacy auth token stored`);

    // Step 6: Store OI session token for header fallback (iOS cookie jar is unreliable)
    await setOiSessionToken(tokenValue);
    devLog(`${authPrefix} OI session token stored for header fallback`);

    // Step 7: Session barrier - verify session works BEFORE proceeding
    devLog(`${authPrefix} Starting session barrier verification...`);
    const barrierResult = await ensureSessionReady();

    if (__DEV__) {
      devLog(`[AUTH_BARRIER_RESULT] ok=${barrierResult.ok} status=${barrierResult.status} userId=${barrierResult.userId ? barrierResult.userId.substring(0, 8) + '...' : 'null'} attempt=${barrierResult.attempt}${barrierResult.error ? ' error=' + barrierResult.error : ''}`);
    }

    if (!barrierResult.ok) {
      const error = `Session barrier failed: ${barrierResult.error || `status ${barrierResult.status}`}`;
      devError(`${authPrefix} ${error}`);
      return { ok: false, success: false, error, sessionReady: barrierResult };
    }

    devLog(`${authPrefix} Session barrier passed: userId=${barrierResult.userId?.substring(0, 8)}...`);

    // Step 8: Request bootstrap refresh so bootStatus updates from loggedOut → onboarding/authed
    // This is CRITICAL and was missing from email auth - without this, BootRouter may redirect to /login
    requestBootstrapRefreshOnce();
    devLog(`${authPrefix} Bootstrap refresh requested`);

    devLog(`${authPrefix} Post-auth bootstrap completed successfully`);
    return { ok: true, success: true, sessionReady: barrierResult };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    devError(`${authPrefix} Post-auth bootstrap failed: ${message}`);
    return { ok: false, success: false, error: message };
  }
}