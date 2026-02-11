/**
 * Push Token Manager
 * Handles token deactivation on logout via POST /api/push/deactivate.
 *
 * MUST be called BEFORE signOut / session reset (auth cookies still valid).
 * Never throws — returns boolean indicating success.
 *
 * Tag: [P0_PUSH_TWO_ENDED]
 */

import { getStoredPushToken } from "./notifications";
import { api } from "./api";
import { devLog, devError } from "./devLog";

/**
 * POST /api/push/deactivate { token }
 * Best-effort; never throws. Returns true on 2xx, false otherwise.
 */
export async function deactivatePushToken(token: string): Promise<boolean> {
  try {
    await api.post("/api/push/deactivate", { token });
    return true;
  } catch {
    return false;
  }
}

/**
 * Deactivate current device's push token on logout.
 * Reads the stored Expo push token and calls POST /api/push/deactivate
 * while auth cookies are still present.
 *
 * Never throws — logout must not be blocked by push cleanup.
 */
export async function deactivatePushTokenOnLogout(): Promise<void> {
  try {
    const token = await getStoredPushToken();
    const hadToken = !!token;
    const tokenSuffix = token ? token.slice(-8) : null;

    devLog("[P0_PUSH_TWO_ENDED]", {
      phase: "logout_deactivate_attempt",
      tokenSuffix,
      hadToken,
    });

    if (!token) {
      devLog("[P0_PUSH_TWO_ENDED]", {
        phase: "logout_deactivate_result",
        ok: false,
        reason: "no_stored_token",
      });
      return;
    }

    const ok = await deactivatePushToken(token);

    devLog("[P0_PUSH_TWO_ENDED]", {
      phase: "logout_deactivate_result",
      ok,
      tokenSuffix,
    });
  } catch (error) {
    devError("[P0_PUSH_TWO_ENDED]", "logout deactivate error:", error);
    // Never throw — logout must succeed regardless
  }
}
