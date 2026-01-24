// src/lib/authClient.ts
import * as SecureStore from "expo-secure-store";
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

// Use canonical bearer auth token key (single source of truth from authKeys.ts)
const TOKEN_KEY = AUTH_TOKEN_KEY;

// Storage prefix consistent with app scheme
const STORAGE_PREFIX = "open-invite";

/**
 * DEV-only trace helper for auth token flow tracing.
 * Never logs token content - only booleans, keys, and function names.
 */
function authTrace(event: string, data: Record<string, boolean | string | number>): void {
  if (!__DEV__) return;
  console.log(`[AUTH_TRACE] ${event}`, data);
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
      scheme: "vibecode", // Must match app.json scheme
      storagePrefix: STORAGE_PREFIX,
      storage: SecureStore,
    }),
  ],
});

// DEV: Log cookie storage key for debugging
if (__DEV__) {
  const cookieKey = `${STORAGE_PREFIX}_cookie`;
  console.log(`[authClient] Cookie storage key: ${cookieKey}`);
}

export async function getAuthToken(): Promise<string | null> {
  authTrace("getAuthToken:begin", { storageType: "SecureStore", keyUsed: TOKEN_KEY });
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
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
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
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

  // Get explicitly stored session cookie
  const storedCookie = await getSessionCookie();
  const hasCookie = !!storedCookie;

  if (__DEV__) {
    console.log(`[authClient.$fetch] ${init?.method || 'GET'} ${url}`);
    console.log(`[authClient.$fetch] Explicit cookie stored: ${hasCookie}`);
  }

  authTrace("authFetch:beforeRequest", { 
    endpoint: path,
    method: init?.method || "GET",
    hasExplicitCookie: hasCookie,
  });

  // Merge headers: attach stored cookie explicitly
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  };
  
  if (storedCookie) {
    headers["Cookie"] = storedCookie;
  }

  try {
    // Use Better Auth's $fetch with explicit cookie header
    const result = await betterAuthClient.$fetch<T>(url, {
      method: init?.method || "GET",
      body: init?.body,
      headers,
    });
    
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
    
    if (__DEV__) {
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

    if (__DEV__) {
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
if (__DEV__) {
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
async function captureAndStoreCookie(): Promise<void> {
  try {
    // Read from Better Auth's expo storage key
    const betterAuthCookieKey = `${STORAGE_PREFIX}_cookie`;
    const rawCookie = await SecureStore.getItemAsync(betterAuthCookieKey);
    
    if (__DEV__) {
      console.log('[captureAndStoreCookie] Better Auth cookie key:', betterAuthCookieKey);
      console.log('[captureAndStoreCookie] Raw cookie exists:', !!rawCookie);
    }
    
    if (rawCookie && rawCookie !== '{}') {
      // Better Auth may store as JSON object or raw string
      let cookieValue: string | null = null;
      
      try {
        // Try parsing as JSON (Better Auth format)
        const parsed = JSON.parse(rawCookie);
        // Look for the session token in various formats
        if (typeof parsed === 'object') {
          // Format: { "__Secure-better-auth.session_token": "value" }
          const sessionKey = Object.keys(parsed).find(k => k.includes('session_token'));
          if (sessionKey && parsed[sessionKey]) {
            cookieValue = `${sessionKey}=${parsed[sessionKey]}`;
          }
        }
      } catch {
        // Not JSON, might be raw cookie string
        if (rawCookie.includes('session_token')) {
          cookieValue = rawCookie;
        }
      }
      
      if (cookieValue) {
        await setSessionCookie(cookieValue);
        if (__DEV__) {
          console.log('[captureAndStoreCookie] Cookie captured and stored explicitly');
        }
      } else if (__DEV__) {
        console.log('[captureAndStoreCookie] Could not extract session token from Better Auth storage');
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
      // Also clear Better Auth's stored cookies (legacy)
      try {
        await SecureStore.deleteItemAsync(`${STORAGE_PREFIX}_cookie`);
        await SecureStore.deleteItemAsync(`${STORAGE_PREFIX}_session`);
      } catch {
        // Ignore - keys may not exist
      }
      return { ok: true };
    } catch (e) {
      // Still clear local state even if server call fails
      await clearAuthToken();
      await clearSessionCookie();
      return { ok: false, error: e } as any;
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
