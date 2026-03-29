/**
 * Notification Pre-Permission Prompt
 *
 * Manages soft pre-permission modal shown at Aha moments:
 * - After first RSVP (Going/Interested) — only if user has not yet created an event
 *
 * Target audience: users engaging socially (RSVP) but not yet creators.
 * Once a user creates their first event, they've crossed the creator threshold
 * and no longer need a notification nudge from the RSVP path.
 *
 * INVARIANTS (strictly enforced):
 * 1. If OS permission is granted, NEVER show prompt (even if cooldown expired)
 * 2. If user has created an event, NEVER show post-RSVP prompt
 * 3. Cooldown is USER-SCOPED (includes userId in AsyncStorage key)
 * 4. DEV logs prove every decision for debugging
 *
 * Respects 14-day cooldown between prompts per user.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { devLog } from "./devLog";

const NOTIFICATION_PROMPT_KEY_PREFIX = "notification_prompt_asked_at";
const HAS_CREATED_EVENT_KEY_PREFIX = "has_created_event";
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
 * Get the user-scoped storage key for "has created event" flag
 */
function getCreatedEventKey(userId?: string): string {
  return userId
    ? `${HAS_CREATED_EVENT_KEY_PREFIX}:${userId}`
    : HAS_CREATED_EVENT_KEY_PREFIX;
}

/**
 * Mark that this user has created at least one event.
 * Once set, post-RSVP notification prompts will no longer fire.
 */
export async function markUserHasCreatedEvent(userId?: string): Promise<void> {
  try {
    const key = getCreatedEventKey(userId);
    await AsyncStorage.setItem(key, "1");
    if (__DEV__) {
      devLog(`${LOG_PREFIX} 📝 Marked user as event creator (key=${key})`);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if user has ever created an event.
 */
async function hasUserCreatedEvent(userId?: string): Promise<boolean> {
  try {
    const key = getCreatedEventKey(userId);
    const val = await AsyncStorage.getItem(key);
    return val === "1";
  } catch {
    return false; // Default to "no" on error (allows prompt)
  }
}

/**
 * Check if we should show the soft pre-permission prompt
 *
 * INVARIANTS enforced:
 * 1. If OS permission granted → NEVER show (returns false)
 * 2. If user has created an event → NEVER show (returns false)
 * 3. If asked in last 14 days for THIS USER → don't show (returns false)
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

    // INVARIANT 2: If user has created an event, skip post-RSVP prompt
    const isCreator = await hasUserCreatedEvent(userId);
    if (isCreator) {
      if (__DEV__) {
        devLog(`${LOG_PREFIX} ❌ BLOCKED: User has created events — not in target audience (userId=${userId || 'global'})`);
      }
      return false;
    }

    // INVARIANT 3: User-scoped cooldown check
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
