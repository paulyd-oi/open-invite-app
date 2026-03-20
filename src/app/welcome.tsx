import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  FlatList,
  StyleSheet,
} from "react-native";
import * as Contacts from "expo-contacts";
import { Image as ExpoImage } from "expo-image";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFirstPaintStable } from "@/hooks/useFirstPaintStable";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { FriendDiscoverySurface } from "@/components/FriendDiscoverySurface";
import { trackSignupCompleted, trackAppleSignInTap, trackAppleSignInResult, trackContactsPermissionResult, trackContactsImportResult } from "@/analytics/analyticsEventsSSOT";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// ============ ANIMATION HELPERS ============
// INVARIANT: Animations run ONCE on mount - use opacity only (no height/translateY changes)
// [P1_ONBOARD_BOUNCE] stableFadeInDown removed — was causing bounce via translateY + springify
const smoothFadeIn = (delayMs = 0) => FadeIn.delay(delayMs).duration(400);

import {
  Calendar as CalendarIcon,
  ArrowRight,
  Camera,
  Eye,
  EyeOff,
  Sparkles,
  Users,
  Check,
  UserPlus,
} from "@/ui/icons";
// [P1_FONTS_SSOT] Font imports removed — fonts loaded once in _layout.tsx

import {
  authClient,
  setAuthToken,
  setExplicitCookieValueDirectly,
  setOiSessionToken,
  ensureSessionReady,
  getOiSessionTokenCached,
} from "@/lib/authClient";
import { runExactAppleAuthBootstrap } from "@/lib/exactAppleAuthBootstrap";
import { resendVerificationEmail } from "@/lib/authFlowClient";
import { getSessionCached } from "@/lib/sessionCache";
import { api } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { safeToast } from "@/lib/safeToast";
import { isAppleSignInAvailable, runAppleSignInDiagnostics, classifyAppleAuthError, decodeAppleAuthError } from "@/lib/appleSignIn";
import { handleSharedAppleSignIn } from "@/lib/sharedAppleAuth";
import type { AppleAuthErrorBucket } from "@/lib/appleSignIn";
import { requestBootstrapRefreshOnce } from "@/hooks/useBootAuthority";
import { uploadImage } from "@/lib/imageUpload";
import { refreshAfterFriendRequestSent } from "@/lib/refreshAfterMutation";
import { SendFriendRequestResponse } from "@/../shared/contracts";
import { buildGuideKey, GUIDE_FORCE_SHOW_PREFIX } from "@/hooks/useOnboardingGuide";
import { triggerVerificationCooldown } from "@/components/EmailVerificationBanner";
import { useTheme } from "@/lib/ThemeContext";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";
import { SafeAreaScreen } from "@/ui/SafeAreaScreen";
import { routeAfterAuthSuccess, assertAuthRoutingSSoT } from "@/lib/authRouting";

// Apple Authentication - dynamically loaded (requires native build with usesAppleSignIn: true)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AppleAuthentication: any = null;
try {
  AppleAuthentication = require("expo-apple-authentication");
} catch {
  if (__DEV__) devLog("[Apple Auth] expo-apple-authentication not available - requires native build");
}

// Feature flag: Apple Sign-In enabled for growth phase
const APPLE_SIGNIN_ENABLED = true;

// ⚠️ TEMPORARY: getBucketExplanation until Apple auth consolidation complete
function getBucketExplanation(bucket: AppleAuthErrorBucket): string {
  switch (bucket) {
    case "user_cancel":
      return "User tapped Cancel on Apple Sign-In sheet";
    case "native_entitlement_or_provisioning":
      return "LIKELY ISSUE: Sign in with Apple capability not in provisioning profile or entitlements. Check EAS build config and Apple Developer Console.";
    case "network_error":
      return "Network connectivity issue - check device connection";
    case "backend_rejection":
      return "Backend rejected the Apple identity token - check backend logs for details";
    case "missing_email":
      return "Apple didn't share email - user needs to revoke Apple ID access in iOS Settings and try again";
    case "other_native_error":
      return "Unknown native error - check error code/message for details";
  }
}

// ============ NORMALIZE URL HELPER ============
function normalizeAvatarUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `${BACKEND_URL}${url}`;
  }
  return url;
}

/**
 * Converts any avatar URL to backend-relative path for PUT /api/profile.
 * Backend expects relative paths like /uploads/xyz.jpg, not absolute URLs.
 * Extracts /uploads/... portion from any URL that contains it.
 */
function toBackendAvatarUrl(url: string | null | undefined): string | undefined {
  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return undefined;
  }
  // If URL contains "/uploads/", extract from there (handles absolute URLs)
  const uploadsIndex = url.indexOf("/uploads/");
  if (uploadsIndex !== -1) {
    return url.slice(uploadsIndex); // e.g., "/uploads/xyz.jpg"
  }
  // If URL starts with backend URL, strip it
  if (url.startsWith(BACKEND_URL)) {
    const relative = url.slice(BACKEND_URL.length);
    return relative.startsWith("/") ? relative : "/" + relative;
  }
  // If already relative and starts with "/", keep as-is
  if (url.startsWith("/")) {
    return url;
  }
  // Otherwise, this is not a backend-relative URL - return undefined to skip
  return undefined;
}

// ============ SLIDE TYPES ============
type OnboardingSlide = 1 | 2 | 3 | 4 | 5;

// ============ SHARED LAYOUT ============
// Tracks root container layout deltas and insets on cold start.
// Throttled to max 12 logs per cold start.
let _welcomeProbeCount = 0;
const _WELCOME_PROBE_MAX = 12;
const _welcomeProbeMountTs = Date.now();
let _welcomeProbeRootPrev = { y: -1, h: -1 };
let _welcomeProbeHeroPrev = { y: -1, h: -1 };

