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
- Post-RSVP prompt arbitration: PostValueInvite > FirstRsvpNudge > NotificationPrePrompt
- NotificationPrePrompt only fires if user has NOT created any events (targets social-only users)

---

## Comments

- Inline in event page (no separate route)
- Create: `POST /api/events/:id/comments` → `{ content, imageUrl? }`
- Delete: `DELETE /api/events/:id/comments/:commentId`
- Invalidates: `eventKeys.comments(id)`
- No realtime — fetch-on-demand only

---

## Share

- `shareEvent(event)` → `buildEventSharePayload()` → native `Share.share()`
- Universal link: `go.openinvite.cloud/share/event/:id`
- Source of truth: `src/lib/shareSSOT.ts`

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

## Invariants

- Particle layer is exclusive: effect OR theme particles, never both.
- Theme gradient, video, styling, and filters are NOT suppressed by effects — only particles are exclusive.
- Edit page uses same ThemeTray + EffectTray components as create flow.
- Edit hydrates theme/effect state from event data on load.
- Post-create navigation must use `router.replace` (not push) to prevent stacking create screen in history.
