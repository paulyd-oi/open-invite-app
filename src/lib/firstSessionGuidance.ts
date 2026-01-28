/**
 * First-session guidance helper
 * 
 * Shows inline empty-state guidance ONLY:
 * - On empty states
 * - Until user completes the relevant action once (per-user)
 * - Uses per-user-id keys to persist across sessions
 * 
 * Keys stored in SecureStore:
 * - openinvite.guidance.dismissed.<userId>: whether user has seen any guidance (global dismiss)
 * - openinvite.guidance.completed.<userId>.<actionKey>: whether action was completed
 * 
 * NOTE: Time-based heuristics removed - they reset on reinstall and show guides to senior users.
 */

import * as SecureStore from "expo-secure-store";

const GUIDANCE_DISMISSED_PREFIX = "openinvite.guidance.dismissed.";
const GUIDANCE_COMPLETED_PREFIX = "openinvite.guidance.completed.";

/** Action keys for tracking completion */
export type GuidanceActionKey = "create_invite" | "join_circle" | "view_feed";

/** Current user ID for per-user scoping */
let currentUserId: string | null = null;

/**
 * Set the current user ID for per-user guidance scoping.
 * Call this when user session is established.
 */
export function setGuidanceUserId(userId: string | null): void {
  currentUserId = userId;
}

/**
 * Check if we should show empty-state guidance for a given action.
 * 
 * Returns true if:
 * - User ID is set
 * - User has not globally dismissed guidance
 * - Action has NOT been completed for this user
 */
export async function shouldShowEmptyGuidance(actionKey: GuidanceActionKey): Promise<boolean> {
  try {
    if (!currentUserId) {
      return false; // No user ID - don't show guidance
    }

    // Check if user has globally dismissed guidance
    const dismissedKey = `${GUIDANCE_DISMISSED_PREFIX}${currentUserId}`;
    const dismissed = await SecureStore.getItemAsync(dismissedKey);
    if (dismissed === "true") {
      return false;
    }

    // Check if action already completed for this user
    const completedKey = `${GUIDANCE_COMPLETED_PREFIX}${currentUserId}.${actionKey}`;
    const completed = await SecureStore.getItemAsync(completedKey);
    if (completed === "true") {
      return false;
    }

    return true;
  } catch (error) {
    // On error, don't show guidance to avoid annoying users
    return false;
  }
}

/**
 * Mark an action as completed - guidance will never show again for this action for this user.
 */
export async function markGuidanceComplete(actionKey: GuidanceActionKey): Promise<void> {
  try {
    if (!currentUserId) return;
    const completedKey = `${GUIDANCE_COMPLETED_PREFIX}${currentUserId}.${actionKey}`;
    await SecureStore.setItemAsync(completedKey, "true");
  } catch (error) {
    // Ignore errors - guidance is non-critical
  }
}

/**
 * Globally dismiss all guidance for the current user.
 * Use this for senior users or when user explicitly dismisses.
 */
export async function dismissAllGuidance(): Promise<void> {
  try {
    if (!currentUserId) return;
    const dismissedKey = `${GUIDANCE_DISMISSED_PREFIX}${currentUserId}`;
    await SecureStore.setItemAsync(dismissedKey, "true");
  } catch (error) {
    // Ignore errors - guidance is non-critical
  }
}

/**
 * Synchronous check using cached values (for use in render).
 * Must call loadGuidanceState() first to populate cache.
 */
let cachedUserId: string | null = null;
let cachedDismissed: boolean = false;
let cachedCompleted: Record<string, boolean> = {};

/**
 * Load guidance state for the current user into cache.
 * Must be called after setGuidanceUserId().
 */
export async function loadGuidanceState(): Promise<void> {
  try {
    if (!currentUserId) {
      cachedUserId = null;
      cachedDismissed = true; // No user = no guidance
      cachedCompleted = {};
      return;
    }

    cachedUserId = currentUserId;

    // Check global dismissal
    const dismissedKey = `${GUIDANCE_DISMISSED_PREFIX}${currentUserId}`;
    const dismissed = await SecureStore.getItemAsync(dismissedKey);
    cachedDismissed = dismissed === "true";

    // Load completion states for all action keys
    const actionKeys: GuidanceActionKey[] = ["create_invite", "join_circle", "view_feed"];
    cachedCompleted = {};
    for (const key of actionKeys) {
      const completedKey = `${GUIDANCE_COMPLETED_PREFIX}${currentUserId}.${key}`;
      const completed = await SecureStore.getItemAsync(completedKey);
      cachedCompleted[key] = completed === "true";
    }
  } catch (error) {
    // On error, disable guidance
    cachedDismissed = true;
    cachedCompleted = {};
  }
}

/**
 * Synchronous check for use in render functions.
 * Returns false if cache not loaded, user dismissed, or action completed.
 */
export function shouldShowEmptyGuidanceSync(actionKey: GuidanceActionKey): boolean {
  if (!cachedUserId || cachedDismissed) {
    return false; // No user or globally dismissed
  }

  if (cachedCompleted[actionKey]) {
    return false; // Already completed
  }

  return true;
}
