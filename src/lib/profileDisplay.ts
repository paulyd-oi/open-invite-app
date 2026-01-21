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
