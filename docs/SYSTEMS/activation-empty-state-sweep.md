# Activation & Empty-State Sweep

> **STATUS: SPEC ONLY** — Discovery document. No code changes.
> Scope: First 1–3 sessions, low-density user states (0 friends, 0 events, 0 RSVPs).

---

## A. Purpose

New users who complete onboarding land on Calendar with zero friends, zero events, and zero RSVPs. Every tab surface shows an empty state. The quality and cohesion of these empty states determines whether a user reaches their first "aha" moment (friend added, event created, RSVP sent) or churns.

This document audits every activation touchpoint and empty state across the app, maps the existing infrastructure, identifies gaps, and recommends targeted edits to improve first-session conversion.

---

## B. Current Behavior (Per Surface)

### B1. Onboarding → First Landing

| Step | What Happens |
|------|-------------|
| Onboarding carousel (9 steps) | `src/app/onboarding.tsx` — Step 2 offers contacts sync. Completion calls `api.post("/api/onboarding/complete")`, starts interactive guide, routes to `/calendar`. |
| WelcomeModal | `src/components/WelcomeModal.tsx` — Shows once on first login. Verified users see "Find Friends" + "Create Your First Invite" CTAs. Unverified users see "Verify Email" + "Resend Email". Marks as shown immediately via AsyncStorage. |
| Interactive Guide | `src/hooks/useOnboardingGuide.ts` — 3-step overlay sequence: `friends_tab` → `add_friend` → `create_event`. SecureStore-backed, per-user. Dismissed permanently once completed or skipped. |
| FirstValueNudge | `src/components/FirstValueNudge.tsx` — Shows when user has 0 friends, 0 events, and 0 RSVPs. "Find friends" + "Create event" CTAs. 7-day cooldown on dismiss. |
| SecondOrderSocialNudge | `src/components/SecondOrderSocialNudge.tsx` — Triggers after first friend added. "See what's happening" + "Create an event" CTAs. One-time display. |

**Flow:** Onboarding → Calendar (empty) → WelcomeModal → Interactive Guide step 1 (Friends tab) → step 2 (Add friend) → step 3 (Create event) → done.

### B2. Calendar Tab (Landing Tab)

- **File:** `src/app/calendar.tsx` (~3,205 lines)
- **Empty condition:** `isDataSettled && !hasEventsForView` (line ~1878)
- **Grid empty state** (lines 2695–2749):
  - Title: "No upcoming invites yet"
  - Subtitle: "Plans start when someone joins you." (conditional on `shouldShowEmptyGuidanceSync("create_invite")`)
  - CTAs: "Invite a friend" (Share API), "Create an Invite" (→ `/create?date={selectedDate}`), "Who's Free?" (→ `/whos-free`)
- **Calendar import nudge** (lines 2533–2571): Prompts to connect external calendar.

### B3. Friends Tab (Social Pane + People Pane)

- **File:** `src/app/friends.tsx` (~1,595 lines), `src/components/friends/FriendsPeoplePane.tsx` (~436 lines)
- **People pane zero-friends state** (lines 377–402 in FriendsPeoplePane):
  - Title: "No friends yet"
  - Subtitle: "Find friends already on Open Invite or invite new ones"
  - CTAs: "Find Friends" (→ `/add-friends`), ShareAppButton
- **Header CTAs:** "Find" (→ `/find-friends`) visible on People pane, "Add" (→ `/add-friends`) on People pane only.
- **Activity pane:** Shows friend activity feed. Empty when 0 friends — no explicit empty state component, just empty list.
- **Chats pane:** Shows circle conversations. Empty when 0 circles — no explicit empty state.

### B4. Discover Tab

- **File:** `src/app/discover.tsx` (~1,152 lines)
- **Ideas pane:** `src/components/ideas/DailyIdeasDeck.tsx` (~1,260 lines)
  - Empty/no-deck state (lines 1062–1079): "No ideas yet" / "Check back tomorrow"
  - Completion state (lines 1099–1171): Dynamic copy via `getCompletionCopy()`. When `peopleCount === 0`: "Add a friend to unlock better ideas" with "Browse People" CTA.
