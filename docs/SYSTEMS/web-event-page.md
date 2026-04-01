# Web Event Page

> Public-facing event page for shared links, guest RSVP surface, and app download funnel.
> Owner: `openinvite-website/app/event/[id]/page.tsx`, `openinvite-website/src/components/EventPageClient.tsx`

---

## Architecture

**Repo:** `openinvite-website` (Next.js on Vercel at `www.openinvite.cloud`)

**Route:** `app/event/[id]/page.tsx` (server component) → `EventPageClient.tsx` (client component)

**Data source:** `GET /api/events/:id/public` (no auth required, see [Guest RSVP](./guest-rsvp.md) and [Privacy System](./privacy-system.md))

---

## Component Tree

```
page.tsx (server)
  ├── generateMetadata() — OG tags for social previews
  └── EventPageClient (client)
       ├── EventCard — title, date, time, location, cover image, host info
       │    └── GuestPreview — avatar stack + counts for going/maybe
       ├── RsvpSection — RSVP buttons → form → success → App Store CTA
       ├── AppDownloadCta — persistent download banner
       └── ThemeBackground — full-page themed background
```

---

## Data Flow

```
1. Server component fetches event via fetchPublicEvent(id)
   → GET {API_URL}/api/events/:id/public (server-side, no CORS)

2. If error: "not_found" → Next.js notFound(), "private" → private event message

3. Server resolves theme via getWebTheme(event.themeId)

4. Server renders page shell + passes {event, theme} to EventPageClient

5. Client component mounts:
   a. Stores event in useState for rehydration
   b. Checks localStorage for existing guest token (oi_guest_rsvp_{eventId})
   c. If token found → fetches event again WITH x-guest-token header
      → Location may be revealed if guest is "going"
   d. Checks localStorage for existing status (oi_guest_status_{eventId})
      → Restores RSVP state without re-submitting

6. IntersectionObserver watches RsvpSection
   → When scrolled out of view, shows mobile sticky CTA at bottom
```

---

## Layout

**Desktop:** Two-column — event details (left), cover image (right)
**Mobile:** Single column, stacked — cover image on top, details below

Responsive breakpoint handled by CSS (no JS media queries).

---

## Theme System

**File:** `openinvite-website/src/data/eventThemes.ts` (175 lines)

`WebTheme` interface:
```typescript
interface WebTheme {
  pageBackground: string;    // Full-page bg color
  cardBackground: string;    // Event card bg
  textColor: string;         // Primary text
  accentColor: string;       // Buttons, links
  secondaryText: string;     // Muted text
  borderColor: string;       // Card borders
  // ... additional properties
}
```

`getWebTheme(themeId)` maps a theme ID string to CSS colors. Falls back to `"neutral"` theme for unknown IDs.

`ThemeBackground.tsx` renders the full-page background using the theme's `pageBackground`.

---

## Guest RSVP Flow

Handled by `RsvpSection.tsx`:

```
1. Initial state: "Going" and "Can't Make It" buttons visible

2. User taps a button → form appears (name + email fields)

3. User submits → POST /api/events/:id/rsvp/guest
   Headers: x-guest-token (if returning visitor)
   Body: { name, email?, status }

4. On success:
   a. Token saved to localStorage: oi_guest_rsvp_{eventId}
   b. Status saved to localStorage: oi_guest_status_{eventId}
   c. Success state rendered with confirmation message
   d. App Store CTA shown (platform-aware: iOS or Android)

5. If "going": EventPageClient re-fetches event with x-guest-token
   → Full location may now be visible (was city-only before)
```

---

## Token Handling

| Key | Format | Purpose |
|-----|--------|---------|
| `oi_guest_rsvp_{eventId}` | cuid string | Guest RSVP token for this event |
| `oi_guest_status_{eventId}` | `"going"` or `"not_going"` | Cached status for instant UI restore |

**Storage:** `localStorage` (may be unavailable in private browsing — wrapped in try/catch)

**Usage:**
- Sent as `x-guest-token` header on POST (upsert dedup) and GET (location reveal)
- Read on mount for returning visitor rehydration

---

## Mobile Sticky CTA

`EventPageClient.tsx` (line 43) uses `IntersectionObserver` on the RSVP section. When the RSVP buttons scroll out of view, a sticky CTA bar appears at the bottom of the screen with the RSVP action.

---

## Location Display

| Condition | Display |
|-----------|---------|
| `hideWebLocation=true` | No location shown |
| `showLocationPreRsvp=true` | Full address |
| `showLocationPreRsvp=false` + not going | City/state only (blurred lock treatment) |
| `showLocationPreRsvp=false` + going (with token) | Full address (revealed via re-fetch) |

The web page trusts the API response entirely — see [Privacy System](./privacy-system.md) for enforcement details.

---

## Loading State

`openinvite-website/app/event/[id]/loading.tsx` — skeleton shimmer UI shown during server-side data fetch.

---

## Key Files

| File | Purpose |
|------|---------|
| `openinvite-website/app/event/[id]/page.tsx` | Server component, data fetch, OG metadata |
| `openinvite-website/app/event/[id]/loading.tsx` | Skeleton shimmer loading state |
| `openinvite-website/app/event/[id]/not-found.tsx` | 404 error state |
| `openinvite-website/src/components/EventPageClient.tsx` | Client component, rehydration, IntersectionObserver |
| `openinvite-website/src/components/EventCard.tsx` | Event details card |
| `openinvite-website/src/components/RsvpSection.tsx` | RSVP form, token storage, status flow |
| `openinvite-website/src/components/GuestPreview.tsx` | Avatar stack + counts |
| `openinvite-website/src/components/AppDownloadCta.tsx` | App download banner |
| `openinvite-website/src/components/ThemeBackground.tsx` | Theme background layer |
| `openinvite-website/src/data/eventThemes.ts` | Theme → CSS color mapping |
| `openinvite-website/src/lib/api.ts` | fetchPublicEvent, x-guest-token header injection |
| `openinvite-website/src/lib/eventTracking.ts` | detectPlatform() for store CTAs |
| `my-app-backend/src/routes/publicEvents.ts` | Public event + guest RSVP endpoints |

---

## Invariants

- The web page NEVER has data the API didn't explicitly provide. All privacy enforcement is server-side.
- The server component fetches data — the client component only re-fetches for token-based rehydration.
- Theme resolution falls back to `"neutral"` — unknown theme IDs never cause errors.
- Private events (`visibility !== "open_invite" | "all_friends"`) return 403 from the API → rendered as a private event message, not a 404.
- `generateMetadata()` runs server-side and is the ONLY source of OG tags. Client-side state changes don't affect social previews.
- Token storage uses `localStorage` with try/catch — private browsing or storage quota failures degrade gracefully (no token = fresh visitor experience).

---

## Gotchas

- The server component fetch uses the backend's internal URL (not the public API URL) — this is configured via Next.js env vars on Vercel.
- OG images use the event's `coverImageUrl` with a hardcoded default fallback. If the cover is a Cloudinary URL, social platforms may take time to cache the new image after an event photo change.
- The `apple-itunes-app` meta tag in `generateMetadata()` enables iOS Safari's smart app banner. The `app-argument` deep links directly to the event in the app.
- Returning visitor rehydration happens on mount — there's a brief flash where the RSVP buttons appear before being replaced by the "already RSVP'd" state. This is a known trade-off for simplicity.
- The `IntersectionObserver` threshold is set so the sticky CTA appears when the RSVP section is fully scrolled out of view, not partially.
