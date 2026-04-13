# Forensics Cache — iOS Build Failure Loop

> Active investigation scratchpad. Mark items RESOLVED when confirmed.

## RESOLVED 2026-04-13 — Discover Events filter flattening (Going / Not Going first-class) [WHOS_DOWN_V1]

**Symptom:** Reaching Going/Not Going took three nesting levels: Discover tab → Events lens → Responded pill → sub-filter row. Too much navigation for a list view.

**Investigation:**
- `EventSort` enum had `"responded"` as a parent, with a sibling `RespondedSubFilter` state (`"going" | "not_going"`). When `eventSort === "responded"`, a second-row pill strip rendered; `activeFeed` branched on both variables.
- `respondedGoingSorted` and `respondedNotGoingSorted` are cheap derivations of a shared `respondedSorted` memo (`enrichedEvents.filter(isEventResponded)`), so there was no reason the UI had to keep them behind a single parent pill.
- Analytics derived the pill as `responded:${sub}` composite — not a contract anywhere, just a local string.

**Root cause:** UI state model nested what was semantically flat. The two datasets are peers, not a parent-child.

**Fix:**
1. `EventSort` → drop `"responded"`, add `"going"` and `"not_going"` directly. `SORT_OPTIONS` grows by one net pill.
2. Delete `RespondedSubFilter` type, `RESPONDED_SUB_OPTIONS` constant, and the `respondedSubFilter` state hook — nothing outside `discover.tsx` referenced them.
3. `activeFeed` branches: `going → respondedGoingSorted`, `not_going → respondedNotGoingSorted`. Datasets untouched.
4. Delete the `eventSort === "responded" && (...)` second-row JSX block.
5. `ListEmptyComponent` responded branch re-keyed to `eventSort === "going" || eventSort === "not_going"`; per-status copy preserved.
6. Analytics `pill` simplified to bare `eventSort` value for both `trackDiscoverSurfaceViewed` and `trackDiscoverEventOpened`.

**Verification:**
- `npx tsc --noEmit` clean (exit 0).
- Grep confirms `RespondedSubFilter` / `respondedSubFilter` / `RESPONDED_SUB_OPTIONS` have no remaining references in the repo.
- `respondedGoingSorted` / `respondedNotGoingSorted` memos retained — no logic change, same invariants.

---

## RESOLVED 2026-04-13 — Who's Down v1 frontend [WHOS_DOWN_V1]

**Symptom (none — frontend wire-up):** Backend phase 1 landed (casual mode, friends-only feed, respond, confirm-converted). Need the UI to (a) replace Discover's Responded tab with Who's Down while preserving the Responded filters, (b) expose a <15s creation path without a new full-screen route, (c) render casual detail with "I'm Down" instead of accept/decline, and (d) convert ideas to real events via the existing `/create` pipeline.

**Investigation:**
- Discover `Lens` was `"map" | "events" | "responded"`. Responded pane was an inline ScrollView with date groupings. Reusing the Events FlatList renderItem (already enriched for cards) lets Responded live as an Events pill with Going/Not Going sub-filter — no duplicated card rendering.
- `event-request/[id].tsx` already gates formal-mode on `needsResponse` (non-creator + pending member). Casual requires a different surface entirely: no invitees, one-tap "I'm Down", creator convert action.
- `create.tsx` already accepts `title`, `emoji`, `visibility` prefill params. Adding `location` + `fromWhosDownId` is additive. `locationSearch.prefillLocation()` is the SSOT used by edit/copy flows.

**Root cause / decision:** Keep the surface flat. No new screens. Creation = bottom-sheet inside `discover.tsx`. Detail = same `/event-request/[id]` route, branched on `mode`. Conversion owned by `/create`, triggered via URL params + a post-success `confirm-converted` call.

**Fix:**
1. `qk.whosDownFeed()` added to SSOT registry; `src/lib/queryKeys.ts` `QK_OWNED_ROOTS` includes `"whos-down-feed"`.
2. Discover: Lens `whos_down` replaces `responded`; Events pane adds `responded` pill with Going/Not Going sub-filter strip + empty state; Who's Down tab shows `(N)` count badge.
3. Discover: Who's Down pane renders explainer card, friends-only helper, feed cards (title/timeHint/where/creator/down count/"I'm Down"), empty state, error soft-fail banner.
4. Discover: bottom-sheet creation Modal (title + 5 time-hint chips + where + friends-only helper + Post Idea CTA) firing `POST /api/event-requests` with `mode: "casual"`.
5. `event-request/[id].tsx`: casual-mode early return with idea card, pills, down count + avatar grid, pinned "I'm Down"/"You're Down" button, creator "Make It Happen" + "Cancel Idea", confirmed banner. `respondMutation` stays on screen for casual and invalidates `qk.whosDownFeed()`.
6. `create.tsx`: accepts `location` + `fromWhosDownId` URL params; ref-guarded prefill; post-success calls `POST /api/event-requests/:id/confirm-converted` before navigating.

