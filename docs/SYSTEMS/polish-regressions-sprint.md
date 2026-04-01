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

### 3.5 Activity Feed Image Wiring + Notification Dedup — Phase 3

**Current behavior:** Activity feed may show broken images, duplicate notifications possible.
**Target behavior:** Correct image URLs, dedup notifications.
**Files:**
- `src/components/activity/ActivityFeed.tsx` (634 lines)
- `src/app/activity.tsx` (138 lines)

### 3.6 Friend Request Notification Avatars + Stale Clearing — Phase 3

**Current behavior:** Friend request notifications may lack avatars, stale requests may persist.
**Target behavior:** Show avatars, clear stale requests.
**Files:**
- `src/components/activity/ActivityFeed.tsx`
- `src/components/friends/FriendsPeoplePane.tsx` (435 lines)

### 3.7 Subscription Page Inaccurate Feature Table — Phase 3

**Current behavior:** Feature comparison table may not match current entitlements.
**Target behavior:** Accurate feature table reflecting current Pro vs Free capabilities.
**Files:**
- `src/app/subscription.tsx` (759 lines)

### 3.8 Profile Stats Correctness — Phase 3

**Current behavior:** Profile stats show zeros when data exists.
**Target behavior:** Correct stats computation and display.
**Files:**
- `src/app/profile.tsx` (1123 lines)

---

## 4. Rollout Order

| Phase | Issues | Status |
|-------|--------|--------|
| 1A | Settings sheet freeze + SSOT | Complete |
| 1B | Swipe bleed-through, Pin icon, Chat pinned event | Complete |
| 2 | Headline placement, card content, color softening, frequency | Complete |
| 3 | Activity feed, friend notifications, subscription table, profile stats | Queued |

---

## 5. Risks / Invariants

- **Settings sheet:** Deferred rendering must not break edit-mode prefill. When editing an existing event, all settings values are pre-populated before the sheet opens — deferred sections must receive correct initial values.
- **Swipe fix:** Must not break swipe-to-reveal gesture behavior. Only visual fix (background coverage).
- **Pin icon:** Visual-only change. Must not alter pin/unpin data flow.
- **Chat pinned event:** If implementing sticky overlay, must not interfere with keyboard avoidance, typing indicators, or scroll-to-bottom behavior. If complexity exceeds phase scope, document and defer.
- **No backend changes** in any phase.
- **No web surface changes** in any phase.
