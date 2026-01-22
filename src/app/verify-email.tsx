/**
 * Email Verification Screen
 * 
 * Allows user to verify their email address via 6-digit code.
 * Features:
 * - 6-digit code input
 * - Resend code with 30s cooldown
 * - Error handling for invalid code, rate limits, suppressed emails
 * - Updates session after success
 */

import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Mail, Check } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/lib/useSession";
import { BACKEND_URL } from "@/lib/config";
import { safeToast } from "@/lib/safeToast";
import { useTheme } from "@/lib/ThemeContext";
import { forceRefreshSession } from "@/lib/sessionCache";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { themeColor, isDark, colors } = useTheme();

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRefs = useRef<(TextInput | null)[]>([]);

  const userEmail = session?.user?.email || "";

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleCodeInput = (index: number, digit: string) => {
    if (digit.length <= 1) {
      const newCode = [...code];
      newCode[index] = digit;
      setCode(newCode);

      if (digit && index < 5) {
        codeInputRefs.current[index + 1]?.focus();
      }
    } else if (digit.length === 6) {
      // Pasted 6-digit code
      const digits = digit.split("").slice(0, 6);
      setCode(digits);
      codeInputRefs.current[5]?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const codeStr = code.join("");
    if (codeStr.length !== 6) {
      safeToast.warning("Invalid Code", "Please enter the 6-digit code");
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/email-verification/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail.toLowerCase(), code: codeStr }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success("Email verified", "You're all set.");
        
        // Refresh session to get updated emailVerified status
        await forceRefreshSession();
        queryClient.invalidateQueries({ queryKey: ["session"] });
        
        // Navigate back to settings
        router.back();
      } else {
        // Map backend errors to user-friendly messages
        let errorMessage = "That code didn't work. Try again.";
        if (data.error?.toLowerCase().includes("rate") || data.error?.toLowerCase().includes("attempt")) {
          errorMessage = "Too many attempts. Try again in a few minutes.";
        }
        safeToast.error("", errorMessage);
      }
    } catch (error) {
      console.error("[VerifyEmail] Error:", error);
      safeToast.error("", "That code didn't work. Try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;

    setIsResending(true);
    try {
      await fetch(`${BACKEND_URL}/api/email-verification/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail.toLowerCase() }),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCooldown(30);
    } catch (error) {
      console.error("[VerifyEmail] Resend error:", error);
      safeToast.error("", "We couldn't resend the code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }} edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{
            backgroundColor: colors.surface,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0 : 0.1,
            shadowRadius: 2,
          }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text }} className="text-xl font-sora-bold">Verify your email</Text>
      </View>

      <View className="flex-1 px-5 pt-8">
        {/* Icon */}
        <View className="items-center mb-6">
          <View
            className="w-20 h-20 rounded-full items-center justify-center"
            style={{ backgroundColor: `${themeColor}20` }}
          >
            <Mail size={40} color={themeColor} />
          </View>
        </View>

        {/* Instructions */}
        <Text style={{ color: colors.text }} className="text-2xl font-bold text-center mb-2">
          Verify your email
        </Text>
        <Text style={{ color: colors.textSecondary }} className="text-center mb-1 px-4">
          We sent a 6-digit code to:
        </Text>
        <Text style={{ color: colors.text }} className="text-center mb-8 px-4 font-medium">
          {userEmail || "No email found for this account."}
        </Text>

        {/* Code Input */}
        <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-3">
          Verification code
        </Text>
        <View className="flex-row justify-center mb-8">
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { codeInputRefs.current[index] = ref; }}
              value={digit}
              onChangeText={(text) => handleCodeInput(index, text)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={1}
              className="w-12 h-14 text-center text-2xl font-bold rounded-xl mx-1"
              style={{
                backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
                color: colors.text,
                borderWidth: 2,
                borderColor: digit ? themeColor : (isDark ? "#38383A" : "#E5E7EB"),
              }}
              placeholderTextColor={colors.textTertiary}
              autoComplete="one-time-code"
            />
          ))}
        </View>

        {/* Verify Button */}
        <Pressable
          onPress={handleVerify}
          disabled={isVerifying || code.join("").length !== 6}
          className="rounded-xl p-4 mb-4"
          style={{
            backgroundColor: code.join("").length === 6 ? themeColor : (isDark ? "#2C2C2E" : "#E5E7EB"),
            opacity: isVerifying ? 0.6 : 1,
          }}
        >
          <Text className="text-white font-semibold text-center">
            {isVerifying ? "Verifying…" : "Verify"}
          </Text>
        </Pressable>

        {/* Resend Code */}
        <Pressable
          onPress={handleResend}
          disabled={cooldown > 0 || isResending}
          className="p-4"
        >
          <Text
            className="text-center font-medium"
            style={{
              color: cooldown > 0 || isResending ? colors.textTertiary : themeColor,
            }}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Text>
        </Pressable>

        {/* Not now button */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          className="p-4"
        >
          <Text className="text-center font-medium" style={{ color: colors.textSecondary }}>
            Not now
          </Text>
        </Pressable>

        {/* Help Text */}
        <Text style={{ color: colors.textTertiary }} className="text-sm text-center mt-4 px-8">
          Didn't get a code? Check spam, or try a different email.
        </Text>
      </View>
    </SafeAreaView>
  );
}
