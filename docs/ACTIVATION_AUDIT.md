# Activation Audit Report

**Date**: 2026-03-05
**Branch**: `growth/rsvp-friction-phase`
**Scope**: Activation funnel instrumentation, UX dead-ends, source attribution

---

## A) Event Inventory

### Activation / Milestone Events

| Event Name | File(s) Fired From | Props | Once-Per-User Guard | Status |
|---|---|---|---|---|
| `app_opened` | `_layout.tsx` → `PostHogLifecycle` | buildChannel, platform, appVersion | Module-level boolean `_appOpenedFired` (per cold start) | OK |
| `signup_completed` | `welcome.tsx` L477 (email), L824 (apple) | authProvider, isEmailVerified | No guard — fires on each signup attempt | OK (once per signup by nature) |
| `email_verified` | `_layout.tsx` L411 | method? | Edge-detection ref (`prevEmailVerifiedRef`) | OK |
| `first_event_created` | **NEVER CALLED** — helper in `analyticsEventsSSOT.ts` L683, `activationFunnel.ts` defines `maybeTrackFirstAction` but **zero call sites** | sourceScreen, hasFriends | AsyncStorage per-user + session Set in `activationFunnel.ts` | BROKEN — dead code |
| `first_rsvp_going` | **NEVER CALLED** | sourceScreen, entryPoint | Same as above | BROKEN — dead code |
| `first_friend_added` | **NEVER CALLED** | sourceScreen, entryPoint | Same as above | BROKEN — dead code |
| `first_circle_joined` | **NEVER CALLED** | sourceScreen, entryPoint | Same as above | BROKEN — dead code |
| `apple_signin_tap` | `welcome.tsx` L535 | (none) | No guard (intentional — measures repeated taps) | OK |
| `apple_signin_result` | `welcome.tsx` L826 (success), L835 (cancel), L840 (error) | success, durationMs, errorCode? | No guard | OK |
| `contacts_permission_result` | `welcome.tsx` L1076 | granted | No guard | OK (fires once per onboarding flow) |
| `contacts_import_result` | `welcome.tsx` L1139 | existingUsersCount, requestsSentCount | No guard | OK (fires once per send) |
| `rsvp_intent_preauth` | `deepLinks.ts` L283 | hasEvent, source | No guard | OK (fires per deep link hit) |
| `rsvp_intent_applied_postauth` | `useRsvpIntentClaim.ts` L51 (success), L62 (failure) | success, durationMs, failureCode? | No guard | OK (fires once per claim attempt) |
| `circle_invite_intent_preauth` | `deepLinks.ts` L319 | hasCircle, source | No guard | OK |
| `circle_invite_claim_postauth` | `useCircleInviteIntentClaim.ts` L54/L64 | success, durationMs, errorCode? | No guard | OK |
| `weekly_digest_card_shown` | `social.tsx` L655 | hasDigest, sourceScreen | Module-level `_digestShownThisSession` boolean | OK |
| `weekly_digest_card_tap` | `social.tsx` L740 | sourceScreen, target, hadPreviewText | No guard | OK (user action) |
| `rsvp_success_prompt_shown` | `event/[id].tsx` L1322 | source | `rsvpSuccessPromptFired` ref (once per event per mount) | OK |
| `rsvp_success_prompt_tap` | `event/[id].tsx` L2771 | source | No guard | OK (user action) |
| `rsvp_error` | `event/[id].tsx` L1366 | errorCode, network | No guard | OK (fires per error) |
| `share_plan_prompt_shown` | **NEVER CALLED** | source | N/A | DEAD CODE |
| `share_plan_prompt_tap` | **NEVER CALLED** | source | N/A | DEAD CODE |
| `post_event_recap_shown` | **NEVER CALLED** | eventAgeBucket, source | N/A | DEAD CODE |
| `post_event_recap_cta_tap` | **NEVER CALLED** | cta | N/A | DEAD CODE |