- **Events pane** (lines 602–627): "No events yet" / "Events from your network will appear here." / "Create an Event" CTA (→ `/create`).
- **Saved pane** (lines 931–966): "Your shortlist" / "Save events you're considering." / "Browse Events" CTA (switches to Events lens).

### B5. Who's Free

- **File:** `src/app/whos-free.tsx`
- **Zero-friends state** (lines 524–543): "Add friends to find the best time" / "Find Friends" CTA (→ `/friends`).
- **No overlapping times** (lines 704–715): "No overlapping free times found" / "Try a different date or fewer people" (self-resolving, no CTA).

### B6. Friend Discovery

- **File:** `src/components/FriendDiscoverySurface.tsx` (~690 lines) — SSOT component used in `/add-friends` and onboarding.
- Features: Import from Contacts, search by name/email/phone, People You May Know suggestions, default suggestions on first load (never blank).
- **Empty suggestions state** (lines 538–543): "Suggestions will appear as more friends join."

---

## C. Target Behavior

The activation funnel has one critical path: **Friend Added → Event Created/RSVP'd → Repeat**.

Target state for sessions 1–3:

| Session | Goal | Success Metric |
|---------|------|----------------|
| 1 | Add ≥1 friend OR create ≥1 event | `friend_added` or `event_created` milestone fired |
| 2 | Complete the other action (if session 1 was friend → event, or vice versa) | Both milestones fired |
| 3 | First RSVP or second event | `rsvp_going` milestone fired |

Every empty state should funnel toward one of these actions. No dead ends.

---

## D. Codebase Map

### Activation Infrastructure

| File | Purpose |
|------|---------|
| `src/lib/activationFunnel.ts` | PostHog first-action tracking: `event_created`, `rsvp_going`, `friend_added`, `circle_joined` |
| `src/lib/firstSessionGuidance.ts` | SecureStore-backed per-user action state: `create_invite`, `join_circle`, `view_feed`. Sync check for render. |
| `src/hooks/useOnboardingGuide.ts` | 3-step interactive overlay guide: `friends_tab` → `add_friend` → `create_event` |

### Activation Nudge Components

| File | Trigger | CTAs |
|------|---------|------|
| `src/components/WelcomeModal.tsx` | First login, once per user | Find Friends, Create First Invite |
| `src/components/FirstValueNudge.tsx` | 0 friends + 0 events + 0 RSVPs, 7-day cooldown | Find friends, Create event |
| `src/components/SecondOrderSocialNudge.tsx` | After first friend added, one-time | See what's happening, Create an event |

### Empty State Locations

| Surface | File | Lines | CTAs Present |
|---------|------|-------|-------------|
| Calendar grid | `src/app/calendar.tsx` | 2695–2749 | Invite a friend, Create an Invite, Who's Free? |
| Friends People pane | `src/components/friends/FriendsPeoplePane.tsx` | 377–402 | Find Friends, Share App |
| Friends Activity pane | `src/app/friends.tsx` | — | **None (gap)** |
| Friends Chats pane | `src/app/friends.tsx` | — | **None (gap)** |
| Discover Events pane | `src/app/discover.tsx` | 602–627 | Create an Event |
| Discover Saved pane | `src/app/discover.tsx` | 931–966 | Browse Events |
| Ideas deck empty | `src/components/ideas/DailyIdeasDeck.tsx` | 1062–1079 | **None (gap)** |
| Ideas completion | `src/components/ideas/DailyIdeasDeck.tsx` | 1099–1171 | Browse People (when 0 friends) |
| Who's Free | `src/app/whos-free.tsx` | 524–543 | Find Friends |
| Friend suggestions | `src/components/FriendDiscoverySurface.tsx` | 538–543 | **None (gap)** |

---

## E. Top 5 Recommended Edits

### E1. Friends Activity Pane — Add Empty State

**Gap:** Activity pane shows empty list with no guidance when user has 0 friends.
**Fix:** Add empty state with "Your friends' activity will show up here" + "Find Friends" CTA routing to `/add-friends`.
**File:** `src/app/friends.tsx` — Activity pane FlatList `ListEmptyComponent`.
**Impact:** High — this is the default pane new users see on Friends tab.

### E2. Friends Chats Pane — Add Empty State

