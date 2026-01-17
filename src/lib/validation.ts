/**
 * Input Validation Utilities (Frontend)
 * Normalize and validate user inputs before sending to backend.
 */

// ============================================
// Normalizers - call these before sending requests
// ============================================

/**
 * Normalize a search query
 * - Trim whitespace
 * Returns empty string if only whitespace
 */
export function normalizeSearchQuery(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim();
}

/**
 * Normalize a display name
 * - Trim whitespace
 * - Collapse multiple spaces into one
 */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim().replace(/\s+/g, " ");
}

/**
 * Normalize a phone number
 * - Trim whitespace
 * - Keep digits and leading +
 */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Normalize text input (general purpose)
 * - Trim whitespace
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim();
}

// ============================================
// Safe accessors - prevent null/undefined crashes
// ============================================

/**
 * Safely get a user's display name with fallbacks
 */
export function safeDisplayName(
  name: string | null | undefined,
  handle: string | null | undefined,
  email: string | null | undefined
): string {
  if (name?.trim()) return name.trim();
  if (handle?.trim()) return `@${handle.trim().replace(/^@/, "")}`;
  if (email?.trim()) return email.split("@")[0] ?? "User";
  return "User";
}

/**
 * Safely get initials for avatar fallback
 */
export function safeInitials(
  name: string | null | undefined,
  handle: string | null | undefined
): string {
  if (name?.trim()) return name.trim()[0]?.toUpperCase() ?? "?";
  if (handle?.trim()) return handle.trim().replace(/^@/, "")[0]?.toUpperCase() ?? "?";
  return "?";
}

/**
 * Safely get avatar URL or null
 */
export function safeAvatarUrl(
  avatarUrl: string | null | undefined,
  image: string | null | undefined
): string | null {
  return avatarUrl?.trim() || image?.trim() || null;
}

// ============================================
// Validation helpers
// ============================================

export const NAME_MAX_LENGTH = 50;
export const SEARCH_QUERY_MAX_LENGTH = 100;

/**
 * Check if a name is valid
 */
export function isValidName(name: string): boolean {
  const normalized = normalizeName(name);
  return normalized.length > 0 && normalized.length <= NAME_MAX_LENGTH;
}

/**
 * Check if a search query is valid (or empty)
 */
export function isValidSearchQuery(query: string): boolean {
  const normalized = normalizeSearchQuery(query);
  return normalized.length <= SEARCH_QUERY_MAX_LENGTH;
}
