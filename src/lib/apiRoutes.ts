export const API_ROUTES = {
  profile: {
    self: "/api/profile",
    switch: "/api/profile/switch",
    stats: "/api/profile/stats",
  },

  onboarding: {
    complete: "/api/onboarding/complete",
    checklist: "/api/onboarding/checklist",
  },

  auth: {
    signOut: "/api/auth/sign-out",
    getSession: "/api/auth/get-session",
  },

  /** Backend-signed upload flow. */
  uploads: {
    sign: "/api/uploads/sign",
    complete: "/api/uploads/complete",
  },
} as const;
