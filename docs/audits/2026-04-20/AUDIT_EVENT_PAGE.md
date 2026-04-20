# AUDIT: src/app/event/[id].tsx

**Date:** 2026-04-20
**File size:** 2939 lines (single default export: `EventDetailScreen`)
**Purpose:** Exploration-only audit to feed extraction spec. No edits performed.

---

## 1. Hook Order Audit

All hooks are called at the top level of `EventDetailScreen()`. The component has been carefully structured so that **all hooks sit ABOVE the first early return** (line 1831). This is correct.

### Complete Hook List (in call order)

| # | Line | Hook | Purpose |
|---|------|------|---------|
| 1 | 125 | `useLocalSearchParams` | Route params (id, from, discoverSource, discoverPill) |
| 2 | 136 | `useSession` | Auth session |
| 3 | 137 | `useBootAuthority` | Boot status (authed/loggedOut) |
| 4 | 138 | `useRouter` | Navigation |
| 5 | 139 | `useQueryClient` | React Query cache access |
| 6 | 140 | `useTheme` | Theme color, isDark, colors |
| 7 | 141 | `useSafeAreaInsets` | Safe area insets |
| 8 | 142 | `useWindowDimensions` | Screen width |
| 9 | 144-228 | `useState` x35 | (see State Audit below) |
| 10 | 231 | `useCallback` | handleFirstFlipReveal |
| 11 | 242 | `useCallback` | launchEventPhotoPicker |
| 12 | 281-283 | `useRef` x3 | Hero animation values |
| 13 | 287 | `useEffect` | Page view tracking |
| 14 | 302 | `useEffect` | Calendar sync check |
| 15 | 311 | `useEffect` | Photo nudge dismiss check |
| 16 | 332 | `useFocusEffect` | Live Activity support check |
| 17 | 353 | `useFocusEffect` | Live Activity auto-start |
| 18 | 407 | `useFocusEffect` | Event data refetch on focus |
| 19 | 511 | `useQuery` | Single event fetch (eventKeys.single) |
| 20 | 540 | `useLoadedOnce` | Loading state discipline |
| 21 | 628 | `useQuery` | My events fallback (eventKeys.mine) |
| 22 | 634 | `useQuery` | Feed fallback (eventKeys.feed) |
| 23 | 648 | `useInfiniteQuery` | Comments (cursor-paginated) |
| 24 | 660 | `useMemo` | Flatten comment pages |
| 25 | 666 | `useFocusEffect` | "Recently active" chip on new comments |
| 26 | 679 | `useQuery` | Mute status (eventKeys.mute) |
| 27 | 688 | `useMutation` | Mute toggle |
| 28 | 712 | `useEffect` | Hero title animation reset |
| 29 | 778 | `useMutation` | handleJoinRequestAction |
| 30 | 796 | `useMutation` | createCommentMutation |
| 31 | 811 | `useMutation` | deleteCommentMutation |
| 32 | 824 | `useMutation` | deleteEventMutation |
| 33 | 839 | `useQuery` | Grouped RSVPs (eventKeys.rsvps) |
| 34 | 846 | `useQuery` | My RSVP status (eventKeys.rsvp) |
| 35 | 863 | `useQuery` | Attendees (eventKeys.attendees) |
| 36 | 931 | `React.useEffect` | DEV: roster fetch state logging |
| 37 | 945 | `React.useEffect` | Force refetch on attendees sheet open |
| 38 | 1012 | `React.useEffect` | DEV: capacity counts logging |
| 39 | 1027 | `React.useEffect` | DEV: who's coming count logging |
| 40 | 1056 | `useMemo` | friendIdSet from cached friends |
| 41 | 1076 | `useSaveEvent` | Save/unsave hook |
| 42 | 1101 | `useMutation` | rsvpMutation (the big one: ~360 lines) |
| 43 | 1551 | `useMutation` | toggleReflectionMutation |
| 44 | 1566 | `useMutation` | bringListClaimMutation |
| 45 | 1615 | `useMutation` | addHostMutation |
| 46 | 1671 | `useEffect` | DEV: RSVP convergence guard |
| 47 | 1687 | `useEffect` | DEV: attendee convergence guard |
| 48 | 1703 | `useEffect` | DEV: hook order proof log |
| 49 | 206 | `useSharedValue` | rsvpButtonScale |
| 50 | 207 | `useAnimatedStyle` | rsvpButtonAnimStyle |
| 51 | 215 | `useEventColorOverrides` | Color override hook |
| 52 | 190, 205, 213-214, 221, 239 | `useRef` x7 | Various refs |

