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
