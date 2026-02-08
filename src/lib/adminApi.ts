/**
 * Admin API Client
 * 
 * Provides admin-specific API methods with proper error handling.
 * All methods use the existing authClient pattern for consistent auth handling.
 */

import { api } from "./api";
import { devLog, devWarn, devError } from "./devLog";

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

// Entitlement types
export interface UserEntitlement {
  id: string;
  entitlementKey: string;
  grantedAt: string;
  expiresAt?: string | null;
  reason?: string | null;
  grantedBy?: string | null;
}

export interface AdminEntitlementsResponse {
  entitlements: UserEntitlement[];
}

export interface AdminEntitlementActionResponse {
  success: boolean;
  message?: string;
}

/**
 * Check if current user has admin privileges
 * Returns { isAdmin: false } on any error to fail safe
 */
export async function checkAdminStatus(): Promise<AdminMeResponse> {
  try {
    const response = await api.get<AdminMeResponse>("/api/admin/me");
    if (__DEV__) {
      devLog("[P0_ADMIN_CONSOLE] checkAdminStatus:", {
        isAdmin: response.isAdmin,
        email: response.email,
        message: response.message,
      });
    }
    return response;
  } catch (error: any) {
    // Log dev-only for debugging admin endpoint issues
    if (__DEV__) {
      devLog("[P0_ADMIN_CONSOLE] checkAdminStatus FAILED (treating as not admin):", error?.message);
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
    devLog(`[P0_ADMIN_CONSOLE] searchUsers: count=${response.users.length} q="${q}"`);
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
    // Normalize: backend may return key/slug instead of badgeKey
    const normalized = (response.badges ?? []).map((b: any) => ({
      ...b,
      badgeKey: b.badgeKey || b.key || b.slug || b.id || "",
    })) as BadgeDef[];
    if (__DEV__) {
      const first = response.badges?.[0];
      devLog(`[P0_ADMIN_CONSOLE] listBadges: count=${normalized.length} rawKeysFirst=${first ? Object.keys(first).join(",") : "N/A"}`);
    }
    return { badges: normalized };
  } catch (error: any) {
    if (__DEV__) {
      devLog("[P0_ADMIN_CONSOLE] listBadges FAILED:", error?.message);
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
      devLog(`[P0_ADMIN_CONSOLE] getUserBadges: userId=${userId.substring(0,8)}... count=${response.badges.length}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] getUserBadges FAILED: userId=${userId.substring(0,8)}... error=${error?.message}`);
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
      devLog(`[P0_ADMIN_CONSOLE] grantUserBadge: userId=${userId.substring(0,8)}... badgeId=${badgeId} result=${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] grantUserBadge FAILED: error=${error?.message}`);
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
      devLog(`[P0_ADMIN_CONSOLE] revokeUserBadge: userId=${userId.substring(0,8)}... badgeId=${badgeId} result=${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] revokeUserBadge FAILED: error=${error?.message}`);
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
      devLog(`[P0_ADMIN_CONSOLE] createBadge: key=${payload.badgeKey} result=${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] createBadge FAILED: error=${error?.message}`);
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
      devLog(`[P0_ADMIN_CONSOLE] updateBadge: key=${badgeKey} result=${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] updateBadge FAILED: error=${error?.message}`);
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
      devLog(`[P0_ADMIN_CONSOLE] grantBadgeByKey: userId=${userId.substring(0,8)}... badgeKey=${badgeKey} result=${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] grantBadgeByKey FAILED: badgeKey=${badgeKey} error=${error?.message}`);
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
      devLog(`[P0_ADMIN_CONSOLE] revokeBadgeByKey: userId=${userId.substring(0,8)}... badgeKey=${badgeKey} result=${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] revokeBadgeByKey FAILED: badgeKey=${badgeKey} error=${error?.message}`);
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

// =============================================================================
// USER SUBSCRIPTION / PLAN ADMIN FUNCTIONS
// =============================================================================

/**
 * Subscription/plan info for a user as seen by admin.
 * Resilient: tries multiple field shapes the backend may return.
 */
export interface AdminUserSubscriptionInfo {
  plan: "pro" | "premium" | "free" | string;
  tier: string | null;
  isPro: boolean;
  isLifetime: boolean;
  expiresAt: string | null;
}

/**
 * Fetch a user's subscription/plan tier (admin-only).
 * Tries GET /api/admin/users/:userId first.
 * Returns best-effort parsed plan info; never throws.
 */
export async function getUserSubscriptionTier(userId: string): Promise<AdminUserSubscriptionInfo> {
  const FREE_DEFAULT: AdminUserSubscriptionInfo = { plan: "free", tier: "free", isPro: false, isLifetime: false, expiresAt: null };
  try {
    const response = await api.get<any>(`/api/admin/users/${userId}`);
    if (!response) {
      if (__DEV__) devLog(`[ADMIN_PRO_SOT] getUserSubscriptionTier: userId=${userId.substring(0,8)}... response=null (likely 404)`);
      return FREE_DEFAULT;
    }
    // Resilient field extraction — backend may nest under .user, .subscription, or flat
    const raw = response.user ?? response;
    const sub = raw.subscription ?? raw;
    const tier = sub.tier ?? sub.plan ?? sub.subscriptionTier ?? null;
    const isPro = tier === "pro" || tier === "premium" ||
      sub.isPro === true || sub.isLifetime === true;
    const isLifetime = sub.isLifetime === true;
    const expiresAt = sub.expiresAt ?? null;
    const plan = isPro ? (tier === "premium" ? "premium" : "pro") : "free";
    if (__DEV__) {
      devLog(`[ADMIN_PRO_SOT] userId=${userId.substring(0,8)}... plan=${plan} tier=${tier} computedIsPro=${isPro} isLifetime=${isLifetime} responseKeys=${Object.keys(raw).join(',')}`);
    }
    return { plan, tier, isPro, isLifetime, expiresAt };
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[ADMIN_PRO_SOT] getUserSubscriptionTier FAILED: userId=${userId.substring(0,8)}... error=${error?.message}`);
    }
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    return FREE_DEFAULT;
  }
}

// =============================================================================
// ENTITLEMENT ADMIN FUNCTIONS
// =============================================================================

/**
 * Get entitlements for a specific user (admin-only)
 * Returns empty array on error for graceful degradation
 */
export async function getUserEntitlements(userId: string): Promise<AdminEntitlementsResponse> {
  try {
    const response = await api.get<AdminEntitlementsResponse>(`/api/admin/users/${userId}/entitlements`);
    
    // api.get returns null on 404 (endpoint not deployed yet)
    if (!response) {
      if (__DEV__) {
        devLog(`[ADMIN_ENTITLEMENTS] getUserEntitlements: userId=${userId.substring(0,8)}... response=null (likely 404)`);
      }
      return { entitlements: [] };
    }
    
    // Resilient field parsing: backend may return entitlements under different keys
    const raw = response as any;
    const entitlements: UserEntitlement[] =
      raw.entitlements ?? raw.data ?? raw.items ?? (Array.isArray(raw) ? raw : []);
    
    if (__DEV__) {
      const keys = entitlements.map((e: any) => e.entitlementKey ?? e.key ?? 'unknown');
      devLog(`[ADMIN_ENTITLEMENTS] fetched count=${entitlements.length} keys=${JSON.stringify(keys)} responseShape=${Object.keys(raw).join(',')}`);
    }
    return { entitlements };
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[ADMIN_ENTITLEMENTS] getUserEntitlements FAILED: userId=${userId.substring(0,8)}... error=${error?.message}`);
    }
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    return { entitlements: [] };
  }
}

/**
 * Grant an entitlement to a user (admin-only)
 * Throws on auth errors, returns success response otherwise
 */
export async function grantEntitlement(
  userId: string,
  entitlementKey: string,
  durationDays?: number,
  reason?: string
): Promise<AdminEntitlementActionResponse> {
  try {
    const response = await api.post<AdminEntitlementActionResponse>(`/api/admin/entitlements/grant`, {
      userId,
      entitlementKey,
      durationDays,
      reason,
    });
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] grantEntitlement: userId=${userId.substring(0,8)}... entitlementKey=${entitlementKey} durationDays=${durationDays ?? 'unlimited'} result=${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] grantEntitlement FAILED: entitlementKey=${entitlementKey} error=${error?.message}`);
    }
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    if (error?.status === 404) {
      return { success: false, message: `Backend endpoint not found: POST /api/admin/entitlements/grant` };
    }
    return { success: false, message: error?.message || "Network error - please try again" };
  }
}

/**
 * Revoke an entitlement from a user (admin-only)
 * Throws on auth errors, returns success response otherwise
 */
export async function revokeEntitlement(
  userId: string,
  entitlementKey: string
): Promise<AdminEntitlementActionResponse> {
  try {
    const response = await api.post<AdminEntitlementActionResponse>(`/api/admin/entitlements/revoke`, {
      userId,
      entitlementKey,
    });
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] revokeEntitlement: userId=${userId.substring(0,8)}... entitlementKey=${entitlementKey} result=${response.success ? 'SUCCESS' : 'FAILED'}`);
    }
    return response;
  } catch (error: any) {
    if (__DEV__) {
      devLog(`[P0_ADMIN_CONSOLE] revokeEntitlement FAILED: entitlementKey=${entitlementKey} error=${error?.message}`);
    }
    if (error?.status === 401 || error?.status === 403) {
      throw error;
    }
    if (error?.status === 404) {
      return { success: false, message: `Backend endpoint not found: POST /api/admin/entitlements/revoke` };
    }
    return { success: false, message: error?.message || "Network error - please try again" };
  }
}

