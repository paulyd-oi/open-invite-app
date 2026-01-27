/**
 * EmailVerificationGateModal
 * 
 * One-time blocking modal shown immediately after onboarding
 * if user's email is not verified.
 * 
 * Features:
 * - Shows once per user account
 * - Explains why verification is required
 * - "Resend email" button
 * - "I'll do it later" dismiss option
 * - Auto-hides when email verified
 */

import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Mail } from "@/ui/icons";
import * as Haptics from "expo-haptics";

import { useSession, authClient } from "@/lib/useSession";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { triggerVerificationCooldown } from "@/components/EmailVerificationBanner";

interface EmailVerificationGateModalProps {
  visible: boolean;
  onClose: () => void;
}

export function EmailVerificationGateModal({ visible, onClose }: EmailVerificationGateModalProps) {
  const { data: session } = useSession();
  const { colors, themeColor, isDark } = useTheme();
  const [isResending, setIsResending] = useState(false);

  const userEmail = session?.user?.email;

  const handleResend = async () => {
    if (isResending || !userEmail) return;

    setIsResending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const endpoint = "/api/email-verification/resend";
    console.log("[EmailGate] resend start", { endpoint });

    try {
      const data = await authClient.$fetch<{ success?: boolean; error?: string }>(
        endpoint,
        {
          method: "POST",
          body: { 
            email: userEmail.toLowerCase(),
            name: session?.user?.name || session?.user?.displayName || undefined
          },
        }
      );

      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success(
          "Email sent",
          "Check your inbox — it might take a minute to arrive."
        );
        // Trigger cooldown in banner
        triggerVerificationCooldown();
      } else {
        if (data.error?.includes("already verified")) {
          safeToast.info("Already Verified", "Your email is already verified.");
        } else if (data.error?.includes("rate limit") || data.error?.includes("cooldown")) {
          safeToast.warning("Please Wait", "Try again in a few minutes.");
        } else {
          console.warn("[EmailGate] resend failed", data.error || "Unknown error");
          safeToast.error("Error", data.error || "Unable to send verification email.");
        }
      }
    } catch (error: any) {
      console.warn("[EmailGate] resend failed", error?.message ?? error);
      safeToast.error("Network Error", "Please check your connection and try again.");
    } finally {
      setIsResending(false);
    }
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  // Don't show if email is verified
  if (session?.user?.emailVerified === true) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        {/* Modal Card */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: 24,
            width: "100%",
            maxWidth: 400,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Icon */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: isDark ? "rgba(255, 152, 0, 0.2)" : "#FFF9E6",
              justifyContent: "center",
              alignItems: "center",
              alignSelf: "center",
              marginBottom: 16,
            }}
          >
            <Mail size={32} color={isDark ? "#FF9800" : "#F57C00"} />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: colors.text,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            Verify your email to continue
          </Text>

          {/* Body */}
          <Text
            style={{
              fontSize: 15,
              color: colors.textSecondary,
              textAlign: "center",
              lineHeight: 22,
              marginBottom: 8,
            }}
          >
            We sent a verification link to{" "}
            <Text style={{ fontWeight: "600", color: colors.text }}>
              {userEmail}
            </Text>
            . Please verify to start creating invites and adding friends.
          </Text>

          {/* Trust Line */}
          <Text
            style={{
              fontSize: 13,
              color: colors.textTertiary,
              textAlign: "center",
              lineHeight: 18,
              marginBottom: 24,
            }}
          >
            Email verification helps keep Open Invite safe and spam-free.
          </Text>

          {/* Primary Button: Resend Email */}
          <Pressable
            onPress={handleResend}
            disabled={isResending}
            style={{
              backgroundColor: themeColor,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              marginBottom: 12,
              opacity: isResending ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: "#FFFFFF",
              }}
            >
              {isResending ? "Sending..." : "Resend email"}
            </Text>
          </Pressable>

          {/* Secondary Button: I'll do it later */}
          <Pressable
            onPress={handleDismiss}
            style={{
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "500",
                color: colors.textSecondary,
              }}
            >
              I'll do it later
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
