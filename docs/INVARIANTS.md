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

## Release / Production Parity
- Always PUSH FRONTEND after committing changes.
- iOS production/TestFlight shipping uses scripts/ship-ios-prod.sh (shipios alias).
