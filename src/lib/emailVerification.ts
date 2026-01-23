/**
 * Email Verification Gating
 * 
 * Helper utilities for gating actions based on email verification status.
 * Unverified users can enter the app but are blocked from:
 * - Creating events
 * - RSVP/joining events
 * - Finding/searching for friends
 */

import { Alert, Linking } from "react-native";
import { router } from "expo-router";

type SessionUser = {
  id: string;
  email?: string | null;
  emailVerified?: boolean | null;
};

type Session = {
  user?: SessionUser;
} | null;

/**
 * Check if user's email is verified
 * @param session - The session object from useSession
 * @returns true if email is verified, false otherwise
 */
export function isEmailVerified(session: Session): boolean {
  return session?.user?.emailVerified === true;
}

/**
 * Show email verification required modal and handle user action
 * @param onResend - Callback when user wants to resend verification email
 * @returns Promise that resolves when dialog is dismissed
 */
export function showEmailVerificationRequired(): void {
  Alert.alert(
    "Verify your email to continue",
    "You need to verify your email address before you can do this.",
    [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Verify Email",
        onPress: () => {
          router.push("/verify-email");
        },
      },
    ]
  );
}

/**
 * Guard function that checks email verification and shows modal if needed
 * @param session - The session object from useSession
 * @returns true if action should proceed, false if blocked
 */
export function guardEmailVerification(session: Session): boolean {
  if (isEmailVerified(session)) {
    return true;
  }
  showEmailVerificationRequired();
  return false;
}