**Verification:**
- `npx tsc --noEmit` clean (exit 0).
- Discover pane isolation preserved (ErrorBoundary wraps the Who's Down pane).
- `qk.whosDownFeed()` refetch registered in `useLiveRefreshContract.refetchFns` (pull-to-refresh + foreground return).

---

## RESOLVED 2026-04-13 — Who's Down v1 backend [WHOS_DOWN_V1]

**Symptom (none — greenfield feature):** Need a lightweight friends-only "idea post" pre-event-creation primitive without inventing a new table or duplicating event-request infra.

**Investigation:**
- `event_request` already has friend member tracking, respond flow, push governance, and notifications. Extending it with a `mode` field is strictly additive vs. building a parallel table.
- Audited every `orderBy: { startTime }` across the backend. Only `eventRequests.ts:97` (now formal-only filtered) touches `event_request.startTime`. All other `startTime` orderings are on the `event` model (unchanged, NOT NULL).
- Confirmed `friendship` table direction: single-direction (`userId/friendId`) — matches existing convention; reused for casual visibility.

**Root cause / decision:** Extend `event_request.mode` rather than build a new table or extend circle polls (which lock to circle membership and lack convert semantics).

**Fix:**
1. Schema: nullable `startTime`, new columns `mode`/`timeHint`/`whereText`/`expiresAt`/`thresholdNotifiedAt`, two indexes.
2. Routes: casual branches in create + respond + GET /:id; new `GET /feed/whos-down`; formal-only guards on nudge + suggest-time.
3. Migration: additive SQL, default `mode = "formal"` keeps existing rows + clients working.
4. Threshold push: one-shot guarded by `thresholdNotifiedAt`.

**Guardrail / invariant:**
- `[WHOS_DOWN_V1]` invariants in `my-app-backend/docs/INVARIANTS.md` and `open-invite-app/docs/SYSTEMS/whos-down.md`.
- Any future `orderBy: { startTime }` on `event_request` MUST include `mode: "formal"` filter.
- Conversion = two-step write: standard `POST /api/events` then `POST /api/event-requests/:id/confirm-converted` with `{ eventId }`. Confirm endpoint is creator-only, idempotent, and verifies event ownership. Removes idea from `feed/whos-down` immediately and notifies "down" friends (no auto-RSVP).

---

## Investigation: lottie-ios version drift on EAS
**Status:** OPEN

**Build 266 state (936ff97, 2026-03-27):**
- lottie-react-native 7.2.2 → lottie-ios 4.5.0
- @sentry/react-native ~6.14.0 → RNSentry 6.14.0 → Sentry/HybridSDK 8.50.2
- SDWebImageAVIFCoder 0.11.1 (present)
- EXPO_IMAGE_NO_AVIF NOT set
- No EAS image pin (used default)
- No EAS build hooks
- @sentry/react-native in app.json plugins
- Podfile.lock committed with full Sentry + AVIF + lottie 4.5.0 pod graph

**Current HEAD state (7e7f375):**
- lottie-react-native 7.3.6 → lottie-ios 4.6.0
- @sentry/react-native REMOVED entirely
- SDWebImageAVIFCoder REMOVED (EXPO_IMAGE_NO_AVIF=1)
- EAS build hook: eas-build-post-install.sh (AVIF podspec + Swift source patching)
- Sentry removed from: app.json plugins, package.json, pbxproj (build phases, bundle resources)
- Podfile has wholemodule hack for lottie-ios in post_install
- Podfile.lock committed with lottie 4.6.0, no Sentry, no AVIF

**Key delta analysis:**
The pod graph changed in three dimensions simultaneously:
1. Sentry removed (RNSentry + Sentry/HybridSDK + sentry.properties + build phases)
2. Lottie upgraded (7.2.2→7.3.6, lottie-ios 4.5.0→4.6.0)
3. AVIF removed (SDWebImageAVIFCoder excluded via env var + script patching)

**Hypothesis:** The lottie-ios 4.5.0 error on EAS may be from a build triggered
from a commit BEFORE the 7.3.6 upgrade was complete, OR from EAS running
`npx expo prebuild --no-install` which could regenerate some native files.

## Investigation: Sentry removal completeness
**Status:** RESOLVED
- @sentry/react-native removed from package.json ✓
- @sentry/react-native removed from app.json plugins ✓
- Sentry build phases removed from pbxproj ✓
- sentry-xcode.sh wrapper removed from Bundle RN phase ✓
- Sentry.bundle removed from CP Copy Pods Resources phase ✓
- ios/sentry.properties deleted (was untracked) ✓
- No Sentry pods in Podfile.lock ✓
- No @sentry imports in JS/TS source (only no-op stub in _layout.tsx) ✓

## Investigation: AVIF exclusion chain
**Status:** OPEN — needs EAS verification
- ENV['EXPO_IMAGE_NO_AVIF'] = '1' in Podfile ✓
- EXPO_IMAGE_NO_AVIF=1 in eas.json production env ✓
- eas-build-post-install.sh patches podspec + Swift source ✓
- Local pod install produces lockfile without SDWebImageAVIFCoder ✓
- **Risk:** On EAS, the post-install hook patches expo-image BEFORE pod install,
  which is correct. But if expo prebuild regenerates the podspec from node_modules
  AFTER the hook runs, the patch would be overwritten.

---

## Investigation: Calendar import "DEFAULT VISIBILITY" control removal (2026-04-12)
**Status:** RESOLVED

**Problem:** `src/app/import-calendar.tsx` rendered an interactive DEFAULT VISIBILITY section (chevron row → full-screen picker modal) that implied user choice where none existed. Imported events are treated as private by default; the control was misleading on a trust-sensitive privacy surface.

**Scope confirmed via freshness check:**
- Only `src/app/import-calendar.tsx` owns this UI. No other screen renders a default-visibility control for imports.
- `docs/SYSTEMS/calendar.md` had one stale line (resync-mode bullet: "Uses existing import mutation + visibility selector").
- No dedicated `docs/SYSTEMS/calendar-import.md` existed.

**Fix (UI/copy only, OTA-safe):**
- Replaced the chevron row with a non-interactive `PRIVACY` section:
  > All imported events are private — only you can see them. You can change visibility anytime after import.
- Deleted `VISIBILITY_OPTIONS`, `VisibilityOption`, `defaultVisibility`/`showVisibilityModal` state, `currentVisibilityOption`, and the picker `Modal`.
- Mutation payload now hard-codes `defaultVisibility: "private"` (request contract unchanged).
- Created `docs/SYSTEMS/calendar-import.md` as SSOT; fixed stale bullet in `calendar.md`.

**Guardrail:** The new SSOT doc declares that the import screen MUST NOT render any interactive default-visibility control. Reintroducing one requires an explicit product decision and an update to both `calendar-import.md` and `calendar.md`.

---

## Investigation: Event detail scroll jank with video-backed themes (2026-04-12)
**Status:** RESOLVED (pending device validation)

**Symptom:** Scroll on `src/app/event/[id].tsx` becomes janky when a theme video is active.

**Active render stack (before fix) when theme video is present:**
1. `AnimatedGradientLayer` — Reanimated opacity crossfade with `withRepeat(withTiming(...))` on 5–22s cycle.
2. `ThemeVideoLayer` — `expo-video` looping `VideoView` (decode + composite per frame).
3. Particle layer (either `MotifOverlay` for custom effects or `ThemeEffectLayer` for theme-bundled particles) — Skia `Canvas` driven by Reanimated `useFrameCallback` per-frame particle simulation.
4. `ThemeFilterLayer` — static Skia canvas (film grain / vignette / noise / color shift).

All four mount via `src/components/event/ThemeBackgroundLayers.tsx`, which is called exactly once from `event/[id].tsx:2060`. During `Animated.ScrollView` scroll, the layered absolute-positioned hierarchy re-composites with all four animated systems still live.

**Fix (proof tag `[PERF_VIDEO_CONTAINMENT_V1]`):**
- Added `hasActiveVideo = Boolean(visualStack?.video && THEME_VIDEOS[source])` in the orchestrator.
- Gated the gradient and particle blocks on `!hasActiveVideo`.
- Kept the video + static filter layer.
- Non-video themes unchanged — they keep the full stack because video isn't contributing motion there.

**Why this is surgical:**
- Single file (`ThemeBackgroundLayers.tsx`). No touching of `event/[id].tsx`, `ThemeVideoLayer.tsx`, `ThemeEffectLayer.tsx`, or `MotifOverlay.tsx` (those stay reusable by create/edit flows which still want the full stack).
- No entitlement changes, no catalog changes, no native changes.
- Reduced-motion / video-load-failure paths already render a poster inside `ThemeVideoLayer`, so suppressing the gradient is visually safe (the poster fills the same background real estate).

**Guardrail:** Re-enabling gradient or particles alongside a video in `ThemeBackgroundLayers.tsx` requires re-validating scroll perf on device first. The rule is encoded as an invariant in `docs/SYSTEMS/event-page.md`.

**Open follow-ups (out of scope for this fix):**
- Consider `shouldRasterizeIOS`/`renderToHardwareTextureAndroid` on the scroll content if further wins are needed.
- Audit whether the `InviteFlipCard` re-renders on every scroll frame (no evidence yet; would need profiler trace).
- Consider conditionally suppressing the scroll-contended inline discussion composer re-renders if they show up in traces.

---

## Investigation: Social Public Invite missing own event + calendar not switching by pane (2026-04-12)
**Status:** RESOLVED

**Symptoms:**
1. User creates a public event — it does not appear in Social → Public Invite pane.
2. Flipping between Group / Open / Public Invite panes does not change calendar dots or the selected-day event list.

**Forensics path:**
- `src/app/social.tsx` derives three datasets: `groupPaneEvents`, `publicPaneEvents`, `calendarEvents`.
- `publicPaneEvents` was sourced from `discoveryEvents`, which at lines ~1354–1356 explicitly filters out `event.userId === viewerUserId` and `myEventIds.has(e.id)`. Creator's own public events never reached the Public lane.
- Even if they had, the lane used `isVisibleInPublicFeed()` which internally calls `isEventResponded()`. Hosts are auto-"going", so their own event would be filtered out.
- `calendarEvents` was a single dataset used for both FeedCalendar dots and `selectedDateEvents` — no pane switching. Also, `SOCIAL_ALLOWED_VISIBILITY` allowlist (lines 1383–1388) omitted `"public"`, so public events never entered `calendarEvents` at all.

**Fix (proof tags `[PUBLIC_LANE_OWN_EVENTS_V1]`, `[SOCIAL_CALENDAR_PANE_SWITCH_V1]`):**
- `publicPaneEvents` now sources from `feedData ∪ myEventsData ∪ attendingData` (deduped by id). Applies `visibility === "public"` + `isEventEligibleForDiscoverPool` + distance cap. Own events (`userId === viewerUserId`) bypass the `isEventResponded` filter. Sorted via `comparePublicFeedOrder`.
- New `paneCalendarEvents` memo switches by `activePane`: `group` → `groupPaneEvents`, `public` → `publicPaneEvents`, `open` → `calendarEvents` filtered to non-public + non-circle. Both `selectedDateEvents` and `<FeedCalendar events={...} />` now read from it.
- Replaced `isVisibleInPublicFeed` import with the three lower-level helpers it composes (so we can apply the own-event bypass).

**Invalidation check:** No change needed. `getInvalidateAfterEventCreate()` already invalidates `feed + feedPaginated + feedPopular + friendsHostedFeed + mine + myEvents + calendar + attending` — which covers every key the new `publicPaneEvents` and `paneCalendarEvents` read from.

**Guardrail:** Encoded as two invariants in `docs/SYSTEMS/discover.md`:
1. Public Invite pool MUST source from `feedData ∪ myEventsData ∪ attendingData` (not `discoveryEvents`) and MUST bypass the responded filter for own events.
2. Center-tab calendar dataset MUST switch by active pane; no single shared dataset across panes.

**Open follow-ups (out of scope):**
- Consider moving `paneCalendarEvents` construction into a shared hook if the same switching logic is needed elsewhere.
- `SOCIAL_ALLOWED_VISIBILITY` allowlist still omits `"public"` by design for the Open pane — this is intentional (Open ≠ Public), but worth documenting as a distinct invariant if a future pane needs mixed visibility.

---

## Investigation: Friends → Activity notifications stale + out-of-order (2026-04-12)
**Status:** RESOLVED

**Symptom:** Notifications tab shows February items on top in April. Returning to the tab does not refresh — stale cache persists.

**Forensics path:**
- `src/app/friends.tsx` mounts `<FriendsActivityPane />` which wraps `<ActivityFeed embedded />`.
- `ActivityFeed.tsx` consumes `usePaginatedNotifications()`. The hook wraps `useInfiniteQuery` on `GET /api/notifications/paginated`.
- Backend (`my-app-backend/src/routes/notifications.ts:135`) orders by `id: "desc"`. `notification.id` is a cuid (`@default(cuid())`). Cuids are approximately time-sortable but NOT strictly — backfills and clock skew flip ordering.
- Hook had `staleTime: 30_000` and no client-side sort. Flattened pages preserved whatever order the server returned.
- `useFocusEffect` in `ActivityFeed.tsx` only called `markAllSeen()`. No `refetch()`, no AppState foreground listener.

**Root cause:**
1. Ordering bug: display trusted server `id` DESC order; cuid ordering can invert time order under backfill / clock skew.
2. Freshness bug: tab-return served stale 30s cache without any refetch trigger.

**Fix (proof tag `[NOTIF_FRESHNESS_V1]`, frontend-only per task constraint):**
- `usePaginatedNotifications.ts`: `staleTime: 0`, `refetchOnMount: true`, added `.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))` after the dedupe step. Sort is the single source of display order.
- `ActivityFeed.tsx`: `useFocusEffect` now calls `refetch()` alongside `markAllSeen()`. Added a second `useEffect` that subscribes to `AppState` and calls `refetch()` on foreground.

**Why surgical:**
- Two frontend files. No backend change, no new dependency, no query-key change.
- Unread-count query (`useUnseenNotifications`) untouched — it only tracks badge count and was not affected.
- Content dedup (type+eventId+day collapse) in `ActivityFeed` trusts newest-first input, which the new sort guarantees.

**Guardrail:** New SSOT `docs/SYSTEMS/activity-feed.md` declares the `[NOTIF_FRESHNESS_V1]` contract — any future work that raises `staleTime`, removes the focus-refetch, removes the AppState listener, or changes the sort field from `createdAt` must update the SSOT AND validate against the "Feb items on top" regression.

**Open follow-ups (out of scope):**
- Backend could switch paginated endpoint to `orderBy: { createdAt: "desc" }` for tiebreaker stability; client sort is a sufficient fix on its own.
- A 30-day soft filter was considered (task Part 3) but not applied — the current dataset isn't large enough to justify hiding history from the user.

---

## Investigation: Find Friends — existing friends leaking into "Invite your friends" (2026-04-12)
**Status:** RESOLVED (requires backend deploy before frontend client update takes effect fully; fallback keeps existing behavior)

**Symptom:** Already-connected friends, pending-request users, and even the current user were appearing in the "Invite your friends" section on the Find Friends screen.

**Forensics path:**
- Screen: `src/app/add-friends.tsx` renders three subsections from `matchContacts()` result: `newMatches` (OI users, not friends), `existingFriends` (OI users, already friends), and `unmatched` (the Invite section).
- Helper: `src/lib/contactsMatch.ts:matchContacts()` builds `unmatched` by subtracting from all contacts those whose **name** case-insensitively matches a returned OI user's `name`.
- Backend: `my-app-backend/src/routes/contacts.ts` performs hash matching, already flags `isFriend` and `isPending` per user, excludes blocked users and self from candidates, but returned only `{ matches }` — no information about which of the client's incoming hashes actually resolved.
- Top on-platform suggestions (`FriendDiscoverySurface` → `/api/friends/suggestions`) are a separate surface; overlap with invite candidates can only occur via contact hashes.

**Root cause:** Name-based dedup is structurally fragile — nicknames, first-name only contacts, initials, casing differences, and non-ASCII name variants all defeat it. The frontend had no hash-level signal for "this specific contact is on-platform."

**Fix (proof tag `[CONTACTS_INVITE_HASH_ECHO_V1]`):**
1. **Backend echoes matched hashes.** `/api/contacts/match` response gains `matchedPhoneHashes: string[]` and `matchedEmailHashes: string[]` — the incoming hashes that resolved to any Open Invite user. The viewer's own phone/email is also hashed server-side and added to these sets if they were included in the incoming request (self is excluded from the candidates list but still needs echoing so it can't leak into invite candidates).
2. **Frontend hash-subtracts.** `extractAndHashContacts()` now returns per-contact hash bundles. `matchContacts()` filters each contact out of the invite list if ANY of its hashes is in the matched-hash echo. Name-based dedup is kept as a fallback for servers that haven't yet deployed the echo.

