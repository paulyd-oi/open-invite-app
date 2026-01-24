# State of the App — Frontend

## Stable
- Onboarding flow with bootstrap refresh mechanism
- Login with Better Auth (cookie session established)
- Signup with Better Auth (cookie session established)
- Cookie storage in SecureStore (open-invite_cookie key)
- Authed queries gated on bootStatus (no 401 spam after logout)
- /uploads/ images render without token requirement
- useEntitlements hook accepts enabled parameter for gating
- MiniCalendar gated on bootStatus (not !!session)
- Logout invariant log: single [LOGOUT_INVARIANT] JSON emitted with full key audit

## Unstable / Regressions
- None currently known

## Fixed This Session
- useEntitlements: Added optional `enabled` param to gate fetch on bootStatus
- MiniCalendar: Changed gating from `!!session` to `bootStatus === 'authed'`
- Logout key deletion: Enumerated SECURESTORE_AUTH_KEYS and ASYNCSTORAGE_AUTH_KEYS with consolidated [LOGOUT_INVARIANT] log

## Previously Fixed
- Auth state races: Authed queries (profile, friends, circles, events, workSchedule) now gated on `bootStatus === 'authed'`
- Upload image blocking: /uploads/ URLs now treated as public (no bearer token required)
- Query gating across: calendar.tsx, profile.tsx, settings.tsx, friends.tsx
- /api/auth/session 401 after signup - Fixed: welcome.tsx now uses authClient.signUp.email()
- React Native drops uppercase Cookie header; now using lowercase 'cookie'

## Next Priority
- Manual testing: logout -> verify [LOGOUT_INVARIANT] log shows all keys deleted
- Manual testing: switch accounts -> no data contamination
- Verify avatar images render without token errors

## Last Verified
- 2026-01-24: Typecheck passes, entitlements gating + logout invariants deployed
