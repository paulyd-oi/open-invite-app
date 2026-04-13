# Session Log — iOS Build Failure Forensic Audit

## 2026-04-04 — Forensic audit session

### Files read
- `936ff97:package.json` — build 266 dependencies (sentry ~6.14.0, lottie-react-native 7.2.2)
- `936ff97:eas.json` — build 266 production config (no image pin, no hooks, no AVIF env)
- `936ff97:ios/Podfile` — build 266 Podfile (no AVIF env, no wholemodule hack)
- `936ff97:ios/Podfile.lock` — build 266 pod graph (lottie-ios 4.5.0, Sentry 8.50.2, SDWebImageAVIFCoder 0.11.1)
- `936ff97:app.json` — build 266 config (@sentry/react-native in plugins)
- `936ff97:ios/OpenInvite.xcodeproj/project.pbxproj` — build 266 pbxproj (5 Sentry refs)
- `HEAD:package.json` — lottie-react-native 7.3.6, no sentry
- `HEAD:eas.json` — EXPO_IMAGE_NO_AVIF=1, no image pin
- `HEAD:ios/Podfile` — AVIF env + wholemodule lottie hack
- `HEAD:ios/Podfile.lock` — lottie-ios 4.6.0, no Sentry, no AVIF
- `HEAD:scripts/eas-build-post-install.sh` — AVIF podspec+Swift patching
- `HEAD:ios/OpenInvite.xcodeproj/project.pbxproj` — 0 Sentry refs
- `.gitignore` — ios/Pods/, ios/OpenInvite.xcworkspace/ gitignored
- `package-lock.json` — lottie-react-native locked to 7.3.6

### Files changed
- `docs/FORENSICS_CACHE.md` — created (investigation scratchpad)
- `docs/SESSION_LOG.md` — created (this file)

### Root causes discovered
1. **Three simultaneous pod graph changes** between build 266 and HEAD: Sentry removal,
   Lottie upgrade, AVIF removal. Each changes the CocoaPods dependency graph.
2. **Build 266 had no EAS hooks, no AVIF exclusion, no Xcode image pin.** It compiled
   lottie-ios 4.5.0 + Sentry 8.50.2 + SDWebImageAVIFCoder successfully on whatever
   EAS default image was current on March 27.
3. **The EAS default image likely rotated** between March 27 and subsequent builds,
   which broke Sentry (SentryDefines.h not found on newer Xcode) and possibly lottie-ios.
4. **The Podfile.lock is committed but may be overridden** if EAS runs `expo prebuild`
   which regenerates native config before pod install.

### Key decisions
- Sentry removal is clean and complete
- lottie-react-native pinned to exact 7.3.6
- wholemodule hack in Podfile post_install is the right location
- AVIF patching in eas-build-post-install.sh is correct approach

### Unfinished work
- Need to verify whether EAS actually runs `expo prebuild` for this project
- Need to verify the wholemodule hack actually resolves lottie-ios 4.6.0 compile on Xcode 16.4
- Haven't yet tested a build — need one more build attempt
- Option C (revert to build 266 exact state + remove Sentry only) not yet evaluated

---

## 2026-04-12 — Calendar import: remove misleading "DEFAULT VISIBILITY" control

### Context
`import-calendar.tsx` rendered a "DEFAULT VISIBILITY" section with a selectable Private row + chevron + full-screen picker modal. Imported events are behaviorally locked to private, so the control misrepresented user choice. Trust-sensitive surface.

### Files read
- `src/app/import-calendar.tsx` — confirmed interactive visibility row (lines 679–712) + picker modal (lines 1014–1097) + state + constants
- `docs/SYSTEMS/calendar.md` — had stale line referencing "visibility selector" in resync mode notes
- `docs/CODEBASE_MAP.md` — confirmed `import-calendar.tsx` is the only screen rendering this flow

### Files changed
- `src/app/import-calendar.tsx` — removed interactive control, picker modal, `VISIBILITY_OPTIONS`, `VisibilityOption`, `defaultVisibility` + `showVisibilityModal` state, `currentVisibilityOption`, and unused `Modal`/`Users`/`Compass`/`Lock` imports. Replaced the section with a non-interactive `PRIVACY` informational block. Mutation payload now always sends `defaultVisibility: "private"`.
- `docs/SYSTEMS/calendar.md` — updated resync-mode note to point to the new SSOT and remove the "visibility selector" reference.
- `docs/SYSTEMS/calendar-import.md` — NEW. SSOT for the import flow, including the Privacy Contract (imported events are private by default; no UI to change at import time).
- `docs/SESSION_LOG.md` — this entry.
- `docs/FORENSICS_CACHE.md` — added findings entry.

### Key decisions
- Kept `defaultVisibility?` in `ImportCalendarEventsRequest` interface (request contract unchanged — only the client-side value is frozen to `"private"`).
- Did not touch the backend endpoint — UI/copy fix only.
- Created `calendar-import.md` rather than folding into `calendar.md` because the import flow is a distinct surface with its own privacy contract.

