import * as Haptics from "expo-haptics";
import { authClient } from "@/lib/authClient";
import { safeToast } from "@/lib/safeToast";
import { devLog, devWarn } from "./devLog";

type FeedbackMode = "interactive" | "silent";

interface AuthFlowBaseOptions {
  feedback?: FeedbackMode;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export interface AuthFlowResult {
  success: boolean;
  error?: string;
}

export interface ResendVerificationOptions extends AuthFlowBaseOptions {
  email: string;
  name?: string | null;
}

export interface RequestPasswordResetOptions extends AuthFlowBaseOptions {
  email: string;
  redirectTo?: string;
}

export interface VerifyEmailCodeOptions extends AuthFlowBaseOptions {
  email: string;
  code: string;
}

function logAuthFlow(
  action: "resendVerification" | "requestPasswordReset" | "verifyEmailCode",
  phase: "start" | "success" | "error",
  details?: Record<string, unknown>
): void {
  const payload = details ? { action, ...details } : { action };
  if (phase === "error") {
    devWarn("[AuthFlow]", phase, payload);
    return;
  }
  devLog("[AuthFlow]", phase, payload);
}

function getAuthFlowErrorMessage(error: any, fallback: string): string {
  const candidates = [
    error?.message,
    error?.data?.message,
    error?.data?.error?.message,
    typeof error?.data?.error === "string" ? error.data.error : null,
    error?.data?.code,
    error?.response?._data?.message,
    error?.response?._data?.error?.message,
    typeof error?.response?._data?.error === "string" ? error.response._data.error : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return fallback;
}

function normalizePasswordResetError(message: string): string {
  if (message.includes("EMAIL_PROVIDER_NOT_CONFIGURED")) {
    return "Password reset is temporarily unavailable. Please contact support@openinvite.cloud";
  }
  return message;
}

function isInteractive(feedback: FeedbackMode): boolean {
  return feedback === "interactive";
}

export async function resendVerificationEmail(
  options: ResendVerificationOptions
): Promise<AuthFlowResult> {
  const {
    email,
    name,
    feedback = "interactive",
    onSuccess,
    onError,
  } = options;

  logAuthFlow("resendVerification", "start", {
    endpoint: "/api/email-verification/resend",
  });

  try {
    const data = await authClient.$fetch<{
      success?: boolean;
      error?: string;
      message?: string;
    }>("/api/email-verification/resend", {
      method: "POST",
      body: {
        email: email.toLowerCase(),
        name: name || undefined,
      },
    });

    const errorMessage =
      data.success === false
        ? data.error || data.message || "Unable to send verification email."
        : null;

    if (errorMessage) {
      logAuthFlow("resendVerification", "error", { message: errorMessage });
      if (isInteractive(feedback)) {
        if (errorMessage.includes("already verified")) {
          safeToast.info("Already Verified", "Your email is already verified.");
        } else if (
          errorMessage.includes("rate limit") ||
          errorMessage.includes("cooldown")
        ) {
          safeToast.warning("Please Wait", "Try again in a few minutes.");
        } else {
          safeToast.error("Verification Failed", errorMessage);
        }
      }
      onError?.(errorMessage);
      return { success: false, error: errorMessage };
    }

    logAuthFlow("resendVerification", "success");
    if (isInteractive(feedback)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success(
        "Email sent",
        "Check your inbox — it might take a minute to arrive."
      );
    }
    onSuccess?.();
    return { success: true };
  } catch (error: any) {
    const errorMessage = getAuthFlowErrorMessage(
      error,
      "Unable to send verification email."
    );

    logAuthFlow("resendVerification", "error", {
      message: errorMessage,
      status: error?.status ?? null,
    });

    if (isInteractive(feedback)) {
      if (errorMessage.includes("already verified")) {
        safeToast.info("Already Verified", "Your email is already verified.");
      } else if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("cooldown")
      ) {
        safeToast.warning("Please Wait", "Try again in a few minutes.");
      } else {
        safeToast.error("Verification Failed", errorMessage);
      }
    }
    onError?.(errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function requestPasswordResetEmail(
  options: RequestPasswordResetOptions
): Promise<AuthFlowResult> {
  const {
    email,
    redirectTo = "/reset-password",
    feedback = "interactive",
    onSuccess,
    onError,
  } = options;

  logAuthFlow("requestPasswordReset", "start", {
    endpoint: "/api/auth/forget-password",
  });

  try {
    await authClient.$fetch("/api/auth/forget-password", {
      method: "POST",
      body: {
        email: email.trim().toLowerCase(),
        redirectTo,
      },
    });

    logAuthFlow("requestPasswordReset", "success");
    if (isInteractive(feedback)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success(
        "Reset Email Sent",
        "Check your inbox for a password reset link."
      );
    }
    onSuccess?.();
    return { success: true };
  } catch (error: any) {
    const errorMessage = normalizePasswordResetError(
      getAuthFlowErrorMessage(error, "Unable to send reset email.")
    );

    logAuthFlow("requestPasswordReset", "error", {
      message: errorMessage,
      status: error?.status ?? null,
    });

    if (isInteractive(feedback)) {
      safeToast.error("Reset Failed", errorMessage);
    }
    onError?.(errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function verifyEmailCode(
  options: VerifyEmailCodeOptions
): Promise<AuthFlowResult> {
  const {
    email,
    code,
    feedback = "silent",
    onSuccess,
    onError,
  } = options;

  logAuthFlow("verifyEmailCode", "start", {
    endpoint: "/api/email-verification/verify",
  });

  try {
    await authClient.$fetch("/api/email-verification/verify", {
      method: "POST",
      body: {
        email: email.toLowerCase(),
        code,
      },
    });

    logAuthFlow("verifyEmailCode", "success");
    if (isInteractive(feedback)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Email verified", "You're all set.");
    }
    onSuccess?.();
    return { success: true };
  } catch (error: any) {
    const errorMessage = getAuthFlowErrorMessage(
      error,
      "Failed to verify code. Please try again."
    );

    logAuthFlow("verifyEmailCode", "error", {
      message: errorMessage,
      status: error?.status ?? null,
    });

    if (isInteractive(feedback)) {
      safeToast.error("Verification Failed", errorMessage);
    }
    onError?.(errorMessage);
    return { success: false, error: errorMessage };
  }
}
