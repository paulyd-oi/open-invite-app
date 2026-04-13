# Session Log — iOS Build Failure Forensic Audit

## 2026-04-13 — Who's Down v1 polish pass: 24h TTL, locked copy, push deep links, creator avatar [WHOS_DOWN_V1]

### Summary
Final pre-ship polish for Who's Down v1. Tightened expiry from 48h → 24h, aligned explainer/helper copy to the locked spec ("Have an idea to do?" / "See who's down to come. If enough people are down, make the event." / `Friends only · expires in 24h` / "Post an Idea"), wired push deep links for the three Who's Down notification types, and replaced the lightbulb emoji avatar with the creator's profile photo on both the Discover feed cards and the casual detail header. Added creator-facing clarifying copy near "Make It Happen" so the threshold push at 3 isn't read as a hard gate.

### Files changed
- `my-app-backend/src/routes/eventRequests.ts` — `WHOS_DOWN_TTL_MS = 24 * 60 * 60 * 1000` (was 48h). Comment updated.
- `src/hooks/useNotifications.ts` — `ALLOWED_ROUTE_PREFIXES` now includes `/event-request/`. `resolveNotificationRoute` handles `whos_down_threshold` / `whos_down_response` (→ `/event-request/{id}`) and `whos_down_converted` (→ `/event/{eventId}`, fallback to `/event-request/{id}`).
- `src/app/discover.tsx` — explainer body + new helper line `Friends only · expires in 24h` (replaces freestanding "Only your friends..." row above feed). Create-sheet helper also updated to the same line. Feed-card primary avatar swapped from `<Text>{item.emoji}</Text>` to `<EntityAvatar photoUrl={item.creator?.image} initials={...} size={44} />`.
- `src/app/event-request/[id].tsx` — casual header avatar swapped from emoji block to `EntityAvatar` size 64 with creator photo + initials fallback. Friends-only helper updated to `Friends only · expires in 24h`. Sub-copy under "Make It Happen" reworded to `You can make it happen anytime. Your friends will be notified.`.
- `docs/SYSTEMS/whos-down.md` — TTL updated everywhere, locked-copy spec recorded, Push Routing section added, four new invariants added (`[WHOS_DOWN_TTL_24H_V1]` + locked copy + creator-avatar + no-hard-gate).
- `docs/SYSTEMS/discover.md` — Who's Down pane row mentions 24h TTL + creator-photo avatar + helper copy.
- `docs/SESSION_LOG.md` — this entry.
- `docs/FORENSICS_CACHE.md` — RESOLVED entry.

### Architecture decisions
- **Frontend-only push routing extension.** Backend payloads already carry `eventRequestId` (threshold + response) and `eventId` (converted), so no payload change was needed. Adding the cases to `resolveNotificationRoute` + the prefix to the allowlist gave us deep links without touching push governance, dispatcher, or notification queue.
- **TTL set at creation, not enforced retroactively.** Existing 48h rows in dev/preview age out naturally; no migration. Read paths already filter `expiresAt > now`.
- **EntityAvatar handles the photo→initials fallback automatically** so neither surface needs a special-case branch when the creator has no profile image.
- **Threshold-clarity copy goes on the action sub-line, not as a separate banner.** Lower visual cost; the existing slot already explained Make It Happen behavior.

### Verification
- `npx tsc --noEmit` exit 0 in both repos.
- Manual: pending device QA on the new copy + creator avatar on both surfaces, and on push tap routing for all three types.

### Risks / follow-ups
- Existing 48h legacy rows visible until they age out. Acceptable — first 24h of post-ship traffic uses the new TTL.
- Push routing is one-way: tapping a converted push lands on the real event. If the creator deleted/cancelled the converted event between push send and tap, the user lands on a 404. Out of scope for this pass; confirm-converted reliability explicitly excluded.

---

## 2026-04-13 — P0 Crash Fix: Who's Down feed `members` undefined [WHOS_DOWN_FEED_SHAPE_GUARD_V1]

### Summary
Live crash in Discover → Who's Down after posting an idea: `TypeError: Cannot read property 'find' of undefined` thrown from `src/app/discover.tsx` in the Who's Down card render path. Root cause: `item.members.filter(...)` and `item.members.find(...)` assumed `members` was always an array, but the `feed/whos-down` payload returned items where `members` was missing/undefined (despite the Zod contract declaring it required). Hardened the render boundary so partial payloads can no longer crash the surface.

