/**
 * UpdateBanner Component
 * 
 * Shows soft/hard update prompts based on app-config from backend.
 * - Soft banner: below latest but >= min (dismissible)
 * - Force modal: below min (blocking)
 */

import React, { useState } from "react";
import { View, Text, Pressable, Modal, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import { X, RefreshCw } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import * as Haptics from "expo-haptics";

// Get current app version from Expo config
const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

// Compare semver versions: returns -1 if a < b, 0 if equal, 1 if a > b
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

interface AppConfigResponse {
  ok: boolean;
  ios?: {
    latestVersion: string | null;
    minSupportedVersion: string | null;
    bannerMessage: string | null;
  };
  nonIos?: {
    latestVersion: string | null;
    minSupportedVersion: string | null;
    bannerMessage: string | null;
  };
}

export function UpdateBanner() {
  const { colors, themeColor } = useTheme();
  const [dismissed, setDismissed] = useState(false);

  const { data: appConfig } = useQuery<AppConfigResponse>({
    queryKey: ["app-config"],
    queryFn: () => api.get("/api/app-config"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
  });

  // Get platform-specific config
  const platformConfig = Platform.OS === "ios" ? appConfig?.ios : appConfig?.nonIos;
  
  const latestVersion = platformConfig?.latestVersion;
  const minVersion = platformConfig?.minSupportedVersion;
  const bannerMessage = platformConfig?.bannerMessage;

  // Determine update state
  const isBelowMin = minVersion && compareVersions(APP_VERSION, minVersion) < 0;
  const isBelowLatest = latestVersion && compareVersions(APP_VERSION, latestVersion) < 0;
  const needsUpdate = isBelowLatest && !isBelowMin;

  // App Store URL - will be replaced with actual IDs in production
  const storeUrl = Platform.OS === "ios"
    ? "https://apps.apple.com/us/app/open-invite-social-calendar/id6757429210"
    : "https://play.google.com/store/apps/details?id=com.openinvite.app";

  const handleUpdate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(storeUrl);
  };

  const handleDismiss = () => {
    Haptics.selectionAsync();
    setDismissed(true);
  };

  // Force update modal (blocking)
  if (isBelowMin) {
    return (
      <Modal visible transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center px-6">
          <View
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ backgroundColor: colors.surface }}
          >
            <View className="items-center mb-4">
              <RefreshCw size={48} color={themeColor} />
            </View>
            <Text
              className="text-2xl font-bold text-center mb-2"
              style={{ color: colors.text }}
            >
              Update Required
            </Text>
            <Text
              className="text-base text-center mb-6"
              style={{ color: colors.textSecondary }}
            >
              {bannerMessage || "Please update to the latest version to continue using the app."}
            </Text>
            <Pressable
              onPress={handleUpdate}
              className="py-4 rounded-full items-center"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white text-lg font-semibold">Update Now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // Soft update banner (dismissible)
  if (needsUpdate && !dismissed) {
    return (
      <View
        className="mx-4 mt-2 mb-1 rounded-xl px-4 py-3 flex-row items-center"
        style={{ backgroundColor: `${themeColor}15`, borderWidth: 1, borderColor: themeColor }}
      >
        <RefreshCw size={18} color={themeColor} />
        <Text className="flex-1 ml-3 text-sm" style={{ color: colors.text }}>
          {bannerMessage || "A new version is available!"}
        </Text>
        <Pressable
          onPress={handleUpdate}
          className="px-3 py-1.5 rounded-full mr-2"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white text-xs font-semibold">Update</Text>
        </Pressable>
        <Pressable onPress={handleDismiss} className="p-1">
          <X size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
    );
  }

  return null;
}
