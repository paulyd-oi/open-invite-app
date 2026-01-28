# Frontend Invariants (Non-Negotiable)

## Tech Immutables
- Expo + React Native + Expo Router only
- Icon system fixed to src/ui/icons.tsx using Ionicons via ion()
- No lucide
- No new dependencies unless explicitly authorized
- Minimal diffs
- Navigation architecture preserved

## Auth & Logout
- Cookie/session based (Better Auth). Do not assume Bearer tokens.
- Logout sequence must remain:
  cancelQueries -> clear cache -> resetSession -> router.replace('/login')
- After logout, app must not call authenticated endpoints.

## Guidance & Onboarding
- Guidance/onboarding helper overlays MUST be scoped per-user-id.
- Keys must be user-prefixed (e.g., `openinvite.guidance.dismissed.<userId>`, `guidance:completed:<userId>:action`).
- No time-since-install heuristics to suppress guides (time-based windows reset on reinstall).
- Account switching must not leak suppression state across users.
- Logging out must not erase guidance state (unless explicit reset action exists).
- Rationale: Senior users reinstalling app should not see new-user onboarding. Multi-account support requires per-user isolation.

## Release / Production Parity
- Always PUSH FRONTEND after committing changes.
- iOS production/TestFlight shipping uses scripts/ship-ios-prod.sh (shipios alias).
