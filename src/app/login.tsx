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
  useColorScheme,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ============ THEME HELPERS (MATCH ONBOARDING PATTERN) ============
interface LoginTheme {
  background: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentLight: string;
  inputBg: string;
  inputBorder: string;
  iconColor: string;
  gradientTop: string;
}

const lightTheme: LoginTheme = {
  background: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceBorder: "rgba(0,0,0,0.08)",
  text: "#1A1A1A",
  textSecondary: "#666666",
  textTertiary: "#999999",
  accent: "#E85D4C",
  accentLight: "#FF8A7A",
  inputBg: "#FFFFFF",
  inputBorder: "rgba(0,0,0,0.12)",
  iconColor: "rgba(0,0,0,0.4)",
  gradientTop: "#FFF5F3",
};

const darkTheme: LoginTheme = {
  background: "#121218",
  surface: "rgba(255,255,255,0.06)",
  surfaceBorder: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.65)",
  textTertiary: "rgba(255,255,255,0.4)",
  accent: "#E85D4C",
  accentLight: "#FF8A7A",
  inputBg: "rgba(255,255,255,0.06)",
  inputBorder: "rgba(255,255,255,0.12)",
  iconColor: "rgba(255,255,255,0.4)",
  gradientTop: "#1A1A2E",
};

function useLoginTheme(): LoginTheme {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkTheme : lightTheme;
}

// Backend URL
const RENDER_BACKEND_URL = "https://open-invite-api.onrender.com";
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
      devLog("[Login] Auth success, proceeding with cookie-based session");
    }

    // ✅ CRITICAL: Force bootstrap re-run after login
    // Singleton bootstrap won't re-run automatically - must explicitly trigger it
    // This ensures bootStatus updates from 'loggedOut' to 'authed'/'onboarding'
    const { rebootstrapAfterLogin } = await import("@/hooks/useBootAuthority");
    if (__DEV__) {
      devLog("[Login] Forcing bootstrap re-run after login...");
    }
    await rebootstrapAfterLogin();

    // ✅ FIXED: Don't use stale local onboarding flags
    // Let BootRouter (via authBootstrap) decide the route based on backend /api/onboarding/status
    // This prevents routing to /welcome when backend says onboarding is complete
    if (__DEV__) {
      devLog("[Login] Login success, replacing to / - BootRouter will handle onboarding check");
    }
    
    router.replace("/");
  } catch (error) {
    devError("[Login] Error during post-login routing:", error);
    // On error, stay on login (fail safe to avoid blocking user with redirects)
    devLog("[Login] Staying on login screen due to error");
  }
}

type AuthView = "login" | "forgotPassword" | "success";

