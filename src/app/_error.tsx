import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/themeContext.tsx";

type Props = {
  error: Error;
  retry: () => void;
};

export default function GlobalErrorBoundary({ error, retry }: Props) {
  const { colors } = useTheme();

  const handleRestart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      // Prefer retry() if it works for the thrown boundary; otherwise route home.
      retry?.();
    } catch {}
    // Always provide an escape hatch
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center" }}>
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
        Try restarting this screen. If it keeps happening, fully close and reopen the app.
      </Text>

      <Pressable
        onPress={handleRestart}
        style={{
          marginTop: 18,
          alignSelf: "center",
          paddingHorizontal: 18,
          paddingVertical: 12,
          borderRadius: 999,
          backgroundColor: colors.primary,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Restart</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          // Keep “Details” hidden behind a long-press-like pattern:
          // normal tap does nothing
        }}
        style={{ marginTop: 14, alignSelf: "center" }}
      >
        <Text style={{ color: colors.textTertiary, fontSize: 12, textAlign: "center" }}>
          Error captured
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
