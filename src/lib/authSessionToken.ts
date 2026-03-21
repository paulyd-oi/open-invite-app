const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Better Auth session tokens are random alphanumeric strings (e.g. 32 chars),
  // NOT JWTs. The dot-separated format (token.signature) only appears in
  // Set-Cookie headers, not in the response body `token` field. Both formats
  // are valid — the backend resolves either via Better Auth or DB fallback.

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
