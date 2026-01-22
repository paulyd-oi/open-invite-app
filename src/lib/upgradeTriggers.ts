/**
 * Upgrade Trigger Helpers
 * 
 * Session-scoped tracking for upgrade prompts to prevent spam
 * Each trigger type has separate tracking
 */

// Session tracking for each trigger type
let triggerShownThisSession: Record<string, boolean> = {};

export type UpgradeTrigger = 
  | "poll_attempt"
  | "nudge_attempt"
  | "templates_attempt"
  | "soft_limit_active_events";

/**
 * Check if a specific trigger has been shown this session
 */
export function hasTriggerBeenShown(trigger: UpgradeTrigger): boolean {
  return !!triggerShownThisSession[trigger];
}

/**
 * Mark a trigger as shown for this session
 */
export function markTriggerShown(trigger: UpgradeTrigger): void {
  triggerShownThisSession[trigger] = true;
}

/**
 * Reset all trigger tracking (call on logout/app foreground)
 */
export function resetTriggerTracking(): void {
  triggerShownThisSession = {};
}

/**
 * Check if we should show an upgrade prompt for a trigger
 * Returns false if already shown this session (anti-spam)
 */
export function shouldShowUpgradePrompt(trigger: UpgradeTrigger, isPremium: boolean): boolean {
  if (isPremium) return false; // Never show to premium users
  if (hasTriggerBeenShown(trigger)) return false; // Already shown this session
  return true;
}