**Total hooks: ~52** (35 useState, 7 useQuery/useInfiniteQuery, 8 useMutation, 4 useFocusEffect, 8 useEffect, 2 useMemo, 2 useCallback, plus useRef/useSharedValue/useAnimatedStyle/custom)

### Hooks Below Early Returns: **0**

All hooks are called before line 1831 (first early return). The comment on line 1701-1702 explicitly states: "all hooks called unconditionally above this point." **No hook-order invariant violations found.**

---

## 2. Early Return Map

All early returns are in the handler/post-hook section (lines 1831-1999). They are safe because all hooks have already been called.

| # | Line | Condition | Returns |
|---|------|-----------|---------|
| 1 | 1831-1832 | `!session` + `bootStatus !== 'loggedOut'` | `null` (suppress flash) |
| 2 | 1833-1841 | `!session` + `bootStatus === 'loggedOut'` | Sign-in prompt SafeAreaView |
| 3 | 1844-1857 | `!id \|\| typeof id !== "string" \|\| id.trim() === ""` | `EventDetailErrorState` (invalid event) |
| 4 | 1859-1873 | `showEventLoading` | Loading spinner SafeAreaView |
| 5 | 1875-1984 | `!event` (with sub-branches) | Privacy gate OR error state |
| 5a | 1881-1938 | `!event` + `isPrivacyRestricted` | `PrivacyRestrictedGate` |
| 5b | 1969-1983 | `!event` + generic error | `EventDetailErrorState` |
| 6 | 1989-1999 | `isBusyBlock && busyMasked && !isMyEvent` | `BusyBlockGate` |

**Total component-scope early returns: 6** (with 2 sub-branches under `!event`)

---

## 3. Render Tree Map

The main render starts at line 2055 and ends at line 2938.

| Section | Lines | Component/Element | Notes |
|---------|-------|-------------------|-------|
| **Root wrapper** | 2056-2058 | `SafeAreaView` + `Stack.Screen` + `StatusBar` | edges=[] |
| **Theme background** | 2060-2066 | `ThemeBackgroundLayers` | Canvas atmosphere |
| **KeyboardAvoidingView** | 2068-2078 | Wraps ScrollView | iOS padding behavior |
| **ScrollView** | 2073-2577 | `Animated.ScrollView` | Main content scroll |
| Hero zone | 2081-2144 | `InviteFlipCard` inside `Animated.View` | ~60 lines of prop drilling |
| Flip-to-reveal gate | 2151-2575 | `View` wrapper with blur overlay | Conditional blur for non-flipped |
| Host action card | 2162-2201 | `HostActionCard` | ~40 lines of callbacks |
| Join request banner | 2204-2214 | `ConfirmedAttendeeBanner` | Conditional |
| Imported event provenance | 2222-2237 | Inline IIFE | Calendar sync label |
| About card | 2240-2300 | `AboutCard` in card surface | Description, bring list, pitch-in |
| Who's Coming card | 2302-2341 | `WhosComingCard` in card surface | Attendees + social proof |
| Location card | 2343-2440 | Inline IIFE with map + address | Three states: hidden/no-location/full |
| Discussion card | 2442-2503 | `DiscussionCard` + `MemoriesRow` | Comments + memories |
| Event settings | 2506-2541 | `EventSettingsAccordion` | Collapsed by default |
| Host reflection | 2543-2573 | `HostReflectionCard` | Post-event, conditional IIFE |
| **Fixed header** | 2581-2598 | `EventHeroNav` | Absolute positioned over scroll |
| **Sticky RSVP bar** | 2601-2620 | `StickyRsvpBar` | Bottom floating bar for guests |
| **EventModals** | 2622-2885 | `EventModals` mega-component | ~260 lines of props |
| **ShareFlyerSheet** | 2888-2912 | `ShareFlyerSheet` | Flyer generation |
| **InviteViaTextSheet** | 2915-2922 | `InviteViaTextSheet` | SMS invite |
| **ShareToFriendsSheet** | 2925-2936 | `ShareToFriendsSheet` | In-app sharing |