### Verification
- `npx tsc --noEmit` clean.
- Grep confirms `DEFAULT VISIBILITY`, `VISIBILITY_OPTIONS`, `showVisibilityModal`, `currentVisibilityOption`, `VisibilityOption` are no longer present in `import-calendar.tsx`.
- New copy `PRIVACY` / `All imported events are private — only you can see them. You can change visibility anytime after import.` is present at lines 647/659.
- OTA-safe: no native module or native config changes.

---

## 2026-04-12 — Event detail scroll jank with video themes

### Context
Report: "Event page scroll becomes sluggish/janky when a video theme is active." Core product surface; premium visuals must not degrade RSVP/detail experience.

### Files read
- `docs/SYSTEMS/event-page.md` — render layers list, particle exclusivity invariant
- `src/components/event/ThemeBackgroundLayers.tsx` — orchestrator mounting all background layers (called once from `event/[id].tsx:2060`)
- `src/components/ThemeVideoLayer.tsx` — `expo-video` looping player, handles its own reducedMotion + failure poster fallback, AppState pause/resume
- `src/components/ThemeEffectLayer.tsx` (first ~100 lines) — Skia Canvas + Reanimated useFrameCallback particle simulation
- `src/components/create/MotifOverlay.tsx` (first ~80 lines) — same Skia particle engine, used for user-selected `effectId`
- `src/components/ThemeFilterLayer.tsx` — single Skia canvas, static post-processing (no per-frame animation)
- `src/components/AnimatedGradientLayer.tsx` — two LinearGradients with Reanimated opacity crossfade (withRepeat, withTiming)
- `src/app/event/[id].tsx` (around line 2050) — confirmed `ThemeBackgroundLayers` is the single mount site; ScrollView is `Animated.ScrollView` with no `removeClippedSubviews`

### Root cause
When a theme video is active, four animated/composited systems run simultaneously behind content: (1) Reanimated gradient crossfade, (2) looping `expo-video` H.264 decode, (3) Skia Canvas with `useFrameCallback` driving particle positions every frame, (4) Skia filter canvas. During scroll the entire layered view hierarchy re-composites, amplifying the cost of the redundant animated layers.

### Fix
Containment rule added to `ThemeBackgroundLayers.tsx` (proof tag `[PERF_VIDEO_CONTAINMENT_V1]`):
- Compute `hasActiveVideo = Boolean(visualStack?.video && THEME_VIDEOS[source])`.
- When `hasActiveVideo`: skip `AnimatedGradientLayer` (video + poster fallback cover the atmosphere) and skip the particle layer (`MotifOverlay` / `ThemeEffectLayer`).
- Keep `ThemeVideoLayer` and `ThemeFilterLayer` (static filter, single Skia canvas, no per-frame work).
- Non-video themes: behavior unchanged.

### Files changed
- `src/components/event/ThemeBackgroundLayers.tsx` — containment rule + docblock.
- `docs/SYSTEMS/event-page.md` — updated render-layer list + added "Video Containment Rule" section + invariant.
- `docs/SESSION_LOG.md` — this entry.
- `docs/FORENSICS_CACHE.md` — forensic entry with guardrail.

### Scope deviation from expected file list
Expected list named `src/app/event/[id].tsx`, `ThemeVideoLayer.tsx`, `ThemeEffectLayer.tsx`, `MotifOverlay.tsx`. After freshness check, all layer mounting flows through the single orchestrator `src/components/event/ThemeBackgroundLayers.tsx`. Putting the rule there is the smallest, highest-visibility surgical change: the layer components stay pure/reusable (create page still mounts the full stack), and the decision is co-located with the render. No edits to `event/[id].tsx` (no call-site change needed), no edits to the layer components themselves.

### Verification
- `npx tsc --noEmit` clean.
- Layer gating visible in `ThemeBackgroundLayers.tsx` via `!hasActiveVideo` guards on gradient + particle blocks.
- Particle exclusivity (effect vs theme particles) still honored inside the particle branch.
- OTA-safe: pure JS/TS, no native module, native config, or package changes.

---

## 2026-04-12 — Social Public Invite pane missing creator's own public event + calendar not switching by pane

### Context
Production QA: a user creates a public event and it does NOT appear in Social → Public Invite. Separately, the Social calendar dots + selected-day event list do not change when flipping between Group / Open / Public panes.

### Files read
- `docs/SYSTEMS/discover.md` — center-tab lane separation invariant
- `src/app/social.tsx` — `discoveryEvents`, `publicPaneEvents`, `groupPaneEvents`, `calendarEvents`, `selectedDateEvents`, FeedCalendar render site
- `src/lib/discoverFilters.ts` — `isVisibleInPublicFeed`, `isEventResponded`, `isEventEligibleForDiscoverPool`, `isWithinMiles`, `PUBLIC_NEARBY_MILES`
- `src/components/FeedCalendar.tsx` — optional `isOwn/isAttending/hostName/hostImage` on EventWithMeta
- `src/lib/eventQueryKeys.ts` — `getInvalidateAfterEventCreate()` already invalidates `feed + feedPaginated + myEvents + calendar`