**Why backend change was justified:** The task allowed backend work when "forensics proves the frontend lacks enough state to filter correctly." The frontend cannot reliably map a returned OI user back to the specific device contact that produced the match without the server telling it which hash matched. This is the minimum possible backend change (two extra arrays in an existing response) and introduces no new privacy exposure — the echo contains only hashes the client already sent.

**Guardrail:** New SSOT `docs/SYSTEMS/friend-discovery.md` encodes the Invite-Candidate Contract: invite list MUST subtract by hash, not by name; self / friends / pending-request users / on-platform reachable contacts MUST NOT appear; contacts without a phone number MUST NOT appear (no SMS target).

**Deploy order:**
- Backend deploys first (Render auto-deploy on merge).
- Frontend ships OTA-safe; on older-backend responses (no echo fields), the frontend still runs the legacy name-dedup fallback, so no regression during the deploy gap.

**Open follow-ups (out of scope):**
- Consider adding a backend flag `{ wasViewerOwnHashMatched: boolean }` to drive a stronger "we detected your own contact" UX affordance.
- Consider surfacing "this contact is someone you already requested" as an inline pending-request chip in invite UI (currently these contacts simply disappear from the invite list — arguably losing signal). Product decision, not in scope here.

---

## Investigation: Discover → Map → Public missing own hosted public event (2026-04-12)
**Status:** RESOLVED

