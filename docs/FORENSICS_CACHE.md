# Forensics Cache — iOS Build Failure Loop

> Active investigation scratchpad. Mark items RESOLVED when confirmed.

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
