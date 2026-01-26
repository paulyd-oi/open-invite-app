/**
 * Push Notification Registration Helper
 * Centralized logic for requesting permission and registering Expo push token
 */

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api";

const PUSH_TOKEN_KEY = "expo_push_token";
const PUSH_PERMISSION_PROMPTED_KEY = "push_permission_prompted";

/**
 * Check if push permission has already been prompted
 * (to avoid prompting on cold launch)
 */
export async function hasPushPermissionBeenPrompted(): Promise<boolean> {
  try {
    const prompted = await AsyncStorage.getItem(PUSH_PERMISSION_PROMPTED_KEY);
    return prompted === "true";
  } catch {
    return false;
  }
}

/**
 * Mark that push permission has been prompted
 */
export async function markPushPermissionPrompted(): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_PERMISSION_PROMPTED_KEY, "true");
  } catch {
    // Silently fail
  }
}

/**
 * Get current notification permission status without requesting
 */
export async function getPushPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return "undetermined";
  }
}

/**
 * Set up Android notification channels
 */
async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF6B4A",
  });

  await Notifications.setNotificationChannelAsync("events", {
    name: "Events",
    description: "Notifications about events from friends",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF6B4A",
  });

  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Reminders",
    description: "Event reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#4ECDC4",
  });

  await Notifications.setNotificationChannelAsync("social", {
    name: "Social",
    description: "Friend requests and social updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#9B59B6",
  });
}

/**
 * Request push notification permission and register token with backend
 * 
 * @returns Object with success status and optional token/error
 */
export async function registerPushToken(): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  permissionStatus: "granted" | "denied" | "undetermined";
}> {
  // Mark that we've prompted for permission
  await markPushPermissionPrompted();

  // Check if we're on a physical device
  if (!Device.isDevice) {
    if (__DEV__) {
      console.log("[registerPush] Push notifications require a physical device");
    }
    return {
      success: false,
      error: "Push notifications require a physical device",
      permissionStatus: "undetermined",
    };
  }

  try {
    // Set up Android channels first
    await setupAndroidChannels();

    // Check current permission status
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    // If permission denied, update backend and return
    if (finalStatus !== "granted") {
      if (__DEV__) {
        console.log("[registerPush] Permission denied");
      }
      
      // Notify backend of denied status (fire and forget)
      api.post("/api/notifications/status", {
        pushPermissionStatus: "denied",
      }).catch(() => {});

      return {
        success: false,
        error: "Permission denied",
        permissionStatus: "denied",
      };
    }

    // Get project ID for Expo push token
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      if (__DEV__) {
        console.log("[registerPush] Project ID not found");
      }
      return {
        success: false,
        error: "Project ID not found",
        permissionStatus: "granted",
      };
    }

    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    if (__DEV__) {
      console.log("[registerPush] Got token:", token);
    }

    // Store token locally
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

    // Register token with backend
    await api.post("/api/notifications/register-token", {
      token,
      platform: "expo",
    });

    // Update backend with permission status
    await api.post("/api/notifications/status", {
      pushPermissionStatus: "granted",
    });

    if (__DEV__) {
      console.log("[registerPush] Token registered successfully");
    }

    return {
      success: true,
      token,
      permissionStatus: "granted",
    };
  } catch (error) {
    if (__DEV__) {
      console.error("[registerPush] Error:", error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      permissionStatus: "undetermined",
    };
  }
}

/**
 * Check if we should show the notification nudge
 * Returns true if:
 * - Permission is not already granted
 * - User hasn't dismissed the nudge twice already
 */
export async function shouldShowNotificationNudge(): Promise<boolean> {
  try {
    const status = await getPushPermissionStatus();
    
    // Already granted - no need to nudge
    if (status === "granted") {
      return false;
    }

    // Check nudge count (managed by NotificationNudgeModal)
    const nudgeCountKey = "notification_nudge_count";
    const count = await AsyncStorage.getItem(nudgeCountKey);
    const nudgeCount = count ? parseInt(count, 10) : 0;
    
    // Stop nudging after 2 dismissals
    return nudgeCount < 2;
  } catch {
    return true;
  }
}
