/**
 * AnnouncementBanner Component
 * 
 * Shows server-driven announcement banners.
 * - Fetches config from /api/app-config (shared query with UpdateBanner)
 * - Dismissal is user-scoped AND message-scoped (new message = new banner)
 * - Optional CTA button navigates to a route
 * 
 * INVARIANTS:
 * - If announcement.enabled is false -> never show
 * - If message is empty -> never show
 * - If user already dismissed this message -> never show
 * - Dismissal key: announcement_dismissed:{userId}:{messageHash}
 */

import React, { useState, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { X, Megaphone } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import * as Haptics from "expo-haptics";

const LOG_PREFIX = "[ANNOUNCEMENT_BANNER]";

/**
 * Simple hash function for message-scoped dismissal
 * No deps, just basic string to number hash
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex string, take last 8 chars
  return Math.abs(hash).toString(16).slice(-8);
}

interface AnnouncementConfig {
  enabled: boolean;
  message: string;
  ctaText?: string;
  ctaRoute?: string;
  dismissible: boolean;
}

interface AppConfigResponse {
  ok: boolean;
  announcement?: AnnouncementConfig;
}

export function AnnouncementBanner() {
  const { colors, themeColor } = useTheme();
  const { data: session } = useSession();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [dismissChecked, setDismissChecked] = useState(false);

  // Reuse the same query key as UpdateBanner for efficiency
  const { data: appConfig } = useQuery<AppConfigResponse>({
    queryKey: ["app-config"],
    queryFn: () => api.get("/api/app-config"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
  });

  const announcement = appConfig?.announcement;
  const userId = session?.user?.id;

  // Check dismissal status on mount when we have config and userId
  useEffect(() => {
    if (!announcement?.message || !userId || dismissChecked) return;

    const checkDismissed = async () => {
      const messageHash = simpleHash(announcement.message);
      const dismissKey = `announcement_dismissed:${userId}:${messageHash}`;
      
      try {
        const value = await AsyncStorage.getItem(dismissKey);
        if (value === "true") {
          if (__DEV__) {
            console.log(`${LOG_PREFIX} Already dismissed (key=${dismissKey})`);
          }
          setDismissed(true);
        }
      } catch {
        // Ignore storage errors
      }
      setDismissChecked(true);
    };

    checkDismissed();
  }, [announcement?.message, userId, dismissChecked]);

  const handleDismiss = async () => {
    Haptics.selectionAsync();
    setDismissed(true);

    if (!announcement?.message || !userId) return;

    const messageHash = simpleHash(announcement.message);
    const dismissKey = `announcement_dismissed:${userId}:${messageHash}`;
    
    try {
      await AsyncStorage.setItem(dismissKey, "true");
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Dismissed (key=${dismissKey})`);
      }
    } catch {
      // Ignore storage errors
    }
  };

  const handleCtaPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (announcement?.ctaRoute) {
      router.push(announcement.ctaRoute as any);
    }
  };

  // INVARIANT: Don't show if not enabled
  if (!announcement?.enabled) {
    return null;
  }

  // INVARIANT: Don't show if message empty
  if (!announcement.message.trim()) {
    return null;
  }

  // INVARIANT: Don't show if no userId (can't track dismissal)
  if (!userId) {
    return null;
  }

  // Wait for dismiss check to complete
  if (!dismissChecked) {
    return null;
  }

  // INVARIANT: Don't show if dismissed
  if (dismissed) {
    return null;
  }

  if (__DEV__) {
    console.log(`${LOG_PREFIX} Showing banner: "${announcement.message.substring(0, 30)}..."`);
  }

  return (
    <View
      className="mx-4 mt-2 mb-1 rounded-xl px-4 py-3 flex-row items-center"
      style={{ 
        backgroundColor: `${themeColor}15`, 
        borderWidth: 1, 
        borderColor: `${themeColor}40` 
      }}
    >
      <Megaphone size={18} color={themeColor} />
      <Text 
        className="flex-1 ml-3 text-sm" 
        style={{ color: colors.text }}
        numberOfLines={2}
      >
        {announcement.message}
      </Text>
      
      {/* CTA Button (optional) */}
      {announcement.ctaText && announcement.ctaRoute && (
        <Pressable
          onPress={handleCtaPress}
          className="px-3 py-1.5 rounded-full mr-2"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white text-xs font-semibold">
            {announcement.ctaText}
          </Text>
        </Pressable>
      )}
      
      {/* Dismiss Button (if dismissible) */}
      {announcement.dismissible && (
        <Pressable onPress={handleDismiss} className="p-1">
          <X size={18} color={colors.textTertiary} />
        </Pressable>
      )}
    </View>
  );
}