### Files changed
- `src/app/discover.tsx` — Who's Down map render block (~line 2238). Normalize `members` once at the top of the iteration via `Array.isArray(item.members) ? item.members : []`, then route both the down-count fallback and the `myMember` lookup through the local. Down count still prefers `item.downCount` first.
- `docs/SYSTEMS/whos-down.md` — added "Render-boundary shape hardening" invariant under Invariants section. Proof tag `[WHOS_DOWN_FEED_SHAPE_GUARD_V1]`.
- `docs/SESSION_LOG.md` — this entry.
- `docs/FORENSICS_CACHE.md` — RESOLVED entry.

### Forensics
- Crash site: `discover.tsx:2239` (`item.members.filter`) and `discover.tsx:2241` (`item.members.find`) inside the `whosDownItems.map(...)` block.
- Contract (`shared/contracts.ts:1353`): `members: z.array(eventRequestMemberSchema)` — declared non-nullable. The runtime shape diverged from the contract on the `feed/whos-down` endpoint (likely a backend serializer omission for friend-feed items). The Zod schema is not validated on the client (it's used only for type inference), so the bad shape passed straight to the renderer.
- `event-request/[id].tsx:279` already used `eventRequest.members ?? []` — safe under both `null` and `undefined`. No change needed there.
- No other unsafe `item.members.*` access in the Discover flow.

### Architecture decisions
- **Frontend-only fix.** Backend should still send `members: []` for casual feed items, but the frontend cannot crash on partial data. Render-boundary normalization is the smallest correct containment.
- **Local normalization, not data-layer reshape.** Did not introduce a feed-level shape guard or schema-validation pass — those would broaden scope. The normalization is two lines at the iterator boundary; if the same shape leaks elsewhere we'll repeat the same pattern.
- **Down-count precedence preserved.** `item.downCount ?? members.filter(...).length` keeps the backend-computed count authoritative when present.

### Verification
- `npx tsc --noEmit` exit 0, 0 lines.
- `grep "\.members\b" src/app/discover.tsx` → only the new normalized read; no raw access remains.
- NOT device-verified in this session — owner should sanity-check Discover → Who's Down → Post idea round-trip on iOS.

### Risks / follow-ups
- **Backend feed payload may genuinely omit `members`.** If the `/api/event-requests/feed/whos-down` serializer diverges from `eventRequestSchema`, the contract is lying. Not fixed here (out of scope: frontend-only repo). Report to backend: ensure casual feed items include `members` (empty array when no one has responded).
- Threshold-push and "I'm Down" button state stay correct because they read from `myMember?.status` — `undefined` when missing → button stays in default "I'm Down" state, no crash.

---

## 2026-04-13 — Discover Events filter flattening: Going / Not Going first-class [WHOS_DOWN_V1]

### Summary
Surgical UX correction to the Who's Down rollout. The Events pane had Discover → Events lens → Responded pill → Going/Not Going sub-filter — three nesting levels for a simple list view. Flattened to a single horizontal pill row. Removed the Responded parent pill and the second-row sub-filter. Going and Not Going now live next to Soon / Popular / Friends / Saved / Group / Public as peer pills.

### Files changed
- `src/app/discover.tsx` — `EventSort` type: drop `"responded"`, add `"going"` and `"not_going"`. `SORT_OPTIONS` reshuffled. `RespondedSubFilter` type, `RESPONDED_SUB_OPTIONS` constant, and `respondedSubFilter` state deleted. `activeFeed` ternary updated (Going → `respondedGoingSorted`, Not Going → `respondedNotGoingSorted`). Second-row sub-filter JSX block deleted. `ListEmptyComponent` responded branch rewritten to key off `eventSort === "going" \|\| eventSort === "not_going"` with the same per-status copy. Analytics pill derivation simplified: `pill = eventSort` (no `responded:{sub}` composite string).
- `docs/SYSTEMS/discover.md` — pane table + pill table updated for flat structure.
- `docs/SESSION_LOG.md` — this entry.
- `docs/FORENSICS_CACHE.md` — RESOLVED entry for the flattening.

### Architecture decisions
- **Reuse datasets, not state model.** The `respondedGoingSorted` / `respondedNotGoingSorted` memos were already derived from `respondedSorted` (both cheap filters). Keep them named for the internal semantic, but expose them as first-class pills in the UI. No backend change, no new queries.
- **One active pill at a time.** `eventSort` stays a single enum. No multi-select.
- **Analytics pill simplified.** The composite `responded:${sub}` pill string is gone. Events-pane pills now emit their bare key (`"going"` / `"not_going"` / etc.) via `trackDiscoverSurfaceViewed` + `trackDiscoverEventOpened`. Downstream consumers that historically accepted `"responded:going"` will now see `"going"`; that is the correct canonical identifier going forward.
- **Empty states preserved.** The two per-status empty state variants (Going: `🎉 No events you're going to`, Not Going: `👋 No declined events`) are intact — just re-keyed to the new `eventSort` values.

### Verification
- `npx tsc --noEmit` clean (exit 0).

---

## 2026-04-13 — Who's Down v1 frontend (Discover nav + casual detail + conversion) [WHOS_DOWN_V1]

### Summary
Shipped the frontend half of Who's Down: friends-only casual idea posts surfaced in Discover, posted via a bottom-sheet modal, respondable in a dedicated detail branch, and convertible to a real event via the existing `/create` pipeline. Responded (Going / Not Going) fold into the Events pane as a pill + sub-filter; its old lens slot now hosts Who's Down. No new full-screen routes, no backend changes beyond the already-landed Phase 1.

### Files changed
- `src/lib/queryKeys.ts` — added `qk.whosDownFeed()` + registered `"whos-down-feed"` in `QK_OWNED_ROOTS`.
- `src/analytics/analyticsEventsSSOT.ts` — discover pane analytics accept `"whos_down"` pane id.
- `src/app/discover.tsx` — Lens swap (`map` / `events` / `whos_down`), Responded moved to Events pill w/ Going/Not Going sub-filter + empty state, count badge on Who's Down tab, full Who's Down pane (explainer card, feed cards with "I'm Down"/"You're Down"), bottom-sheet creation modal (title + time hint chips + where + post).
- `src/app/event-request/[id].tsx` — casual-mode branch: idea card, time hint + where pills, down count + avatar grid, pinned "I'm Down"/"You're Down", creator-only "Make It Happen" + "Cancel Idea", confirmed banner linking to real event. Respond mutation stays on screen for casual and invalidates `qk.whosDownFeed()`.
- `src/app/create.tsx` — accepts `location` + `fromWhosDownId` URL params; ref-guarded `locationSearch.prefillLocation(...)`; fires `POST /api/event-requests/{id}/confirm-converted` on success before navigating to the new event (best-effort, non-blocking).
- `docs/SYSTEMS/discover.md` — pane table + Responded pill.
- `docs/SYSTEMS/whos-down.md` — new Frontend Surface section.

### Architecture decisions
- **No new screens.** Creation is a bottom-sheet Modal inside `discover.tsx`; detail is the existing `/event-request/[id]` route with a casual branch. Keeps navigation surface flat and avoids a parallel router tree.
- **Responded stays in Events.** Rather than duplicate the enriched-event FlatList, swap `activeFeed` to `respondedGoingSorted` / `respondedNotGoingSorted` when `eventSort === "responded"`. Same renderItem, same cards. Sub-filter strip is additive to the list header.
- **Conversion is owned by `/create`.** Create screen fires `confirm-converted` after event success. The casual detail screen never mints an event; it only hands off prefill params. `fromWhosDownId` is the one-shot correlation id.
- **Prefill is ref-guarded.** `locationParam` only applies on first render to avoid fighting user edits.
- **Pane isolation preserved.** Who's Down pane is wrapped in its own `ErrorBoundary` with the existing `DiscoverPaneErrorFallback`, matching `[DISCOVER_PANE_ISOLATION_V1]`.

### Verification
- `npx tsc --noEmit` clean (exit 0, 0 errors).

---

## 2026-04-13 — Who's Down v1 backend (casual event_request) [WHOS_DOWN_V1]

### Summary
Implemented Phase 1 backend for Who's Down: lightweight, friends-only idea posts that extend `event_request` with a `mode` field. Formal-mode behavior is fully preserved. No sentinel dates, no new tables, no auto-RSVP, no chat, no invitee mechanic. Conversion to a real event is frontend-driven (opens `/create` prefilled).

### Files changed
- `my-app-backend/prisma/schema.prisma` — extend `event_request` with `mode`, `timeHint`, `whereText`, `expiresAt`, `thresholdNotifiedAt`; make `startTime` nullable; add two indexes.
- `my-app-backend/prisma/migrations/20260413000000_add_whos_down_to_event_request/migration.sql` — additive migration.
- `my-app-backend/src/shared/contracts.ts` — extend `eventRequestSchema` and `createEventRequestInputSchema`; add `whosDownFeedResponseSchema`.
- `open-invite-app/shared/contracts.ts` — same contract changes (kept in sync with backend).
- `my-app-backend/src/routes/eventRequests.ts` — casual branches: create, respond (with threshold push), `GET /feed/whos-down`, `GET /:id` access for friends, formal-only guards on nudge + suggest-time.
- `my-app-backend/docs/INVARIANTS.md` — added WHOS_DOWN_V1 invariants section.
- `open-invite-app/docs/SYSTEMS/whos-down.md` — new SSOT for the feature (FE + BE).

### Architecture decisions
- **No sentinel date.** `startTime` made nullable for casual mode. All other `orderBy: { startTime }` on `event_request` is filtered to formal mode (the `GET /` endpoint), guaranteeing non-null.
- **No backend conversion endpoint.** Frontend opens `/create` prefilled. Casual request expires naturally at 48h. Avoids duplicate event-creation logic and partial-state failures.
- **Friends-only feed.** `GET /api/event-requests/feed/whos-down` returns active casual posts where `creatorId IN (viewer + friends)`. Single direction friendship lookup matches existing app convention.
- **Threshold push is one-shot.** New `thresholdNotifiedAt` column gates the "X people are down" push so subsequent accepts past 3 don't re-notify.
- **Formal-only routes guarded.** `nudge` and `suggest-time` return 400 for casual mode (they're invitee/time-based and don't apply).
- **No invitee mechanic for converted events.** Down users are notified via threshold push and discover the new event normally; no auto-RSVP.

### Verification
- TypeScript clean (see verification step in next entry if pending).
- Schema additive — `mode` defaults to `"formal"` so all existing rows + clients keep working.
- Existing GET `/api/event-requests` filtered to `mode: "formal"` — casual posts cannot leak into formal lists.
- All `orderBy: { startTime }` queries on `event_request` audited; only one (formal-only filter applied).

### Scope discipline
- No frontend code touched in this prompt (Phase 1 = backend only).
- No new tables.
- No websockets/subscriptions.
- No changes to event-create pipeline.
- No changes to push governance categories (reused `event_request` bucket).

### Follow-up (same day): conversion state transition added
Per follow-up request: "When an idea is converted to an event, mark the event_request as confirmed and remove it from Who's Down feed immediately."

Added:
- `event_request.convertedToEventId` column (folded into the same pending migration — not yet applied to prod).
- `POST /api/event-requests/:id/confirm-converted` endpoint. Creator-only. Body `{ eventId }`. Verifies event exists + same owner. Sets `status = "confirmed"` and `convertedToEventId = eventId`. Notifies "down" friends with the new event link (no auto-RSVP). Idempotent on same eventId.
- Contract: `confirmConvertedSchema` + `confirmConvertedResponseSchema` in both backend and frontend `shared/contracts.ts`.
- Removal from feed is automatic — `GET /feed/whos-down` filters `status === "pending"`.

Real-event creation still goes through the standard `POST /api/events` — `/confirm-converted` is a pure state-transition + notification fanout. Frontend orchestrates the two-step write (create event → confirm conversion).

---

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

---

## 2026-04-13 — Real-time consistency audit (cross-surface invalidation + focus-return freshness)

### Summary
Tight audit pass over the in-scope mutation classes (event create / edit / visibility change / RSVP / comment / notification freshness / public-lane coherence) verifying that SSOT invalidation contracts cover every dependent surface. **One real consistency gap found and fixed.** The rest of the mutation classes were already correct and are documented as verified.

### Gap fixed — focus-return attendee staleness
**Symptom path:** viewer opens an event → backgrounds the app OR navigates away → a different user RSVPs to that event → viewer returns to the event detail page. The Who's Coming roster (`attendees` query) and the grouped-RSVP sections (`rsvps` query — going / interested / not_going / maybe) stayed stale until the viewer themselves mutated RSVP state, pulled-to-refresh, or the stale-time expired.

**Root cause:** `getRefetchOnEventFocus(eventId)` in `src/lib/eventQueryKeys.ts` was invalidating `single`, `interests`, `comments`, and `rsvp` but NOT `attendees` or `rsvps`. The numeric `goingCount` (served via `single`) would refresh while the avatar list and grouped sections did not.

**Fix:** added `eventKeys.attendees(eventId)` and `eventKeys.rsvps(eventId)` to `getRefetchOnEventFocus`. Single helper; every event detail `useFocusEffect` that delegates to this helper now refreshes the roster + grouped lists too. Tag: `[EVENT_FOCUS_ATTENDEE_FRESH_V1]`.

### Mutation classes explicitly verified as already correct
- **Event create** (`getInvalidateAfterEventCreate`): invalidates `feed`, `feedPaginated`, `feedPopular`, `friendsHostedFeed`, `mine`, `myEvents`, `calendar`. Creator is never auto-inserted into `event_join_request` (confirmed in `events-crud.ts:433` — only circle invitees are added, and creator is skipped via `member.userId !== user.id`), so `attending()` correctly does NOT need invalidation on create. Call site `src/app/create.tsx:405` wires the helper correctly.
- **Event edit / visibility change** (`getInvalidateAfterEventEdit`): covers `single`, `feed`, `feedPaginated`, `feedPopular`, `friendsHostedFeed`, `mine`, `myEvents`, `calendar`, `attending`. Matches the existing `[VISIBILITY_TRANSITION_V1]` invariant in `docs/SYSTEMS/discover.md`. Call site `src/app/create.tsx:472`.
- **RSVP join/leave** (`getInvalidateAfterRsvpJoin` / `getInvalidateAfterRsvpLeave`): covers `single`, `attendees`, `rsvps`, `interests`, `rsvp`, `feed`, `feedPaginated`, `feedPopular`, `friendsHostedFeed`, `myEvents`, `calendar`, `attending` — full surface coverage per `[P0_RSVP_SOT]`. Used via `refreshAfterRsvpJoin` / `refreshAfterRsvpLeave` wrappers in `src/lib/refreshAfterMutation.ts`.
- **Join-request approve/reject** (`getInvalidateAfterJoinRequestAction`): comprehensive per `[INVALIDATION_GAPS_V2]`.
- **Comment create** (`getInvalidateAfterComment`): invalidates only `comments(id)`. Verified correct — no feed card, Discover card, Social card, or Calendar surface displays a comment count, so there is nothing to invalidate cross-surface. Only the `comments(id)` query owns display state. Host-side push notification routes through `usePaginatedNotifications` which already has `staleTime: 0 + refetchOnMount: true`.
- **Notification freshness** (`usePaginatedNotifications`): `staleTime: 0`, `refetchOnMount: true`, and client-side sort by `createdAt` DESC to defend against backend `id`-ordered cuids drifting under backfill or clock skew. Tag already in place: `[NOTIF_FRESHNESS_V1]`. No change needed.
- **Public-lane coherence**: already enforced by SSOT `isVisibleInPublicFeed()` in `src/lib/discoverFilters.ts` plus `[PUBLIC_LANE_OWN_EVENTS_V1]` (surface coherence across Social Public Invite, Discover Events Public pill, Discover Map Public) plus `[VISIBILITY_TRANSITION_V1]` (lane-affected key invalidation on edit). A new public event with coordinates propagates to all three lanes via the feed / myEvents / feedPopular invalidation cascade; a public event without coordinates correctly appears off-map but not as a map marker (`isEventVisibleInMap` coord filter in `discoverFilters.ts`, documented in `docs/SYSTEMS/discover.md`).

### Files changed
- `src/lib/eventQueryKeys.ts` — added `attendees(eventId)` and `rsvps(eventId)` to `getRefetchOnEventFocus`; updated the jsdoc with `[EVENT_FOCUS_ATTENDEE_FRESH_V1]` rationale.
- `docs/SYSTEMS/event-page.md` — new `[EVENT_FOCUS_ATTENDEE_FRESH_V1]` invariant under `## Invariants`.
- `docs/SESSION_LOG.md` — this entry.
- `docs/FORENSICS_CACHE.md` — resolved investigation entry.

### Expected vs actual changed files
Expected (worst case): `src/lib/eventQueryKeys.ts` + one or more mutation/helper files + relevant `docs/SYSTEMS/*.md` + log docs.
Actual: `src/lib/eventQueryKeys.ts` + 3 docs only. Tighter than expected because the audit found one read-side freshness gap rather than any missing write-side invalidation. No surface file or mutation call-site required editing — the helper is the SSOT, and every caller delegates to it.

### Verification
- `npx tsc --noEmit` clean.
- Frontend-only. OTA-safe. No backend contract change required (backend responses were already serving the freshest data; the gap was on the frontend's decision about *when* to refetch).
- Logical matrix for the fix:
  1. Open event X, background app, another user RSVPs "going" on event X, foreground app / return to event detail → `useFocusEffect` fires → `getRefetchOnEventFocus(X)` invalidates 6 keys → Who's Coming roster refetches and shows the new attendee avatar; `not_going` / `going` groupings in grouped-RSVP view re-sort.
  2. Existing same-session RSVP mutation (viewer RSVPs themselves) — unchanged; `getInvalidateAfterRsvpJoin` still owns the write-side invalidation and continues to work as before.
  3. Pure read surfaces that don't include attendees modal state — unaffected; the two added keys only refetch when their queries are mounted.
- Logical matrix for verified-correct classes:
  - Create a new public event with location → appears in Social → Public Invite, Discover → Events → Public pill, Discover → Map → Public.
  - Create a new public event without location → appears in Social → Public Invite and Discover → Events → Public; does NOT appear as a map marker (coord filter in `isEventVisibleInMap`).
  - Edit title / time / location → event detail refreshes (`single`), feed cards update (feed + feedPaginated + feedPopular), calendar refreshes. `attending`/`friendsHostedFeed` also refresh for lane coherence.
  - Edit visibility all_friends → public → event moves INTO public lanes (Events Public pill, Map Public, Social Public Invite) and stays out of Social Open Invite / Group Invite. Moving the other direction reverses the effect.
  - RSVP join / leave → RSVP button state, attendee avatars/counts, Discover cards, Social cards, Calendar, event detail — all converge via the 12-key `getInvalidateAfterRsvpJoin` / `getInvalidateAfterRsvpLeave` cascades.
  - Comment create → comment thread refreshes on the commenter's device. Host's device receives a push; when focused, notifications refetch under `[NOTIF_FRESHNESS_V1]`.
  - Notification freshness → newest activity arrives at top (client-side `createdAt` DESC sort) within one focus cycle.

### Scope discipline
- Did not add websockets / subscriptions / background polling.
- Did not redesign Discover / Social / Calendar / Event Detail.
- Did not touch backend (forensics did not prove a contract mismatch; the gap was entirely client-side refetch timing).
- Did not broaden into analytics / onboarding / entitlements.
- Did not modify any query's `staleTime` — `getRefetchOnEventFocus` is the right layer for focus-driven freshness, and over-lowering `staleTime` on `attendees` / `rsvps` would cause unnecessary refetches during normal UI transitions (e.g. toggling the attendees modal).

### Open follow-ups (explicitly out of scope)
- Discover's `useLiveRefreshContract` wires `refetchFeed, refetchMyEvents, refetchFriendsFeed` but not `refetchAttending` or `refetchFriendsHostedFeed`. Those secondary queries have 60s staleTime and every RSVP mutation already invalidates them, so intra-session consistency is fine. The bounded staleness only affects out-of-session changes, which are inherently latency-bounded by the 60s stale window. Deferred — not a real consistency bug, and broadening the live-refresh set adds network pressure on tab-focus.
- Social's `useLiveRefreshContract` wires `refetchFeed, refetchMyEvents, refetchAttending` but not `refetchFriendsHostedFeed`. Same reasoning — 5min staleTime + mutation-driven invalidation + `refetchOnMount: true` default make out-of-session freshness bounded. Deferred.
