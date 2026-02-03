/**
 * Cached Session Manager
 * 
 * Implements singleton pattern for session fetching with:
 * - Request deduplication (inFlightPromise)
 * - TTL-based caching (60s default)
 * - 429 rate limit backoff without logout
 * - DEV logging for debugging
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { devLog } from './devLog';

export interface Session {
  user?: {
    id: string;
    email: string;
    displayName?: string;
    name?: string;
    handle?: string;
    bio?: string;
    emailVerified?: boolean;
  } | null;
  /** Session-level userId from Better Auth session object */
  sessionUserId?: string | null;
  /** Computed: user.id ?? session.userId ?? null - use this for auth checks */
  effectiveUserId?: string | null;
}

interface CachedSessionData {
  session: Session;
  timestamp: number;
  ttl: number;
}

interface SessionCacheConfig {
  ttl: number; // TTL in milliseconds
  backoffDuration: number; // Rate limit backoff duration
}

const DEFAULT_CONFIG: SessionCacheConfig = {
  ttl: 60 * 1000, // 60 seconds
  backoffDuration: 30 * 1000, // 30 seconds
};

// Singleton state
let inFlightPromise: Promise<Session | null> | null = null;
let lastFetchAt = 0;
let isRateLimited = false;
let rateLimitUntil = 0;
let cachedSession: Session | null = null;

const CACHE_KEY = 'session_cache_v2_with_ttl';

/**
 * Gets cached session with TTL support
 */
export async function getSessionCached(config = DEFAULT_CONFIG): Promise<Session | null> {
  const now = Date.now();

  devLog('[SESSION_CACHE]', 'getSessionCached called');

  // NOTE: With Better Auth, authentication is handled via cookies (credentials: "include").
  // We no longer require a SecureStore token to fetch session - the cookie IS the auth.
  // If no valid cookie exists, the /api/auth/session endpoint will return 401.

  // Check if we're rate limited
  if (isRateLimited && now < rateLimitUntil) {
    const remaining = Math.ceil((rateLimitUntil - now) / 1000);
    devLog('[SESSION_CACHE]', `Rate limited, returning cached session (${remaining}s remaining)`);
    
    // Try to load from cache if we don't have one in memory
    if (!cachedSession) {
      cachedSession = await loadFromCache();
    }
    return cachedSession;
  }

  // Clear rate limit if time has passed
  if (isRateLimited && now >= rateLimitUntil) {
    isRateLimited = false;
    rateLimitUntil = 0;
    devLog('[SESSION_CACHE]', 'Rate limit cleared');
  }

  // If there's an in-flight request, return it
  if (inFlightPromise) {
    devLog('[SESSION_CACHE]', 'Using in-flight request');
    return inFlightPromise;
  }

  // Check if we have valid cached data
  const timeSinceLastFetch = now - lastFetchAt;
  if (cachedSession && timeSinceLastFetch < config.ttl) {
    devLog('[SESSION_CACHE]', `Using cached session (${Math.ceil((config.ttl - timeSinceLastFetch) / 1000)}s remaining)`);
    return cachedSession;
  }

  // Need to fetch - start the request and store as in-flight
  devLog('[SESSION_CACHE]', 'Fetching from network');

  inFlightPromise = fetchSessionFromNetwork(config);
  
  try {
    const session = await inFlightPromise;
    lastFetchAt = now;
    cachedSession = session;
    
    // Save to persistent cache
    if (session) {
      await saveToCache(session, now + config.ttl);
    }
    
    return session;
  } finally {
    // Clear in-flight promise
    inFlightPromise = null;
  }
}

/**
 * Actually fetch session from the network
 */
async function fetchSessionFromNetwork(config: SessionCacheConfig): Promise<Session | null> {
  try {
    // Import authClient locally to avoid circular dependency
    const { authClient } = await import('./authClient');
    
    // Call the authoritative /api/auth/session endpoint
    // Returns 401 if user is null (not authenticated)
    const data = await authClient.$fetch<{ user: any; session: any }>("/api/auth/session", {
      method: "GET",
    });

    // Parse response: expect { user, session }
    if (data && typeof data === "object") {
      // Extract session-level userId (Better Auth stores userId on session object)
      const sessionUserId = data.session?.userId ?? null;
      const userId = data.user?.id ?? null;
      
      // Compute effectiveUserId: prefer user.id, fallback to session.userId
      const effectiveUserId = userId ?? sessionUserId ?? null;
      
      devLog('[SESSION_CACHE]', `Parsed session - userId: ${userId}, sessionUserId: ${sessionUserId}, effectiveUserId: ${effectiveUserId}`);
      
      // Build unified session object with effectiveUserId
      const session: Session = {
        user: data.user ?? null,
        sessionUserId,
        effectiveUserId,
      };
      
      // Return session if we have any form of userId
      if (effectiveUserId) {
        return session;
      }
      
      // No userId anywhere - not authenticated
      return null;
    }
    return null;
    
  } catch (error: any) {
    devLog('[SESSION_CACHE]', 'Network fetch error:', error.message);

    // Handle 429 rate limiting
    if (error.status === 429) {
      isRateLimited = true;
      rateLimitUntil = Date.now() + config.backoffDuration;
      
      devLog('[SESSION_CACHE]', `Rate limited, backing off for ${config.backoffDuration / 1000}s`);
      
      // Return cached session if available instead of null
      if (!cachedSession) {
        cachedSession = await loadFromCache();
      }
      return cachedSession;
    }

    // For 401, user is not authenticated - clear and return null
    if (error.status === 401) {
      devLog('[SESSION_CACHE]', 'Auth error 401, clearing session');
      await clearCache();
      return null;
    }

    // For other errors, try to return cached session
    if (!cachedSession) {
      cachedSession = await loadFromCache();
    }
    
    return cachedSession;
  }
}

/**
 * Load session from persistent cache
 */
async function loadFromCache(): Promise<Session | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedSessionData = JSON.parse(cached);
    
    // Check if cached data is still valid
    if (Date.now() > data.ttl) {
      await AsyncStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return data.session;
  } catch (error) {
    devLog('[SESSION_CACHE]', 'Error loading from cache:', error);
    return null;
  }
}

/**
 * Save session to persistent cache
 */
async function saveToCache(session: Session, ttl: number): Promise<void> {
  try {
    const data: CachedSessionData = {
      session,
      timestamp: Date.now(),
      ttl,
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    devLog('[SESSION_CACHE]', 'Error saving to cache:', error);
  }
}

/**
 * Clear cached session
 */
export async function clearSessionCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
    cachedSession = null;
    inFlightPromise = null;
    lastFetchAt = 0;
  } catch (error) {
    devLog('[SESSION_CACHE]', 'Error clearing cache:', error);
  }
}

/**
 * Internal: Clear cached session (backward compatibility)
 */
async function clearCache(): Promise<void> {
  return clearSessionCache();
}

/**
 * Force refresh session (clears cache and forces network fetch)
 */
export async function forceRefreshSession(): Promise<Session | null> {
  devLog('[SESSION_CACHE]', 'Force refresh requested');
  
  // Clear cache state
  cachedSession = null;
  lastFetchAt = 0;
  inFlightPromise = null;
  await clearCache();
  
  // Fetch fresh
  return getSessionCached();
}

/**
 * Get current cached session without network call
 */
export function getCurrentCachedSession(): Session | null {
  return cachedSession;
}