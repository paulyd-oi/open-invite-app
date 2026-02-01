import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import Animated, {
  FadeInUp,
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

// ============ ANIMATION HELPERS ============
// Duration-based entrance animation - no spring overshoot possible
const smoothFadeIn = (delayMs = 0) =>
  FadeInUp.delay(delayMs).duration(280);

import {
  Calendar as CalendarIcon,
  ArrowRight,
  Camera,
  Eye,
  EyeOff,
  Sparkles,
} from "@/ui/icons";
import { useFonts } from "expo-font";
import { Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from "@expo-google-fonts/sora";

import { authClient, hasAuthToken, setAuthToken, refreshExplicitCookie, setExplicitCookieValueDirectly, isValidBetterAuthToken, setOiSessionToken, ensureSessionReady } from "@/lib/authClient";
import { setExplicitCookiePair } from "@/lib/sessionCookie";
import { getSessionCached } from "@/lib/sessionCache";
import { api } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { safeToast } from "@/lib/safeToast";
import { isAppleSignInAvailable, isAppleAuthCancellation, decodeAppleAuthError, classifyAppleAuthError, runAppleSignInDiagnostics } from "@/lib/appleSignIn";
import { requestBootstrapRefreshOnce } from "@/hooks/useBootAuthority";
import { uploadImage } from "@/lib/imageUpload";
import { buildGuideKey, GUIDE_FORCE_SHOW_PREFIX } from "@/hooks/useOnboardingGuide";
import type { AppleAuthErrorBucket } from "@/lib/appleSignIn";

// Apple Authentication - dynamically loaded (requires native build with usesAppleSignIn: true)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AppleAuthentication: any = null;
try {
  AppleAuthentication = require("expo-apple-authentication");
} catch {
  console.log("[Apple Auth] expo-apple-authentication not available - requires native build");
}

// Feature flag: disable Apple Sign-In for launch build
// Set to true to re-enable, or wire to EXPO_PUBLIC_ENABLE_APPLE_SIGNIN
const APPLE_SIGNIN_ENABLED = false;

/**
 * Human-readable explanation for each error bucket.
 * Used in diagnostic logs to help interpret failure mode.
 */
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

// ============ THEME HELPERS (LOCAL SCOPE ONLY) ============
interface OnboardingTheme {
  background: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  inputBg: string;
  inputBorder: string;
}

const lightTheme: OnboardingTheme = {
  background: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceBorder: "rgba(0,0,0,0.08)",
  text: "#1A1A1A",
  textSecondary: "#666666",
  textTertiary: "#999999",
  accent: "#E85D4C",
  inputBg: "#FFFFFF",
  inputBorder: "rgba(0,0,0,0.12)",
};

const darkTheme: OnboardingTheme = {
  background: "#121218",
  surface: "rgba(255,255,255,0.06)",
  surfaceBorder: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.65)",
  textTertiary: "rgba(255,255,255,0.4)",
  accent: "#E85D4C",
  inputBg: "rgba(255,255,255,0.06)",
  inputBorder: "rgba(255,255,255,0.12)",
};

function useOnboardingTheme(): OnboardingTheme {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkTheme : lightTheme;
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
type OnboardingSlide = 1 | 2 | 3 | 4;

// ============ SHARED LAYOUT ============
const OnboardingLayout = ({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: OnboardingTheme;
}) => {
  return (
    <View style={[styles.layoutContainer, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        {children}
      </SafeAreaView>
    </View>
  );
};

// ============ PRIMARY BUTTON ============
const PrimaryButton = ({
  onPress,
  title,
  loading = false,
  theme,
}: {
  onPress: () => void;
  title: string;
  loading?: boolean;
  theme: OnboardingTheme;
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.primaryButton,
          { backgroundColor: theme.accent },
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Text style={styles.primaryButtonText}>{title}</Text>
            <ArrowRight size={20} color="#fff" />
          </>
        )}
      </Pressable>
    </Animated.View>
  );
};

// ============ SECONDARY BUTTON ============
const SecondaryButton = ({
  onPress,
  title,
  theme,
}: {
  onPress: () => void;
  title: string;
  theme: OnboardingTheme;
}) => (
  <Pressable
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }}
    style={styles.secondaryButton}
  >
    <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>
      {title}
    </Text>
  </Pressable>
);

