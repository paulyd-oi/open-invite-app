// src/lib/authClient.ts
import * as SecureStore from "expo-secure-store";
import { safeGetItemAsync, safeSetItemAsync, safeDeleteItemAsync } from "./safeSecureStore";
import * as React from "react";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { BACKEND_URL } from "./config";
import { AUTH_TOKEN_KEY } from "./authKeys";
import {
  getSessionCookie,
  setSessionCookie,
  clearSessionCookie,
  setExplicitCookiePair,
  SESSION_COOKIE_KEY,
} from "./sessionCookie";
import { debugDumpBetterAuthCookieOnce } from "./debugCookie";
import { emitAuthExpiry } from "./authExpiry";

// Use canonical bearer auth token key (single source of truth from authKeys.ts)
const TOKEN_KEY = AUTH_TOKEN_KEY;

// Storage prefix consistent with app scheme
const STORAGE_PREFIX = "open-invite";
const EXPO_SCHEME = "open-invite"; // Must match app.json scheme

// Module-level cache for Better Auth cookie token (avoids reading SecureStore on every request)
let explicitCookieValue: string | null = null;

// OI Session Token - header fallback for unreliable iOS cookie jar
// Single source of truth for mobile session token
export const OI_SESSION_TOKEN_KEY = "oi_session_token_v1";
let oiSessionToken: string | null = null;
let oiSessionTokenInitialized = false;

// AUTH_DEBUG: Gate verbose auth logs behind explicit env flag
// Set EXPO_PUBLIC_AUTH_DEBUG=1 in .env to enable per-request logging
const AUTH_DEBUG = __DEV__ && process.env.EXPO_PUBLIC_AUTH_DEBUG === "1";

/**
 * DEV-only trace helper for auth token flow tracing.
 * Never logs token content - only booleans, keys, and function names.
 * Gated behind AUTH_DEBUG to silence per-request log firehose.
 */
function authTrace(event: string, data: Record<string, boolean | string | number>): void {
  if (!AUTH_DEBUG) return;
  console.log(`[AUTH_TRACE] ${event}`, data);
}

// UUID regex pattern for rejection
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a token is a plausible Better Auth session token.
 * Rejects UUIDs, short strings, and strings without a dot (not signed JWT-like).
 * 
 * CRITICAL: Used to prevent storing invalid values (e.g., session IDs) as session tokens.
 * 
 * @param token The token value to validate
 * @returns Object with isValid boolean and reason string
 */
export function isValidBetterAuthToken(token: unknown): { isValid: boolean; reason: string } {
  if (!token || typeof token !== "string") {
    return { isValid: false, reason: "empty_or_not_string" };
  }
  
  const trimmed = token.trim();
  
  // Minimum length check (Better Auth tokens are typically much longer)
  if (trimmed.length < 20) {
    return { isValid: false, reason: "too_short" };
  }
  
  // Reject UUID pattern (session IDs are UUIDs, not session tokens)
  if (UUID_PATTERN.test(trimmed)) {
    return { isValid: false, reason: "uuid_pattern" };
  }
  
  // Better Auth tokens are signed and contain at least one dot (like JWTs)
  if (!trimmed.includes(".")) {
    return { isValid: false, reason: "no_dot_not_signed" };
  }
  
  return { isValid: true, reason: "valid" };
}

// Prefer explicit EXPO_PUBLIC_API_URL, then fall back to the centralized BACKEND_URL
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.EXPO_PUBLIC_API ||
  BACKEND_URL ||
  "";