const OnboardingLayout = ({
  children,
  background,
  testID,
}: {
  children: React.ReactNode;
  background: string;
  testID?: string;
}) => {
  // [P0_SAFE_AREA_SSOT] SafeAreaScreen handles insets via useSafeAreaInsets().
  // Hook retained here ONLY for DEV probe logging (inset values).
  const insets = useSafeAreaInsets();

  // [P1_ONBOARD_STABLE] Opacity-gate: hide content until layout is stable
  const { isStable, onLayout } = useFirstPaintStable();

  // [P0_SAFE_AREA_SSOT] Pop animation: fade-in only (no translate — avoids keyboard jitter)
  // [P0_SIGNUP_JITTER] translateY removed from popStyle — was causing layout jitter when keyboard appears
  const revealProgress = useSharedValue(0);
  useEffect(() => {
    if (isStable) {
      revealProgress.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });
    }
  }, [isStable]);
  const popStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: revealProgress.value,
  }));

  const _probeInsetLoggedRef = React.useRef(false);
  if (__DEV__ && !_probeInsetLoggedRef.current && _welcomeProbeCount < _WELCOME_PROBE_MAX) {
    _probeInsetLoggedRef.current = true;
    _welcomeProbeCount++;
    const payload = {
      tMs: Date.now() - _welcomeProbeMountTs,
      phase: 'OnboardingLayout-mount',
      insetsTop: insets.top,
      insetsBottom: insets.bottom,
      isStable,
    };
  }

  const handleRootLayout = (e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
    // Call the stability gate's onLayout first
    onLayout(e as any);
    if (!__DEV__ || _welcomeProbeCount >= _WELCOME_PROBE_MAX) return;
    const { x, y, width, height } = e.nativeEvent.layout;
    const dY = _welcomeProbeRootPrev.y >= 0 ? y - _welcomeProbeRootPrev.y : 0;
    const dH = _welcomeProbeRootPrev.h >= 0 ? height - _welcomeProbeRootPrev.h : 0;
    // Skip if nothing changed after first measurement
    if (_welcomeProbeRootPrev.y === y && _welcomeProbeRootPrev.h === height && _welcomeProbeRootPrev.y >= 0) return;
    _welcomeProbeRootPrev = { y, h: height };
    _welcomeProbeCount++;
    const payload = {
      tMs: Date.now() - _welcomeProbeMountTs,
      phase: 'root-layout',
      x, y, w: width, h: height,
      dY, dH,
    };
  };

  return (
    <SafeAreaScreen
      testID={testID}
      onLayout={handleRootLayout}
      style={{ backgroundColor: background }}
    >
      <Animated.View style={popStyle}>
        {children}
      </Animated.View>
    </SafeAreaScreen>
  );
};

