# Privacy System

> Host-controlled event privacy for web and app surfaces.
> Owner: `src/components/create/SettingsSheetContent.tsx`, `my-app-backend/src/routes/publicEvents.ts`

---

## Privacy Flags

| Flag | Type | Default | Purpose |
|------|------|---------|---------|
| `showGuestList` | boolean | `true` | Show attendee names on event page |
| `showGuestCount` | boolean | `true` | Show going/maybe counts |
| `showLocationPreRsvp` | boolean | `false` | Show full address before guests RSVP |
| `hideWebLocation` | boolean | `false` | Hide location entirely on web page |

All 4 flags are optional booleans in both `createEventRequestSchema` and `updateEventRequestSchema` (Zod schemas in `shared/contracts.ts` lines 144-147, 299-302).

---

## Authoring

**Create/Edit flow:** Privacy & Display section in `SettingsSheetContent.tsx` (lines 586-620).

Each flag has a toggle switch. The `hideWebLocation` → `showLocationPreRsvp` interaction:
- When `hideWebLocation=true`, the `showLocationPreRsvp` toggle is **disabled** with 0.4 opacity
- The label changes to "Location is already hidden on web"
- The stored `showLocationPreRsvp` value is **NOT mutated** — it's just visually disabled
- If host turns `hideWebLocation` back off, `showLocationPreRsvp` regains its previous value

---

## Contract Path

```
create.tsx / edit mode
  → createEventRequestSchema / updateEventRequestSchema (Zod validation)
  → POST /api/events or PUT /api/events/:id
  → Prisma: stored as boolean columns on event table
  → serializeEvent() passes raw values through (lines 274-277)
  → App consumer: event/[id].tsx reads flags
  → Web consumer: GET /api/events/:id/public returns flags in response
```

---

## Backend Enforcement

### Public endpoint (`GET /api/events/:id/public` in `publicEvents.ts`)

Server-side enforcement — web page trusts API response entirely:

| Flag | Effect |
|------|--------|
| `showGuestList=false` | `goingPreview`, `maybePreview`, and `guestRsvps` arrays returned empty |
| `showGuestCount=false` | `rsvpCounts` returned as `null`, `totalGoing`/`totalMaybe` in `guestPreview` returned as `null` |
| `hideWebLocation=true` | `location` returned as `null` |
| `showLocationPreRsvp=false` | Location truncated to city/state only (last 2 comma-separated parts) |

**Guest token override:** When `x-guest-token` identifies a "going" guest AND `hideWebLocation=false`, the full address is returned even if `showLocationPreRsvp=false`.

### Authenticated endpoint (`serializeEvent` in events-shared.ts)

The 4 flags are passed through as raw values. App-side enforcement happens in `event/[id].tsx`.

---

## App Enforcement

**Location:** `event/[id].tsx` (lines 1947-1955)
```
locationHiddenByPrivacy =
  event.showLocationPreRsvp === false &&
  !isMyEvent &&
  myRsvpStatus !== "going" && myRsvpStatus !== "interested"
```
When true, `effectiveLocationDisplay` and `effectiveLocationQuery` are set to `null` — hero card and map link show nothing.

**Guest section:** `event/[id].tsx` (lines 2169-2172)
- `guestGoingList` and `guestNotGoingList` are replaced with empty arrays when `showGuestList=false`
- `effectiveGoingCount` excludes guest count when `showGuestCount=false`

---

## Web Enforcement

The web page (`EventCard.tsx`, `GuestPreview.tsx`, `RsvpSection.tsx`) trusts the API response entirely. No client-side reconstruction of hidden data:
- If `showGuestList=false`, the API returns empty preview arrays → web shows nothing
- If `showGuestCount=false`, the API returns null counts → web hides count badges
- If `hideWebLocation=true`, the API returns `location: null` → web shows no location
- If `showLocationPreRsvp=false`, the API returns city-only → web shows blurred lock treatment with city text

---

## Key Files

| File | Purpose |
|------|---------|
| `shared/contracts.ts` (lines 144-147, 299-302) | Zod schema for all 4 flags |
| `src/components/create/SettingsSheetContent.tsx` | Privacy toggles UI |
| `src/app/event/[id].tsx` (lines 947-955, 1947-1955) | App-side enforcement |
| `my-app-backend/src/routes/publicEvents.ts` (lines 82-170) | Server-side enforcement for web |
| `my-app-backend/src/routes/events-shared.ts` (serializeEvent) | Pass-through for authenticated API |
| `openinvite-website/src/components/EventCard.tsx` | Trusts API for location display |
| `openinvite-website/src/components/GuestPreview.tsx` | Trusts API for guest lists |

---

## Invariants

- All 4 flags default to their stated values. Missing flags in API response are treated as defaults.
- `hideWebLocation=true` always wins over `showLocationPreRsvp`. If location is hidden on web, there is nothing to show pre-RSVP.
- `hideWebLocation` only affects the web page. The app always receives full location data (gated by `showLocationPreRsvp` + RSVP status).
- Privacy flags are per-event, not per-user. The host sets them at create/edit time.
- The public endpoint enforces ALL flags server-side. The web page NEVER has data the API didn't explicitly provide.
- `showLocationPreRsvp=false` is the DEFAULT — hosts must opt in to showing full address before RSVP.

---

## Gotchas

- The `hideWebLocation` disable of `showLocationPreRsvp` is UI-only — the stored value is preserved. This means turning `hideWebLocation` off restores the previous `showLocationPreRsvp` setting without data loss.
- The app uses `event.showLocationPreRsvp === false` (strict comparison) not `!event.showLocationPreRsvp` — this matters because `undefined` would not trigger the privacy gate.
- Location truncation in the public endpoint splits on commas and takes the last 2 parts. This heuristic works for US addresses ("City, State") but may produce unexpected results for international addresses with different formatting.
- Guest token location reveal still requires `hideWebLocation=false`. A going guest does NOT override `hideWebLocation`.
