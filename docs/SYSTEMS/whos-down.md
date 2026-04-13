# Who's Down? (Casual Idea Posts)

> Lightweight idea posts visible to friends only. Convertible to a real event later.
> Owners (FE): `src/app/discover.tsx` (Who's Down tab), `src/app/event-request/[id].tsx` (casual branch).
> Owners (BE): `my-app-backend/src/routes/eventRequests.ts` (casual branches), `my-app-backend/prisma/schema.prisma` (`event_request` model extension).
> Proof tag: `[WHOS_DOWN_V1]`

---

## Product Model

Who's Down is **NOT** a real event. It is:

- An idea post ("Bowling tonight?")
- Visible to **friends only** (creator's friend graph)
- Has no committed time (just an optional time hint chip)
- Convertible later into a real event via the standard `/create` pipeline

It is **NOT**:

- A chat
- A comment thread
- An invitee-based RSVP system
- A new event type

---

## Data Model (Backend)

`event_request` is extended (additive, default-safe):

```prisma
mode                String    @default("formal")  // "formal" | "casual"
timeHint            String?
whereText           String?
expiresAt           DateTime?
thresholdNotifiedAt DateTime?
convertedToEventId  String?   // set by /confirm-converted; links idea → real event
startTime           DateTime?  // nullable for casual mode (no sentinel dates)
```

Indexes: `(mode, status, expiresAt)`, `(creatorId, mode, status)`.

Migration: `prisma/migrations/20260413000000_add_whos_down_to_event_request/`.

---

## Endpoints

| Verb / Path | Behavior |
|---|---|
| `POST /api/event-requests` (mode = "formal") | Original invite-based event request. Unchanged. |
| `POST /api/event-requests` (mode = "casual") | Title required. `startTime`/`memberIds` ignored. Server sets `expiresAt = now + 48h`. No invite pushes (no invitees). |
| `GET /api/event-requests` | Returns FORMAL only (`mode: "formal"` filter). Casual posts excluded. |
| `GET /api/event-requests/feed/whos-down` | Friends-only active casual feed: `mode === "casual"`, `status === "pending"`, `expiresAt > now`, `creatorId IN (viewer + viewer.friends)`. Newest first. Returns `{ items, activeCount }`. |
| `GET /api/event-requests/:id` (casual) | Access: creator OR friend-of-creator. Expired casual posts return 404. |
| `PUT /api/event-requests/:id/respond` (casual) | Upserts `event_request_member`. `accepted` = "I'm Down". `declined` = "Not This Time". NO auto-event-creation. Threshold push to creator on first cross of 3 down (one-shot). |
| `POST /api/event-requests/:id/nudge` | Formal only. Returns 400 for casual. |
| `POST /api/event-requests/:id/suggest-time` | Formal only. Returns 400 for casual. |
| `DELETE /api/event-requests/:id` | Creator-only cancel. Works for both modes. |
| `POST /api/event-requests/:id/confirm-converted` | Creator-only state transition. Body: `{ eventId }`. Validates the event exists and is owned by the same creator. Sets `status = "confirmed"` and `convertedToEventId = eventId`. Notifies "down" friends with the new event link. Idempotent on same eventId. |

**No real-event creation in this endpoint.** The frontend creates the event via the standard `/api/events` POST first, then calls `/confirm-converted` with the resulting `eventId`. Removes the idea from `feed/whos-down` immediately (feed filters `status === "pending"`).

---

## Invariants

- **No sentinel dates.** `startTime` is nullable for casual mode. No `2099-01-01` placeholder.
- **Friends-only visibility.** Casual posts are scoped to viewer's friend graph (`friendship.userId === viewer.id` direction, matching existing convention). No public lane, no circle scope.
- **Formal preserved.** All formal-mode behavior is unchanged. Default `mode = "formal"` keeps every existing client/integration working.
- **No auto-event-creation in casual.** The respond handler's all-accepted/all-responded auto-create branches do NOT execute for casual.
- **Threshold push is one-shot.** `thresholdNotifiedAt` column gates the "X people are down" push. Subsequent accepts past 3 do not re-push.
- **Expiration is read-side.** `feed/whos-down` and `GET /:id` filter expired posts. No cron required for v1. Status remains `"pending"` until creator deletes or DB record ages out.
- **`orderBy: { startTime }` on event_request requires `mode: "formal"` filter.** Postgres places nullable `startTime` ASC NULLS LAST by default, but explicit filter is the contract.
- **Conversion is frontend-driven.** Tap "Make It Happen" → navigate to `/create` with prefill (title, timeHint→date suggestion, whereText→location, default visibility = Open Invite). No backend conversion endpoint. No auto-RSVP of "down" users. They are notified via the threshold push (or the new event's friend-graph reach) and RSVP through normal channels.

---

## Threshold Notification

Constant: `WHOS_DOWN_THRESHOLD = 3`.

Trigger: when the count of `event_request_member.status === "accepted"` crosses 3 on a `respond` call AND `thresholdNotifiedAt IS NULL`.

Push payload:
- title: `"3 people are down 🎉"`
- body: `Make it happen — turn "{title}" into an event`
- data: `{ type: "whos_down_threshold", eventRequestId }`

Push category: `event_request` (existing governance bucket).

Per-respond in-app notification (separate from threshold push):
- type: `whos_down_response`
- Always created on respond, both accepted and declined.

---

## Conversion Flow

The frontend orchestrates conversion as a two-step write:

1. **Create the real event** via the standard `POST /api/events` pipeline (full visibility/circle/group support — no logic duplicated in `eventRequests.ts`).
2. **Mark the idea confirmed** via `POST /api/event-requests/:id/confirm-converted` with `{ eventId }`. This:
   - Verifies the event exists and is owned by the same creator (prevents arbitrary linkage).
   - Sets `status = "confirmed"` and `convertedToEventId = eventId`.
   - Notifies "down" friends with the new event link (no auto-RSVP — they decide normally).
   - Is idempotent on the same eventId so a frontend retry is safe.

Because `feed/whos-down` filters `status === "pending"`, the idea disappears from the feed immediately on the next read after `/confirm-converted`. The casual request also expires naturally at 48h if `/confirm-converted` is never called.

**No server-side event creation.** Conversion is a pure state transition + notification fanout. The standard event-create pipeline owns event creation.

**No auto-RSVP.** Converted events do NOT auto-RSVP "down" users — they receive a `whos_down_converted` push linking to the event and RSVP through normal channels. This keeps the casual idea decoupled from any invitee mechanic.

---

## Frontend Surface (v1)

### Discover Lens (SSOT: `src/app/discover.tsx`)

Discover tabs are now **Map / Events / Who's Down** (`type Lens = "map" | "events" | "whos_down"`). The former "Responded" lens folded into Events as a `"responded"` pill with Going / Not Going sub-filter. The Who's Down lens label shows a count badge `(N)` when `whosDownActiveCount > 0` (overflow clamps to `99+`).

### Data source

- Query: `useQuery({ queryKey: qk.whosDownFeed(), queryFn: () => api.get<WhosDownFeedResponse>("/api/event-requests/feed/whos-down") })`
- SSOT key: `qk.whosDownFeed()` → `["whos-down-feed"]` in `src/lib/queryKeys.ts` (registered in `QK_OWNED_ROOTS` for DEV inline-key linting).
- Refresh: registered in `useLiveRefreshContract.refetchFns` so pull-to-refresh + foreground return both hit it.
- Staleness: 30s, no refetchOnMount/OnWindowFocus (standard Discover pattern).

### Create flow

No separate screen. The Who's Down pane renders a static explainer card at the top ("Have an idea to do?") + a "Post an Idea" chip. Tap opens a **bottom-sheet Modal** (not full screen) with:

- Idea title (required, maxLength 120).
- Time hint chips (single-select, optional): `Tonight` · `Tomorrow` · `This Weekend` · `Next Week` · `Anytime`. Stored verbatim as `timeHint` string.
- `whereText` (optional free text).
- Friends-only helper row ("Only your friends can see this").
- "Post Idea" button → `POST /api/event-requests` with `{ mode: "casual", title, timeHint?, whereText? }`. On success invalidates `qk.whosDownFeed()` + `qk.eventRequests()`.

The same pane shows feed cards below: each card has title + emoji avatar, `timeHint` chip, `whereText` row, creator name ("Your idea" / "From {firstName}"), down count with Users icon, and a compact **"I'm Down" / "You're Down"** action (disabled-when-down, hidden for own ideas). Cards are `Pressable` and navigate to `/event-request/{id}` (casual detail branch). Empty state: "No ideas yet · Be the first · Post an Idea".

### Detail branch (SSOT: `src/app/event-request/[id].tsx`)

`mode === "casual"` branches to a distinct view that is NOT the formal invitee-list UI:

- Idea card: emoji + title + "Your idea" / "From {name}"; `timeHint` + `whereText` pills; friends-only helper.
- Down count header: `"{N} people down"` (pluralized, "No one down yet" when empty).
- Avatar grid of accepted responders with first names.
- Non-creator pinned bottom: "I'm Down" (switches to "You're Down ✓" after accept). `respondMutation` on casual mode invalidates `qk.whosDownFeed()` + the detail key and **does not navigate away** (no auto-event-create, no router.back()).
- Creator: "Make It Happen" (primary) + "Cancel Idea" (destructive).
- If `status === "confirmed"` and `convertedToEventId` is set, a green confirmed banner links to the real event.

### Conversion UX

"Make It Happen" navigates to `/create` with prefill params:

```
router.push({ pathname: "/create", params: {
  title:        eventRequest.title,
  emoji:        eventRequest.emoji ?? "✨",
  location:     eventRequest.whereText ?? "",
  visibility:   "open_invite",
  fromWhosDownId: eventRequest.id,
}})
```

`src/app/create.tsx` accepts `location` and `fromWhosDownId` URL params. `location` is piped through `locationSearch.prefillLocation()` once (ref-guarded). After a successful `POST /api/events` and before `router.replace("/event/{id}?from=create")`, if `fromWhosDownId` is present, the create screen fires `POST /api/event-requests/{fromWhosDownId}/confirm-converted` with `{ eventId }` and invalidates `qk.whosDownFeed()` + `qk.eventRequests()`. Failure is non-blocking (event already exists; only the idea state transition is best-effort).

### Shared contracts (SSOT: `shared/contracts.ts`)

Frontend uses `WhosDownFeedResponse`, `EventRequest` (with `mode` / `timeHint` / `whereText` / `expiresAt` / `convertedToEventId`), `CreateEventRequestResponse`, `RespondEventRequestResponse`, `ConfirmConvertedInput` / `ConfirmConvertedResponse`.
