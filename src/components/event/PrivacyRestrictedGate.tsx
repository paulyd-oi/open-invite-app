import React from "react";
import { Pressable, View, Text, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { Lock } from "@/ui/icons";
import { Button } from "@/ui/Button";
import { EntityAvatar } from "@/components/EntityAvatar";

interface PrivacyRestrictedGateColors {
  background: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  surface: string;
  border: string;
  separator: string;
}

interface PrivacyRestrictedGateProps {
  hasHostId: boolean;
  hostImage: string | null;
  hostFirst: string;
  hostDisplayName: string;
  denyReason: string | undefined;
  circleId: string | undefined;
  isDark: boolean;
  colors: PrivacyRestrictedGateColors;
  onGoToHostProfile: () => void;
  onViewCircle: () => void;
}

export function PrivacyRestrictedGate({
  hasHostId,
  hostImage,
  hostFirst,
  hostDisplayName,
  denyReason,
  circleId,
  isDark,
  colors,
  onGoToHostProfile,
  onViewCircle,
}: PrivacyRestrictedGateProps) {
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Event", headerBackTitle: "Back" }} />
      <View className="flex-1 items-center justify-center px-6">
        {/* Locked-state card */}
        <View
          className="w-full rounded-2xl items-center px-6 py-8"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            ...(Platform.OS === "ios" ? {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.3 : 0.08,
              shadowRadius: 8,
            } : { elevation: 2 }),
          }}
        >
          {/* Tappable host avatar — SSOT via EntityAvatar */}
          {hasHostId ? (
            <Pressable onPress={onGoToHostProfile}>
              <View style={{ marginBottom: 16, borderWidth: 2, borderColor: colors.separator, borderRadius: 40, overflow: 'hidden' }}>
                <EntityAvatar
                  photoUrl={hostImage}
                  initials={hostFirst ? hostFirst.charAt(0).toUpperCase() : undefined}
                  size={80}
                  borderRadius={40}
                  backgroundColor={colors.background}
                  foregroundColor={colors.textSecondary}
                  fallbackIcon="person-outline"
                />
              </View>
            </Pressable>
          ) : (
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: colors.background }}
            >
              <Lock size={28} color={colors.textSecondary} />
            </View>
          )}

          {/* Line 1: tertiary hosted-by attribution */}
          <Text
            className="text-sm text-center"
            style={{ color: colors.textSecondary, marginBottom: 6 }}
          >
            {`Event hosted by ${hostDisplayName}`}
          </Text>

          {/* Line 2: headline */}
          <Text
            className="text-xl font-semibold text-center"
            style={{ color: colors.text, marginBottom: 8 }}
          >
            {denyReason === "circle_only" ? "Circle-only event" : "Event details hidden"}
          </Text>

          {/* Line 3: body */}
          <Text
            className="text-center"
            style={{ color: colors.textSecondary, lineHeight: 22, marginBottom: 28 }}
          >
            {denyReason === "circle_only"
              ? "Join the circle to view this event."
              : `Connect with ${hostFirst} to see this event.`}
          </Text>

          {/* CTA: View Circle (preferred for circle_only) → View profile → fallback */}
          {denyReason === "circle_only" && circleId ? (
            <View className="w-full" style={{ gap: 10 }}>
              <Button
                variant="primary"
                label="View Circle"
                onPress={onViewCircle}
              />
              {hasHostId && (
                <Button
                  variant="secondary"
                  label="View host profile"
                  onPress={onGoToHostProfile}
                />
              )}
            </View>
          ) : hasHostId ? (
            <View className="w-full">
              <Button
                variant="primary"
                label={denyReason === "circle_only" ? "View host profile" : "View profile"}
                onPress={onGoToHostProfile}
              />
            </View>
          ) : (
            <Text
              className="text-sm text-center"
              style={{ color: colors.textTertiary }}
            >
              Profile unavailable right now.
            </Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
