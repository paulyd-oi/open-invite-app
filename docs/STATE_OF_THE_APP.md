# State of the App — Frontend

## Stable
- Onboarding flow with bootstrap refresh mechanism
- Login with Better Auth (cookie session established)
- Signup with Better Auth (cookie session established)
- Cookie storage in SecureStore (open-invite_session_cookie key)
- Session persistence across force-close: Cookie cache initialized by bootstrap only (single authority)
- Authed queries gated on bootStatus (no 401 spam after logout)
- Subscription query gated on bootStatus (prevents post-logout 401s)
- Email verification guard throttled (max 1 toast per 3 seconds, prevents spam)
- API 401/403 errors: console.log only (not console.error), no red overlays for expected auth failures
- /uploads/ images render without token requirement
- useEntitlements hook accepts enabled parameter for gating
- MiniCalendar gated on bootStatus (not !!session)
- Logout invariant log: single [LOGOUT_INVARIANT] JSON emitted with full key audit
- First-session inline guidance: Per-user-id completion tracking (no time heuristic), auto-dismissed for senior users with friends/events
- Human-friendly error toasts: no raw codes, calm microcopy across all screens
- Instant feedback on primary actions: RSVP, Create Circle, Create/Edit Event
- Spacing polish: breathing room between sections, header spacing, list spacing
- Terminology: User-facing strings use "Group" (not Circle), "Friends" (not Connections)
- Apple Sign-In hardened: user-friendly errors, cancellation detection, AUTH_TRACE logging, explicit cookie capture
- Onboarding photo upload: failures non-fatal, no redirect to /login on error
- Session checks in onboarding: transient errors show retry message, never auto-redirect
- Lifetime subscription: Always treated as Premium (tier/isLifetime/isPro all checked)
- Location permission: Requested on first place search (create.tsx)
- Bottom sheets: SafeAreaInsets for proper bottom padding on all modals
- Keyboard avoidance: Group Settings modal uses KeyboardAvoidingView
- Bottom nav order: Discover | Calendar | Social (CENTER) | Friends | Profile
- Default landing: Social feed on cold launch (authenticated users)
- Social feed: Pure discovery (filters out going/interested/host events, no filter pills UI)
- Social feed collapsible sections: Today/Tomorrow/This Week/Upcoming sections collapsible with count display
- RSVP states: Going, Interested, Can't Make It (no Maybe in types or UI)
- RSVP normalization: Backend "maybe" mapped to "interested" at boundary
- Circle events: Simplified creation (no Event Mode, Frequency, or Notification toggles)
- CTA copy: "Create Invite" (not "Create Open Invite")
- Get Started guide: Per-user dismissal (get_started_dismissed:userId), gated by true-new-user signals (0 friends AND 0 events)
- Interactive onboarding guide: User-scoped keys (onboarding_guide_step:userId, onboarding_guide_completed:userId), gated on bootStatus=authed + userId present + data loaded
- Social calendar date modal: Bottom sheet presentation (presentationStyle="pageSheet"), transparent background, no calendar tile obscuring
- Profile photo upload: Cloudinary direct upload CANONICAL (unsigned preset openinvite_profile, NO folder from client, preset controls all naming/folder)
- Pro user throttle gate: Checks both isPremium AND entitlements.plan to prevent false throttling
- Discover tab reconnect: Routes to /user/:id (not /profile/:id which doesn't exist)
- Activity feed deep links: Tapping notification routes to event or user profile based on data.eventId/userId
- Activity feed avatars: Parses actorAvatarUrl from notification data with multiple fallback fields
- Activity feed avatar fallback: Always shows valid content (avatarUrl > initials > icon), never blank circle
- Activity tap routing: Strict priority (eventId > userId > do nothing), no error toasts on invalid targets
- Work schedule block2 auto-expand: Days with saved block2 times auto-expand UI on load, user changes preserved after initial sync
- Calendar import help screen: Truthful sections (one-time import, not live sync, privacy), Import Calendar + Back buttons

## Unstable / Regressions
- None currently known

## Fixed This Session (P0 Cloudinary Direct Upload + Guide Gating - FINALIZED)
- Profile photo upload: Migrated to CANONICAL Cloudinary direct upload (unsigned preset openinvite_profile)
- Cloudinary pattern: Client sends ONLY file + upload_preset (NO folder param), preset controls all naming/folder logic
- Cloudinary env vars: EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME, EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET (EXPO_PUBLIC_CLOUDINARY_FOLDER removed)
- Upload flow: compress → POST to Cloudinary API → return secure_url → backend profile update (no bytes to backend)
- Onboarding welcome.tsx: Migrated from backend /api/upload/image to Cloudinary uploadImage()
- Interactive onboarding guide: Fixed user-scoping (keys now onboarding_guide_step:userId, onboarding_guide_completed:userId)
- Guide gating: Waits for userId + bootStatus=authed before loading state, defaults to isCompleted=true to prevent flash
- Guide overlay: shouldShowStep() checks !isLoading to prevent flash before data loads
- All guide operations (completeStep, startGuide, dismissGuide, resetGuide) now require userId

## Launch Sweep (2026-01-28)
- Full frontend debugger sweep: TypeScript, routes, API calls
- TypeScript: PASS (no errors)
- verify_frontend.sh: PASS (all invariants)
- Broken route fixed: Removed "/event-requests" link (no list page exists, users tap individual requests)
- API inventory: 50+ endpoints verified present in contracts.ts
- Route inventory: 40+ routes verified file existence

## Fixed This Session (E.4 Auth Contract Smoke Script)
- Created scripts/ai/smoke_auth_contract.sh to verify AUTH_CONTRACT compliance
- Normalizes SESSION_COOKIE_VALUE: handles both raw token and full cookie pair formats
- Always sends cookie as lowercase header with leading '; ' (React Native format)
- Three proofs: unauthed endpoint OK, authed endpoint OK with cookie, authed endpoint 401 without cookie
- Created scripts/ai/verify_backend.sh to run smoke test (skips if SESSION_COOKIE_VALUE not set)

## Fixed This Session (E.3 Calendar Import Help Screen)
- Rewrote /calendar-import-help with truthful sections: One-time Import, Not Live Sync Yet, Privacy
- Added bottom buttons: "Import Calendar" (returns to import flow), "Back"
- Privacy section clarifies: friends see title/time/location based on visibility; notes/attendees stay private
- Mom-safe language: No technical jargon, clear expectations

## Fixed This Session (E.2 Work Schedule Block2 Persistence)
- Block2 auto-expand: Days with saved block2StartTime + block2EndTime auto-expand UI on data load
- Initial sync guard: useRef tracks first load to prevent overwriting user manual expand/collapse
- Mutation payload: toggleBlock2 already sends null for both fields when removing (verified)

## Fixed This Session (E.1 Activity Feed Hardening)
- Activity avatar display: Expanded URL fallback chain (actorAvatarUrl|actorImage|senderAvatarUrl|userAvatarUrl|avatarUrl|image)
- Activity avatar initials: Falls back to displayName from actorName or notification.title first word
- Activity avatar guarantee: Always shows valid content - never blank circle (avatar > initials > icon)
- Activity tap routing: Simplified to strict priority (eventId > userId > do nothing with DEV warn)
- Activity error handling: No user-facing error toasts on invalid routes, DEV-only console warnings

## Fixed This Session (P1 Guides + Suggestions + Activity)
- Guidance system: Replaced time-based heuristic with per-user-id completion tracking. Senior users (with friends OR events) auto-dismissed on load.
- Discover Reconnect routing: Fixed /profile/:id → /user/:id (profile route didn't exist, caused navigation error)
- Image upload cookie: Fixed uppercase Cookie → lowercase cookie (React Native drops uppercase headers silently)
- Activity feed deep links: Added userId fallback for friend_request/friend_accepted notifications
- Activity feed navigation: Falls back to user profile if eventId missing but userId present

## Fixed Previously (P0 Sheet Overlay + Upload + Pro Throttle)
- FeedCalendar modal white block: Added transparent background to outer View so calendar remains visible behind bottom sheet
- Profile photo upload JSON parse error: Switched from Bearer token auth (which doesn't exist in Better Auth flow) to session cookie auth, added defensive JSON parsing with error logging
- Pro user false throttle: Soft-limit check now checks both isPremium (SubscriptionContext) AND entitlements.plan (PRO/LIFETIME_PRO) to prevent lifetime users seeing upgrade modal

## Fixed Previously (P1/P2 Feed Discovery + Get Started + Date UI)
- Social feed discovery: Filters out events where viewerRsvpStatus is "going" or "interested", host events, and my/attending events
- Get Started dismissal: Changed to per-user key (get_started_dismissed:${userId}), persists across logout/login
- Get Started gating: Only shows for true new users (friendsCount === 0 AND totalEventsCount === 0), prevents reappearing for established users
- Social calendar date modal: Replaced blocking center modal with iOS bottom sheet (presentationStyle="pageSheet", slide animation, justify-end layout)

## Fixed Previously (P0 Auth/Toast/Logout Noise)
- Email verification toast spam: Added 3-second throttle to guardEmailVerification
- Post-logout 401 overlays: Changed api.ts to use console.log (not console.error) for auth errors, preventing red overlays
- Subscription query 401s: Gated useSubscription query with `enabled: bootStatus === 'authed'`
- API error logging: Reduced noise, expected auth failures logged once without red overlays

## Fixed Previously (Phase 3C: Friend Profile Tab Reorder)
- Tab order: Reordered friend profile sections to Bio → Calendar → Groups Together → Notes → Open Invites
- Calendar prominence: Moved calendar to position 2 for immediate friend availability context
- Notes demotion: Moved notes to position 4 as reference vs primary information
- Animation delays: Updated delays (15ms → 25ms → 50ms) for visual flow

## Fixed Previously (Phase 3B: Swipe Actions)
- Swipe-to-reveal RSVP: Event cards support swipe-left to reveal Heart (Interested) and Check (Going) buttons
- Gesture threshold: 60px swipe reveals actions, snaps open/closed on release
- Safety guards: Authed-only, own events excluded, full events disable Going button
- RSVP mutation: Reuses existing API pattern, invalidates feed/attending/calendar queries
- Vertical scroll preserved: failOffsetY prevents gesture hijacking scroll

## Fixed Previously (Phase 3A: Availability Indicator)
- Availability outline: Feed event cards show GREEN (free), RED (busy), or neutral border
- Conflict detection: Time overlap check against user's calendar (created + attending events)
- Truthful UX: Unknown state (no calendar data) shows no outline instead of false positive
- Self-exclusion: Same event ID excluded from conflict detection

## Fixed Previously (Phase 2B: Auth Invariant Hardening)
- Cookie init authority: Removed fire-and-forget call from authClient.ts module load
- Single authority: ensureCookieInitialized() now called ONLY by authBootstrap.ts
- Apple Sign-In parsing: Regex extracts only cookie pair value (excludes Path, HttpOnly, etc)

## Fixed Previously (Phase 2: Auth Trust)
- Session persistence fix: ensureCookieInitialized() awaited before bootstrap prevents race condition
- Cold start auth: Cookie loaded from SecureStore BEFORE session check API call
- Apple Sign-In cookie capture: Explicit Set-Cookie header extraction and storage
- Apple Sign-In fallback: Token from response body stored as cookie format for Better Auth
- AUTH_TRACE logging: Enhanced diagnostics for cookie state, Set-Cookie presence, token extraction

## Fixed Previously (Phase 1C: Social Filter Removal)
- Social feed filters: Removed All/Friends/Circles/Hosting/Going filter pills for ruthless simplicity
- Feed display: Shows all events without client-side filtering
- Code cleanup: Removed FilterType type, activeFilter state, filter application logic
- Cognitive load reduction: Pure discovery feed with no filter UI clutter

## Fixed Previously (Phase 1B: Maybe RSVP Complete Removal)
- Type system: Removed "maybe" from all RSVP type unions (offlineQueue, offlineStore, offlineSync, event/[id].tsx, discover.tsx)
- Normalization helper: Added normalizeRsvpStatus() in offlineSync.ts for backend boundary
- Event detail screen: Added normalization for myRsvpData.status, removed all myRsvpStatus === "maybe" checks
- Offline infrastructure: Updated LocalRsvp, RsvpChangePayload, useOfflineRsvp to exclude "maybe"
- Type safety: All RSVP states now strictly "going" | "interested" | "not_going"

## Fixed Previously (Phase 1: Ruthless Simplicity)
- Social feed: Removed "Weekly" pill from recurring event cards
- RSVP simplification: Removed "Maybe" option from UI, maps backend "maybe" to "interested"
- EventReactions: Removed "Maybe" reaction type
- Circle Create Event: Removed Event Mode selector, Frequency picker, Send Notification toggle
- Bottom nav reorder: Social centered as primary tab (index 2, isCenter: true)
- Default landing: /social instead of /calendar on authenticated boot
- CTA update: "Create Open Invite" → "Create Invite"

## Previously Fixed
- Social feed collapsible sections: Today/Tomorrow/This Week/Upcoming sections now collapsible with count display
- Edit Event query invalidation: Update/delete now invalidates ["events", "single", id], ["calendar"], ["events", "feed"]
- Edit Event success toast: Now shows "Updated" and "Deleted" confirmations
- P0-A Onboarding: requestBootstrapRefreshOnce() after profile save prevents loop
- P0-B Lifetime Premium: SubscriptionContext now checks tier/isLifetime/isPro
- P0-C Apple Sign-In: Enhanced AUTH_TRACE with httpStatus, responseBody, fullError
- P1-D Bottom sheets: ConfirmModal, CreateCircleModal, UpgradeModal, EventSummaryModal use insets
- P1-E Keyboard: Group Settings Modal wrapped in KeyboardAvoidingView
- P1-F Location: create.tsx requests permission on first search
- P1-G Friend Notes: Enhanced error logging with status/body in onError

## Previously Fixed
- Birthday card navigation: Upcoming birthdays on calendar now tap to open User Profile
- Dark mode Friend Profile header: Added headerTintColor and headerTitleStyle for contrast
- Friend Profile bio display: Shows bio field when present (in addition to calendarBio)
- Social feed 14-day count: "X plans in the next 14 days" instead of all events

## Previously Fixed
- Apple Sign-In error handling: added decodeAppleAuthError() for user-friendly messages
- Apple Sign-In AUTH_TRACE: detailed logging of credential validation and backend response
- Onboarding session checks: removed auto-redirect to /login on transient errors
- Photo upload resilience: failure does not reset auth state or navigation
- Session expired during onboarding: shows "Your session expired" message instead of redirect loop

## Previously Fixed
- Terminology standardization: "Circle" → "Group" in user-facing strings (circles.tsx, event/edit/[id].tsx, CreateCircleModal.tsx, social.tsx)
- Spacing polish: increased vertical breathing room on calendar, social feed, circles screens
- Instant feedback on primary actions: RSVP shows "Updating…", Create Circle shows ActivityIndicator
- Error message UX: Humanized all user-facing error toasts with calm, non-alarming copy
- Calendar empty state: Added "Invite a friend" CTA with native share sheet
- First-session guidance: Added `src/lib/firstSessionGuidance.ts` with 30-minute time window
- Empty states updated: calendar.tsx, circles.tsx, social.tsx show inline guidance text
- Guidance completion: create.tsx marks `create_invite`, circles.tsx marks `join_circle`
- useEntitlements: Added optional `enabled` param to gate fetch on bootStatus
- MiniCalendar: Changed gating from `!!session` to `bootStatus === 'authed'`
- Logout key deletion: Enumerated SECURESTORE_AUTH_KEYS and ASYNCSTORAGE_AUTH_KEYS with consolidated [LOGOUT_INVARIANT] log
- Auth state races: Authed queries (profile, friends, circles, events, workSchedule) now gated on `bootStatus === 'authed'`
- Upload image blocking: /uploads/ URLs now treated as public (no bearer token required)
- Query gating across: calendar.tsx, profile.tsx, settings.tsx, friends.tsx
- /api/auth/session 401 after signup - Fixed: welcome.tsx now uses authClient.signUp.email()
- React Native drops uppercase Cookie header; now using lowercase 'cookie'

## Next Priority
- TestFlight verification: Apple Sign-In flow on real device
- TestFlight verification: Signup + photo upload + Continue flow stability

## Last Verified
- 2026-01-27: Phase 1 Ruthless Simplicity complete

