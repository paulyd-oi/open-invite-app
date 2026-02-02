/**
 * Admin API Client
 * 
 * Provides admin-specific API methods with proper error handling.
 * All methods use the existing authClient pattern for consistent auth handling.
 */

import { api } from "./api";

export interface AdminMeResponse {
  isAdmin: boolean;
  email?: string;
  message?: string;
}

export interface UserSearchResult {
  id: string;
  email?: string | null;
  name?: string | null;
  username?: string | null;
  createdAt?: string | null;
}

export interface AdminUserSearchResponse {
  users: UserSearchResult[];
}

export interface BadgeDef {
  id: string;
  badgeKey: string;
  name: string;
  description?: string;
  emoji: string;
  tier: string;
  tierColor: string;
  isExclusive?: boolean; // true = gift/exclusive, false = public
  isActive?: boolean;
}

export interface GrantedBadge {
  achievementId: string;
  badgeKey?: string;
  name: string;
  emoji: string;
  tier: string;
  tierColor: string;
  grantedAt: string;
  note?: string;
}

export interface AdminBadgesResponse {
  badges: BadgeDef[];
}

export interface AdminUserBadgesResponse {
  badges: GrantedBadge[];
}

export interface AdminBadgeActionResponse {
  success: boolean;
  message?: string;
}

export interface CreateBadgePayload {
  badgeKey: string;
  name: string;
  description?: string;
  emoji?: string;
  tierColor: string;
  isExclusive?: boolean;
  isActive?: boolean;
}

export interface UpdateBadgePayload {
  name?: string;
  description?: string;
  emoji?: string;
  tierColor?: string;
  isExclusive?: boolean;
  isActive?: boolean;
}

export interface GrantBadgePayload {
  badgeKey: string;
  note?: string;
}

/**
 * Check if current user has admin privileges
 * Returns { isAdmin: false } on any error to fail safe
 */
export async function checkAdminStatus(): Promise<AdminMeResponse> {
  try {
    const response = await api.get<AdminMeResponse>("/api/admin/me");
    if (__DEV__) {
      console.log("[Admin] Status check:", {
        isAdmin: response.isAdmin,
        email: response.email,
        message: response.message,
      });
    }
    return response;
  } catch (error: any) {
    // Log dev-only for debugging admin endpoint issues
    if (__DEV__) {
      console.log("[Admin] Status check failed (treating as not admin):", error?.message);
    }
    return { isAdmin: false };
  }
}

/**
 * Search for users (admin-only endpoint)
 * Returns object with users array on success, throws on errors (including network errors)
 * Caller MUST handle errors to show meaningful UI feedback
 */
export async function searchUsers(q: string): Promise<{ users: UserSearchResult[] }> {
  if (!q.trim()) {
    return { users: [] };
  }

  // Require minimum 2 characters for search
  if (q.trim().length < 2) {
    return { users: [] };
  }

  const response = await api.get<AdminUserSearchResponse>(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}`);
  if (__DEV__) {
    console.log(`[Admin] User search returned ${response.users.length} results for "${q}"`);
  }
  return response;
}

/**
 * Get all available badges for admin to grant
 * Returns empty array on error for graceful degradation
 */
export async function listBadges(): Promise<{ badges: BadgeDef[] }> {
  try {
    const response = await api.get<AdminBadgesResponse>("/api/admin/badges");
    if (__DEV__) {
      console.log(`[Admin] Loaded ${response.badges.length} available badges`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      console.log("[Admin] Failed to load badges:", error?.message);
    }
    return { badges: [] };
  }
}

/**
 * Get badges currently granted to a specific user
 * Returns empty array on error
 */
export async function getUserBadges(userId: string): Promise<{ badges: GrantedBadge[] }> {
  try {
    const response = await api.get<AdminUserBadgesResponse>(`/api/admin/users/${userId}/badges`);
    if (__DEV__) {
      console.log(`[Admin] User ${userId} has ${response.badges.length} badges`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      console.log(`[Admin] Failed to load badges for user ${userId}:`, error?.message);
    }
    return { badges: [] };
  }
}

/**
 * Grant a badge to a user
 * Throws on auth errors, returns success response otherwise
 */
export async function grantUserBadge(userId: string, badgeId: string): Promise<AdminBadgeActionResponse> {
  try {
    const response = await api.post<AdminBadgeActionResponse>(`/api/admin/users/${userId}/badges`, {
      badgeId,
    });
    if (__DEV__) {
      console.log(`[Admin] Grant badge ${badgeId} to user ${userId}: ${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      console.log(`[Admin] Grant badge failed:`, error?.message);
    }
    // Re-throw auth errors for UI handling
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    return { success: false, message: "Network error - please try again" };
  }
}