export default function LoginScreen() {
  const router = useRouter();
  const { data: session } = useSession();
  const theme = useLoginTheme();

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
          backgroundColor: theme.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  // Success View
  if (authView === "success") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <LinearGradient
          colors={[theme.gradientTop, theme.background]}
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
                color: theme.text,
                marginBottom: 8,
              }}
            >
              Welcome Back!
            </Text>
            <Text
              style={{
                fontFamily: "Sora_400Regular",
                fontSize: 16,
                color: theme.textSecondary,
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
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <LinearGradient
          colors={[theme.gradientTop, theme.background]}
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
                <ArrowLeft size={24} color={theme.text} />
              </Pressable>
              <Text
                style={{
                  fontFamily: "Sora_600SemiBold",
                  fontSize: 18,
                  color: theme.text,
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
                      backgroundColor: `${theme.accent}20`,
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: 24,
                    }}
                  >
                    <Mail size={40} color={theme.accent} />
                  </View>

                  {resetEmailSent ? (
                    <>
                      <Text
                        style={{
                          fontFamily: "Sora_700Bold",
                          fontSize: 24,
                          color: theme.text,
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
                          color: theme.textSecondary,
                          textAlign: "center",
                          marginBottom: 32,
                          lineHeight: 22,
                        }}
                      >
                        We've sent a password reset link to{"\n"}
                        <Text style={{ color: theme.text, fontWeight: "600" }}>
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
                            color: theme.accent,
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
                          color: theme.text,
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
                          color: theme.textSecondary,
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
                          backgroundColor: theme.inputBg,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: theme.inputBorder,
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 16,
                          marginBottom: 24,
                        }}
                      >
                        <Mail size={20} color={theme.iconColor} />
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          placeholder="Email address"
                          placeholderTextColor={theme.textTertiary}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={{
                            flex: 1,
                            paddingVertical: 18,
                            paddingHorizontal: 12,
                            color: theme.text,
                            fontSize: 16,
                            fontFamily: "Sora_400Regular",
                          }}
                          editable={!isLoading}
                        />
                      </View>

                      {/* Reset Button */}
                      <Pressable
                        onPress={handleForgotPassword}
                        disabled={isLoading}
                        style={{ width: "100%" }}
                      >
                        <LinearGradient
                          colors={
                            isLoading
                              ? ["#4B5563", "#374151"]
                              : [theme.accentLight, theme.accent]
                          }
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{
                            paddingVertical: 18,
                            borderRadius: 16,
                            alignItems: "center",
                          }}
                        >
                          {isLoading ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text
                              style={{
                                fontFamily: "Sora_600SemiBold",
                                fontSize: 16,
                                color: "#fff",
                              }}
                            >
                              Send Reset Link
                            </Text>
                          )}
                        </LinearGradient>
                      </Pressable>
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
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <LinearGradient colors={[theme.gradientTop, theme.background]} style={{ flex: 1 }}>
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
              <ArrowLeft size={24} color={theme.text} />
            </Pressable>
            <Text
              style={{
                fontFamily: "Sora_600SemiBold",
                fontSize: 18,
                color: theme.text,
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
                      backgroundColor: `${theme.accent}20`,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Sparkles size={40} color={theme.accent} />
                  </View>
                </View>

                <Text
                  style={{
                    fontFamily: "Sora_700Bold",
                    fontSize: 28,
                    color: theme.text,
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
                    color: theme.textSecondary,
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
                    backgroundColor: theme.inputBg,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.inputBorder,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    marginBottom: 16,
                  }}
                >
                  <Mail size={20} color={theme.iconColor} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email address"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      flex: 1,
                      paddingVertical: 18,
                      paddingHorizontal: 12,
                      color: theme.text,
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
                    backgroundColor: theme.inputBg,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.inputBorder,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    marginBottom: 12,
                  }}
                >
                  <Lock size={20} color={theme.iconColor} />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={theme.textTertiary}
                    secureTextEntry={!showPassword}
                    style={{
                      flex: 1,
                      paddingVertical: 18,
                      paddingHorizontal: 12,
                      color: theme.text,
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
                      <EyeOff size={20} color={theme.iconColor} />
                    ) : (
                      <Eye size={20} color={theme.iconColor} />
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
                        color: theme.accent,
                      }}
                    >
                      Forgot password?
                    </Text>
                  </Pressable>
                </Animated.View>

                {/* Sign In Button */}
                <Animated.View entering={FadeInUp.delay(400).springify()}>
                  <Pressable
                    onPress={handleSignIn}
                    disabled={isLoading}
                    style={{ marginBottom: 24 }}
                  >
                    <LinearGradient
                      colors={
                        isLoading
                          ? ["#4B5563", "#374151"]
                          : [theme.accentLight, theme.accent]
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: 18,
                        borderRadius: 16,
                        alignItems: "center",
                        shadowColor: theme.accent,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.3,
                        shadowRadius: 16,
                      }}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text
                          style={{
                            fontFamily: "Sora_600SemiBold",
                            fontSize: 16,
                            color: "#fff",
                          }}
                        >
                          Sign In
                        </Text>
                      )}
                    </LinearGradient>
                  </Pressable>
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
                        color: theme.textSecondary,
                      }}
                    >
                      Don't have an account?{" "}
                      <Text
                        style={{
                          fontFamily: "Sora_600SemiBold",
                          color: theme.accent,
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
