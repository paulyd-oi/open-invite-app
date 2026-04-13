# Event Page

> Event detail view and edit flow.
> Owner: `src/app/event/[id].tsx`, `src/app/event/edit/[id].tsx`

---

## Render Layers (back to front)

```
1. SafeAreaView (canvasColor from theme)
2. AnimatedGradientLayer (if visualStack.gradient AND no active video)  ← suppressed when video is active
3. ThemeVideoLayer (if visualStack.video)
4. Particle layer (EXCLUSIVE, and ALSO suppressed when video is active):
   - IF effectId: MotifOverlay (user-selected effect)
   - ELSE: ThemeEffectLayer (theme-bundled particles/lottie)
5. ThemeFilterLayer (if visualStack.filter) ← kept; static Skia, no per-frame work
6. Blurred photo backdrop (Cloudinary blur + gradient scrim)
7. Content: InviteFlipCard + event details
```

### Video Containment Rule (scroll-perf invariant)

Orchestrator: `src/components/event/ThemeBackgroundLayers.tsx`
Proof tag: `[PERF_VIDEO_CONTAINMENT_V1]`

When a theme video is both declared AND resolvable via `THEME_VIDEOS`, only one animated visual system runs behind content on event detail: the video itself. Specifically:

- `AnimatedGradientLayer` is **not rendered** — the video (and its poster fallback for reducedMotion / load-failure paths) already covers the atmosphere layer.
- Particle layer (`MotifOverlay` or `ThemeEffectLayer`) is **not rendered** — Skia per-frame simulation (useFrameCallback) composited over video decode caused scroll jank.
- `ThemeFilterLayer` is preserved — it's a single static Skia canvas with no per-frame animation, so it remains cheap and gives the video its post-processed look.

Rationale: stacking Reanimated gradient crossfade + Skia particle simulation + video decode + Skia filter canvas created four contended compositors on scroll. Containing to (video + static filter) keeps the premium look while returning scroll headroom.

This rule is enforced inside `ThemeBackgroundLayers.tsx`. Do not re-enable gradient or particle layers alongside a video in that component without re-validating scroll perf on device.

---

## Query Keys

| Key | Purpose |
|-----|---------|
| `eventKeys.single(id)` | Event metadata |
| `eventKeys.rsvp(id)` | Viewer's RSVP status |
| `eventKeys.attendees(id)` | Who's coming roster |
| `eventKeys.interests(id)` | Interested/maybe list |
| `eventKeys.comments(id)` | Comments feed |
| `eventKeys.mute(id)` | Mute status |

---

## RSVP System

- Mutation: `useRsvpMutation()` with optimistic updates
- Targets: `rsvp`, `attendees`, `single` keys
- Invalidates on settle: `feed`, `feedPaginated`, `myEvents`, `calendar`, `attending`
- Statuses: `going`, `interested`, `not_going`, `maybe`, `invited`, `null`
- Side effect: Auto-starts Live Activity on "going" (iOS)
- Pre-auth RSVP: if unauthenticated user taps Going/Interested, intent is stored via `setPendingRsvpIntent()` (SecureStore, 7-day expiry), a "Sign up to confirm your RSVP" toast fires, then redirects to `/welcome`. After auth, `useRsvpIntentClaim` in `_layout.tsx` auto-applies the RSVP.
- Post-RSVP prompt arbitration: PostValueInvite > FirstRsvpNudge > NotificationPrePrompt
- NotificationPrePrompt only fires if user has NOT created any events (targets social-only users)
- **Sticky bottom RSVP bar:** Floating bar pinned to bottom for guests. Visible when: `!isMyEvent && !event?.isBusy && event && !hasJoinRequest && myRsvpStatus !== "going"`. Shows "I'm In" (primary, solid green) + "Save" (secondary). Full events show disabled "Full" state. Reuses `handleRsvp()` — no duplicated business logic. Auto-dismisses when `myRsvpStatus` changes to "going" or `hasJoinRequest` becomes true. Supports pre-auth RSVP flow for logged-out users. Scroll content gets extra paddingBottom when bar is visible. Shows "X going" count text (muted, above buttons) when `effectiveGoingCount > 0`.
- **Social proof row:** Compact avatar stack + "X going" text (or "Be the first to join" zero-state) placed adjacent to the inline RSVP buttons. Inherits guest-only visibility from parent `!isMyEvent && !event?.isBusy` block. Also shown above "You're Attending" bar for confirmed attendees (reinforces decision). Data sourced from existing `attendeesList` (max 4 avatars) and `effectiveGoingCount` — no new queries.
- **Find Friends nudge:** Post-RSVP inline card exposing contacts import flow. Visible when: `!isMyEvent && myRsvpStatus === "going" && !showRsvpSuccessPrompt && !findFriendsNudgeDismissed`. CTA routes to `/find-friends`. Dismiss persisted via AsyncStorage key `dismissedFindFriendsNudge`. Placed after success prompt, before social proof row — avoids stacking with success prompt via `!showRsvpSuccessPrompt` guard.

