/**
 * Loading Timeout UI
 * 
 * Shown when a screen's loading state exceeds the timeout threshold.
 * Provides user-friendly retry and navigation escape options.
 * Uses existing icon patterns from @/ui/icons.
 */

import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshCw, Home, AlertCircle } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import BottomNavigation from "@/components/BottomNavigation";

interface LoadingTimeoutUIProps {
  /** What is being loaded (e.g., "calendar", "profile") */
  context: string;
  /** Called when user taps retry */
  onRetry: () => void;
  /** Whether retry is currently in progress */
  isRetrying?: boolean;
  /** Whether to show bottom navigation (default: true) */
  showBottomNav?: boolean;
  /** Custom message to display */
  message?: string;
}

export function LoadingTimeoutUI({
  context,
  onRetry,
  isRetrying = false,
  showBottomNav = true,
  message,
}: LoadingTimeoutUIProps) {
  const { themeColor, isDark, colors } = useTheme();
  const router = useRouter();

  const handleRetry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRetry();
  };

  const handleGoHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/calendar");
  };

  const defaultMessage = `Taking longer than expected to load your ${context}. This might be due to a slow connection.`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View className="flex-1 items-center justify-center px-6">
        {/* Icon */}
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-5"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#FEF3C7" }}
        >
          <AlertCircle size={32} color={isDark ? "#FCD34D" : "#D97706"} />
        </View>

        {/* Title */}
        <Text
          className="text-xl font-sora-semibold text-center mb-2"
          style={{ color: colors.text }}
        >
          Still Loading...
        </Text>

        {/* Description */}
        <Text
          className="text-base text-center mb-6"
          style={{ color: colors.textSecondary }}
        >
          {message || defaultMessage}
        </Text>

        {/* Retry Button */}
        <Pressable
          onPress={handleRetry}
          disabled={isRetrying}
          className="rounded-xl py-3 px-6 mb-3 flex-row items-center justify-center"
          style={{
            backgroundColor: themeColor,
            opacity: isRetrying ? 0.6 : 1,
            minWidth: 200,
          }}
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <RefreshCw size={18} color="#FFFFFF" />
              <Text className="text-white font-sora-semibold text-base ml-2">
                Try Again
              </Text>
            </>
          )}
        </Pressable>

        {/* Go to Home Button */}
        <Pressable
          onPress={handleGoHome}
          className="rounded-xl py-3 px-6 flex-row items-center justify-center"
          style={{
            backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
            minWidth: 200,
          }}
        >
          <Home size={18} color={colors.textSecondary} />
          <Text
            className="font-sora-medium text-base ml-2"
            style={{ color: colors.textSecondary }}
          >
            Go to Home
          </Text>
        </Pressable>

        {/* Help Text */}
        <Text
          className="text-sm text-center mt-6"
          style={{ color: colors.textTertiary }}
        >
          You can also use the navigation below to switch screens.
        </Text>
      </View>

      {showBottomNav && <BottomNavigation />}
    </SafeAreaView>
  );
}
