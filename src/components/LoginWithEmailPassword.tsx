import React, { useState, useRef, useEffect } from "react";
import { Pressable, Text, TextInput, View, Modal } from "react-native";
import { safeToast } from "@/lib/safeToast";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { ArrowLeft, Mail, CheckCircle, PartyPopper, Eye, EyeOff, ShieldCheck } from "@/ui/icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { authClient } from "@/lib/authClient";
import { useSession } from "@/lib/useSession";
import { useTheme } from "@/lib/ThemeContext";
import { isRateLimited, getRateLimitRemaining } from "@/lib/rateLimitState";

type AuthView = "login" | "forgotPassword" | "verifyEmail";

// Get backend URL
const RENDER_BACKEND_URL = "https://open-invite-api.onrender.com";
const vibecodeSandboxUrl = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL;
const backendUrl = vibecodeSandboxUrl && vibecodeSandboxUrl.length > 0
  ? vibecodeSandboxUrl
  : RENDER_BACKEND_URL;

export default function LoginWithEmailPassword() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { data: session } = useSession();

  // Verification code state
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const codeInputRefs = useRef<(TextInput | null)[]>([]);

  // Handle code input change
  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/[^0-9]/g, "");

    if (digit.length <= 1) {
      const newCode = [...verificationCode];
      newCode[index] = digit;
      setVerificationCode(newCode);
      setCodeError(null);

      // Auto-focus next input
      if (digit && index < 4) {
        codeInputRefs.current[index + 1]?.focus();
      }

      // Auto-submit when all digits entered
      if (digit && index === 4) {
        const fullCode = [...newCode.slice(0, 4), digit].join("");
        if (fullCode.length === 5) {
          handleVerifyCode(fullCode);
        }
      }
    } else if (digit.length === 5) {
      // Handle paste of full code
      const digits = digit.split("");
      setVerificationCode(digits);
      handleVerifyCode(digit);
    }
  };

  // Handle backspace
  const handleCodeKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      safeToast.error("Error", "Please enter email and password");
      return;
    }

    // Check circuit breaker before attempting login
    if (isRateLimited()) {
      const remaining = getRateLimitRemaining();
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      const timeStr = minutes > 0 
        ? `${minutes}m ${seconds}s` 
        : `${seconds}s`;
      safeToast.error("Rate Limit", `Too many requests. Try again in ${timeStr}`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        // Check if error is about email verification
        if (result.error.message?.toLowerCase().includes("verify") ||
            result.error.message?.toLowerCase().includes("verification")) {
          setAuthView("verifyEmail");
          // Resend verification code
          await handleResendCode();
        } else {
          safeToast.error("Sign In Failed", result.error.message || "Please check your credentials");
        }
      } else if (result.data) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowSuccessModal(true);
        resetForm();
      } else {
        safeToast.error("Sign In Failed", "An unexpected error occurred. Please try again.");
      }
    } catch (error: any) {
      const message = error?.message || "Unable to connect to server. Please check your internet connection.";
      safeToast.error("Sign In Failed", message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password || !name) {
      safeToast.error("Error", "Please fill in all fields");
      return;
    }

    setIsLoading(true);
    try {
      let result: any;
      try {
        const data = await authClient.$fetch('/api/auth/sign-up/email', {
          method: 'POST',
          body: { email, password, name },
        });
        result = { data };
      } catch (e: any) {
        result = { error: { message: e?.message || String(e) } };
      }

      if (result.error) {
        safeToast.error("Sign Up Failed", result.error.message || "Please try again");
      } else if (result.data) {
        // Show verification code screen
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setAuthView("verifyEmail");
      } else {
        // Handle edge case where neither error nor data is present
        setAuthView("verifyEmail");
      }
    } catch (error: any) {
      const message = error?.message || "Unable to connect to server. Please check your internet connection.";
      safeToast.error("Sign Up Failed", message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (code?: string) => {
    const codeToVerify = code || verificationCode.join("");

    if (codeToVerify.length !== 5) {
      setCodeError("Please enter the complete 5-digit code");
      return;
    }

    setIsVerifying(true);
    setCodeError(null);

    try {
      const response = await fetch(`${backendUrl}/api/email-verification/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.toLowerCase(),
          code: codeToVerify,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setCodeError(data.error || "Invalid code. Please try again.");
        // Clear the code inputs
        setVerificationCode(["", "", "", "", ""]);
        codeInputRefs.current[0]?.focus();
        return;
      }

      // Success - email verified!
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Check circuit breaker before attempting login
      if (isRateLimited()) {
        const remaining = getRateLimitRemaining();
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        const timeStr = minutes > 0 
          ? `${minutes}m ${seconds}s` 
          : `${seconds}s`;
        safeToast.error("Rate Limit", `Too many requests. Try again in ${timeStr}`);
        setAuthView("login"); // Go back to login screen
        return;
      }

      // Now sign in the user
      const signInResult = await authClient.signIn.email({
        email,
        password,
      });

      if (signInResult.error) {
        safeToast.success("Verification Successful", "Your email has been verified! Please sign in.");
        setAuthView("login");
        setIsSignUp(false);
      } else {
        setShowSuccessModal(true);
        resetForm();
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setCodeError(error?.message || "Failed to verify code. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      safeToast.error("Error", "Please enter your email address");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/email-verification/resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.toLowerCase(),
          name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend code");
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Code Sent", "A new verification code has been sent to your email.");

      // Clear old code
      setVerificationCode(["", "", "", "", ""]);
      setCodeError(null);
      codeInputRefs.current[0]?.focus();
    } catch (error: any) {
      const message = error?.message || "Unable to resend code.";
      safeToast.error("Error", message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      safeToast.error("Error", "Please enter your email address");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/auth/forget-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          redirectTo: "/reset-password",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to send reset email");
      }

      setResetEmailSent(true);
    } catch (error: any) {
      const message = error?.message || "Unable to connect to server. Please check your internet connection.";
      safeToast.error("Error", message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      safeToast.success("Success", "Signed out successfully!");
    } catch {
      safeToast.error("Error", "Failed to sign out");
    }
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setResetEmailSent(false);
    setVerificationCode(["", "", "", "", ""]);
    setCodeError(null);
  };

  const handleGetStarted = () => {
    setShowSuccessModal(false);
    router.replace("/");
  };

  // Success Modal
  const SuccessModal = () => (
    <Modal
      visible={showSuccessModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowSuccessModal(false)}
    >
      <View className="flex-1 justify-center items-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View
          className="mx-6 p-8 rounded-3xl items-center"
          style={{ backgroundColor: colors.background, width: "85%" }}
        >
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: `${themeColor}20` }}
          >
            <PartyPopper size={40} color={themeColor} />
          </View>

          <Text style={{ color: colors.text }} className="text-2xl font-bold text-center mb-2">
            Welcome!
          </Text>

          <Text style={{ color: colors.textSecondary }} className="text-center text-base mb-8">
            You're all set. Let's see what your friends are up to!
          </Text>

          <Pressable
            onPress={handleGetStarted}
            style={{ backgroundColor: themeColor }}
            className="w-full py-4 rounded-xl items-center"
          >
            <Text className="text-white font-semibold text-lg">
              Get Started
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  // If user is already logged in, show sign out button
  if (session) {
    return (
      <KeyboardAwareScrollView style={{ backgroundColor: colors.background }}>
        <View className="w-full p-6 gap-4">
          <View
            style={{
              backgroundColor: isDark ? "#1A3A2B" : "#ECFDF5",
              borderColor: isDark ? "#2D5A3F" : "#A7F3D0",
            }}
            className="p-4 rounded-lg border"
          >
            <Text style={{ color: colors.text }} className="text-lg font-semibold mb-1">
              Signed in as:
            </Text>
            <Text style={{ color: colors.text }} className="text-base">
              {session?.user?.name ?? "User"}
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm">
              {session?.user?.email ?? "No email"}
            </Text>
          </View>
          <Pressable
            onPress={handleSignOut}
            style={{ backgroundColor: isDark ? "#DC2626" : "#EF4444" }}
            className="p-4 rounded-lg items-center"
          >
            <Text className="text-white font-semibold text-base">Sign Out</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    );
  }

  // Email Verification View with Code Input
  if (authView === "verifyEmail") {
    return (
      <KeyboardAwareScrollView style={{ backgroundColor: colors.background }}>
        <View className="w-full p-6 gap-4">
          <Pressable
            onPress={() => {
              setAuthView("login");
              setIsSignUp(false);
              setVerificationCode(["", "", "", "", ""]);
              setCodeError(null);
            }}
            className="flex-row items-center mb-2"
          >
            <ArrowLeft size={20} color={themeColor} />
            <Text style={{ color: themeColor }} className="ml-2 font-medium">
              Back to Sign In
            </Text>
          </Pressable>

          <View className="items-center py-4">
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <ShieldCheck size={40} color={themeColor} />
            </View>

            <Text style={{ color: colors.text }} className="text-2xl font-bold text-center mb-2">
              Enter Verification Code
            </Text>

            <Text style={{ color: colors.textSecondary }} className="text-center leading-6 mb-1">
              We sent a 5-digit code to
            </Text>
            <Text style={{ color: colors.text, fontWeight: "600" }} className="text-center text-base mb-6">
              {email}
            </Text>

            {/* Code Input Boxes */}
            <View className="flex-row justify-center gap-3 mb-4">
              {[0, 1, 2, 3, 4].map((index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    codeInputRefs.current[index] = ref;
                  }}
                  value={verificationCode[index]}
                  onChangeText={(value) => handleCodeChange(index, value)}
                  onKeyPress={({ nativeEvent }) => handleCodeKeyPress(index, nativeEvent.key)}
                  keyboardType="number-pad"
                  maxLength={index === 0 ? 5 : 1} // Allow paste on first input
                  selectTextOnFocus
                  style={{
                    borderColor: codeError ? "#EF4444" : verificationCode[index] ? themeColor : colors.border,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    borderWidth: 2,
                  }}
                  className="w-14 h-16 rounded-xl text-center text-2xl font-bold"
                  editable={!isVerifying}
                />
              ))}
            </View>

            {/* Error Message */}
            {codeError && (
              <Text className="text-red-500 text-sm text-center mb-4">
                {codeError}
              </Text>
            )}

            {/* Verify Button */}
            <Pressable
              onPress={() => handleVerifyCode()}
              disabled={isVerifying || verificationCode.join("").length !== 5}
              style={{
                backgroundColor: isVerifying || verificationCode.join("").length !== 5
                  ? (isDark ? "#4B5563" : "#D1D5DB")
                  : themeColor,
              }}
              className="w-full py-4 rounded-xl items-center mb-4"
            >
              <Text className="text-white font-semibold text-base">
                {isVerifying ? "Verifying..." : "Verify Email"}
              </Text>
            </Pressable>

            {/* Info Box */}
            <View
              className="p-4 rounded-xl mb-4 w-full"
              style={{ backgroundColor: isDark ? "#1A2B3A" : "#EFF6FF" }}
            >
              <View className="flex-row items-start gap-3">
                <Mail size={20} color={themeColor} style={{ marginTop: 2 }} />
                <View className="flex-1">
                  <Text style={{ color: colors.text }} className="font-medium mb-1">
                    Check your email
                  </Text>
                  <Text style={{ color: colors.textSecondary }} className="text-sm leading-5">
                    Enter the 5-digit code we sent to verify your account. The code expires in 10 minutes.
                  </Text>
                </View>
              </View>
            </View>

            <Text style={{ color: colors.textTertiary }} className="text-sm text-center mb-4">
              Didn't receive the code? Check your spam folder or request a new one.
            </Text>

            <Pressable
              onPress={handleResendCode}
              disabled={isLoading}
              className="py-2"
            >
              <Text style={{ color: themeColor }} className="font-medium">
                {isLoading ? "Sending..." : "Resend Code"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>
    );
  }

  // Forgot Password View
  if (authView === "forgotPassword") {
    return (
      <KeyboardAwareScrollView style={{ backgroundColor: colors.background }}>
        <View className="w-full p-6 gap-4">
          <Pressable
            onPress={() => {
              setAuthView("login");
              setResetEmailSent(false);
            }}
            className="flex-row items-center mb-2"
          >
            <ArrowLeft size={20} color={themeColor} />
            <Text style={{ color: themeColor }} className="ml-2 font-medium">
              Back to Sign In
            </Text>
          </Pressable>

          <Text style={{ color: colors.text }} className="text-2xl font-bold text-center mb-2">
            Reset Password
          </Text>

          {resetEmailSent ? (
            <View className="items-center py-8">
              <View
                className="w-20 h-20 rounded-full items-center justify-center mb-4"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Mail size={40} color={themeColor} />
              </View>
              <Text style={{ color: colors.text }} className="text-lg font-semibold text-center mb-2">
                Check Your Email
              </Text>
              <Text style={{ color: colors.textSecondary }} className="text-center leading-6">
                We've sent a password reset link to{"\n"}
                <Text style={{ color: colors.text, fontWeight: "600" }}>{email}</Text>
              </Text>
              <Text style={{ color: colors.textTertiary }} className="text-sm text-center mt-4">
                Didn't receive the email? Check your spam folder or try again.
              </Text>
              <Pressable
                onPress={() => setResetEmailSent(false)}
                className="mt-4"
              >
                <Text style={{ color: themeColor }} className="font-medium">
                  Try another email
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={{ color: colors.textSecondary }} className="text-center mb-4">
                Enter your email address and we'll send you a link to reset your password.
              </Text>

              <View>
                <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
                  Email
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={{
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    color: colors.text,
                  }}
                  className="border rounded-lg p-4"
                  editable={!isLoading}
                />
              </View>

              <Pressable
                onPress={handleForgotPassword}
                disabled={isLoading}
                style={{
                  backgroundColor: isLoading ? (isDark ? "#7B92B2" : "#BFDBFE") : themeColor,
                }}
                className="p-4 rounded-lg items-center"
              >
                <Text className="text-white font-semibold text-base">
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    );
  }

  return (
    <>
      <SuccessModal />
      <KeyboardAwareScrollView style={{ backgroundColor: colors.background }}>
        <View className="w-full p-6 gap-4">
          <Text style={{ color: colors.text }} className="text-2xl font-bold text-center mb-2">
            {isSignUp ? "Create Account" : "Sign In"}
          </Text>

          {isSignUp && (
            <View>
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
                Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor={colors.textTertiary}
                style={{
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  color: colors.text,
                }}
                className="border rounded-lg p-4"
                autoCapitalize="words"
                editable={!isLoading}
              />
            </View>
          )}

          <View>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{
                borderColor: colors.border,
                backgroundColor: colors.surface,
                color: colors.text,
              }}
              className="border rounded-lg p-4"
              editable={!isLoading}
            />
          </View>

          <View>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
              Password
            </Text>
            <View className="relative">
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showPassword}
                style={{
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  color: colors.text,
                  paddingRight: 50,
                }}
                className="border rounded-lg p-4"
                editable={!isLoading}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-0 bottom-0 justify-center"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {showPassword ? (
                  <EyeOff size={20} color={colors.textSecondary} />
                ) : (
                  <Eye size={20} color={colors.textSecondary} />
                )}
              </Pressable>
            </View>
          </View>

          {/* Forgot Password Link - Only show for sign in */}
          {!isSignUp && (
            <Pressable
              onPress={() => setAuthView("forgotPassword")}
              disabled={isLoading}
              className="items-end"
            >
              <Text style={{ color: themeColor }} className="text-sm">
                Forgot password?
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={isSignUp ? handleSignUp : handleSignIn}
            disabled={isLoading}
            style={{
              backgroundColor: isLoading ? (isDark ? "#7B92B2" : "#BFDBFE") : themeColor,
            }}
            className="p-4 rounded-lg items-center"
          >
            <Text className="text-white font-semibold text-base">
              {isLoading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setIsSignUp(!isSignUp)}
            disabled={isLoading}
            className="items-center"
          >
            <Text style={{ color: themeColor }} className="text-sm">
              {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}
