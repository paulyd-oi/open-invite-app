/**
 * Handle (username) utility functions
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
}

/**
 * Format a handle for display (adds @ prefix)
 * @param handle The raw handle string (without @)
 * @returns The handle with @ prefix, or null if no handle
 */
export function formatHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const normalized = normalizeHandle(handle);
  return normalized ? `@${normalized}` : null;
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
 * Validate a handle
 * @param handle The handle to validate (should already be normalized)
 * @returns Validation result with error message if invalid
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
    };
  }

  if (handle.length > HANDLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `Username must be at most ${HANDLE_MAX_LENGTH} characters`,
    };
  }

  // Must start with letter or number (not . or _)
  if (!/^[a-z0-9]/.test(handle)) {
    return {
      valid: false,
      error: "Username must start with a letter or number",
    };
  }

  // Allowed characters: a-z, 0-9, underscore, dot
  if (!HANDLE_REGEX.test(handle)) {
    return {
      valid: false,
      error: "Username can only contain letters, numbers, underscores, and dots",
    };
  }

  // Cannot end with . or _
  if (/[._]$/.test(handle)) {
    return {
      valid: false,
      error: "Username cannot end with a dot or underscore",
    };
  }

  // No consecutive dots or underscores
  if (/[._]{2,}/.test(handle)) {
    return {
      valid: false,
      error: "Username cannot have consecutive dots or underscores",
    };
  }

  // Reserved handles check
  if (RESERVED_HANDLES.includes(handle)) {
    return {
      valid: false,
      error: "This username is unavailable",
    };
  }

  return { valid: true };
}

/**
 * Get display name for a user with handle fallback
 * @param name User's display name
 * @param handle User's handle
 * @returns Display string (name or @handle or "User")
 */
export function getDisplayIdentity(
  name: string | null | undefined,
  handle: string | null | undefined
): string {
  if (name) return name;
  if (handle) return `@${normalizeHandle(handle)}`;
  return "User";
}
