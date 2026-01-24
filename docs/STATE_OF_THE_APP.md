# State of the App — Frontend

## Stable
- Onboarding flow with bootstrap refresh mechanism
- Login/signup with Better Auth
- Cookie storage in SecureStore (open-invite_cookie key)

## Unstable / Regressions
- /api/auth/session 401 - Fixed: React Native drops uppercase Cookie header; now using lowercase 'cookie' + credentials:'omit' + expo-origin header (matching Better Auth expo client pattern)

## Next Priority
- Verify session fetch works after sign-in on device
- Confirm Calendar loads without logout loop

## Last Verified
- 2026-01-24: Typecheck passes, cookie header fix deployed
