# Findings Log — Frontend

## Sprint Pack V2 Legacy Group Text Removal (2025-01-29)

### Legacy Group Name Display Filter Pattern ✓
**ROOT CAUSE**: Database records from older versions of the app contained group names like "LEGACY GROUP" which were displayed verbatim in UI, causing confusing user-facing text.

**EXACT CODE PATHS**:
- src/app/friends.tsx
  - Line 280: `{m.group.name}` in list view group badges
  - Line 463: `{m.group.name}` in detailed view group badges
  - Line 1636: `{selectedGroup.name}` in filter header
  - Line 2045: `{group.name}` in group list items
  - Line 2168: `{group.name}` in add-to-group modal
  - Line 2288: `{editingGroup.name}` in edit group modal header
- src/app/friend/[id].tsx
  - Line 719: `{membership.group.name}` in Groups Together section
  - Line 935: `{group.name}` in Add to Group modal

**WHY LEGACY TEXT APPEARED**: Backend `/api/groups` endpoint returns `FriendGroup` objects with `name` field directly from database. Old records had literal "LEGACY GROUP" text which frontend rendered without filtering.

**FIX APPLIED**:
1. Created `cleanGroupName()` helper in src/lib/displayHelpers.ts:
   - Removes "LEGACY GROUP", "Legacy Group", "legacy group" (case-insensitive)
   - Removes "(LEGACY)" and "[LEGACY]" patterns
   - Returns "Group" if cleaning removes entire name
   - Logs all cleanings with `[DEV_DECISION] legacy_group_text_removed` in DEV mode
2. Applied `cleanGroupName()` to all 8 group name render locations across friends.tsx and friend/[id].tsx
3. Groups Together data source verified: Uses `/api/groups` endpoint for friend groups (not circles), data comes from `friendship.groupMemberships` array

**INVARIANTS ADDED**:
- DEV log in cleanGroupName(): `[DEV_DECISION] legacy_group_text_removed count=1 original="..." cleaned="..."`
- DEV log in friend/[id].tsx: `[DEV_DECISION] groups_together_source kind=friend_groups reason=uses_/api/groups_endpoint_for_shared_memberships`
- DEV log for empty state: `[DEV_DECISION] groups_together_empty_state shown=true reason=no_shared_memberships`

**VERIFICATION**: `npm run typecheck && bash scripts/ai/verify_frontend.sh` PASSED

## Sprint Pack V2 Event Editing Consistency (2025-06)

### Edit Event UX Alignment Pattern ✓
**ROOT CAUSE**: Edit Event (src/app/event/edit/[id].tsx) had diverged from Create Event (src/app/create.tsx) UX patterns:
1. **Time UI inconsistency**: Edit used modal-based date/time pickers (separate modals triggered by buttons showing clock/calendar icons), Create used inline compact DateTimePicker
2. **Private visibility option**: Edit had 3 visibility options (All Friends, Groups, Private), Create only has 2 (All Friends, Groups)
3. **Co-hosts feature**: Edit had full co-hosts section (button, modal picker, mutations, state), Create has no co-hosts support

**FIX APPLIED**:
- **Time UI**: Replaced modal pickers with inline compact DateTimePicker matching Create pattern (lines 358-443)
  - Pattern: Single card with START row (date picker + time picker) and END row (date picker + time picker) side-by-side
  - Removed state: showDatePicker, showTimePicker
  - Removed modal components and handlers
- **Private button**: Removed entire Private Pressable from visibility options (lines 420-435)
  - TypeScript type narrowed from `"all_friends" | "specific_groups" | "private"` to `"all_friends" | "specific_groups"`
- **Co-hosts feature**: Complete removal (Option A - preferred minimal path)
  - Removed UI: Co-hosts section, Add Host button, host picker modal
  - Removed state: selectedHostIds, showHostPicker, showSoftLimitModal
  - Removed queries: friends query (GetFriendsResponse)
  - Removed mutations: updateHostsMutation
  - Removed functions: toggleHost, saveHosts, handleSoftLimitUpgrade, handleSoftLimitDismiss
  - Removed components: SoftLimitModal usage
  - Removed imports: Modal, Image, Clock, Calendar, Lock, UserPlus, X, CloudDownload

