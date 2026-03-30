import React from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { EntityAvatar } from "@/components/EntityAvatar";

interface SettingsProfileCardProps {
  avatarSource: { uri: string; headers?: { Authorization: string } } | null;
  displayName: string;
  colors: { text: string; textSecondary: string; textTertiary: string; separator: string; surface: string; background: string };
  isDark: boolean;
  themeColor: string;
  initials: string;
  onAdminUnlockTap: () => void;
  onEditProfile: () => void;
}

export function SettingsProfileCard({
  avatarSource,
  displayName,
  colors,
  isDark,
  themeColor,
  initials,
  onAdminUnlockTap,
  onEditProfile,
}: SettingsProfileCardProps) {
  return (
    <Animated.View entering={FadeInDown.delay(0).springify()} className="mx-4 mt-4">
      <View
        className="rounded-2xl p-5 flex-row items-center"
        style={{
          backgroundColor: colors.surface,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.05,
          shadowRadius: 8,
        }}
      >
        {/* Avatar: admin unlock tap target ONLY — no Edit Profile navigation */}
        <Pressable
          onPress={onAdminUnlockTap}
          className="mr-4"
        >
          <EntityAvatar
            imageSource={avatarSource}
            initials={initials}
            size={64}
            borderRadius={32}
            backgroundColor={avatarSource ? (isDark ? "#2C2C2E" : "#E5E7EB") : `${themeColor}20`}
            foregroundColor={themeColor}
            fallbackIcon="person-outline"
          />
        </Pressable>
        {/* Right side: Edit Profile navigation */}
        <Pressable
          className="flex-1 flex-row items-center"
          onPress={onEditProfile}
        >
          <View className="flex-1">
            <Text style={{ color: colors.text }} className="text-lg font-semibold">
              {displayName}
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm">Tap to edit profile</Text>
          </View>
          <Text style={{ color: colors.textTertiary }} className="text-xl">›</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
