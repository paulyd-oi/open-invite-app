/**
 * Shared Apple Sign-In Implementation
 *
 * Contains the exact working Apple auth logic from welcome.tsx to be reused
 * by both welcome and login screens. This ensures identical behavior.
 */

import { Platform } from "react-native";
import { devLog } from "./devLog";
import { trackAppleSignInTap, trackAppleSignInResult, trackSignupCompleted } from "@/analytics/analyticsEventsSSOT";
import { runExactAppleAuthBootstrap } from "./exactAppleAuthBootstrap";
import { isAppleAuthCancellation, decodeAppleAuthError, classifyAppleAuthError, type AppleAuthErrorBucket } from "./appleSignIn";
import { safeToast } from "./safeToast";
import * as Haptics from "expo-haptics";
import { BACKEND_URL } from "./config";

// Dynamically load Apple Authentication
let AppleAuthentication: any = null;
try {
  AppleAuthentication = require("expo-apple-authentication");
} catch {
  if (__DEV__) devLog("[Apple Auth] expo-apple-authentication not available - requires native build");
}

function getBucketExplanation(bucket: AppleAuthErrorBucket): string {
  switch (bucket) {
    case "user_cancel":
      return "User tapped Cancel on Apple Sign-In sheet";
    case "native_entitlement_or_provisioning":
      return "LIKELY ISSUE: Sign in with Apple capability not in provisioning profile or entitlements. Check EAS build config and Apple Developer Console.";
    case "network_error":
      return "Network connectivity issue or server unreachable";
    case "backend_rejection":
      return "Backend rejected the Apple identity token - check backend logs for details";
    case "missing_email":
      return "Apple didn't share email - user needs to revoke Apple ID access in iOS Settings and try again";
    default:
      return "Unknown Apple Sign-In error";
  }
}

interface AppleAuthContext {
  isAppleSignInReady: boolean;
  setIsLoading: (loading: boolean) => void;
  setErrorBanner?: (error: string | null) => void;
  setAppleAuthDebug?: (debug: { attemptId: string; stage: string; error: string | null; timestamp: number }) => void;

  // Bootstrap context functions (from welcome.tsx)
  setExplicitCookieValueDirectly?: (value: string) => void;
  setAuthToken?: (token: string) => void;
  setOiSessionToken?: (token: string) => void;
  ensureSessionReady?: () => Promise<void>;
  getOiSessionTokenCached?: () => string | null;
  setDisplayName?: (name: string) => void;

  // Success callback - different for welcome vs login
  onSuccess: () => void;
}

