# Event Page

> Event detail view and edit flow.
> Owner: `src/app/event/[id].tsx`, `src/app/event/edit/[id].tsx`

---

## Render Layers (back to front)

```
1. SafeAreaView (canvasColor from theme)
2. AnimatedGradientLayer (if visualStack.gradient)
3. ThemeVideoLayer (if visualStack.video)
4. Particle layer (EXCLUSIVE):
   - IF effectId: MotifOverlay (user-selected effect)
   - ELSE: ThemeEffectLayer (theme-bundled particles/lottie)
5. ThemeFilterLayer (if visualStack.filter)
6. Blurred photo backdrop (Cloudinary blur + gradient scrim)
7. Content: InviteFlipCard + event details
```

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
- Edit page uses same ThemeTray + EffectTray components as create flow.
- Edit hydrates theme/effect state from event data on load.
- Post-create navigation must use `router.replace` (not push) to prevent stacking create screen in history.
