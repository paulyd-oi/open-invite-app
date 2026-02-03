/**
 * Rate Limit State Manager
 * 
 * Prevents auth bootstrap and session fetch from spamming backend
 * when rate-limited (HTTP 429 / "Rate limit exceeded").
 */

import { devLog } from "./devLog";

// In-memory state (persists across renders but not app restarts)
let rateLimitedUntil: number | null = null;

/**
 * Check if we're currently rate-limited
 */
export function isRateLimited(): boolean {
  if (!rateLimitedUntil) return false;
  
  const now = Date.now();
  if (now >= rateLimitedUntil) {
    // Rate limit expired
    rateLimitedUntil = null;
    return false;
  }
  
  return true;
}

/**
 * Get remaining rate limit time in seconds
 */
export function getRateLimitRemaining(): number {
  if (!rateLimitedUntil) return 0;
  
  const now = Date.now();
  const remaining = Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
  return remaining;
}

/**
 * Set rate limit state based on error response
 * Parses "Try again in X seconds" from error message or uses retry-after header
 */
export function setRateLimited(error: any): void {
  // Try to get retry-after from header
  const retryAfterHeader = error?.headers?.['retry-after'] || 
                          error?.response?.headers?.['retry-after'];
  
  let retryAfterSeconds = 0;
  
  if (retryAfterHeader) {
    retryAfterSeconds = parseInt(retryAfterHeader);
  } else {
    // Parse from error message: "Try again in X seconds"
    const message = error?.message || "";
    const match = message.match(/try again in (\d+) seconds?/i);
    if (match) {
      retryAfterSeconds = parseInt(match[1]);
    }
  }
  
  // Default to 60 seconds if we can't determine
  if (!retryAfterSeconds || retryAfterSeconds <= 0) {
    retryAfterSeconds = 60;
  }
  
  // Cap at 10 minutes to prevent indefinite lockout
  retryAfterSeconds = Math.min(retryAfterSeconds, 600);
  
  rateLimitedUntil = Date.now() + (retryAfterSeconds * 1000);
  
  if (__DEV__) {
    devLog(`[RateLimit] Rate-limited until ${new Date(rateLimitedUntil).toLocaleTimeString()} (${retryAfterSeconds}s)`);
  }
}

/**
 * Clear rate limit state (e.g., after successful request)
 */
export function clearRateLimit(): void {
  rateLimitedUntil = null;
  if (__DEV__) {
    devLog("[RateLimit] Rate limit cleared");
  }
}
