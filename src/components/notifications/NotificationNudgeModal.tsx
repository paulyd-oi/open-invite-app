/**
 * NotificationNudgeModal - Prompts users to enable push notifications
 * Copy evolves based on nudge state for better UX
 */

import React, { useState, useEffect } from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInUp, SlideInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { X, Bell, MessageCircle, CalendarCheck, Users, BellOff, AlertCircle } from "@/ui/icons";

import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { trackAnalytics } from "@/lib/entitlements";

// Nudge state storage key
const NUDGE_COUNT_KEY = "notification_nudge_count";

// Notification nudge state type
export type NudgeState = "none" | "nudged_once" | "nudged_twice" | "never_nudge";

/**
 * INVARIANT: Validate push token before sending to backend
 * Rejects placeholder/test tokens like ExponentPushToken[test123]
 */
function isValidPushToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  if (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken[") && !token.startsWith("ExpoToken[")) return false;
  const lowerToken = token.toLowerCase();
  if (lowerToken.includes('test') || lowerToken.includes('placeholder') || lowerToken.includes('mock')) {
    if (__DEV__) {
      console.log('[NotificationNudge] Rejected placeholder token:', token);
    }
    return false;
  }
  if (token.length < 30) return false;
  return true;
}

/**
 * Register push token with backend after permission is granted
 */
async function registerPushTokenWithBackend(): Promise<boolean> {
  // Only run on physical device
  if (!Device.isDevice) {
    if (__DEV__) {
      console.log('[NotificationNudge] Skipping token registration - not a physical device');
    }
    return false;
  }

  try {
    // Get project ID
    const projectId =
      Constants?.easConfig?.projectId ??
      Constants?.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      if (__DEV__) {
        console.log('[NotificationNudge] No projectId found');
      }
      return false;
    }

    // Get token
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    if (__DEV__) {
      console.log('[NotificationNudge] Got token:', token.substring(0, 30) + '...');
    }

    // Validate token
    if (!isValidPushToken(token)) {
      if (__DEV__) {
        console.log('[NotificationNudge] Token failed validation');
      }
      return false;
    }

    // Register with backend
    await api.post("/api/notifications/register-token", {
      token,
      platform: "expo",
    });

    if (__DEV__) {
      console.log('[NotificationNudge] Token registered successfully');
    }

    return true;
  } catch (error) {
    if (__DEV__) {
      console.error('[NotificationNudge] Token registration error:', error);
    }
    return false;
  }
}

/**
 * Check if auto-nudge should be shown based on nudge history
 * Returns false if user has dismissed twice (never_nudge state)
 */
export async function canShowAutoNudge(): Promise<boolean> {
  try {
    const count = await AsyncStorage.getItem(NUDGE_COUNT_KEY);
    const nudgeCount = count ? parseInt(count, 10) : 0;
    return nudgeCount < 2;
  } catch {
    return true; // Default to showing if we can't read state
  }
}

/**
 * Get current nudge state from storage
 */
export async function getNudgeState(): Promise<NudgeState> {
  try {
    const count = await AsyncStorage.getItem(NUDGE_COUNT_KEY);
    const nudgeCount = count ? parseInt(count, 10) : 0;
    if (nudgeCount >= 2) return "never_nudge";
    if (nudgeCount === 1) return "nudged_once";
    return "none";
  } catch {
    return "none";
  }
}

interface NotificationNudgeModalProps {
  visible: boolean;
  onClose: () => void;
  onEnable?: () => void;
  onNotNow?: () => void;
  nudgeState?: NudgeState;
}

// C. Evolving Copy Based on Nudge State
// First nudge: benefit-framed
// Second nudge: loss-framed
// Third nudge: never auto-show again (handled at trigger level)

interface NudgeCopy {
  title: string;
  subtitle: string;
  bullets: Array<{ icon: React.ComponentType<any>; text: string }>;
  primaryCta: string;
  secondaryCta: string;
}

const FIRST_NUDGE_COPY: NudgeCopy = {
  title: "Stay in the loop",
  subtitle: "Get notified when friends respond, plans change, or new invites are posted.",
  bullets: [
    { icon: CalendarCheck, text: "RSVP updates" },
    { icon: MessageCircle, text: "Event changes" },
    { icon: Users, text: "Friend requests" },
  ],
  primaryCta: "Enable Notifications",
  secondaryCta: "Not Now",
};

const SECOND_NUDGE_COPY: NudgeCopy = {
  title: "Don't miss out",
  subtitle: "You've been missing updates from friends. Turn on notifications to stay connected.",
  bullets: [
    { icon: AlertCircle, text: "Missed event updates" },
    { icon: MessageCircle, text: "Unread messages" },
    { icon: Users, text: "Pending friend requests" },
  ],
  primaryCta: "Turn On Notifications",
  secondaryCta: "Maybe Later",
};

/**
 * Get nudge copy based on state
 */
function getNudgeCopy(nudgeState?: NudgeState): NudgeCopy {
  switch (nudgeState) {
    case "nudged_once":
      return SECOND_NUDGE_COPY;
    case "nudged_twice":
    case "never_nudge":
    case "none":
    default:
      return FIRST_NUDGE_COPY;
  }
}

export function NotificationNudgeModal({
  visible,
  onClose,
  onEnable,
  onNotNow,
  nudgeState = "none",
}: NotificationNudgeModalProps) {
  const { themeColor, colors } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [localNudgeState, setLocalNudgeState] = useState<NudgeState>(nudgeState);

  // Load nudge state from storage on mount
  useEffect(() => {
    const loadNudgeState = async () => {
      try {
        const count = await AsyncStorage.getItem(NUDGE_COUNT_KEY);
        const nudgeCount = count ? parseInt(count, 10) : 0;
        if (nudgeCount >= 2) {
          setLocalNudgeState("never_nudge");
        } else if (nudgeCount === 1) {
          setLocalNudgeState("nudged_once");
        } else {
          setLocalNudgeState("none");
        }
      } catch {
        setLocalNudgeState("none");
      }
    };
    loadNudgeState();
  }, []);

  // Get appropriate copy based on state
  const copy = getNudgeCopy(localNudgeState);

  // Log when shown
  useEffect(() => {
    if (visible) {
      trackAnalytics("notification_nudge_shown", { nudgeState: localNudgeState });
    }
  }, [visible, localNudgeState]);

  const handleEnable = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      // Request permission
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      // Update backend with status
      const pushPermissionStatus = finalStatus === "granted" ? "granted" : "denied";
      await api.post("/api/notifications/status", {
        pushPermissionStatus,
        notifNudgeState: finalStatus === "granted" ? "granted" : "denied",
      });

      // CRITICAL: If permission granted, register the push token with backend
      if (finalStatus === "granted") {
        await registerPushTokenWithBackend();
      }

      // Track analytics
      if (finalStatus === "granted") {
        trackAnalytics("notification_permission_granted", {});
      } else {
        trackAnalytics("notification_permission_denied", {});
      }

      if (onEnable) {
        onEnable();
      }
      onClose();
    } catch (error) {
      console.error("[NotificationNudge] Error requesting permission:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotNow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackAnalytics("notification_nudge_dismissed", { nudgeState: localNudgeState });

    try {
      // Increment nudge count
      const count = await AsyncStorage.getItem(NUDGE_COUNT_KEY);
      const nudgeCount = count ? parseInt(count, 10) : 0;
      const newCount = nudgeCount + 1;
      await AsyncStorage.setItem(NUDGE_COUNT_KEY, String(newCount));

      // Determine new nudge state
      let newNudgeState: NudgeState = "nudged_once";
      if (newCount >= 2) {
        newNudgeState = "never_nudge"; // Stop auto-nudging after 2 dismissals
      }

      // Update backend
      await api.post("/api/notifications/status", {
        pushPermissionStatus: "unknown",
        notifNudgeState: newNudgeState,
      });
    } catch (error) {
      console.error("[NotificationNudge] Error updating status:", error);
    }

    if (onNotNow) {
      onNotNow();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleNotNow}
    >
      <View className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
        <Pressable className="flex-1" onPress={handleNotNow} />
        <Animated.View
          entering={SlideInUp.springify().damping(15)}
          className="rounded-t-3xl overflow-hidden"
          style={{ backgroundColor: colors.background }}
        >
          <SafeAreaView edges={["bottom"]}>
            {/* Header with gradient */}
            <LinearGradient
              colors={[`${themeColor}30`, "transparent"]}
              style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 16 }}
            >
              {/* Close button */}
              <Pressable
                onPress={handleNotNow}
                className="absolute top-4 right-4 w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.surface }}
                hitSlop={12}
              >
                <X size={18} color={colors.textSecondary} />
              </Pressable>

              {/* Icon */}
              <Animated.View
                entering={FadeIn.delay(100)}
                className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                {localNudgeState === "nudged_once" ? (
                  <BellOff size={32} color={themeColor} />
                ) : (
                  <Bell size={32} color={themeColor} />
                )}
              </Animated.View>

              {/* Title */}
              <Animated.Text
                entering={FadeInUp.delay(150)}
                className="text-2xl font-bold"
                style={{ color: colors.text }}
              >
                {copy.title}
              </Animated.Text>

              {/* Subtitle */}
              <Animated.Text
                entering={FadeInUp.delay(200)}
                className="text-base mt-2"
                style={{ color: colors.textSecondary }}
              >
                {copy.subtitle}
              </Animated.Text>
            </LinearGradient>

            {/* Bullets */}
            <View className="px-6 py-4">
              {copy.bullets.map((bullet, index) => {
                const IconComponent = bullet.icon;
                return (
                  <Animated.View
                    key={index}
                    entering={FadeInUp.delay(250 + index * 50)}
                    className="flex-row items-center py-3"
                    style={{
                      borderBottomWidth: index < copy.bullets.length - 1 ? 1 : 0,
                      borderBottomColor: colors.separator,
                    }}
                  >
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                      style={{ backgroundColor: `${themeColor}15` }}
                    >
                      <IconComponent size={20} color={themeColor} />
                    </View>
                    <Text
                      className="flex-1 text-base font-medium"
                      style={{ color: colors.text }}
                    >
                      {bullet.text}
                    </Text>
                  </Animated.View>
                );
              })}
            </View>

            {/* CTAs */}
            <View className="px-6 pt-4 pb-2">
              {/* Primary CTA */}
              <Pressable
                onPress={handleEnable}
                disabled={isLoading}
                className="py-4 rounded-2xl flex-row items-center justify-center"
                style={{
                  backgroundColor: themeColor,
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                <Bell size={20} color="#FFFFFF" />
                <Text className="text-white text-lg font-semibold ml-2">
                  {isLoading ? "Requesting..." : copy.primaryCta}
                </Text>
              </Pressable>

              {/* Secondary CTA */}
              <Pressable
                onPress={handleNotNow}
                disabled={isLoading}
                className="py-4 items-center mt-2"
              >
                <Text
                  className="text-base"
                  style={{ color: colors.textSecondary }}
                >
                  {copy.secondaryCta}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default NotificationNudgeModal;
