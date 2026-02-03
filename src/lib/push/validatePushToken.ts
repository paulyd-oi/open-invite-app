/**
 * Push Token Validation - Single Source of Truth
 * 
 * INVARIANT: This is THE validation function for Expo push tokens.
 * All code paths that send tokens to the backend MUST use this.
 * 
 * Prevents:
 * - Placeholder tokens like "ExponentPushToken[test123]"
 * - Mock/test tokens from simulator
 * - Malformed or too-short tokens
 */

import { devLog } from "../devLog";

/**
 * Validate that a token is a real Expo push token suitable for backend registration.
 * 
 * @param token - The token string to validate
 * @returns true if token is valid for registration, false otherwise
 * 
 * Validation rules:
 * 1. Must be a non-empty string
 * 2. Must start with valid prefix: ExponentPushToken[, ExpoPushToken[, or ExpoToken[
 * 3. Must NOT contain 'test', 'placeholder', or 'mock' (case-insensitive)
 * 4. Must be at least 30 characters (real tokens are ~44+ chars)
 */
export function isValidExpoPushToken(token: unknown): token is string {
  // Type guard: must be a string
  if (!token || typeof token !== 'string') {
    return false;
  }

  // Must start with valid Expo push token prefix
  const validPrefixes = ['ExponentPushToken[', 'ExpoPushToken[', 'ExpoToken['];
  const hasValidPrefix = validPrefixes.some(prefix => token.startsWith(prefix));
  if (!hasValidPrefix) {
    return false;
  }

  // Reject placeholder/test/mock tokens (case-insensitive)
  const lowerToken = token.toLowerCase();
  const forbiddenPatterns = ['test', 'placeholder', 'mock', 'fake', 'dummy', 'sample'];
  const hasForbiddenPattern = forbiddenPatterns.some(pattern => lowerToken.includes(pattern));
  if (hasForbiddenPattern) {
    if (__DEV__) {
      devLog('[validatePushToken] Rejected token with forbidden pattern:', token.substring(0, 30) + '...');
    }
    return false;
  }

  // Real tokens are at least 44 chars, use 30 as conservative minimum
  if (token.length < 30) {
    if (__DEV__) {
      devLog('[validatePushToken] Rejected too-short token:', token.substring(0, 20) + '...');
    }
    return false;
  }

  return true;
}

/**
 * Get a safe prefix of a token for logging (first 24 chars + "...")
 * Never logs full tokens to prevent credential leakage.
 */
export function getTokenPrefix(token: string | undefined | null): string {
  if (!token || typeof token !== 'string') return '<no-token>';
  if (token.length <= 24) return token;
  return token.substring(0, 24) + '...';
}
