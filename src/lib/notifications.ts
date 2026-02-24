// Push Notifications Service
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog, devWarn, devError } from "./devLog";

const PUSH_TOKEN_KEY = "expo_push_token";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and get the Expo push token
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  let token: string | undefined;

  // Set up notification channels (non-iOS only)
  if (Platform.OS !== "ios") {
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

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      if (__DEV__) {
        devLog("Push notification permission not granted");
      }
      return undefined;
    }

    try {
      // INVARIANT: Prefer easConfig.projectId (set in eas.json), fallback to expoConfig.extra
      // Uses 3-level fallback chain for maximum compatibility across build configurations
      const projectId =
        Constants?.easConfig?.projectId ??
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.expoConfig?.extra?.projectId;

      if (!projectId) {
        if (__DEV__) {
          devLog("Project ID not found - push notifications may not work in development");
        }
        return undefined;
      }

      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (__DEV__) {
        devLog("Push token:", token.substring(0, 30) + "...");
      }

      // Store the token locally
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    } catch (error) {
      if (__DEV__) {
        devError("Error getting push token:", error);
      }
    }
  } else {
    if (__DEV__) {
      devLog("Push notifications require a physical device");
    }
  }

  return token;
}

/**
 * Get the stored push token
 */
export async function getStoredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY);
}

/**
 * Get current notification permission status without requesting
 * Returns: 'granted' | 'denied' | 'undetermined'
 */
export async function getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch (error) {
    devLog('[Push] Error checking permission status:', error);
    return 'undetermined';
  }
}

/**
 * Request notification permissions
 * Returns true if granted
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    
    if (existingStatus === 'granted') {
      return true;
    }
    
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    devLog('[Push] Error requesting permission:', error);
    return false;
  }
}

/**
 * Schedule a local notification
 */
export async function scheduleLocalNotification({
  title,
  body,
  data,
  trigger,
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  trigger: Notifications.NotificationTriggerInput;
}): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger,
  });
}

/**
 * Schedule an event reminder
 */
export async function scheduleEventReminder({
  eventId,
  eventTitle,
  eventEmoji,
  eventTime,
  reminderMinutesBefore,
}: {
  eventId: string;
  eventTitle: string;
  eventEmoji: string;
  eventTime: Date;
  reminderMinutesBefore: number;
}): Promise<string | null> {
  const reminderTime = new Date(eventTime.getTime() - reminderMinutesBefore * 60 * 1000);

  // Don't schedule if the reminder time has already passed
  if (reminderTime <= new Date()) {
    return null;
  }

  const notificationId = await scheduleLocalNotification({
    title: `${eventEmoji} ${eventTitle}`,
    body: reminderMinutesBefore >= 60
      ? `Starting in ${Math.round(reminderMinutesBefore / 60)} hour${reminderMinutesBefore >= 120 ? "s" : ""}`
      : `Starting in ${reminderMinutesBefore} minutes`,
    data: { eventId, type: "event_reminder" },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderTime,
      channelId: "reminders",
    },
  });

  // Store the notification ID for potential cancellation
  const remindersJson = await AsyncStorage.getItem("event_reminders") ?? "{}";
  const reminders = JSON.parse(remindersJson);
  reminders[eventId] = reminders[eventId] ?? [];
  reminders[eventId].push(notificationId);
  await AsyncStorage.setItem("event_reminders", JSON.stringify(reminders));

  return notificationId;
}

/**
 * Cancel all reminders for an event
 */
export async function cancelEventReminders(eventId: string): Promise<void> {
  const remindersJson = await AsyncStorage.getItem("event_reminders") ?? "{}";
  const reminders = JSON.parse(remindersJson);

  if (reminders[eventId]) {
    for (const notificationId of reminders[eventId]) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    }
    delete reminders[eventId];
    await AsyncStorage.setItem("event_reminders", JSON.stringify(reminders));
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.removeItem("event_reminders");
}

/**
 * Get all scheduled notifications
 */
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear badge
 */
export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}