// =============================================================================
// REPORTS ADMIN FUNCTIONS
// =============================================================================

export interface AdminReport {
  id: string;
  eventId: string;
  eventTitle?: string;
  reason: "spam" | "inappropriate" | "safety" | "other";
  notes?: string | null;
  status: "open" | "resolved";
  reporterId?: string;
  reporterName?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  /** Event metadata (may or may not be populated by backend) */
  event?: {
    title?: string;
    date?: string;
    hostName?: string;
  } | null;
}

export interface AdminReportsListResponse {
  reports: AdminReport[];
  nextCursor?: string | null;
}

export interface AdminReportResolveResponse {
  success: boolean;
  message?: string;
}

/**
 * List event reports (admin-only)
 * GET /api/admin/reports?status=open|resolved
 */
export async function listReports(
  status: "open" | "resolved" = "open",
  cursor?: string
): Promise<AdminReportsListResponse> {
  try {
    let url = `/api/admin/reports?status=${status}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const response = await api.get<AdminReportsListResponse>(url);
    const reports: AdminReport[] = response?.reports ?? (Array.isArray(response) ? response as any : []);
    if (__DEV__) {
      devLog("[P0_ADMIN_REPORTS_UI] list loaded", { status, count: reports.length });
    }
    return { reports, nextCursor: (response as any)?.nextCursor ?? null };
  } catch (error: any) {
    if (__DEV__) {
      devError("[P0_ADMIN_REPORTS_UI] listReports FAILED:", error?.message);
    }
    if (error?.status === 401 || error?.status === 403) throw error;
    return { reports: [] };
  }
}

/**
 * Get a single report detail (admin-only)
 * GET /api/admin/reports/:reportId
 */
export async function getReport(reportId: string): Promise<AdminReport | null> {
  try {
    const response = await api.get<AdminReport>(`/api/admin/reports/${reportId}`);
    return response ?? null;
  } catch (error: any) {
    if (__DEV__) {
      devError("[P0_ADMIN_REPORTS_UI] getReport FAILED:", error?.message);
    }
    if (error?.status === 401 || error?.status === 403) throw error;
    return null;
  }
}

/**
 * Resolve a report (admin-only)
 * POST /api/admin/reports/:reportId/resolve
 */
export async function resolveReport(
  reportId: string,
  action: "dismiss" | "hide_event" = "dismiss"
): Promise<AdminReportResolveResponse> {
  try {
    const response = await api.post<AdminReportResolveResponse>(
      `/api/admin/reports/${reportId}/resolve`,
      { status: "resolved", action }
    );
    if (__DEV__) {
      devLog("[P0_ADMIN_REPORT_RESOLVE_UI] resolved", { reportId });
    }
    return response ?? { success: true };
  } catch (error: any) {
    if (__DEV__) {
      devError("[P0_ADMIN_REPORT_RESOLVE_UI] FAILED:", { reportId, message: error?.message });
    }
    if (error?.status === 401 || error?.status === 403) throw error;
    return { success: false, message: error?.message || "Network error" };
  }
}