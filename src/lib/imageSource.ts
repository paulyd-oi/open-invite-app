/**
 * Image Source Helper with Authentication Support
 *
 * Creates React Native Image source objects with Authorization headers
 * when the image URL points to protected API endpoints.
 *
 * Usage:
 * - const source = await getImageSource(avatarUri);
 * - <Image source={source} />
 */

import { BACKEND_URL } from "./config";
import { getAuthToken } from "./authClient";
import { resolveImageUrl } from "./imageUrl";

/**
 * Check if a URL requires authentication headers
 *
 * Returns true if URL points to our backend API (protected endpoints)
 * Returns false for /uploads/ paths which are served publicly
 */
function requiresAuth(url: string | null | undefined): boolean {
  if (!url) return false;

  const trimmed = url.trim();
  
  // /uploads/ paths are PUBLIC - no auth required
  // Backend serves these directly without authentication
  if (trimmed.startsWith("/uploads/") || trimmed.includes("/uploads/")) {
    return false;
  }

  // Check if URL contains our backend domain
  if (trimmed.includes("open-invite-api.onrender.com")) {
    // Even on backend domain, /uploads/ is public
    if (trimmed.includes("/uploads/")) {
      return false;
    }
    return true;
  }

  // Check if URL contains localhost (dev environment)
  if (trimmed.includes("localhost") || trimmed.includes("127.0.0.1")) {
    // Even on localhost, /uploads/ is public
    if (trimmed.includes("/uploads/")) {
      return false;
    }
    return true;
  }

  // Check if URL is relative (starts with /) - these become backend URLs after resolution
  if (trimmed.startsWith("/")) {
    return true;
  }

  return false;
}

/**
 * Create Image source with authentication headers if needed
 *
 * @param pathOrUrl - Image path/URL (same as resolveImageUrl)
 * @returns Image source object with headers if auth is needed, or simple uri object
 *
 * @example
 * // Protected API URL - adds Authorization header
 * const source = await getImageSource("/api/profile/avatar/abc123");
 * // → { uri: "https://open-invite-api.onrender.com/api/profile/avatar/abc123", headers: { Authorization: "Bearer ..." } }
 *
 * // Public URL - no headers
 * const source = await getImageSource("https://example.com/image.jpg");
 * // → { uri: "https://example.com/image.jpg" }
 *
 * // No URL - returns null
 * const source = await getImageSource(null);
 * // → null
 */
export async function getImageSource(
  pathOrUrl: string | null | undefined
): Promise<{ uri: string; headers?: { Authorization: string } } | null> {
  // Resolve to absolute URL
  const resolvedUrl = resolveImageUrl(pathOrUrl);
  
  if (!resolvedUrl) {
    return null;
  }

  // Check if this URL needs authentication
  const needsAuth = requiresAuth(pathOrUrl);

  if (!needsAuth) {
    // Public URL - return simple source
    return { uri: resolvedUrl };
  }

  // Protected URL - attach Authorization header
  const token = await getAuthToken();

  if (!token) {
    // No token available - return null to show fallback (initials)
    // This is safer than showing broken image or making unauthenticated request
    if (__DEV__) {
      console.log("[imageSource] Protected URL requires token but none available:", resolvedUrl);
    }
    return null;
  }

  return {
    uri: resolvedUrl,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

/**
 * Synchronous version for URLs that definitely don't need auth
 * Use only when you're certain the URL is public (e.g., friend avatars from external providers)
 */
export function getPublicImageSource(
  pathOrUrl: string | null | undefined
): { uri: string } | null {
  const resolvedUrl = resolveImageUrl(pathOrUrl);
  
  if (!resolvedUrl) {
    return null;
  }

  return { uri: resolvedUrl };
}
