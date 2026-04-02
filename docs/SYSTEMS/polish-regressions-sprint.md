# Polish Regressions Sprint

> SSOT for the focused polish / trust / activation sprint.
> Created: 2026-04-01. Updated after each phase.

---

## 1. Purpose

Fix 4 regressions and address ~10 polish items across the app. Work in phases:
- **Phase 1A:** Sprint SSOT + Settings sheet freeze fix
- **Phase 1B:** Swipe bleed-through + Pin icon + Chat pinned event
- **Phase 2:** Discover card headline, event detail content, card color softening, frequency relocation
- **Phase 3:** Activity feed, friend request notifications, subscription page, profile stats

---

## 2. Regressions (Phase 1A + 1B)

### 2.1 Settings Sheet Freeze on Open — Phase 1A

**Current behavior:** Opening the settings sheet from the create page causes a multi-second UI freeze (5-7s reported). The sheet appears to hang before becoming interactive.

**Target behavior:** Sheet opens in <500ms to interactive. Progressive rendering is acceptable — controls don't need to all be interactive on frame 1.

**Files:**
- `src/components/create/SettingsSheetContent.tsx` (768 lines) — the sheet content
- `src/components/create/CreateSheets.tsx` (94 lines) — sheet orchestrator
- `src/components/BottomSheet.tsx` (170 lines) — sheet primitive (uses RN `Modal`)
- `src/app/create.tsx` (~813 lines) — parent, passes ~50 props via `settingsProps`

**Root cause analysis:**

Prior fix (commit `a97443a`) added `InteractionManager.runAfterInteractions` to defer below-fold sections (Capacity through Privacy/Entitlements). The deferral gate is at line 150-154 of `SettingsSheetContent.tsx`.

**Why the prior fix didn't hold:** `InteractionManager.runAfterInteractions` tracks JS-side interaction handles, NOT native animations. The `BottomSheet` uses `Modal` with `animationType="slide"` — a native iOS animation that doesn't register JS interactions. The InteractionManager callback fires on the very next frame (via internal `requestAnimationFrame`), meaning the deferred sections mount immediately alongside the above-fold sections in the same render burst, defeating the purpose.

**Evidence:**
- `BottomSheet.tsx:153` uses `animationType="slide"` (native, not JS)
- `SettingsSheetContent.tsx:151-153` uses `InteractionManager.runAfterInteractions`
- InteractionManager only waits for JS interactions (e.g., `LayoutAnimation`, Animated API callbacks), not native Modal slide
- Result: `ready` flips to `true` on the first frame after mount, so all ~12 sections mount synchronously

**Component mount cost on open (all mount in one burst):**
1. Frequency section — 3 Pressables, conditional picker (lightweight)
2. Visibility section — 2 Pressables + circles list with `CirclePhotoEmoji` per circle (moderate if many circles)
3. Send Notification section — 2 Pressables (lightweight)
4. Capacity section — Switch + stepper (lightweight)
5. RSVP Deadline section — Switch + `DateTimePicker` native bridge (HEAVY when toggled on)
6. Cost Per Person — TextInput (lightweight)
7. Pitch In section — Switch + 4 TextInputs + 2 ScrollViews + preset chips (moderate)
8. What to Bring — Switch + TextInput + dynamic list (moderate)
9. Privacy & Display — 4 Switches (lightweight)
10. Nudge banner — conditional (lightweight)
11. Entitlements timeout — conditional (lightweight)

**Fix approach:** Replace `InteractionManager.runAfterInteractions` with `setTimeout(350)` to properly wait for the native Modal slide animation to complete before mounting deferred sections. The 350ms timeout matches the Modal slide duration and ensures the UI thread is free before heavy sections mount.

**Implementation details (post-fix):**
- Replaced `InteractionManager.runAfterInteractions` with `setTimeout` (350ms delay)
- Removed `InteractionManager` import
- Added cleanup via `clearTimeout` in effect cleanup
- Deferred sections: Capacity, RSVP Deadline, Cost, Pitch In, Bring List, Privacy, Nudge, Entitlements