### Root cause
1. **Public Invite bug.** `publicPaneEvents` was derived from `discoveryEvents`, which explicitly filters out `event.userId === viewerUserId` and `myEventIds.has(event.id)`. The creator's own public event was stripped at that upstream filter and never reached Public lane. Even if it had, `isVisibleInPublicFeed → isEventResponded` would also drop it when the host is auto-"going".
2. **Calendar-not-switching bug.** Social used a single `calendarEvents` dataset for both FeedCalendar dots and `selectedDateEvents` regardless of `activePane`. Additionally, the `SOCIAL_ALLOWED_VISIBILITY` allowlist in `allEvents` omits `"public"`, so public events never even entered that dataset.

### Fix
- `publicPaneEvents` rewritten to source from `feed ∪ myEvents ∪ attending` (deduped), applying `visibility === "public"` + `isEventEligibleForDiscoverPool` + distance cap. For own events (`userId === viewerUserId`), bypass the `isEventResponded` filter. Proof tag `[PUBLIC_LANE_OWN_EVENTS_V1]`.
- Added `paneCalendarEvents` memo that switches by `activePane`: group → `groupPaneEvents`, public → `publicPaneEvents`, open → `calendarEvents` filtered to non-public + non-circle. `selectedDateEvents` + `<FeedCalendar events={...}>` now read from `paneCalendarEvents`. Proof tag `[SOCIAL_CALENDAR_PANE_SWITCH_V1]`.
- Removed unused `isVisibleInPublicFeed` import; added `isEventEligibleForDiscoverPool`, `isEventResponded`, `isWithinMiles`.
- **No change to `eventQueryKeys.ts`** — existing create-invalidation set already covers the keys we now read from.

### Files changed
- `src/app/social.tsx`
- `docs/SYSTEMS/discover.md`
- `docs/SESSION_LOG.md` (this entry)
- `docs/FORENSICS_CACHE.md`

### Scope vs. expected
Expected: `social.tsx` + possibly `eventQueryKeys.ts` + one SSOT doc. Actual: no `eventQueryKeys.ts` change needed (forensics confirmed it already invalidates myEvents + feedPaginated + calendar). Two log files updated as required.

### Verification
- `npx tsc --noEmit` clean.
- Lane separation preserved: group (circleId only), open (non-public + non-circle), public (visibility=public only).
- OTA-safe.

---

## 2026-04-12 — Friends → Activity notifications stale/out-of-order

### Context
Production QA: Activity tab shows February items on top in April. Backend `/api/notifications/paginated` orders by `id` DESC (cuid, not strictly time-monotonic under backfill / clock skew), and the frontend `useFocusEffect` only called `markAllSeen()` — never `refetch()`. Combined with `staleTime: 30_000`, returning to the screen served stale cache indefinitely.

### Files read
- `src/app/friends.tsx` — Activity pane mount site (tab 0 → `<FriendsActivityPane />`)
- `src/components/friends/FriendsActivityPane.tsx` — thin wrapper around `<ActivityFeed embedded />`
- `src/components/activity/ActivityFeed.tsx` — owns `useFocusEffect` + list render
- `src/hooks/usePaginatedNotifications.ts` — owns the infinite query (flatten + dedupe)
- `src/lib/queryKeys.ts` — `qk.notifications() = ["notifications"]`
- `my-app-backend/src/routes/notifications.ts` — confirmed `orderBy: { id: "desc" }` on paginated endpoint
- `my-app-backend/prisma/schema.prisma` — confirmed `id String @default(cuid())`

### Root cause
Two-part bug:
1. **Order:** Display depended on server order (`id` DESC). Cuid is only approximately time-sortable — any backfill or server clock skew flips older items above newer ones.
2. **Freshness:** `staleTime: 30_000` + no `refetch()` in the focus effect + no AppState foreground listener. Returning to the screen served cache.

### Fix — proof tag `[NOTIF_FRESHNESS_V1]`
- `usePaginatedNotifications.ts`: `staleTime: 0`, `refetchOnMount: true`, and client-side `sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))` applied after dedupe.
- `ActivityFeed.tsx`: `useFocusEffect` now calls `refetch()` alongside `markAllSeen()`. New `AppState.addEventListener("change", ...)` `useEffect` calls `refetch()` when state becomes `active`.

### Files changed
- `src/hooks/usePaginatedNotifications.ts`
- `src/components/activity/ActivityFeed.tsx`
- `docs/SYSTEMS/activity-feed.md` — NEW. SSOT for the feed + `[NOTIF_FRESHNESS_V1]` contract.
- `docs/SESSION_LOG.md` (this entry)
- `docs/FORENSICS_CACHE.md` — forensic entry with guardrail.

### Verification
- `npx tsc --noEmit` clean.
- Backend untouched (per task constraint).
- No changes to unread-count query (`useUnseenNotifications`) — only the paginated list.
- OTA-safe: pure JS/TS.

---

## 2026-04-12 — Find Friends: existing friends leaking into "Invite your friends"

### Context
Live production: the "Invite your friends" section on the Find Friends screen included contacts who were already on Open Invite (existing friends, pending-request users, self). Root cause was name-based dedup between matched OI users and device contacts — fragile whenever display name differed from the contact's first+last (aliases, initials, single-word names, casing mismatches).