---

## 4. State Audit

### useState (35 instances)

| Line | State Variable | Type | Drives | Could Colocate? |
|------|---------------|------|--------|-----------------|
| 144 | showMap | boolean | Unused (dead code) | **Remove** |
| 145 | showSyncModal | boolean | Calendar sync modal | EventModals |
| 146 | commentText | string | Comment input | DiscussionCard |
| 147 | commentImage | string\|null | Comment image | DiscussionCard |
| 148 | isUploadingImage | boolean | Comment image upload | DiscussionCard |
| 149 | showInterestedUsers | boolean | Interested list toggle | WhosComingCard |
| 150 | selectedReminders | number[] | Reminder selection | EventSettingsAccordion |
| 151 | showSummaryModal | boolean | Summary modal | EventModals |
| 152 | showDeleteCommentConfirm | boolean | Delete comment confirm | EventModals |
| 153 | commentToDelete | string\|null | Comment deletion target | EventModals |
| 154 | showRemoveRsvpConfirm | boolean | Remove RSVP confirm | EventModals |
| 155 | showDeleteEventConfirm | boolean | Delete event confirm | EventModals |
| 156 | showRemoveImportedConfirm | boolean | Remove imported confirm | EventModals |
| 157 | isSynced | boolean | Calendar sync state | EventSettingsAccordion |
| 158 | isSyncing | boolean | Calendar sync loading | EventSettingsAccordion |
| 159 | isCheckingSync | boolean | Calendar sync check | EventSettingsAccordion |
| 164 | rsvpPromptChoice | RsvpPromptChoice | Post-RSVP modal arbitration | EventModals |
| 167 | showReportModal | boolean | Report modal | EventModals |
| 168 | selectedReportReason | EventReportReason\|null | Report form | EventModals |
| 169 | reportDetails | string | Report form | EventModals |
| 170 | isSubmittingReport | boolean | Report form | EventModals |
| 173 | showEventActionsSheet | boolean | Options sheet | EventModals |
| 174 | showShareFlyerSheet | boolean | Share flyer sheet | ShareFlyerSheet |
| 175 | showShareToFriendsSheet | boolean | Share to friends sheet | ShareToFriendsSheet |
| 176 | showInviteViaTextSheet | boolean | Invite via text sheet | InviteViaTextSheet |
| 179 | showAttendeesModal | boolean | Attendees sheet | EventModals |
| 182 | showColorPicker | boolean | Color picker sheet | EventModals |
| 187 | liveActivityActive | boolean\|null | Live Activity toggle | EventSettingsAccordion |
| 188 | liveActivitySupported | boolean | Live Activity feature flag | EventSettingsAccordion |
| 201 | settingsExpanded | boolean | Settings accordion | EventSettingsAccordion |
| 204 | rsvpSavedVisible | boolean | RSVP micro-interaction | StickyRsvpBar |
| 212 | liveChipText | string\|null | Live chip text | Unused in render? |
| 219 | showPhotoSheet | boolean | Photo sheet | EventModals |
| 220 | uploadingPhoto | boolean | Photo upload loading | PhotoNudge |
| 222 | photoNudgeDismissed | boolean | Photo nudge dismiss | InviteFlipCard (via photoNudge prop) |
| 223 | descriptionExpanded | boolean | Description toggle | AboutCard |
| 224 | showMemoriesExpanded | boolean | Memories expand | MemoriesRow |
| 227 | contentRevealed | boolean | Flip-to-reveal gate | Blur overlay |
| 228 | hasBeenFlipped | boolean | Flip tracking | InviteFlipCard |

