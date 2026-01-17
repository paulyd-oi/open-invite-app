/**
 * Apple Sign In Authentication Route
 *
 * Verifies Apple identity tokens using JWKS and creates/links user accounts.
 *
 * Flow:
 * 1. Client sends Apple identityToken from expo-apple-authentication
 * 2. Server fetches Apple's JWKS public keys (cached, handles key rotation via kid)
 * 3. Server verifies the JWT signature, issuer, audience, and expiration
 * 4. Server finds or creates user based on Apple's `sub` claim
 * 5. Server creates a session and returns session token + user data
 *
 * Security Notes:
 * - Nonce: NOT implemented. For native iOS apps using expo-apple-authentication,
 *   nonce is optional. The identity token is already tied to the device/app.
 * - Account Linking: Only links by email if email_verified === true in token.
 * - Logging: NEVER logs identityToken or authorizationCode.
 */

import { Hono } from "hono";
import { z } from "zod";
import * as jose from "jose";
import { db } from "../db";
import { type AppType } from "../types";

// Apple JWKS endpoint
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

// Expected issuer for Apple ID tokens
const APPLE_ISSUER = "https://appleid.apple.com";

// Bundle ID for audience verification (from env or fallback to hardcoded)
const APPLE_IOS_CLIENT_ID = process.env.APPLE_IOS_CLIENT_ID || "com.vibecode.openinvite.0qi5wk";

// Request schema - note: we accept but NEVER log identityToken or authorizationCode
const appleAuthRequestSchema = z.object({
  identityToken: z.string().min(1, "identityToken is required"),
  user: z.object({
    email: z.string().email().optional().nullable(),
    name: z.object({
      firstName: z.string().optional().nullable(),
      lastName: z.string().optional().nullable(),
    }).optional().nullable(),
  }).optional().nullable(),
  authorizationCode: z.string().optional().nullable(),
  nonce: z.string().optional().nullable(),
});

// JWKS cache with TTL
// jose.createRemoteJWKSet handles key rotation automatically via the `kid` header
let cachedJWKS: jose.JWTVerifyGetKey | null = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Get Apple's JWKS (cached for 1 hour)
 * jose.createRemoteJWKSet automatically:
 * - Fetches keys from Apple's JWKS endpoint
 * - Matches the correct key using the `kid` (key ID) from the JWT header
 * - Handles key rotation when Apple adds/removes keys
 */
async function getAppleJWKS(): Promise<jose.JWTVerifyGetKey> {
  const now = Date.now();
  if (cachedJWKS && now - jwksCacheTime < JWKS_CACHE_TTL) {
    return cachedJWKS;
  }

  console.log("🍎 [Apple Auth] Refreshing JWKS cache from Apple...");
  cachedJWKS = jose.createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  jwksCacheTime = now;
  return cachedJWKS;
}

/**
 * Token payload from Apple identity token
 */
interface AppleTokenPayload {
  sub: string;           // Unique Apple user ID (stable across sign-ins)
  email?: string;        // User's email (may be private relay)
  email_verified?: boolean | string; // Apple sends "true" as string sometimes
  is_private_email?: boolean | string;
  aud: string;           // Must match our bundle ID
  iss: string;           // Must be https://appleid.apple.com
  exp: number;           // Expiration timestamp
  iat: number;           // Issued at timestamp
  nonce?: string;        // Optional nonce (not implemented)
  nonce_supported?: boolean;
  auth_time?: number;
}

/**
 * Verify Apple identity token with strict validation
 */
async function verifyAppleToken(identityToken: string): Promise<AppleTokenPayload> {
  const jwks = await getAppleJWKS();

  // jose.jwtVerify automatically:
  // 1. Parses the JWT header to get `kid`
  // 2. Fetches the matching public key from JWKS
  // 3. Verifies the signature
  // 4. Validates issuer and audience
  // 5. Checks expiration (exp claim)
  const { payload } = await jose.jwtVerify(identityToken, jwks, {
    issuer: APPLE_ISSUER,
    audience: APPLE_IOS_CLIENT_ID,
  });

  // Validate required claims
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Invalid token: missing sub claim");
  }

  // Double-check expiration (jose does this, but be explicit)
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("Token has expired");
  }

  return payload as AppleTokenPayload;
}

/**
 * Check if email_verified is truthy (Apple sometimes sends "true" as string)
 */
function isEmailVerified(value: boolean | string | undefined): boolean {
  if (value === true || value === "true") return true;
  return false;
}

export const appleAuthRouter = new Hono<AppType>();

/**
 * POST /api/auth/apple
 *
 * Authenticates a user with Apple Sign In.
 *
 * Request body:
 * - identityToken: JWT from Apple (NEVER logged)
 * - user: Optional user info (only provided on first sign in)
 *   - email: User's email
 *   - name: { firstName, lastName }
 *
 * Response:
 * - ok: boolean (aliased as success for compatibility)
 * - token: session token
 * - user: User object
 */
