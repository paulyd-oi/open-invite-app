# State of the App — Frontend

## Stable
- Onboarding flow with bootstrap refresh mechanism
- Login with Better Auth (cookie session established)
- Signup with Better Auth (cookie session established)
- Cookie storage in SecureStore (open-invite_cookie key)
- Authed queries gated on bootStatus (no 401 spam after logout)
- /uploads/ images render without token requirement

## Unstable / Regressions
- None currently known

## Fixed This Session
- Auth state races: Authed queries (profile, friends, circles, events, workSchedule) now gated on `bootStatus === 'authed'`
- Upload image blocking: /uploads/ URLs now treated as public (no bearer token required)
- Query gating across: calendar.tsx, profile.tsx, settings.tsx, friends.tsx

## Previously Fixed
- /api/auth/session 401 after signup - Fixed: welcome.tsx now uses authClient.signUp.email()
- React Native drops uppercase Cookie header; now using lowercase 'cookie'

## Next Priority
- Manual testing: logout -> no 401 spam, switch accounts -> no data contamination
- Verify avatar images render without token errors

## Last Verified
- 2026-01-24: Typecheck passes, auth race fix deployed