**Key finding:** ~15 of these states are pure modal visibility toggles that could be managed by a single modal state machine or pushed into child components.

### useRef (10 instances)

| Line | Ref | Purpose |
|------|-----|---------|
| 190 | liveActivityManuallyDismissed | Prevents auto-restart after manual dismiss |
| 193-198 | liveActivityAutoStartRef | Bridges derived data to useFocusEffect |
| 205 | rsvpSavedTimer | Timeout cleanup for RSVP micro-interaction |
| 213 | liveChipTimer | Timeout cleanup for live chip |
| 214 | prevCommentCount | Comment count delta detection |
| 221 | pickerLaunching | Prevents double photo picker launch |
| 239 | pageViewFired | Dedup page view analytics |
| 281 | heroTitleOpacity | RNAnimated value |
| 282 | heroTitleTranslateY | RNAnimated value |
| 283 | heroLoadedUrl | Prevents re-animation on same URL |

---

## 5. Effect Audit

| # | Line | Type | Deps | What It Does | Perf Risk |
|---|------|------|------|-------------|-----------|
| 1 | 287 | useEffect | `[id]` | Track page view (once per mount) | None (deduped by ref) |
| 2 | 302 | useEffect | `[id]` | Check calendar sync status | None |
| 3 | 311 | useEffect | `[id]` | Check photo nudge dismissed | None |
| 4 | 332 | useFocusEffect | `[id]` | Check Live Activity support (iOS) | None |
| 5 | 353 | useFocusEffect | `[id]` | Auto-start Live Activity on focus | None (ref-guarded) |
| 6 | 407 | useFocusEffect | `[id, bootStatus, queryClient]` | Refetch event on focus | None |
| 7 | 666 | useFocusEffect | `[comments.length]` | Show "recently active" chip | Low (runs on comment count change) |
| 8 | 712 | useEffect | `[event?.eventPhotoUrl]` | Reset hero animation on photo change | None |
| 9 | 931 | React.useEffect | `[showAttendeesModal, ...query states]` | DEV: log roster fetch state | **DEV-only, 5 deps** |
| 10 | 945 | React.useEffect | `[showAttendeesModal]` | Force refetch on sheet open | Low (intentional) |
| 11 | 1012 | React.useEffect | `[id, ...capacity fields]` | DEV: log capacity counts | DEV-only |
| 12 | 1027 | React.useEffect | `[id, effectiveGoingCount, ...]` | DEV: log who's coming count | DEV-only |
| 13 | 1671 | useEffect | `[id, myRsvpData]` | DEV: RSVP convergence guard | DEV-only |
| 14 | 1687 | useEffect | `[id, attendeesQuery.data, ...]` | DEV: attendee convergence guard | DEV-only |
| 15 | 1703 | useEffect | `[]` | DEV: hook order proof log | DEV-only, mount-only |

**Key finding:** 7 of 15 effects are DEV-only logging. They don't run in production but add cognitive load. No Skia-frame-rate risks found.

---

## 6. Extraction Candidates

### Candidate 1: `useEventDetailData` (Custom Hook)

- **Responsibility:** All data fetching, derived state, and query logic
- **Lines:** 511-1060 (~550 lines)
- **Extract:** useQuery x7, useInfiniteQuery x1, useMemo x2, useLoadedOnce, all derived constants (event, eventMeta, fb, attendeesList, effectiveGoingCount, etc.)
- **Props in:** `id`, `bootStatus`, `session`, `showAttendeesModal`
- **Returns:** `{ event, eventMeta, fb, isPrivacyRestricted, showEventLoading, comments, attendeesList, effectiveGoingCount, myRsvpStatus, groupedRsvpsData, muteData, friendIdSet, ... }`
- **State ownership:** No useState — pure derived data from queries
- **Impact:** Removes ~550 lines and 10+ hooks from component body