export async function handleSharedAppleSignIn(context: AppleAuthContext): Promise<void> {
  // [GROWTH_APPLE_SIGNIN] Track tap
  trackAppleSignInTap();
  const _appleT0 = Date.now();

  // Generate unique attempt ID for trace correlation
  const attemptId = `apple_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Production-safe logging (always logs, but sensitive data only in __DEV__)
  const traceLog = (stage: string, data: Record<string, unknown>) => {
    // Always log stage for production debugging
    devLog(`[APPLE_AUTH_TRACE] ${attemptId} | ${stage}`);
    if (__DEV__) {
      // Full data only in dev
      devLog(JSON.stringify({ tag: "[APPLE_AUTH_TRACE]", attemptId, stage, ...data }));
    }
    context.setAppleAuthDebug?.({ attemptId, stage, error: null, timestamp: Date.now() });
  };

  const traceError = (stage: string, error: any) => {
    const errorBucket = error?.bucket ?? classifyAppleAuthError(error);
    const errorInfo = {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      domain: error?.domain,
      bucket: errorBucket,
      bucketExplanation: error?.bucketExplanation ?? getBucketExplanation(errorBucket),
      stack: __DEV__ ? error?.stack?.slice?.(0, 500) : undefined,
      raw: __DEV__ ? JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2)?.slice(0, 800) : undefined,
    };
    // Always log error bucket for production debugging
    devLog(`[APPLE_AUTH_TRACE] ${attemptId} | ${stage} | bucket=${errorBucket}`);
    if (__DEV__) {
      devLog(JSON.stringify({ tag: "[APPLE_AUTH_TRACE]", attemptId, stage, error: errorInfo }));
    }
    context.setAppleAuthDebug?.({ attemptId, stage, error: error?.message || "Unknown error", timestamp: Date.now() });
  };

  traceLog("apple_auth_request_start", { timestamp: new Date().toISOString() });

  // Availability checks
  traceLog("availability_check", {
    platform: Platform.OS,
    modulePresent: !!AppleAuthentication,
    isAppleSignInReady: context.isAppleSignInReady,
  });

  if (!context.isAppleSignInReady || !AppleAuthentication) {
    traceError("availability_fail", { message: "Apple Sign-In not available" });
    safeToast.warning("Apple Sign-In unavailable", "Use email to continue.");
    return;
  }

  context.setIsLoading(true);
  context.setErrorBanner?.(null);

  try {
    traceLog("native_signInAsync_start", { scopes: ["FULL_NAME", "EMAIL"] });
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    // Log credential result (redacted) - SAFE: only presence booleans, no tokens
    traceLog("native_signInAsync_success", {
      hasUser: !!credential.user,
      hasIdentityToken: !!credential.identityToken,
      identityTokenLength: credential.identityToken?.length || 0,
      hasAuthorizationCode: !!credential.authorizationCode,
      authorizationCodeLength: credential.authorizationCode?.length || 0,
      hasEmail: !!credential.email,
      emailRedacted: credential.email ? `${credential.email.slice(0, 3)}...` : null,
      hasFullName: !!(credential.fullName?.givenName || credential.fullName?.familyName),
      hasGivenName: !!credential.fullName?.givenName,
      hasFamilyName: !!credential.fullName?.familyName,
    });

    if (!credential.identityToken) {
      traceError("credential_invalid", { message: "Missing identityToken" });
      throw new Error("Apple Sign-In did not return required credentials. Please try again.");
    }

    // Send to backend - use credentials: "include" to allow cookie jar storage
    // If backend sends Set-Cookie, it will be stored in the cookie jar
    // Origin header matches trusted-origin behavior used by email sign-in
    const backendUrl = `${BACKEND_URL}/api/auth/apple`;
    traceLog("apple_auth_backend_start", { url: backendUrl, method: "POST" });

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "open-invite://",
      },
      credentials: "include", // Allow cookie jar to receive Set-Cookie
      body: JSON.stringify({
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        user: {
          email: credential.email,
          name: credential.fullName ? {
            firstName: credential.fullName.givenName,
            lastName: credential.fullName.familyName,
          } : null,
        },
      }),
    });

    // CRITICAL: Capture Set-Cookie header before reading body
    // React Native exposes Set-Cookie via response.headers.get() sometimes
    const setCookieHeader = response.headers.get("set-cookie") || response.headers.get("Set-Cookie");

    const data = await response.json();

    traceLog("apple_auth_backend_response", {
      status: response.status,
      ok: response.ok,
      hasToken: !!data.token || !!data.session?.token,
      hasMobileSessionToken: !!data.mobileSessionToken,
      hasSetCookie: !!setCookieHeader,
      hasSessionInBody: !!data.session,
      success: data.success || data.ok,
      bodyPreview: JSON.stringify(data).slice(0, 200).replace(/"token":"[^"]+"/g, '"token":"[REDACTED]"'),
    });

    if (!response.ok || (!data.success && !data.ok)) {
      const errorMessage = data.error || data.message || `HTTP ${response.status}`;
      traceError("backend_exchange_fail", {
        message: errorMessage,
        httpStatus: response.status,
        httpStatusText: response.statusText,
      });
      // Throw error with message that decodeAppleAuthError can parse
      const error = new Error(errorMessage);
      (error as any).httpStatus = response.status;
      throw error;
    }

    // Run exact Apple auth bootstrap logic (will be reused by email auth)
    const appleBootstrapResult = await runExactAppleAuthBootstrap(
      data,
      setCookieHeader,
      traceLog,
      traceError,
      {
        setExplicitCookieValueDirectly: context.setExplicitCookieValueDirectly,
        setAuthToken: context.setAuthToken,
        setOiSessionToken: context.setOiSessionToken,
        ensureSessionReady: context.ensureSessionReady,
        getOiSessionTokenCached: context.getOiSessionTokenCached,
      }
    );

    if (!appleBootstrapResult.success) {
      throw new Error(`Apple Sign-In session bootstrap failed: ${appleBootstrapResult.error}`);
    }

    // PROOF LOG with required format (maintain compatibility with existing logs)
    if (__DEV__) devLog(`[APPLE_TOKEN_PROOF] tokenFound=true tokenLen=${appleBootstrapResult.tokenLength} barrier200=true userIdPresent=true`);

    // Pre-populate name from Apple
    if (credential.fullName?.givenName) {
      const fullName = [
        credential.fullName.givenName,
        credential.fullName.familyName,
      ].filter(Boolean).join(" ");
      context.setDisplayName?.(fullName);
    } else if (data.user?.name) {
      context.setDisplayName?.(data.user.name);
    }

    // Success handling
    traceLog("final_success", { callbackInvoked: true });
    // [P0_ANALYTICS_EVENT] signup_completed (Apple — best-effort, fires on every Apple auth since we can't distinguish new vs returning)
    trackSignupCompleted({ authProvider: "apple", isEmailVerified: true });
    // [GROWTH_APPLE_SIGNIN] Track success
    trackAppleSignInResult({ success: true, durationMs: Date.now() - _appleT0 });

    context.onSuccess();

  } catch (error: any) {
    // Classify the error for diagnostics
    const errorBucket = classifyAppleAuthError(error);

    // User cancelled - no error to show
    if (errorBucket === "user_cancel") {
      traceLog("user_cancelled", { cancelled: true, bucket: errorBucket });
      trackAppleSignInResult({ success: false, durationMs: Date.now() - _appleT0, errorCode: "user_cancel" });
      return;
    }

    // [GROWTH_APPLE_SIGNIN] Track failure
    trackAppleSignInResult({ success: false, durationMs: Date.now() - _appleT0, errorCode: errorBucket });

    // Log full error with classification for diagnostics
    traceError("final_fail", {
      ...error,
      bucket: errorBucket,
      bucketExplanation: getBucketExplanation(errorBucket),
    });

    // [P0_SIWA_FAIL] Deterministic proof path for Apple Sign-In failures
    if (__DEV__) devLog(`[P0_SIWA_FAIL] code=${error?.code ?? 'none'} bucket=${errorBucket} httpStatus=${error?.httpStatus ?? 'none'} msg=${error?.message?.slice(0, 80) ?? 'none'}`);

    // Decode error to user-friendly message (mom-safe)
    const userMessage = decodeAppleAuthError(error);
    context.setErrorBanner?.(userMessage || "Apple Sign-In failed. Please try again.");

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    safeToast.error("Apple Sign-In Failed", userMessage || "Apple Sign-In failed. Please try again.");
  } finally {
    context.setIsLoading(false);
  }
}