### Canonical VALUE Events (retention)

| Event Name | File(s) Fired From | Props | Guard | Status |
|---|---|---|---|---|
| `event_created` | `create.tsx` L895 | visibility, hasLocation, hasPhoto, inviteeCount, isOpenInvite | No guard (fires every create) | OK |
| `value_event_created` | `create.tsx` L902 | eventId, isOpenInvite, source, hasLocation, hasCoverImage, hasGuests, ts | No guard | OK |
| `event_rsvp` | `event/[id].tsx` L1219 | rsvpStatus, sourceScreen | No guard | OK |
| `rsvp_completed` | `event/[id].tsx` L1221 | eventId, rsvpStatus, isOpenInvite, source, hasGuests, ts | No guard | OK |

### Screen Tracking (automatic)

`usePostHogScreenTrack` in `_layout.tsx` fires `$screen` for every Expo Router path change. This gives us: `/welcome`, `/calendar`, `/social`, `/create`, `/friends`, `/event/:id`, etc. — usable as funnel step proxies.

---

## B) Funnel Map — Fastest Path to Aha

### Canonical Funnel Steps

```
Step 1: app_opened                    (exists, fires once per cold start)
Step 2: $screen /welcome              (auto — screen tracking)
Step 3: signup_completed              (exists, props: authProvider)
Step 4: $screen /welcome [slide 4]    (contacts import step — no dedicated event)
Step 5: contacts_import_result        (exists, props: requestsSentCount)
Step 6: first_friend_added            (EXISTS BUT NEVER FIRES — needs wiring)
Step 7: $screen /social OR /calendar  (auto — first feed view)
Step 8: first_rsvp_going              (EXISTS BUT NEVER FIRES — needs wiring)
     OR first_event_created           (EXISTS BUT NEVER FIRES — needs wiring)
Step 9: invite_shared                 (exists, props: entity, sourceScreen)
```

### PostHog Funnel Query (once wiring is fixed)

```
Funnel: app_opened -> signup_completed -> first_friend_added -> first_rsvp_going OR first_event_created -> invite_shared
```

**Time-to-Aha** = time from `signup_completed` to whichever of `first_rsvp_going` / `first_event_created` fires first.

### Missing Events (max 3 new additions)

**No new events are needed.** The four `first_*` events already exist in the catalog with proper typed helpers and a well-designed `activationFunnel.ts` guard system. They just need to be **wired** (call sites added). This is purely a wiring fix, not a schema change.

The automatic screen tracking via PostHog `$screen` events covers the `signup_start` step implicitly (user lands on `/welcome`). Adding a dedicated `signup_start` event is optional and not needed for the funnel to be computable.

---

## C) Duplicate Fire Check

### Events At Risk of Duplicate Fires

| Event | Risk | Current Guard | Recommendation |
|---|---|---|---|
| `first_event_created` | Would fire every event creation if wired naively | `activationFunnel.ts` AsyncStorage + session Set | **OK when wired through `maybeTrackFirstAction`** — no additional work needed |
| `first_rsvp_going` | Same | Same | OK when wired through `maybeTrackFirstAction` |
| `first_friend_added` | Same | Same | OK when wired through `maybeTrackFirstAction` |
| `first_circle_joined` | Same | Same | OK when wired through `maybeTrackFirstAction` |
| `signup_completed` | Could fire on re-login if `isNewAccount` logic has a bug | Gated by `isNewAccount` boolean in `welcome.tsx` | OK — existing guard is sufficient |
| `contacts_permission_result` | Could fire if user goes back and re-enters onboarding contacts step | No guard, but slide state machine makes this unlikely | Low risk — acceptable |
| `weekly_digest_card_shown` | Session-level | Module boolean `_digestShownThisSession` | OK |
| `app_opened` | Per cold start | Module boolean `_appOpenedFired` | OK |
| `email_verified` | Edge-only | Ref-based edge detection | OK |

