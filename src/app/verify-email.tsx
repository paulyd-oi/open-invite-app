/**
 * Email Verification Screen
 *
 * "Check your email" instruction screen — uses Resend email-link verification,
 * NOT a 6-digit code.  Two CTAs:
 *   1. Resend verification email
 *   2. I verified — refresh (re-checks session emailVerified status)
 *
 * Deep-link flow: when user taps verification link in email, the app
 * deep-link handler routes here or directly refreshes session so the user
 * lands on the authenticated Calendar screen.
 */

import React, { useState, useEffect } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Mail, Check } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/lib/useSession";
import { safeToast } from "@/lib/safeToast";
import { useTheme } from "@/lib/ThemeContext";
import { forceRefreshSession } from "@/lib/sessionCache";
import { resendVerificationEmail } from "@/lib/resendVerificationEmail";
import { triggerVerificationCooldown } from "@/components/EmailVerificationBanner";
import { devLog, devError } from "@/lib/devLog";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { themeColor, isDark, colors } = useTheme();

  const [isResending, setIsResending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  const userEmail = session?.user?.email || "";

  // DEV proof log
  useEffect(() => {
    if (__DEV__) {
      devLog("[P0_EMAIL_VERIFY_UI] screen=check-email email=", userEmail);
    }
  }, [userEmail]);

  // Cooldown timer for resend button
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Auto-navigate away when session shows verified (e.g. deep-link callback)
  useEffect(() => {
    if (session?.user?.emailVerified === true) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Email verified", "You're all set!");
      router.replace("/calendar");
    }
  }, [session?.user?.emailVerified, router]);

  const handleResend = async () => {
    if (cooldown > 0 || isResending || !userEmail) return;

    setIsResending(true);
    if (__DEV__) {
      devLog("[P0_EMAIL_VERIFY_RESEND] email=", userEmail);
    }

    await resendVerificationEmail({
      email: userEmail,
      name: session?.user?.name || session?.user?.displayName,
      onSuccess: () => {
        triggerVerificationCooldown();
        setCooldown(30);
      },
    });

    setIsResending(false);
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);

    if (__DEV__) {
      devLog("[P0_EMAIL_VERIFY_REFRESH] checking verified status…");
    }

    try {
      await forceRefreshSession();
      queryClient.invalidateQueries({ queryKey: ["session"] });

      // Give a moment for React Query to propagate the new session
      await new Promise((r) => setTimeout(r, 600));

      // Re-read latest session from cache after invalidation
      const latestSession = queryClient.getQueryData<{ user?: { emailVerified?: boolean } }>(["session"]);
      if (latestSession?.user?.emailVerified === true) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setVerifiedSuccess(true);
        safeToast.success("Email verified", "You're all set!");
        // Brief success state before navigating
        setTimeout(() => router.replace("/calendar"), 800);
      } else {
        safeToast.info("Not yet verified", "Please tap the link in your email first.");
      }
    } catch (error) {
      devError("[P0_EMAIL_VERIFY_REFRESH] error", error);
      safeToast.error("Error", "Couldn't check verification status. Try again.");
    } finally {
      setIsRefreshing(false);
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
          Check your email
        </Text>
        <Text style={{ color: colors.textSecondary }} className="text-center mb-4 px-4">
          We sent a verification link to:{"\n"}
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            {userEmail || "No email found for this account."}
          </Text>
        </Text>

        {/* Spam / Junk notice */}
        <View
          className="rounded-xl p-3 mb-8"
          style={{ backgroundColor: isDark ? "rgba(255,152,0,0.12)" : "#FFF9E6" }}
        >
          <Text style={{ color: isDark ? "#FFB74D" : "#E65100" }} className="text-sm text-center font-medium">
            Check Spam/Junk — Outlook and some providers often filter new senders.
          </Text>
        </View>

        {/* Resend verification email */}
        <Pressable
          onPress={handleResend}
          disabled={cooldown > 0 || isResending}
          className="rounded-xl p-4 mb-3"
          style={{
            backgroundColor: cooldown > 0 || isResending ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor,
            opacity: isResending ? 0.6 : 1,
          }}
        >
          {isResending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-semibold text-center">
              {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend verification email"}
            </Text>
          )}
        </Pressable>

        {/* I verified — refresh */}
        <Pressable
          onPress={handleRefresh}
          disabled={isRefreshing || verifiedSuccess}
          className="rounded-xl p-4 mb-4"
          style={{
            backgroundColor: verifiedSuccess
              ? "#10B981"
              : isDark ? "#1C1C1E" : "#FFFFFF",
            borderWidth: verifiedSuccess ? 0 : 2,
            borderColor: themeColor,
            opacity: isRefreshing ? 0.6 : 1,
          }}
        >
          {isRefreshing ? (
            <ActivityIndicator color={themeColor} size="small" />
          ) : verifiedSuccess ? (
            <View className="flex-row items-center justify-center">
              <Check size={20} color="#FFFFFF" />
              <Text className="font-semibold text-center ml-2" style={{ color: "#FFFFFF" }}>
                Verified! Redirecting…
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center justify-center">
              <Check size={20} color={themeColor} />
              <Text className="font-semibold text-center ml-2" style={{ color: themeColor }}>
                I verified — refresh
              </Text>
            </View>
          )}
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
          Tap the link in your email, then come back and press "I verified — refresh" above.
        </Text>
      </View>
    </SafeAreaView>
  );
}