appleAuthRouter.post("/apple", async (c) => {
  // SECURITY: Only log that request was received, never log tokens
  console.log("🍎 [Apple Auth] Received authentication request");

  try {
    // Parse and validate request body
    const body = await c.req.json();
    const result = appleAuthRequestSchema.safeParse(body);

    if (!result.success) {
      // SECURITY: Only log field errors, not actual values
      console.log("🍎 [Apple Auth] Invalid request body - validation failed");
      return c.json({
        ok: false,
        success: false,
        error: "Invalid request body",
      }, 400);
    }

    const { identityToken, user: appleUserInfo } = result.data;
    // SECURITY: NEVER log identityToken or authorizationCode

    // Verify the Apple identity token
    let tokenPayload: AppleTokenPayload;
    try {
      tokenPayload = await verifyAppleToken(identityToken);
      // SECURITY: Only log sub (user ID), never the full token
      console.log("🍎 [Apple Auth] Token verified for sub:", tokenPayload.sub.substring(0, 8) + "...");
    } catch (verifyError: unknown) {
      const message = verifyError instanceof Error ? verifyError.message : "Unknown verification error";
      console.error("🍎 [Apple Auth] Token verification failed:", message);
      return c.json({
        ok: false,
        success: false,
        error: "Token verification failed",
        details: message,
      }, 401);
    }

    const appleSub = tokenPayload.sub;

    // Extract email - prefer from token (cryptographically verified)
    const tokenEmail = tokenPayload.email?.toLowerCase() || null;
    const tokenEmailVerified = isEmailVerified(tokenPayload.email_verified);

    // User info from first sign-in (unverified, use only for display name)
    const firstName = appleUserInfo?.name?.firstName || null;
    const lastName = appleUserInfo?.name?.lastName || null;
    const displayName = firstName && lastName
      ? `${firstName} ${lastName}`.trim()
      : firstName || lastName || null;

    // ========== ACCOUNT LOOKUP/CREATION LOGIC ==========
    // Priority:
    // 1. Find existing account by Apple sub (most secure)
    // 2. If email provided AND verified, check for email-based linking
    // 3. Create new account

    let user;

    // Step 1: Check if user already exists with this Apple ID (most common case for returning users)
    const existingAccount = await db.account.findFirst({
      where: {
        providerId: "apple",
        accountId: appleSub,
      },
      include: {
        user: true,
      },
    });

    if (existingAccount?.user) {
      // Returning user - use existing account
      user = existingAccount.user;
      console.log("🍎 [Apple Auth] Found existing Apple user:", user.id);
    } else if (tokenEmail && tokenEmailVerified) {
      // Step 2: Email linking - ONLY if email is from token AND verified
      // This is secure because:
      // - Email comes from Apple's signed JWT (can't be spoofed)
      // - email_verified confirms Apple has verified this email
      // - Apple's private relay emails are still valid identifiers

      const existingUser = await db.user.findUnique({
        where: { email: tokenEmail },
        include: {
          account: {
            where: { providerId: "apple" },
          },
        },
      });

      if (existingUser) {
        // Check if this user already has a DIFFERENT Apple account linked
        if (existingUser.account.length > 0) {
          // User has a different Apple sub - this is suspicious
          // Could be: same email, different Apple ID (rare but possible with Apple ID changes)
          console.warn("🍎 [Apple Auth] Email exists with different Apple sub - rejecting link");
          return c.json({
            ok: false,
            success: false,
            error: "This email is already linked to a different Apple account. Please contact support.",
          }, 409);
        }

        // Safe to link - user exists but has no Apple account
        await db.account.create({
          data: {
            id: `apple_${appleSub}`,
            providerId: "apple",
            accountId: appleSub,
            userId: existingUser.id,
          },
        });
        user = existingUser;
        console.log("🍎 [Apple Auth] Linked Apple to existing email user:", user.id);
      } else {
        // Step 3a: Create new user with verified email
        user = await db.user.create({
          data: {
            email: tokenEmail,
            name: displayName || "Apple User",
            emailVerified: true, // Verified by Apple
            account: {
              create: {
                id: `apple_${appleSub}`,
                providerId: "apple",
                accountId: appleSub,
              },
            },
          },
        });
        console.log("🍎 [Apple Auth] Created new user with verified email:", user.id);
      }
    } else {
      // Step 3b: No email or unverified - create user with NULL email
      // This happens when:
      // - User chose "Hide My Email" and it's their first sign-in
      // - Apple didn't include email in token (rare)
      // - Email is present but not verified (we don't trust unverified)
      //
      // IMPORTANT: We do NOT create placeholder emails like "apple_xxx@apple.private"
      // Instead, user.email is NULL. Identity is keyed by account(providerId, accountId).

      // For returning users without email, we need to find them by Apple sub
      // This case is already handled in Step 1 (existingAccount check)
      // If we reach here, it's a new user

      user = await db.user.create({
        data: {
          email: null, // No email - identity is via Apple account
          name: displayName || "Apple User",
          emailVerified: false, // No email to verify
          account: {
            create: {
              id: `apple_${appleSub}`,
              providerId: "apple",
              accountId: appleSub,
            },
          },
        },
      });
      console.log("🍎 [Apple Auth] Created new user without email:", user.id);
    }

    // Create a session for the user
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
    const sessionToken = crypto.randomUUID();

    const session = await db.session.create({
      data: {
        id: crypto.randomUUID(),
        token: sessionToken,
        userId: user.id,
        expiresAt,
        ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
        userAgent: c.req.header("user-agent") || null,
      },
    });

    console.log("🍎 [Apple Auth] Session created for user:", user.id);

    // Return success response with stable shape
    return c.json({
      ok: true,
      success: true,
      token: session.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
      },
    });

  } catch (error: unknown) {
    // SECURITY: Log error message but never log tokens
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("🍎 [Apple Auth] Error:", message);

    return c.json({
      ok: false,
      success: false,
      error: "Authentication failed",
    }, 500);
  }
});

/**
 * GET /api/auth/apple/status
 *
 * Health check for Apple Sign In configuration
 */
appleAuthRouter.get("/apple/status", async (c) => {
  return c.json({
    configured: true,
    clientId: APPLE_IOS_CLIENT_ID,
    jwksUrl: APPLE_JWKS_URL,
    // SECURITY: Never expose env vars or secrets
  });
});
