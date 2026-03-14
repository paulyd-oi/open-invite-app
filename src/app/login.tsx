import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  Dimensions,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useFirstPaintStable } from "@/hooks/useFirstPaintStable";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInUp,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  X,
  ShieldCheck,
  CheckCircle,
  Sparkles,
} from "@/ui/icons";
// [P1_FONTS_SSOT] Font imports removed — fonts loaded once in _layout.tsx

import { authClient } from "@/lib/authClient";
import { requestPasswordResetEmail } from "@/lib/authFlowClient";
import { useSession } from "@/lib/useSession";
import { useTheme } from "@/lib/ThemeContext";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";
import { SafeAreaScreen } from "@/ui/SafeAreaScreen";
import { isAppleSignInAvailable } from "@/lib/appleSignIn";
import { handleSharedAppleSignIn } from "@/lib/sharedAppleAuth";

// Apple Authentication - dynamically loaded (requires native build with usesAppleSignIn: true)
let AppleAuthentication: any = null;
try {
  AppleAuthentication = require("expo-apple-authentication");
} catch {
  if (__DEV__) devLog("[Apple Auth] expo-apple-authentication not available - requires native build");
}


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ============ ONBOARDING COMPLETION GATE ============
// Prevent redirect loop: only navigate to "/" if onboarding is complete
// Otherwise redirect to "/welcome" to complete onboarding flow
async function routeAfterAuthSuccess(router: any): Promise<void> {
  try {
    // Cookie-based auth: Session is established via Set-Cookie header.
    // Token in SecureStore is optional (backward compat) - don't gate on it.
    // Instead, we trust that signIn.email() succeeded and proceed to bootstrap.
    
    if (__DEV__) {
      devLog("[P0_BOOT_CONTRACT] Auth success, proceeding with cookie-based session");
    }

    // ✅ CRITICAL: Force bootstrap re-run after login
    // Singleton bootstrap won't re-run automatically - must explicitly trigger it
    // This ensures bootStatus updates from 'loggedOut' to 'authed'/'onboarding'
    const { rebootstrapAfterLogin } = await import("@/hooks/useBootAuthority");
    if (__DEV__) {
      devLog("[P0_BOOT_CONTRACT] Forcing bootstrap re-run after login...");
    }
    const finalStatus = await rebootstrapAfterLogin();

    // ✅ FIX: Route directly to the correct destination based on bootstrap result
    // This prevents white screen from navigating to "/" which returns null during loading
    if (__DEV__) {
      devLog("[P0_BOOT_CONTRACT] Bootstrap complete, finalStatus:", finalStatus);
      devLog('[P0_AUTH_JITTER]', 'post-login-route', {
        surface: 'login/routeAfterAuthSuccess',
        finalStatus,
        decision: finalStatus === 'authed' ? 'calendar' : 'welcome',
      });
    }
    
    if (finalStatus === 'authed') {
      // [P0_BOOT_CONTRACT] Proof log: deterministic route to calendar
      devLog('[P0_BOOT_CONTRACT]', 'finalStatus=authed → /calendar');
      devLog("[P0_BOOT_CONTRACT] → Routing directly to /calendar (fully authenticated)");
      router.replace("/calendar");
    } else if (finalStatus === 'onboarding') {
      devLog("[P0_BOOT_CONTRACT] → Routing to /welcome (onboarding incomplete)");
      router.replace("/welcome");
    } else {
      // error or degraded - stay on current screen or go to welcome
      devWarn("[P0_BOOT_CONTRACT] Unexpected status after login:", finalStatus);
      router.replace("/welcome");
    }
  } catch (error) {
    devError("[P0_BOOT_CONTRACT] Error during post-login routing:", error);
    // On error, stay on login (fail safe to avoid blocking user with redirects)
    devLog("[P0_BOOT_CONTRACT] Staying on login screen due to error");
  }
}

type AuthView = "login" | "forgotPassword" | "success";

