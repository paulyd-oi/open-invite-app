import React, { useEffect, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { devLog, devError } from "@/lib/devLog";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useSession } from "@/lib/useSession";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { ActivityFeed } from "@/components/activity/ActivityFeed";

// Key to track if we've requested notification permission on Activity tab
// P0 FIX: User-scoped key to ensure proper per-user tracking
const getActivityPermissionKey = (userId: string) => `@openinvite_activity_permission_asked_${userId}`;

export default function ActivityScreen() {
  const router = useRouter();
  const { themeColor, colors } = useTheme();
  const { data: session, isPending: sessionLoading } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const hasCheckedPermission = useRef(false);

  // P0 INVARIANT: On first Activity tab open, request notification permission only if not yet asked
  useEffect(() => {
    const userId = session?.user?.id;
    if (hasCheckedPermission.current || bootStatus !== 'authed' || !userId) {
      return;
    }
    hasCheckedPermission.current = true;

    const checkAndRequestPermission = async () => {
      const permissionKey = getActivityPermissionKey(userId);
      
      try {
        // Check if we've already asked on this device for this user
        const alreadyAsked = await AsyncStorage.getItem(permissionKey);
        if (alreadyAsked) {
          if (__DEV__) {
            devLog("[Activity] Permission already requested for user, skipping");
          }
          return;
        }

        // Check current permission status
        const { status } = await Notifications.getPermissionsAsync();
        
        if (status === "undetermined") {
          // First time - request permission
          if (__DEV__) {
            devLog("[Activity] First Activity open, requesting notification permission");
          }
          
          const { status: newStatus } = await Notifications.requestPermissionsAsync();
          
          // Mark as asked regardless of result
          await AsyncStorage.setItem(permissionKey, "true");
          
          if (__DEV__) {
            devLog("[Activity] Permission request result:", newStatus);
          }
        } else {
          // Permission already determined (granted or denied)
          // Mark as asked so we don't check again
          await AsyncStorage.setItem(permissionKey, "true");
        }
      } catch (error) {
        if (__DEV__) {
          devError("[Activity] Error checking/requesting permission:", error);
        }
      }
    };

    checkAndRequestPermission();
  }, [bootStatus, session?.user?.id]);

  // Show login prompt if not authenticated
  if (!session && !sessionLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-8">
          <Text
            className="text-xl font-semibold text-center mb-2"
            style={{ color: colors.text }}
          >
            Sign in to see notifications
          </Text>
          <Text className="text-center text-sm mb-6" style={{ color: colors.textSecondary }}>
            Stay updated with friend requests, event invites, and more.
          </Text>
          <Pressable
            onPress={() => router.replace("/login")}
            className="px-6 py-3 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      edges={["top"]}
    >
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 py-3 border-b"
        style={{ borderBottomColor: colors.separator }}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          className="w-10 h-10 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>

        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
          Activity
        </Text>

        <View className="w-10" />
      </View>

      {/* Feed content — SSOT via ActivityFeed */}
      <ActivityFeed />
    </SafeAreaView>
  );
}
