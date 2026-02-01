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
 * Error classification buckets for Apple Sign-In failures.
 * Used for diagnostics to distinguish failure modes.
 */
export type AppleAuthErrorBucket =
  | "user_cancel"
  | "native_entitlement_or_provisioning"
  | "network_error"
  | "backend_rejection"
  | "missing_email"
  | "other_native_error";

/**
 * Classify an Apple Sign-In error into a diagnostic bucket.
 * Helps distinguish:
 * - user_cancel: User tapped cancel on Apple sheet
 * - native_entitlement_or_provisioning: ERR_REQUEST_UNKNOWN, 1000, or similar (often entitlement/provisioning issue)
 * - network_error: Connection/timeout issues
 * - backend_rejection: Server rejected the token (HTTP error from backend)
 * - other_native_error: Other native errors
 */
export function classifyAppleAuthError(error: any): AppleAuthErrorBucket {
  const code = error?.code ?? error?.errorCode;
  const message = error?.message?.toLowerCase() ?? "";
  const name = error?.name?.toLowerCase() ?? "";

  // User cancellation (priority check)
  if (isAppleAuthCancellation(error)) {
    return "user_cancel";
  }

  // Native entitlement/provisioning errors
  // ERR_REQUEST_UNKNOWN typically indicates Sign in with Apple capability not enabled
  // Code 1000 = ASAuthorizationError.unknown (often entitlement issue)
  // Code 1003 = ASAuthorizationError.notHandled (capability not configured)
  if (
    code === "ERR_REQUEST_UNKNOWN" ||
    code === 1000 ||
    code === 1003 ||
    message.includes("request unknown") ||
    message.includes("not handled") ||
    message.includes("not configured") ||
    message.includes("entitlement") ||
    message.includes("capability")
  ) {
    return "native_entitlement_or_provisioning";
  }

  // Network errors
  if (
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("timeout") ||
    message.includes("offline") ||
    name.includes("network")
  ) {
    return "network_error";
  }

  // Missing email - Apple didn't provide email (common after account deletion/re-auth)
  // Backend typically rejects with 400/422 and message about missing email
  if (
    message.includes("email") && (
      message.includes("missing") ||
      message.includes("required") ||
      message.includes("not provided") ||
      message.includes("no email")
    )
  ) {
    return "missing_email";
  }

  // Backend rejection (if httpStatus is present)
  if (error?.httpStatus && error.httpStatus >= 400) {
    return "backend_rejection";
  }

  // Other native errors
  return "other_native_error";
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
    // Check if this is specifically about missing email
    if (
      message.includes("email") && (
        message.includes("missing") ||
        message.includes("required") ||
        message.includes("not provided") ||
        message.includes("no email")
      )
    ) {
      return "Apple didn't share your email. Go to iOS Settings → Apple ID → Sign-In & Security → Sign in with Apple → Open Invite → Stop Using Apple ID, then try again.";
    }
    return "Apple Sign-In request was invalid. Please try again.";
  }
  
  // Explicit missing email check (for backend rejection with email-related message)
  if (
    message.includes("email") && (
      message.includes("missing") ||
      message.includes("required") ||
      message.includes("not provided") ||
      message.includes("no email")
    )
  ) {
    return "Apple didn't share your email. Go to iOS Settings → Apple ID → Sign-In & Security → Sign in with Apple → Open Invite → Stop Using Apple ID, then try again.";
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

/**
 * DEV-only diagnostic helper for Apple Sign-In.
 * Prints comprehensive diagnostic info about the current Apple Sign-In environment.
 * Can be called from React DevTools console or triggered programmatically in __DEV__.
 */
export async function runAppleSignInDiagnostics(): Promise<void> {
  const prefix = "[APPLE_AUTH_DIAG]";

  console.log(`${prefix} ========== Apple Sign-In Diagnostics ==========`);
  console.log(`${prefix} Timestamp: ${new Date().toISOString()}`);
  console.log(`${prefix} Platform: ${Platform.OS}`);
  console.log(`${prefix} __DEV__: ${__DEV__}`);

  // Module availability
  const moduleAvailable = !!AppleAuthentication;
  console.log(`${prefix} expo-apple-authentication module loaded: ${moduleAvailable}`);

  if (!moduleAvailable) {
    console.log(`${prefix} ISSUE: Module not loaded - requires native build with usesAppleSignIn: true`);
    console.log(`${prefix} ========== End Diagnostics ==========`);
    return;
  }

  // isAvailableAsync check
  try {
    const available = await AppleAuthentication.isAvailableAsync();
    console.log(`${prefix} isAvailableAsync(): ${available}`);
    if (!available) {
      console.log(`${prefix} ISSUE: Apple Sign-In not available on this device/simulator`);
      console.log(`${prefix} Possible causes:`);
      console.log(`${prefix}   - Running on simulator (not supported)`);
      console.log(`${prefix}   - Device signed out of iCloud/Apple ID`);
      console.log(`${prefix}   - Sign in with Apple capability not in provisioning profile`);
    }
  } catch (err: any) {
    console.log(`${prefix} isAvailableAsync() threw: ${err?.message || err}`);
    console.log(`${prefix} Error bucket: ${classifyAppleAuthError(err)}`);
  }

  // Config reminders
  console.log(`${prefix} --- Config Checklist ---`);
  console.log(`${prefix} ✓ app.json ios.usesAppleSignIn: true (required for native capability)`);
  console.log(`${prefix} ✓ expo-apple-authentication in package.json`);
  console.log(`${prefix} ✓ EAS build with Apple Sign-In capability enabled`);
  console.log(`${prefix} ✓ Apple Developer Console: App ID has Sign in with Apple capability`);
  console.log(`${prefix} ✓ Provisioning profile includes Sign in with Apple entitlement`);

  console.log(`${prefix} ========== End Diagnostics ==========`);
}

// Export module reference for direct access in welcome.tsx
export { AppleAuthentication };
