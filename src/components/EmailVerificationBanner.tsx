/**
 * EmailVerificationBanner
 * 
 * Non-blocking banner shown when user's email is not verified.
 * Features:
 * - Shows only when emailVerified === false
 * - "Resend email" button calls resend endpoint
 * - Auto-hides when emailVerified becomes true
 * - 30-second cooldown after auto-send and manual resend
 * - Positioned at top of screen (non-intrusive)
 */

import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { Mail } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

import { useSession, authClient } from "@/lib/useSession";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";

// Store last resend timestamp to enable cooldown
let lastResendTimestamp = 0;

/**
 * Trigger cooldown externally (e.g., after auto-send from onboarding)
 */
export function triggerVerificationCooldown() {
  lastResendTimestamp = Date.now();
}

export function EmailVerificationBanner() {
  const { data } = useSession();
  const session = data;
  const { colors, themeColor, isDark } = useTheme();
  const [isResending, setIsResending] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update cooldown countdown every second
  useEffect(() => {
    const updateCooldown = () => {
      const elapsed = Date.now() - lastResendTimestamp;
      const remaining = Math.max(0, Math.ceil((30000 - elapsed) / 1000));
      setCooldownRemaining(remaining);
      
      if (remaining === 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // Initial check
    updateCooldown();

    // Start interval if in cooldown
    if (lastResendTimestamp > 0 && Date.now() - lastResendTimestamp < 30000) {
      intervalRef.current = setInterval(updateCooldown, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [lastResendTimestamp]);

  // Only show if user is logged in and email is not verified
  if (!session?.user?.email || session?.user?.emailVerified === true) {
    return null;
  }

  const isInCooldown = cooldownRemaining > 0;

  const handleResendVerification = async () => {
    if (isResending || isInCooldown || !session?.user?.email) return;

    setIsResending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const endpoint = "/api/email-verification/resend";
    console.log("[verify] resend start", { endpoint });

    try {
      const data = await authClient.$fetch<{ success?: boolean; error?: string; message?: string }>(
        endpoint,
        {
          method: "POST",
          body: { 
            email: session.user.email.toLowerCase(),
            name: session.user.name || session.user.displayName || undefined
          },
        }
      );

      console.log("[verify] resend success");
      
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success(
          "Email sent",
          "Check your inbox — it might take a minute to arrive."
        );
        
        // Start 30-second cooldown
        lastResendTimestamp = Date.now();
        setCooldownRemaining(30);
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          const elapsed = Date.now() - lastResendTimestamp;
          const remaining = Math.max(0, Math.ceil((30000 - elapsed) / 1000));
          setCooldownRemaining(remaining);
          if (remaining === 0 && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }, 1000);
      } else {
        // Handle specific errors
        if (data.error?.includes("already verified")) {
          safeToast.info("Already Verified", "Your email is already verified.");
        } else if (data.error?.includes("rate limit") || data.error?.includes("cooldown")) {
          safeToast.warning("Please Wait", "Try again in a few minutes.");
        } else {
          console.warn("[verify] resend failed", data.error || "Unknown error");
          safeToast.error("Error", data.error || "Unable to send verification email.");
        }
      }
    } catch (error: any) {
      console.warn("[verify] resend failed", error?.message ?? error);
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
        <Mail size={18} color={isDark ? "#FF9800" : "#F57C00"} />
      </View>

      {/* Text Content */}
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: colors.text,
            marginBottom: 2,
          }}
        >
          Check your email
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: colors.textSecondary,
            marginBottom: 4,
          }}
        >
          We sent a verification link to your inbox.
        </Text>
        <Text
          style={{
            fontSize: 10,
            color: colors.textTertiary,
          }}
        >
          Email verification helps keep Open Invite safe and spam-free.
        </Text>
      </View>

      {/* CTA Button */}
      <Pressable
        onPress={handleResendVerification}
        disabled={isResending || isInCooldown}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: themeColor,
          opacity: isResending || isInCooldown ? 0.5 : 1,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            color: "#FFFFFF",
          }}
        >
          {isResending 
            ? "Sending..." 
            : isInCooldown 
              ? `Sent (${cooldownRemaining}s)` 
              : "Resend email"}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