**Conclusion**: The `activationFunnel.ts` guard system is well-designed. No additional guards are needed — just call sites.

---

## D) Source Attribution

### Events Missing `source` Prop

| Event | Current Props | Missing | Recommendation |
|---|---|---|---|
| `signup_completed` | authProvider, isEmailVerified | No `source` — but authProvider serves same purpose | OK as-is |
| `contacts_permission_result` | granted | No `source` | Add `source: "onboarding"` — minimal, one-line change |
| `contacts_import_result` | existingUsersCount, requestsSentCount | No `source` | Add `source: "onboarding"` — minimal |
| `email_verified` | method? | `method` is optional and sometimes omitted | Ensure caller always passes it — `_layout.tsx` L411 passes nothing | Low priority |
| `invite_shared` | shareTarget, entity, sourceScreen | `sourceScreen` is optional and sometimes omitted | Already has `sourceScreen` in type — just ensure callers pass it | Spot-check only |

### Events With Good Source Attribution

- `rsvp_completed` — has `source: "feed" | "calendar" | "event_detail" | "circle" | "unknown"`
- `value_event_created` — has `source: "calendar" | "circle" | "create" | "unknown"`
- `deep_link_landed` — has `source: "scheme" | "universal"` and `type`
- `first_*` events — have `sourceScreen` and `entryPoint`

---

## E) Dead Ends — First-Session UX

### Dead End 1: Empty Social Feed After Onboarding (No Friends)

**Screen**: `/social` — `EmptyFeed` component (L603-617)
**Problem**: New user completes onboarding, lands on `/calendar`, taps Social tab. If they skipped contacts import, feed is empty. The `EmptyFeed` shows "Create Event" button only. No friend discovery CTA.
**First-session guidance** (`shouldShowEmptyGuidanceSync("view_feed")`) shows "Invite a friend" (app share) but this shares an App Store link — it does NOT route to `/friends` or `/add-friends` to find existing users.
**Fix (minimal)**: Add a secondary "Find Friends" button in the empty feed that routes to `/add-friends`. This is a 4-line JSX addition.
**Risk**: Low — additive UI only.
**Status**: RECOMMENDED — document only, implement in follow-up.

### Dead End 2: Calendar Empty State — No CTA to Social or Friends

**Screen**: `/calendar` — "Global Empty State" section (L2453)
**Problem**: New user lands on calendar (their home screen after onboarding). If they have no events, they see... the calendar grid with no events. The scroll area below has no empty state CTA visible without scrolling.
**Fix (minimal)**: The calendar already handles empty state for list view, but the default calendar grid view doesn't surface a prominent CTA. Consider adding a floating "Create your first invite" nudge card when `allEvents.length === 0` and user is in first session.
**Risk**: Medium — touches calendar layout.
**Status**: DOCUMENT ONLY — implement in follow-up.

### Dead End 3: Post-Onboarding Profile Screen — No Forward Navigation

**Screen**: `/profile` — accessed via bottom nav
**Problem**: If a new user taps Profile first (curiosity), they see their profile with 0 events, 0 friends, empty stats. No suggested next action. They must discover other tabs on their own.
**Fix (minimal)**: This is acceptable for profile — it's not the primary path. Lower priority.
**Risk**: Low.
**Status**: ACCEPTABLE — no change needed.

### Dead End 4 (Bonus): Contacts Import Skip → No Alternative Friend Discovery

**Screen**: `/welcome` slide 4 (contacts import)
**Problem**: User who denies contacts permission or skips sees "Skip" and lands on the finish screen. There is no alternative friend discovery offered (search by name, invite link, etc.).
**Fix (minimal)**: After contacts permission denied, show a "Search by name or email" input inline. This is a larger change.
**Risk**: Medium.
**Status**: DOCUMENT ONLY — implement in follow-up.

---

## F) Critical Fix: Wire `maybeTrackFirstAction` Call Sites

