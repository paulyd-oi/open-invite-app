/**
 * Cron Authentication Middleware
 * Validates CRON_SECRET for scheduled job endpoints
 *
 * Header: X-Cron-Secret
 * Env: CRON_SECRET
 *
 * Returns:
 * - 401 { ok: false, error: "CRON_AUTH_FAILED" } if invalid/missing
 * - 500 { ok: false, error: "CRON_SECRET_NOT_SET" } if env not configured
 */

import { type Context, type Next } from "hono";
import { createHash } from "crypto";

/**
 * Create a short hash for debugging (first 8 chars of SHA-256)
 * Safe to log - doesn't expose the actual secret
 */
function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

/**
 * Middleware to validate cron requests using CRON_SECRET
 * Use this for all /api/cron/* endpoints
 *
 * Debug logging includes:
 * - Whether header is present
 * - Length comparison (no actual values)
 * - Hash comparison for troubleshooting mismatches
 */
export async function cronAuth(c: Context, next: Next) {
  const cronSecret = c.req.header("X-Cron-Secret");
  const expectedSecret = process.env.CRON_SECRET;
  const path = c.req.path;

  // Check if CRON_SECRET is configured
  if (!expectedSecret) {
    console.error(`[cronAuth] ${path} - CRON_SECRET environment variable not set`);
    return c.json({ ok: false, error: "CRON_SECRET_NOT_SET" }, 500);
  }

  // Debug logging (safe - no secrets exposed)
  const debugInfo = {
    path,
    hasHeader: !!cronSecret,
    incomingLength: cronSecret?.length ?? 0,
    expectedLength: expectedSecret.length,
    lengthMatch: cronSecret?.length === expectedSecret.length,
  };

  // Validate the provided secret
  if (!cronSecret || cronSecret !== expectedSecret) {
    // Enhanced debug info for failed auth (still no secrets)
    const failureDebug = {
      ...debugInfo,
      incomingHash: cronSecret ? shortHash(cronSecret) : "N/A",
      expectedHash: shortHash(expectedSecret),
      hashMatch: cronSecret ? shortHash(cronSecret) === shortHash(expectedSecret) : false,
    };
    console.warn(`[cronAuth] Auth FAILED for ${path}`, JSON.stringify(failureDebug));
    return c.json({ ok: false, error: "CRON_AUTH_FAILED" }, 401);
  }

  // Success - minimal logging
  console.log(`[cronAuth] Auth OK for ${path} (len=${cronSecret.length})`);
  await next();
}
