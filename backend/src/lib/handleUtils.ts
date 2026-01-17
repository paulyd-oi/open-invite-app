/**
 * Handle (username) utility functions for backend
 * Single source of truth for handle formatting, normalization, and validation.
 */

// Reserved handles that cannot be used
export const RESERVED_HANDLES = [
  "admin",
  "support",
  "openinvite",
  "open-invite",
  "openinviteapp",
  "settings",
  "friends",
  "calendar",
  "discover",
  "profile",
  "me",
  "help",
  "about",
  "terms",
  "privacy",
  "api",
  "app",
  "user",
  "users",
  "event",
  "events",
  "circle",
  "circles",
  "group",
  "groups",
  "notification",
  "notifications",
  "subscription",
  "invite",
  "invites",
  "search",
  "feed",
  "home",
  "login",
  "logout",
  "signup",
  "signin",
  "register",
  "auth",
  "account",
];

// Validation rules
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;
export const HANDLE_REGEX = /^[a-z0-9][a-z0-9._]*$/;

export interface HandleValidationResult {
  valid: boolean;
  error?: string;
  code?: "TOO_SHORT" | "TOO_LONG" | "INVALID_START" | "INVALID_CHARS" | "INVALID_END" | "CONSECUTIVE_SPECIAL" | "RESERVED";
}

/**
 * Normalize a handle for storage
 * - Lowercase
 * - Trim whitespace
 * - Strip leading @ if present
 * @param input The raw input from user
 * @returns Normalized handle (no @, lowercase)
 */
export function normalizeHandle(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/^@+/, ""); // Remove leading @ symbols
}

/**
 * Validate a handle (server-authoritative)
 * @param handle The handle to validate (should already be normalized)
 * @returns Validation result with error message and code if invalid
 */
export function validateHandle(handle: string): HandleValidationResult {
  if (!handle) {
    return { valid: true }; // Empty handle is allowed (optional field)
  }

  // Length check
  if (handle.length < HANDLE_MIN_LENGTH) {
    return {
      valid: false,
      error: `Username must be at least ${HANDLE_MIN_LENGTH} characters`,
      code: "TOO_SHORT",
    };
  }

  if (handle.length > HANDLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `Username must be at most ${HANDLE_MAX_LENGTH} characters`,
      code: "TOO_LONG",
    };
  }

  // Must start with letter or number (not . or _)
  if (!/^[a-z0-9]/.test(handle)) {
    return {
      valid: false,
      error: "Username must start with a letter or number",
      code: "INVALID_START",
    };
  }

  // Allowed characters: a-z, 0-9, underscore, dot
  if (!HANDLE_REGEX.test(handle)) {
    return {
      valid: false,
      error: "Username can only contain letters, numbers, underscores, and dots",
      code: "INVALID_CHARS",
    };
  }

  // Cannot end with . or _
  if (/[._]$/.test(handle)) {
    return {
      valid: false,
      error: "Username cannot end with a dot or underscore",
      code: "INVALID_END",
    };
  }

  // No consecutive dots or underscores
  if (/[._]{2,}/.test(handle)) {
    return {
      valid: false,
      error: "Username cannot have consecutive dots or underscores",
      code: "CONSECUTIVE_SPECIAL",
    };
  }

  // Reserved handles check
  if (RESERVED_HANDLES.includes(handle)) {
    return {
      valid: false,
      error: "This username is unavailable",
      code: "RESERVED",
    };
  }

  return { valid: true };
}