export default function LoginScreen() {
  const router = useRouter();
  const { data: session } = useSession();
  const { themeColor, isDark, colors } = useTheme();
  // [P0_SAFE_AREA_SSOT] Insets now handled by SafeAreaScreen component
  if (__DEV__) devLog('[P2_ONBOARDING_UI_SSOT]', { screen: 'login', button: 'SSOT', theme: 'ThemeContext' });

  // [P1_FONTS_SSOT] useFonts removed — _layout.tsx gates app on font load

  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Apple Sign-In availability
  const [isAppleSignInReady, setIsAppleSignInReady] = useState(false);

  // Derived: can show Apple Sign-In UI (iOS only + native module available)
  const canShowAppleSignIn =
    Platform.OS === "ios" &&
    isAppleSignInReady &&
    !!AppleAuthentication;

  // Check Apple Sign-In availability on mount
  useEffect(() => {
    if (Platform.OS === "ios") {
      isAppleSignInAvailable().then((available) => {
        setIsAppleSignInReady(available);
        if (__DEV__) devLog("[Apple Auth] Availability:", available);
      });
    }
  }, []);

  // NOTE: Removed auto-redirect based on session.user - BootRouter handles all auth routing.
  // login.tsx should only redirect after explicit login success, not on mount.

  // Handle Apple Sign-In using shared implementation
  const handleAppleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    await handleSharedAppleSignIn({
      isAppleSignInReady,
      setIsLoading,
      onSuccess: () => {
        // Route to success and then authenticate (same flow as email login)
        setAuthView("success");
        setTimeout(() => {
          routeAfterAuthSuccess(router);
        }, 1500);
      },
    });
  };

  // Handle email sign-in
  const handleSignIn = async () => {
    if (!email || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Missing Fields", "Please enter email and password");
      return;
    }

    setIsLoading(true);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        // NOTE: No longer block login for unverified email - users can sign in
        // and will see banner in-app to verify later
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        safeToast.error(
          "Sign In Failed",
          result.error.message || "Please check your credentials"
        );
      } else if (result.data) {
        // [P0_BOOT_CONTRACT] Proof log: login succeeded, transitioning to success view
        devLog('[P0_BOOT_CONTRACT]', 'Login successful, userId:', result.data.user?.id?.substring(0, 8) || 'unknown');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setAuthView("success");
        setTimeout(() => {
          routeAfterAuthSuccess(router);
        }, 1500);
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error(
        "Sign In Failed",
        error?.message || "Unable to connect. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      safeToast.error("Missing Email", "Please enter your email address");
      return;
    }

    setIsLoading(true);
    try {
      const result = await requestPasswordResetEmail({
        email,
        redirectTo: "/reset-password",
      });

      if (result.success) {
        setResetEmailSent(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // [P1_ONBOARD_STABLE] Opacity-gate: hide until layout stable
  const { isStable: isLoginStable, onLayout: onLoginLayout } = useFirstPaintStable();

  // Success View
  if (authView === "success") {
    return (
      <View onLayout={onLoginLayout} style={{ flex: 1, backgroundColor: colors.background, opacity: isLoginStable ? 1 : 0 }}>
        <LinearGradient
          colors={[isDark ? `${themeColor}30` : `${themeColor}15`, colors.background]}
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{ alignItems: "center" }}
          >
            <View
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: "rgba(16, 185, 129, 0.2)",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <CheckCircle size={50} color="#10B981" />
            </View>
            <Text
              style={{
                fontFamily: "Sora_700Bold",
                fontSize: 28,
                color: colors.text,
                marginBottom: 8,
              }}
            >
              Welcome Back!
            </Text>
            <Text
              style={{
                fontFamily: "Sora_400Regular",
                fontSize: 16,
                color: colors.textSecondary,
              }}
            >
              Redirecting you now...
            </Text>
          </Animated.View>
        </LinearGradient>
      </View>
    );
  }

  // Forgot Password View
  if (authView === "forgotPassword") {
    return (
      <View onLayout={onLoginLayout} style={{ flex: 1, backgroundColor: colors.background, opacity: isLoginStable ? 1 : 0 }}>
        <LinearGradient
          colors={[isDark ? `${themeColor}30` : `${themeColor}15`, colors.background]}
          style={{ flex: 1 }}
        >
          <SafeAreaScreen>
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingVertical: 16,
              }}
            >
              <Pressable
                onPress={() => {
                  setAuthView("login");
                  setResetEmailSent(false);
                }}
                hitSlop={20}
              >
                <ArrowLeft size={24} color={colors.text} />
              </Pressable>
              <Text
                style={{
                  fontFamily: "Sora_600SemiBold",
                  fontSize: 18,
                  color: colors.text,
                }}
              >
                Reset Password
              </Text>
            </View>

            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              <ScrollView
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                  paddingHorizontal: 24,
                }}
                keyboardShouldPersistTaps="handled"
              >
                <Animated.View
                  entering={FadeIn.duration(300)}
                  style={{ alignItems: "center" }}
                >
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: `${themeColor}20`,
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: 24,
                    }}
                  >
                    <Mail size={40} color={themeColor} />
                  </View>

                  {resetEmailSent ? (
                    <>
                      <Text
                        style={{
                          fontFamily: "Sora_700Bold",
                          fontSize: 24,
                          color: colors.text,
                          textAlign: "center",
                          marginBottom: 8,
                        }}
                      >
                        Check Your Email
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Sora_400Regular",
                          fontSize: 14,
                          color: colors.textSecondary,
                          textAlign: "center",
                          marginBottom: 32,
                          lineHeight: 22,
                        }}
                      >
                        We've sent a password reset link to{"\n"}
                        <Text style={{ color: colors.text, fontWeight: "600" }}>
                          {email}
                        </Text>
                      </Text>

                      <Pressable
                        onPress={() => setResetEmailSent(false)}
                        style={{ marginTop: 16 }}
                      >
                        <Text
                          style={{
                            fontFamily: "Sora_600SemiBold",
                            fontSize: 14,
                            color: themeColor,
                          }}
                        >
                          Try another email
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text
                        style={{
                          fontFamily: "Sora_700Bold",
                          fontSize: 24,
                          color: colors.text,
                          textAlign: "center",
                          marginBottom: 8,
                        }}
                      >
                        Forgot Password?
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Sora_400Regular",
                          fontSize: 14,
                          color: colors.textSecondary,
                          textAlign: "center",
                          marginBottom: 32,
                        }}
                      >
                        Enter your email and we'll send you a reset link
                      </Text>

                      {/* Email Input */}
                      <View
                        style={{
                          width: "100%",
                          backgroundColor: colors.inputBg,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: colors.borderSubtle,
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 16,
                          marginBottom: 24,
                        }}
                      >
                        <Mail size={20} color={colors.iconMuted} />
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          placeholder="Email address"
                          placeholderTextColor={colors.textTertiary}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={{
                            flex: 1,
                            paddingVertical: 18,
                            paddingHorizontal: 12,
                            color: colors.text,
                            fontSize: 16,
                            fontFamily: "Sora_400Regular",
                          }}
                          editable={!isLoading}
                        />
                      </View>

                      {/* Reset Button */}
                      <Button
                        variant="primary"
                        label="Send Reset Link"
                        onPress={handleForgotPassword}
                        disabled={isLoading}
                        loading={isLoading}
                        style={{ width: "100%", borderRadius: RADIUS.lg }}
                      />
                    </>
                  )}
                </Animated.View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaScreen>
        </LinearGradient>
      </View>
    );
  }

  // Main Login View
  return (
    <View testID="login-screen" onLayout={onLoginLayout} style={{ flex: 1, backgroundColor: colors.background, opacity: isLoginStable ? 1 : 0 }}>
      <LinearGradient colors={[isDark ? `${themeColor}30` : `${themeColor}15`, colors.background]} style={{ flex: 1 }}>
        <SafeAreaScreen>
          {/* Header with back to Getting Started */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 16,
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.replace("/welcome");
              }}
              hitSlop={20}
            >
              <ArrowLeft size={24} color={colors.text} />
            </Pressable>
            <Text
              style={{
                fontFamily: "Sora_600SemiBold",
                fontSize: 18,
                color: colors.text,
              }}
            >
              Welcome Back
            </Text>
            {/* Spacer for centering title */}
            <View style={{ width: 24 }} />
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: "center",
                paddingHorizontal: 24,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <Animated.View entering={FadeIn.duration(300)}>
                {/* Icon */}
                <View style={{ alignItems: "center", marginBottom: 32 }}>
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: `${themeColor}20`,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Sparkles size={40} color={themeColor} />
                  </View>
                </View>

                <Text
                  style={{
                    fontFamily: "Sora_700Bold",
                    fontSize: 28,
                    color: colors.text,
                    textAlign: "center",
                    marginBottom: 8,
                  }}
                >
                  Sign In
                </Text>
                <Text
                  style={{
                    fontFamily: "Sora_400Regular",
                    fontSize: 14,
                    color: colors.textSecondary,
                    textAlign: "center",
                    marginBottom: 32,
                  }}
                >
                  Enter your credentials to continue
                </Text>

                {/* Email Input */}
                <Animated.View
                  entering={FadeIn.delay(100).duration(300)}
                  style={{
                    backgroundColor: colors.inputBg,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.borderSubtle,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    marginBottom: 16,
                  }}
                >
                  <Mail size={20} color={colors.iconMuted} />
                  <TextInput
                    testID="login-email-input"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email address"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      flex: 1,
                      paddingVertical: 18,
                      paddingHorizontal: 12,
                      color: colors.text,
                      fontSize: 16,
                      fontFamily: "Sora_400Regular",
                    }}
                    editable={!isLoading}
                  />
                </Animated.View>

                {/* Password Input */}
                <Animated.View
                  entering={FadeIn.delay(200).duration(300)}
                  style={{
                    backgroundColor: colors.inputBg,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.borderSubtle,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    marginBottom: 12,
                  }}
                >
                  <Lock size={20} color={colors.iconMuted} />
                  <TextInput
                    testID="login-password-input"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry={!showPassword}
                    style={{
                      flex: 1,
                      paddingVertical: 18,
                      paddingHorizontal: 12,
                      color: colors.text,
                      fontSize: 16,
                      fontFamily: "Sora_400Regular",
                    }}
                    editable={!isLoading}
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={10}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color={colors.iconMuted} />
                    ) : (
                      <Eye size={20} color={colors.iconMuted} />
                    )}
                  </Pressable>
                </Animated.View>

                {/* Forgot Password */}
                <Animated.View
                  entering={FadeIn.delay(300).duration(300)}
                  style={{ alignItems: "flex-end", marginBottom: 24 }}
                >
                  <Pressable
                    onPress={() => setAuthView("forgotPassword")}
                    disabled={isLoading}
                  >
                    <Text
                      style={{
                        fontFamily: "Sora_600SemiBold",
                        fontSize: 13,
                        color: themeColor,
                      }}
                    >
                      Forgot password?
                    </Text>
                  </Pressable>
                </Animated.View>

                {/* Sign In Button */}
                <Animated.View entering={FadeIn.delay(400).duration(300)}>
                  <Button
                    testID="login-submit-button"
                    variant="primary"
                    label="Sign In"
                    onPress={handleSignIn}
                    disabled={isLoading}
                    loading={isLoading}
                    style={{ marginBottom: 16, borderRadius: RADIUS.lg }}
                  />
                </Animated.View>

                {/* Apple Sign In - gated by canShowAppleSignIn (iOS + native module available) */}
                {canShowAppleSignIn && (
                  <Animated.View entering={FadeIn.delay(450).duration(300)} style={{ marginBottom: 24 }}>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={
                        isDark
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={RADIUS.lg}
                      style={{
                        width: "100%",
                        height: 56,
                      }}
                      onPress={handleAppleSignIn}
                      disabled={isLoading}
                    />
                  </Animated.View>
                )}

                {/* Sign Up Link */}
                <Animated.View
                  entering={FadeIn.delay(500).duration(300)}
                  style={{ alignItems: "center" }}
                >
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.replace("/welcome");
                    }}
                    disabled={isLoading}
                  >
                    <Text
                      style={{
                        fontFamily: "Sora_400Regular",
                        fontSize: 14,
                        color: colors.textSecondary,
                      }}
                    >
                      Don't have an account?{" "}
                      <Text
                        style={{
                          fontFamily: "Sora_600SemiBold",
                          color: themeColor,
                        }}
                      >
                        Sign Up
                      </Text>
                    </Text>
                  </Pressable>
                </Animated.View>
              </Animated.View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaScreen>
      </LinearGradient>
    </View>
  );
}
