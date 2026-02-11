/**
 * SSOT hosting query keys — all hosting-quota React Query keys must use these.
 *
 * INVARIANT: No hardcoded hosting query keys anywhere in the codebase.
 * All hosting-related keys come from this single helper module.
 */

export const hostingKeys = {
  /** Current user's hosting quota (GET /api/hosting/quota) */
  quota: () => ["hosting", "quota"] as const,
} as const;