// ============ STYLED INPUT ============
const StyledInput = ({
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "none",
  secureTextEntry = false,
  showPassword,
  onTogglePassword,
  autoFocus = false,
  error,
  colors,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words" | "sentences";
  secureTextEntry?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  autoFocus?: boolean;
  error?: string;
  colors: { inputBg: string; borderSubtle: string; textTertiary: string; text: string };
}) => (
  <View>
    <View
      style={[
        styles.inputContainer,
        {
          backgroundColor: colors.inputBg,
          borderColor: error ? "#E85D4C" : colors.borderSubtle,
        },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry && !showPassword}
        autoFocus={autoFocus}
        style={[styles.input, { color: colors.text }]}
      />
      {onTogglePassword && (
        <Pressable onPress={onTogglePassword} style={styles.eyeButton}>
          {showPassword ? (
            <EyeOff size={20} color={colors.textTertiary} />
          ) : (
            <Eye size={20} color={colors.textTertiary} />
          )}
        </Pressable>
      )}
    </View>
    {error && <Text style={styles.errorText}>{error}</Text>}
  </View>
);

// ============ MAIN COMPONENT ============
export default function WelcomeOnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  if (__DEV__) devLog('[P2_ONBOARDING_UI_SSOT]', { screen: 'welcome', button: 'SSOT', theme: 'ThemeContext' });

  // ✅ AUTH ROUTING SSOT: Assert this screen uses shared auth routing
  assertAuthRoutingSSoT('welcome');
  const isMountedRef = useRef(true);
  const hasLoggedMountRef = useRef(false);

  // INVARIANT: Log mount once - if this prints twice, screen is remounting (bug)
  useEffect(() => {
    if (!hasLoggedMountRef.current) {
      hasLoggedMountRef.current = true;
      if (__DEV__) {
        devLog("[ONBOARDING_BOOT] GettingStarted mounted once");
        devLog("[P1_ONBOARD_BOUNCE] welcome mount — animations: smoothFadeIn (opacity only, no translateY)");
        const payload = { tMs: 0, phase: 'WelcomeScreen-mount' };
      }
    }
  }, []);

  // [P1_FONTS_SSOT] useFonts removed — _layout.tsx gates app on font load

  // Core state
  const [currentSlide, setCurrentSlide] = useState<OnboardingSlide>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Apple Sign-In availability
  const [isAppleSignInReady, setIsAppleSignInReady] = useState(false);

  // Derived: can show Apple Sign-In UI (gated by launch flag)
  const canShowAppleSignIn =
    APPLE_SIGNIN_ENABLED &&
    Platform.OS === "ios" &&
    isAppleSignInReady &&
    !!AppleAuthentication;

  // DEV-only: Apple Sign-In debug trace state
  const [appleAuthDebug, setAppleAuthDebug] = useState<{
    attemptId: string | null;
    stage: string;
    error: string | null;
    timestamp: number | null;
  }>({ attemptId: null, stage: "idle", error: null, timestamp: null });

  // Auth form state (Slide 2)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Profile form state (Slide 3)
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);

  // [P0_PHOTO_UPLOAD] DEV-only on-screen diagnostic for upload failures.
  // Visible text (not console.log) so Paul can read it in Vibecode preview.
  const [uploadDiag, setUploadDiag] = useState<string | null>(null);

  // Contacts import state (Slide 4)
  const [contactsLoading, setContactsLoading] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [sendingInvites, setSendingInvites] = useState(false);
  const [contactsPermissionDenied, setContactsPermissionDenied] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check Apple Sign-In availability on mount
  useEffect(() => {
    if (Platform.OS === "ios") {
      isAppleSignInAvailable().then((available) => {
        setIsAppleSignInReady(available);
        if (__DEV__) {
          if (__DEV__) devLog("[Apple Auth] Availability:", available);
        }
      });
    }
  }, []);

  // ============ SLIDE 2: AUTH HANDLERS ============

  // [P0_SIGNUP_FIX] Derive a display name from an email address.
  // Used as fallback when the UI doesn't collect a name field.
  // [P0_PROFILE_SETUP] Guard: detect if a "name" is actually derived from email
  function isNameDerivedFromEmail(name: string | null | undefined, emailAddr: string | null | undefined): boolean {
    if (!name || !emailAddr) return false;
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return false;
    // Exact match to email
    if (trimmed === emailAddr.trim().toLowerCase()) return true;
    // Match to email local part (before @)
    const localPart = emailAddr.split("@")[0]?.trim().toLowerCase() ?? "";
    if (localPart && trimmed === localPart) return true;
    // Match to "New User" placeholder
    if (trimmed === "new user") return true;
    return false;
  }

  // [P0_SIGNUP_FIX] Map raw backend/auth error messages to user-safe strings.
  // Prevents schema validation strings like "[body.name] Too small" from leaking.
  function mapAuthErrorToSafeMessage(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.includes("body.name") || lower.includes("name")) {
      return "Please enter a valid name.";
    }
    if (lower.includes("password") && (lower.includes("short") || lower.includes("small") || lower.includes("characters"))) {
      return "Password is too short. Please use at least 8 characters.";
    }
    if (lower.includes("email") && (lower.includes("invalid") || lower.includes("format"))) {
      return "Please enter a valid email address.";
    }
    if (lower.includes("exist")) {
      return "An account with this email already exists. Try signing in.";
    }
    if (lower.includes("credentials") || lower.includes("unauthorized") || lower.includes("incorrect")) {
      return "Incorrect email or password. Please try again.";
    }
    return "Something went wrong. Please try again.";
  }

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorBanner("Please enter your email and password");
      return;
    }

    if (__DEV__) {
      devLog("[P0_PROFILE_SETUP] submitting email auth", {
        hasEmail: !!email.trim(),
        hasPassword: !!password.trim(),
      });
    }

    if (__DEV__) devLog("[Onboarding] Starting email auth...");
    setIsLoading(true);
    setErrorBanner(null);

    try {
      // Use proper authClient methods which handle cookie establishment:
      // captureAndStoreCookie() -> refreshExplicitCookie() -> verifySessionAfterAuth()
      let result: any;
      let isNewAccount = false;
      
      // Try sign-up first
      // [P0_PROFILE_SETUP] Never derive name from email — pass undefined.
      // better-auth backend falls back to "New User" for non-empty requirement.
      result = await authClient.signUp.email({
        email: email.trim(),
        password,
      });
      
      // If sign-up returns error about existing account, try sign-in
      if (result.error?.message?.toLowerCase().includes("exist")) {
        if (__DEV__) devLog("[Onboarding] Account exists, attempting sign-in...");
        result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
      } else if (!result.error) {
        isNewAccount = true;
      }
      
      // Check for errors after both attempts
      if (result.error) {
        throw new Error(result.error.message || "Authentication failed");
      }

      // Cookie session is now established by authClient.signUp/signIn methods.
      // Verify we actually have a valid session before proceeding.
      const session = await getSessionCached();
      const userId = session?.user?.id;
      
      if (!userId) {
        devError("[Onboarding] Session verification failed - no userId after auth");
        setErrorBanner("Session could not be established. Please try again.");
        return;
      }
      
      if (__DEV__) {
        devLog("[P0_PROFILE_SETUP] auth success", {
          userId: userId.slice(0, 8),
          isNewAccount,
          sessionUserName: session?.user?.name ?? null,
          sessionUserEmail: session?.user?.email ?? null,
          sessionUserImage: (session?.user as any)?.image ?? null,
        });
      }

      // [P0_ANALYTICS_EVENT] signup_completed (new email accounts only)
      if (isNewAccount) {
        trackSignupCompleted({ authProvider: "email", isEmailVerified: false });
      }

      // NEW ACCOUNT ONLY: Enable onboarding guide forceShow gate + send verification email
      if (isNewAccount) {
        const forceShowKey = buildGuideKey(GUIDE_FORCE_SHOW_PREFIX, userId);
        await SecureStore.setItemAsync(forceShowKey, "true");
        if (__DEV__) devLog("[Onboarding] forceShow enabled for new account:", forceShowKey);
        
        // FIX 3: Send verification email IMMEDIATELY on signup (not later in onboarding)
        const userEmail = session?.user?.email;
        if (userEmail) {
          if (__DEV__) devLog("[Onboarding] Sending verification email immediately after signup");
          const result = await resendVerificationEmail({
            email: userEmail,
            name: session?.user?.name || session?.user?.displayName || undefined,
            feedback: "silent",
            onSuccess: () => {
              if (__DEV__) devLog("[Onboarding] Verification email sent successfully");
              triggerVerificationCooldown();
            },
          });
          if (!result.success) {
            devWarn("[Onboarding] Failed to send verification email:", result.error);
          }
        }
      }

      // Pre-populate name only if auth provider returned a real name (not email-derived)
      const returnedName = result.data?.user?.name;
      const userEmail = result.data?.user?.email || email.trim();
      if (returnedName && !isNameDerivedFromEmail(returnedName, userEmail)) {
        setDisplayName(returnedName);
        if (__DEV__) devLog("[P0_PROFILE_SETUP] prefilled name from provider:", returnedName);
      } else if (__DEV__) {
        devLog("[P0_PROFILE_SETUP] skipped name prefill", {
          returnedName: returnedName ?? null,
          reason: !returnedName ? "no_name" : "email_derived",
        });
      }

      // Advance to Slide 3
      setCurrentSlide(3);
    } catch (error: any) {
      const rawMsg = error?.message || "";
      const safeMsg = mapAuthErrorToSafeMessage(rawMsg);
      if (__DEV__) {
        devLog("[P0_SIGNUP_FIX] failure mapped", {
          originalSummary: rawMsg.slice(0, 80),
          mappedMessage: safeMsg,
        });
      }
      devError("[Onboarding] Auth error:", rawMsg);
      setErrorBanner(safeMsg);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleAppleSignIn = async () => {
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
      setAppleAuthDebug({ attemptId, stage, error: null, timestamp: Date.now() });
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
      setAppleAuthDebug({ attemptId, stage, error: error?.message || "Unknown error", timestamp: Date.now() });
    };

    traceLog("apple_auth_request_start", { timestamp: new Date().toISOString() });

    // Availability checks
    traceLog("availability_check", {
      platform: Platform.OS,
      modulePresent: !!AppleAuthentication,
      isAppleSignInReady,
    });

    if (!isAppleSignInReady || !AppleAuthentication) {
      traceError("availability_fail", { message: "Apple Sign-In not available" });
      safeToast.warning("Apple Sign-In unavailable", "Use email to continue.");
      return;
    }

    setIsLoading(true);
    setErrorBanner(null);

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
          setExplicitCookieValueDirectly,
          setAuthToken,
          setOiSessionToken,
          ensureSessionReady,
          getOiSessionTokenCached,
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
        setDisplayName(fullName);
      } else if (data.user?.name) {
        setDisplayName(data.user.name);
      }

      // Advance to Slide 3 - auth succeeded (cookie is set)
      traceLog("final_success", { advancingToSlide: 3 });
      // [P0_ANALYTICS_EVENT] signup_completed (Apple — best-effort, fires on every Apple auth since we can't distinguish new vs returning)
      trackSignupCompleted({ authProvider: "apple", isEmailVerified: true });
      // [GROWTH_APPLE_SIGNIN] Track success
      trackAppleSignInResult({ success: true, durationMs: Date.now() - _appleT0 });
      setCurrentSlide(3);
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
      setErrorBanner(userMessage || "Apple Sign-In failed. Please try again.");
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // ============ SLIDE 3: PROFILE HANDLERS ============

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      safeToast.warning("Permission Required", "Please allow access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarLocalUri(result.assets[0].uri);
      // Start upload in background (best-effort)
      uploadPhotoInBackground(result.assets[0].uri);
    }
  };

  const uploadPhotoInBackground = async (uri: string) => {
    if (!isMountedRef.current) return;

    // [P0_PHOTO_UPLOAD] DEV diagnostic helper — shows each step on-screen
    const diag = (msg: string) => {
      if (__DEV__ && isMountedRef.current) setUploadDiag(msg);
      if (__DEV__) devLog("[P0_PHOTO_UPLOAD]", msg);
    };
    diag(`pick ok uri=${uri?.slice(0, 60)}`);

    // Check session (cookie auth) before upload - use effectiveUserId for unified auth check
    // CRITICAL: Photo upload failure must NOT reset auth state or redirect user.
    // If session check fails, just skip upload - user can add photo later.
    let effectiveUserId: string | null = null;
    try {
      const sessionResult = await getSessionCached();
      effectiveUserId = sessionResult?.effectiveUserId ?? sessionResult?.user?.id ?? null;
      if (!effectiveUserId) {
        diag("SKIP: no effectiveUserId");
        return;
      }
      diag(`session ok uid=${effectiveUserId.substring(0, 8)}`);
    } catch (err: any) {
      diag(`SKIP: session err ${err?.message}`);
      return;
    }

    setUploadBusy(true);

    try {
      diag("calling uploadImage...");
      const uploadResponse = await uploadImage(uri, true);
      diag(`upload ok url=${uploadResponse.url?.slice(0, 50)}`);
      const normalizedUrl = normalizeAvatarUrl(uploadResponse.url);

      if (!isMountedRef.current) return;
      setAvatarUrl(normalizedUrl);
      if (__DEV__) setUploadDiag(null); // Clear diag on success

      // Photo uploaded - defer profile save to Continue step when handle is available
      safeToast.success("Photo uploaded", "It will be saved with your profile.");
    } catch (error: any) {
      // CRITICAL: Photo upload failure must NOT affect auth state or navigation
      // Just log and inform user - they can add photo later from settings
      const errMsg = error?.message || String(error);
      const errStatus = error?.status ?? error?.response?.status ?? "none";
      diag(`FAIL step=uploadImage status=${errStatus} err=${errMsg.slice(0, 200)}`);

      if (isMountedRef.current) {
        // Clear local preview so user doesn't see broken/stale avatar
        setAvatarLocalUri(null);
        safeToast.warning("Upload failed", "Could not upload photo. You can add it later in Settings.");
      }
      // DON'T clear avatarUrl if it was already set from a previous successful upload
    } finally {
      if (isMountedRef.current) {
        setUploadBusy(false);
      }
    }
  };

  const handleSlide3Continue = async () => {
    if (__DEV__) devLog("[Onboarding] Continue pressed");
    setNameError(null);
    setHandleError(null);
    setErrorBanner(null);

    // Validate inputs
    const trimmedName = displayName.trim();
    const trimmedHandle = handle.trim().replace(/^@/, ""); // Remove leading @

    if (!trimmedName) {
      setNameError("Display name is required");
      return;
    }

    if (!trimmedHandle) {
      setHandleError("Handle is required");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedHandle)) {
      setHandleError("Handle can only contain letters, numbers, and underscores");
      return;
    }

    if (trimmedHandle.length < 3) {
      setHandleError("Handle must be at least 3 characters");
      return;
    }

    // Check session (cookie auth) instead of SecureStore token
    // Auth is determined by effectiveUserId (user.id ?? session.userId)
    // CRITICAL: During onboarding, we should NOT redirect to /login on transient errors.
    // The user just authenticated - a session fetch failure is likely transient.
    let effectiveUserId: string | null = null;
    try {
      const sessionResult = await getSessionCached();
      effectiveUserId = sessionResult?.effectiveUserId ?? sessionResult?.user?.id ?? null;
      
      // Debug log for session state (AUTH_TRACE prefix for filtering)
      if (__DEV__) devLog(`[AUTH_TRACE] Onboarding session check: effectiveUserId=${!!effectiveUserId}`);
    } catch (sessionErr: any) {
      const status = sessionErr?.status || 'unknown';
      if (__DEV__) devLog(`[AUTH_TRACE] Onboarding session check failed: status=${status}`);
      // Transient error - DO NOT redirect to /login. User just authenticated.
      // Show error and allow retry.
      setErrorBanner("Session check failed. Please tap Continue to retry.");
      return;
    }
    
    // If no session at all (truly logged out), show error but don't auto-redirect
    // This prevents the "loop back to beginning" issue
    if (!effectiveUserId) {
      if (__DEV__) devLog("[AUTH_TRACE] Onboarding: no effectiveUserId, showing error");
      setErrorBanner("Your session expired. Please go back and sign in again.");
      return;
    }

    setIsLoading(true);

    try {
      // Build payload: backend accepts { handle, avatarUrl?, name? }
      const cleanedHandle = trimmedHandle.toLowerCase(); // Normalize: lowercase
      const payload: { handle: string; avatarUrl?: string; name?: string } = {
        handle: cleanedHandle,
      };

      // Include displayName if user entered one - this persists their chosen name
      // CRITICAL: Only set if user explicitly entered a name, never use fallback here
      if (trimmedName) {
        payload.name = trimmedName;
        if (__DEV__) devLog("[DISPLAYNAME_WRITE] Persisting user-entered name:", trimmedName);
      }

      // Add avatarUrl if present (Cloudinary https:// or legacy backend /uploads/)
      if (typeof avatarUrl === "string" && avatarUrl.trim().length > 0) {
        payload.avatarUrl = avatarUrl.trim();
      }

      if (__DEV__) {
        devLog("[P0_PROFILE_SETUP] save payload", {
          keys: Object.keys(payload),
          handle: payload.handle,
          hasName: !!payload.name,
          hasAvatarUrl: !!payload.avatarUrl,
          avatarUrlPreview: payload.avatarUrl?.slice(0, 60) ?? null,
        });
      }
      const response = await api.put<{ success?: boolean; profile?: any }>("/api/profile", payload);
      if (__DEV__) devLog("[P0_PROFILE_SETUP] save success", { responseKeys: Object.keys(response || {}) });

      // Update React Query cache
      queryClient.setQueryData(["profile"], (old: any) => ({
        ...old,
        profile: {
          ...old?.profile,
          ...response.profile,
          handle: cleanedHandle,
          avatarUrl: avatarUrl || old?.profile?.avatarUrl,
          name: trimmedName || old?.profile?.name, // Preserve user-entered name
        },
        user: {
          ...old?.user,
          name: trimmedName || old?.user?.name, // Sync to user object too
        },
      }));
      queryClient.invalidateQueries({ queryKey: ["profile"] });

      // Request bootstrap refresh so status updates from 'onboarding' to 'authed'
      // This prevents the onboarding loop issue
      if (__DEV__) devLog("[AUTH_TRACE] Onboarding: profile saved, requesting bootstrap refresh");
      requestBootstrapRefreshOnce();

      // Advance to Slide 4
      if (isMountedRef.current) {
        setCurrentSlide(4);
      }
    } catch (error: any) {
      if (__DEV__) {
        devError("[P0_PROFILE_SETUP] save failed", {
          message: error?.message,
          status: error?.status ?? error?.response?.status ?? null,
          data: error?.data ? JSON.stringify(error.data).slice(0, 300) : null,
          endpoint: error?.endpoint,
        });
      }

      // Extract true backend validation reason if available
      const validationReason = error?.data?.error?.fields?.[0]?.reason;
      const backendMessage = error?.data?.message || error?.data?.error?.message;
      
      // Check for specific errors
      if (error?.message?.toLowerCase().includes("handle") && error?.message?.toLowerCase().includes("taken")) {
        setHandleError("This handle is already taken");
      } else if (validationReason) {
        // Show the first validation field reason (e.g., "avatarUrl must be a string")
        setErrorBanner(validationReason);
      } else if (backendMessage) {
        setErrorBanner(backendMessage);
      } else {
        setErrorBanner("Couldn't save profile. Please try again.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // ============ SLIDE 4: FIND FRIENDS (CONTACTS) ============

  const loadContacts = async () => {
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      trackContactsPermissionResult({ granted: status === "granted", source: "onboarding" });
      if (status !== "granted") {
        setContactsPermissionDenied(true);
        setContactsLoading(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
        sort: Contacts.SortTypes.FirstName,
      });
      const validContacts = data.filter(
        (c) => (c.emails && c.emails.length > 0) || (c.phoneNumbers && c.phoneNumbers.length > 0)
      );
      setPhoneContacts(validContacts.slice(0, 100));
    } catch (error) {
      devError("Error loading contacts:", error);
    }
    setContactsLoading(false);
  };

  const toggleContactSelection = (contactId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const sendSelectedInvites = async () => {
    if (selectedContacts.size === 0) {
      setCurrentSlide(5);
      return;
    }
    setSendingInvites(true);
    const selected = phoneContacts.filter((c) => c.id && selectedContacts.has(c.id));
    let sentCount = 0;
    for (const contact of selected) {
      const email = contact.emails?.[0]?.email;
      const phone = contact.phoneNumbers?.[0]?.number;
      try {
        if (email) {
          await api.post<SendFriendRequestResponse>("/api/friends/request", { email });
          sentCount++;
        } else if (phone) {
          await api.post<SendFriendRequestResponse>("/api/friends/request", { phone });
          sentCount++;
        }
      } catch {
        // Continue — partial success is fine
      }
    }
    setSendingInvites(false);
    trackContactsImportResult({ existingUsersCount: phoneContacts.length, requestsSentCount: sentCount, source: "onboarding" });
    if (sentCount > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshAfterFriendRequestSent(queryClient);
      safeToast.success("Invites Sent!", `Friend requests sent to ${sentCount} contact${sentCount !== 1 ? "s" : ""}`);
    }
    setCurrentSlide(5);
  };

  // ============ SLIDE 5: FINISH ============

  const handleFinishOnboarding = async () => {
    if (__DEV__) devLog("[Onboarding] Finishing...");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Mark onboarding complete
    await AsyncStorage.setItem("onboarding_completed", "true");

    // Notify backend (fire and forget)
    api.post("/api/onboarding/complete", {}).catch(() => {});

    // ✅ AUTH ROUTING SSOT: Use shared post-onboarding routing
    // This ensures consistent routing logic with login.tsx
    await routeAfterAuthSuccess(router, { source: 'signup' });
  };

  // REMOVED: handleNotificationNudgeClose - no longer needed

  // ============ RENDER SLIDES ============

  const handleHeroLayout = (e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
    if (!__DEV__ || _welcomeProbeCount >= _WELCOME_PROBE_MAX) return;
    const { x, y, width, height } = e.nativeEvent.layout;
    const dY = _welcomeProbeHeroPrev.y >= 0 ? y - _welcomeProbeHeroPrev.y : 0;
    const dH = _welcomeProbeHeroPrev.h >= 0 ? height - _welcomeProbeHeroPrev.h : 0;
    if (_welcomeProbeHeroPrev.y === y && _welcomeProbeHeroPrev.h === height && _welcomeProbeHeroPrev.y >= 0) return;
    _welcomeProbeHeroPrev = { y, h: height };
    _welcomeProbeCount++;
    const payload = {
      tMs: Date.now() - _welcomeProbeMountTs,
      phase: 'hero-layout',
      x, y, w: width, h: height,
      dY, dH,
    };
  };

  const renderSlide1 = () => (
    <OnboardingLayout background={colors.background}>
      <View style={styles.slideContent}>
        <Animated.View
          entering={smoothFadeIn(100)}
          style={styles.centeredContent}
          onLayout={__DEV__ ? handleHeroLayout : undefined}
        >
          <View style={[styles.iconContainer, { backgroundColor: `${themeColor}20` }]}>
            <CalendarIcon size={48} color={themeColor} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Your Social Calendar
          </Text>

          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            See what friends are up to.{"\n"}Share plans in seconds.{"\n"}Stay in sync, effortlessly.
          </Text>
        </Animated.View>

        <Animated.View entering={smoothFadeIn(300)} style={styles.buttonGroup}>
          <Button
            variant="primary"
            label="Continue"
            onPress={() => setCurrentSlide(2)}
            leftIcon={<ArrowRight size={20} color="#fff" />}
            style={{ borderRadius: RADIUS.lg }}
          />
          <Button
            testID="welcome-login-button"
            variant="ghost"
            label="Log In"
            onPress={() => router.replace("/login")}
          />
        </Animated.View>
      </View>
    </OnboardingLayout>
  );

  const renderSlide2 = () => {
    if (__DEV__) devLog('[P2_ONBOARDING_UI_SSOT]', { screen: 'welcome/createAccount', input: 'SSOT', button: 'SSOT', card: 'n/a' });
    if (__DEV__) devLog("[P0_SIGNUP_JITTER]", { slide: currentSlide, fix: "scrollContentKeyboard-no-justifyCenter" });
    return (
    <OnboardingLayout background={colors.background}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex1}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContentKeyboard}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={smoothFadeIn()} style={styles.formHeader}>
            <Text style={[styles.title, { color: colors.text }]}>
              Create Account
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              So friends can find and connect with you
            </Text>
          </Animated.View>

          {errorBanner && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorBanner}</Text>
            </View>
          )}

          {/* DEV-only: Apple Auth Debug Panel */}
          {__DEV__ && Platform.OS === "ios" && appleAuthDebug.attemptId && (
            <View style={[styles.errorBanner, { backgroundColor: "#1a1a2e", borderColor: "#4a4a6a" }]}>
              <Text style={{ color: "#8be9fd", fontSize: 10, fontFamily: "monospace" }}>
                [APPLE_AUTH_TRACE] {appleAuthDebug.attemptId}
              </Text>
              <Text style={{ color: "#50fa7b", fontSize: 10, fontFamily: "monospace" }}>
                Stage: {appleAuthDebug.stage}
              </Text>
              {appleAuthDebug.error && (
                <Text style={{ color: "#ff5555", fontSize: 10, fontFamily: "monospace" }}>
                  Error: {appleAuthDebug.error}
                </Text>
              )}
            </View>
          )}

          {/* DEV-only: Run Apple Sign-In Diagnostics button */}
          {__DEV__ && Platform.OS === "ios" && (
            <Pressable
              onPress={() => {
                devLog("[APPLE_AUTH_DIAG] Running diagnostics...");
                runAppleSignInDiagnostics();
              }}
              style={{ padding: 8, alignItems: "center" }}
            >
              <Text style={{ color: colors.textTertiary, fontSize: 10, textDecorationLine: "underline" }}>
                [DEV] Run Apple Sign-In Diagnostics
              </Text>
            </Pressable>
          )}

          {/* Apple Sign In - gated by canShowAppleSignIn (iOS + native module available) */}
          {canShowAppleSignIn && (
            <Animated.View entering={smoothFadeIn(100)}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  isDark
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={16}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            </Animated.View>
          )}

          {canShowAppleSignIn && (
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.borderSubtle }]} />
              <Text style={[styles.dividerText, { color: colors.textTertiary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.borderSubtle }]} />
            </View>
          )}

          <Animated.View entering={smoothFadeIn(200)} style={styles.inputGroup}>
            <StyledInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              colors={colors}
            />
            <StyledInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
              colors={colors}
            />
          </Animated.View>

          <Animated.View entering={smoothFadeIn(300)}>
            <Text style={[styles.termsText, { color: colors.textTertiary }]}>
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </Text>

            <Button
              variant="secondary"
              label="Continue with Email"
              onPress={handleEmailAuth}
              loading={isLoading}
              style={{ borderRadius: RADIUS.lg, marginBottom: 8 }}
            />
          </Animated.View>

          <Button
            variant="ghost"
            label="Already have an account? Log In"
            onPress={() => router.replace("/login")}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingLayout>
  );
  };

  const renderSlide3 = () => {
    if (__DEV__) devLog('[P2_ONBOARDING_UI_SSOT]', { screen: 'welcome/profileSetup', input: 'SSOT', button: 'SSOT', card: 'n/a' });
    return (
    <OnboardingLayout background={colors.background}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex1}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContentKeyboard}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={smoothFadeIn()} style={styles.formHeader}>
            <Text style={[styles.title, { color: colors.text }]}>
              Set Up Your Profile
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Help friends find and recognize you
            </Text>
          </Animated.View>

          {errorBanner && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorBanner}</Text>
            </View>
          )}

          {/* Photo picker (optional) */}
          <Animated.View entering={smoothFadeIn(100)} style={styles.photoSection}>
            <Pressable onPress={handlePickPhoto} disabled={uploadBusy}>
              <View style={[styles.photoPlaceholder, { borderColor: themeColor }]}>
                {avatarLocalUri ? (
                  // INVARIANT_ALLOW_RAW_IMAGE_CONTENT — onboarding avatar local preview (not Cloudinary)
                  <ExpoImage source={{ uri: avatarLocalUri }} style={styles.photoImage} contentFit="cover" cachePolicy="memory-disk" transition={200} priority="normal" />
                ) : (
                  <Camera size={32} color={themeColor} />
                )}
                {uploadBusy && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                )}
              </View>
            </Pressable>
            <Pressable onPress={handlePickPhoto} disabled={uploadBusy}>
              <Text style={[styles.addPhotoText, { color: themeColor }]}>
                {avatarLocalUri ? "Change Photo" : "Add Photo"} (optional)
              </Text>
            </Pressable>
          </Animated.View>

          {/* [P0_PHOTO_UPLOAD] DEV-only on-screen diagnostic — visible text for upload debugging */}
          {__DEV__ && uploadDiag && (
            <View style={{ backgroundColor: "#1a1a2e", borderRadius: 8, padding: 8, marginBottom: 8 }}>
              <Text style={{ color: "#ff9500", fontSize: 10, fontFamily: "monospace" }} numberOfLines={4}>
                [P0_PHOTO_UPLOAD] {uploadDiag}
              </Text>
            </View>
          )}

          <Animated.View entering={smoothFadeIn(200)} style={styles.inputGroup}>
            <StyledInput
              value={displayName}
              onChangeText={(text) => {
                setDisplayName(text);
                setNameError(null);
              }}
              placeholder="Full Name"
              autoCapitalize="words"
              error={nameError || undefined}
              colors={colors}
            />
            <View>
              <View style={styles.handleInputWrapper}>
                <Text style={[styles.handlePrefix, { color: colors.textTertiary }]}>@</Text>
                <TextInput
                  value={handle}
                  onChangeText={(text) => {
                    setHandle(text.replace(/^@/, ""));
                    setHandleError(null);
                  }}
                  placeholder="Unique handle"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.handleInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.inputBg,
                      borderColor: handleError ? "#E85D4C" : colors.borderSubtle,
                    },
                  ]}
                />
              </View>
              {handleError && <Text style={styles.errorText}>{handleError}</Text>}
            </View>
          </Animated.View>

          <Animated.View entering={smoothFadeIn(300)} style={styles.buttonGroup}>
            <Button
              variant="primary"
              label="Continue"
              onPress={handleSlide3Continue}
              loading={isLoading}
              leftIcon={<ArrowRight size={20} color="#fff" />}
              style={{ borderRadius: RADIUS.lg }}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingLayout>
  );
  };

  const renderSlide4 = () => {
    if (__DEV__) {
      devLog('[ONBOARDING_CONTACTS_BRANCH]', { screen: 'welcome/findFriends', legacyFlow: false, sharedComponent: true });
      devLog('[ONBOARDING_CONTACTS_RENDER_SHARED]', { using: 'FriendDiscoverySurface' });
    }
    return (
    <OnboardingLayout background={colors.background}>
      <View style={styles.slideContent}>
        <FriendDiscoverySurface
          showSkipButton={true}
          onSkip={() => {
            if (__DEV__) {
              devLog('[ONBOARDING_CONTACTS_SKIP]', { action: 'skip', nextSlide: 5 });
            }
            setCurrentSlide(5);
          }}
          onFriendAdded={() => {
            // Optionally trigger refresh or analytics tracking
            devLog("Friend added during onboarding");
          }}
        />


      </View>
    </OnboardingLayout>
  );
  };

  const renderSlide5 = () => {
    if (__DEV__) devLog('[P2_ONBOARDING_UI_SSOT]', { screen: 'welcome/quote', input: 'n/a', button: 'SSOT', card: 'SSOT' });
    return (
    <OnboardingLayout background={colors.background}>
      <View style={styles.slideContent}>
        <Animated.View entering={smoothFadeIn()} style={styles.centeredContent}>
          <View style={[styles.iconContainer, { backgroundColor: `${themeColor}20` }]}>
            <Sparkles size={36} color={themeColor} />
          </View>

          <View style={[styles.quoteCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.quoteText, { color: colors.text }]}>
              "The quality of your life is measured by the quality of your relationships."
            </Text>
            <Text style={[styles.quoteAttribution, { color: colors.textSecondary }]}>
              — Jürgen Matthesius
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={smoothFadeIn(300)} style={styles.buttonGroup}>
          <Button
            variant="primary"
            label="Continue"
            onPress={handleFinishOnboarding}
            leftIcon={<ArrowRight size={20} color="#fff" />}
            style={{ borderRadius: RADIUS.lg }}
          />
        </Animated.View>
      </View>
    </OnboardingLayout>
  );
  };

  // ============ MAIN RENDER ============

  const renderCurrentSlide = () => {
    switch (currentSlide) {
      case 1:
        return renderSlide1();
      case 2:
        return renderSlide2();
      case 3:
        return renderSlide3();
      case 4:
        return renderSlide4();
      case 5:
        return renderSlide5();
      default:
        return renderSlide1();
    }
  };

  return (
    <>
      {/* REMOVED: SlideInRight/SlideOutLeft animations for instant slide transitions */}
      <View testID="welcome-screen" key={currentSlide} style={styles.flex1}>
        {renderCurrentSlide()}
      </View>

      {/* REMOVED: NotificationNudgeModal - now triggered at Aha moments */}
    </>
  );
}

