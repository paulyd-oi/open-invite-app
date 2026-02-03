/**
 * Notification Pre-Permission Prompt
 * 
 * Manages soft pre-permission modal shown at Aha moments:
 * - After first event created
 * - After first RSVP (Going/Interested)
 * 
 * INVARIANTS (strictly enforced):
 * 1. If OS permission is granted, NEVER show prompt (even if cooldown expired)
 * 2. Cooldown is USER-SCOPED (includes userId in AsyncStorage key)
 * 3. DEV logs prove every decision for debugging
 * 
 * Respects 14-day cooldown between prompts per user.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { devLog } from "./devLog";

const NOTIFICATION_PROMPT_KEY_PREFIX = "notification_prompt_asked_at";
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const LOG_PREFIX = "[NOTIF_PROMPT_INVARIANT]";

/**
 * Get the user-scoped storage key for notification prompt timestamp
 */
function getPromptKey(userId?: string): string {
  return userId 
    ? `${NOTIFICATION_PROMPT_KEY_PREFIX}:${userId}` 
    : NOTIFICATION_PROMPT_KEY_PREFIX;
}

/**
 * Check if we should show the soft pre-permission prompt
 * 
 * INVARIANTS enforced:
 * 1. If OS permission granted → NEVER show (returns false)
 * 2. If asked in last 14 days for THIS USER → don't show (returns false)
 * 
 * @param userId - Required for user-scoped cooldown tracking
 * @returns true if OK to show prompt, false otherwise
 */
export async function shouldShowNotificationPrompt(userId?: string): Promise<boolean> {
  try {
    // INVARIANT 1: If OS permission already granted, NEVER show
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") {
      if (__DEV__) {
        devLog(`${LOG_PREFIX} ❌ BLOCKED: OS permission already granted (status=${status})`);
      }
      return false; // Already have permission, NEVER prompt
    }

    // INVARIANT 2: User-scoped cooldown check
    const key = getPromptKey(userId);
    const askedAt = await AsyncStorage.getItem(key);
    if (askedAt) {
      const elapsed = Date.now() - parseInt(askedAt, 10);
      const daysElapsed = Math.floor(elapsed / (24 * 60 * 60 * 1000));
      if (elapsed < COOLDOWN_MS) {
        if (__DEV__) {
          devLog(`${LOG_PREFIX} ❌ BLOCKED: In cooldown (${daysElapsed}/14 days, userId=${userId || 'global'})`);
        }
        return false; // Still in cooldown
      }
      if (__DEV__) {
        devLog(`${LOG_PREFIX} ℹ️ Cooldown expired (${daysElapsed} days elapsed)`);
      }
    }

    if (__DEV__) {
      devLog(`${LOG_PREFIX} ✅ ALLOWED: Can show notification prompt (userId=${userId || 'global'})`);
    }
    return true; // OK to show prompt
  } catch (error) {
    if (__DEV__) {
      devLog(`${LOG_PREFIX} ❌ BLOCKED: Error checking prompt status`, error);
    }
    return false; // Default to not showing on error
  }
}

/**
 * Mark that we've shown the soft pre-permission prompt (user-scoped)
 * @param userId - Required for user-scoped tracking
 */
export async function markNotificationPromptAsked(userId?: string): Promise<void> {
  try {
    const key = getPromptKey(userId);
    await AsyncStorage.setItem(key, Date.now().toString());
    if (__DEV__) {
      devLog(`${LOG_PREFIX} 📝 Marked prompt asked (key=${key})`);
    }
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
