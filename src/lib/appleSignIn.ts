/**
 * Apple Sign-In Helper
 *
 * Provides capability detection for Apple Sign-In.
 * Only available on real iOS devices with proper capability support.
 * Intentionally returns false on simulators.
 */

import { Platform } from "react-native";

// Dynamically import expo-apple-authentication to avoid build errors
// when the package isn't installed
let AppleAuthentication: any = null;
try {
  AppleAuthentication = require("expo-apple-authentication");
} catch {
  // Package not available
}

/**
 * Check if Apple Sign-In is available on the current device
 * Returns false on:
 * - Non-iOS platforms
 * - iOS simulators
 * - Devices without Apple Sign-In capability
 * - When expo-apple-authentication isn't installed
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  // Only available on iOS
  if (Platform.OS !== "ios") {
    return false;
  }

  // Package not installed
  if (!AppleAuthentication) {
    return false;
  }

  try {
    const available = await AppleAuthentication.isAvailableAsync();
    return !!available;
  } catch (error) {
    // If the module isn't available or throws, return false
    if (__DEV__) {
      console.log("[AppleSignIn] Availability check failed:", error);
    }
    return false;
  }
}

/**
 * Check if an error is from the user canceling Apple Sign-In
 * expo-apple-authentication cancellation errors vary by platform/version
 */
export function isAppleAuthCancellation(error: any): boolean {
  const code = error?.code ?? error?.errorCode;
  const message = error?.message?.toLowerCase() ?? "";

  // Common cancellation codes
  if (code === "ERR_CANCELED" || code === "ERR_CANCELLED" || code === 1001) {
    return true;
  }

  // Check message for cancellation keywords
  if (message.includes("cancel") || message.includes("abort")) {
    return true;
  }

  return false;
}

/**
 * Decode Apple Sign-In error into user-friendly message.
 * Returns null if it's a cancellation (no message needed).
 */
export function decodeAppleAuthError(error: any): string | null {
  // Cancellation - no error to show
  if (isAppleAuthCancellation(error)) {
    return null;
  }

  const code = error?.code ?? error?.errorCode;
  const message = error?.message?.toLowerCase() ?? "";

  // Known Apple error codes
  // https://developer.apple.com/documentation/authenticationservices/asauthorizationerror/code
  if (code === 1000 || message.includes("unknown")) {
    return "Apple Sign-In encountered an issue. Please try again.";
  }
  if (code === 1002 || message.includes("invalid")) {
    return "Apple Sign-In request was invalid. Please try again.";
  }
  if (code === 1003 || message.includes("not handled")) {
    return "Apple Sign-In is not configured properly.";
  }
  if (code === 1004 || message.includes("failed")) {
    return "Apple Sign-In failed. Please check your Apple ID settings and try again.";
  }

  // Network-related errors
  if (message.includes("network") || message.includes("connection") || message.includes("timeout")) {
    return "Network error. Please check your connection and try again.";
  }

  // Generic fallback
  if (error?.message) {
    // Don't expose raw technical errors - provide friendly message
    if (__DEV__) {
      console.log("[AUTH_TRACE] Apple error raw message:", error.message);
    }
    return "Apple Sign-In failed. Please try again or use email to continue.";
  }

  return "Apple Sign-In failed. Please try again.";
}
