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
  name?: string;
  username?: string;
  email?: string;
  createdAt?: string;
}

export interface AdminUserSearchResponse {
  users: UserSearchResult[];
}

/**
 * Check if current user has admin privileges
 * Returns { isAdmin: false } on any error to fail safe
 */
export async function checkAdminStatus(): Promise<AdminMeResponse> {
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
 * Returns empty array on error for graceful degradation
 */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const response = await api.get<AdminUserSearchResponse>(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`);
    if (__DEV__) {
      console.log(`[Admin] User search returned ${response.users.length} results for "${query}"`);
    }
    return response.users;
  } catch (error: any) {
    if (__DEV__) {
      console.log("[Admin] User search failed:", error?.message);
    }
    return [];
  }
}