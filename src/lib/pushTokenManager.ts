/**
 * Push Token Manager
 * Handles token deactivation on logout
 */

import { getStoredPushToken } from "./notifications";
import { api } from "./api";

/**
 * Deactivate current device's push token on logout
 * This prevents the user from receiving notifications after signing out
 */
export async function deactivatePushTokenOnLogout(): Promise<void> {
  try {
    const token = await getStoredPushToken();
    if (token) {
      await api.delete("/api/notifications/unregister-token", { token });
      console.log("[PushTokenManager] Token deactivated on logout");
    }
  } catch (error) {
    console.error("[PushTokenManager] Failed to deactivate token:", error);
    // Don't throw - logout should succeed even if token deactivation fails
  }
}
