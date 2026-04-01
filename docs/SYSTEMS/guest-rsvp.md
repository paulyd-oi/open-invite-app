# Guest RSVP

> Non-users can RSVP to events from the web without downloading the app.
> Owner: `my-app-backend/src/routes/publicEvents.ts`, `openinvite-website/src/components/RsvpSection.tsx`

---

## Data Model

**Table:** `guest_rsvp` (Prisma model)

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (cuid) | Primary key |
| `eventId` | String | FK → event, cascade delete |
| `name` | String | Required, trimmed, max 100 |
| `email` | String? | Optional, used for email-based dedup |
| `phone` | String? | Not currently collected |
| `contact` | String? | Legacy field, preserved for backward compat |
| `status` | String | `"going"` or `"not_going"`, default `"going"` |
| `token` | String (cuid) | Unique, auto-generated, returned to client |
| `ipAddress` | String? | Extracted from x-forwarded-for for rate limiting |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

**Unique constraints:**
- `token` — unique globally
- `(eventId, email)` — email-based dedup per event (nulls excluded by Prisma)

---

## Endpoints

### `GET /api/events/:id/public` (no auth)

Returns public event data for the web page. Includes:
- Event metadata (title, date, location, theme, cover)
- Host info (first name + avatar)
- RSVP counts (going/maybe) — respects `showGuestCount` flag
- Guest preview lists (capped at 8 per status) — respects `showGuestList` flag
- `guestRsvps` array (id, name, status, createdAt — no email/phone/token)
- Privacy flags (showGuestList, showGuestCount, showLocationPreRsvp, hideWebLocation)
- Location privacy: full address, city-only, or null depending on flags + guest token

**Guest token location reveal:** If `x-guest-token` header is present and the token belongs to a "going" RSVP for this event, the full address is returned even when `showLocationPreRsvp=false`.

**Visibility guard:** Only `open_invite` and `all_friends` events are public. Private events return 403.

### `POST /api/events/:id/rsvp/guest` (no auth, rate-limited)

Creates or updates a guest RSVP. Rate limited: 10 per IP per hour.

**Request body:** `{ name: string, email?: string, status: "going" | "not_going" }`

**Dedup logic (in order):**
1. **Token-based:** If `x-guest-token` header is present and matches an existing RSVP for this event → update in place
2. **Email-based:** If email is provided and matches an existing RSVP for this event → update in place
3. **New:** Create a new `guest_rsvp` row

**Response:** `{ id, name, status, token, createdAt }` — token is returned for client storage.

---

## Web Flow

```
Share link → www.openinvite.cloud/event/:id
  → Server fetches GET /api/events/:id/public
  → EventPageClient renders EventCard + RsvpSection
  → User taps "Going" or "Can't Make It"
  → Name + email form appears
  → POST /api/events/:id/rsvp/guest
  → Token stored in localStorage (oi_guest_rsvp_{eventId})
  → Status stored in localStorage (oi_guest_status_{eventId})
  → Success state + App Store CTA
  → If "going": client re-fetches public event with x-guest-token → location revealed
```

---

## Token Lifecycle

1. **Created:** Backend generates a cuid token when a new `guest_rsvp` row is created
2. **Returned:** Token is in the POST response body
3. **Stored:** Website saves to `localStorage` key `oi_guest_rsvp_{eventId}`
4. **Sent on upserts:** `x-guest-token` header on subsequent POST requests → enables token-based dedup
5. **Sent on re-fetch:** `x-guest-token` header on GET `/api/events/:id/public` → enables location reveal
6. **Returning visitor rehydration:** On mount, `EventPageClient` checks `localStorage` for existing token + status → if found, fetches event data with token header and restores RSVP state without re-submitting

---

## App Rendering

- **Guest going list:** `event/[id].tsx` extracts `guestRsvps` from the event response, filters by status
- **effectiveGoingCount:** `baseGoingCount + guestGoingCount` (only added when `showGuestCount` is true)
- **WhosComingCard:** Receives `guestGoingList` prop, rendered separately from authenticated attendees
- **AttendeesSheet:** Receives `guestGoingList` prop for the full attendees modal

---

## Key Files

| File | Purpose |
|------|---------|
| `my-app-backend/src/routes/publicEvents.ts` | Guest RSVP + public event endpoints |
| `my-app-backend/prisma/schema.prisma` (model `guest_rsvp`) | Data model |
| `openinvite-website/src/components/RsvpSection.tsx` | RSVP form UI + token storage |
| `openinvite-website/src/components/EventPageClient.tsx` | Returning visitor rehydration |
| `openinvite-website/src/components/GuestPreview.tsx` | Guest list display on web |
| `open-invite-app/src/app/event/[id].tsx` | effectiveGoingCount, guest list rendering |

---

## Invariants

- Guest RSVPs NEVER merge into the `event_interest` (user RSVP) table. They are always separate.
- Friendship NEVER gates guest RSVP. Any visitor to a public event page can RSVP.
- No SMS or auth required for guest RSVP — name only, email optional.
- Token is the guest's only identity. Lost token = lost ability to update (email dedup is fallback).
- Public endpoint visibility guard: only `open_invite` and `all_friends` events are accessible. Private events return 403.
- Guest RSVP response NEVER includes email, phone, or token of other guests.
- Rate limit: 10 guest RSVPs per IP per hour.

---

## Gotchas

- `guest_rsvp.token` is returned in the POST response but NEVER in the GET `/public` response's `guestRsvps` array — this is intentional to prevent token leakage.
- Email dedup uses Prisma's `@@unique([eventId, email])` — null emails are excluded from the unique constraint, so multiple no-email RSVPs from the same IP are allowed.
- The `goingCount` field on the `event` model tracks authenticated RSVPs only. Guest going count is computed at read time by counting `guest_rsvp` rows.
- `effectiveGoingCount` in the app includes `+1` for the host (done in `serializeEvent` via `displayGoingCount = 1 + rawGoingCount`), then adds guest going count client-side.
- Location reveal requires a valid going token AND `hideWebLocation=false` — if `hideWebLocation=true`, location is null regardless of token.

---

## Future

- Guest RSVP → app user reconciliation (match by email after signup)
- Guest RSVP notifications (email confirmation)
