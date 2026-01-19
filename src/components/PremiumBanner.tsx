import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Crown, Lock, Sparkles } from "@/ui/icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";

interface PremiumBannerProps {
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export function PremiumBanner({
  title = "Unlock Premium",
  subtitle = "Get unlimited friends, events & more",
  compact = false,
}: PremiumBannerProps) {
  const router = useRouter();
  const { themeColor, colors } = useTheme();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/paywall");
  };

  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        className="flex-row items-center justify-between p-3 rounded-xl"
        style={{
          backgroundColor: "#FFD70015",
          borderWidth: 1,
          borderColor: "#FFD70040",
        }}
      >
        <View className="flex-row items-center">
          <Crown size={18} color="#FFD700" />
          <Text style={{ color: colors.text }} className="text-sm font-medium ml-2">
            {title}
          </Text>
        </View>
        <View
          className="px-3 py-1 rounded-full"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white text-xs font-medium">Upgrade</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      className="mx-4 rounded-2xl overflow-hidden"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Gradient Background Effect */}
      <View
        className="absolute inset-0 opacity-20"
        style={{
          backgroundColor: "#FFD700",
        }}
      />

      <View className="p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <View className="flex-row items-center mb-2">
              <Crown size={24} color="#FFD700" />
              <Sparkles size={16} color="#FFD700" style={{ marginLeft: 4 }} />
            </View>
            <Text style={{ color: colors.text }} className="text-lg font-bold">
              {title}
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm mt-1">
              {subtitle}
            </Text>
          </View>

          <View
            className="px-4 py-2 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Upgrade</Text>
          </View>
        </View>

        {/* Features Preview */}
        <View className="flex-row mt-4 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
          <View className="flex-1 items-center">
            <Text style={{ color: themeColor }} className="text-lg font-bold">∞</Text>
            <Text style={{ color: colors.textTertiary }} className="text-xs">Friends</Text>
          </View>
          <View className="flex-1 items-center">
            <Text style={{ color: themeColor }} className="text-lg font-bold">∞</Text>
            <Text style={{ color: colors.textTertiary }} className="text-xs">Events</Text>
          </View>
          <View className="flex-1 items-center">
            <Text style={{ color: "#10B981" }} className="text-lg font-bold">✓</Text>
            <Text style={{ color: colors.textTertiary }} className="text-xs">Alerts</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

interface FeatureLockProps {
  feature: string;
  children: React.ReactNode;
  isLocked: boolean;
}

export function FeatureLock({ feature, children, isLocked }: FeatureLockProps) {
  const router = useRouter();
  const { themeColor, colors, isDark } = useTheme();

  if (!isLocked) {
    return <>{children}</>;
  }

  const handleUnlock = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/paywall");
  };

  return (
    <View className="relative">
      {/* Blurred/Dimmed Content */}
      <View style={{ opacity: 0.3 }} pointerEvents="none">
        {children}
      </View>

      {/* Lock Overlay */}
      <View
        className="absolute inset-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.8)",
        }}
      >
        <View
          className="w-14 h-14 rounded-full items-center justify-center mb-3"
          style={{ backgroundColor: `${themeColor}15` }}
        >
          <Lock size={24} color={themeColor} />
        </View>
        <Text style={{ color: colors.text }} className="text-base font-semibold mb-1">
          Premium Feature
        </Text>
        <Text style={{ color: colors.textSecondary }} className="text-sm text-center px-4 mb-3">
          Upgrade to unlock {feature}
        </Text>
        <Pressable
          onPress={handleUnlock}
          className="px-6 py-2 rounded-full"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white font-medium">Unlock Now</Text>
        </Pressable>
      </View>
    </View>
  );
}
