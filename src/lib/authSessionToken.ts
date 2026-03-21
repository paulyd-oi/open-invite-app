const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accepted token shapes (Better Auth):
 *   1. Opaque body token — alphanumeric, typically 32 chars
 *      Example: "rkzZaB5DIFcEu5GUHH1xRTT50arlxUjB"
 *   2. Cookie-style signed token — two dot-separated segments,
 *      each alphanumeric / base64-safe (A-Z a-z 0-9 + / = % -)
 *      Example: "rkzZaB5DIFcEu5GUHH1xRTT50arlxUjB.Kq8vSdzWSfnWOrTpn%2FbhOA..."
 *
 * Allowed characters: alphanumeric, dot, hyphen, underscore, plus, slash,
 * equals, percent (for URL-encoded cookie values). No whitespace or other
 * punctuation.
 */
const SAFE_TOKEN_CHARS = /^[A-Za-z0-9._\-+/=%]+$/;

export const BETTER_AUTH_SESSION_COOKIE_NAME = "__Secure-better-auth.session_token";

export function isValidBetterAuthToken(token: unknown): { isValid: boolean; reason: string } {
  if (!token || typeof token !== "string") {
    return { isValid: false, reason: "empty_or_not_string" };
  }

  const trimmed = token.trim();

  if (trimmed.length < 20) {
    return { isValid: false, reason: "too_short" };
  }

  if (UUID_PATTERN.test(trimmed)) {
    return { isValid: false, reason: "uuid_pattern" };
  }

  if (!SAFE_TOKEN_CHARS.test(trimmed)) {
    return { isValid: false, reason: "unsafe_characters" };
  }

  return { isValid: true, reason: "valid" };
}

export function formatReactNativeCookieHeader(cookiePair: string): string {
  if (!cookiePair) {
    return "";
  }

  // Cookie header value must NOT start with "; " — that's malformed.
  // Strip any leading semicolons/spaces and return the clean cookie pair.
  return cookiePair.replace(/^[;\s]+/, "");
}
