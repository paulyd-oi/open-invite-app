// src/lib/authClient.ts
import * as SecureStore from "expo-secure-store";
import * as React from "react";
import { BACKEND_URL } from "./config";
import { AUTH_TOKEN_KEY } from "./authKeys";

// Use canonical bearer auth token key (single source of truth from authKeys.ts)
const TOKEN_KEY = AUTH_TOKEN_KEY;

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
  };
} | null;

export type UseSessionResult = {
  data: Session;
  isPending: boolean;
  error: unknown;
  refetch: () => Promise<Session>;
};

/**
 * $fetch: compatible helper used by Better Auth client patterns.
 * - Adds Authorization if token exists
 * - Uses Render API base URL
 */
async function $fetch<T = any>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { method?: string; body?: any }
): Promise<T> {
  const url = joinUrl(API_BASE_URL, path);

  if (!API_BASE_URL) {
    // Fail "soft" so the app can still boot/log out cleanly
    throw new Error("API base URL missing. Set EXPO_PUBLIC_API_URL or EXPO_PUBLIC_VIBECODE_BACKEND_URL.");
  }

  if (__DEV__) {
    console.log(`[authClient.$fetch] ${init?.method || 'GET'} ${url}`);
  }

  // Detect pre-existing auth headers/cookies before our logic runs
  if (__DEV__) {
    const requestHeaders = init?.headers as Record<string, any> | undefined;
    const hadAuthorizationHeaderAlready = !!(requestHeaders?.Authorization || requestHeaders?.authorization);
    const hadCookieHeaderAlready = !!(requestHeaders?.Cookie || requestHeaders?.cookie);
    
    let authHeaderSourceGuess: "requestOptions" | "clientDefaults" | "unknown" = "unknown";
    if (requestHeaders?.Authorization || requestHeaders?.authorization) {
      authHeaderSourceGuess = "requestOptions";
    }
    
    authTrace("authFetch:preExistingHeaders", {
      hadAuthorizationHeaderAlready,
      hadCookieHeaderAlready,
      authHeaderSourceGuess,
    });
  }

  authTrace("authFetch:beforeAttach", { 
    endpoint: path,
    method: init?.method || "GET",
    storageKeyUsed: TOKEN_KEY,
  });

  const token = await getAuthToken();

  if (__DEV__ && path.includes('auth')) {
    console.log(`[authClient.$fetch] Token exists: ${!!token}`);
  }

  // Debug log for Bearer token format
  if (__DEV__ && token) {
    console.log(`[authClient.$fetch] Auth header uses Bearer: true; tokenLen: ${token.length}`);
  } else if (__DEV__) {
    console.log(`[authClient.$fetch] Auth header uses Bearer: false; tokenLen: 0`);
  }

  authTrace("authFetch:tokenRead", {
    tokenExists: !!token,
    readFrom: "SecureStore",
    keyUsed: TOKEN_KEY,
  });

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as any),
  };

  // If body is an object, send JSON  
  let body = init?.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = JSON.stringify(body);
  } else if ((init?.method === 'POST' || init?.method === 'PUT' || init?.method === 'PATCH') && !body) {
    // For POST/PUT/PATCH without body, still set Content-Type to prevent 415 errors
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  authTrace("authFetch:afterAttach", {
    willAttachAuthHeader: !!token,
    endpoint: path,
  });

  const res = await fetch(url, {
    ...init,
    headers,
    body,
    // If your backend uses cookies, keep this as include. If not, it’s still safe.
    credentials: "include" as any,
  });

  if (__DEV__) {
    console.log(`[authClient.$fetch] Response status: ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");
    const msg =
      typeof payload === "string"
        ? payload
        : payload?.message || payload?.error || `Request failed: ${res.status}`;
    
    if (__DEV__) {
      // Known optional endpoints - treat 404 as non-error
      const isKnown404 = res.status === 404 && (
        url.includes("/api/profile") ||
        url.includes("/api/profiles") ||
        url.includes("/api/achievements") ||
        url.includes("/api/entitlements") ||
        url.includes("/api/businesses/following")
      );
      
      if (isKnown404) {
        console.warn(`[authClient.$fetch] Known optional endpoint 404: ${init?.method || 'GET'} ${url}`);
      } else {
        console.log(`[authClient.$fetch] Error response:`, msg);
      }
    }
    
    const error = new Error(msg) as any;
    error.status = res.status;
    error.response = { status: res.status };
    error.url = url;
    throw error;
  }

  return (isJson ? await res.json() : await res.text()) as T;
}

// Log resolved API base URL in development for easier debugging
if (__DEV__) {
  try {
    console.log("[authClient] Resolved API_BASE_URL:", API_BASE_URL);
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
  // Sign in / sign up shims for email/password flows
  async signOut() {
    try {
      await $fetch('/api/auth/sign-out', { method: 'POST' });
      await clearAuthToken();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e } as any;
    }
  },

  signIn: {
    async email(opts: { email: string; password: string }) {
      try {
        const data = await $fetch('/api/auth/sign-in/email', { method: 'POST', body: opts });
        
        // Check if response contains a token and save it
        if (data && typeof data === 'object' && 'token' in data) {
          if (__DEV__) {
            console.log('[authClient.signIn] Received token, saving to SecureStore');
          }
          await setAuthToken(data.token as string);
        }
        
        return { data } as any;
      } catch (e: any) {
        return { error: { message: e?.message || String(e) } } as any;
      }
    },
  },

  signUp: {
    async email(opts: { email: string; password: string; name?: string }) {
      try {
        const data = await $fetch('/api/auth/sign-up/email', { method: 'POST', body: opts });
        
        // Check if response contains a token and save it
        if (data && typeof data === 'object' && 'token' in data) {
          if (__DEV__) {
            console.log('[authClient.signUp] Received token, saving to SecureStore');
          }
          await setAuthToken(data.token as string);
        }
        
        return { data } as any;
      } catch (e: any) {
        return { error: { message: e?.message || String(e) } } as any;
      }
    },
  },
};
