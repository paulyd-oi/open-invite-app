# Findings Log — Frontend

## Friend Profile UX Pattern (Canonical)

- **Tab order principle**: Information hierarchy = Bio → Calendar → Groups → Notes → Open Invites
- **Calendar prominence**: Friend availability (calendar) shown early (position 2) for scheduling context
- **Notes as reference**: Personal notes demoted to position 4 (utility vs primary information)
- **Groups central**: Shared groups remain position 3 as key relationship context
- **Actions last**: Open Invites (action-oriented) stay last to separate discovery from reference
- **Animation flow**: Progressive delays (15ms → 25ms → 50ms) for smooth visual entrance

## Auth Contract (Canonical)

- Authenticated API calls must use the Better Auth session cookie: `__Secure-better-auth.session_token`.
- In React Native/Expo, the cookie header must be sent as lowercase `cookie` (uppercase `Cookie` can be dropped).
- Authed React Query calls must be gated on `bootStatus === 'authed'` (not `!!session`) to prevent 401 storms during transitions.
- **Subscription query gating**: `useSubscription` query must be gated with `enabled: bootStatus === 'authed'` to prevent post-logout 401s.
- **Email verification toast throttling**: `guardEmailVerification` throttles toasts to max 1 per 3 seconds to prevent spam.
- **API 401/403 logging**: Use `console.log` (not `console.error`) for expected auth failures to avoid red console overlays in DEV.
- **Session persistence on cold start**: `ensureCookieInitialized()` MUST be awaited before `bootstrapAuth()` to prevent race condition where API call fires before cookie is loaded from SecureStore.
- **Single authority for cookie init**: `ensureCookieInitialized()` is called ONLY from `authBootstrap.ts` Step 0/4. No fire-and-forget calls on module load. This prevents race conditions and ensures deterministic boot order.
- **Apple Sign-In cookie**: React Native doesn't auto-persist Set-Cookie headers; must manually extract from header or response body and store via `setExplicitCookiePair()`. Regex extracts cookie value only (up to semicolon), not Path/HttpOnly/etc attributes.

## RSVP Type Contract (Canonical)

- Frontend RSVP states: `"going" | "interested" | "not_going"` (no "maybe")
- Backend may return "maybe" for legacy data → normalize to "interested" at boundary
- Normalization location: `src/lib/offlineSync.ts` (normalizeRsvpStatus helper), `src/app/event/[id].tsx` (myRsvpStatus assignment)
- Offline infrastructure enforces type safety: offlineQueue, offlineStore, offlineSync all exclude "maybe"

## Ruthless Simplicity Pattern (Canonical)

- Phase 1C (2026-01-27): Removed Social feed filter pills (All/Friends/Circles/Hosting/Going) to reduce cognitive load
- Discovery feed shows all events without client-side filtering
- Collapsible sections (Today/Tomorrow/This Week/Upcoming) retained for scannable structure
- Principle: Remove features that add complexity without proportional user value
- Impact: Cleaner UI, simpler codebase, pure discovery experience

## Availability Indicator Contract (Canonical)