**INVARIANTS ADDED**:
- DEV decision log: [DEV_DECISION] edit_event_time_ui mode=inline_compact_matching_create
- DEV decision log: [DEV_DECISION] edit_event_private_removed (after visibility options)
- DEV decision log: [DEV_DECISION] edit_event_host_section mode=removed_for_consistency (after capacity section)

**CODE PATHS**:
- src/app/event/edit/[id].tsx (891 → ~554 lines)
  - Lines 1-30: Import cleanup
  - Lines 75-82: State variable cleanup
  - Lines 86: Removed useSubscription hook
  - Lines 110-125: Removed co-hosts loading from useEffect
  - Lines 130-135: Removed friends query
  - Lines 171-195: Removed updateHostsMutation
  - Lines 198-223: Removed handler functions
  - Lines 358-443: Time UI transformation
  - Lines 420-435: Private button removal
  - Lines 502: Co-hosts section removal point
  - Lines 550-end: Modal components removed

**VERIFICATION**: `npm run typecheck && bash scripts/ai/verify_frontend.sh` PASSED

## Sprint V1.1 UX Polish Patterns (2025-06)

### Home Calendar Pill Removal ✓
CHANGE: Removed event count pill from Calendar selected date header (was "{selectedDateEvents.length} event(s)")
NOTE: Social tab "X plans in 14 days" line was mistakenly removed - restored.
CODE PATH: 
- src/app/calendar.tsx (Selected Date Events header, lines ~2315-2340)
- src/app/social.tsx (plansIn14Days useMemo + Micro Social Proof Line render)

### Coachmark Permanent Dismissal Pattern
- **Migration**: AsyncStorage → SecureStore for cross-session persistence
- **Versioned keys**: `guide_friends_add_people_v1`, `guide_create_first_plan_v1` (version suffix allows reset)
- **loadedOnce gating**: shouldShowStep gates on loadedOnce to prevent flash
- **DEV decision logs**: All state changes logged with `[DEV_DECISION]` prefix
- **Implementation location**: `src/hooks/useOnboardingGuide.ts`

### Pin Friend Query Invalidation Pattern
- **Consistency**: invalidateQueries for `["pinnedFriendships"]` after pin mutation
- **DEV logs**: All pin operations logged for debugging
- **UI color**: Always #10B981 green (not conditional on pin state)
- **Implementation location**: `src/app/friends.tsx`, `src/components/FriendCard.tsx`

### Subscription Section Entitlement-Smart Pattern
- **Gate on loading**: Show "Loading subscription status..." while entitlementsLoading
- **Truthful display**: Show "Founder Pro" for userIsPremium, "Free" otherwise
- **No flash**: Entire section gated on entitlements being loaded
- **DEV decision log**: Logs state, entitlement on render
- **Implementation location**: `src/app/settings.tsx` SUBSCRIPTION section

### Work Schedule Block2 Persistence Pattern
- **Default values on add**: When adding block2, save default times (13:00-17:00) immediately
- **Prevents data loss**: User can navigate away without picking times and block2 persists
- **DEV logs**: Log block2 add/remove operations
- **Implementation location**: `src/app/settings.tsx` toggleBlock2 function

### Emoji Icon Validation Pattern
- **Reject non-emoji**: Clear input if no emoji graphemes detected
- **DEV log on reject**: Log rejected non-emoji input in DEV mode
- **Implementation location**: `src/app/create.tsx` customEmojiInput onChangeText

## Work Schedule Block2 Auto-Expand Pattern (Canonical)

- **First-load initialization**: useEffect with ref guard syncs expandedBlock2Days Set from loaded schedule data
- **Guard pattern**: `didSyncBlock2Ref.current` prevents overwriting user's manual expand/collapse after initial sync
- **Data-derived state**: `hasBlock2` computed as `expandedBlock2Days.has(day) || (block2StartTime && block2EndTime)`
- **Mutation contract**: toggleBlock2 collapse sends `{ block2StartTime: null, block2EndTime: null }` (no empty strings)
- **UI stability**: Expansion state derived from data on load, user-controlled thereafter (no flicker)
- **Implementation location**: `src/app/settings.tsx` (useEffect after workScheduleData query, toggleBlock2 handler)

## Social Feed Discovery Pattern (Canonical)