**Gap:** Chats pane shows empty list with no guidance when user has 0 circles.
**Fix:** Add empty state with "Start a group chat with friends" + "Create a Circle" CTA.
**File:** `src/app/friends.tsx` — Chats pane empty state.
**Impact:** Medium — visible on second pane swipe.

### E3. Ideas Deck No-Ideas State — Add Friend CTA

**Gap:** "No ideas yet / Check back tomorrow" is a dead end — no actionable CTA.
**Fix:** Add "Add friends to unlock personalized ideas" + "Find Friends" CTA, matching the completion-state pattern already used in the same file.
**File:** `src/components/ideas/DailyIdeasDeck.tsx` lines 1062–1079.
**Impact:** Medium — default Discover pane for 0-friend users.

### E4. Contacts Permission Timing — Request at First Meaningful Moment

**Gap:** Contacts sync is offered during onboarding step 2 but many users skip it. No re-prompt at the moment of highest intent (e.g., Friends tab first visit, post-first-event creation).
**Fix:** Add a contacts permission prompt to `FriendDiscoverySurface` when permission is `undetermined`, shown inline above search results. Also consider a one-time prompt on Friends tab first visit.
**File:** `src/components/FriendDiscoverySurface.tsx`, `src/app/friends.tsx`.
**Impact:** High — contacts import is the primary friend-density driver.

### E5. Discover Events Pane — Add Friend-Density Nudge

**Gap:** "Events from your network will appear here" correctly explains the empty state but doesn't address the root cause (0 friends = 0 network events).
**Fix:** When `friendCount === 0`, replace or augment the empty state to include "Add friends to see their events" + "Find Friends" CTA alongside "Create an Event".
**File:** `src/app/discover.tsx` lines 602–627.
**Impact:** Medium — helps users understand why the feed is empty.

---

## F. Rollout Order

| Phase | Edits | Rationale |
|-------|-------|-----------|
| 1 | E1 (Activity empty state), E2 (Chats empty state) | Eliminates the two remaining dead-end empty states. Pure additive, zero regression risk. |
| 2 | E3 (Ideas CTA), E5 (Discover friend nudge) | Converts passive empty states into friend-density funnels. Low risk. |
| 3 | E4 (Contacts permission re-prompt) | Requires permission flow testing. Higher complexity, highest potential impact on friend density. |

---

## G. Risks / Invariants

1. **Over-prompting.** Multiple nudges can stack in a single session (WelcomeModal + FirstValueNudge + Interactive Guide + empty state CTAs). Ensure only one modal/nudge is visible at a time. Use the existing `firstSessionGuidance` system to gate.
2. **CTA destination consistency.** Friend discovery routes to both `/find-friends` and `/add-friends`. The SSOT is `FriendDiscoverySurface.tsx` used in `/add-friends`. New CTAs should route to `/add-friends` for consistency.
3. **Contacts permission.** iOS shows the system prompt only once. If denied, subsequent requests are no-ops. Any re-prompt UI must check `Contacts.getPermissionsAsync()` and show "Open Settings" if `status === 'denied'`.
4. **Empty state flash.** Ensure `isLoading` states don't briefly show empty states before data arrives. Use `isDataSettled` pattern from calendar.
5. **Hook ordering.** Any new empty state logic in `friends.tsx` must respect the existing hook ordering above early returns.

---

## H. Doctrine / Rules

1. **Every empty state must have a CTA.** No surface should show a "nothing here" message without an actionable next step.
2. **CTAs funnel to activation milestones.** Every empty-state CTA should lead toward `friend_added`, `event_created`, or `rsvp_going`.
3. **One nudge at a time.** Never stack multiple modal/banner nudges in the same render. Gate with `firstSessionGuidance` or equivalent.
4. **Friend density is the unlock.** For low-density users, friend discovery is the highest-leverage action. Prefer "Find Friends" as primary CTA over "Create Event" in most empty states.
5. **Use existing infrastructure.** New activation tracking goes through `activationFunnel.ts`. New guidance gating goes through `firstSessionGuidance.ts`. Don't create parallel systems.
6. **Contacts permission at intent moments.** Don't prompt for contacts on app launch. Prompt when the user has demonstrated intent (visiting Friends tab, tapping "Find Friends", completing an event creation).
