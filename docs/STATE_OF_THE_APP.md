# State of the App — Frontend

## Stable
- Onboarding flow with bootstrap refresh mechanism
- Login with Better Auth (cookie session established)
- Signup with Better Auth (cookie session established)
- Cookie storage in SecureStore (open-invite_cookie key)
- Session persistence across force-close: Cookie cache initialized by bootstrap only (single authority)
- Authed queries gated on bootStatus (no 401 spam after logout)
- /uploads/ images render without token requirement
- useEntitlements hook accepts enabled parameter for gating
- MiniCalendar gated on bootStatus (not !!session)
- Logout invariant log: single [LOGOUT_INVARIANT] JSON emitted with full key audit
- First-session inline guidance: time-gated (30 min) empty-state hints
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
- Social feed: Pure discovery (no filter pills, shows all events)
- Social feed collapsible sections: Today/Tomorrow/This Week/Upcoming sections collapsible with count display
- RSVP states: Going, Interested, Can't Make It (no Maybe in types or UI)
- RSVP normalization: Backend "maybe" mapped to "interested" at boundary
- Circle events: Simplified creation (no Event Mode, Frequency, or Notification toggles)
- CTA copy: "Create Invite" (not "Create Open Invite")

## Unstable / Regressions
- None currently known

## Fixed This Session (Phase 3B: Swipe Actions)
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

