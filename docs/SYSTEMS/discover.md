# Discover

> Browse feed, ideas deck, and saved shortlist.
> Owner: `src/app/discover.tsx`, `src/components/ideas/DailyIdeasDeck.tsx`

---

## Panes

| Pane | Key | Component | Description |
|------|-----|-----------|-------------|
| **Map** | `"map"` | `RNMapView` | Map with event pins |
| **Events** | `"events"` | Inline FlatList | Feed with pill sub-filters |
| **Responded** | `"responded"` | Inline FlatList | Events user has RSVP'd to |

State: `const [lens, setLens] = useState<Lens>("events")`

### Map Sub-Filter

| Mode | Key | Description |
|------|-----|-------------|
| Friends | `"friends"` | Non-public social graph events (excludes `visibility === "public"`) |
| Public | `"public"` | Public events only, 50mi cap when location available |

State: `const [mapFilter, setMapFilter] = useState<MapFilter>("friends")`

Strict lane separation: no public events in Friends, no non-public events in Public.

### Events Pane Pills

| Pill | Key | Description |
|------|-----|-------------|
| Soon | `"soon"` | Soonest upcoming events |
| Popular | `"popular"` | Highest attendee count |
| Friends | `"friends"` | Events friends are going to |
| Saved | `"saved"` | Bookmarked / interested events |
| Group | `"group"` | Circle/group-visibility events |
| Public | `"public"` | `visibility === "public"`, within 50mi if location available |

Pills scroll horizontally. All pills exclude responded events (Events-pane responded exclusion invariant).

---

## Data Sources

| Query Key | Endpoint | Stale | Purpose |
|-----------|----------|-------|---------|
| `eventKeys.feedPopular()` | `/api/events/feed` | 30s | Main feed (network + discover events) |
| `eventKeys.myEvents()` | `/api/events` | 30s | User's own/attending events |
| `eventKeys.attending()` | `/api/events/attending` | 60s | Availability signal computation |
| `eventKeys.friendsHostedFeed()` | `/api/events/friends-hosted-feed?days=30&limit=50` | 60s | Friend-hosted badge lookup |

---

## Feed Composition (Events Pane)

```
1. Merge feedData + myEventsData → allEventsMap (deduped by id)
2. Filter: exclude circle_only, specific_groups, private visibility
3. Filter: exclude past events (startTime or nextOccurrence < now)
4. Enrich: deriveAttendeeCount() = 1 (host) + accepted joinRequests
5. Sort per pill:
   - Popular: attendeeCount DESC, then effectiveTime ASC
   - Soon: effectiveTime ASC
   - Friends: backend-sorted by goingCount DESC
   - Saved: interested/maybe events, effectiveTime ASC
   - Group: circle/group-visibility events, effectiveTime ASC
   - Public: visibility === "public" + 50mi distance cap (if location) + effectiveTime ASC
```

### Public Pill Distance Logic

- Uses `isVisibleInPublicFeed()` from `discoverFilters.ts`
- 50-mile hard cap via `PUBLIC_NEARBY_MILES` constant
- Location fetched on demand (when Public pill or Map pane activated)
- Without location: shows all public events sorted by time (no distance filter)
- With location: haversine distance filter, events without coords still included

`getEffectiveTime(e)` = `nextOccurrence ?? startTime` (handles recurring events).

---

## Friend-Hosted Badge

- Build `Set<string>` of user IDs from `friendsHostedFeed` response
- On each card: if `event.user.id` is in set → show avatar + "Hosted by {name}"
- Lightweight: 30-day window, 50-item cap

---

## Ideas Deck