function joinUrl(base: string, path: string) {
  if (!base) return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Better Auth client configured with Expo plugin for cookie/session persistence.
 * The expoClient plugin handles:
 * - Storing session cookies in SecureStore
 * - Attaching cookies to requests automatically
 * - Deep link handling for OAuth flows
 */
const betterAuthClient = createAuthClient({
  baseURL: API_BASE_URL,
  plugins: [
    expoClient({
      scheme: "open-invite", // Must match app.json scheme
      storagePrefix: STORAGE_PREFIX,
      storage: SecureStore,
    }),
  ],
});

// DEV: Log cookie storage key for debugging (gated behind AUTH_DEBUG)
if (AUTH_DEBUG) {
  const cookieKey = `${STORAGE_PREFIX}_cookie`;
  console.log(`[authClient] Cookie storage key: ${cookieKey}`);
  void debugDumpBetterAuthCookieOnce();
}

// Track initialization state for cookie loading
let cookieInitialized = false;
let cookieInitPromise: Promise<void> | null = null;

/**
 * Ensure cookie cache is initialized before making authenticated requests.
 * This MUST be awaited before bootstrap starts to prevent race conditions.
 * On cold start, the cookie must be read from SecureStore before any API calls.
 * Also loads OI session token for header fallback.
 */
export async function ensureCookieInitialized(): Promise<void> {
  if (cookieInitialized) {
    return;
  }
  
  if (cookieInitPromise) {
    return cookieInitPromise;
  }
  
  cookieInitPromise = (async () => {
    if (AUTH_DEBUG) {
      console.log('[authClient] Initializing cookie cache from SecureStore...');
    }
    // Load both cookie and OI session token in parallel
    await Promise.all([
      refreshExplicitCookie(),
      loadOiSessionToken(),
    ]);
    cookieInitialized = true;
    if (AUTH_DEBUG) {
      console.log('[authClient] Cookie cache initialized, hasValue:', !!explicitCookieValue);
    }
  })();
  
  return cookieInitPromise;
}

// NOTE: Cookie initialization is NOT started on module load.
// Bootstrap (authBootstrap.ts) is the ONLY authoritative caller of ensureCookieInitialized().
// This prevents race conditions and ensures deterministic cookie loading order.

export async function getAuthToken(): Promise<string | null> {
  authTrace("getAuthToken:begin", { storageType: "SecureStore", keyUsed: TOKEN_KEY });
  const token = await safeGetItemAsync(TOKEN_KEY);
  const tokenExists = !!token;
  authTrace("getAuthToken:result", { tokenExists, keyUsed: TOKEN_KEY });
  return token;
}

export async function hasAuthToken(): Promise<boolean> {
  authTrace("hasAuthToken:begin", { storageType: "SecureStore", keyUsed: TOKEN_KEY });
  const token = await getAuthToken();
  const hasToken = !!token;
  authTrace("hasAuthToken:result", { hasToken, storageType: "SecureStore" });
  return hasToken;
}

export async function setAuthToken(token: string): Promise<void> {
  await safeSetItemAsync(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  await safeDeleteItemAsync(TOKEN_KEY);
}

/**
 * Session data shape returned from backend after bearer token validation.
 * Contains user profile information derived from authenticated token.
 * Adjust to match your backend contract when ready.
 */
export type Session = {
  user?: {
    id: string;
    name?: string | null;
    displayName?: string | null;
    handle?: string | null;
    image?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
} | null;

export type UseSessionResult = {
  data: Session;
  isPending: boolean;
  error: unknown;
  refetch: () => Promise<Session>;
};

/**
 * $fetch: Uses Better Auth client's $fetch with EXPLICIT cookie attachment.
 * React Native doesn't support cookies natively like browsers.
 * We explicitly store the session cookie and attach it to every request.
 */
async function $fetch<T = any>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { method?: string; body?: any }
): Promise<T> {
  const url = joinUrl(API_BASE_URL, path);

  if (!API_BASE_URL) {
    throw new Error("API base URL missing. Set EXPO_PUBLIC_API_URL or EXPO_PUBLIC_VIBECODE_BACKEND_URL.");
  }

  // Use cached Better Auth cookie (refreshed after signIn)
  const hasCookie = !!explicitCookieValue;

  if (AUTH_DEBUG) {
    console.log(`[authClient.$fetch] ${init?.method || 'GET'} ${url}`);
    console.log(`[authClient.$fetch] Explicit cookie cached: ${hasCookie}`);
    if (hasCookie && explicitCookieValue) {
      const cookieName = explicitCookieValue.split('=')[0];
      console.log(`[authClient.$fetch] Cookie name: ${cookieName}`);
    }
  }

  authTrace("authFetch:beforeRequest", { 
    endpoint: path,
    method: init?.method || "GET",
    hasExplicitCookie: hasCookie,
  });

  try {
    // Prepare request body: serialize objects to JSON, pass FormData/strings as-is
    let finalBody: any = init?.body;
    const finalHeaders = new Headers(init?.headers as HeadersInit | undefined);
    
    // Add expo-origin header for Better Auth expo compatibility
    const expoOrigin = `${EXPO_SCHEME}://`;
    finalHeaders.set("expo-origin", expoOrigin);
    finalHeaders.set("x-skip-oauth-proxy", "true");
    
    if (init?.body && typeof init.body === 'object' && !(init.body instanceof FormData)) {
      finalBody = JSON.stringify(init.body);
      finalHeaders.set('Content-Type', 'application/json');
    }
    
    // CRITICAL: Inject x-oi-session-token header for deterministic auth
    // iOS cookie jar is unreliable - this header provides a fallback
    const hasOiToken = !!oiSessionToken;
    if (oiSessionToken) {
      finalHeaders.set("x-oi-session-token", oiSessionToken);
    }
    
    // CRITICAL: Use credentials: "include" to send cookies automatically
    // React Native's fetch with credentials: "include" uses the cookie jar
    // We also set the cookie header explicitly as fallback for RN environments
    // where the cookie jar may not work reliably across domains
    const hadCookie = !!explicitCookieValue;
    if (explicitCookieValue) {
      // Standard cookie format: "name=value" (no leading semicolon)
      finalHeaders.set("cookie", explicitCookieValue);
    }
    
    // DEV-only: Log auth header state (never log token values)
    if (AUTH_DEBUG) {
      console.log(`[AUTH_HDR] x-oi-session-token len=${oiSessionToken?.length ?? 0} hadCookie=${hadCookie}`);
      if (hadCookie && explicitCookieValue) {
        console.log(`[authClient.$fetch] cookie header SET: ${explicitCookieValue.split('=')[0]}`);
      }
    }
    
    const response = await fetch(url, {
      method: init?.method || "GET",
      body: finalBody,
      headers: finalHeaders,
      credentials: "include",
    });
    
    // Log response status for every request (helps debug auth issues)
    if (AUTH_DEBUG) {
      console.log(`[authClient.$fetch] Response status for ${path}: ${response.status}`);
    }
    
    if (!response.ok) {
      // Read raw text once for both logging and parsing
      const rawText = await response.text().catch(() => '');
      if (AUTH_DEBUG) {
        console.log(`[authClient.$fetch] Non-OK ${response.status} raw body preview: ${rawText.slice(0, 120)}`);
      }
      let errorData: any = null;
      try { errorData = JSON.parse(rawText); } catch {}
      const err = new Error(errorData?.message || errorData?.error?.message || `Request failed: ${response.status}`) as any;
      err.status = response.status;
      err.response = { status: response.status, _data: errorData };
      err.data = errorData;
      
      // AUTH EXPIRY: Emit event on 401 ONLY for authenticated endpoints (not /api/auth/*)
      // 403 = "Forbidden" = valid privacy response (keep session)
      // 401 = "Unauthorized" = session may be expired (trigger logout)
      // [P0_CIRCLE_EVENT_TAP] Fixed: 403 no longer triggers logout (was causing event tap → logout bug)
      const isAuthEndpoint = path.startsWith("/api/auth/");
      if (response.status === 401 && !isAuthEndpoint) {
        emitAuthExpiry({ endpoint: path, method: init?.method || "GET", status: response.status });
      }
      
      throw err;
    }
    
    const result = await response.json().catch(() => ({})) as T;
    
    // Log SESSION_SHAPE for /api/auth/session only (per spec)
    if (path === "/api/auth/session" || path.endsWith("/api/auth/session")) {
      const sessionData = result as any;
      const hasSession = !!sessionData;
      const hasUser = !!(sessionData?.user);
      const userId = sessionData?.user?.id || null;
      const sessionUserId = sessionData?.session?.userId || null;
      const effectiveUserId = userId ?? sessionUserId ?? null;
      console.log(`[SESSION_SHAPE] { hasSession: ${hasSession}, hasUser: ${hasUser}, userId: ${userId ? `"${userId}"` : null}, sessionUserId: ${sessionUserId ? `"${sessionUserId}"` : null}, effectiveUserId: ${effectiveUserId ? `"${effectiveUserId}"` : null} }`);
    }
    
    if (AUTH_DEBUG) {
      console.log(`[authClient.$fetch] Success for ${path}`);
      authTrace("authFetch:success", { endpoint: path, hadCookie: hasCookie });
    }
    
    // Better Auth $fetch returns { data, error } format for some endpoints
    if (result && typeof result === 'object' && 'error' in result && (result as any).error) {
      const error = (result as any).error;
      const err = new Error(error.message || 'Request failed') as any;
      err.status = error.status;
      err.response = { status: error.status };
      throw err;
    }
    
    // Return data if wrapped, otherwise return result directly
    if (result && typeof result === 'object' && 'data' in result) {
      return (result as any).data as T;
    }
    
    return result as T;
  } catch (error: any) {
    // Build rich error details from Better Auth / ofetch error shapes
    const details = {
      status: error?.response?.status ?? error?.status ?? null,
      message: error?.message ?? String(error),
      data: error?.data ?? error?.response?._data ?? null,
      endpoint: path,
      method: init?.method || "GET",
    };

    if (AUTH_DEBUG) {
      console.log(`[authClient.$fetch] Error for ${path}:`, details.message);
      
      // Known optional endpoints - treat 404 as non-error in logs
      const isKnown404 = details.status === 404 && (
        path.includes("/api/profile") ||
        path.includes("/api/profiles") ||
        path.includes("/api/achievements") ||
        path.includes("/api/entitlements")
      );
      
      if (isKnown404) {
        console.warn(`[authClient.$fetch] Known optional endpoint 404: ${details.method} ${url}`);
      }
      
      // Detailed error logging for /api/profile to debug validation failures
      if (path.includes("/api/profile")) {
        console.error(`[authClient.$fetch] /api/profile ERROR DETAILS:`);
        console.error(`  status: ${details.status}`);
        console.error(`  data: ${typeof details.data === 'object' ? JSON.stringify(details.data, null, 2) : details.data || 'none'}`);
        console.error(`  message: ${details.message}`);
      }
    }
    
    // Re-throw with rich error shape so callers can display validation details
    const e2 = new Error(details.message || 'Request failed') as any;
    e2.status = details.status;
    e2.data = details.data;
    e2.endpoint = path;
    e2.method = details.method;
    e2.response = { status: details.status }; // Backward compat
    throw e2;
  }
}

// Log resolved API base URL in development for easier debugging
if (AUTH_DEBUG) {
  try {
    console.log("[authClient] Resolved API_BASE_URL:", API_BASE_URL);
    console.log("[authClient] Using Better Auth expoClient with storagePrefix:", STORAGE_PREFIX);
    console.log("[authClient] Cookie storage: SecureStore (via @better-auth/expo)");
  } catch (e) {
    // ignore
  }
}

/**
 * Import cached session to prevent request storms
 */
import { getSessionCached } from './sessionCache';

/**
 * Fetch session from backend with caching and deduplication.
 */
async function fetchSession(): Promise<Session> {
  return getSessionCached() as Promise<Session>;
}

/**
 * Capture cookie from Better Auth's expo storage and store explicitly.
 * Better Auth expoClient stores cookies under "{storagePrefix}_cookie" key.
 * We read from there and copy to our explicit storage for deterministic attachment.
 */
/**
 * Refresh the explicit cookie cache from SecureStore.
 * Priority: 1) Better Auth's expo storage, 2) Explicit SESSION_COOKIE_KEY (for Apple Sign-In)
 * Call this after signIn/signUp to ensure subsequent requests include the cookie.
 */
export async function refreshExplicitCookie(): Promise<void> {
  // Priority 1: Try Better Auth's expo storage key (used by email auth)
  const betterAuthCookieKey = `${STORAGE_PREFIX}_cookie`;
  const rawCookie = await safeGetItemAsync(betterAuthCookieKey);
  
  if (AUTH_DEBUG) {
    console.log('[refreshExplicitCookie] Reading from key:', betterAuthCookieKey);
    console.log('[refreshExplicitCookie] Raw cookie exists:', !!rawCookie);
  }
  
  // Parse JSON format: {"__Secure-better-auth.session_token":{"value":"TOKEN","expires":"..."}}
  if (rawCookie && rawCookie !== '{}') {
    try {
      const parsed = JSON.parse(rawCookie);
      const targetCookieName = '__Secure-better-auth.session_token';
      
      if (parsed[targetCookieName]?.value) {
        const token = parsed[targetCookieName].value;
        explicitCookieValue = `${targetCookieName}=${token}`;
        if (AUTH_DEBUG) {
          console.log('[refreshExplicitCookie] Cookie cached from Better Auth storage');
        }
        return; // Success - done
      }
    } catch (parseError) {
      if (AUTH_DEBUG) {
        console.log('[refreshExplicitCookie] Failed to parse Better Auth cookie JSON:', parseError);
      }
    }
  }
  
  // Priority 2: Fallback to SESSION_COOKIE_KEY (used by Apple Sign-In)
  const explicitCookie = await safeGetItemAsync(SESSION_COOKIE_KEY);
  if (explicitCookie && explicitCookie.includes('__Secure-better-auth.session_token=')) {
    explicitCookieValue = explicitCookie;
    if (AUTH_DEBUG) {
      console.log('[refreshExplicitCookie] Cookie cached from SESSION_COOKIE_KEY (Apple Sign-In path)');
    }
    return; // Success - done
  }
  
  // No cookie found in either location
  explicitCookieValue = null;
  if (AUTH_DEBUG) {
    console.log('[refreshExplicitCookie] No cookie found in any location - cache cleared');
  }
}

/**
 * Set the explicit cookie value directly in module cache.
 * Use this after storing to SecureStore to avoid read-back delay.
 * CRITICAL: Validates token before setting to prevent storing invalid values.
 * @param cookiePair The full cookie pair: "__Secure-better-auth.session_token=TOKEN"
 * @returns true if set successfully, false if validation failed
 */
export function setExplicitCookieValueDirectly(cookiePair: string): boolean {
  if (!cookiePair) {
    explicitCookieValue = null;
    return false;
  }
  
  // Extract token value from cookie pair for validation
  const parts = cookiePair.split('=');
  if (parts.length < 2) {
    if (AUTH_DEBUG) {
      console.log('[AUTH_TRACE] setExplicitCookieValueDirectly: rejected, invalid format (no =)');
    }
    return false;
  }
  
  const tokenValue = parts.slice(1).join('='); // Handle tokens with = in them
  const validation = isValidBetterAuthToken(tokenValue);
  
  if (!validation.isValid) {
    if (AUTH_DEBUG) {
      console.log(`[AUTH_TRACE] setExplicitCookieValueDirectly: rejected token, reason=${validation.reason}`);
    }
    return false; // Do NOT set invalid token
  }
  
  explicitCookieValue = cookiePair;
  if (AUTH_DEBUG) {
    console.log('[setExplicitCookieValueDirectly] Cookie cache set directly (validated)');
  }
  return true;
}

// ============ OI SESSION TOKEN FUNCTIONS ============
// These provide a deterministic header fallback for unreliable iOS cookie jar

/**
 * Store OI session token to SecureStore and memory cache.
 * Call this after successful Apple sign-in with the session token.
 * @param token The raw session token value (not the cookie pair)
 */
export async function setOiSessionToken(token: string): Promise<void> {
  if (!token) {
    console.log('[OI_TOKEN] setOiSessionToken: empty token, skipping');
    return;
  }
  
  // Store in SecureStore for persistence across app restarts
  await safeSetItemAsync(OI_SESSION_TOKEN_KEY, token);
  
  // Set in memory cache immediately for same-run requests
  oiSessionToken = token;
  oiSessionTokenInitialized = true;
  
  console.log(`[OI_TOKEN] stored len=${token.length}`);
}

/**
 * Load OI session token from SecureStore into memory cache.
 * Call this on cold start before any authenticated requests.
 * Safe to call multiple times - will only load once.
 */
export async function loadOiSessionToken(): Promise<void> {
  if (oiSessionTokenInitialized) {
    return; // Already initialized
  }
  
  const token = await safeGetItemAsync(OI_SESSION_TOKEN_KEY);
  oiSessionToken = token;
  oiSessionTokenInitialized = true;
  
  console.log(`[BOOT_TOKEN] loaded=${!!token} len=${token?.length ?? 0}`);
}

/**
 * Clear OI session token from SecureStore and memory cache.
 * Call this on sign out.
 */
export async function clearOiSessionToken(): Promise<void> {
  await safeDeleteItemAsync(OI_SESSION_TOKEN_KEY);
  oiSessionToken = null;
  oiSessionTokenInitialized = true; // Mark initialized to prevent rehydrating stale values
  console.log('[OI_TOKEN] cleared');
}

/**
 * Get OI session token from memory cache.
 * Returns null if not loaded or not set.
 */
export function getOiSessionTokenCached(): string | null {
  return oiSessionToken;
}
// ============ END OI SESSION TOKEN FUNCTIONS ============

async function captureAndStoreCookie(): Promise<void> {
  try {
    // Read from Better Auth's expo storage key
    const betterAuthCookieKey = `${STORAGE_PREFIX}_cookie`;
    const rawCookie = await safeGetItemAsync(betterAuthCookieKey);
    
    if (__DEV__) {
      console.log('[captureAndStoreCookie] Better Auth cookie key:', betterAuthCookieKey);
      console.log('[captureAndStoreCookie] Raw cookie exists:', !!rawCookie);
      if (rawCookie) {
        console.log('[captureAndStoreCookie] Raw cookie type:', typeof rawCookie);
        console.log('[captureAndStoreCookie] Raw cookie preview:', rawCookie.substring(0, 80));
      }
    }
    
    if (rawCookie && rawCookie !== '{}') {
      // Target cookie name - EXACT match only, no fallbacks
      const targetCookieName = '__Secure-better-auth.session_token';
      let tokenValue: string | null = null;
      
      try {
        // Try parsing as JSON (Better Auth format)
        const parsed = JSON.parse(rawCookie);
        if (__DEV__) {
          console.log('[captureAndStoreCookie] Parsed JSON keys:', Object.keys(parsed));
        }
        
        if (typeof parsed === 'object') {
          // Look for the EXACT session token key ONLY (no substring fallback)
          if (parsed[targetCookieName]) {
            // Extract just the value (strip any attributes after ";")
            const rawValue = parsed[targetCookieName];
            tokenValue = typeof rawValue === 'string' 
              ? rawValue.split(';')[0].split(',')[0].trim()
              : rawValue?.value ?? null;
            if (__DEV__) {
              console.log('[captureAndStoreCookie] Found exact target cookie key');
            }
          }
          // REMOVED: Fallback logic that looked for any key containing 'session_token'
          // This was incorrectly capturing UUID session IDs
        }
      } catch {
        // Not JSON, might be raw cookie string (Set-Cookie format)
        if (rawCookie.includes(targetCookieName)) {
          // Parse Set-Cookie format: "__Secure-better-auth.session_token=VALUE; Path=/; ..."
          const match = rawCookie.match(new RegExp(`${targetCookieName}=([^;]+)`));
          if (match && match[1]) {
            tokenValue = match[1].split(",")[0].trim();
            if (__DEV__) {
              console.log('[captureAndStoreCookie] Extracted from raw Set-Cookie format');
            }
          }
        }
      }
      
      // CRITICAL: Validate token before storing
      if (tokenValue) {
        const validation = isValidBetterAuthToken(tokenValue);
        
        if (!validation.isValid) {
          // REJECT: Do not store invalid token
          if (__DEV__) {
            console.log(`[AUTH_TRACE] captureAndStoreCookie: rejected token, reason=${validation.reason}`);
          }
          return; // Do not overwrite existing cookie with invalid value
        }
        
        // Token is valid - construct full cookie pair and store
        const cookieValue = `${targetCookieName}=${tokenValue}`;
        await setSessionCookie(cookieValue);
        if (__DEV__) {
          console.log('[captureAndStoreCookie] Cookie captured and stored explicitly (validated)');
        }
      } else if (__DEV__) {
        console.log('[captureAndStoreCookie] Could not extract session token from Better Auth storage');
        console.log('[captureAndStoreCookie] EXACT key __Secure-better-auth.session_token not found');
      }
    } else if (__DEV__) {
      console.log('[captureAndStoreCookie] No Better Auth cookie found to capture');
    }
  } catch (error) {
    if (__DEV__) {
      console.log('[captureAndStoreCookie] Error capturing cookie:', error);
    }
    // Don't throw - cookie capture is best-effort
  }
}

/**
 * Verify session is valid after sign-in/sign-up by calling /api/auth/session.
 * Logs SESSION_SHAPE to confirm userId is present.
 */
async function verifySessionAfterAuth(context: string): Promise<void> {
  try {
    if (__DEV__) {
      console.log(`[verifySessionAfterAuth] Verifying session after ${context}...`);
    }
    
    // Small delay to ensure cookie is propagated
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Call session endpoint - this will log SESSION_SHAPE
    const sessionData = await $fetch<{ user: any; session: any }>('/api/auth/session', {
      method: 'GET',
    });
    
    const userId = sessionData?.user?.id || null;
    
    if (__DEV__) {
      console.log(`[verifySessionAfterAuth] ${context} - userId: ${userId ? `"${userId}"` : 'null'}`);
      if (userId) {
        console.log(`[verifySessionAfterAuth] ✓ Session verified successfully`);
      } else {
        console.warn(`[verifySessionAfterAuth] ⚠ Session verification returned no userId`);
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.log(`[verifySessionAfterAuth] Error verifying session after ${context}:`, error);
    }
    // Don't throw - verification is for logging/debugging
  }
}

/**
 * Result type for ensureSessionReady
 */
export type SessionReadyResult = {
  ok: boolean;
  status: number | null;
  userId: string | null;
  attempt: number;
  error?: string;
};

/**
 * Ensure session is ready after login by verifying /api/auth/session.
 * Retries once after 300ms if first attempt fails.
 * 
 * Use this after Apple or Email sign-in to guarantee session is established
 * before proceeding with authed requests.
 * 
 * @returns SessionReadyResult with ok, status, userId, and attempt info
 */
export async function ensureSessionReady(): Promise<SessionReadyResult> {
  const RETRY_DELAY_MS = 300;
  const MAX_ATTEMPTS = 2;
  
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const sessionData = await $fetch<{ user?: { id: string }; session?: { userId: string } }>('/api/auth/session', {
        method: 'GET',
      });
      
      const userId = sessionData?.user?.id || sessionData?.session?.userId || null;
      const result: SessionReadyResult = {
        ok: !!userId,
        status: 200,
        userId,
        attempt,
      };
      
      console.log(`[AUTH_BARRIER] ok=${result.ok} status=200 userId=${userId ? userId.substring(0, 8) + '...' : 'null'} attempt=${attempt}`);
      
      if (userId) {
        return result;
      }
      
      // No userId but request succeeded - might be race condition, retry
      if (attempt < MAX_ATTEMPTS) {
        console.log(`[AUTH_BARRIER] no userId, retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    } catch (error: any) {
      const status = error?.status || error?.response?.status || null;
      const errorMsg = error?.message || String(error);
      
      console.log(`[AUTH_BARRIER] ok=false status=${status} error=${errorMsg} attempt=${attempt}`);
      
      // If we have more attempts, retry after delay
      if (attempt < MAX_ATTEMPTS) {
        console.log(`[AUTH_BARRIER] retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      
      // Final attempt failed
      return {
        ok: false,
        status,
        userId: null,
        attempt,
        error: errorMsg,
      };
    }
  }
  
  // Should not reach here, but handle gracefully
  return {
    ok: false,
    status: null,
    userId: null,
    attempt: MAX_ATTEMPTS,
    error: 'Max attempts reached without userId',
  };
}

/**
 * Exported authClient shim with the surfaces your code is calling:
 * - getToken/setToken
 * - $fetch
 * - useSession
 */
export const authClient = {
  async getToken() {
    return getAuthToken();
  },
  async setToken(token: string) {
    return setAuthToken(token);
  },
  async clearToken() {
    return clearAuthToken();
  },

  // Better-auth style fetch helper
  $fetch,

  // Hook-compatible session getter
  useSession(): UseSessionResult {
    const [data, setData] = React.useState<Session>(null);
    const [isPending, setIsPending] = React.useState<boolean>(true);
    const [error, setError] = React.useState<unknown>(null);

    const refetch = React.useCallback(async () => {
      try {
        setIsPending(true);
        const session = await fetchSession();
        setData(session);
        setError(null);
        return session;
      } catch (e) {
        setError(e);
        setData(null);
        return null;
      } finally {
        setIsPending(false);
      }
    }, []);

    React.useEffect(() => {
      void refetch();
    }, [refetch]);

    return { data, isPending, error, refetch };
  },
  // Sign out - uses Better Auth client
  async signOut() {
    try {
      await betterAuthClient.signOut();
      await clearAuthToken();
      // Clear explicit session cookie
      await clearSessionCookie();
      // Clear OI session token (header fallback)
      await clearOiSessionToken();
      // Also clear Better Auth's stored cookies (legacy)
      await safeDeleteItemAsync(`${STORAGE_PREFIX}_cookie`);
      await safeDeleteItemAsync(`${STORAGE_PREFIX}_session`);
      return { ok: true };
    } catch (e) {
      // Still clear local state even if server call fails
      await clearAuthToken();
      await clearSessionCookie();
      await clearOiSessionToken();
      explicitCookieValue = null;
      return { ok: false, error: e } as any;
    } finally {
      // Always clear cookie cache on signOut
      explicitCookieValue = null;
    }
  },

  // Sign in - uses Better Auth client with explicit cookie capture
  signIn: {
    async email(opts: { email: string; password: string }) {
      try {
        const result = await betterAuthClient.signIn.email(opts);
        
        if (__DEV__) {
          console.log('[authClient.signIn] Result:', { 
            hasData: !!result.data, 
            hasError: !!result.error,
            hasUser: !!result.data?.user,
            hasMobileSessionToken: !!(result.data as any)?.mobileSessionToken,
          });
          authTrace("signIn:complete", { hasUser: !!result.data?.user, success: !result.error });
        }
        
        if (result.error) {
          return { error: { message: result.error.message || 'Sign in failed' } } as any;
        }
        
        // Check for backend-provided mobileSessionToken (preferred method)
        const mobileSessionToken = (result.data as any)?.mobileSessionToken;
        if (mobileSessionToken && typeof mobileSessionToken === 'string') {
          if (__DEV__) {
            console.log('[authClient.signIn] mobileSessionToken received');
          }
          await setExplicitCookiePair(mobileSessionToken);
        } else {
          // Fallback: Capture cookie from Better Auth's expo storage (if accessible)
          await captureAndStoreCookie();
        }
        
        // Refresh cookie cache so subsequent requests include the cookie
        await refreshExplicitCookie();
        
        // Verify session is valid by calling /api/auth/session
        await verifySessionAfterAuth('signIn');
        
        return { data: result.data } as any;
      } catch (e: any) {
        if (__DEV__) {
          console.log('[authClient.signIn] Exception:', e.message);
        }
        return { error: { message: e?.message || String(e) } } as any;
      }
    },
  },

  // Sign up - uses Better Auth client with explicit cookie capture
  signUp: {
    async email(opts: { email: string; password: string; name?: string }) {
      try {
        // Better Auth requires name to be a string, not undefined
        const signUpOpts = {
          email: opts.email,
          password: opts.password,
          name: opts.name || '', // Ensure name is always a string
        };
        const result = await betterAuthClient.signUp.email(signUpOpts);
        
        if (__DEV__) {
          console.log('[authClient.signUp] Result:', { 
            hasData: !!result.data, 
            hasError: !!result.error,
            hasUser: !!result.data?.user,
            hasMobileSessionToken: !!(result.data as any)?.mobileSessionToken,
          });
          authTrace("signUp:complete", { hasUser: !!result.data?.user, success: !result.error });
        }
        
        if (result.error) {
          return { error: { message: result.error.message || 'Sign up failed' } } as any;
        }
        
        // Check for backend-provided mobileSessionToken (preferred method)
        const mobileSessionToken = (result.data as any)?.mobileSessionToken;
        if (mobileSessionToken && typeof mobileSessionToken === 'string') {
          if (__DEV__) {
            console.log('[authClient.signUp] mobileSessionToken received');
          }
          await setExplicitCookiePair(mobileSessionToken);
        } else {
          // Fallback: Capture cookie from Better Auth's expo storage (if accessible)
          await captureAndStoreCookie();
        }
                // Refresh cookie cache so subsequent requests include the cookie
        await refreshExplicitCookie();
                // Verify session is valid by calling /api/auth/session
        await verifySessionAfterAuth('signUp');
        
        return { data: result.data } as any;
      } catch (e: any) {
        if (__DEV__) {
          console.log('[authClient.signUp] Exception:', e.message);
        }
        return { error: { message: e?.message || String(e) } } as any;
      }
    },
  },
};
