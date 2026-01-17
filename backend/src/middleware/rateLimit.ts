import type { Context, Next } from "hono";

// Simple in-memory rate limiter for production
// For 10K+ users, consider using Redis for distributed rate limiting

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Store rate limit data in memory
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyPrefix?: string; // Prefix for the key (e.g., "auth", "api")
}

// Default configs for different endpoints
export const RATE_LIMIT_CONFIGS = {
  // Auth endpoints - relaxed for better UX
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 50, // 50 attempts per 15 minutes
    keyPrefix: "auth",
  },
  // Email verification - very strict
  emailVerification: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5, // 5 attempts per hour
    keyPrefix: "email-verify",
  },
  // General API - more lenient
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    keyPrefix: "api",
  },
  // Write operations (POST/PUT/DELETE)
  write: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 writes per minute
    keyPrefix: "write",
  },
  // Heavy operations (uploads, exports)
  heavy: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 heavy operations per minute
    keyPrefix: "heavy",
  },
} as const;

/**
 * Get client identifier for rate limiting
 * Uses IP address or user ID if authenticated
 */
function getClientKey(c: Context, prefix: string): string {
  // Try to get user ID from context (set by auth middleware)
  const user = c.get("user");
  if (user?.id) {
    return `${prefix}:user:${user.id}`;
  }

  // Extract real client IP
  // In production (behind Render proxy), trust x-forwarded-for header
  // In development, use direct connection IP
  const isProduction = process.env.NODE_ENV === "production";
  let ip: string;

  if (isProduction) {
    // Trust the first IP in x-forwarded-for chain (client's real IP)
    const forwarded = c.req.header("x-forwarded-for");
    ip = forwarded?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
  } else {
    // In dev, use x-forwarded-for if present (from local proxy), otherwise x-real-ip
    const forwarded = c.req.header("x-forwarded-for");
    ip = forwarded?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
  }

  return `${prefix}:ip:${ip}`;
}

/**
 * Rate limit middleware factory
 */
export function rateLimit(config: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    const key = getClientKey(c, config.keyPrefix || "default");
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Initialize or reset if window expired
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
      };
    }

    entry.count++;
    rateLimitStore.set(key, entry);

    // Set rate limit headers
    const remaining = Math.max(0, config.maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetSeconds));

    // Check if rate limited
    if (entry.count > config.maxRequests) {
      c.header("Retry-After", String(resetSeconds));
      return c.json(
        {
          error: "Too many requests",
          message: `Rate limit exceeded. Try again in ${resetSeconds} seconds.`,
          retryAfter: resetSeconds,
        },
        429
      );
    }

    return next();
  };
}

/**
 * Stricter rate limit for sensitive operations
 * Use for auth, password reset, etc.
 */
export const authRateLimit = rateLimit(RATE_LIMIT_CONFIGS.auth);

/**
 * Rate limit for email verification
 */
export const emailVerificationRateLimit = rateLimit(RATE_LIMIT_CONFIGS.emailVerification);

/**
 * General API rate limit
 */
export const apiRateLimit = rateLimit(RATE_LIMIT_CONFIGS.api);

/**
 * Rate limit for write operations
 */
export const writeRateLimit = rateLimit(RATE_LIMIT_CONFIGS.write);

/**
 * Rate limit for heavy operations
 */
export const heavyRateLimit = rateLimit(RATE_LIMIT_CONFIGS.heavy);

/**
 * Global rate limit middleware - applies to all requests
 * More lenient, catches abuse across the board
 */
export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 200, // 200 requests per minute total
  keyPrefix: "global",
});