/**
 * Revoke a badge from a user
 * Throws on auth errors, returns success response otherwise
 */
export async function revokeUserBadge(userId: string, badgeId: string): Promise<AdminBadgeActionResponse> {
  try {
    const response = await api.delete<AdminBadgeActionResponse>(`/api/admin/users/${userId}/badges/${badgeId}`);
    if (__DEV__) {
      console.log(`[Admin] Revoke badge ${badgeId} from user ${userId}: ${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      console.log(`[Admin] Revoke badge failed:`, error?.message);
    }
    // Re-throw auth errors for UI handling
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    return { success: false, message: "Network error - please try again" };
  }
}

/**
 * Create a new badge definition (admin-only)
 * Throws on errors for caller handling
 */
export async function createBadge(payload: CreateBadgePayload): Promise<{ success: boolean; badge?: BadgeDef; message?: string }> {
  try {
    const response = await api.post<{ success: boolean; badge?: BadgeDef; message?: string }>("/api/admin/badges", payload);
    if (__DEV__) {
      console.log(`[Admin] Create badge ${payload.badgeKey}: ${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      console.log(`[Admin] Create badge failed:`, error?.message);
    }
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    return { success: false, message: error?.message || "Failed to create badge" };
  }
}

/**
 * Update an existing badge definition (admin-only)
 * Throws on errors for caller handling
 */
export async function updateBadge(badgeKey: string, payload: UpdateBadgePayload): Promise<{ success: boolean; badge?: BadgeDef; message?: string }> {
  try {
    const response = await api.patch<{ success: boolean; badge?: BadgeDef; message?: string }>(`/api/admin/badges/${badgeKey}`, payload);
    if (__DEV__) {
      console.log(`[Admin] Update badge ${badgeKey}: ${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      console.log(`[Admin] Update badge failed:`, error?.message);
    }
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    return { success: false, message: error?.message || "Failed to update badge" };
  }
}

/**
 * Grant a badge to a user by badgeKey (admin-only)
 * This is the new endpoint that uses badgeKey instead of badgeId
 */
export async function grantBadgeByKey(userId: string, badgeKey: string, note?: string): Promise<AdminBadgeActionResponse> {
  try {
    const response = await api.post<AdminBadgeActionResponse>(`/api/admin/users/${userId}/badges/grant`, {
      badgeKey,
      note,
    });
    if (__DEV__) {
      console.log(`[Admin] Grant badge ${badgeKey} to user ${userId}: ${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      console.log(`[Admin] Grant badge by key failed:`, error?.message);
    }
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    return { success: false, message: error?.message || "Network error - please try again" };
  }
}

/**
 * Revoke a badge from a user by badgeKey (admin-only)
 * This is the new endpoint that uses badgeKey instead of badgeId
 */
export async function revokeBadgeByKey(userId: string, badgeKey: string): Promise<AdminBadgeActionResponse> {
  try {
    const response = await api.post<AdminBadgeActionResponse>(`/api/admin/users/${userId}/badges/revoke`, {
      badgeKey,
    });
    if (__DEV__) {
      console.log(`[Admin] Revoke badge ${badgeKey} from user ${userId}: ${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      console.log(`[Admin] Revoke badge by key failed:`, error?.message);
    }
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    if (error?.status === 404) {
      return { success: false, message: `This action requires backend endpoint: POST /api/admin/users/:userId/badges/revoke` };
    }
    return { success: false, message: error?.message || "Network error - please try again" };
  }
}