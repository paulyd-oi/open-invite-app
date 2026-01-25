/**
 * First-session guidance helper
 * 
 * Shows inline empty-state guidance ONLY:
 * - On empty states
 * - Within first 30 minutes of total app usage
 * - Until user completes the relevant action once
 * 
 * Keys stored in SecureStore:
 * - openinvite.firstOpenAt: timestamp of first app open
 * - openinvite.guidance.completed.<actionKey>: whether action was completed
 */

import * as SecureStore from "expo-secure-store";

const FIRST_OPEN_KEY = "openinvite.firstOpenAt";
const GUIDANCE_PREFIX = "openinvite.guidance.completed.";
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/** Action keys for tracking completion */
export type GuidanceActionKey = "create_invite" | "join_circle" | "view_feed";

/**
 * Initialize first open timestamp if not already set.
 * Call this early in app lifecycle (e.g., in _layout.tsx).
 */
export async function initFirstOpenTimestamp(): Promise<void> {
  try {
    const existing = await SecureStore.getItemAsync(FIRST_OPEN_KEY);
    if (!existing) {
      await SecureStore.setItemAsync(FIRST_OPEN_KEY, Date.now().toString());
    }
  } catch (error) {
    // Ignore errors - guidance is non-critical
  }
}

/**
 * Check if we should show empty-state guidance for a given action.
 * 
 * Returns true if:
 * - Less than 30 minutes since first open
 * - Action has NOT been completed
 */
export async function shouldShowEmptyGuidance(actionKey: GuidanceActionKey): Promise<boolean> {
  try {
    // Check if action already completed
    const completedKey = `${GUIDANCE_PREFIX}${actionKey}`;
    const completed = await SecureStore.getItemAsync(completedKey);
    if (completed === "true") {
      return false;
    }

    // Check time window
    const firstOpenStr = await SecureStore.getItemAsync(FIRST_OPEN_KEY);
    if (!firstOpenStr) {
      // First open not set yet - initialize it and show guidance
      await initFirstOpenTimestamp();
      return true;
    }

    const firstOpenAt = parseInt(firstOpenStr, 10);
    const elapsed = Date.now() - firstOpenAt;
    
    // Only show guidance within first 30 minutes
    return elapsed < THIRTY_MINUTES_MS;
  } catch (error) {
    // On error, don't show guidance to avoid annoying users
    return false;
  }
}

/**
 * Mark an action as completed - guidance will never show again for this action.
 */
export async function markGuidanceComplete(actionKey: GuidanceActionKey): Promise<void> {
  try {
    const completedKey = `${GUIDANCE_PREFIX}${actionKey}`;
    await SecureStore.setItemAsync(completedKey, "true");
  } catch (error) {
    // Ignore errors - guidance is non-critical
  }
}

/**
 * Synchronous check using cached values (for use in render).
 * Must call loadGuidanceState() first to populate cache.
 */
let cachedFirstOpenAt: number | null = null;
let cachedCompleted: Record<string, boolean> = {};

export async function loadGuidanceState(): Promise<void> {
  try {
    const firstOpenStr = await SecureStore.getItemAsync(FIRST_OPEN_KEY);
    if (firstOpenStr) {
      cachedFirstOpenAt = parseInt(firstOpenStr, 10);
    } else {
      // Initialize first open
      await initFirstOpenTimestamp();
      cachedFirstOpenAt = Date.now();
    }

    // Load completion states for all action keys
    const actionKeys: GuidanceActionKey[] = ["create_invite", "join_circle", "view_feed"];
    for (const key of actionKeys) {
      const completedKey = `${GUIDANCE_PREFIX}${key}`;
      const completed = await SecureStore.getItemAsync(completedKey);
      cachedCompleted[key] = completed === "true";
    }
  } catch (error) {
    // On error, disable guidance
    cachedFirstOpenAt = 0; // Will make elapsed > 30 minutes
    cachedCompleted = {};
  }
}

/**
 * Synchronous check for use in render functions.
 * Returns false if cache not loaded or time expired or action completed.
 */
export function shouldShowEmptyGuidanceSync(actionKey: GuidanceActionKey): boolean {
  if (cachedFirstOpenAt === null) {
    return false; // Cache not loaded
  }

  if (cachedCompleted[actionKey]) {
    return false; // Already completed
  }

  const elapsed = Date.now() - cachedFirstOpenAt;
  return elapsed < THIRTY_MINUTES_MS;
}