### Candidate 2: `useEventMutations` (Custom Hook)

- **Responsibility:** All mutation hooks + their handlers
- **Lines:** 688-1667 (selectively ~400 lines of mutation definitions), 1460-1547 (handleRsvp), 1717-1828 (handlers)
- **Extract:** useMutation x8, handleRsvp, confirmRemoveRsvp, handlePostComment, handleDeleteComment, confirmDeleteComment, submitEventReport, handleJoinRequestAction
- **Props in:** `id`, `event`, `session`, `queryClient`, `bootStatus`, `myRsvpStatus`, `effectiveGoingCount`, `eventMeta`, `isBusyBlock`, `isMyEvent`, `fb`, `locationDisplay`
- **Callbacks out:** All handle* functions, all mutation objects
- **State ownership:** `rsvpPromptChoice`, `rsvpSavedVisible`, `liveChipText`, `showRemoveRsvpConfirm`, `commentText`, `commentImage`, `isUploadingImage`, `showReportModal`, `selectedReportReason`, `reportDetails`, `isSubmittingReport`
- **Impact:** Removes ~600 lines and 8 mutations from component body

### Candidate 3: `EventContentCards` (Component)

- **Responsibility:** The scrollable content area between hero and footer
- **Lines:** 2149-2575 (~425 lines)
- **Extract:** Flip-to-reveal gate, HostActionCard, ConfirmedAttendeeBanner, imported event provenance, AboutCard wrapper, WhosComingCard wrapper, Location card, DiscussionCard + MemoriesRow, EventSettingsAccordion, HostReflectionCard
- **Props in:** `event`, `isMyEvent`, `isBusyBlock`, `isDark`, `colors`, `themeColor`, `myRsvpStatus`, `effectiveGoingCount`, `attendeesList`, `comments`, `eventMeta`, `locationDisplay`, `shouldBlurDetails`, `contentRevealed`, `cardSurfaceBg`, `friendIdSet`, + ~20 callbacks/setters
- **Callbacks out:** All card-level interactions (RSVP, share, comment, etc.)
- **Impact:** Reduces render JSX by ~425 lines. **Risk:** High prop count (~30+), may need context.

### Candidate 4: `EventBottomSheets` (Component)

- **Responsibility:** All bottom sheets and modals (currently partially extracted as `EventModals`)
- **Lines:** 2622-2936 (~315 lines of prop passing)
- **Extract:** EventModals + ShareFlyerSheet + InviteViaTextSheet + ShareToFriendsSheet
- **Props in:** Subset of current EventModals props + sheet-specific data
- **State ownership:** All `show*Sheet` booleans could move here if using internal state
- **Impact:** Already partially extracted. Full extraction would reduce prop drilling.

### Candidate 5: `useLiveActivity` (Custom Hook)

- **Responsibility:** Live Activity state, support detection, auto-start, toggle
- **Lines:** 187-188, 190-198, 332-404, portions of rsvpMutation.onSuccess (1278-1308), EventModals callback (2742-2768)
- **Extract:** `liveActivityActive`, `liveActivitySupported`, `liveActivityManuallyDismissed` ref, `liveActivityAutoStartRef`, 2 useFocusEffects, toggle handler
- **Props in:** `id`, `event`, `isMyEvent`, `myRsvpStatus`, `effectiveGoingCount`, `locationDisplay`
- **Returns:** `{ liveActivityActive, liveActivitySupported, toggleLiveActivity, canToggle, subtitle }`
- **Impact:** Removes 2 useFocusEffects, 2 useState, 2 useRef, ~100 lines scattered code

### Candidate 6: `useCalendarSync` (Custom Hook)

