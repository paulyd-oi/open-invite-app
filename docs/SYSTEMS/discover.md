# Discover

> Browse feed, ideas deck, and saved shortlist.
> Owner: `src/app/discover.tsx`, `src/components/ideas/DailyIdeasDeck.tsx`

---

## Panes

| Pane | Key | Component | Description |
|------|-----|-----------|-------------|
| **Map** | `"map"` | `RNMapView` | Map with event pins |
| **Events** | `"events"` | Inline FlatList | Feed with a single horizontal pill row (Going / Not Going are first-class pills — no nested sub-filter). |
| **Who's Down** | `"whos_down"` | Inline ScrollView | Casual idea posts from friends (24h TTL). Card primary avatar is the creator's profile photo via `EntityAvatar` (initials fallback) — not the lightbulb emoji. Count badge on tab label. Helper copy: `Friends only · expires in 24h`. Proof tag: `[WHOS_DOWN_V1]`. |

State: `const [lens, setLens] = useState<Lens>("events")`

> [WHOS_DOWN_V1] The former Discover "Responded" tab was folded into the Events pane. Going and Not Going live as first-class pills alongside Soon / Popular / Friends / Saved / Group / Public — there is NO "Responded" parent pill and NO second-row sub-filter. Its third-lens slot now hosts Who's Down.

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
| Going | `"going"` | Events where `viewerRsvpStatus === "going"` (reuses `respondedGoingSorted`). Proof tag: `[WHOS_DOWN_V1]`. |
| Not Going | `"not_going"` | Events where `viewerRsvpStatus === "not_going"` (reuses `respondedNotGoingSorted`). Proof tag: `[WHOS_DOWN_V1]`. |

Pills scroll horizontally in a single row. Only one pill is active at a time. All pills except Going / Not Going exclude responded events (Events-pane responded exclusion invariant). Going / Not Going intentionally surface them.

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
- **Center tab lane separation:** Group Invite = circle events only. Open Invite = non-public social/open events (`visibility !== "public"`). Public Invite = `visibility === "public"` only, distance-filtered + geo-ranked via `comparePublicFeedOrder()`. No public event may appear in both Open Invite and Public Invite panes.
- **Public Invite pool (own-event inclusion):** Public Invite on the center tab MUST source from `feedData ∪ myEventsData ∪ attendingData` (deduped by id), NOT from `discoveryEvents` (which excludes the viewer's own hosted/RSVPed events). For own events (`event.userId === session.user.id`), bypass the "responded" filter — the host is typically auto-"going" but must still see their own public event in the Public Invite pane. Eligibility filters still apply: `visibility === "public"`, future/non-blocked (`isEventEligibleForDiscoverPool`), and within `PUBLIC_NEARBY_MILES` when location is known. Proof tag: `[PUBLIC_LANE_OWN_EVENTS_V1]`.
- **Own-event bypass is SURFACE-COHERENT.** The same own-event-responded-bypass rule MUST apply to every public discovery surface that composes `isVisibleInPublicFeed()`: Social → Public Invite, Discover → Events → Public pill, and Discover → Map → Public. The SSOT is the optional `viewerUserId` argument on `isVisibleInPublicFeed(event, loc, now, viewerUserId)` in `src/lib/discoverFilters.ts`. Any new surface that filters the public lane MUST pass the viewer's user id; no surface may silently drop the creator's own public event for the "responded" reason. Proof tag: `[PUBLIC_LANE_OWN_EVENTS_V1]`.
- **Discover Map Public coordinate requirement:** Map markers require valid non-zero lat/lng via `isEventVisibleInMap()` (Layer B classifier). This is a MAP-SURFACE contract, not a public-lane contract. A public event with no coordinates still appears in Social → Public Invite and Discover → Events → Public (no coord requirement there), but will NOT appear as a map marker. Empty-state copy "No events with locations nearby" must only surface when there are truly zero coordinate-backed public events within the current region filter.
- **Center tab calendar dataset switches by active pane.** The FeedCalendar events + selected-day list on the Social/center tab MUST reflect the active pane: `group` → `groupPaneEvents`, `public` → `publicPaneEvents`, `open` → calendar-allowlisted events filtered to non-public + non-circle. No overlap across panes. Proof tag: `[SOCIAL_CALENDAR_PANE_SWITCH_V1]`.
- **Discover Map lane separation:** Friends = non-public map events (`visibility !== "public"`). Public = public-only map events, 50mi cap via `isVisibleInPublicFeed()`. No mixed inventory between map sub-filter modes.
- **Visibility transition coherence:** `getInvalidateAfterEventEdit()` must invalidate all lane-affected query keys (feed, feedPaginated, feedPopular, friendsHostedFeed, attending, mine, myEvents, calendar). Edit-mode visibility pre-population must preserve the `public` value — never silently downgrade to `all_friends`.
- **Fail-soft fatal guard.** Proof tag: `[DISCOVER_FAIL_SOFT_V1]`. Discover MUST NOT collapse into the full-screen `LoadingTimeoutUI` when a non-core subquery fails. Core queries are `eventKeys.feedPaginated()` (`feedError`) and `eventKeys.myEvents()` (`myEventsError`) ONLY. All other Discover queries — `eventKeys.attending()`, `eventKeys.friendsHostedFeed()`, `eventKeys.friendsFeed()`, `["friends"]`, and any derived map/public/responded slices — are secondary and MUST degrade to pane-level empty/error states, never to a full-screen blocker. The fatal gate is: `feedError && myEventsError && !hasAnyCoreEventData`, where `hasAnyCoreEventData` is true if either `feedData.events` or `myEventsData.events` is non-empty (cached or freshly fetched). A single core query succeeding, or cached data from a prior successful fetch, is enough to keep the surface open. Full-screen fatal copy is a single non-contradictory state — title `"Couldn't load events"` + body `"Check your connection and try again."` — never a "Still Loading..." title on an error branch.
- **Shape-guard at the derivation boundary.** Proof tag: `[DISCOVER_SHAPE_GUARD_V1]`. The `enrichedEvents` SSOT memo MUST drop malformed records (missing `id`, `title`, or `startTime`) at entry via an `isShapeValid` type-guard BEFORE id-dedup, series collapse, or filter/sort passes. Rationale: a single rogue record (bad backend row, partial cache hydration, mid-migration drift) must not be able to throw `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` from the memo and blank the surface despite the fail-soft fatal guard. The guard is filter-only — it never widens typing or coerces data; downstream code keeps its normal non-optional assumptions. No Discover derivation may access `event.title.toLowerCase()`, `event.user.id`, etc. upstream of this guard.
- **Pane-level render isolation.** Proof tag: `[DISCOVER_PANE_ISOLATION_V1]`. Each of the three lens render branches (Map / Events / Responded) MUST be wrapped in its own `<ErrorBoundary>` with a local inline fallback (`DiscoverPaneErrorFallback`). A synchronous render-time throw inside one pane MUST be contained to that pane — the Discover shell (header, lens tabs, floating controls, `BottomNavigation`) and sibling panes remain interactive. The fallback is NEVER full-screen: it renders inline at `flex: 1` inside the same pane slot, shows `"Couldn't render this view"` + `"Try switching tabs or tap retry. The rest of Discover is still available."`, and exposes a retry button wired to `ErrorBoundary`'s internal `reset()`. Switching lens tabs unmounts the errored boundary, which also resets. This pane-level isolation is SEPARATE from the `[DISCOVER_FAIL_SOFT_V1]` query-state fatal guard — the former catches synchronous render throws (outside React Query's error boundary), the latter handles network/data failure.
