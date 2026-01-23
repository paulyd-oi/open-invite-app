// src/lib/authClient.ts
import * as SecureStore from "expo-secure-store";
import * as React from "react";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { BACKEND_URL } from "./config";
import { AUTH_TOKEN_KEY } from "./authKeys";

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
 * $fetch: Uses Better Auth client's $fetch which has expoClient cookie handling.
 * This ensures cookies are properly stored and attached in React Native.
 * CRITICAL: React Native doesn't support cookies natively like browsers.
 * The expoClient plugin stores cookies in SecureStore and attaches them to requests.
 */
async function $fetch<T = any>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { method?: string; body?: any }
): Promise<T> {
  const url = joinUrl(API_BASE_URL, path);

  if (!API_BASE_URL) {
    throw new Error("API base URL missing. Set EXPO_PUBLIC_API_URL or EXPO_PUBLIC_VIBECODE_BACKEND_URL.");
  }

  if (__DEV__) {
    console.log(`[authClient.$fetch] ${init?.method || 'GET'} ${url}`);
    // Log cookie state (not cookie content - just existence)
    const cookieKey = `${STORAGE_PREFIX}_cookie`;
    const storedCookie = SecureStore.getItem(cookieKey);
    const hasCookie = !!(storedCookie && storedCookie !== '{}');
    console.log(`[authClient.$fetch] Cookie stored: ${hasCookie}`);
  }

  authTrace("authFetch:beforeRequest", { 
    endpoint: path,
    method: init?.method || "GET",
    usingExpoClient: true,
  });

  try {
    // Use Better Auth's $fetch which has the expoClient plugin for cookie handling
    // This automatically reads/stores cookies from SecureStore
    const result = await betterAuthClient.$fetch<T>(url, {
      method: init?.method || "GET",
      body: init?.body,
      headers: init?.headers as Record<string, string>,
    });
    
    if (__DEV__) {
      console.log(`[authClient.$fetch] Success for ${path}`);
      // Log cookie state AFTER request to see if Set-Cookie was stored
      const cookieKey = `${STORAGE_PREFIX}_cookie`;
      const storedCookie = SecureStore.getItem(cookieKey);
      const hasCookie = !!(storedCookie && storedCookie !== '{}');
      console.log(`[authClient.$fetch] Cookie after request: ${hasCookie}`);
      authTrace("authFetch:success", { endpoint: path, usingExpoClient: true, hasCookieAfter: hasCookie });
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
    if (__DEV__) {
      console.log(`[authClient.$fetch] Error for ${path}:`, error.message || error);
      
      // Known optional endpoints - treat 404 as non-error in logs
      const isKnown404 = error.status === 404 && (
        path.includes("/api/profile") ||
        path.includes("/api/profiles") ||
        path.includes("/api/achievements") ||
        path.includes("/api/entitlements")
      );
      
      if (isKnown404) {
        console.warn(`[authClient.$fetch] Known optional endpoint 404: ${init?.method || 'GET'} ${url}`);
      }
    }
    
    // Re-throw with consistent error shape
    const err = new Error(error.message || 'Request failed') as any;
    err.status = error.status || error.response?.status;
    err.response = { status: err.status };
    err.url = url;
    throw err;
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
      // Also clear Better Auth's stored cookies
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
      return { ok: false, error: e } as any;
    }
  },

  // Sign in - uses Better Auth client with expoClient for cookie handling
  signIn: {
    async email(opts: { email: string; password: string }) {
      try {
        const result = await betterAuthClient.signIn.email(opts);
        
        if (__DEV__) {
          console.log('[authClient.signIn] Result:', { 
            hasData: !!result.data, 
            hasError: !!result.error,
            hasUser: !!result.data?.user 
          });
          authTrace("signIn:complete", { hasUser: !!result.data?.user, success: !result.error });
        }
        
        if (result.error) {
          return { error: { message: result.error.message || 'Sign in failed' } } as any;
        }
        
        // Better Auth expoClient handles cookie storage automatically
        // No need to manually extract/store token - cookies are managed by expoClient
        return { data: result.data } as any;
      } catch (e: any) {
        if (__DEV__) {
          console.log('[authClient.signIn] Exception:', e.message);
        }
        return { error: { message: e?.message || String(e) } } as any;
      }
    },
  },

  // Sign up - uses Better Auth client with expoClient for cookie handling
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
            hasUser: !!result.data?.user 
          });
          authTrace("signUp:complete", { hasUser: !!result.data?.user, success: !result.error });
        }
        
        if (result.error) {
          return { error: { message: result.error.message || 'Sign up failed' } } as any;
        }
        
        // Better Auth expoClient handles cookie storage automatically
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
