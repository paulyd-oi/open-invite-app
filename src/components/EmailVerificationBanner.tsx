/**
 * EmailVerificationBanner
 * 
 * Non-blocking banner shown when user's email is not verified.
 * Features:
 * - Shows only when emailVerified === false
 * - "Verify email" button calls resend endpoint
 * - Auto-hides when emailVerified becomes true
 * - Positioned at top of screen (non-intrusive)
 */

import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Mail } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

import { useSession } from "@/lib/useSession";
import { useTheme } from "@/lib/ThemeContext";
import { BACKEND_URL } from "@/lib/config";
import { safeToast } from "@/lib/safeToast";

export function EmailVerificationBanner() {
  const { data: session } = useSession();
  const { themeColor, colors, isDark } = useTheme();
  const [isResending, setIsResending] = useState(false);

  // Only show if user is logged in and email is not verified
  if (!session?.user?.email || session?.user?.emailVerified === true) {
    return null;
  }

  const handleResendVerification = async () => {
    if (isResending || !session?.user?.email) return;

    setIsResending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const response = await fetch(`${BACKEND_URL}/api/email-verification/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: session.user.email.toLowerCase() }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success(
          "Verification Email Sent",
          "Check your inbox and click the link to verify your email."
        );
      } else {
        // Handle specific errors
        if (data.error?.includes("already verified")) {
          safeToast.info("Already Verified", "Your email is already verified.");
        } else if (data.error?.includes("rate limit") || data.error?.includes("cooldown")) {
          safeToast.warning("Please Wait", "Try again in a few minutes.");
        } else {
          safeToast.error("Error", data.error || "Unable to send verification email.");
        }
      }
    } catch (error) {
      console.error("[EmailVerificationBanner] Resend error:", error);
      safeToast.error("Network Error", "Please check your connection and try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(200)}
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 12,
        backgroundColor: isDark ? "rgba(255, 152, 0, 0.15)" : "#FFF9E6",
        borderWidth: 1,
        borderColor: isDark ? "rgba(255, 152, 0, 0.3)" : "#FFE5A3",
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: isDark ? "rgba(255, 152, 0, 0.2)" : "#FFD54F",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
        }}
      >
        <Mail size={18} color={isDark ? "#FFB74D" : "#F57C00"} />
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: colors.text,
            marginBottom: 2,
          }}
        >
          Verify your email
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: colors.textSecondary,
          }}
        >
          Unlock full features and secure your account
        </Text>
      </View>

      {/* CTA Button */}
      <Pressable
        onPress={handleResendVerification}
        disabled={isResending}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: themeColor,
          opacity: isResending ? 0.6 : 1,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: "#FFFFFF",
          }}
        >
          {isResending ? "Sending..." : "Verify"}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