- **Responsibility:** Calendar sync state + handler
- **Lines:** 157-159, 302-310, 418-488
- **Extract:** `isSynced`, `isSyncing`, `isCheckingSync`, calendar permission flow, sync handler
- **Props in:** `id`, `event`, `locationDisplay`, `router`
- **Returns:** `{ isSynced, isSyncing, isCheckingSync, handleSyncToCalendar }`
- **Impact:** Removes 3 useState, 1 useEffect, ~80 lines

---

## 7. Risks

### 7.1 Stale Closures in rsvpMutation.onSuccess
The RSVP mutation's `onSuccess` (lines 1220-1365) captures `event`, `myRsvpStatus`, `effectiveGoingCount`, `liveActivityActive`, `liveActivitySupported`, `locationDisplay`, `bootStatus`, `session` from the closure. These values are from the render when `mutate()` was called. The `liveActivityAutoStartRef` pattern (line 1079-1085) was introduced to work around exactly this class of bug. Extracting the mutation without preserving closure behavior could regress Live Activity auto-start.

### 7.2 Shared Refs Between Hooks and Handlers
- `liveActivityAutoStartRef` is written every render (line 1080-1085) and read by `useFocusEffect` (line 353). Moving the ref to a custom hook requires ensuring the write happens in the same render cycle.
- `pickerLaunching` ref is shared between `launchEventPhotoPicker` callback and the photo picker flow. Simple to extract but must stay in the same closure scope.
- `prevCommentCount` ref bridges `useFocusEffect` (line 666) and the comments query. Must colocate with the effect.

### 7.3 Animation Values
- `rsvpButtonScale` (useSharedValue) + `rsvpButtonAnimStyle` (useAnimatedStyle) are used in `handleRsvp` (line 1521-1523) and would need to be passed to `StickyRsvpBar`. Currently rsvpButtonAnimStyle appears unused in the render tree (it's defined but not passed anywhere visible) -- verify before extracting.
- `heroTitleOpacity` / `heroTitleTranslateY` (RNAnimated.Value refs) are reset by an effect (line 712) but don't appear in the render tree. Possibly dead code from a prior extraction of `EventHeroNav`.

### 7.4 Keyboard Handling
`KeyboardAvoidingView` wraps the entire ScrollView (line 2068-2072). The `DiscussionCard` comment input lives deep in the scroll content. Extracting `EventContentCards` must preserve the keyboard avoidance chain -- the KAV must remain an ancestor of the comment TextInput.

### 7.5 Deep Link / Share Intent
No explicit deep link handler found in this file (handled upstream by Expo Router). The `from` and `discoverSource` params are read once at mount. Safe to extract.

### 7.6 Modal State Coordination
The RSVP prompt arbitration (lines 1310-1363) sets `rsvpPromptChoice` based on async eligibility checks. This state drives `EventModals`. If mutations and modals are extracted to different hooks/components, they need a shared state channel (context, prop drilling, or callback).

### 7.7 Dead Code Candidates
- `showMap` (line 144): setter is `_setShowMap` (unused). Never set to true anywhere.
- `heroTitleOpacity` / `heroTitleTranslateY` (lines 281-282): reset by effect but not visibly used in JSX.
- `rsvpButtonAnimStyle` (line 207): defined but may not be applied anywhere in the current render tree.
- `liveChipText` (line 212): set in multiple places but usage in render tree not visible in current code (may be passed via EventHeroNav or similar).

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total lines | 2939 |
| Hooks (total) | ~52 |
| useState | 35 |
| useQuery/useInfiniteQuery | 8 |
| useMutation | 8 |
| useEffect/useFocusEffect | 15 |
| useMemo | 2 |
| useCallback | 2 |
| useRef | 10 |
| Early returns | 6 |
| Hooks below early returns | **0** |
| DEV-only effects | 7 |
| Dead state variables | 1-3 (needs verification) |
| Lines in render JSX | ~885 (2055-2939) |
| Lines in hooks+state | ~1155 (124-1278) |
| Lines in handlers | ~550 (1460-1999) |