**Symptom:** A newly created public event appears in Social → Public Invite (after prior `[PUBLIC_LANE_OWN_EVENTS_V1]` fix) but NOT in Discover → Map → Public. Map shows "No events with locations nearby" empty state even though the event has coords.

**Forensics path:**
- `src/app/discover.tsx` builds `enrichedEvents` from `feedData ∪ myEventsData` (deduped). Own events ARE in the pool (not the bug).
- `mapEvents` Public filter at `discover.tsx:694-704` calls `isVisibleInPublicFeed(e, loc, now)` with no viewer context.
- `isVisibleInPublicFeed` in `src/lib/discoverFilters.ts` internally calls `isEventResponded(event)` — returns true when `viewerRsvpStatus ∈ {going, not_going, interested, maybe}`. Host is auto-"going" → filtered out.
- `isEventVisibleInMap` requires valid coordinates (`hasValidCoordinates`) — this is a map-surface rule unrelated to the lane filter.
- Same bug also affected `publicSorted` (Discover Events Public pill) for the same reason, so alignment rule applies.

**Root cause:** Pure filtering bug. The `isVisibleInPublicFeed` SSOT helper had no way to know the viewer's own user id, so it couldn't bypass the responded filter for own events. Social Public Invite had worked around this by inlining the decomposed filter locally. Discover surfaces did not — Map Public + Events Public pill still dropped own events.

