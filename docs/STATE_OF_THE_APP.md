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
- First-session inline guidance: time-gated (30 min) empty-state hints

## Unstable / Regressions
- None currently known

## Fixed This Session
- First-session guidance: Added `src/lib/firstSessionGuidance.ts` with 30-minute time window
- Empty states updated: calendar.tsx, circles.tsx, social.tsx show inline guidance text
- Guidance completion: create.tsx marks `create_invite`, circles.tsx marks `join_circle`

## Previously Fixed
- useEntitlements: Added optional `enabled` param to gate fetch on bootStatus
- MiniCalendar: Changed gating from `!!session` to `bootStatus === 'authed'`
- Logout key deletion: Enumerated SECURESTORE_AUTH_KEYS and ASYNCSTORAGE_AUTH_KEYS with consolidated [LOGOUT_INVARIANT] log
- Auth state races: Authed queries (profile, friends, circles, events, workSchedule) now gated on `bootStatus === 'authed'`
- Upload image blocking: /uploads/ URLs now treated as public (no bearer token required)
- Query gating across: calendar.tsx, profile.tsx, settings.tsx, friends.tsx
- /api/auth/session 401 after signup - Fixed: welcome.tsx now uses authClient.signUp.email()
- React Native drops uppercase Cookie header; now using lowercase 'cookie'

## Next Priority
- Manual testing: verify first-session guidance shows only within 30 minutes
- Manual testing: verify guidance disappears after user creates invite/circle

## Last Verified
- 2026-01-24: Typecheck PASS, scripts/ai/verify_frontend.sh PASS

