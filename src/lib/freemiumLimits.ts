// freemiumLimits.ts
// Referral reward tiers for Open Invite.
// Only REFERRAL_TIERS from this file is actively used (1 import site: settings.tsx).
//
// Canonical subscription SSOT lives in:
//   - Runtime enforcement: src/lib/entitlements.ts (reads /api/entitlements)
//   - Subscription hook:   src/lib/useSubscription.ts (reads /api/subscription)

// ============================================
// REFERRAL REWARD TIERS (v3.0)
// ============================================

export const REFERRAL_TIERS = {
  MONTH_PRO: {
    count: 3,
    type: "month_pro",
    durationDays: 30,
    label: "1 Month Pro",
  },
  YEAR_PRO: {
    count: 10,
    type: "year_pro",
    durationDays: 365,
    label: "1 Year Pro",
  },
  LIFETIME_PRO: {
    count: 40,
    type: "lifetime_pro",
    durationDays: null, // Lifetime
    label: "Lifetime Pro",
  },
} as const;
