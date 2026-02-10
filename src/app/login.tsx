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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeInDown,
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
import { useFonts } from "expo-font";
import {
  Sora_400Regular,
  Sora_600SemiBold,
  Sora_700Bold,
} from "@expo-google-fonts/sora";

import { authClient } from "@/lib/authClient";
import { useSession } from "@/lib/useSession";
import { useTheme } from "@/lib/ThemeContext";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Backend URL
const RENDER_BACKEND_URL = "https://api.openinvite.cloud";
const apiUrlOverride = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL;
const backendUrl =
  apiUrlOverride && apiUrlOverride.length > 0
    ? apiUrlOverride
    : RENDER_BACKEND_URL;

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
  if (__DEV__) devLog('[P2_ONBOARDING_UI_SSOT]', { screen: 'login', button: 'SSOT', theme: 'ThemeContext' });

  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // NOTE: Removed auto-redirect based on session.user - BootRouter handles all auth routing.
  // login.tsx should only redirect after explicit login success, not on mount.

  // Handle code input change
  const handleSignIn = async () => {
    if (!email || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Error", "Please enter email and password");
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
      safeToast.error("Error", "Please enter your email address");
      return;
    }

    devLog("[P0_PW_RESET] forgot password initiated");
    setIsLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/auth/forget-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          redirectTo: "/reset-password",
        }),
      });

      if (!response.ok) {
        // Extract error message from various response shapes
        const extractErrorMessage = (data: unknown, fallbackText?: string): string => {
          if (!data) return fallbackText || "Unknown error";
          const d = data as Record<string, unknown>;
          if (typeof d.message === "string") return d.message;
          if (typeof d.error === "object" && d.error && typeof (d.error as Record<string, unknown>).message === "string") return (d.error as Record<string, unknown>).message as string;
          if (typeof d.error === "string") return d.error;
          if (typeof d.code === "string") return d.code;
          return fallbackText || "Unknown error";
        };
        
        const errorData = await response.json().catch(() => null);
        const responseText = errorData ? null : await response.text().catch(() => null);
        const extractedMessage = extractErrorMessage(errorData, responseText || undefined);
        
        devError("[P0_PW_RESET] backend error", { message: extractedMessage });
        
        if (extractedMessage.includes("EMAIL_PROVIDER_NOT_CONFIGURED")) {
          throw new Error("Password reset is temporarily unavailable. Please contact support@openinvite.cloud");
        }
        throw new Error(extractedMessage || "Failed to send reset email");
      }

      devLog("[P0_PW_RESET] reset email request success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResetEmailSent(true);
    } catch (error: any) {
      safeToast.error("Error", error?.message || "Unable to send reset email.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={themeColor} size="large" />
      </View>
    );
  }

  // Success View
  if (authView === "success") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LinearGradient
          colors={[isDark ? `${themeColor}30` : `${themeColor}15`, colors.background]}
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Animated.View
            entering={FadeInUp.springify()}
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
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LinearGradient
          colors={[isDark ? `${themeColor}30` : `${themeColor}15`, colors.background]}
          style={{ flex: 1 }}
        >
          <SafeAreaView style={{ flex: 1 }}>
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
                  entering={FadeInUp.springify()}
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
          </SafeAreaView>
        </LinearGradient>
      </View>
    );
  }

  // Main Login View
  return (
    <View testID="login-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient colors={[isDark ? `${themeColor}30` : `${themeColor}15`, colors.background]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
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
              <Animated.View entering={FadeInUp.springify()}>
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
                  entering={FadeInUp.delay(100).springify()}
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
                  entering={FadeInUp.delay(200).springify()}
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
                  entering={FadeInUp.delay(300).springify()}
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
                <Animated.View entering={FadeInUp.delay(400).springify()}>
                  <Button
                    testID="login-submit-button"
                    variant="primary"
                    label="Sign In"
                    onPress={handleSignIn}
                    disabled={isLoading}
                    loading={isLoading}
                    style={{ marginBottom: 24, borderRadius: RADIUS.lg }}
                  />
                </Animated.View>

                {/* Sign Up Link */}
                <Animated.View
                  entering={FadeInUp.delay(500).springify()}
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
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
