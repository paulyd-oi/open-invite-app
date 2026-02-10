/**
 * Shared Email Verification Resend Helper
 * 
 * Single source of truth for resending verification emails.
 * Used by:
 * - EmailVerificationBanner
 * - EmailVerificationGateModal
 * - Any future verification UX
 */

import { authClient } from "@/lib/authClient";
import { safeToast } from "@/lib/safeToast";
import * as Haptics from "expo-haptics";
import { devLog, devWarn } from "./devLog";

export interface ResendVerificationOptions {
  email: string;
  name?: string | null;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export interface ResendVerificationResult {
  success: boolean;
  error?: string;
}

/**
 * Resend verification email via Better Auth endpoint
 * 
 * @param options - Email, optional name, optional callbacks
 * @returns Result object with success flag and optional error
 */
export async function resendVerificationEmail(
  options: ResendVerificationOptions
): Promise<ResendVerificationResult> {
  const { email, name, onSuccess, onError } = options;

  const endpoint = "/api/email-verification/resend";
  devLog("[resendVerification] start", { endpoint });

  try {
    const data = await authClient.$fetch<{ 
      success?: boolean; 
      error?: string; 
      message?: string;
    }>(endpoint, {
      method: "POST",
      body: { 
        email: email.toLowerCase(),
        name: name || undefined,
      },
    });

    devLog("[resendVerification] response", { success: data.success });

    if (data.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success(
        "Email sent",
        "Check your inbox — it might take a minute to arrive."
      );
      onSuccess?.();
      return { success: true };
    } else {
      // Handle specific error cases
      let errorMessage = data.error || "Unable to send verification email.";

      if (data.error?.includes("already verified")) {
        safeToast.info("Already Verified", "Your email is already verified.");
      } else if (data.error?.includes("rate limit") || data.error?.includes("cooldown")) {
        safeToast.warning("Please Wait", "Try again in a few minutes.");
      } else {
        devWarn("[resendVerification] error", errorMessage);
        safeToast.error("Verification Failed", errorMessage);
      }

      onError?.(errorMessage);
      return { success: false, error: errorMessage };
    }
  } catch (error: any) {
    const errorMessage = error?.message || "Network error";
    devWarn("[resendVerification] exception", errorMessage);
    safeToast.error("Network Error", "Please check your connection and try again.");
    onError?.(errorMessage);
    return { success: false, error: errorMessage };
  }
}