The `activationFunnel.ts` module is complete and well-guarded, but has **zero call sites**. The four activation milestone events (`first_event_created`, `first_rsvp_going`, `first_friend_added`, `first_circle_joined`) never fire.

### Required Wiring (4 call sites)

#### 1. `first_event_created` — in `src/app/create.tsx`

**Location**: `createMutation.onSuccess` callback (~L893)
**After**: `trackEventCreatedAnalytics({...})` call
**Add**:
```typescript
import { maybeTrackFirstAction } from '@/lib/activationFunnel';
// ... in onSuccess:
const userId = session?.user?.id;
if (userId) {
  maybeTrackFirstAction('event_created', userId, {
    sourceScreen: 'create',
    hasFriends: false, // TODO: could check friends count
  });
}
```

#### 2. `first_rsvp_going` — in `src/app/event/[id].tsx`

**Location**: RSVP mutation `onSuccess` callback (~L1219), gated on `status === "going"`
**After**: `trackRsvpCompleted({...})` call
**Add**:
```typescript
if (status === "going") {
  const userId = session?.user?.id;
  if (userId) {
    maybeTrackFirstAction('rsvp_going', userId, {
      sourceScreen: 'event_detail',
      entryPoint: 'rsvp_button',
    });
  }
}
```

#### 3. `first_friend_added` — in `src/app/add-friends.tsx`

**Location**: Friend request mutation `onSuccess` callback
**Add**:
```typescript
const userId = session?.user?.id;
if (userId) {
  maybeTrackFirstAction('friend_added', userId, {
    sourceScreen: 'add_friends',
    entryPoint: 'search',
  });
}
```
Also wire in `src/app/suggestions.tsx` friend request mutation with `entryPoint: 'suggestion'`.

#### 4. `first_circle_joined` — in `src/hooks/useCircleInviteIntentClaim.ts`

**Location**: After successful circle join (~L54)
**Add**:
```typescript
if (userId) {
  maybeTrackFirstAction('circle_joined', userId, {
    sourceScreen: 'circle_invite_claim',
    entryPoint: 'deep_link',
  });
}
```

---

## G) Summary of Recommended Changes (Priority Order)

### P0 — Wire activation funnel (this commit)

1. Add `maybeTrackFirstAction('event_created', ...)` call in `create.tsx` onSuccess
2. Add `maybeTrackFirstAction('rsvp_going', ...)` call in `event/[id].tsx` onSuccess when status === "going"
3. Add `maybeTrackFirstAction('friend_added', ...)` call in `add-friends.tsx` onSuccess
4. Add `maybeTrackFirstAction('circle_joined', ...)` call in `useCircleInviteIntentClaim.ts` onSuccess

### P1 — Source attribution (next commit)

5. Add `source: "onboarding"` to `contacts_permission_result` and `contacts_import_result` calls in `welcome.tsx`

### P2 — Dead-end fixes (follow-up)

6. Add "Find Friends" CTA in social feed empty state (route to `/add-friends`)
7. Add inline empty-state nudge card in calendar when `allEvents.length === 0`

### P3 — Dead code cleanup (housekeeping)

8. Wire or remove `share_plan_prompt_shown` / `share_plan_prompt_tap` (currently dead)
9. Wire or remove `post_event_recap_shown` / `post_event_recap_cta_tap` (currently dead)

---

## H) Verification Checklist

- [ ] After wiring, `maybeTrackFirstAction` fires exactly once per user per milestone (AsyncStorage + session Set)
- [ ] PostHog funnel: `signup_completed -> first_friend_added -> first_rsvp_going` is computable
- [ ] Time-to-Aha: `signup_completed.timestamp -> first_rsvp_going.timestamp` delta is queryable
- [ ] No new dependencies added
- [ ] No navigation architecture changes
- [ ] `analyticsEventsSSOT.ts` remains the only event catalog (SSOT preserved)