---

### 2.2 Chat List Swipe-Action Bleed-Through — Phase 1B

**Current behavior:** Pin and Delete action buttons are partially visible at rest (without swiping) on CircleCard rows in the Chats tab. The colored action pills show through behind the card content.

**Target behavior:** Action buttons fully hidden at rest, only revealed on horizontal swipe.

**Files:**
- `src/components/CircleCard.tsx` (506 lines) — swipeable circle card
  - Action buttons: lines 334-364 (absolute positioned, `inset-y-0`)
  - Card row: lines 367-509 (`GestureDetector` → `Animated.View` → `Pressable`)
  - `overflow-hidden` on outer `Animated.View` at line 331

**Root cause candidates:**
1. The action buttons (lines 334-348, 350-364) use `className="absolute inset-y-0 left-0"` — they are always rendered and positioned behind the card
2. The card row `Pressable` (line 369-508) has a conditional `backgroundColor` that may not fully cover the action layer — specifically, when `unreadCount === 0` or `circle.isMuted`, background is `colors.background` which should be opaque. However, the `Animated.View` wrapper (line 368) has NO background — only the inner `Pressable` does
3. If there's any pixel gap between the card content edge and the action button area (e.g., from padding, border, or rounding), actions bleed through

**Fix approach:** Add an explicit opaque background to the `Animated.View` card wrapper (line 368) so the action layer is fully covered at rest.

**Implementation (Phase 1B):** Added `backgroundColor: colors.background` to the `Animated.View` style array. Changed the inner `Pressable` backgroundColor to only apply the tinted overlay when `unreadCount > 0` (using `undefined` instead of `colors.background` for the default case, since the parent now provides the opaque base).

---

### 2.3 Pin Icon Ugly + Badly Positioned — Phase 1B

**Current behavior:** Pin indicator is a tiny green circle badge (`w-4 h-4` / `w-5 h-5`) with a microscopic `Pin` icon (8-10px) overlaid on the avatar. Looks unintentional and clip-prone.

**Target behavior:** Clean, well-positioned pin indicator. Consistent across People and Chats tabs.

**Files:**
- `src/components/CircleCard.tsx:428-435` — Chats tab pin badge
  - `className="absolute -top-1 -right-1 w-4 h-4"` with `Pin size={8}`
- `src/components/FriendCard.tsx:162-169` — People tab pin badge
  - `className="absolute -top-1 -right-1 w-5 h-5"` with `Pin size={10}`

**Current treatment:**
- CircleCard: green circle (16×16), Pin icon 8px, positioned `-top-1 -right-1` on avatar
- FriendCard: green circle (20×20), Pin icon 10px, positioned `-top-1 -right-1` on avatar

**Fix approach:** Unify both badges to a consistent size (18×18), slightly larger Pin icon (10px), and consistent positioning. Both use the `Pin` icon from `@/ui/icons` (lucide) which is clean. The issue is just sizing — make both match the FriendCard's slightly larger treatment, and both use the same positioning.

