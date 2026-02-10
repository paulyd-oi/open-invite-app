/**
 * WelcomeModal - First-login welcome modal for new users
 * 
 * Shows ONLY ONCE per user/device at first login on calendar screen.
 * Adapts content based on email verification status:
 * - Unverified: Prompts to verify email
 * - Verified: Prompts to find friends or create first invite
 * 
 * Uses SecureStore with user-scoped key for permanent dismissal.
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { Calendar, Users, Mail, Send } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { triggerVerificationCooldown } from "@/components/EmailVerificationBanner";
import { authClient } from "@/lib/authClient";
import { safeToast } from "@/lib/safeToast";
import { devWarn } from "@/lib/devLog";

// SecureStore key prefix - MUST be user-scoped
const WELCOME_MODAL_SHOWN_PREFIX = "openinvite.welcome_modal_shown.";

// Helper to build user-scoped key
function buildWelcomeModalKey(userId: string): string {
  // Sanitize: replace any character not in [A-Za-z0-9._-] with underscore
  const sanitized = userId.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${WELCOME_MODAL_SHOWN_PREFIX}${sanitized}`;
}

/**
 * Check if welcome modal has been shown for this user
 */
export async function hasWelcomeModalBeenShown(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return true; // No user = don't show
  
  try {
    const key = buildWelcomeModalKey(userId);
    const value = await SecureStore.getItemAsync(key);
    return value === "true";
  } catch (error) {
    // On error, default to not showing (avoid annoying users)
    devWarn("[WelcomeModal] Error reading shown state:", error);
    return true;
  }
}

/**
 * Mark welcome modal as shown for this user (permanent dismissal)
 */
export async function markWelcomeModalShown(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  
  try {
    const key = buildWelcomeModalKey(userId);
    await SecureStore.setItemAsync(key, "true");
  } catch (error) {
    devWarn("[WelcomeModal] Error saving shown state:", error);
  }
}

interface WelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WelcomeModal({ visible, onClose }: WelcomeModalProps) {
  const router = useRouter();
  const { themeColor, colors, isDark } = useTheme();
  const { data: session } = useSession();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);

  const isEmailVerified = session?.user?.emailVerified === true;
  const userEmail = session?.user?.email;
  const userId = session?.user?.id;

  // Mark as shown immediately when modal becomes visible
  useEffect(() => {
    if (visible && userId) {
      markWelcomeModalShown(userId);
    }
  }, [visible, userId]);

  const handleClose = useCallback(async () => {
    Haptics.selectionAsync();
    onClose();
  }, [onClose]);

  // UNVERIFIED: Primary CTA - Go to verify email screen
  const handleVerifyEmail = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    router.push("/verify-email");
  }, [isLoading, onClose, router]);

  // UNVERIFIED: Secondary - Resend verification email
  const handleResendEmail = useCallback(async () => {
    if (isLoading || !userEmail) return;
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await authClient.$fetch("/api/email-verification/resend", {
        method: "POST",
        body: { email: userEmail },
      });
      triggerVerificationCooldown();
      safeToast.success("Email Sent", "Check your inbox for the verification email.");
    } catch (error) {
      safeToast.error("Verification Failed", "Failed to send verification email. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, userEmail]);

  // VERIFIED: Primary CTA - Find friends
  const handleFindFriends = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    router.push("/friends");
  }, [isLoading, onClose, router]);

  // VERIFIED: Secondary CTA - Create first invite
  const handleCreateInvite = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    router.push("/create");
  }, [isLoading, onClose, router]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      >
        {/* Backdrop tap to close */}
        <Pressable className="flex-1" onPress={handleClose} />

        <Animated.View
          entering={SlideInUp.springify().damping(20)}
          exiting={SlideOutDown.duration(200)}
          className="rounded-t-3xl overflow-hidden"
          style={{ backgroundColor: colors.surface }}
        >
          {/* Header with gradient accent */}
          <LinearGradient
            colors={[themeColor, `${themeColor}CC`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingTop: 24, paddingBottom: 20, paddingHorizontal: 24 }}
          >
            <View className="items-center">
              <View className="w-16 h-16 rounded-full bg-white/20 items-center justify-center mb-3">
                <Calendar size={32} color="#fff" />
              </View>
              <Text className="text-2xl font-bold text-white text-center">
                Welcome to Open Invite
              </Text>
              <Text className="text-white/80 text-center mt-1 text-base">
                A social calendar for making plans with friends.
              </Text>
            </View>
          </LinearGradient>

          {/* Content - adapts based on verification status */}
          <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: Math.max(insets.bottom, 20) + 8 }}>
            {!isEmailVerified ? (
              // STATE A: Unverified User
              <>
                <Text
                  className="text-base text-center mb-6 leading-6"
                  style={{ color: colors.textSecondary }}
                >
                  For privacy and safety, please verify your email to get started.
                </Text>

                {/* Primary CTA: Verify Email */}
                <Pressable
                  onPress={handleVerifyEmail}
                  disabled={isLoading}
                  className="py-4 rounded-xl items-center flex-row justify-center mb-3"
                  style={{ backgroundColor: themeColor, opacity: isLoading ? 0.7 : 1 }}
                >
                  <Mail size={20} color="#fff" />
                  <Text className="text-white font-semibold text-base ml-2">
                    Verify Email
                  </Text>
                </Pressable>

                {/* Secondary: Resend Email */}
                <Pressable
                  onPress={handleResendEmail}
                  disabled={isLoading}
                  className="py-3 items-center"
                >
                  <Text
                    className="text-sm font-medium"
                    style={{ color: themeColor }}
                  >
                    Resend Email
                  </Text>
                </Pressable>

                {/* Skip */}
                <Pressable
                  onPress={handleClose}
                  className="py-3 items-center mt-1"
                >
                  <Text
                    className="text-sm"
                    style={{ color: colors.textTertiary }}
                  >
                    Skip for now
                  </Text>
                </Pressable>
              </>
            ) : (
              // STATE B: Verified User
              <>
                <Text
                  className="text-base text-center mb-6 leading-6"
                  style={{ color: colors.textSecondary }}
                >
                  Find friends or invite your friends — Open Invite gets better as more people you know join the network.
                </Text>

                {/* Primary CTA: Find Friends */}
                <Pressable
                  onPress={handleFindFriends}
                  disabled={isLoading}
                  className="py-4 rounded-xl items-center flex-row justify-center mb-3"
                  style={{ backgroundColor: themeColor, opacity: isLoading ? 0.7 : 1 }}
                >
                  <Users size={20} color="#fff" />
                  <Text className="text-white font-semibold text-base ml-2">
                    Find Friends
                  </Text>
                </Pressable>

                {/* Secondary CTA: Create First Invite */}
                <Pressable
                  onPress={handleCreateInvite}
                  disabled={isLoading}
                  className="py-4 rounded-xl items-center flex-row justify-center mb-3"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Send size={18} color={colors.text} />
                  <Text
                    className="font-semibold text-base ml-2"
                    style={{ color: colors.text }}
                  >
                    Create Your First Invite
                  </Text>
                </Pressable>

                {/* Skip */}
                <Pressable
                  onPress={handleClose}
                  className="py-3 items-center"
                >
                  <Text
                    className="text-sm"
                    style={{ color: colors.textTertiary }}
                  >
                    Skip for now
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
