# Known Good Log Lines — Production Signatures

Expected log signatures for successful operations. No secrets included.

---

## 1. Successful Cookie Capture After Login

```
[refreshExplicitCookie] SUCCESS
[refreshExplicitCookie] Cached cookie length: 120+
```

**When:** After login/signup, before onboarding continues  
**Meaning:** Better Auth session cookie successfully stored in SecureStore  
**Next:** App should advance to onboarding or authed state

---

## 2. Successful Bootstrap (Authed User)

```
[Bootstrap] Step 1/6: Checking for cached session
[Bootstrap] Step 2/6: Session exists, verifying with backend
[Bootstrap] ✅ Session valid
[Bootstrap] Step 4/6: Fetching user profile
[Bootstrap] Step 5/6: Setting bootStatus to 'authed'
[Bootstrap] ✅ Bootstrap complete: authed
```

**When:** App launch with valid session  
**Meaning:** User authenticated, profile loaded, ready to show authed screens  
**Next:** Navigation to /calendar or last known route

---

## 3. Successful Bootstrap (Logged Out)

```
[Bootstrap] Step 1/6: Checking for cached session
[Bootstrap] No session found
[Bootstrap] Step 5/6: Setting bootStatus to 'loggedOut'
[Bootstrap] ✅ Bootstrap complete: loggedOut
```

**When:** App launch without session  
**Meaning:** No cached session, user needs to log in  
**Next:** Navigation to /login

---

## 4. Successful Logout with Key Deletion

```json
[LOGOUT_INVARIANT] {
  "keysDeleted": [
    "ss:open-invite.session-token",
    "ss:open-invite_cookie",
    "ss:open-invite_session",
    "as:session_cache_v1",
    "as:onboarding_completed",
    "mem:sessionCache"
  ],
  "keysFailed": [],
  "verifyCleared": [
    "open-invite.session-token",
    "open-invite_cookie"
  ],
  "verifyRemaining": [],
  "explicitCookieCacheCleared": true,
  "hasAuthTokenAfter": false,
  "success": true
}
```

**When:** User taps logout  
**Meaning:** All auth keys deleted, session cleared  
**Next:** Navigation to /login, no stale data

---

## 5. Successful Onboarding Step Advance

```
[OnboardingWelcome] Advancing to photo step
[OnboardingPhoto] User uploaded avatar
[OnboardingPhoto] Checking onboarding completion
[Bootstrap] Refresh requested due to onboarding completion
[Bootstrap] ✅ Bootstrap complete: authed
```

**When:** User completes onboarding photo step  
**Meaning:** Onboarding finished, profile complete  
**Next:** Navigation to /calendar, app ready for normal use

---

## 6. Successful Calendar Data Fetch

```
[useWorkSchedule] Enabled: true (bootStatus=authed)
[useWorkSchedule] Fetching work schedule
[useWorkSchedule] Success: 7 events loaded
```

**When:** Calendar screen loads while authed  
**Meaning:** Work schedule data fetched successfully  
**Next:** Calendar renders with events

---

## 7. Successful Entitlements Fetch

```
[useEntitlements] Enabled: true (bootStatus=authed)
[useEntitlements] Fetching entitlements
[useEntitlements] Success: {canCreateCircles: true, maxCircles: 5}
```

**When:** Any screen using entitlements hook  
**Meaning:** User's feature flags loaded  
**Next:** UI adapts based on entitlements

---

## 8. No 401 Spam After Logout (Expected)

```
[Bootstrap] Step 2/6: Session exists, verifying with backend
[Bootstrap] /api/auth/session returned 401 (expected - no session)
[Bootstrap] Step 5/6: Setting bootStatus to 'loggedOut'
```

**When:** Bootstrap runs after logout  
**Meaning:** One expected 401 from session check, no other 401s  
**Anti-pattern:** Multiple 401s from profile/friends/circles = bug

---

## 9. Successful Avatar Upload

```
[OnboardingPhoto] Selected image URI: file://...
[OnboardingPhoto] Uploading to /api/profile/avatar
[OnboardingPhoto] Upload success: /uploads/avatars/xyz.jpg
[OnboardingPhoto] Advancing to next step
```

**When:** User uploads avatar during onboarding  
**Meaning:** Image uploaded, stored, URL saved  
**Next:** Avatar shows in profile, onboarding continues

---

## 10. React Query Cache Invalidation

```
[resetSession] Clearing React Query cache
[resetSession] Cache cleared: 12 queries invalidated
```

**When:** Logout or account switch  
**Meaning:** All cached data removed, no contamination  
**Next:** Next user sees only their data

---

## Anti-Patterns (BAD — Should NOT See These)

| Log Line | Problem | Fix |
|----------|---------|-----|
| `401: /api/profile` after logout | Query not gated on bootStatus | Gate on `bootStatus === 'authed'` |
| `[Logout] ⚠️ Token still exists after reset` | Key deletion failed | Check LOGOUT_INVARIANT for keysFailed |
| `keysFailed: ["ss:..."]` in LOGOUT_INVARIANT | SecureStore delete error | Investigate storage permissions |
| Multiple 401s during transition | Race condition | Ensure all queries gated on bootStatus |
| `[Bootstrap] Timeout after 15s` | Bootstrap hung | Check network, backend availability |

---

## Debug Mode Logs (DEV Only)

```
[authTrace] resetSession:afterDeleteVerify {secureStoreTokenExists: false}
[authTrace] bootstrap:sessionValid {hasSession: true, userId: 123}
```

**When:** `__DEV__` mode enabled  
**Meaning:** Extra diagnostic output for debugging  
**Production:** These logs stripped out

---

## Log Prefixes Reference

| Prefix | Component | Purpose |
|--------|-----------|---------|
| `[Bootstrap]` | authBootstrap.ts | App launch auth flow |
| `[refreshExplicitCookie]` | authClient.ts | Cookie capture/storage |
| `[LOGOUT_INVARIANT]` | authBootstrap.ts | Logout key deletion audit |
| `[authTrace]` | authBootstrap.ts | Debug mode only |
| `[OnboardingPhoto]` | onboarding screens | Photo step |
| `[useWorkSchedule]` | calendar.tsx | Work schedule query |
| `[useEntitlements]` | entitlements.ts | Feature flags |

See also:
- [docs/AUTH_CONTRACT.md](AUTH_CONTRACT.md) — Auth laws
- [docs/FINDINGS_LOG.md](FINDINGS_LOG.md) — Historical bugs and fixes
