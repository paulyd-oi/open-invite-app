/**
 * Admin API Client
 * 
 * Provides admin-specific API methods with proper error handling.
 * All methods use the existing authClient pattern for consistent auth handling.
 */

import { api } from "./api";

export interface AdminMeResponse {
  isAdmin: boolean;
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
  name: string;
  description?: string;
  emoji: string;
  tier: string;
  tierColor: string;
}

export interface GrantedBadge {
  achievementId: string;
  name: string;
  emoji: string;
  tier: string;
  tierColor: string;
  grantedAt: string;
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

/**
 * Check if current user has admin privileges
 * Returns { isAdmin: false } on any error to fail safe
 */
export async function checkAdminStatus(): Promise<{ isAdmin: boolean }> {
  try {
    const response = await api.get<AdminMeResponse>("/api/admin/me");
    if (__DEV__) {
      console.log("[Admin] Status check:", response.isAdmin ? "Admin" : "Not admin");
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
 * Returns object with users array on success, throws/returns empty on auth errors
 */
export async function searchUsers(q: string): Promise<{ users: UserSearchResult[] }> {
  if (!q.trim()) {
    return { users: [] };
  }

  try {
    const response = await api.get<AdminUserSearchResponse>(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}`);
    if (__DEV__) {
      console.log(`[Admin] User search returned ${response.users.length} results for "${q}"`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      console.log("[Admin] User search failed:", error?.message);
    }
    // Safe handling for auth errors
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    return { users: [] };
  }
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