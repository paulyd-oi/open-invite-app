/**
 * UpdateBanner Component
 *
 * Shows update prompts based on app-config from backend.
 * - Force modal: below min supported version (blocking, non-dismissible)
 * - Soft modal: below latest version (dismissible with 24h cooldown)
 */

import React, { useState, useEffect } from "react";
import { View, Text, Pressable, Modal, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { APP_STORE_URL } from "@/lib/config";
import * as Haptics from "expo-haptics";

// Get current app version from Expo config
const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

// 24-hour cooldown for soft update dismiss
const DISMISS_KEY = "update_modal_dismissed_at";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
  android?: {
    latestVersion: string | null;
    minSupportedVersion: string | null;
    bannerMessage: string | null;
  };
}

export function UpdateBanner() {
  const { colors, themeColor } = useTheme();
  const [dismissed, setDismissed] = useState(false);
  const [cooldownChecked, setCooldownChecked] = useState(false);

  // Check 24h cooldown on mount
  useEffect(() => {
    (async () => {
      try {
        const ts = await AsyncStorage.getItem(DISMISS_KEY);
        if (ts) {
          const elapsed = Date.now() - parseInt(ts, 10);
          if (elapsed < COOLDOWN_MS) {
            setDismissed(true);
          } else {
            await AsyncStorage.removeItem(DISMISS_KEY);
          }
        }
      } catch {}
      setCooldownChecked(true);
    })();
  }, []);

  const { data: appConfig } = useQuery<AppConfigResponse>({
    queryKey: ["app-config"],
    queryFn: () => api.get("/api/app-config"),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });

  // Get platform-specific config
  const platformConfig = Platform.OS === "ios" ? appConfig?.ios : appConfig?.android;

  const latestVersion = platformConfig?.latestVersion;
  const minVersion = platformConfig?.minSupportedVersion;

  // Determine update state
  const isBelowMin = minVersion && compareVersions(APP_VERSION, minVersion) < 0;
  const isBelowLatest = latestVersion && compareVersions(APP_VERSION, latestVersion) < 0;
  const needsUpdate = isBelowLatest && !isBelowMin;

  // App Store URL
  const storeUrl = Platform.OS === "ios"
    ? APP_STORE_URL
    : "https://play.google.com/store/apps/details?id=com.vibecode.openinvite.x0qi5wk";

  const handleUpdate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(storeUrl);
  };

  const handleDismiss = async () => {
    Haptics.selectionAsync();
    setDismissed(true);
    try {
      await AsyncStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  // Force update modal (blocking, non-dismissible)
  if (isBelowMin) {
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent>
        <View style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.75)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 28,
        }}>
          <View style={{
            width: "100%",
            maxWidth: 340,
            borderRadius: 20,
            padding: 28,
            backgroundColor: colors.surface,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 24,
            elevation: 24,
          }}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: `${themeColor}15`,
                alignItems: "center",
                justifyContent: "center",
              }}>
                <RefreshCw size={28} color={themeColor} />
              </View>
            </View>
            <Text style={{
              fontSize: 20,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 8,
              color: colors.text,
            }}>
              Update Required
            </Text>
            <Text style={{
              fontSize: 14,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 24,
              color: colors.textSecondary,
            }}>
              Please update to the latest version to continue using Open Invite.
            </Text>
            <Pressable
              onPress={handleUpdate}
              style={{
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: "center",
                backgroundColor: themeColor,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                Update Now
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // Soft update modal (dismissible with 24h cooldown)
  if (needsUpdate && !dismissed && cooldownChecked) {
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent>
        <View style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 28,
        }}>
          <View style={{
            width: "100%",
            maxWidth: 340,
            borderRadius: 20,
            padding: 28,
            backgroundColor: colors.surface,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 24,
            elevation: 24,
          }}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: `${themeColor}15`,
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Text style={{ fontSize: 28 }}>✨</Text>
              </View>
            </View>
            <Text style={{
              fontSize: 20,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 8,
              color: colors.text,
            }}>
              Update Available
            </Text>
            <Text style={{
              fontSize: 14,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 24,
              color: colors.textSecondary,
            }}>
              A new version of Open Invite is available with improvements and bug fixes.
            </Text>
            <Pressable
              onPress={handleUpdate}
              style={{
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: "center",
                backgroundColor: themeColor,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                Update Now
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDismiss}
              style={{
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: "500",
                color: colors.textTertiary,
              }}>
                Remind Me Later
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return null;
}
