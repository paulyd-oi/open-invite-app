# State of the App — Frontend

## Stable
- Onboarding flow with bootstrap refresh mechanism
- Login with Better Auth (cookie session established)
- Signup with Better Auth (cookie session now established - was broken)
- Cookie storage in SecureStore (open-invite_cookie key)

## Unstable / Regressions
- None currently known

## Fixed This Session
- /api/auth/session 401 after signup - Fixed: welcome.tsx was using raw $fetch instead of authClient.signUp.email() which handles cookie establishment
- Previously fixed: React Native drops uppercase Cookie header; now using lowercase 'cookie' + credentials:'omit' + expo-origin header

## Next Priority
- Verify full signup->onboarding flow on device
- Confirm Calendar loads without logout loop after new account creation

## Last Verified
- 2026-01-24: Typecheck passes, signup cookie fix deployed