// ============ AUTH BUTTON ============
const AuthButton = ({
  onPress,
  title,
  loading = false,
  theme,
}: {
  onPress: () => void;
  title: string;
  loading?: boolean;
  theme: OnboardingTheme;
}) => (
  <Pressable
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onPress();
    }}
    style={[
      styles.authButton,
      { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
    ]}
  >
    {loading ? (
      <ActivityIndicator color={theme.text} size="small" />
    ) : (
      <Text style={[styles.authButtonText, { color: theme.text }]}>{title}</Text>
    )}
  </Pressable>
);

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
  theme,
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
  theme: OnboardingTheme;
}) => (
  <View>
    <View
      style={[
        styles.inputContainer,
        {
          backgroundColor: theme.inputBg,
          borderColor: error ? "#E85D4C" : theme.inputBorder,
        },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry && !showPassword}
        autoFocus={autoFocus}
        style={[styles.input, { color: theme.text }]}
      />
      {onTogglePassword && (
        <Pressable onPress={onTogglePassword} style={styles.eyeButton}>
          {showPassword ? (
            <EyeOff size={20} color={theme.textTertiary} />
          ) : (
            <Eye size={20} color={theme.textTertiary} />
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
  const theme = useOnboardingTheme();
  const isMountedRef = useRef(true);

  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
  });

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

  // REMOVED: Notification nudge state - now triggered at Aha moments

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
          console.log("[Apple Auth] Availability:", available);
        }
      });
    }
  }, []);

  // ============ SLIDE 2: AUTH HANDLERS ============

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorBanner("Please enter your email and password");
      return;
    }

    console.log("[Onboarding] Starting email auth...");
    setIsLoading(true);
    setErrorBanner(null);

    try {
      // Use proper authClient methods which handle cookie establishment:
      // captureAndStoreCookie() -> refreshExplicitCookie() -> verifySessionAfterAuth()
      let result: any;
      let isNewAccount = false;
      
      // Try sign-up first
      result = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: "",
      });
      
      // If sign-up returns error about existing account, try sign-in
      if (result.error?.message?.toLowerCase().includes("exist")) {
        console.log("[Onboarding] Account exists, attempting sign-in...");
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
        console.error("[Onboarding] Session verification failed - no userId after auth");
        setErrorBanner("Session could not be established. Please try again.");
        return;
      }
      
      console.log("[Onboarding] Auth successful, userId:", userId, "isNewAccount:", isNewAccount);

      // NEW ACCOUNT ONLY: Enable onboarding guide forceShow gate
      if (isNewAccount) {
        const forceShowKey = buildGuideKey(GUIDE_FORCE_SHOW_PREFIX, userId);
        await SecureStore.setItemAsync(forceShowKey, "true");
        console.log("[Onboarding] forceShow enabled for new account:", forceShowKey);
      }

      // Pre-populate name if available from result
      if (result.data?.user?.name) {
        setDisplayName(result.data.user.name);
      }

      // Advance to Slide 3
      setCurrentSlide(3);
    } catch (error: any) {
      console.error("[Onboarding] Auth error:", error?.message || error);
      setErrorBanner(error?.message || "Authentication failed. Please try again.");
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleAppleSignIn = async () => {
    // Generate unique attempt ID for trace correlation
    const attemptId = `apple_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Production-safe logging (always logs, but sensitive data only in __DEV__)
    const traceLog = (stage: string, data: Record<string, unknown>) => {
      // Always log stage for production debugging
      console.log(`[APPLE_AUTH_TRACE] ${attemptId} | ${stage}`);
      if (__DEV__) {
        // Full data only in dev
        console.log(JSON.stringify({ tag: "[APPLE_AUTH_TRACE]", attemptId, stage, ...data }));
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
      console.log(`[APPLE_AUTH_TRACE] ${attemptId} | ${stage} | bucket=${errorBucket}`);
      if (__DEV__) {
        console.log(JSON.stringify({ tag: "[APPLE_AUTH_TRACE]", attemptId, stage, error: errorInfo }));
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

      // CRITICAL: Store session cookie for React Native
      // Backend should return mobileSessionToken (preferred) or token/session.token
      // We store in SESSION_COOKIE_KEY and set module cache directly for immediate use
      
      let tokenValue: string | null = null;
      let tokenSource: string = "none";
      
      // Priority 1: mobileSessionToken (canonical Better Auth format)
      if (data.mobileSessionToken && typeof data.mobileSessionToken === 'string') {
        tokenValue = data.mobileSessionToken;
        tokenSource = "mobileSessionToken";
      }
      // Priority 2: token field
      else if (data.token && typeof data.token === 'string') {
        tokenValue = data.token;
        tokenSource = "token";
      }
      // Priority 3: session.token field
      else if (data.session?.token && typeof data.session.token === 'string') {
        tokenValue = data.session.token;
        tokenSource = "session.token";
      }
      // Priority 4: sessionToken field (alternate shape)
      else if (data.sessionToken && typeof data.sessionToken === 'string') {
        tokenValue = data.sessionToken;
        tokenSource = "sessionToken";
      }
      // Priority 5: session.sessionToken field (alternate shape)
      else if (data.session?.sessionToken && typeof data.session.sessionToken === 'string') {
        tokenValue = data.session.sessionToken;
        tokenSource = "session.sessionToken";
      }
      // Priority 6: Extract from Set-Cookie header (if accessible in RN)
      else if (setCookieHeader) {
        const sessionMatch = setCookieHeader.match(/__Secure-better-auth\.session_token=([^;]+)/);
        if (sessionMatch && sessionMatch[1]) {
          tokenValue = sessionMatch[1];
          tokenSource = "Set-Cookie";
        }
      }
      
      traceLog("token_extraction", {
        found: !!tokenValue,
        source: tokenSource,
        tokenLength: tokenValue?.length || 0,
        responseKeys: Object.keys(data || {}),
      });
      
      // PROOF LOG: Token extraction result (never log token value)
      console.log(`[APPLE_TOKEN_PROOF] ok=true tokenFound=${!!tokenValue} keys=${JSON.stringify(Object.keys(data || {}))}`);
      
      if (!tokenValue) {
        traceError("token_missing", {
          message: "No session token in response",
          responseKeys: Object.keys(data || {}),
          hasSetCookie: !!setCookieHeader,
        });
        throw new Error("Apple Sign-In succeeded but no session token was returned. Please try again.");
      }
      
      // CRITICAL: Validate token before storing to prevent UUID/invalid values
      const tokenValidation = isValidBetterAuthToken(tokenValue);
      if (!tokenValidation.isValid) {
        traceError("token_validation_failed", {
          reason: tokenValidation.reason,
          source: tokenSource,
          tokenLength: tokenValue.length,
        });
        throw new Error("Apple Sign-In returned an invalid session token. Please try again.");
      }
      
      traceLog("token_validated", { reason: tokenValidation.reason, source: tokenSource });
      
      // Store token in SecureStore (via setExplicitCookiePair which formats as cookie pair)
      try {
        const stored = await setExplicitCookiePair(tokenValue);
        if (!stored) {
          traceError("cookie_persist_rejected", { message: "setExplicitCookiePair rejected token" });
          throw new Error("Failed to store session token. Please try again.");
        }
        traceLog("cookie_persist_securestore", { success: true, key: "SESSION_COOKIE_KEY" });
      } catch (storeErr: any) {
        traceError("cookie_persist_securestore_fail", storeErr);
        throw storeErr;
      }
      
      // Set module cache directly for immediate use (no read-back delay)
      const cacheSet = setExplicitCookieValueDirectly(`__Secure-better-auth.session_token=${tokenValue}`);
      if (!cacheSet) {
        traceError("cookie_cache_rejected", { message: "setExplicitCookieValueDirectly rejected token" });
        throw new Error("Failed to cache session token. Please try again.");
      }
      traceLog("cookie_cache_set", { success: true });
      
      // Also store as legacy auth token (for any code still using token auth)
      await setAuthToken(tokenValue);
      
      // CRITICAL: Store OI session token for header fallback (iOS cookie jar is unreliable)
      await setOiSessionToken(tokenValue);
      traceLog("oi_token_stored", { tokenLength: tokenValue.length });
      
      // NOTE: We deliberately do NOT call refreshExplicitCookie() here!
      // The memory cache is already set by setExplicitCookieValueDirectly.
      // Calling refreshExplicitCookie() can CLEAR the cache if SecureStore read
      // happens before the write is committed (race condition).
      
      // ============ SESSION BARRIER ============
      // CRITICAL: Use ensureSessionReady() to verify session works BEFORE proceeding.
      // This blocks until we have proof that x-oi-session-token is working.
      traceLog("session_barrier_start", { tokenLength: tokenValue.length });
      const barrierResult = await ensureSessionReady();
      
      // Log the AUTH_BARRIER result explicitly
      console.log(`[AUTH_BARRIER_RESULT] ok=${barrierResult.ok} status=${barrierResult.status} userId=${barrierResult.userId ? barrierResult.userId.substring(0, 8) + '...' : 'null'} attempt=${barrierResult.attempt}${barrierResult.error ? ' error=' + barrierResult.error : ''}`);
      
      if (!barrierResult.ok) {
        traceError("session_barrier_fail", { 
          status: barrierResult.status,
          attempt: barrierResult.attempt,
          error: barrierResult.error,
        });
        // Log clearly and throw - do NOT proceed silently
        console.error("[APPLE_AUTH] Session barrier FAILED - cannot proceed:", barrierResult);
        throw new Error("Session verification failed after Apple Sign-In. Please try again.");
      }
      
      // PROOF LOG with required format
      console.log(`[APPLE_TOKEN_PROOF] tokenFound=true tokenLen=${tokenValue.length} barrier200=true userIdPresent=true`);
      traceLog("session_barrier_success", { userId: barrierResult.userId?.substring(0, 8) });
      // ============ END SESSION BARRIER ============
      
      // CRITICAL: Request bootstrap refresh so bootStatus updates from loggedOut → onboarding/authed
      // Without this, BootRouter may redirect to /login because bootStatus is stale
      requestBootstrapRefreshOnce();
      traceLog("bootstrap_refresh_requested", { success: true });

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
      setCurrentSlide(3);
    } catch (error: any) {
      // Classify the error for diagnostics
      const errorBucket = classifyAppleAuthError(error);
      
      // User cancelled - no error to show
      if (errorBucket === "user_cancel") {
        traceLog("user_cancelled", { cancelled: true, bucket: errorBucket });
        return;
      }
      
      // Log full error with classification for diagnostics
      traceError("final_fail", {
        ...error,
        bucket: errorBucket,
        bucketExplanation: getBucketExplanation(errorBucket),
      });
      
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
    
    // Check session (cookie auth) before upload - use effectiveUserId for unified auth check
    // CRITICAL: Photo upload failure must NOT reset auth state or redirect user.
    // If session check fails, just skip upload - user can add photo later.
    let effectiveUserId: string | null = null;
    try {
      const sessionResult = await getSessionCached();
      effectiveUserId = sessionResult?.effectiveUserId ?? sessionResult?.user?.id ?? null;
      if (!effectiveUserId) {
        console.log("[AUTH_TRACE] Photo upload: no effectiveUserId, skipping (user can add later)");
        return;
      }
      console.log(`[AUTH_TRACE] Photo upload authorized: effectiveUserId=${effectiveUserId.substring(0, 8)}...`);
    } catch (err) {
      console.log("[AUTH_TRACE] Photo upload: session check failed, skipping (transient error)");
      // DO NOT redirect or reset auth state - just skip the upload
      return;
    }

    setUploadBusy(true);

    try {
      console.log("[Onboarding] Uploading photo to Cloudinary...");
      const uploadResponse = await uploadImage(uri, true);
      const normalizedUrl = normalizeAvatarUrl(uploadResponse.url);
      console.log("[Onboarding] Photo uploaded, normalized URL:", normalizedUrl.substring(0, 50) + "...");

      if (!isMountedRef.current) return;
      setAvatarUrl(normalizedUrl);

      // Photo uploaded - defer profile save to Continue step when handle is available
      console.log("[Onboarding] Photo uploaded, stored in state. Will save with profile on Continue.");
      safeToast.success("Photo uploaded", "It will be saved with your profile.");
    } catch (error: any) {
      // CRITICAL: Photo upload failure must NOT affect auth state or navigation
      // Just log and inform user - they can add photo later from settings
      console.log("[AUTH_TRACE] Photo upload failed:", error?.message || error);
      if (isMountedRef.current) {
        safeToast.warning("Upload failed", "Could not upload photo. You can add it later in Settings.");
      }
      // Clear local URI so user doesn't see broken preview
      // But DON'T clear avatarUrl if it was already set from a previous successful upload
    } finally {
      if (isMountedRef.current) {
        setUploadBusy(false);
      }
    }
  };

  const handleSlide3Continue = async () => {
    console.log("[Onboarding] Continue pressed");
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
      console.log(`[AUTH_TRACE] Onboarding session check: effectiveUserId=${!!effectiveUserId}`);
    } catch (sessionErr: any) {
      const status = sessionErr?.status || 'unknown';
      console.log(`[AUTH_TRACE] Onboarding session check failed: status=${status}`);
      // Transient error - DO NOT redirect to /login. User just authenticated.
      // Show error and allow retry.
      setErrorBanner("Session check failed. Please tap Continue to retry.");
      return;
    }
    
    // If no session at all (truly logged out), show error but don't auto-redirect
    // This prevents the "loop back to beginning" issue
    if (!effectiveUserId) {
      console.log("[AUTH_TRACE] Onboarding: no effectiveUserId, showing error");
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
        if (__DEV__) console.log("[DISPLAYNAME_WRITE] Persisting user-entered name:", trimmedName);
      }

      // Add avatarUrl if present (Cloudinary https:// or legacy backend /uploads/)
      if (typeof avatarUrl === "string" && avatarUrl.trim().length > 0) {
        payload.avatarUrl = avatarUrl.trim();
      }

      console.log("[Onboarding] /api/profile payload keys", Object.keys(payload));
      console.log("[Onboarding] /api/profile payload", payload);
      const response = await api.put<{ success?: boolean; profile?: any }>("/api/profile", payload);
      console.log("[Onboarding] Profile saved successfully");

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
      console.log("[AUTH_TRACE] Onboarding: profile saved, requesting bootstrap refresh");
      requestBootstrapRefreshOnce();

      // Advance to Slide 4
      if (isMountedRef.current) {
        setCurrentSlide(4);
      }
    } catch (error: any) {
      console.error("[Onboarding] Profile save failed:", error?.message || error);
      
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

  // ============ SLIDE 4: FINISH ============

  const handleFinishOnboarding = async () => {
    console.log("[Onboarding] Finishing...");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Mark onboarding complete
    await AsyncStorage.setItem("onboarding_completed", "true");

    // Notify backend (fire and forget)
    api.post("/api/onboarding/complete", {}).catch(() => {});

    // REMOVED: Early notification nudge prompt
    // Notifications will be prompted after Aha moments (create event, RSVP)
    // Navigate to calendar - use replace to prevent back nav
    router.replace("/calendar");
  };

  // REMOVED: handleNotificationNudgeClose - no longer needed

  // ============ RENDER SLIDES ============

  const renderSlide1 = () => (
    <OnboardingLayout theme={theme}>
      <View style={styles.slideContent}>
        <Animated.View entering={smoothFadeIn(100)} style={styles.centeredContent}>
          <View style={[styles.iconContainer, { backgroundColor: `${theme.accent}20` }]}>
            <CalendarIcon size={48} color={theme.accent} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>
            Your Social Calendar
          </Text>

          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            See what friends are up to.{"\n"}Share plans in seconds.{"\n"}Stay in sync, effortlessly.
          </Text>
        </Animated.View>

        <Animated.View entering={smoothFadeIn(300)} style={styles.buttonGroup}>
          <PrimaryButton
            title="Continue"
            onPress={() => setCurrentSlide(2)}
            theme={theme}
          />
          <SecondaryButton
            title="Log In"
            onPress={() => router.replace("/login")}
            theme={theme}
          />
        </Animated.View>
      </View>
    </OnboardingLayout>
  );

  const renderSlide2 = () => (
    <OnboardingLayout theme={theme}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex1}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={smoothFadeIn()} style={styles.formHeader}>
            <Text style={[styles.title, { color: theme.text }]}>
              Create Account
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
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
                console.log("[APPLE_AUTH_DIAG] Running diagnostics...");
                runAppleSignInDiagnostics();
              }}
              style={{ padding: 8, alignItems: "center" }}
            >
              <Text style={{ color: theme.textTertiary, fontSize: 10, textDecorationLine: "underline" }}>
                [DEV] Run Apple Sign-In Diagnostics
              </Text>
            </Pressable>
          )}

          {/* Apple Sign In - gated by canShowAppleSignIn (APPLE_SIGNIN_ENABLED=false for launch) */}
          {canShowAppleSignIn && (
            <Animated.View entering={smoothFadeIn(100)}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  theme === darkTheme
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
              <View style={[styles.dividerLine, { backgroundColor: theme.surfaceBorder }]} />
              <Text style={[styles.dividerText, { color: theme.textTertiary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.surfaceBorder }]} />
            </View>
          )}

          <Animated.View entering={smoothFadeIn(200)} style={styles.inputGroup}>
            <StyledInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              theme={theme}
            />
            <StyledInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
              theme={theme}
            />
          </Animated.View>

          <Animated.View entering={smoothFadeIn(300)}>
            <Text style={[styles.termsText, { color: theme.textTertiary }]}>
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </Text>

            <AuthButton
              title="Continue with Email"
              onPress={handleEmailAuth}
              loading={isLoading}
              theme={theme}
            />
          </Animated.View>

          <SecondaryButton
            title="Already have an account? Log In"
            onPress={() => router.replace("/login")}
            theme={theme}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingLayout>
  );

  const renderSlide3 = () => (
    <OnboardingLayout theme={theme}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex1}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={smoothFadeIn()} style={styles.formHeader}>
            <Text style={[styles.title, { color: theme.text }]}>
              Set Up Your Profile
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
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
              <View style={[styles.photoPlaceholder, { borderColor: theme.accent }]}>
                {avatarLocalUri ? (
                  <Image source={{ uri: avatarLocalUri }} style={styles.photoImage} />
                ) : (
                  <Camera size={32} color={theme.accent} />
                )}
                {uploadBusy && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                )}
              </View>
            </Pressable>
            <Pressable onPress={handlePickPhoto} disabled={uploadBusy}>
              <Text style={[styles.addPhotoText, { color: theme.accent }]}>
                {avatarLocalUri ? "Change Photo" : "Add Photo"} (optional)
              </Text>
            </Pressable>
          </Animated.View>

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
              theme={theme}
            />
            <View>
              <View style={styles.handleInputWrapper}>
                <Text style={[styles.handlePrefix, { color: theme.textTertiary }]}>@</Text>
                <TextInput
                  value={handle}
                  onChangeText={(text) => {
                    setHandle(text.replace(/^@/, ""));
                    setHandleError(null);
                  }}
                  placeholder="Unique handle"
                  placeholderTextColor={theme.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.handleInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.inputBg,
                      borderColor: handleError ? "#E85D4C" : theme.inputBorder,
                    },
                  ]}
                />
              </View>
              {handleError && <Text style={styles.errorText}>{handleError}</Text>}
            </View>
          </Animated.View>

          <Animated.View entering={smoothFadeIn(300)} style={styles.buttonGroup}>
            <PrimaryButton
              title="Continue"
              onPress={handleSlide3Continue}
              loading={isLoading}
              theme={theme}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingLayout>
  );

  const renderSlide4 = () => (
    <OnboardingLayout theme={theme}>
      <View style={styles.slideContent}>
        <Animated.View entering={smoothFadeIn()} style={styles.centeredContent}>
          <View style={[styles.iconContainer, { backgroundColor: `${theme.accent}20` }]}>
            <Sparkles size={36} color={theme.accent} />
          </View>

          <View style={[styles.quoteCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <Text style={[styles.quoteText, { color: theme.text }]}>
              "The quality of your life is measured by the quality of your relationships."
            </Text>
            <Text style={[styles.quoteAttribution, { color: theme.textSecondary }]}>
              — Jürgen Matthesius
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={smoothFadeIn(300)} style={styles.buttonGroup}>
          <PrimaryButton
            title="Continue"
            onPress={handleFinishOnboarding}
            theme={theme}
          />
        </Animated.View>
      </View>
    </OnboardingLayout>
  );

  // ============ MAIN RENDER ============

  if (!fontsLoaded) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

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
      default:
        return renderSlide1();
    }
  };

  return (
    <>
      <Animated.View
        key={currentSlide}
        entering={SlideInRight.duration(250)}
        exiting={SlideOutLeft.duration(200)}
        style={styles.flex1}
      >
        {renderCurrentSlide()}
      </Animated.View>

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
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#E85D4C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Sora_600SemiBold",
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: "Sora_400Regular",
  },
  authButton: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  authButtonText: {
    fontSize: 16,
    fontFamily: "Sora_600SemiBold",
  },
  inputContainer: {
    borderRadius: 16,
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
    borderRadius: 12,
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
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 16,
    fontFamily: "Sora_400Regular",
  },
  quoteCard: {
    borderRadius: 20,
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