- Daily-regenerated card deck from multiple sources:
  - `/api/events/suggestions` (reconnect ideas)
  - `/api/birthdays` (birthday ideas)
  - `eventKeys.feed()` (activity repeat / timing ideas)
  - `eventKeys.mine()` (user's events)
- Categories: reconnect, low_rsvp, birthday, activity_repeat, timing
- Anti-repeat: `antiRepeatByCategory()` prevents consecutive same-category cards
- Swipe left = dismiss, swipe right = accept (navigates to event)
- Persisted daily via AsyncStorage (`ideasDeck_YYYY_MM_DD`, exposure map, pattern memory)
- Shows countdown when all cards swiped ("New ideas in Xh Xm")

---

## Saved Pane

**Composition:**
```
enrichedEvents.filter(e =>
  !past &&
  (savedEvents.has(e.id) || viewerRsvpStatus === "interested" || "maybe")
).sort(by effectiveTime ASC)
```

- Server-side: `viewerRsvpStatus` from feed queries (persistent)
- Local: `useState<Set<string>>` updated on save mutation (session-only)
- No separate query key — filters from existing feed + myEvents data
- Time groups: Today / Tomorrow / This Week / Later

---

## User Actions

| Action | Trigger | Effect |
|--------|---------|--------|
| Tap event card | `router.push(/event/${id})` | Navigate to event detail |
| Save/bookmark | `POST /api/events/${id}/rsvp` with `status: "interested"` | Add to saved + toast + haptic |
| Sort toggle | Tap Popular/Soon chip | Flip `eventSort` state |
| Lens switch | Tap Ideas/Events/Saved tab | Flip `lens` state |
| Pull to refresh | Pull down on Events/Saved | Refetch feed + myEvents |
| Create | Tap "Create" pill (top-right) | Guard email verification → `/create` |
| Swipe idea | Left = dismiss, right = accept | AsyncStorage tracking + navigate |

---

## Card Badges

| Badge | Source | Condition |
|-------|--------|-----------|
| Friend-hosted | `friendHostUserIds` Set | `event.user.id` in set |
| Urgency | `getUrgencyLabel()` | < 1h: "Starts in Xm", < 6h: "Starts in Xh", today: "Tonight", tomorrow: "Tomorrow" |
| Availability | `computeAvailabilityBatch()` from attending events | "Looks clear" / conflict indicator |
| Attendee count | `deriveAttendeeCount()` | Always shown |

---

## Rendering Structure

```
discover.tsx
├── AppHeader (floating, BlurView background)
│   ├── Lens tabs (Ideas / Events / Saved)
│   └── Create button (top-right)
├── Ideas pane → DailyIdeasDeck (swipeable cards)
├── Events pane → FlatList
│   ├── Sort chips header (Popular / Soon)
│   └── Event cards (photo, emoji, title, time, location, badges)
├── Saved pane → ScrollView
│   ├── Empty state (if no saved events)
│   └── Time-grouped sections (Today/Tomorrow/This Week/Later)
│       └── Event rows (thumbnail, title, time, badges)
├── HelpSheet (bottom-left)
└── BottomNavigation
```

---

## Invalidation After Save

Uses `getInvalidateAfterRsvpJoin(eventId)` — invalidates 11 keys:
`single`, `attendees`, `interests`, `rsvp`, `feed`, `feedPaginated`, `feedPopular`, `friendsHostedFeed`, `myEvents`, `calendar`, `attending`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/discover.tsx` | Main screen |
| `src/lib/discoverFilters.ts` | SSOT for discover pool eligibility + surface classification + public/distance helpers |
| `src/lib/eventQueryKeys.ts` | Query keys + invalidation contracts |
| `src/lib/availabilitySignal.ts` | Availability chip logic |
| `src/lib/useLiveRefreshContract.ts` | Pull-to-refresh + foreground refetch |

---

## Invariants

- Attendee count must use `deriveAttendeeCount()` — no screen may compute its own variant.
- Visibility filter must exclude `circle_only`, `specific_groups`, `private` from public feed.
- Past events must be filtered by `nextOccurrence` for recurring, `startTime` for one-time.
- `feedPopular` and `friendsHostedFeed` must be invalidated on any RSVP mutation.
- Ideas deck regenerates daily — stale decks cleared by date-keyed AsyncStorage.
- Save action is dual-tracked: server (`interested` RSVP) + local Set (session-only).
- Public pill respects Events-pane responded exclusion invariant (responded events excluded).
- Public/distance logic lives in `discoverFilters.ts` SSOT — not inline in screens.
- Imported events (`isImported: true`) must never appear in Public discovery surfaces.
- **Center tab lane separation:** Group Invite = circle events only. Open Invite = non-public social/open events (`visibility !== "public"`). Public Invite = `visibility === "public"` only, distance-filtered via `isVisibleInPublicFeed()` + `comparePublicFeedOrder()`. No public event may appear in both Open Invite and Public Invite panes.
- **Discover Map lane separation:** Friends = non-public map events (`visibility !== "public"`). Public = public-only map events, 50mi cap via `isVisibleInPublicFeed()`. No mixed inventory between map sub-filter modes.