---

## Comments

- Inline in event page (no separate route)
- Create: `POST /api/events/:id/comments` → `{ content, imageUrl? }`
- Delete: `DELETE /api/events/:id/comments/:commentId`
- Invalidates: `eventKeys.comments(id)`
- No realtime — fetch-on-demand only

---

## Share

All event share copy lives in `src/lib/shareSSOT.ts`. No inline composition in event/[id].tsx.

| Surface | Builder | Template |
|---------|---------|----------|
| Native share sheet | `buildEventSharePayload()` | `{title} {day/time}\n\nJoin us\n\n{link}` |
| SMS / Text | `buildEventSmsBody()` | `{emoji} {title} {day/time} — you in?\n\n{link}` |
| Copy Link | `getEventUniversalLink()` | bare universal link |
| Host Reminder | `buildEventReminderText()` | `{title} {day/time} — coming up\n\n{link}` |

- Universal link: `go.openinvite.cloud/share/event/:id`
- `buildShareInput()` in event/[id].tsx converts raw event data → `EventShareInput` (shared by all surfaces)
- All 4 native share call sites route through `shareEvent()` → `buildEventSharePayload()`

---

## Edit Flow (event/edit/[id].tsx)

**Components:** ThemeTray, EffectTray, EmojiPicker, DateTimePicker

**Save payload:**
```
title, description?, location?, emoji,
startTime, endTime, visibility, groupIds?,
capacity?, pitchIn*?, bringList*?,
themeId?, customThemeData?, effectId?, customEffectConfig?
```

**Mutations:**
- Update: `PUT /api/events/${id}` → `getInvalidateAfterEventEdit(id)`
- Delete: `DELETE /api/events/${id}` → `getInvalidateAfterEventDelete()`

---

## Navigation Sources

- **Create flow:** `router.replace(/event/{id}?from=create)` — immediate, no intermediate UI
- **Feed/discover:** `router.push(/event/{id})` — standard push
- **Calendar:** `router.push(/event/{id})` — standard push
- **Universal link:** `go.openinvite.cloud/share/event/:id` → deep link

The `from=create` param triggers the post-create share nudge (see below).

---

## Post-Create Share Nudge

When `from=create` and user is the event owner:

- Inline banner appears below the invite card: "Your event is live — Share it to get responses"
- Primary CTA: Share button (invokes existing `shareEvent()` flow)
- Dismiss: X button or tapping Share (both hide the banner)
- State: `useState(isFromCreate)` — shown once per entry, not persisted
- Does not appear for: deep links, normal browsing, non-owners, revisits

---

## Analytics — Core Funnels

Source of truth: `src/analytics/analyticsEventsSSOT.ts`
Identity: `posthogIdentify()` at `src/app/_layout.tsx:414` (centralized, ref-guarded)

### Event Inventory

| Event | File | Line | Payload | Dedup |
|-------|------|------|---------|-------|
| `event_page_viewed` | event/[id].tsx | 524 | `{ eventId, from, userId, isAuthenticated, isCreator }` | useRef |
| `share_triggered` | event/[id].tsx | 2793, 2815, 2836 | `{ eventId, method, userId, isCreator }` | none (intentional) |
| `rsvp_attempt` | event/[id].tsx | 1646 | `{ eventId, userId, isAuthenticated, isCreator }` | none (intentional) |
| `rsvp_redirect_to_auth` | event/[id].tsx | 1678 | `{ eventId, userId: null, isAuthenticated: false }` | none |
| `rsvp_success` | event/[id].tsx | 1411 | `{ eventId, userId, isCreator }` | mutation onSuccess |
| `create_completed` | create.tsx | 309 | `{ eventId, userId }` | mutation onSuccess |

`userId` is `null` when logged out, never `undefined`.

### Funnel 1 — Share Conversion

```
share_triggered → event_page_viewed (on recipient device)
```
- Segment by: `method` (native / sms / copy), `isCreator`
- Note: cross-device — requires matching via eventId

### Funnel 2 — RSVP Conversion

```
event_page_viewed → rsvp_attempt → rsvp_success
```
- Segment by: `isAuthenticated`, `from` (create / feed / deep link)
- Key metric: conversion rate from view to success

### Funnel 3 — Auth Friction

```
rsvp_attempt → rsvp_redirect_to_auth → rsvp_success
```
- Segment by: `isAuthenticated` on `rsvp_attempt`
- Measures: drop-off at auth redirect, recovery rate post-auth
- Note: `rsvp_success` fires post-auth via intent claim (different session)

### Funnel 4 — Creator Loop

```
create_completed → share_triggered → event_page_viewed
```
- Segment by: `userId` (creator identity), `method`
- Measures: share rate after creation, viral reach per event

### PostHog Dashboard Spec

