// src/lib/support.ts
// SSOT for contacting support via email

import { Linking, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { safeToast } from "@/lib/safeToast";
import { devLog } from "@/lib/devLog";

const SUPPORT_EMAIL = "support@openinvite.cloud";

interface SupportParams {
  /** Optional user ID (do not include email or other PII) */
  userId?: string;
}

/**
 * Opens the user's email client with a pre-filled support request.
 * Falls back to copying the email address if mailto fails.
 */
export async function openSupportEmail(params?: SupportParams): Promise<void> {
  if (__DEV__) {
    devLog("[P0_SUPPORT] Contact support tapped");
  }

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const platform = Platform.OS === "ios" ? "iOS" : Platform.OS;

  const subject = encodeURIComponent("Open Invite Support");
  const bodyLines = [
    "Hi Open Invite Team,",
    "",
    "[Please describe your issue or question here]",
    "",
    "---",
    `App Version: ${appVersion}`,
    `Platform: ${platform}`,
  ];

  if (params?.userId) {
    bodyLines.push(`User ID: ${params.userId}`);
  }

  const body = encodeURIComponent(bodyLines.join("\n"));
  const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

  try {
    const canOpen = await Linking.canOpenURL(mailtoUrl);
    if (canOpen) {
      await Linking.openURL(mailtoUrl);
      return;
    }
  } catch {
    // Fall through to clipboard fallback
  }

  // Fallback: copy email to clipboard
  try {
    await Clipboard.setStringAsync(SUPPORT_EMAIL);
    safeToast.success("Copied!", `${SUPPORT_EMAIL} copied to clipboard`);
  } catch {
    safeToast.info("Contact Support", `Email us at ${SUPPORT_EMAIL}`);
  }
}

export { SUPPORT_EMAIL };