- **Discovery-first principle**: Social feed excludes events where user has taken action (going/interested RSVP) or is the host
- **Filtering logic**: Exclude if `viewerRsvpStatus === "going" | "interested"`, `userId === viewerUserId`, or `eventId in myEventIds/attendingEventIds`
- **Implementation location**: `src/app/social.tsx` allEvents useMemo, applied to feedEvents before deduplication
- **User benefit**: Feed shows only new discovery opportunities, reduces redundancy with Calendar/Attending views
- **Pattern**: Apply filter → deduplicate → render (preserves chronological order)

## Get Started Guide Persistence Pattern (Canonical)

- **Per-user dismissal**: AsyncStorage key format `get_started_dismissed:${userId}` (not global GUIDE_SEEN_KEY_PREFIX)
- **Usage signal gating**: Only show if `friendsCount === 0 AND totalEventsCount === 0` (true new users)
- **Persistence scope**: Survives logout/login for same user (authBootstrap.ts only clears SESSION_CACHE_KEY, not get_started keys)
- **Data loading check**: useEffect waits for `friendsData && calendarData` before deciding whether to show
- **Implementation location**: `src/app/calendar.tsx` checkFirstLogin useEffect (positioned after calendarData query definition)
- **User benefit**: Established users never see "Getting Started" again, prevents onboarding fatigue

## Social Calendar Date Modal Pattern (Canonical)

- **Bottom sheet presentation**: Use `presentationStyle="pageSheet"` for iOS native behavior (Android: standard modal)
- **Animation**: `animationType="slide"` (not "fade") for sheet sliding from bottom
- **Layout**: Parent View with `justify-end`, Pressable overlay for dismiss, Animated.View for content
- **Safe area**: `paddingBottom: 34` for home indicator clearance on iOS
- **User benefit**: Calendar tiles remain visible during date browsing, non-blocking UX
- **Implementation location**: `src/components/FeedCalendar.tsx` Day Events Modal (lines ~518-650)

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
- **Cookie injection doctrine (smoke tests)**: When passing `SESSION_COOKIE_VALUE` to scripts, normalize both forms: (1) raw token `abc123...`, (2) full pair `__Secure-better-auth.session_token=abc123...`. Always send as `-H "cookie: ; __Secure-better-auth.session_token=<token>"` (lowercase, leading '; '). Never duplicate cookie name or header.

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

## Activity Feed Avatar + Routing Contract (Canonical)

- **Avatar fallback chain**: `actorAvatarUrl || actorImage || senderAvatarUrl || userAvatarUrl || avatarUrl || image`
- **Initials fallback**: If no valid URL, derive displayName from `actorName || notification.title.split(' ')[0]`
- **Never blank**: Avatar shows either remote image, initials, or type icon — never empty circle
- **URL validation**: Check `avatarUrl.startsWith('http')` to ensure valid remote URL (Cloudinary compatible)
- **Tap routing priority**: Strict order: (1) eventId → /event/:id, (2) userId → /user/:id, (3) do nothing
- **Central resolver**: `resolveNotificationTarget()` helper centralizes navigation logic, returns null for invalid targets
- **Calm user feedback**: Invalid targets show info toast "This item is no longer available" (not dev errors)
- **DEV logging**: Invalid navigation targets log console.warn in DEV mode for debugging
- **userId extraction**: Check `data.userId || data.senderId || data.actorId` for user deep link

## Friends View Mode Persistence Pattern (Canonical)

- **Per-user persistence**: AsyncStorage key format `friends_view_mode:${userId}` (not global)
- **State restoration**: useEffect on mount reads saved preference, defaults to "detailed" if none found
- **Callback pattern**: handleViewModeChange async callback writes to AsyncStorage + updates local state
- **Toggle integration**: Pressable onPress calls `handleViewModeChange("list" | "detailed")` instead of direct setState
- **Implementation location**: `src/app/friends.tsx` (viewMode state, useEffect restoration, toggle handlers)
- **User benefit**: View preference (list vs grid) persists across sessions and app restarts

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

## Launch Sweep Findings (2026-01-28)

