/**
 * Session Cookie Storage Utility
 *
 * Explicit storage and retrieval of the Better Auth session cookie.
 * React Native doesn't support cookies natively, so we must manually
 * store the cookie and attach it to every authenticated request.
 *
 * SecureStore key: "open-invite_session_cookie"
 * Value format: "__Secure-better-auth.session_token=<VALUE>"
 */

import { safeGetItemAsync, safeSetItemAsync, safeDeleteItemAsync } from "./safeSecureStore";
import { devLog } from "./devLog";
import {
  BETTER_AUTH_SESSION_COOKIE_NAME,
  isValidBetterAuthToken,
} from "./authSessionToken";

// Storage key for the session cookie
export const SESSION_COOKIE_KEY = "open-invite_session_cookie";

// Cookie name used by Better Auth
const COOKIE_NAME = BETTER_AUTH_SESSION_COOKIE_NAME;

/**
 * Get the stored session cookie pair
 * @returns The full cookie string or null if not set
 */
export async function getSessionCookie(): Promise<string | null> {
  const cookie = await safeGetItemAsync(SESSION_COOKIE_KEY);
  return cookie || null;
}

/**
 * Set the session cookie from a raw cookie value
 * @param cookieValue The cookie value (with or without the cookie name prefix)
 */
export async function setSessionCookie(cookieValue: string): Promise<void> {
  // Normalize: ensure we store the full cookie pair format
  let fullCookie = cookieValue;
  if (!cookieValue.startsWith(COOKIE_NAME)) {
    fullCookie = `${COOKIE_NAME}=${cookieValue}`;
  }
  
  const success = await safeSetItemAsync(SESSION_COOKIE_KEY, fullCookie);
  
  if (__DEV__ && success) {
    devLog("[sessionCookie] Cookie stored successfully");
  }
  // No throw - safe wrapper handles errors gracefully
}

/**
 * Set the session cookie from a Set-Cookie header value
 * @param setCookieHeader The Set-Cookie header value
 */
export async function setSessionCookieFromHeader(setCookieHeader: string): Promise<void> {
  try {
    // Parse the Set-Cookie header to extract the cookie value
    // Format: "__Secure-better-auth.session_token=value; Path=/; HttpOnly; ..."
    const match = setCookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (match && match[1]) {
      await setSessionCookie(`${COOKIE_NAME}=${match[1]}`);
    } else if (__DEV__) {
      devLog("[sessionCookie] Could not parse Set-Cookie header:", setCookieHeader.substring(0, 50));
    }
  } catch (error) {
    if (__DEV__) {
      devLog("[sessionCookie] Error parsing Set-Cookie header:", error);
    }
  }
}

/**
 * Clear the stored session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  const success = await safeDeleteItemAsync(SESSION_COOKIE_KEY);
  if (__DEV__ && success) {
    devLog("[sessionCookie] Cookie cleared");
  }
  // Safe wrapper handles errors gracefully - clearing always "succeeds" logically
}

/**
 * Check if a session cookie exists
 */
export async function hasSessionCookie(): Promise<boolean> {
  const cookie = await getSessionCookie();
  return !!cookie;
}

/**
 * Extract session token value from stored cookie
 * @returns Just the token value, or null
 */
export async function getSessionTokenValue(): Promise<string | null> {
  const cookie = await getSessionCookie();
  if (!cookie) return null;
  
  // Extract value after "="
  const match = cookie.match(/=(.+)$/);
  return match ? match[1] : null;
}

/**
 * Set explicit cookie pair from backend-provided mobileSessionToken.
 * This is the preferred method for storing the session token deterministically.
 * CRITICAL: Validates token before storing to prevent UUID/invalid values.
 * @param tokenValue The raw session token value from backend's mobileSessionToken field
 * @returns Promise<boolean> - true if stored, false if validation failed
 */
export async function setExplicitCookiePair(tokenValue: string): Promise<boolean> {
  if (!tokenValue) {
    if (__DEV__) {
      devLog("[sessionCookie] setExplicitCookiePair called with empty token");
    }
    return false;
  }
  
  // CRITICAL: Validate token before storing
  const validation = isValidBetterAuthToken(tokenValue);
  if (!validation.isValid) {
    if (__DEV__) {
      devLog(`[AUTH_TRACE] setExplicitCookiePair: rejected token, reason=${validation.reason}`);
    }
    return false; // Do NOT store invalid token
  }
  
  // Format as full cookie pair
  const fullCookie = `${COOKIE_NAME}=${tokenValue}`;
  
  const success = await safeSetItemAsync(SESSION_COOKIE_KEY, fullCookie);
  
  if (__DEV__ && success) {
    devLog("[sessionCookie] Explicit cookie pair stored successfully (validated)");
  }
  return success;
}
