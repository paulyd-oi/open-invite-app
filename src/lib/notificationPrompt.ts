/**
 * Notification Pre-Permission Prompt
 * 
 * Manages soft pre-permission modal shown at Aha moments:
 * - After first event created
 * - After first RSVP (Going/Interested)
 * 
 * Respects 14-day cooldown between prompts.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

const NOTIFICATION_PROMPT_ASKED_KEY = "notification_prompt_asked_at";
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Check if we should show the soft pre-permission prompt
 * Returns false if:
 * - OS permission already granted
 * - Asked in the last 14 days
 */
export async function shouldShowNotificationPrompt(): Promise<boolean> {
  try {
    // Check if OS permission already granted
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") {
      return false; // Already have permission, no need to prompt
    }

    // Check if we've asked recently (14-day cooldown)
    const askedAt = await AsyncStorage.getItem(NOTIFICATION_PROMPT_ASKED_KEY);
    if (askedAt) {
      const elapsed = Date.now() - parseInt(askedAt, 10);
      if (elapsed < COOLDOWN_MS) {
        return false; // Still in cooldown
      }
    }

    return true; // OK to show prompt
  } catch {
    return false; // Default to not showing on error
  }
}

/**
 * Mark that we've shown the soft pre-permission prompt
 */
export async function markNotificationPromptAsked(): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_PROMPT_ASKED_KEY, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Request OS notification permission
 * Returns true if granted
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}