- **Broken route discovered**: `/event-requests` was pushed from calendar.tsx line 2526, but no such file exists (only `/event-request/[id].tsx`)
- **Fix applied**: Removed the "View all X requests" button since no list page exists; users tap individual requests
- **Route inventory**: 40 Expo Router screens verified (src/app/*.tsx + nested routes)
- **API inventory**: 50+ endpoints used from frontend, all match contracts.ts patterns
- **TypeScript**: Clean, no errors
- **Invariants**: All checks pass (auth contract, cookie header, bootStatus gating)

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

---

### Date: 2025-01-28
### Finding: P0 - Profile photo upload uses wrong auth mechanism
### Proof:
- imageUpload.ts used getAuthToken() for Bearer header
- Better Auth uses cookie-based auth, not Bearer tokens
- getAuthToken() returns null because token doesn't exist in this auth flow
- Response parsing assumed JSON, crashed on HTML error pages
### Impact: Profile photo uploads fail silently, users cannot set profile pictures
### Action Taken:
- Replaced getAuthToken() import with getSessionCookie() from sessionCookie.ts
- Changed headers from `Authorization: Bearer <token>` to `cookie: <sessionCookie>`
- Added try-catch for JSON parsing with console.error logging for debugging
- File: src/lib/imageUpload.ts

---

### Date: 2025-01-28
### Finding: P0 - Pro/Lifetime users incorrectly throttled by free-tier upgrade modal
### Proof:
- create.tsx soft-limit check only used isPremium from useSubscription()
- useSubscription() can fail to load or return false for lifetime users
- Lifetime Pro users were seeing "Upgrade for unlimited events" modal
### Impact: Paying customers blocked from app functionality, trust erosion
### Action Taken:
- Added entitlements?.plan check as fallback: PRO or LIFETIME_PRO bypasses limit
- userIsPro now: `isPremium || entitlements?.plan === 'PRO' || entitlements?.plan === 'LIFETIME_PRO'`
- File: src/app/create.tsx, line ~625

---

### Date: 2025-01-28
### Finding: P0 - FeedCalendar date modal shows white block obscuring calendar
### Proof:
- Modal with presentationStyle="pageSheet" had outer View without transparent background
- NativeWind className="flex-1 justify-end" doesn't set backgroundColor
- Result: white fullscreen overlay instead of see-through backdrop
### Impact: Calendar not visible when viewing day events, poor UX
### Action Taken:
- Added style={{ backgroundColor: 'transparent' }} to outer View wrapping modal content
- File: src/components/FeedCalendar.tsx, modal day events section

---

### Date: 2025-01-28
### Finding: P1 - Guidance overlays showing for senior/founder accounts
### Proof:
- firstSessionGuidance.ts used time-based heuristic (30 min since firstOpenAt)
- firstOpenAt stored in SecureStore gets reset on reinstall or app data clear
- Senior users who reinstall would see guides intended for brand new users
- No per-user-id scoping - global timestamp, not tied to specific account
### Impact: Senior users confused by onboarding UI, trust erosion
### Action Taken:
- Replaced time-based heuristic with per-user-id completion tracking
- Keys now: `openinvite.guidance.dismissed.<userId>`, `openinvite.guidance.completed.<userId>.<actionKey>`
- Added setGuidanceUserId() to set current user for per-user scoping
- Added dismissAllGuidance() for bulk dismiss
- Auto-dismiss for senior users: social.tsx checks if user has friends OR events, dismisses all guidance
- Files: src/lib/firstSessionGuidance.ts, src/app/social.tsx, src/app/circles.tsx, src/app/calendar.tsx

---

### Date: 2025-01-28
### Finding: P1 - Discover Reconnect tab routes to non-existent /profile/:id
### Proof:
- discover.tsx used `router.push(\`/profile/\${friend.id}\`)` for reconnect friend cards
- No /profile/[id].tsx route exists in app structure
- Only /user/[id].tsx (user profile by userId) and /friend/[id].tsx (friend by friendshipId) exist
- Tapping reconnect card caused navigation error (route not found)
### Impact: Reconnect feature broken, users cannot view friend profiles from Discover
### Action Taken:
- Changed route from /profile/:id to /user/:id
- File: src/app/discover.tsx

---

### Date: 2025-01-28
### Finding: P1 - Image upload uses uppercase Cookie header which React Native drops
### Proof:
- imageUpload.ts used `headers: { Cookie: sessionCookie }`
- React Native drops uppercase 'Cookie' header silently (known React Native behavior)
- authClient.ts already documented this: "Better Auth expo uses LOWERCASE 'cookie' header"
- Upload requests sent without auth cookie
### Impact: Image uploads fail with auth errors
### Action Taken:
- Changed Cookie to cookie (lowercase) in FileSystem.uploadAsync headers
- File: src/lib/imageUpload.ts

---

### Date: 2025-01-28
### Finding: P1 - Activity feed doesn't deep link to user profile when eventId missing
### Proof:
- handleNotificationPress only routed to /event/:id if eventId present
- Friend notifications (friend_request, friend_accepted) routed to /friends list, not specific user
- No fallback for userId when eventId is absent
- Users couldn't tap to see who sent friend request
### Impact: Activity feed less useful, extra taps to find relevant user
### Action Taken:
- Added userId/senderId/actorId lookup from notification data
- Friend-related notifications now route to /user/:userId if userId present
- Added final fallback: any notification with userId but no other route goes to /user/:userId
- Added structured warn log for notifications with no valid navigation target
- File: src/app/activity.tsx

---

### Date: 2025-01-28
### Finding: Bug Class - Global onboarding flags break multi-account behavior
### Proof:
- Global guidance keys (not user-scoped) persist across account switches
- Time-based heuristics (e.g., "30 min since first open") reset on reinstall
- Senior accounts who reinstall see new-user onboarding inappropriately
- Multi-account users: dismissing guidance on one account affects all accounts
### Impact: Trust erosion for senior users, confusion from seeing onboarding twice
### Pattern to Avoid:
- ❌ `openinvite.firstOpenAt` (global timestamp, resets on reinstall)
- ❌ `GUIDANCE_SEEN_KEY` (no userId scoping)
- ❌ Time-since-install checks: `elapsed < THIRTY_MINUTES_MS`
### Correct Pattern:
- ✅ Per-user-id keys: `openinvite.guidance.dismissed.<userId>`
- ✅ Per-user completion: `openinvite.guidance.completed.<userId>.<actionKey>`
- ✅ Auto-dismiss for senior users: check friends/events count, call dismissAllGuidance()
- ✅ Set current user: `setGuidanceUserId(session?.user?.id)`
### References:
- src/lib/firstSessionGuidance.ts - Per-user-id implementation
- docs/INVARIANTS.md - Guidance & Onboarding section
## Cloudinary Direct Upload Pattern (Canonical)

- **Architecture**: Client uploads directly to Cloudinary (no backend byte handling), returns secure_url to backend for profile update
- **Unsigned preset**: Use unsigned upload preset (e.g., `openinvite_profile`) for public client uploads without API key
- **Env vars**: `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`, `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` (NO EXPO_PUBLIC_CLOUDINARY_FOLDER)
- **Upload endpoint**: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
- **FormData multipart**: Use React Native FormData with `{ uri, type: "image/jpeg", name: "upload.jpg" }`
- **CRITICAL: Client must NOT send folder param**: Preset controls folder + naming logic, client sends ONLY file + upload_preset
- **Response parsing**: Extract `secure_url` from JSON response, handle non-JSON errors defensively
- **Error handling**: Check `!res.ok` before parsing, throw error with Cloudinary message if available
- **Size guard**: Enforce MAX_UPLOAD_BYTES (5MB) before upload to prevent wasted bandwidth
- **Implementation location**: `src/lib/imageUpload.ts` (uploadImage function)
- **Profile flow**: Settings → Edit Profile → uploadImage(localUri) → backend PATCH /api/profile with avatarUrl
- **Onboarding flow**: welcome.tsx → uploadImage(localUri) → store URL → save with profile on Continue

## Interactive Onboarding Guide Pattern (Canonical)

- **User-scoped keys**: `onboarding_guide_step:${userId}`, `onboarding_guide_completed:${userId}` (not global)
- **Boot gating**: Guide only loads after `userId` present AND `bootStatus === "authed"` (prevents flash on load)
- **Default to completed**: State defaults to `isCompleted: true, isLoading: true` until userId+data loaded
- **shouldShowStep check**: Returns true only if `!isCompleted && !isLoading && currentStep === step` (no flash before data loads)
- **Three-step flow**: friends_tab → add_friend → create_event → completed
- **Step progression**: Triggered by user actions (visiting Friends, sending request, creating event)
- **All operations require userId**: completeStep, startGuide, dismissGuide, resetGuide check userId before mutating storage
- **Implementation location**: `src/hooks/useOnboardingGuide.ts` (hook), `src/components/OnboardingGuideOverlay.tsx` (UI)
- **Usage pattern**: `const guide = useOnboardingGuide(); guide.shouldShowStep("friends_tab")` returns true only if userId loaded + not completed + not loading