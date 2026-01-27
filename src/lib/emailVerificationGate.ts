/**
 * Email Verification Gate Helper
 * 
 * Manages show-once blocking modal logic and action-level intercepts.
 * Users must verify email to create events or add friends.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeToast } from "@/lib/safeToast";

// Type for session data
type SessionData = {
  user?: {
    id: string;
    name?: string | null;
    displayName?: string | null;
    handle?: string | null;
    image?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
} | null;

const GATE_MODAL_PREFIX = "email_verification_gate_shown:";

/**
 * Check if the blocking modal has already been shown for this user
 */
export async function hasShownGateModal(userId: string): Promise<boolean> {
  try {
    const key = `${GATE_MODAL_PREFIX}${userId}`;
    const value = await AsyncStorage.getItem(key);
    return value === "true";
  } catch {
    return false;
  }
}

/**
 * Mark the blocking modal as shown for this user
 */
export async function markGateModalShown(userId: string): Promise<void> {
  try {
    const key = `${GATE_MODAL_PREFIX}${userId}`;
    await AsyncStorage.setItem(key, "true");
  } catch (error) {
    console.warn("[EmailGate] Failed to mark modal shown:", error);
  }
}

/**
 * Guard function for gated actions.
 * Returns true if allowed to proceed, false otherwise.
 * Shows inline toast if blocked.
 * 
 * @param session - Current user session
 * @param showToast - If true, shows a toast explaining the block (default: true)
 * @returns true if email is verified, false otherwise
 */
export function guardEmailVerification(
  session: SessionData,
  showToast: boolean = true
): boolean {
  if (!session?.user) {
    if (showToast) {
      safeToast.warning("Sign In Required", "Please sign in first.");
    }
    return false;
  }

  if (session.user.emailVerified === false) {
    if (showToast) {
      safeToast.warning(
        "Verify your email to use this feature",
        "Check your inbox or tap Resend email in the verification banner."
      );
    }
    return false;
  }

  return true;
}

/**
 * Check if email verification gate is currently active for user
 * (i.e., user is logged in but email not verified)
 */
export function isEmailGateActive(session: SessionData): boolean {
  return !!session?.user && session.user.emailVerified === false;
}
