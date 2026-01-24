# Findings Log — Frontend

Purpose: Record proven discoveries, pitfalls, and rules learned during debugging.

---

## Template

### Date:
### Finding:
### Proof:
### Impact:
### Action Taken:

---

### Date: 2026-01-24
### Finding: React Native fetch silently drops uppercase 'Cookie' header
### Proof: 
- Better Auth expo client source (node_modules/@better-auth/expo/dist/client.mjs) shows:
  - Uses lowercase 'cookie' header
  - Sets credentials: 'omit' (not 'include')
  - Adds 'expo-origin' and 'x-skip-oauth-proxy' headers
  - Cookie format: "; name=value" (leading semicolon-space)
- curl with same cookie value worked (200) while app got 401
### Impact: All authenticated requests failed with 401 despite cookie being cached correctly
### Action Taken:
- Changed header from 'Cookie' to 'cookie' (lowercase)
- Changed credentials from 'include' to 'omit'
- Added expo-origin and x-skip-oauth-proxy headers
- Cookie format now matches Better Auth expo: "; name=value"
## 2026-01-24

### Finding: React Native fetch drops uppercase `Cookie` headers — Better Auth cookies must be sent using lowercase `cookie`.

### Proof:
- SecureStore contained valid `__Secure-better-auth.session_token`
- Header was being set as `Cookie:` but backend always returned 401
- Switching to lowercase `cookie:` immediately allowed `/api/auth/session` to return 200

### Impact:
All manual cookie forwarding in Expo/React Native must follow Better Auth expo client’s exact header pattern:
- lowercase `cookie`
- `credentials: "omit"`
- include `expo-origin` + `x-skip-oauth-proxy`

### Action Taken:
Updated authClient request layer to match Better Auth expo transport behavior exactly.

---

### Date: 2026-01-24
### Finding: Email signup in welcome.tsx bypassed cookie establishment
### Proof:
- welcome.tsx handleEmailAuth() used raw authClient.$fetch('/api/auth/sign-up/email')
- This bypassed captureAndStoreCookie(), refreshExplicitCookie(), verifySessionAfterAuth()
- authClient.signUp.email() method already has all this logic built in
- Signup returned 200 but next /api/auth/session returned 401 due to no cookie in SecureStore
### Impact: New account signup never established cookie session, onboarding bounced to login
### Action Taken:
- Changed welcome.tsx to use authClient.signUp.email() and authClient.signIn.email()
- Added session verification check before advancing to next onboarding step
- Error now shown to user if session fails (no auto-redirect to login)