**Fix (proof tag `[PUBLIC_LANE_OWN_EVENTS_V1]` extended):**
- `src/lib/discoverFilters.ts`: added optional `viewerUserId?: string | null` 4th arg to `isVisibleInPublicFeed(event, userLocation?, now?, viewerUserId?)`. When viewerUserId matches `event.userId`, the `isEventResponded` check is skipped. Coord cap + eligibility filters still apply.
- Added `userId?: string | null` to `ClassifiableEvent` interface (kept optional, backwards compatible).
- `src/app/discover.tsx`: `publicSorted` + `mapEvents` Public branch now pass `session?.user?.id` through.

**Why surgical:**
- Three files. Backwards-compatible helper signature (new arg is optional).
- Social Public Invite keeps working unchanged (it's using inline decomposition — still correct).
- Backend untouched: own events already land in `enrichedEvents` via `myEventsData`.
- Map coord requirement untouched — an own public event without coords still appears in Social Public + Events Public pill but correctly does not show a map marker. Empty-state copy now only surfaces when there are truly zero coordinate-backed public events.

**Guardrail:** `docs/SYSTEMS/discover.md` gains two invariants:
1. Own-event bypass is SURFACE-COHERENT — every surface composing `isVisibleInPublicFeed()` MUST pass the viewer's user id. No new surface may silently drop the creator's own public event for "responded."
2. Map coord requirement is a MAP-SURFACE contract, distinct from the public-lane contract.

**Open follow-ups (out of scope):**
- If future telemetry shows many public events lack coords, consider a "Pending map pin" affordance or forcing geocode on publish. For now, coordless public events correctly appear in feed+lane surfaces and are absent only from the map, which is the intended map contract.

---

## Investigation: Event detail location card — wrong placeholder precedence (2026-04-12)
**Status:** RESOLVED

**Symptom:** For an event with **no location** but `hideLocationUntilRSVP = true`, the event detail page rendered `"RSVP to see location"` — telling the viewer to RSVP in order to reveal a location that does not exist. Confusing + technically a leak of the privacy flag into an empty-location case.

**Forensics path:**
- Location card at `src/app/event/[id].tsx` (post `[P0_LOCATION_ALWAYS_RENDER]` patch) derived placeholder state as:
  ```ts
  const locationIsHidden = locationHiddenByPrivacy;
  const hasLocation = !!locationDisplay;
  const showPlaceholder = locationIsHidden || !hasLocation;
  const placeholderText = locationIsHidden
    ? "RSVP to see location"
    : "Location not set";
  ```
- `locationIsHidden` did not depend on `hasLocation`, so the text ternary could reach `"RSVP to see location"` first for any event where `locationHiddenByPrivacy` happened to be truthy — including events with no location at all.
- `locationHiddenByPrivacy` upstream = `showLocationPreRsvp === false && !isMyEvent && viewerRsvpStatus ∉ {going, interested}`. It is a privacy flag about *exposure*, not about *existence*, so it can be true even when there's nothing to hide.

**Root cause:** Precedence bug in a two-boolean state machine. The design required three mutually exclusive, ordered states; the code checked the wrong boolean first.

**Fix (proof tag `[P0_LOCATION_ALWAYS_RENDER]` — precedence tightened):**
```ts
// [P0_LOCATION_ALWAYS_RENDER] Precedence: no-location beats hidden-by-privacy.
// A user must never be told to "RSVP to see location" for an event that
// has no location set. `locationIsHidden` therefore requires `hasLocation`.
const hasLocation = !!locationDisplay;
const locationIsHidden = hasLocation && locationHiddenByPrivacy;
const showPlaceholder = !hasLocation || locationIsHidden;
const placeholderText = !hasLocation
  ? "Location not set"
  : "RSVP to see location";
```
Three ordered states now hold:
1. `!hasLocation` → "Location not set" (wins unconditionally).
2. `hasLocation && locationIsHidden` → "RSVP to see location".
3. Otherwise → real location row with map + "Get Directions".

**Why surgical:**
- One file (`src/app/event/[id].tsx`). Only the state-derivation block changed.
- No change to host bypass, RSVP bypass, or `locationHiddenByPrivacy` polarity.
- Placeholder visual affordances (static View, opacity 0.65, muted icon) unchanged; only the text/gating logic is correct now.

**Guardrail:** `docs/SYSTEMS/event-page.md` invariant restated in strict precedence order and explicitly states: "This state wins unconditionally — a user must NEVER be told to 'RSVP to see location' for an event that has no location at all."

**Open follow-ups (out of scope):**
- Consider migrating `locationDisplay` to a discriminated union (`{ state: "none" | "hidden" | "visible", text?, coords? }`) to make precedence bugs unrepresentable. Deferred — current boolean-pair model works once precedence is encoded as shown.

---

## Investigation: Discover collapses to full-screen "Still Loading..." on transient query error (2026-04-12)
**Status:** RESOLVED

**Symptom:** Production users intermittently landing on a full-screen Discover blocker with contradictory copy:
- Title: "Still Loading..."
- Body: "Something went wrong loading events. Please try again."
Multiple repro reports on the main acquisition surface. Retry button worked but users should not have seen a fatal blocker in the first place.

**Forensics path:**
- Fatal gate at `src/app/discover.tsx:783`: `if (isError && !showDiscoverLoading)` returning `<LoadingTimeoutUI>`.
- `isError` at line 478 = `feedError || myEventsError`. OR semantics: any single core query error blanked the entire surface — even when the other core query (or its cached data) would have rendered fine.
- Secondary queries (`attending`, `friendsHostedFeed`, `friendsFeed`, `friends`) were NOT in the gate directly, but any future regression adding another `isError` booleans to the OR chain would have widened the blast radius silently.
- Copy contradiction lived in `src/components/LoadingTimeoutUI.tsx`: title was a hardcoded `"Still Loading..."` literal, and the discover error path only overrode the body via `message`, producing the "Still Loading... Something went wrong" contradiction.

**Root cause:** Over-broad fatal guard combined with a loading-only title baked into a dual-purpose loading/error component.

**Fix (proof tag `[DISCOVER_FAIL_SOFT_V1]`):**
- `src/app/discover.tsx`: replaced `const isError = feedError || myEventsError;` with:
  ```ts
  const hasAnyCoreEventData = !!(
    (feedData?.events && feedData.events.length > 0) ||
    (myEventsData?.events && myEventsData.events.length > 0)
  );
  const isFatalError = feedError && myEventsError && !hasAnyCoreEventData;
  ```
  The fatal full-screen state now requires BOTH core queries to have errored AND no cached/derived core data. Any secondary query failure (attending, friendsHosted, friendsFeed, friends, any downstream public/map derivation) is structurally excluded from the gate.
- `src/app/discover.tsx`: fatal copy tightened — `title="Couldn't load events"` + `message="Check your connection and try again."`. No more contradictory "Still Loading..." on the error path.
- `src/components/LoadingTimeoutUI.tsx`: added an optional `title` prop. Default remains `"Still Loading..."` so the timeout path is unchanged; only the discover error branch passes a distinct title.

**Why surgical:**
- Two files + three docs.
- Default `title` preserves every existing caller of `LoadingTimeoutUI` verbatim (loading-timeout semantics unchanged).
- No change to any query definition, `enabled` gate, stale time, refetch policy, or retry target. `handleRetry` still refetches `feed` + `myEvents`, which is correct for the new narrower fatal path.
- Backend untouched — this is a client-side resilience bug, not a response-shape issue.

**Guardrail:** `docs/SYSTEMS/discover.md` gains a `[DISCOVER_FAIL_SOFT_V1]` invariant enumerating which queries are core (`feedPaginated`, `myEvents`) vs. secondary (everything else) and defining the exact fatal predicate `feedError && myEventsError && !hasAnyCoreEventData`. The invariant also forbids contradictory copy (loading-style title on an error branch).

**Open follow-ups (out of scope):**
- Add pane-level `<ErrorBoundary>` around Map and Ideas deck so a render-time crash in one pane cannot escape the pane. Current fix addresses query-state failures; render-time crashes are a different failure mode worth hardening next pass.
- Consider surfacing a small toast/banner when a non-core subquery fails (`friendsHostedFeed`, `attending`) so users understand why a badge or availability chip is missing — pure UX nicety, not a fatal condition.

---

## Investigation: Live resilience audit — main surfaces (2026-04-12)
**Status:** RESOLVED (two patches) + four surfaces explicitly audited and left unchanged.

**Scope:** Discover, Social, Calendar, Event Detail, Friends, add-friends (Find Friends). Goal: no page can blank on a single bad query, record, or transient failure.

**Findings by surface:**

1. **Discover (`src/app/discover.tsx`)** — **PATCHED.**
   - Fatal guard already narrowed in prior hotfix (`[DISCOVER_FAIL_SOFT_V1]`).
   - New risk found: `enrichedEvents` SSOT memo called `event.title.toLowerCase().trim()` and dereferenced `event.user?.id` inside the dedup loop without a shape guard. One backend record missing `title` / `id` / `startTime` would throw from the memo, which is OUTSIDE React Query's error boundary — so the fail-soft gate can't catch it and the whole Discover page goes blank.
   - Fix: `[DISCOVER_SHAPE_GUARD_V1]` — local `isShapeValid` filter at the memo's entry, drops malformed rows before dedup/filter/sort. Downstream keeps its non-optional typing.

2. **Social (`src/app/social.tsx`)** — **ONE SMALL PATCH, no fatal guard needed.**
   - No page-level fatal guard — the screen degrades via skeletons + empty states when queries fail. Acceptable.
   - Non-core risk: insight generator called `attendingEvents.map(e => e.title.toLowerCase())` without null check. If any attending event has a null title, the IIFE throws. Low blast radius (first-value nudge function) but still a resilience hazard.
   - Fix: `(e.title ?? "").toLowerCase()` + `.filter(Boolean)`. Drops bad rows from pattern analysis instead of crashing it.

3. **Calendar (`src/app/calendar.tsx`)** — **NO PATCH NEEDED.**
   - Full-screen fatal is `bootStatus !== 'authed' && (isTimedOut || bootStatus === 'error')`. Scoped to boot/auth — query-level errors flow through empty states, not a full-screen blocker.
   - Date derivations (`getEffectiveStart` at `calendar.tsx:1073`) already use `isNaN(d.getTime())` fallbacks for bad date strings.
   - No query-level `isError` gate in the render tree.

4. **Event detail (`src/app/event/[id].tsx`)** — **NO PATCH NEEDED.**
   - Scoped full-screen error uses `EventDetailErrorState` with retry, routing 400/403/404/generic into distinct copy. Privacy gate (`PrivacyRestrictedGate`) and busy block (`BusyBlockGate`) are separate full-screen states for legitimate access restrictions, not resilience failures.
   - The single `event` query IS the minimum viable payload — full-screening on its failure is correct.
   - Location card precedence invariant already shipped (`[P0_LOCATION_ALWAYS_RENDER]`).

5. **Friends (`src/app/friends.tsx`)** — **NO PATCH NEEDED.**
   - Only full-screen state is `LoadingTimeoutUI` when `isBootTimedOut` trips. No query-level `isError` reaches the fatal gate.
   - Tab-level (Activity / Chats / People) failures fall through to empty states within each tab.

6. **add-friends / Find Friends (`src/app/add-friends.tsx`)** — **NO PATCH NEEDED.**
   - Error paths use `safeToast` — no full-screen failure path exists.
   - Hash-echo contact filter already shipped (`[CONTACTS_INVITE_HASH_ECHO_V1]`) with an OTA-safe legacy fallback for the deploy gap.

**Why surgical:**
- Two code files, one new invariant.
- Shape guard is a local type-guard filter — it does not widen typing, mutate data, or abstract a helper. Downstream memos keep their non-optional assumptions.
- Social fix is a one-line null-safe coerce — no structural change.
- No backend touch. No auth/session touch. No redesign, no new infra.

**Guardrail:** `docs/SYSTEMS/discover.md` gains `[DISCOVER_SHAPE_GUARD_V1]` invariant forbidding any Discover derivation from reading `event.title` / `event.user` / `event.startTime` upstream of the shape-guard filter.

**Open follow-ups (out of scope):**
- Lift a generic `isEventShapeValid` helper into `src/lib/discoverFilters.ts` if a second surface needs the same guard. For now, one call site → no abstraction.
- Consider pane-level `<ErrorBoundary>` wrappers around Map / Ideas deck / inline feed list — addresses synchronous render-time crashes from any remaining derivation not yet guarded. Noted in prior `[DISCOVER_FAIL_SOFT_V1]` follow-ups.
- Backend audit pass to validate the frontend's assumed required fields at response boundary (zod parse) would eliminate this class of bug entirely. Not in scope for this resilience pass.

---

## Investigation: Discover pane render isolation (2026-04-12)
**Status:** RESOLVED

**Symptom potential (prospective):** After the fail-soft fatal guard and derivation shape-guard, a synchronous render-time throw inside one Discover pane (Map marker callback, Events card body, Responded list row) would still bubble past those guards — they catch query errors and malformed records at the derivation boundary, NOT render throws — and replace the whole Discover screen with the root `ErrorBoundary` generic fallback. One pane crash = whole surface gone.

**Forensics path:**
- `src/app/discover.tsx:897+`: three-way ternary render branches for lens `"map" | "events" | "responded"`. Each branch is a sibling of the shell chrome (header, `BottomNavigation`). No boundary between the pane and the page root.
- `src/components/ErrorBoundary.tsx`: class-component boundary exists, already hooked into `trackAppCrash` / `[P0_CRASH_CAPTURED]` telemetry. `fallback` prop was typed as `ReactNode` only — no render-function form, so a retry button in the fallback could not reach the boundary's internal `handleReset`.
- `[DISCOVER_FAIL_SOFT_V1]` covers `feedError && myEventsError && !hasAnyCoreEventData` → query-state fatal only.
- `[DISCOVER_SHAPE_GUARD_V1]` drops malformed records at the `enrichedEvents` memo boundary → pre-render data sanitization.
- Neither addresses a synchronous throw during JSX render (invalid hook call inside a card, missing null-safe access in a list row template literal, etc.).

**Root cause:** No pane-level `<ErrorBoundary>`. A render throw in any pane escaped to the top-level boundary and blanked the whole surface.

**Fix (proof tag `[DISCOVER_PANE_ISOLATION_V1]`):**
- `src/components/ErrorBoundary.tsx`: extended `fallback` prop to accept `ReactNode | ((ctx: { error, reset }) => ReactNode)`. Additive, backwards compatible; legacy static-ReactNode callers unchanged. Render-function form lets the pane fallback wire its retry button to the boundary's internal reset without touching the class state from outside.
- `src/app/discover.tsx`:
  - Added `DiscoverPaneErrorFallback` — inline (`flex: 1`) component with copy `"Couldn't render this view"` + `"Try switching tabs or tap retry. The rest of Discover is still available."` + a single retry button.
  - Wrapped each of the three lens render branches in its own `<ErrorBoundary fallback={({ reset }) => <DiscoverPaneErrorFallback … onRetry={reset} />}>`.
  - Each boundary has its own state — a crash in Map does not affect Events/Responded boundary state.

**Why surgical:**
- Two files + three docs. No new dedicated component file (fallback is local to Discover; lifting it to `@/components` would be premature abstraction — it's three call sites in one file).
- Extended an existing shared component (`ErrorBoundary`) additively rather than duplicating the class + telemetry. The extension is a three-line conditional inside the existing `render()` method.
- No change to data queries, invalidation, lens state, or shell chrome.
- Existing top-level `ErrorBoundary` is preserved as a final safety net for throws in the shell/header that are outside the three pane branches.

**Guardrail:** `docs/SYSTEMS/discover.md` gains `[DISCOVER_PANE_ISOLATION_V1]` invariant. Requires per-pane boundary with inline (never full-screen) fallback, separates this contract from `[DISCOVER_FAIL_SOFT_V1]` (query-state) and `[DISCOVER_SHAPE_GUARD_V1]` (derivation-boundary) so future edits don't confuse the three layers.

**Open follow-ups (out of scope):**
- Extend the same pane-isolation pattern to Social (Group / Open / Public) and Friends (Activity / Chats / People) if live telemetry shows render-throw incidents on those surfaces. Deferred — this pass is Discover-only by spec.
- Consider a tiny shared `PaneErrorFallback` helper in `@/components` if a second surface adopts the pattern. Premature for a single call site.

---

## RESOLVED 2026-04-13 — Comment permission: RSVP gate (frontend + backend) `[P0_COMMENT_ACCESS_PARITY_V1]`

**Symptom:** User could not post a comment on an event unless they RSVP'd first.

**Investigation — frontend:**
- `src/app/event/[id].tsx:2443-2488` renders the Discussion card. When host toggles `hideDetailsUntilRsvp` on the event, `shouldBlurDetails = hideDetailsUntilRsvp && myRsvpStatus !== "going" && !isMyEvent` (defined line 1073) evaluates true for any non-host, non-going viewer.
- An absolute-positioned `BlurView` overlay with the copy `"RSVP to see discussion"` covered the entire card — including the comment composer — making both reading and posting impossible.
- The overlay was three sibling uses of `shouldBlurDetails`: Who's Coming (~L2242), Location (~L2306, later migrated elsewhere), Discussion (~L2446). The first two are legitimate pre-RSVP privacy gates; the third contradicts product rule.

**Investigation — backend:**
- `my-app-backend/src/routes/events-interactions.ts` GET `/:id/comments` (L335+) and POST `/:id/comments` (L417+) each enforced: owner/host → RSVP'd → friendship-for-friend-scopes → `else if (visibility !== "open_invite") deny`.
- This excluded `visibility === "public"` from the non-RSVP pass-through. A public event viewer who hadn't RSVP'd and wasn't a friend received `403`.
- It also excluded `circle_only` events even for circle members who hadn't RSVP'd yet — a separate bug masked by the same over-broad gate.
- Compared against `events-crud.ts` GET `/:id` (L680+), which uses the canonical access ladder: owner/host → attending → circle member → public/open_invite → friend with visibility access. The comment route was strictly narrower than the view route.

**Root cause:** Two independent layers (frontend blur overlay + backend permission check) both implemented RSVP-first comment gating. The product rule is "access to the event page = access to the discussion"; both layers violated it.

**Fix:**
1. Backend: introduced `canAccessEventDiscussion({ eventId, userId })` at the top of `events-interactions.ts`. Mirrors the `events-crud.ts` GET `/:id` access ladder. Both comment routes now call this helper; RSVP is no longer a primary gate.
2. Frontend: removed the Discussion blur overlay. Who's Coming and Location blur overlays kept intact. Added inline `[P0_COMMENT_ACCESS_PARITY_V1]` comment above the Discussion card.

**Why surgical:**
- One backend helper + two helper call-sites replacing ~40 lines of duplicated gating logic.
- One overlay removal in the frontend (~7 lines).
- No contract/schema changes. No query-key changes. No comment-fetch/display changes. OTA-safe on the frontend; backend deploys on next backend release.

**Guardrail:** `docs/SYSTEMS/event-page.md` gains `[P0_COMMENT_ACCESS_PARITY_V1]` invariant documenting the two-layer enforcement rule and the explicit prohibition on RSVP-gated discussion copy.

**Open follow-ups (out of scope):**
- Consider promoting `canAccessEventDiscussion` to `events-shared.ts` and reusing it in any other route that enforces event view access inconsistently (e.g. `/photos`, `/reactions` if they exist). Deferred — the current duplication is tolerable and broadening scope risks regressions.
- The blur overlay for Who's Coming and Location cards on `hideDetailsUntilRsvp` is preserved as product-intended. If UX decides those should also relax, that is a separate product decision.

---

## RESOLVED 2026-04-13 — Focus-return attendee staleness on event detail `[EVENT_FOCUS_ATTENDEE_FRESH_V1]`

**Symptom:** viewer opens event X, backgrounds the app (or navigates away). Another user RSVPs "going" on event X. Viewer returns to event detail. The numeric `goingCount` at the top of the page updates correctly, but the Who's Coming avatar roster and the grouped-RSVP section (going / interested / not_going / maybe) still reflect the pre-background state. Stale until the viewer manually pulls to refresh, mutates their own RSVP (which fires `getInvalidateAfterRsvpJoin`), or the default staleTime elapses.

**Investigation:**
- Audited the six in-scope mutation classes (event create / edit / visibility change / RSVP / comment / notification freshness) against the SSOT helpers in `src/lib/eventQueryKeys.ts` + `src/lib/refreshAfterMutation.ts`. Write-side invalidation was complete in every case.
- The gap was on the READ side: `getRefetchOnEventFocus(eventId)` at `src/lib/eventQueryKeys.ts:220` returned `[single, interests, comments, rsvp]` but omitted `attendees(id)` and `rsvps(id)`.
- Event detail queries: `single` serves `goingCount` (a numeric), `attendees` serves the full avatar list + normalized roster (`src/app/event/[id].tsx:863`), `rsvps` serves the grouped going/interested/not_going/maybe objects (`src/app/event/[id].tsx:839`). The three are independent queries with independent cache entries.
- `useFocusEffect` at `src/app/event/[id].tsx:412` delegates entirely to `getRefetchOnEventFocus`. No per-surface override — so the single helper is the SSOT for focus-return refresh and is the right place to fix.
- Write-side `getInvalidateAfterRsvpJoin` / `getInvalidateAfterRsvpLeave` already include `attendees` and `rsvps` — so same-session mutation consistency was never broken. Only cross-session / cross-device consistency on focus-return was stale.

**Root cause:** `getRefetchOnEventFocus` was originally scoped to "core event metadata + viewer state" without considering that attendee-list display surfaces could drift when someone else mutates while the viewer is away. The goingCount-vs-roster split is the observable fingerprint.

**Fix:** added `eventKeys.attendees(eventId)` and `eventKeys.rsvps(eventId)` to the returned array. One-line-per-key addition + jsdoc comment documenting `[EVENT_FOCUS_ATTENDEE_FRESH_V1]`. All call sites delegate to the helper; no other file required editing.

**Why surgical:**
- Single helper function change.
- No contract, schema, or serializer modification.
- No surface-level component edits.
- No query `staleTime` tuning — focus-return is the right layer (lowering attendee `staleTime` would cause unnecessary refetches when the attendees modal closes/reopens in the same session).
- Frontend-only. OTA-safe.

**Mutation classes explicitly verified correct (NOT touched):**
- `getInvalidateAfterEventCreate` — full feed cascade; creator not in join_requests, so `attending` correctly excluded.
- `getInvalidateAfterEventEdit` — matches `[VISIBILITY_TRANSITION_V1]`: all lane-affected keys.
- `getInvalidateAfterRsvpJoin` / `getInvalidateAfterRsvpLeave` — 12-key full cascade.
- `getInvalidateAfterJoinRequestAction` — complete per `[INVALIDATION_GAPS_V2]`.
- `getInvalidateAfterComment` — only `comments(id)`, correct because no cross-surface UI displays a comment count.
- `usePaginatedNotifications` — `staleTime: 0 + refetchOnMount: true` + client-side `createdAt` DESC sort, already tagged `[NOTIF_FRESHNESS_V1]`.
- Public-lane coherence — enforced by `isVisibleInPublicFeed()` SSOT + `[PUBLIC_LANE_OWN_EVENTS_V1]` + `[VISIBILITY_TRANSITION_V1]`, with coordinate-filter for Map.

**Guardrail:** `docs/SYSTEMS/event-page.md` gains `[EVENT_FOCUS_ATTENDEE_FRESH_V1]` invariant under the Invariants section so future edits to `getRefetchOnEventFocus` cannot silently drop either key without breaking the documented contract.

**Open follow-ups (out of scope):**
- `useLiveRefreshContract` wiring for Discover (`refetchFeed`, `refetchMyEvents`, `refetchFriendsFeed`) and Social (`refetchFeed`, `refetchMyEvents`, `refetchAttending`) omit `refetchFriendsHostedFeed`. Out-of-session freshness there is bounded by 60s / 5min stale windows + mutation invalidation; deferred unless telemetry shows user-visible drift.
- Not touching `attendees` query `staleTime` — refetching mid-session on attendees-modal toggles would be wasteful. The focus-return contract is the right layer.