**Dashboard 1 — Core Funnel**
- Funnels 1 + 2
- Funnel visualization: `event_page_viewed` → `rsvp_attempt` → `rsvp_success`
- Breakdown: `from` (entry source), `isCreator`
- Time range: 7d / 30d

**Dashboard 2 — Auth Friction**
- Funnel 3
- Funnel visualization: `rsvp_attempt` → `rsvp_redirect_to_auth` → `rsvp_success`
- Filter: `isAuthenticated = false` on `rsvp_attempt`
- Key insight: what % of unauthenticated users complete RSVP post-auth

**Dashboard 3 — Creator Loop**
- Funnel 4
- Funnel visualization: `create_completed` → `share_triggered` → `event_page_viewed`
- Breakdown: `method` on `share_triggered`
- Key insight: share rate per creation, which channel drives most views

---

## Invariants

- Particle layer is exclusive: effect OR theme particles, never both.
- Theme gradient, video, styling, and filters are NOT suppressed by effects — only particles are exclusive.
- **Active theme video suppresses animated gradient + particle layer on event detail** (see Video Containment Rule above). Only `ThemeFilterLayer` remains alongside the video. Create/edit/other surfaces keep full stack.
- Edit page uses same ThemeTray + EffectTray components as create flow.
- Edit hydrates theme/effect state from event data on load.
- Post-create navigation must use `router.replace` (not push) to prevent stacking create screen in history.
- **Location card always renders** under normal (non-busy) event detail conditions. Proof tag: `[P0_LOCATION_ALWAYS_RENDER]`. The section MUST NOT be suppressed based on location state — only `!isBusyBlock` (imported/busy calendar events) may suppress it alongside other detail cards. Three explicit states, in strict precedence order:
  1. **No location set** (`!locationDisplay`) → copy: `"Location not set"`. Non-tappable. Muted icon. No mini map. No directions chevron. This state wins unconditionally — a user must NEVER be told to "RSVP to see location" for an event that has no location at all.
  2. **Hidden until RSVP** (`locationDisplay` exists AND `locationHiddenByPrivacy` is true) → copy: `"RSVP to see location"`. Non-tappable. Muted icon. No mini map. No directions chevron. `locationHiddenByPrivacy` encodes `showLocationPreRsvp === false && !isMyEvent && viewerRsvpStatus ∉ {going, interested}` — host bypass is preserved.
  3. **Visible location** → existing map (when coords present) + tappable "Get Directions" row opening the maps deep link via `openEventLocation()`.
  Map pin, "Get Directions" chevron, and the `Pressable` wrapper MUST render ONLY in state 3. States 1 and 2 render a static `<View>` at `opacity: 0.65` with `colors.textSecondary` text and a `colors.textTertiary` compass icon.
- **Discussion access = event-view access. RSVP is NEVER a gate on commenting.** Proof tag: `[P0_COMMENT_ACCESS_PARITY_V1]`. If a viewer can access the event detail page (owner / co-host / attending / circle member / public or open_invite / friend with visibility access for `all_friends` + `specific_groups` with matching group membership), they can read AND post comments — independent of RSVP status. Rationale: users must be able to ask questions or clarify details before committing to attend. Enforcement:
  1. **Frontend (`src/app/event/[id].tsx`):** The Discussion card MUST NOT render an RSVP blur overlay. `hideDetailsUntilRsvp` / `shouldBlurDetails` still gates Who's Coming and Location, but NEVER Discussion. No UI copy may read "RSVP to see discussion" or "RSVP to comment".
  2. **Backend (`my-app-backend/src/routes/events-interactions.ts`):** GET and POST `/api/events/:id/comments` MUST call `canAccessEventDiscussion()`, which mirrors the access ladder of `events-crud.ts` GET `/:id` (owner/host → attending → circle-member → public/open_invite → friend-with-visibility-access). The prior RSVP-shortcut gate is removed — RSVP is NOT a substitute for visibility, and visibility is NOT a substitute for RSVP. The two are independent contracts. Moderation/blocking/reporting rules are preserved elsewhere and are NOT affected by this invariant.
- **Focus-return refresh includes attendee freshness.** Proof tag: `[EVENT_FOCUS_ATTENDEE_FRESH_V1]`. When the event detail screen regains focus (Expo Router `useFocusEffect`), `getRefetchOnEventFocus(eventId)` MUST invalidate `single`, `interests`, `comments`, `rsvp`, `attendees`, AND `rsvps`. The last two are required so that the Who's Coming roster and the grouped-RSVP sections (going / interested / not_going / maybe) converge when another user RSVPs while the page is backgrounded. Without `attendees` and `rsvps` in this set, the numeric `goingCount` (from `single`) would refresh but the avatar list and not-going group would stay stale. This is a READ-SIDE freshness contract — the write-side RSVP mutation already invalidates both keys via `getInvalidateAfterRsvpJoin` / `getInvalidateAfterRsvpLeave`.
