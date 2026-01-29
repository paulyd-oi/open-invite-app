/**
 * profileDisplay.ts
 * Centralized profile display logic to ensure consistent precedence across the app.
 * 
 * Precedence (from P0 Profile Persistence Fix):
 * - Display Name: profile.name → user.name → session.displayName → session.name → fallback
 * - Avatar: profile.avatarUrl → user.image → session.image → undefined
 */

import type { GetProfileResponse } from "@/shared/contracts";

interface SessionUser {
  name?: string | null;
  displayName?: string | null;
  image?: string | null;
  email?: string | null;
}

interface ProfileDisplayOptions {
  profileData?: GetProfileResponse | null;
  session?: { user?: SessionUser | null } | null;
  fallbackName?: string;
  includeEmailPrefix?: boolean;
}

export interface ProfileDisplay {
  displayName: string;
  avatarUri: string | undefined;
}

/**
 * Get display name and avatar URI with consistent precedence.
 * 
 * @param options - Profile data, session, and optional overrides
 * @returns Display name (string) and avatar URI (string | undefined)
 */
export function getProfileDisplay(options: ProfileDisplayOptions): ProfileDisplay {
  const {
    profileData,
    session,
    fallbackName = "Account",
    includeEmailPrefix = true,
  } = options;

  const user = session?.user ?? null;

  // Display Name Precedence:
  // 1. profileData.profile.name (may not be in schema, but we patch it in cache)
  // 2. profileData.user.name (backend storage)
  // 3. session.user.displayName
  // 4. session.user.name
  // 5. Email prefix (if enabled)
  // 6. Fallback
  const displayName = (
    (profileData?.profile as any)?.name ||
    profileData?.user?.name ||
    user?.displayName?.trim() ||
    user?.name?.trim() ||
    (includeEmailPrefix && user?.email ? user.email.split("@")[0] : null) ||
    fallbackName
  );

  // Avatar URI Precedence:
  // 1. profileData.profile.avatarUrl
  // 2. profileData.user.image
  // 3. session.user.image
  // 4. undefined (will show initials)
  const avatarUri = (
    profileData?.profile?.avatarUrl ||
    profileData?.user?.image ||
    user?.image ||
    undefined
  );

  return {
    displayName,
    avatarUri,
  };
}

/**
 * Get the first character for avatar initials, respecting precedence.
 * 
 * @param options - Same as getProfileDisplay
 * @returns First character of name or email, or "?"
 */
export function getProfileInitial(options: ProfileDisplayOptions): string {
  const { profileData, session } = options;
  const user = session?.user ?? null;

  // Same precedence as displayName, but just get first char
  const name = (
    (profileData?.profile as any)?.name ||
    profileData?.user?.name ||
    user?.displayName ||
    user?.name ||
    user?.email
  );

  return name?.[0]?.toUpperCase() ?? "?";
}

/**
 * Compute a display label for UI rendering WITHOUT persisting to profile.
 * Use this for showing a name in UI when the actual displayName might be empty.
 * 
 * Precedence:
 * 1. displayName (user-entered, persisted)
 * 2. username/handle (with @ prefix)
 * 3. email local-part (before @)
 * 4. "Friend" (fallback)
 * 
 * IMPORTANT: This is for RENDER ONLY - never write this value back to profile.
 * 
 * @param user - User object with optional name, handle, email fields
 * @returns Display label string (never empty)
 */
export function computeDisplayLabel(user: {
  name?: string | null;
  displayName?: string | null;
  handle?: string | null;
  email?: string | null;
} | null | undefined): string {
  // Check for persisted displayName first
  const persistedName = user?.displayName?.trim() || user?.name?.trim();
  if (persistedName) {
    return persistedName;
  }

  // DEV: Log when fallback is used (helps trace why email local-part appears)
  if (__DEV__ && (user?.handle || user?.email)) {
    console.log("[DISPLAYNAME_FALLBACK_BLOCKED] No persisted name, using fallback for display only");
  }

  // Fallback: handle with @ prefix
  if (user?.handle?.trim()) {
    return `@${user.handle.trim()}`;
  }

  // Fallback: email local-part
  if (user?.email?.trim()) {
    return user.email.split("@")[0] || "Friend";
  }

  return "Friend";
}
