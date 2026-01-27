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
- Human-friendly error toasts: no raw codes, calm microcopy across all screens
- Instant feedback on primary actions: RSVP, Create Circle, Create/Edit Event
- Spacing polish: breathing room between sections, header spacing, list spacing
- Terminology: User-facing strings use "Group" (not Circle), "Friends" (not Connections)
- Apple Sign-In hardened: user-friendly errors, cancellation detection, AUTH_TRACE logging
- Onboarding photo upload: failures non-fatal, no redirect to /login on error
- Session checks in onboarding: transient errors show retry message, never auto-redirect
- Lifetime subscription: Always treated as Premium (tier/isLifetime/isPro all checked)
- Location permission: Requested on first place search (create.tsx)
- Bottom sheets: SafeAreaInsets for proper bottom padding on all modals
- Keyboard avoidance: Group Settings modal uses KeyboardAvoidingView

## Unstable / Regressions
- None currently known

## Fixed This Session
- Social feed filter pills: Added All/Friends/Circles/Hosting/Going filter options
- Social feed collapsible sections: Today/Tomorrow/This Week/Upcoming sections now collapsible with count display
- Filter logic: Applied after recurring series grouping, purely client-side on loaded events
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
- 2026-01-26: Typecheck PASS (social feed filters and collapsible sections)

