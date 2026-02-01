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

import * as SecureStore from "expo-secure-store";

// Storage key for the session cookie
export const SESSION_COOKIE_KEY = "open-invite_session_cookie";

// Cookie name used by Better Auth
const COOKIE_NAME = "__Secure-better-auth.session_token";

// UUID regex pattern for rejection (same as authClient.ts)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a token is a plausible Better Auth session token.
 * DUPLICATE: Same logic as authClient.ts isValidBetterAuthToken (avoid circular imports)
 */
function isValidSessionToken(token: string): { isValid: boolean; reason: string } {
  if (!token || typeof token !== "string") {
    return { isValid: false, reason: "empty_or_not_string" };
  }
  const trimmed = token.trim();
  if (trimmed.length < 20) {
    return { isValid: false, reason: "too_short" };
  }
  if (UUID_PATTERN.test(trimmed)) {
    return { isValid: false, reason: "uuid_pattern" };
  }
  if (!trimmed.includes(".")) {
    return { isValid: false, reason: "no_dot_not_signed" };
  }
  return { isValid: true, reason: "valid" };
}

/**
 * Get the stored session cookie pair
 * @returns The full cookie string or null if not set
 */
export async function getSessionCookie(): Promise<string | null> {
  try {
    const cookie = await SecureStore.getItemAsync(SESSION_COOKIE_KEY);
    return cookie || null;
  } catch (error) {
    if (__DEV__) {
      console.log("[sessionCookie] Error getting cookie:", error);
    }
    return null;
  }
}

/**
 * Set the session cookie from a raw cookie value
 * @param cookieValue The cookie value (with or without the cookie name prefix)
 */
export async function setSessionCookie(cookieValue: string): Promise<void> {
  try {
    // Normalize: ensure we store the full cookie pair format
    let fullCookie = cookieValue;
    if (!cookieValue.startsWith(COOKIE_NAME)) {
      fullCookie = `${COOKIE_NAME}=${cookieValue}`;
    }
    
    await SecureStore.setItemAsync(SESSION_COOKIE_KEY, fullCookie);
    
    if (__DEV__) {
      console.log("[sessionCookie] Cookie stored successfully");
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[sessionCookie] Error setting cookie:", error);
    }
    throw error;
  }
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
      console.log("[sessionCookie] Could not parse Set-Cookie header:", setCookieHeader.substring(0, 50));
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[sessionCookie] Error parsing Set-Cookie header:", error);
    }
  }
}

/**
 * Clear the stored session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_COOKIE_KEY);
    if (__DEV__) {
      console.log("[sessionCookie] Cookie cleared");
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[sessionCookie] Error clearing cookie:", error);
    }
    // Don't throw - clearing should always succeed logically
  }
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
      console.log("[sessionCookie] setExplicitCookiePair called with empty token");
    }
    return false;
  }
  
  // CRITICAL: Validate token before storing
  const validation = isValidSessionToken(tokenValue);
  if (!validation.isValid) {
    if (__DEV__) {
      console.log(`[AUTH_TRACE] setExplicitCookiePair: rejected token, reason=${validation.reason}`);
    }
    return false; // Do NOT store invalid token
  }
  
  // Format as full cookie pair
  const fullCookie = `${COOKIE_NAME}=${tokenValue}`;
  
  try {
    await SecureStore.setItemAsync(SESSION_COOKIE_KEY, fullCookie);
    
    if (__DEV__) {
      console.log("[sessionCookie] Explicit cookie pair stored successfully (validated)");
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      console.log("[sessionCookie] Error setting explicit cookie pair:", error);
    }
    throw error;
  }
}