### Files read
- `src/app/add-friends.tsx` — renders the Invite section from `matchContacts().unmatched`
- `src/lib/contactsMatch.ts` — hash + dedup pipeline
- `src/components/FriendDiscoverySurface.tsx` — on-platform Search + People You May Know (unchanged)
- `my-app-backend/src/routes/contacts.ts` — `/api/contacts/match` endpoint (already computes `isFriend`/`isPending`, returns matched users)

### Root cause
Backend returned only the list of matched users (with isFriend/isPending flags) but NOT which incoming hashes produced those matches. `contactsMatch.ts` fell back to case-insensitive full-name equality to subtract matched users from the unmatched list — easily defeated by any naming divergence. The frontend had no other way to identify which contact was on-platform.

### Fix — proof tag `[CONTACTS_INVITE_HASH_ECHO_V1]`
**Backend:** `/api/contacts/match` now also echoes `matchedPhoneHashes` / `matchedEmailHashes` — the incoming hashes that resolved to ANY Open Invite user (including self; the viewer's own phone/email is checked separately since self is excluded from the candidates list).

**Frontend:** `contactsMatch.ts` restructured so each contact carries its own hash bundle. A contact enters `unmatched` only if NONE of its phone/email hashes appear in the matched-hash echo. The old name-based dedup remains as a legacy-server fallback.

### Files changed
- `my-app-backend/src/routes/contacts.ts` — echo matched phone/email hashes; also check viewer's own phone/email hashes so self can't leak into invite list.
- `src/lib/contactsMatch.ts` — per-contact hash tracking; hash-set subtraction replaces name-based dedup; backward-compatible fallback.
- `docs/SYSTEMS/friend-discovery.md` — NEW. SSOT for Find Friends sections, invite-candidate contract, and privacy invariants.
- `docs/SESSION_LOG.md` (this entry)
- `docs/FORENSICS_CACHE.md` — resolved investigation entry.

### Verification
- `npx tsc --noEmit` clean (frontend).
- `npx tsc --noEmit` clean (backend).
- Privacy: no new raw contact data persisted or logged server-side; echo contains only hashes the client already sent.

---

## 2026-04-12 — Discover → Map → Public: own hosted public event missing

### Context
QA: Newly created public event now appears in Social → Public Invite (prior fix), but the same event does NOT appear in Discover → Map → Public. Empty state "No events with locations nearby" shown.

### Files read
- `docs/SYSTEMS/discover.md` — lane separation invariants + `[PUBLIC_LANE_OWN_EVENTS_V1]`
- `src/app/discover.tsx` — `enrichedEvents` (feed ∪ myEvents, deduped), `publicSorted`, `mapEvents`
- `src/lib/discoverFilters.ts` — `isVisibleInPublicFeed`, `isEventVisibleInMap`, `isEventResponded`, `hasValidCoordinates`
- `src/app/social.tsx` — reference for the own-event bypass pattern shipped under `[PUBLIC_LANE_OWN_EVENTS_V1]`

### Root cause
`mapEvents` Public filter called `isVisibleInPublicFeed(e, loc, now)` with no viewer context. That helper excludes events where `isEventResponded(event)` is true. The creator/host is typically auto-"going" on their own event → `viewerRsvpStatus === "going"` → event excluded from Map Public. `enrichedEvents` already includes own events (sourced from `feedData ∪ myEventsData`), so the bug was purely in the filter, not the pool.

Same bug also affected the Discover Events Public pill (`publicSorted`) which called the same helper without viewer context — fixed for coherence with the cross-surface alignment rule.

### Fix — proof tag `[PUBLIC_LANE_OWN_EVENTS_V1]` (extended to Discover surfaces)
- `src/lib/discoverFilters.ts`: extended `isVisibleInPublicFeed` signature to `(event, userLocation?, now?, viewerUserId?)`. When `viewerUserId` is provided and `event.userId === viewerUserId`, the `isEventResponded` check is bypassed. Backwards compatible — the new arg is optional.
- Added `userId?: string | null` to `ClassifiableEvent` interface.
- `src/app/discover.tsx`: `publicSorted` and `mapEvents` Public branch now pass `session?.user?.id` as the viewer user id.
- Map-marker coord requirement (`isEventVisibleInMap`) untouched — that is a map-surface contract, not a public-lane contract.

### Files changed
- `src/lib/discoverFilters.ts` — helper signature + interface field.
- `src/app/discover.tsx` — two memo call sites pass viewerUserId.
- `docs/SYSTEMS/discover.md` — added two invariants (surface coherence + map coord contract).
- `docs/SESSION_LOG.md` (this entry).
- `docs/FORENSICS_CACHE.md` — resolved investigation entry.

### Scope vs. expected
Expected: `src/app/discover.tsx` + possibly one shared helper + one SSOT doc. Actual: exact match — one helper (`discoverFilters.ts`), one screen (`discover.tsx`), one SSOT doc (`discover.md`). No backend change: own events already reach `enrichedEvents` via `myEventsData`, and map markers correctly still require coords.

### Verification
- `npx tsc --noEmit` clean.
- Frontend-only; OTA-safe.
- Coherent with existing Social Public Invite fix: both surfaces now bypass the responded filter for own events through the same SSOT helper.

---

## 2026-04-12 — Event detail location card: precedence patch

### Context
Follow-up to the `[P0_LOCATION_ALWAYS_RENDER]` always-render fix. The first-pass state derivation had the wrong precedence: an event with **no** location AND `locationHiddenByPrivacy === true` rendered `"RSVP to see location"` — telling the viewer to RSVP in order to reveal a location that does not exist.

### Files read
- `src/app/event/[id].tsx` — location card state derivation block shipped in the prior patch.
- `docs/SYSTEMS/event-page.md` — existing location-card invariant (to tighten the precedence contract).

### Root cause
Boolean ordering in the placeholder derivation:
```ts
// WRONG
const locationIsHidden = locationHiddenByPrivacy;
const hasLocation = !!locationDisplay;
const showPlaceholder = locationIsHidden || !hasLocation;
const placeholderText = locationIsHidden
  ? "RSVP to see location"
  : "Location not set";
```
`locationIsHidden` was evaluated independently of `hasLocation`, so the text ternary reached "RSVP to see location" first even when the event had no location at all.

### Fix — proof tag `[P0_LOCATION_ALWAYS_RENDER]` (precedence tightened)
- `src/app/event/[id].tsx`: reworked state derivation so `!hasLocation` always wins:
  ```ts
  // [P0_LOCATION_ALWAYS_RENDER] Precedence: no-location beats hidden-by-privacy.
  const hasLocation = !!locationDisplay;
  const locationIsHidden = hasLocation && locationHiddenByPrivacy;
  const showPlaceholder = !hasLocation || locationIsHidden;
  const placeholderText = !hasLocation
    ? "Location not set"
    : "RSVP to see location";
  ```
- `docs/SYSTEMS/event-page.md`: tightened the location-card invariant to enumerate three states in strict precedence order (no-location → hidden-by-privacy → visible) and made the no-location precedence rule explicit ("This state wins unconditionally").

### Files changed
- `src/app/event/[id].tsx` — state derivation precedence corrected.
- `docs/SYSTEMS/event-page.md` — invariant restated in strict precedence order.
- `docs/SESSION_LOG.md` (this entry).
- `docs/FORENSICS_CACHE.md` — resolved investigation entry appended.

### Scope vs. expected
Expected: one file (`event/[id].tsx`) + three SSOT docs. Actual: exact match. No logic change to `locationHiddenByPrivacy` polarity, host bypass, or RSVP bypass — only the state-derivation precedence.

### Verification
- `npx tsc --noEmit` clean.
- Frontend-only; OTA-safe.
- Three explicit states validated:
  1. `locationDisplay = ""` + `locationHiddenByPrivacy = true` → "Location not set" (previously "RSVP to see location" — BUG).
  2. `locationDisplay = "Griffith Park"` + `locationHiddenByPrivacy = true` → "RSVP to see location".
  3. `locationDisplay = "Griffith Park"` + `locationHiddenByPrivacy = false` → real location row with map + Get Directions.

---

## 2026-04-12 — Discover fail-soft hotfix (full-screen fatal on any subquery error)

### Context
Production users intermittently landing on a full-screen Discover blocker titled "Still Loading..." with body "Something went wrong loading events. Please try again." Discover is the main acquisition surface; this was taking the whole page down on any single core-query error and also rendering contradictory copy (a "Still Loading..." title on an error state).

### Files read
- `src/app/discover.tsx` — fatal gate, query declarations.
- `src/components/LoadingTimeoutUI.tsx` — hardcoded "Still Loading..." title regardless of caller intent.
- `docs/SYSTEMS/discover.md` — invariants, data sources, panes.

### Root cause
Two bugs stacked:
1. **Over-broad fatal guard.** `const isError = feedError || myEventsError;` then `if (isError && !showDiscoverLoading)` — any single core query error blanked the whole page, even when the other core query had data (cached or fresh). Secondary queries were not themselves in the gate, but the OR semantics on the two core queries alone were enough to reproduce the full-screen blocker in the wild.
2. **Contradictory copy.** `LoadingTimeoutUI` hardcoded the title "Still Loading..." and the discover error path piped the error body through the `message` prop — yielding "Still Loading..." + "Something went wrong" on the same screen.

### Fix — proof tag `[DISCOVER_FAIL_SOFT_V1]`
- `src/app/discover.tsx`:
  - Replaced `const isError = feedError || myEventsError;` with a narrower `isFatalError`:
    ```ts
    const hasAnyCoreEventData = !!(
      (feedData?.events && feedData.events.length > 0) ||
      (myEventsData?.events && myEventsData.events.length > 0)
    );
    const isFatalError = feedError && myEventsError && !hasAnyCoreEventData;
    ```
  - Gate is now `if (isFatalError && !showDiscoverLoading)` only. Secondary queries (`attending`, `friendsHostedFeed`, `friendsFeed`, `friends`) remain pane-level degradations as before — they never entered the gate, and the new invariant explicitly forbids any future regression.
  - Tightened fatal copy: `title="Couldn't load events"` + `message="Check your connection and try again."` (one coherent state).
- `src/components/LoadingTimeoutUI.tsx`:
  - New optional `title` prop. Default remains `"Still Loading..."` for the timeout path (no caller change needed). Discover error path passes the new title explicitly.

### Files changed
- `src/app/discover.tsx` — fatal-guard narrowing + tightened fatal copy.
- `src/components/LoadingTimeoutUI.tsx` — optional `title` prop.
- `docs/SYSTEMS/discover.md` — new `[DISCOVER_FAIL_SOFT_V1]` invariant.
- `docs/SESSION_LOG.md` (this entry).
- `docs/FORENSICS_CACHE.md` — resolved investigation entry appended.

### Scope vs. expected
Expected: `src/app/discover.tsx` + possibly one helper + three SSOT docs. Actual: `discover.tsx`, `LoadingTimeoutUI.tsx`, three docs. `LoadingTimeoutUI` was in scope because it held the contradictory hardcoded title — fixing the copy without touching it would have required a workaround.

### Verification
- `npx tsc --noEmit` clean.
- Frontend-only; OTA-safe.
- Fatal-guard truth table:
  | feedError | myEventsError | feedData (events) | myEventsData (events) | Fatal? |
  |-----------|---------------|-------------------|-----------------------|--------|
  | ✓ | ✓ | empty | empty | YES |
  | ✓ | ✓ | cached non-empty | empty | no (soft) |
  | ✓ | ✗ | — | any | no (soft) |
  | ✗ | ✓ | any | — | no (soft) |
  | ✗ | ✗ | — | — | no |
- Non-core subqueries (attending / friendsHosted / friendsFeed / friends / map-derivation slices) cannot trigger full-screen fatal by construction.

---

## 2026-04-12 — Live resilience audit across main surfaces

### Context
Live traffic is arriving; the app must fail soft across every main surface. Surgical audit across Discover, Social, Calendar, Event Detail, Friends, and add-friends (Find Friends) to identify/fix any place where one bad query, one malformed record, or one transient network hiccup can blank a whole page.

### Surfaces audited
| Surface | File | Fatal guard? | Result |
|---------|------|--------------|--------|
| Discover | `src/app/discover.tsx` | Yes, now narrow (`[DISCOVER_FAIL_SOFT_V1]`) | Shape-guard added to `enrichedEvents` (`[DISCOVER_SHAPE_GUARD_V1]`). |
| Social | `src/app/social.tsx` | None — degrades via empty states | No page-level fatal patch needed. One hardening in insight-memory derivation. |
| Calendar | `src/app/calendar.tsx` | Boot/auth-scoped only (`isTimedOut || bootStatus === 'error'`) | Already scoped; date derivations already NaN-guarded. No patch. |
| Event detail | `src/app/event/[id].tsx` | Scoped to single `event` query via `EventDetailErrorState` + privacy gate | Minimum viable payload IS the event; already correct. No patch. |
| Friends | `src/app/friends.tsx` | Boot-timeout only; no query-level `isError` gate | Already correct. No patch. |
| add-friends (Find Friends) | `src/app/add-friends.tsx` | None — error paths are toast-based | Already correct. No patch. |

### Files read
- `src/app/discover.tsx`, `src/app/social.tsx`, `src/app/calendar.tsx`, `src/app/event/[id].tsx`, `src/app/friends.tsx`, `src/app/add-friends.tsx`.
- `src/components/LoadingTimeoutUI.tsx`.
- `shared/contracts.ts` (title/event schema sanity).
- `docs/SYSTEMS/discover.md`.

### Root causes found & patched
1. **Discover derivation fragility.** The `enrichedEvents` SSOT memo called `event.title.toLowerCase().trim()` and `event.user?.id` inside the dedup loop with no shape guard. A single record missing `title` (or `id` / `startTime`) would throw `TypeError` from the memo and the entire Discover render would blank — even though the fail-soft fatal guard (`[DISCOVER_FAIL_SOFT_V1]`) would NOT catch it (memos throw outside the React Query error boundary). Classic "one bad record kills a screen" resilience bug.
2. **Social insight generation fragility.** `attendingEvents.map(e => e.title.toLowerCase())` in the first-value-nudge insight generator would throw if any attending event had a null title. Low blast radius (the function is memoized and a thrown exception would trip the enclosing IIFE), but still a real risk on a non-core path — fixed with optional chain + filter.

### Fixes — proof tag `[DISCOVER_SHAPE_GUARD_V1]`
- `src/app/discover.tsx`:
  - Added `isShapeValid` type-guard at the head of `enrichedEvents`:
    ```ts
    const isShapeValid = (e: PopularEvent | undefined | null): e is PopularEvent =>
      !!e && typeof e.id === "string" && !!e.id &&
      typeof e.title === "string" && !!e.title &&
      typeof e.startTime === "string" && !!e.startTime;
    ```
  - Filtered at id-dedup entry: `if (!isShapeValid(event)) return;`
  - Hoisted `event.title.toLowerCase().trim()` into a single local `titleKey` for both dedup strategies (cleaner + no regression).
- `src/app/social.tsx`:
  - `e.title.toLowerCase()` → `(e.title ?? "").toLowerCase()` with a `.filter(Boolean)` downstream so empty titles are dropped from pattern analysis rather than crashing it.

### Surfaces explicitly left unchanged
- **Calendar:** Only full-screens when boot/auth is degraded. Event-date derivations (`getEffectiveStart`) already use `isNaN(d.getTime())` fallbacks. No query-level `isError` fatal.
- **Event detail:** Full-screens only when the single `event` query fails (which IS the minimum viable payload). Uses `EventDetailErrorState` + `PrivacyRestrictedGate` + `BusyBlockGate` for scoped error UI with retry.
- **Friends:** Boot-timeout only; no query-level fatal gate. Tab-level failures fall through to empty states.
- **add-friends (Find Friends):** Contact scan + invite mutations error via `safeToast`; no full-screen failure path. Hash-echo contact filter already shipped under `[CONTACTS_INVITE_HASH_ECHO_V1]` with OTA-safe legacy fallback.

### Files changed
- `src/app/discover.tsx` — shape guard on `enrichedEvents`.
- `src/app/social.tsx` — null-safe title derivation in insight generator.
- `docs/SYSTEMS/discover.md` — new `[DISCOVER_SHAPE_GUARD_V1]` invariant.
- `docs/SESSION_LOG.md` (this entry).
- `docs/FORENSICS_CACHE.md` — resolved investigation entry.

### Scope vs. expected
Expected: one or more of the six surface files + possibly one shared helper + three docs. Actual: `discover.tsx` + `social.tsx` + three docs. Four surfaces audited and explicitly left unchanged with justification above. No shared helper touched — the shape guard is a local boundary to Discover's SSOT memo; lifting it into a library would be over-abstraction for a two-line filter.

### Verification
- `npx tsc --noEmit` clean.
- Frontend-only; OTA-safe.
- Malformed-record resilience: synthesizing a PopularEvent with `title: undefined` into `feedData.events` no longer throws — the record is silently dropped by `isShapeValid` and the rest of the feed renders.
- Fail-soft behavior from `[DISCOVER_FAIL_SOFT_V1]` preserved.

---

## 2026-04-12 — Discover pane-level render isolation

### Context
Closing the remaining resilience gap after the fail-soft fatal guard (`[DISCOVER_FAIL_SOFT_V1]`) and derivation shape-guard (`[DISCOVER_SHAPE_GUARD_V1]`): a synchronous render-time throw inside one Discover pane would still escape those guards (they cover query-state and derivation-memo paths, not render-time crashes) and blank the whole Discover screen through the root error boundary. Add pane-level isolation so Map / Events / Responded fail independently.

### Files read
- `src/app/discover.tsx` — three lens render branches.
- `src/components/ErrorBoundary.tsx` — existing class-component boundary with static-ReactNode fallback only.
- `docs/SYSTEMS/discover.md`.

### Root cause
No pane-level render boundary. The three-way ternary `{lens === "map" ? ... : lens === "events" ? ... : <Responded>}` rendered each pane inline as a sibling of the shell chrome, with no boundary between them and the page root. A throw inside Events' feed card render or Responded's list row, for example, would bubble to the top-level `ErrorBoundary` and replace the whole screen with the generic "Something went wrong" fallback.

### Fix — proof tag `[DISCOVER_PANE_ISOLATION_V1]`
- `src/components/ErrorBoundary.tsx`: extended `fallback` prop to accept a render function `(ctx: { error, reset }) => ReactNode` in addition to the existing `ReactNode` form. Backwards compatible — existing static-ReactNode callers are unchanged (branch falls through to the legacy path when `typeof fallback !== "function"`).
- `src/app/discover.tsx`:
  - Imported `ErrorBoundary`.
  - Added a local `DiscoverPaneErrorFallback` component rendering an inline (`flex: 1`) fallback with copy `"Couldn't render this view"` + `"Try switching tabs or tap retry. The rest of Discover is still available."` and a retry button wired to the boundary's `reset()`.
  - Wrapped each of the three lens render branches (Map / Events / Responded) in its own `<ErrorBoundary>` passing the render-function fallback with the appropriate pane label.

### Files changed
- `src/components/ErrorBoundary.tsx` — render-function fallback support (additive).
- `src/app/discover.tsx` — pane-level boundaries + inline fallback component.
- `docs/SYSTEMS/discover.md` — new `[DISCOVER_PANE_ISOLATION_V1]` invariant.
- `docs/SESSION_LOG.md` (this entry).
- `docs/FORENSICS_CACHE.md` — resolved investigation entry.

### Scope vs. expected
Expected: `src/app/discover.tsx` + possibly one small shared/local boundary component + three docs. Actual: `discover.tsx` + additive patch to existing shared `ErrorBoundary.tsx` + three docs. Chose to extend the existing shared boundary (render-prop fallback) rather than create a new Discover-specific component — the one-line backwards-compatible extension is strictly smaller than duplicating the class component and its telemetry hook (`trackAppCrash` / `[P0_CRASH_CAPTURED]`).

### Verification
- `npx tsc --noEmit` clean.
- Frontend-only; OTA-safe.
- Render-throw isolation matrix:
  1. Force a throw inside Map pane rendering (e.g. `throw new Error("map boom")` in a marker callback or memo that runs at render time) → Map pane shows `DiscoverPaneErrorFallback`; Events tab, Responded tab, lens switcher, floating Create pill, `BottomNavigation` remain interactive. Switching to Events pane renders Events normally.
  2. Force a throw inside Events feed card render → Events pane shows the pane fallback; Map + Responded unaffected.
  3. Force a throw inside Responded list row render → Responded pane shows the pane fallback; Map + Events unaffected.
- Retry behavior: tapping "Try Again" inside a pane fallback calls `reset()` on that pane's boundary; the pane re-mounts children and renders normally if the underlying condition cleared.
- Existing top-level `ErrorBoundary` still catches anything that escapes a pane (e.g. a throw inside the shell/header). The pane boundary narrows the blast radius without replacing the safety net.

---

## 2026-04-13 — Comment permission: RSVP no longer gates discussion

### Summary
Live-production hotfix. A user reported they could not comment on an event unless they RSVP'd first. This contradicts the product rule: "if a viewer can access the event page, they can comment." Fixed at both layers (frontend + backend) — they were independently enforcing an RSVP gate. Tag: `[P0_COMMENT_ACCESS_PARITY_V1]`.

### Root causes
1. **Frontend (`src/app/event/[id].tsx`)**: The Discussion card had a blur overlay gated on `shouldBlurDetails = hideDetailsUntilRsvp && myRsvpStatus !== "going" && !isMyEvent`. When the host enabled `hideDetailsUntilRsvp`, the overlay covered the entire Discussion card (including the composer input) with the text "RSVP to see discussion", making it impossible to post a comment pre-RSVP.
2. **Backend (`my-app-backend/src/routes/events-interactions.ts`)**: GET and POST `/api/events/:id/comments` each enforced a narrower check than event view: `owner/host OR RSVP'd OR (friendship for all_friends|specific_groups)`. Crucially, `visibility === "public"` was NOT in the pass-through list — only `"open_invite"` was. A user who could view a public event but hadn't RSVP'd and wasn't friends with the host would receive `403 "You don't have access to comment on this event"`.

### Fix
- **Backend**: Added `canAccessEventDiscussion({ eventId, userId })` helper at top of `events-interactions.ts`. Mirrors the access ladder in `events-crud.ts` GET `/:id` — owner/host → attending (accepted join request) → circle member (if circle-scoped) → public or open_invite → friend with visibility access (`all_friends` or `specific_groups` with group-membership intersection). RSVP is no longer a gate. Both GET and POST `/comments` now call this helper and return `404` (event not found) or `403` (no access) appropriately.
- **Frontend**: Removed the RSVP blur overlay from the Discussion card in `src/app/event/[id].tsx`. Who's Coming and Location cards still honor `shouldBlurDetails` — only discussion is exempted, because discussion is a pre-RSVP clarification channel. Added an inline `[P0_COMMENT_ACCESS_PARITY_V1]` comment above the card documenting the invariant.

### Files changed
- `my-app-backend/src/routes/events-interactions.ts` — new helper + replaced two gate blocks
- `src/app/event/[id].tsx` — removed blur overlay on Discussion card
- `docs/SYSTEMS/event-page.md` — new `[P0_COMMENT_ACCESS_PARITY_V1]` invariant
- `docs/SESSION_LOG.md` — this entry
- `docs/FORENSICS_CACHE.md` — resolved investigation entry

### Expected vs actual changed files
Expected: `src/app/event/[id].tsx` + one backend route + three docs. Actual matches. No shared contract (`shared/contracts.ts`) change needed — the create-comment request schema is unchanged.

### Verification
- `npx tsc --noEmit` clean on both frontend and backend.
- Logical matrix:
  1. Host disables RSVP-gate (`hideDetailsUntilRsvp=false`): viewer sees Discussion card as before, can comment. Unchanged.
  2. Host enables RSVP-gate, viewer hasn't RSVP'd: Discussion card is no longer blurred; viewer can read + post comments. Who's Coming and Location remain blurred (intended).
  3. Public event, viewer not RSVP'd, not a friend: backend allows comment creation (previously 403).
  4. `all_friends` event, viewer not a friend: backend still denies (access rule unchanged, correctly).
  5. `circle_only` event, viewer not a circle member: backend still denies.
  6. Private / unknown visibility: backend still denies.
  7. No stale "RSVP to see discussion" or "RSVP to comment" copy anywhere in the app.

### Scope discipline
- No redesign of the discussion UI.
- Comment fetch/display behavior untouched.
- Moderation / reporting / blocking / rate-limiting (`strictRateLimit`, `relaxedRateLimit`, email-verified gate) all preserved.
- Frontend blur for Who's Coming and Location cards is intentionally preserved — those are legitimate RSVP-gated surfaces and outside this hotfix's scope.
