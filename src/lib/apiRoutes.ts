export const API_ROUTES = {
  profile: {
    self: "/api/profile",
    switch: "/api/profile/switch",
    stats: "/api/profile/stats",
  },

  achievements: {
    list: "/api/profile/achievements",
    badge: "/api/achievements/badge",
    userBadge: (userId: string) =>
      `/api/achievements/user/${userId}/badge`,
  },

  onboarding: {
    complete: "/api/onboarding/complete",
    checklist: "/api/onboarding/checklist",
  },

  auth: {
    signOut: "/api/auth/sign-out",
    getSession: "/api/auth/get-session",
  },
} as const;
