/**
 * Auth Error UI
 *
 * Shown when auth bootstrap fails or times out.
 * Provides Retry and Reset Session options.
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertCircle, RefreshCw, Trash2 } from "@/ui/icons";
import * as Haptics from "expo-haptics";

interface AuthErrorUIProps {
  error?: string;
  timedOut?: boolean;
  onRetry: () => void;
  onReset: () => void;
}

export function AuthErrorUI({ error, timedOut, onRetry, onReset }: AuthErrorUIProps) {
  const handleRetry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRetry();
  };

  const handleReset = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onReset();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <View className="flex-1 items-center justify-center px-6">
        {/* Icon */}
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-6"
          style={{ backgroundColor: "#FEE2E2" }}
        >
          <AlertCircle size={40} color="#DC2626" />
        </View>

        {/* Title */}
        <Text
          className="text-2xl font-sora-bold text-center mb-3"
          style={{ color: "#1A1A2E" }}
        >
          {timedOut ? "Connection Timeout" : "Authentication Error"}
        </Text>

        {/* Description */}
        <Text
          className="text-base text-center mb-8"
          style={{ color: "#6B7280" }}
        >
          {timedOut
            ? "We couldn't connect to the server in time. This might be due to a slow connection or server issues."
            : error || "An unexpected error occurred while signing you in. Please try again."}
        </Text>

        {/* Retry Button */}
        <Pressable
          onPress={handleRetry}
          className="w-full rounded-xl py-4 mb-3 flex-row items-center justify-center"
          style={{ backgroundColor: "#E85D4C" }}
        >
          <RefreshCw size={20} color="#FFFFFF" />
          <Text className="text-white font-sora-semibold text-base ml-2">
            Retry Connection
          </Text>
        </Pressable>

        {/* Reset Session Button */}
        <Pressable
          onPress={handleReset}
          className="w-full rounded-xl py-4 flex-row items-center justify-center"
          style={{
            backgroundColor: "#F3F4F6",
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <Trash2 size={20} color="#6B7280" />
          <Text
            className="font-sora-semibold text-base ml-2"
            style={{ color: "#374151" }}
          >
            Reset Session
          </Text>
        </Pressable>

        {/* Help Text */}
        <Text
          className="text-sm text-center mt-6"
          style={{ color: "#9CA3AF" }}
        >
          Resetting your session will log you out and clear all cached data.
        </Text>
      </View>
    </SafeAreaView>
  );
}
