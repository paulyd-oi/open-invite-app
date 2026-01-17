/**
 * Input Validation Utilities
 * Centralized validation for all user inputs with consistent error responses.
 */

import { z } from "zod";

// ============================================
// Validation Constants
// ============================================

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;
export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 50;
export const SEARCH_QUERY_MAX_LENGTH = 100;

// Reserved handles that cannot be used
export const RESERVED_HANDLES = [
  "admin", "support", "openinvite", "open-invite", "openinviteapp",
  "settings", "friends", "calendar", "discover", "profile", "me",
  "help", "about", "terms", "privacy", "api", "app", "user", "users",
  "event", "events", "circle", "circles", "group", "groups",
  "notification", "notifications", "subscription", "invite", "invites",
  "search", "feed", "home", "login", "logout", "signup", "signin",
  "register", "auth", "account", "premium", "pro", "free", "billing",
];

// ============================================
// Standard Error Response Type
// ============================================

export interface ValidationError {
  error: {
    code: "VALIDATION_ERROR";
    message: string;
    fields: Array<{ field: string; reason: string }>;
  };
}

/**
 * Create a standard validation error response
 */
export function createValidationError(fields: Array<{ field: string; reason: string }>): ValidationError {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      fields,
    },
  };
}

// ============================================
// Normalizers
// ============================================

/**
 * Normalize a handle for storage
 * - Trim whitespace
 * - Lowercase
 * - Remove spaces
 * - Strip leading @ symbols
 */
export function normalizeHandle(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "") // Remove all spaces
    .replace(/^@+/, ""); // Remove leading @ symbols
}

/**
 * Normalize a phone number
 * - Trim whitespace
 * - Keep digits and leading +
 * - Basic E.164 format validation
 */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  // Keep only digits and + at the start
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : digits;
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
 * Normalize a search query
 * - Trim whitespace
 * - Return empty string if only whitespace
 */
export function normalizeSearchQuery(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim();
}

// ============================================
// Validators (return field errors)
// ============================================

export interface FieldError {
  field: string;
  reason: string;
}

/**
 * Validate a handle
 * Must be 3-20 chars, contain only [a-z0-9._], start with letter/number
 */
export function validateHandle(handle: string, fieldName = "handle"): FieldError | null {
  if (!handle) return null; // Empty is allowed (optional field)

  if (handle.length < HANDLE_MIN_LENGTH) {
    return { field: fieldName, reason: `Must be at least ${HANDLE_MIN_LENGTH} characters` };
  }

  if (handle.length > HANDLE_MAX_LENGTH) {
    return { field: fieldName, reason: `Must be at most ${HANDLE_MAX_LENGTH} characters` };
  }

  // Must start with letter or number
  if (!/^[a-z0-9]/.test(handle)) {
    return { field: fieldName, reason: "Must start with a letter or number" };
  }

  // Allowed characters: a-z, 0-9, underscore, dot
  if (!/^[a-z0-9][a-z0-9._]*$/.test(handle)) {
    return { field: fieldName, reason: "Must be 3-20 chars and contain only letters, numbers, dot, underscore" };
  }

  // Cannot end with . or _
  if (/[._]$/.test(handle)) {
    return { field: fieldName, reason: "Cannot end with a dot or underscore" };
  }

  // No consecutive dots or underscores
  if (/[._]{2,}/.test(handle)) {
    return { field: fieldName, reason: "Cannot have consecutive dots or underscores" };
  }

  // Reserved handles check
  if (RESERVED_HANDLES.includes(handle)) {
    return { field: fieldName, reason: "This username is unavailable" };
  }

  return null;
}

/**
 * Validate a phone number (basic E.164-ish validation)
 * Must have 7-15 digits, optionally starting with +
 */