- **Never lie principle**: Unknown availability shows neutral (no outline), not false positive
- **Conflict detection**: `(eventStart < otherEnd) AND (eventEnd > otherStart)` — standard overlap formula
- **Self-exclusion**: Same event ID excluded from conflict check (event doesn't conflict with itself)
- **Data source**: User's calendar = created events (`myEventsData`) + attending events (`attendingData`)
- **Visual encoding**: GREEN border (#22C55E) = free, RED border (#EF4444) = busy, no border = unknown
- **Edge case**: Event with missing endTime treated as point event (1 minute duration)

## Swipe Actions Contract (Canonical)

- **Threshold**: 60px horizontal swipe required to reveal action buttons
- **Snap behavior**: Past threshold snaps open (-120px), below snaps closed (0)
- **Actions**: Heart = "interested" RSVP, Check = "going" RSVP
- **Authed-only**: Swipe gesture disabled when `bootStatus !== "authed"`
- **Own events excluded**: User cannot swipe on their own events
- **Series excluded**: Recurring event series cannot be swiped (tap to detail instead)
- **Full event guard**: If event at capacity, "Going" shows toast "This invite is full" instead of RSVP
- **Vertical scroll safe**: `failOffsetY([-10, 10])` ensures scroll wins over swipe gesture
- **RSVP mapping**: Heart → POST `/api/events/{id}/rsvp` with status "interested", Check → status "going"


Purpose: Record proven discoveries, pitfalls, and rules learned during debugging.

---

### Date: 2026-01-27
### Finding: Post-logout 401 cascades causing red console error overlays
### Proof:
- After logout, authed queries (subscription, profile) continue firing while bootStatus transitions
- api.ts used `console.error()` for 401/403 → red React Native error overlay spam
- useSubscription query not gated, fired on every render regardless of auth state
### Impact: Disruptive UX after logout, console noise, false alarm error overlays
### Action Taken:
- Gated useSubscription query: `enabled: bootStatus === 'authed'`
- Changed api.ts 401/403 logging from `console.error()` to `console.log()` to prevent red overlays
- Added throttling to guardEmailVerification (3-second window) to prevent toast spam
### Related Files: `src/lib/useSubscription.ts`, `src/lib/api.ts`, `src/lib/emailVerificationGate.ts`

---

### Date: 2026-01-27
### Finding: Session lost on force-close (swipe-kill) due to race condition
### Proof:
- `refreshExplicitCookie()` called with `void` (fire-and-forget) on module load
- `bootstrapAuth()` calls `/api/auth/session` immediately
- Race: API call fires BEFORE SecureStore read completes → cookie not attached → 401 → logout
- User reopens app → treated as logged out despite valid cookie in storage
### Impact: Session lost every time user swipe-kills app
### Action Taken:
- Added `ensureCookieInitialized()` export that tracks initialization state with promise
- Bootstrap now awaits `ensureCookieInitialized()` before any API calls (Step 0/4)
- Cookie guaranteed loaded before session check
### Related Files: `src/lib/authClient.ts`, `src/lib/authBootstrap.ts`

---

### Date: 2026-01-27
### Finding: Fire-and-forget cookie init on module load causes unpredictable boot order
### Proof:
- `void ensureCookieInitialized()` called at bottom of authClient.ts module scope
- Module loads at indeterminate time during app startup
- Could race with bootstrap sequence or cause double initialization
### Impact: Non-deterministic auth boot, potential race conditions
### Action Taken:
- Removed `void ensureCookieInitialized()` from authClient.ts module scope
- Documented that authBootstrap.ts is the ONLY authority for cookie initialization
- Single source of truth: bootstrap Step 0/4 is the only caller
### Related Files: `src/lib/authClient.ts`, `src/lib/authBootstrap.ts`

---

### Date: 2026-01-27
### Finding: Apple Sign-In cookie not persisted in React Native
### Proof:
- Used `credentials: "include"` with native fetch() - doesn't work in RN
- Set-Cookie header from backend ignored by React Native fetch
- Session established on backend but never stored client-side → 401 on next request
### Impact: Apple Sign-In users immediately logged out after onboarding
### Action Taken:
- Changed to `credentials: "omit"` (explicit cookie handling)
- Extract Set-Cookie header via `response.headers.get("set-cookie")`
- Store cookie explicitly via `setExplicitCookiePair()`
- Fallback: use token from response body if Set-Cookie inaccessible
- Call `refreshExplicitCookie()` after storage to ensure cache is warm
### Related Files: `src/app/welcome.tsx` (handleAppleSignIn)

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

---

### Date: 2026-01-24
### Finding: Authed queries firing during logout/loading cause 401 storm
### Proof:
- Queries in profile.tsx, settings.tsx, friends.tsx used `enabled: !!session`
- After logout, cached session still exists momentarily
- Queries fire with stale session while bootStatus is 'loading' or 'loggedOut'
- Backend returns 401 for each → 401 spam in logs
### Impact: Race conditions during logout/login transitions, poor UX, confusing logs
### Action Taken:
- Changed all authed queries to use `enabled: bootStatus === 'authed'`
- Files fixed: calendar.tsx, profile.tsx, settings.tsx, friends.tsx

---

### Date: 2026-01-24
### Finding: /uploads/ images blocked by legacy bearer token check
### Proof:
- imageSource.ts logged: "Protected URL requires token but none available: .../uploads/...jpg"
- Backend actually serves /uploads/ paths as 200 without authentication
- Frontend was unnecessarily blocking image render
### Impact: Avatar images failed to render after logout or when no token cached
### Action Taken:
- Modified requiresAuth() in imageSource.ts to return false for /uploads/ paths
- /uploads/ URLs now treated as public, rendered without Authorization header

---

### Date: 2026-01-24
### Finding: useEntitlements hook needs enabled gating to prevent 401 during logout/loading
### Proof:
- Hook called useQuery without `enabled` gating on bootStatus
- During logout, fetch fires while session is invalid → 401 error
### Impact: Spurious 401 errors in console, confusing debug output
### Action Taken:
- Added optional `{ enabled?: boolean }` parameter to useEntitlements hook
- Preserves placeholderData behavior so entitlements always have a value

---

### Date: 2026-01-24
### Finding: MiniCalendar gated on !!session instead of bootStatus === 'authed'
### Proof:
- MiniCalendar component used `enabled: !!session && !!friendshipId`
- After logout, session may still be in React Query cache momentarily
- Caused calendar data fetches to fire during logout transition
### Impact: Same 401 race condition as other queries
### Action Taken:
- Changed MiniCalendar to accept `bootStatus: string` prop
- Changed enabled to `bootStatus === 'authed' && !!friendshipId`
- Updated FriendCard and FriendListItem to pass bootStatus prop

---

### Date: 2026-01-24
### Finding: Logout key deletion had scattered logs, no audit trail
### Proof:
- Multiple console.log statements during logout
- No consolidated list of which keys were deleted/failed
- Difficult to verify clean logout in production logs
### Impact: Debugging account switch issues required reading many log lines
### Action Taken:
- Added SECURESTORE_AUTH_KEYS and ASYNCSTORAGE_AUTH_KEYS arrays
- Track deletion success/failure per key
- Emit single [LOGOUT_INVARIANT] JSON log with keysDeleted, keysFailed, verifyCleared, verifyRemaining, success

---

### Date: 2026-01-25
### Finding: Apple Sign-In "unknown reason" errors needed user-friendly decoding
### Proof:
- expo-apple-authentication returns cryptic error codes (1000, 1001, 1002, 1003, 1004)
- Raw error.message exposed to user in error banner
- User sees "authorization attempt failed for an unknown reason" - not actionable
### Impact: Users cannot understand what went wrong or how to fix it
### Action Taken:
- Added decodeAppleAuthError() function to src/lib/appleSignIn.ts
- Maps error codes to friendly messages ("Please try again", "Check your Apple ID settings")
- Cancellation (code 1001) returns null (no error shown)
- Added AUTH_TRACE logging for debugging without exposing internals to user

---

### Date: 2026-01-25
### Finding: Onboarding session check failures caused redirect loop to /login
### Proof:
- handleSlide3Continue() called router.replace("/login") on any session check error
- User completes signup (Slide 2) → Slide 3 → Continue → transient session error → back to login
- This is the "loop back to beginning" bug reported on TestFlight
### Impact: New users cannot complete onboarding if any network hiccup occurs
### Action Taken:
- Removed router.replace("/login") calls from session checks during onboarding
- Transient errors: show "Session check failed. Please tap Continue to retry."
- Expired session: show "Your session expired. Please go back and sign in again."
- Photo upload session failures: skip silently, user can add photo later

---

### Date: 2026-01-25
### Finding: Photo upload failures could destabilize onboarding flow
### Proof:
- uploadPhotoInBackground() session check returned early on error
- But if the error was treated as auth failure elsewhere, could cascade
- No explicit guarantee that upload failure doesn't trigger logout
### Impact: Risk of auth state corruption on transient upload errors
### Action Taken:
- Added AUTH_TRACE logging with explicit "DO NOT redirect" comments
- Upload errors are now explicitly non-fatal
- User shown toast: "Could not upload photo. You can add it later in Settings."

---

### Date: 2026-01-24
### Finding: First-session guidance needed time-gating to avoid permanent prompts
### Proof:
- Empty states showed guidance text unconditionally
- Long-time users would see "tutorial-like" text forever
- Need to differentiate new user onboarding from established user empty state
### Impact: Unnecessary friction for experienced users
### Action Taken:
- Created src/lib/firstSessionGuidance.ts with 30-minute time window
- Stores `openinvite.firstOpenAt` timestamp in SecureStore
- Tracks completion per action: `openinvite.guidance.completed.<key>`
- Inline guidance only shows when: empty state + <30min since first open + action not completed
- Action keys: create_invite, join_circle, view_feed

---

### Date: 2026-01-27
### Finding: Ruthless Simplicity Phase 1 - UI subtraction rationale
### Proof:
- "Weekly" pill on event cards redundant - series already shows "Next: date" and "+N more"
- "Maybe" RSVP state creates decision paralysis, low value vs Interested
- Circle Event Mode toggle unnecessary complexity - Open Invite behavior is default desired UX
- Frequency/Notification toggles in circle context add friction without value
- Bottom nav had Calendar in center, but Social feed is primary engagement surface
### Impact: Cleaner UI, reduced cognitive load, faster task completion
### Action Taken:
- Removed Weekly pill from EventCard (social.tsx)
- Removed Maybe RSVP option from UI, backend "maybe" mapped to "interested" (event/[id].tsx)
- Removed EventReactions "maybe" type (EventReactions.tsx)
- Simplified Circle Create Event: removed Event Mode, Frequency, Send Notification (create.tsx)
- Reordered bottom nav: Discover | Calendar | Social (CENTER) | Friends | Profile
- Default landing changed from /calendar to /social
- CTA copy simplified: "Create Open Invite" → "Create Invite"
