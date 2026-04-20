/**
 * PremiumUpsellSheet — Reusable compact bottom sheet for premium feature gates.
 *
 * Used by: ThemeTray (premium theme tap), ThemeTray (studio gate),
 * EffectTray (premium effect tap).
 *
 * Shows title + subtitle + optional preview content + CTA buttons.
 * Consistent glass styling across all three gate points.
 */

import React, { useEffect } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Crown, X } from "@/ui/icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/ThemeContext";
import { SCRIM } from "@/ui/tokens";
import { trackAnalytics } from "@/lib/entitlements";
import { goToSubscription } from "@/lib/nav";

export interface PremiumUpsellSheetProps {
  visible: boolean;
  /** e.g. "Premium Theme", "Theme Studio", "Premium Effect" */
  title: string;
  /** e.g. "Unlock all 36 premium themes with Pro" */
  subtitle: string;
  /** Optional content rendered between subtitle and buttons */
  previewContent?: React.ReactNode;
  /** PostHog event name fired on show (e.g. "premium_theme_upsell_shown") */
  analyticsShowEvent?: string;
  /** PostHog event name fired on upgrade tap */
  analyticsUpgradeEvent?: string;
  /** PostHog extra properties */
  analyticsProps?: Record<string, unknown>;
  /** Called when sheet is dismissed (secondary or backdrop tap) */
  onDismiss: () => void;
}

export function PremiumUpsellSheet({
  visible,
  title,
  subtitle,
  previewContent,
  analyticsShowEvent,
  analyticsUpgradeEvent,
  analyticsProps,
  onDismiss,
}: PremiumUpsellSheetProps) {
  const router = useRouter();
  const { themeColor } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible && analyticsShowEvent) {
      trackAnalytics(analyticsShowEvent as any, analyticsProps ?? {});
    }
  }, [visible, analyticsShowEvent]);

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (analyticsUpgradeEvent) {
      trackAnalytics(analyticsUpgradeEvent as any, analyticsProps ?? {});
    }
    onDismiss();
    goToSubscription(router);
  };

  const handleSecondary = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (analyticsShowEvent) {
      trackAnalytics(
        (analyticsShowEvent.replace("_shown", "_dismissed")) as any,
        analyticsProps ?? {},
      );
    }
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleSecondary}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={{ flex: 1 }}
      >
        {/* Backdrop */}
        <Pressable
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={handleSecondary}
        >
          <BlurView
            intensity={30}
            tint="dark"
            style={{ flex: 1, backgroundColor: SCRIM.medium }}
          />
        </Pressable>

        {/* Bottom-aligned card */}
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Animated.View
            entering={SlideInDown.springify().damping(20)}
            exiting={SlideOutDown.springify().damping(20)}
          >
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: Math.max(insets.bottom, 8) + 8,
                borderRadius: 24,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.4,
                shadowRadius: 24,
              }}
            >
              {/* Dark gradient base */}
              <LinearGradient
                colors={["#1a1a2e", "#16213e", "#0f0f23"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: "absolute", width: "100%", height: "100%" }}
              />
              <BlurView
                intensity={40}
                tint="dark"
                style={{ position: "absolute", width: "100%", height: "100%" }}
              />

              <View style={{ padding: 24 }}>
                {/* Close */}
                <Pressable
                  onPress={handleSecondary}
                  hitSlop={12}
                  style={{ position: "absolute", top: 16, right: 16, zIndex: 1 }}
                >
                  <X size={20} color="rgba(255,255,255,0.5)" />
                </Pressable>

                {/* Crown + Title */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Crown size={20} color="#FFD700" />
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 18,
                      fontWeight: "700",
                      marginLeft: 8,
                    }}
                  >
                    {title}
                  </Text>
                </View>

                {/* Subtitle */}
                <Text
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 14,
                    lineHeight: 20,
                    marginBottom: previewContent ? 16 : 20,
                  }}
                >
                  {subtitle}
                </Text>

                {/* Optional preview */}
                {previewContent}

                {/* Primary CTA */}
                <Pressable
                  onPress={handleUpgrade}
                  style={{
                    backgroundColor: themeColor,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                    Upgrade to Pro
                  </Text>
                </Pressable>

                {/* Secondary */}
                <Pressable
                  onPress={handleSecondary}
                  style={{ alignItems: "center", paddingVertical: 8 }}
                >
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                    Keep browsing
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}