export function validatePhone(phone: string, fieldName = "phone"): FieldError | null {
  if (!phone) return null; // Empty is allowed (optional field)

  const digits = phone.replace(/[^\d]/g, "");

  if (digits.length < 7) {
    return { field: fieldName, reason: "Phone number must have at least 7 digits" };
  }

  if (digits.length > 15) {
    return { field: fieldName, reason: "Phone number must have at most 15 digits" };
  }

  // Basic E.164 format: optional + followed by digits only
  if (!/^\+?\d+$/.test(phone)) {
    return { field: fieldName, reason: "Invalid phone number format" };
  }

  return null;
}

/**
 * Validate a display name
 * Must be 1-50 chars after normalization
 */
export function validateName(name: string, fieldName = "name"): FieldError | null {
  if (!name) return null; // Empty might be allowed depending on context

  if (name.length < NAME_MIN_LENGTH) {
    return { field: fieldName, reason: `Must be at least ${NAME_MIN_LENGTH} character` };
  }

  if (name.length > NAME_MAX_LENGTH) {
    return { field: fieldName, reason: `Must be at most ${NAME_MAX_LENGTH} characters` };
  }

  return null;
}

/**
 * Validate a search query
 * Empty after trim returns null (treat as no-op)
 */
export function validateSearchQuery(query: string, fieldName = "query"): FieldError | null {
  // Empty query is valid (returns empty results)
  if (!query) return null;

  if (query.length > SEARCH_QUERY_MAX_LENGTH) {
    return { field: fieldName, reason: `Search query must be at most ${SEARCH_QUERY_MAX_LENGTH} characters` };
  }

  return null;
}

// ============================================
// Zod Schemas for Request Validation
// ============================================

/**
 * Handle schema with normalization and validation
 */
export const handleSchema = z
  .string()
  .optional()
  .transform((val) => (val ? normalizeHandle(val) : undefined))
  .refine(
    (val) => {
      if (!val) return true;
      return validateHandle(val) === null;
    },
    { message: "Must be 3-20 chars and contain only letters, numbers, dot, underscore" }
  );

/**
 * Phone schema with normalization and validation
 */
export const phoneSchema = z
  .string()
  .optional()
  .nullable()
  .transform((val) => (val ? normalizePhone(val) : null))
  .refine(
    (val) => {
      if (!val) return true;
      return validatePhone(val) === null;
    },
    { message: "Invalid phone number format (must be 7-15 digits)" }
  );

/**
 * Name schema with normalization and validation
 */
export const nameSchema = z
  .string()
  .optional()
  .transform((val) => (val ? normalizeName(val) : undefined))
  .refine(
    (val) => {
      if (!val) return true;
      return validateName(val) === null;
    },
    { message: "Name must be 1-50 characters" }
  );

/**
 * Search query schema with normalization
 */
export const searchQuerySchema = z
  .string()
  .transform((val) => normalizeSearchQuery(val))
  .refine(
    (val) => validateSearchQuery(val) === null,
    { message: "Search query too long" }
  );

// ============================================
// Public User DTO (for Task 12)
// ============================================

/**
 * Public user shape - NEVER includes email or phone
 * Use this for all public-facing user data
 */
export interface PublicUserDTO {
  id: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
}

/**
 * Transform a full user model to PublicUserDTO
 * This ensures no sensitive data (email, phone) leaks
 */
export function toPublicUserDTO(user: {
  id: string;
  name?: string | null;
  image?: string | null;
  Profile?: { handle?: string | null; avatarUrl?: string | null } | null;
}): PublicUserDTO {
  return {
    id: user.id,
    name: user.name ?? null,
    handle: user.Profile?.handle ?? null,
    avatarUrl: user.Profile?.avatarUrl ?? user.image ?? null,
  };
}

/**
 * Extended public user with mutual count and friend status
 * For search results
 */
export interface PublicUserWithMutuals extends PublicUserDTO {
  mutualCount?: number;
  isFriend?: boolean;
}

/**
 * Team member DTO with role
 */
export interface TeamMemberDTO extends PublicUserDTO {
  role: string;
}
