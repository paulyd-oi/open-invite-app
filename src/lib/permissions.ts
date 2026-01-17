/**
 * Permission Helper
 *
 * Provides user-friendly permission request flows with explanations
 * before asking for system permissions.
 */

import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import * as ExpoCalendar from "expo-calendar";
import * as Contacts from "expo-contacts";

type PermissionType = "camera" | "photos" | "notifications" | "calendar" | "contacts";

interface PermissionConfig {
  title: string;
  message: string;
  benefit: string;
}

const PERMISSION_CONFIGS: Record<PermissionType, PermissionConfig> = {
  camera: {
    title: "Camera Access",
    message: "Open Invite would like to access your camera",
    benefit: "Take photos to share memories from events with your friends.",
  },
  photos: {
    title: "Photo Library",
    message: "Open Invite would like to access your photos",
    benefit: "Select photos from your library to add to event memories and comments.",
  },
  notifications: {
    title: "Stay in the Loop",
    message: "Open Invite would like to send you notifications",
    benefit: "Get notified when friends create events, accept your invites, or when your events are about to start.",
  },
  calendar: {
    title: "Calendar Access",
    message: "Open Invite would like to access your calendar",
    benefit: "Sync events to your device calendar so you never miss a hangout. We'll also check for conflicts when planning.",
  },
  contacts: {
    title: "Find Friends",
    message: "Open Invite would like to access your contacts",
    benefit: "Easily find and add friends who are already using Open Invite.",
  },
};

/**
 * Shows a pre-permission dialog explaining why we need the permission
 */
async function showPrePermissionDialog(type: PermissionType): Promise<boolean> {
  const config = PERMISSION_CONFIGS[type];

  return new Promise((resolve) => {
    Alert.alert(
      config.title,
      `${config.benefit}\n\n${config.message}`,
      [
        {
          text: "Not Now",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Continue",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: false }
    );
  });
}

/**
 * Shows a dialog when permission was denied, with option to open settings
 */
function showPermissionDeniedDialog(type: PermissionType): void {
  const config = PERMISSION_CONFIGS[type];

  Alert.alert(
    "Permission Required",
    `${config.title} is required for this feature. Please enable it in your device settings.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open Settings",
        onPress: () => Linking.openSettings(),
      },
    ]
  );
}

/**
 * Request camera permission with explanation
 */
export async function requestCameraPermission(): Promise<boolean> {
  // Check current status first
  const { status: currentStatus } = await ImagePicker.getCameraPermissionsAsync();

  if (currentStatus === "granted") {
    return true;
  }

  // Show pre-permission dialog
  const shouldProceed = await showPrePermissionDialog("camera");
  if (!shouldProceed) {
    return false;
  }

  // Request the actual permission
  const { status } = await ImagePicker.requestCameraPermissionsAsync();

  if (status !== "granted") {
    showPermissionDeniedDialog("camera");
    return false;
  }

  return true;
}

/**
 * Request photo library permission with explanation
 */
export async function requestPhotosPermission(): Promise<boolean> {
  const { status: currentStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();

  if (currentStatus === "granted") {
    return true;
  }

  const shouldProceed = await showPrePermissionDialog("photos");
  if (!shouldProceed) {
    return false;
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== "granted") {
    showPermissionDeniedDialog("photos");
    return false;
  }

  return true;
}

/**
 * Request notification permission with explanation
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: currentStatus } = await Notifications.getPermissionsAsync();

  if (currentStatus === "granted") {
    return true;
  }

  const shouldProceed = await showPrePermissionDialog("notifications");
  if (!shouldProceed) {
    return false;
  }

  const { status } = await Notifications.requestPermissionsAsync();

  if (status !== "granted") {
    showPermissionDeniedDialog("notifications");
    return false;
  }

  return true;
}

/**
 * Request calendar permission with explanation
 */
export async function requestCalendarPermission(): Promise<boolean> {
  const { status: currentStatus } = await ExpoCalendar.getCalendarPermissionsAsync();

  if (currentStatus === "granted") {
    return true;
  }

  const shouldProceed = await showPrePermissionDialog("calendar");
  if (!shouldProceed) {
    return false;
  }

  const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();

  if (status !== "granted") {
    showPermissionDeniedDialog("calendar");
    return false;
  }

  return true;
}

/**
 * Request contacts permission with explanation
 */
export async function requestContactsPermission(): Promise<boolean> {
  const { status: currentStatus } = await Contacts.getPermissionsAsync();

  if (currentStatus === "granted") {
    return true;
  }

  const shouldProceed = await showPrePermissionDialog("contacts");
  if (!shouldProceed) {
    return false;
  }

  const { status } = await Contacts.requestPermissionsAsync();

  if (status !== "granted") {
    showPermissionDeniedDialog("contacts");
    return false;
  }

  return true;
}

/**
 * Check if a permission is granted without requesting
 */
export async function checkPermission(type: PermissionType): Promise<boolean> {
  switch (type) {
    case "camera": {
      const { status } = await ImagePicker.getCameraPermissionsAsync();
      return status === "granted";
    }
    case "photos": {
      const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
      return status === "granted";
    }
    case "notifications": {
      const { status } = await Notifications.getPermissionsAsync();
      return status === "granted";
    }
    case "calendar": {
      const { status } = await ExpoCalendar.getCalendarPermissionsAsync();
      return status === "granted";
    }
    case "contacts": {
      const { status } = await Contacts.getPermissionsAsync();
      return status === "granted";
    }
    default:
      return false;
  }
}
