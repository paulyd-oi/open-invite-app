import React from "react";
import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInUp } from "react-native-reanimated";
import { X } from "@/ui/icons";
import { ONBOARDING_GUIDE_CONTENT, type OnboardingGuideStep } from "@/hooks/useOnboardingGuide";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingGuideOverlayProps {
  step: OnboardingGuideStep;
  onDismiss: () => void;      // Called when X button pressed - advances to next step
  onSkipAll?: () => void;     // Called when "Skip guide" pressed - dismisses entire guide
  themeColor: string;
  isDark: boolean;
  colors: any;
  // Position hint for where to show the tooltip
  position?: "top" | "bottom" | "center";
}

/**
 * Overlay component for interactive onboarding guidance
 * Shows contextual hints guiding users through key actions
 */
export function OnboardingGuideOverlay({
  step,
  onDismiss,
  onSkipAll,
  themeColor,
  isDark,
  colors,
  position = "bottom",
}: OnboardingGuideOverlayProps) {
  if (step === "completed") return null;

  const content = ONBOARDING_GUIDE_CONTENT[step];
  if (!content) return null;

  const positionStyles = {
    top: { top: 100 },
    bottom: { bottom: 120 },
    center: { top: "40%" as any },
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={[styles.container]}
      pointerEvents="box-none"
    >
      {/* Semi-transparent overlay */}
      <View style={styles.backdrop} pointerEvents="none" />
      
      {/* Tooltip card */}
      <Animated.View
        entering={SlideInUp.springify().damping(15)}
        style={[
          styles.tooltip,
          positionStyles[position],
          { backgroundColor: colors.surface, borderColor: themeColor },
        ]}
      >
        {/* Dismiss button */}
        <Pressable
          onPress={onDismiss}
          style={[styles.dismissButton, { backgroundColor: colors.surfaceElevated }]}
          hitSlop={8}
        >
          <X size={14} color={colors.textSecondary} />
        </Pressable>

        {/* Content */}
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>
            {content.title}
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {content.description}
          </Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepIndicator}>
          {["friends_tab", "add_friend", "create_event"].map((s, i) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                {
                  backgroundColor: s === step ? themeColor : colors.textTertiary,
                  opacity: s === step ? 1 : 0.3,
                },
              ]}
            />
          ))}
        </View>

        {/* Skip link - dismisses entire guide permanently */}
        <Pressable onPress={onSkipAll || onDismiss} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: colors.textTertiary }]}>
            Skip guide
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  tooltip: {
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: 16,
    borderWidth: 2,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dismissButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    marginBottom: 16,
    paddingRight: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  skipButton: {
    alignItems: "center",
  },
  skipText: {
    fontSize: 13,
  },
});