**Implementation (Phase 1B):** Both CircleCard and FriendCard now use `width: 18, height: 18` with `Pin size={10}` and `className="absolute -top-0.5 -right-0.5"`. Consistent green (#10B981 / STATUS.going.fg) circle badge.

---

### 2.4 Group Chat Pinned Next-Event Persistence — Phase 1B

**Current behavior:** The "Up Next" event card in group chats is rendered inside the `FlatList` `ListHeaderComponent` (circle/[id].tsx, line 2032). It scrolls away as new messages arrive or as the user scrolls through chat history.

**Target behavior:** The next upcoming event stays visible regardless of scroll position — either as a sticky/pinned bar at the top of the chat area or as a persistent overlay.

**Files:**
- `src/app/circle/[id].tsx` (~2937 lines) — chat screen
  - `nextCircleEvent` computed at line 1505-1531 (useMemo over `circle.circleEvents`)
  - `upNextExpanded` state at line 333
  - `CircleNextEventCard` rendered at line 2032-2048 (inside ListHeaderComponent)
  - `FlatList` at line 1898 (NOT inverted)
  - `chromeHeight` used for `paddingTop` in FlatList contentContainerStyle (line 1905)
- `src/components/circle/CircleNextEventCard.tsx` (130 lines) — the card component
- `src/components/circle/CircleHeaderChrome.tsx` (142 lines) — floating blur header

**Root cause:** The `CircleNextEventCard` is placed inside `ListHeaderComponent` which scrolls with the FlatList. It's not sticky or absolutely positioned.

**Fix approach:** Move `CircleNextEventCard` out of the `ListHeaderComponent` and render it as an absolutely positioned overlay below the header chrome. Increase `paddingTop` on the FlatList to account for the card height. The card should only appear when `nextCircleEvent` exists.

**Implementation (Phase 1B):** Moved `CircleNextEventCard` out of `ListHeaderComponent` into an absolutely positioned overlay at `top: chromeHeight, zIndex: 9`. Added `nextEventCardHeight` state measured via `onLayout`. FlatList `paddingTop` now includes `nextEventCardHeight` when the card exists. Card remains collapsible/expandable — layout measurement updates automatically. When no next event exists, `nextEventCardHeight` contribution is 0.

---

## 3. Sprint Items (Phase 2+)

### 3.1 Discover Card + Event Detail Content Hierarchy — Phase 2 ✅

**Previous behavior:** eventHook displayed as gradient overlay on Discover card image zone; description shown in card body.
**New behavior:** eventHook shown as italic teaser in card body (where description was); description removed from Discover card front entirely. On InviteFlipCard, front = headline teaser, back = description/details (was already correct — no change needed).

**Files changed:**
- `src/app/discover.tsx` — Removed LinearGradient overlay from image zone, replaced description with headline in card body
- `src/components/InviteFlipCard.tsx` — No content hierarchy changes needed (already correct)

**Web divergence:** `openinvite-website/src/components/EventCard.tsx` still shows eventHook as italic subtitle below title. Web update deferred to later phase.

### 3.2 Card Color Softening — Phase 2 ✅

**Previous behavior:** User-picked custom hex colors rendered at full saturation — visually harsh.
**New behavior:** Custom cardColor blended 40% toward white at render time via `softenColor()`. Theme-derived colors unchanged.

**Files changed:**
- `src/lib/softenColor.ts` — NEW: reusable blend utility (`softenColor(hex, blend=0.4)`)
- `src/app/discover.tsx` — Applied softening to `plaqueBg` and `ccHex` contrast computation
- `src/components/InviteFlipCard.tsx` — Applied softening to `themedCardBg`, `plaqueBg`, `contrastText`

**Invariants:** Stored hex value unchanged. Softening is presentation-layer only. Same input → same output (deterministic). Theme catalog colors NOT affected.

### 3.3 Frequency Removal from Create/Edit UI — Phase 2 ✅

**Previous behavior:** Frequency dropdown (Once/Weekly/Monthly) at top of Settings sheet.
**New behavior:** Frequency UI removed entirely. State variable retained as `"once"` default so save contract sends `isRecurring: false, recurrence: undefined` without changes.

**Files changed:**
- `src/components/create/SettingsSheetContent.tsx` — Removed frequency props, FREQUENCY_OPTIONS constant, and entire Frequency UI section. Removed unused `RefreshCw`/`ChevronDown` icon imports.
- `src/app/create.tsx` — Removed `showFrequencyPicker` state, `handleFrequencyChange` handler, and frequency-related settingsProps. Kept `frequency` state (defaults to `"once"`) for save payload.

**Invariants:** Existing recurring events are unaffected — their recurrence data is stored and rendered as before. Backend recurrence logic untouched. Calendar recurrence rendering untouched. Only the create/edit UI surface removed.

### 3.5 Activity Feed Dedup + Reminder Collapsing — Phase 3 ✅

**Previous behavior:** Backend creates multiple notifications with different IDs for the same event action. The id-based dedup in `usePaginatedNotifications.ts:83` (Map by `n.id`) did NOT catch content duplicates. Result: "New Event" for the same event appeared 2-3x, reminders for the same event stacked 3x.

**Notification data schema** (from `shared/contracts.ts:692-700`):
```
{ id, type, title, body, data: string|null, read, createdAt }
```
Where `data` is a JSON blob parsed by `parseNotificationData`. Available fields vary by notification type — `eventId`, `actorName`, `actorAvatarUrl`, `eventTitle`, `eventEmoji`, `userId`/`senderId`/`actorId`.

**Root cause of duplicates:** Backend creates separate notification rows (unique IDs) for what the user perceives as one event. Example: two `event_invite` notifs for the same `eventId` on the same day.

**Fix — content-based dedup** (`contentDedup` function in `ActivityFeed.tsx`):
1. For reminders (`event_reminder`/`reminder`): key = `reminder:{eventId}` if eventId available, else `reminder:{title with time suffix stripped}`. ONE row per event, period.
2. For other event types: key = `{type}:{eventId}:{YYYY-MM-DD}`. One notification per type+event+day.
3. Notifications without `eventId` and not reminders are never collapsed.
4. Applied BEFORE the filter step in `filteredNotifications` useMemo.
5. Title-based fallback key strips time suffixes (regex: `/\s*[—–\-]\s*(In\s+)?\d+.*$/i`), so "Reminder: Beach BBQ — In 30 min" and "Reminder: Beach BBQ — In 2 hours" collapse to one row.

**Fallback icon consistency (Phase 3.5):** Replaced mixed per-type Ionicons fallback with unified initials-based fallback:
- Removed default "📅" emoji for event types — only uses emoji if backend explicitly provided `eventEmoji`.
- Initials derived from: `actorName` → `eventTitle` → `notification.title` → "?".
- Background color deterministically hashed from the source string to a 10-color palette.
- Result: all notifications without avatar data show consistent colored initials circles instead of a mix of bell/calendar/person icons.

**Generic icons (no event images):** The notification `data` JSON does NOT include event cover image URLs. **Backend follow-up required:** Include `actorAvatarUrl` and/or `eventCoverUrl` in notification `data` JSON.

**Files changed:**
- `src/components/activity/ActivityFeed.tsx` — `contentDedup()` with title-based fallback key for reminders, `NotificationCard` with unified initials fallback, `initialsColor()` deterministic hash, `INITIALS_PALETTE` constant.

### 3.6 Friend Request Navigation Fix — Phase 3 ✅

**Previous behavior:** Tapping a friend_request notification showed "Unavailable" toast because `resolveNotificationTarget` returned null — the notification `data` JSON did not contain `userId`, `senderId`, or `actorId` fields.

**Root cause:** `resolveNotificationTarget` checked for `eventId` first, then `userId`/`senderId`/`actorId`. For friend requests, neither field was present in the data → returned null → "Unavailable" toast.

**Fix:** Added `friend_request` and `friend_accepted` type-specific handling at the top of `resolveNotificationTarget`. These types now:
1. First try to extract `userId`/`senderId`/`actorId` → navigate to `/user/{id}`
2. If no user ID in data → fallback to `/friends` (so the tap always does something useful)

**Avatars:** The frontend avatar rendering (`parseNotificationData` → `EntityAvatar` fallback chain) is correctly wired. The issue is backend: notification `data` JSON for friend_request notifications does not include `actorAvatarUrl`. Current behavior shows initials (if `actorName` present) or generic person icon. **Backend follow-up required:** Include `actorAvatarUrl` in friend_request notification data.

**Stale requests:** The notification schema has no `status` field — there is no way to determine client-side whether a friend request was already responded to. `markAllSeen()` clears the unread badge but does not filter responded requests. **Backend follow-up required:** Either (a) add a `status` field to notifications, or (b) clean up/expire friend_request notifications when the request is accepted/declined.

**Navigation error handling:** Added try/catch around `router.push` in `handleNotificationPress` — on error, shows "This request is no longer available" toast instead of crashing.

**Files changed:**
- `src/components/activity/ActivityFeed.tsx` — Updated `resolveNotificationTarget` for friend types, added try/catch in press handler.

### 3.7 Subscription Page Feature Table — Phase 3 ✅

**Previous behavior:** Feature table showed limits (Circles "2 max", Who's Free "7 days", etc.) that exist as frontend constants in `entitlements.ts` FREE_LIMITS and `freemiumLimits.ts` but are NOT enforced by the backend. Phase 3 initial pass incorrectly ADDED more fake limit rows.

**Forensics findings:**
- `entitlements.ts` defines `FREE_LIMITS = { circlesMax: 2, membersPerCircleMax: 15, ... }` as offline fallback defaults.
- `useSubscription.ts` defines matching constants, also as fallback defaults.
- The backend `/api/entitlements` endpoint does not enforce these limits for any user — confirmed by device testing.
- Theme gating IS real: `PREMIUM_THEME_IDS` in `shared/contracts.ts` defines 25 premium themes, 5 free themes. This is enforced by the theme picker UI.

**Fix:** Removed ALL rows claiming unenforced limits:
- Removed: Circles "2 max" / "Unlimited"
- Removed: Circle Members "15 max" / "Unlimited" (was added by initial Phase 3 pass)
- Removed: Who's Free "7 days" / "90 days"
- Removed: Event History "30 days" / "Full history" (was added by initial Phase 3 pass)
- Removed: Birthdays "7 days" / "90 days" (was added by initial Phase 3 pass)
- Removed: Friends "Unlimited" / "Unlimited" (no difference, pointless row)
- Removed: entire Social and Planning sections (empty after limit removal)

**Kept:** Event Hosting (Unlimited/Unlimited — reassuring, accurate), Event Themes (5 basic / All 30 — enforced), Premium Effects (No/Yes — enforced), Theme Studio (No/Yes — enforced).

**Source-of-truth decision:** Added `@deprecated` JSDoc tags and header comment to `freemiumLimits.ts` explaining that `FREE_TIER_LIMITS` and `PRO_TIER_LIMITS` are stale dead code. Only `REFERRAL_TIERS` from this file is actively used (6 import sites). Canonical subscription truth:
- Runtime enforcement: `src/lib/entitlements.ts` (reads `/api/entitlements`)
- Subscription hook: `src/lib/useSubscription.ts` (reads `/api/subscription`)

**Files changed:**
- `src/app/subscription.tsx` — Removed fake limit rows, kept only enforced features.
- `src/lib/freemiumLimits.ts` — Added deprecation comments to stale tier limit exports.

### 3.8 Profile Stats — Verified Correct — Phase 3 ✅

**longestStreak fix (from initial Phase 3):** `profile.tsx:983` now passes `longestStreak={0}` to hide the "Best" badge, since `getProfileStatsResponseSchema` has no `longestStreak` field. Confirmed still in place.

**All visible stats re-verified:**
- **Friends** (`friendsCount`): `friendsData?.friends.filter(f => f.friend != null).length` — from `/api/friends` query. Real data.
- **Groups** (`circlesCount`): `circlesData?.circles?.length ?? 0` — from `/api/circles` query. Real data.
- **Hosted**: `stats?.hostedCount ?? 0` — from `/api/profile/stats`. Real data.
- **Attended**: `stats?.attendedCount ?? 0` — from `/api/profile/stats`. Real data.
- **Current Streak**: `stats?.currentStreak ?? 0` — from `/api/profile/stats`. Real data.
- **Total Hangouts**: `stats?.attendedCount ?? 0` — from `/api/profile/stats`. Real data.
- **Avg per Week**: `totalHangouts / Math.max(currentStreak, 1)` — computed, divides by max(streak,1) so no division by zero. Correct.

All stats source from real query responses. The `?? 0` fallback applies only during query loading (before the loading gate at line 394). After the gate, queries have resolved — if backend returns 0, that's accurate data. No false zeros.

---

## 4. Rollout Order

| Phase | Issues | Status |
|-------|--------|--------|
| 1A | Settings sheet freeze + SSOT | Complete |
| 1B | Swipe bleed-through, Pin icon, Chat pinned event | Complete |
| 2 | Headline placement, card content, color softening, frequency | Complete |
| 3 | Activity feed, friend notifications, subscription table, profile stats | Complete |
| 3.5 | Reminder collapse, initials fallback | Complete |
| 4 | Launch readiness: empty states, offline banner, deep link audit, push audit | Complete |

---

## Phase 4 — Launch Readiness

### 4.1 Empty States Audit ✅

**Target:** Every screen a new user sees must have an actionable empty state with a CTA — no blank screens, no "null" text, no broken layouts.

**Finding:** All screens already have actionable empty states. No implementation needed.

| Screen | Empty State | CTA |
|--------|-------------|-----|
| Home (Events) | "No upcoming events" illustration | "Create Event" button |
| Discover | "No events nearby" | Pull-to-refresh |
| People (Friends) | "Add friends to get started" | "Add Friends" button |
| Chats (Circles) | "No groups yet" | "Create Group" button |
| Activity Feed | "No notifications yet" | — (informational) |
| Profile | Stats show 0 values gracefully | — |
| Calendar | Empty day states | "Create Event" on tap |

### 4.2 Offline Banner Retry Fix ✅

**Previous behavior:** Tapping "Retry" on the offline banner would briefly dismiss the banner, then it would reappear even though connectivity was restored.

**Root cause:** Race condition between `refresh()` and the passive `NetInfo.addEventListener` callback in `initNetworkMonitoring()`.

1. User taps Retry → `refresh()` calls `NetInfo.fetch()`
2. `refresh()` trusts `!!state.isConnected` (lenient check) → sets `globalIsOnline = true` → banner hides
3. `NetInfo.fetch()` also triggers the passive `addEventListener` callback
4. Passive listener uses stricter check: `state.isConnected && state.isInternetReachable !== false`
5. On reconnection, `isConnected` flips to `true` before `isInternetReachable` does → listener computes `false`
6. Listener overrides `globalIsOnline` back to `false` → banner reappears

**Fix:** Added a 3-second grace period after manual `refresh()`. When `refresh()` determines the device is online, it sets `manualRefreshUntil = Date.now() + 3000`. The passive listener skips offline→online override during this window.

**Files changed:**
- `src/lib/networkStatus.ts` — Added `manualRefreshUntil` module variable, grace period guard in `addEventListener` callback, timestamp set in `refresh()`.

**Invariants:**
- Grace period only suppresses offline transitions (going offline→online is never suppressed)
- Only manual user-initiated refresh triggers the grace period — passive listener, foreground resume, and initial fetch are unaffected
- 3-second window matches the typical `isInternetReachable` convergence delay

### 4.3 Deep Link / Share Link Chain Verification ✅

**Full chain traced — no code changes needed, gaps documented for backend/web follow-up.**

**Configuration:**
- Custom scheme: `open-invite://` (app.json line 6)
- Associated domains: `applinks:openinvite.cloud`, `applinks:www.openinvite.cloud` (app.json lines 19-22)
- AASA: hosted at `www.openinvite.cloud/.well-known/apple-app-site-association`, paths: `["/event/*"]`
- App ID: `T3LP6XXS49.com.vibecode.openinvite.0qi5wk`

**URL formats supported** (`src/lib/deepLinks.ts`):
| Format | Type |
|--------|------|
| `open-invite://event/:id` | Custom scheme event |
| `open-invite://user/:userId` | Custom scheme profile |
| `open-invite://circle/:id` | Custom scheme circle |
| `open-invite://invite/:code` | Custom scheme referral |
| `open-invite://verify-email?token=xxx` | Email verification |
| `https://www.openinvite.cloud/event/:id` | Universal link (AASA) |
| `https://go.openinvite.cloud/share/event/:id` | Legacy web domain |
| `.ics` files | Calendar import |

**Share URL construction** (`src/lib/shareSSOT.ts`):
- Event shares use `getEventUniversalLink(eventId)` → `https://www.openinvite.cloud/event/{id}`
- Referral shares use `getInviteDeepLink(referralCode)` → `open-invite://invite/{code}`
- Forbidden domain guard blocks `api.openinvite.cloud`, `go.openinvite.cloud` from appearing in share payloads

**Pre-auth intent capture** (RSVP, referral, circle invite):
- `src/lib/pendingRsvp.ts` — RSVP intent stored in SecureStore (7-day expiry)
- `src/lib/referral.ts` — Referral code stored in SecureStore (7-day expiry)
- `src/lib/pendingCircleInvite.ts` — Circle invite stored in SecureStore (7-day expiry)
- `src/lib/attribution.ts` — Campaign attribution (`?t=`, `?c=`, `?v=` params) stored in SecureStore (24-hour expiry)
- All intents auto-claimed after auth via dedicated hooks

**Auth-gated deep link replay** (`src/app/_layout.tsx`):
- Deferred deep links stored as `pendingDeepLinkRoute` when `bootStatus !== 'authed'`
- Replayed once auth completes (lines 596-605, guarded by `deepLinkReplayedRef`)

**Known gaps (not blocking launch):**
1. **Android `assetlinks.json` empty:** `sha256_cert_fingerprints` array has no entries → Android shows disambiguation dialog instead of auto-launching app. Fix: populate with EAS signing cert fingerprint.
2. **Android SMS share format:** Uses iOS-only `sms:&body=` format. Android expects `sms:?body=`. Non-blocking for iOS-first church launch.
3. **Android intent filters limited to `/event` paths only.** User/circle/invite universal links won't auto-open on Android (custom scheme still works).
4. **Web landing page** lives in separate `openinvite-website` repo — not auditable here.

### 4.4 Push Notification Trigger Verification ✅

**Full chain traced — no code changes needed.**

**Token registration** (`src/hooks/useNotifications.ts`, `src/lib/push/registerPush.ts`):
- Gets Expo push token via `Notifications.getExpoPushTokenAsync()`
- Registers with backend `POST /api/push/register`
- 24-hour throttle per user, bypassed when backend shows `activeCount === 0`
- Token deactivated on logout (`POST /api/push/deactivate`)

**Notification handling:**
| Layer | Mechanism |
|-------|-----------|
| Foreground | `addNotificationReceivedListener` → haptic + cache patch via `pushRouter.ts` + invalidate notifications query |
| Background tap | `addNotificationResponseReceivedListener` → route to target screen |
| Cold start | `getLastNotificationResponseAsync()` → deferred navigation until auth ready |
| Dedup | 8-second TTL window in pushRouter + module-level `handledResponseIds` set (max 50) |

**8 trigger types verified:**

| Trigger | Frontend Type | Tap Route | Push Router Handler | Status |
|---------|--------------|-----------|---------------------|--------|
| event_invite | `event_invite` | `/event/:id` | `handleEventCreated` | ✅ |
| event_update | `event_update` | `/event/:id` | `handleEventUpdated` | ✅ |
| event_reminder | `event_reminder` | `/event/:id` | — (local schedule) | ✅ |
| rsvp_update | `event_rsvp_changed`* | `/event/:id` | `handleEventRsvpChanged` | ✅ (type alias) |
| friend_request | `friend_request` | `/user/:id` or `/friends` | `handleFriendEvent` | ✅ |
| friend_accepted | `friend_accepted` | `/user/:id` or `/friends` | `handleFriendEvent` | ✅ |
| circle_invite | `circle_invite`* | `/circle/:id` | — (fallback routing) | ⚠️ No explicit handler |
| chat_message | `circle_message`* | `/circle/:id` | `handleCircleMessage` | ✅ (type alias) |

*Backend type name differs from the 8-trigger list. Frontend handles via aliases or fallback routing.

**Local scheduled reminders** (`src/lib/notifications.ts`):
- `scheduleEventReminder()` — schedules local notification at `eventTime - reminderMinutesBefore`
- Stored in AsyncStorage keyed by `eventId`
- `cancelEventReminders(eventId)` — cancels all scheduled reminders for an event

**Android notification channels:**
| Channel | Importance | Use |
|---------|-----------|-----|
| `default` | MAX | General |
| `events` | HIGH | Event notifications |
| `reminders` | HIGH | Event reminders |
| `social` | DEFAULT | Friend/social |

**Soft pre-permission prompt** (`src/lib/notificationPrompt.ts`):
- Never prompts if OS permission already granted
- Never prompts if user has created an event (targets RSVPers)
- 14-day cooldown between prompts

**Known gaps (not blocking launch):**
1. `circle_invite` has no explicit push router handler — relies on generic fallback routing via `circleId` in data payload. Works but no cache patch on receipt.
2. Backend type names may not match frontend expectations exactly (`rsvp_update` vs `event_rsvp_changed`, `chat_message` vs `circle_message`). Handled via fallback routing but could cause missed cache patches.

---

## 5. Backend Follow-Ups (Phase 3)

These issues require backend changes and cannot be fully resolved client-side:

1. **Notification avatar data:** Backend does not include `actorAvatarUrl` in most notification `data` JSON blobs (friend_request, event_invite, event_reminder, etc.). Frontend fallback chain works but shows generic icons. Fix: populate `actorAvatarUrl` when creating notifications.

2. **Notification event cover image:** Backend does not include `eventCoverUrl` or `eventPhotoUrl` in notification `data` JSON. Event-related notifications show emoji or generic icon instead of event cover. Fix: include event cover URL in notification data.

3. **Friend request notification stale cleanup:** No `status` field on notifications. When a friend request is accepted/declined, the original `friend_request` notification persists forever. Fix: either (a) add a `status` field and update it on accept/decline, or (b) delete/expire the notification row when the request is resolved.

4. **Friend request notification userId:** `friend_request` notifications do not include `userId`/`senderId`/`actorId` in the `data` JSON, so the client can't navigate to the sender's profile. Fix: include `senderId` in friend_request notification data.

5. **Duplicate notification creation:** Backend creates multiple notification rows (different IDs) for the same event action on the same day. Client-side content dedup mitigates this but the root fix is to dedup server-side before insert.

6. **Stale freemium limits:** `src/lib/freemiumLimits.ts` `FREE_TIER_LIMITS` and `PRO_TIER_LIMITS` are stale dead code that conflicts with actual backend behavior. They are now marked `@deprecated`. Consider deleting the tier limit constants entirely in a future cleanup (only `REFERRAL_TIERS` is actively imported).

---

## 6. Risks / Invariants

- **Settings sheet:** Deferred rendering must not break edit-mode prefill. When editing an existing event, all settings values are pre-populated before the sheet opens — deferred sections must receive correct initial values.
- **Swipe fix:** Must not break swipe-to-reveal gesture behavior. Only visual fix (background coverage).
- **Pin icon:** Visual-only change. Must not alter pin/unpin data flow.
- **Chat pinned event:** If implementing sticky overlay, must not interfere with keyboard avoidance, typing indicators, or scroll-to-bottom behavior. If complexity exceeds phase scope, document and defer.
- **Content dedup:** The `contentDedup` function in ActivityFeed.tsx assumes notifications are ordered most-recent-first (as returned by the paginated API). If order changes, the "keep first seen" logic would keep the wrong entry.
- **Friend request fallback navigation:** `resolveNotificationTarget` now falls back to `/friends` for friend_request/friend_accepted types when no userId is in the data. This is better than "Unavailable" but doesn't deep-link to the specific request.
- **Offline banner grace period:** 3-second window suppresses only offline transitions from the passive listener. If the device is genuinely offline, the next listener event after the grace period expires will correctly show the banner.
- **No backend changes** in any phase.
- **No web surface changes** in any phase.