// ============ STYLES ============
const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  layoutContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  slideContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  // [P0_SIGNUP_JITTER] Keyboard-safe scroll container: no justifyContent center (jitter cause),
  // uses paddingBottom instead so content stays top-anchored when keyboard appears.
  scrollContentKeyboard: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 80,
  },
  centeredContent: {
    alignItems: "center",
    marginBottom: 48,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontFamily: "Sora_700Bold",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 17,
    fontFamily: "Sora_400Regular",
    textAlign: "center",
    lineHeight: 26,
  },
  formHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  buttonGroup: {
    gap: 8,
  },
  inputContainer: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Sora_400Regular",
    paddingVertical: 18,
  },
  eyeButton: {
    padding: 8,
  },
  inputGroup: {
    gap: 16,
    marginBottom: 24,
  },
  errorText: {
    color: "#E85D4C",
    fontSize: 13,
    fontFamily: "Sora_400Regular",
    marginTop: 4,
    marginLeft: 4,
  },
  errorBanner: {
    backgroundColor: "rgba(232,93,76,0.15)",
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: "#E85D4C",
    fontSize: 14,
    fontFamily: "Sora_400Regular",
    textAlign: "center",
  },
  termsText: {
    fontSize: 12,
    fontFamily: "Sora_400Regular",
    textAlign: "center",
    marginBottom: 20,
  },
  appleButton: {
    width: "100%",
    height: 56,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Sora_400Regular",
    marginHorizontal: 16,
  },
  photoSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 12,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoText: {
    fontSize: 14,
    fontFamily: "Sora_600SemiBold",
  },
  handleInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  handlePrefix: {
    fontSize: 16,
    fontFamily: "Sora_400Regular",
    marginRight: 4,
  },
  handleInput: {
    flex: 1,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 16,
    fontFamily: "Sora_400Regular",
  },
  quoteCard: {
    borderRadius: RADIUS.xl,
    padding: 28,
    borderWidth: 1,
    marginTop: 24,
  },
  quoteText: {
    fontSize: 18,
    fontFamily: "Sora_400Regular",
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 28,
    marginBottom: 16,
  },
  quoteAttribution: {
    fontSize: 14,
    fontFamily: "Sora_600SemiBold",
    textAlign: "center",
  },
});
