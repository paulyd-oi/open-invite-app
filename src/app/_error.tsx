import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";

type Props = {
  error: Error;
  retry: () => void;
};

export default function GlobalErrorBoundary({ error, retry }: Props) {
  const { colors, themeColor } = useTheme();

  const handleRestart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      // Prefer retry() if it works for the thrown boundary
      retry?.();
    } catch {}
    // Escape hatch: go back or go home
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const handleGoHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.replace("/");
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center", backgroundColor: colors.background }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, textAlign: "center" }}>
        Something went wrong
      </Text>

      <Text
        style={{
          marginTop: 10,
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        Try restarting the app.
      </Text>

      <Pressable
        onPress={handleRestart}
        style={{
          marginTop: 24,
          alignSelf: "center",
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderRadius: 999,
          backgroundColor: themeColor,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Restart</Text>
      </Pressable>

      <Pressable
        onPress={handleGoHome}
        style={{ marginTop: 16, alignSelf: "center", paddingVertical: 8 }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center" }}>
          Go to Home
        </Text>
      </Pressable>

      {/* Keep stack trace out of normal UX; still useful during dev if needed */}
      {__DEV__ ? (
        <Text
          style={{
            marginTop: 14,
            fontSize: 12,
            color: colors.textTertiary,
            fontFamily: "Menlo",
          }}
          numberOfLines={10}
        >
          {String(error?.message || error)}
        </Text>
      ) : null}
    </View>
  );
}
