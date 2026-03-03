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