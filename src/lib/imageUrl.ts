/**
 * Image URL Resolution Helper
 *
 * Converts relative avatar paths to absolute URLs that work on devices.
 * Ensures Image components never receive relative URIs.
 *
 * Usage:
 * - resolveImageUrl(user.image) for session avatars
 * - resolveImageUrl(profile.avatarUrl) for profile avatars
 */

import { BACKEND_URL } from "./config";
import { devWarn } from "./devLog";

/**
 * Resolve image path to absolute URL
 *
 * @param pathOrUrl - Can be:
 *   - null/undefined → returns null
 *   - Absolute URL (http/https) → returns as-is
 *   - Relative path (/uploads/...) → prefixes with backend URL
 *   - Empty string → returns null
 *
 * @returns Absolute URL or null
 *
 * @example
 * resolveImageUrl("/uploads/abc123.jpg")
 * // → "https://api.openinvite.cloud/uploads/abc123.jpg"
 *
 * resolveImageUrl("https://example.com/image.jpg")
 * // → "https://example.com/image.jpg"
 *
 * resolveImageUrl(null)
 * // → null
 */
export function resolveImageUrl(pathOrUrl: string | null | undefined): string | null {
  // Handle null/undefined/empty
  if (!pathOrUrl || pathOrUrl.trim() === "") {
    return null;
  }

  const trimmed = pathOrUrl.trim();

  // Already absolute URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Relative path - prefix with backend URL
  if (trimmed.startsWith("/")) {
    return `${BACKEND_URL}${trimmed}`;
  }

  // Unexpected format - log warning and return null
  if (__DEV__) {
    devWarn("[resolveImageUrl] Unexpected image path format:", trimmed);
  }
  return null;
}

/**
 * Batch resolve multiple image URLs
 */
export function resolveImageUrls(paths: Array<string | null | undefined>): Array<string | null> {
  return paths.map(resolveImageUrl);
}
