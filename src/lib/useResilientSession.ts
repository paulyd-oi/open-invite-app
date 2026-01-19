/**
 * Resilient Session Hook
 *
 * Wraps the Better Auth useSession hook with offline resilience:
 * - Caches session data locally in AsyncStorage
 * - Returns cached session when offline (prevents "logged out" state)
 * - Only clears session on true auth failures (401/403 from server)
 * - Never clears session on network errors, 5xx, or timeouts
 */

import { useEffect, useState, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authClient } from "./authClient";
import { useNetworkStatus, isNetworkError, shouldLogoutOnError } from "./networkStatus";
import { isRateLimited, getRateLimitRemaining } from "./rateLimitState";

// Storage key for cached session
const SESSION_CACHE_KEY = "session_cache_v1";

// Type for the session data from Better Auth
// Simplified to match actual authClient.Session shape
type SessionData = {
  user?: {
    id: string;
    name?: string | null;
    displayName?: string | null;
    handle?: string | null;
    image?: string | null;
    email?: string | null;
  };
} | null;

// Cache the session to storage
async function cacheSession(session: SessionData): Promise<void> {
  try {
    if (session) {
      await AsyncStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[useResilientSession] Error caching session:", error);
    }
  }
}

// Load cached session from storage
async function loadCachedSession(): Promise<SessionData> {
  try {
    const cached = await AsyncStorage.getItem(SESSION_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[useResilientSession] Error loading cached session:", error);
    }
  }
  return null;
}

// Clear cached session from storage
async function clearCachedSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_CACHE_KEY);
  } catch (error) {
    if (__DEV__) {
      console.log("[useResilientSession] Error clearing cached session:", error);
    }
  }
}

/**
 * Resilient Session Hook
 *
 * Returns the same shape as authClient.useSession() but with offline resilience.
 * When offline, returns the cached session instead of null.
 */
export function useResilientSession() {
  // Get the actual session from Better Auth
  const betterAuthSession = authClient.useSession();
  const { isOffline } = useNetworkStatus();

  // Local state for cached session
  const [cachedSession, setCachedSession] = useState<SessionData>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const hasLoadedCache = useRef(false);

  // Load cached session on mount
  useEffect(() => {
    if (!hasLoadedCache.current) {
      hasLoadedCache.current = true;
      loadCachedSession().then((cached) => {
        if (cached) {
          setCachedSession(cached);
          if (__DEV__) {
            console.log("[useResilientSession] Loaded cached session for user:", cached.user?.email);
          }
        }
        setIsInitialized(true);
      });
    }
  }, []);

  // Update cache when Better Auth session changes (but only when online)
  useEffect(() => {
    if (!isOffline && betterAuthSession.data) {
      // Valid session from server - cache it
      cacheSession(betterAuthSession.data);
      setCachedSession(betterAuthSession.data);
    }
  }, [betterAuthSession.data, isOffline]);

  // Handle session errors - only clear on true auth errors (401/403)
  // 404s, network errors, rate limits, 5xx should NOT clear session
  useEffect(() => {
    if (betterAuthSession.error) {
      if (__DEV__) {
        console.log("[useResilientSession] Session error:", betterAuthSession.error);
      }

      // Check if this is a network error (should NOT clear session)
      if (isNetworkError(betterAuthSession.error) || isOffline) {
        if (__DEV__) {
          console.log("[useResilientSession] Network error detected - keeping cached session");
        }
        return; // Don't clear session on network errors
      }

      // Check if this is a true auth error (401/403 only - should clear session)
      // 404s and other errors will NOT trigger logout
      if (shouldLogoutOnError(betterAuthSession.error)) {
        if (__DEV__) {
          console.log("[useResilientSession] Auth error detected - clearing session");
        }
        clearCachedSession();
        setCachedSession(null);
      } else {
        if (__DEV__) {
          console.log("[useResilientSession] Non-auth error, keeping cached session");
        }
      }
    }
  }, [betterAuthSession.error, isOffline]);

  // Determine which session to return
  const effectiveSession = (() => {
    // If we have a valid session from Better Auth, use it
    if (betterAuthSession.data) {
      return betterAuthSession.data;
    }

    // If offline and we have a cached session, use it
    if (isOffline && cachedSession) {
      return cachedSession;
    }

    // If still loading initial session and we have cache, use cache
    if (betterAuthSession.isPending && cachedSession) {
      return cachedSession;
    }

    // If there was an error but we have a cached session, use it
    // (unless it was a true auth error, which would have cleared the cache)
    if (betterAuthSession.error && cachedSession && !shouldLogoutOnError(betterAuthSession.error)) {
      return cachedSession;
    }

    // No session available
    return null;
  })();

  // Provide a way to force clear the session (for explicit logout)
  const clearSession = useCallback(async () => {
    await clearCachedSession();
    setCachedSession(null);
  }, []);

  // Provide a way to force refetch the session (for profile updates)
  const forceRefetchSession = useCallback(async () => {
    // Check circuit breaker before fetching
    if (isRateLimited()) {
      const remaining = getRateLimitRemaining();
      if (__DEV__) {
        console.log(`[useResilientSession] Skipping refetch: rate-limited for ${remaining} more seconds`);
      }
      return; // Don't fetch if rate-limited
    }
    
    if (__DEV__) {
      console.log("[useResilientSession] Force refetching session...");
    }
    try {
      await betterAuthSession.refetch();
    } catch (error) {
      if (__DEV__) {
        console.log("[useResilientSession] Force refetch error:", error);
      }
    }
  }, [betterAuthSession]);

  return {
    data: effectiveSession,
    isPending: betterAuthSession.isPending && !isInitialized,
    error: betterAuthSession.error,
    refetch: betterAuthSession.refetch,
    isOffline,
    clearSession, // Additional method for explicit logout
    forceRefetchSession, // Additional method to force refresh after profile updates
  };
}

/**
 * Hook to check if user is authenticated (with offline resilience)
 */
export function useIsAuthenticated(): boolean {
  const { data: session, isOffline } = useResilientSession();
  return !!session?.user?.id;
}
