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

  if (!trimmed.includes(".")) {
    return { isValid: false, reason: "no_dot_not_signed" };
  }

  return { isValid: true, reason: "valid" };
}
