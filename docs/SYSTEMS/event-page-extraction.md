# Event Page Extraction Spec

> Incremental decomposition of `src/app/event/[id].tsx` (~5371 lines) into presentational components.
> Each extraction is one commit, independently shippable. No big-bang refactor.

---

## Purpose

The file is too large: every state change reconciles the entire tree, CLI tasks burn excessive tokens reading it, and the 4+ early returns constraint means hooks pile up at the top indefinitely. Goal: reduce the parent to ~1200–1500 lines of hooks, state, effects, early returns, and component composition.

## Current Behavior

Single-file screen component containing all hooks, state, mutations, queries, handlers, early return gates, and ~3800 lines of JSX rendering. All presentational sections read directly from the parent scope.

## Target Behavior

Parent retains: route params, hooks, queries, mutations, state, effects, derived values, early returns, handler functions, and a clean composition return. Each extracted component is a pure presentational function that receives props + handler callbacks.

---

## A. Extraction Candidates

| # | Section | Lines | Count | Complexity | Order |
|---|---------|-------|-------|------------|-------|
| 1 | Sticky RSVP Bar | 4429–4554 | 125 | Low | 1 |
| 2 | Report Modal | 5003–5110 | 107 | Low | 2 |
| 3 | Calendar Sync Modal | 4556–4643 | 87 | Low | 3 |
| 4 | Event Actions Bottom Sheet | 4730–5001 | 271 | Medium | 4 |
| 5 | Attendees Bottom Sheet | 5112–5221 | 109 | Low | 5 |
| 6 | Color Picker Bottom Sheet | 5223–5320 | 97 | Low | 6 |
| 7 | Photo Upload Sheet | 5322–5368 | 46 | Low | 7 |
| 8 | Host Tools Row | 3228–3317 | 89 | Low | 8 |
| 9 | Post-Create Invite Nudge | 2764–2856 | 92 | Low | 9 |
| 10 | Discussion Card (comments) | 3855–4075 | 220 | Medium | 10 |
| 11 | About Card (desc + details + pitch-in + bring list) | 3319–3619 | 300 | High | 11 |
| 12 | Who's Coming Card | 3621–3853 | 232 | Medium | 12 |
| 13 | Primary Action Bar (RSVP buttons + status + success prompt + find friends) | 2857–3226 | 369 | High | 13 |
| 14 | Event Settings Accordion | 4162–4329 | 167 | Medium | 14 |
| 15 | Host Reflection Card | 4331–4425 | 94 | Low | 15 |
| 16 | Memories Row | 4077–4160 | 83 | Low | 16 |
| 17 | Atmospheric Zone (hero backdrop + nav + InviteFlipCard) | 2544–2762 | 218 | High | 17 |
| 18 | Privacy-Restricted Gate | 2074–2234 | 160 | Medium | 18 |
| 19 | Busy Block Gate | 2281–2318 | 37 | Low | 19 |

**Total extractable:** ~3293 lines across 19 candidates.

---

## B. Dependency Map

### 1. Sticky RSVP Bar (4429–4554)
- **Props:** `showStickyRsvp`, `effectiveGoingCount`, `eventMeta.isFull`, `myRsvpStatus`, `rsvpMutation.isPending`, `screenWidth`, `insets`, `isDark`, `colors`
- **Callbacks:** `handleRsvp`
- **Internal state:** None
- **Icons:** `Check`, `Heart`, `Users`

### 2. Report Modal (5003–5110)
- **Props:** `showReportModal`, `selectedReportReason`, `reportDetails`, `isSubmittingReport`, `themeColor`, `colors`
- **Callbacks:** `setShowReportModal`, `setSelectedReportReason`, `setReportDetails`, `submitEventReport`
- **Internal state:** None (state already in parent)
- **Icons:** None

### 3. Calendar Sync Modal (4556–4643)
- **Props:** `showSyncModal`, `event` (title, description, location, startTime, endTime), `locationDisplay`, `colors`
- **Callbacks:** `setShowSyncModal`, `openGoogleCalendar`, `addToDeviceCalendar`
- **Internal state:** None

### 4. Event Actions Bottom Sheet (4730–5001)
- **Props:** `showEventActionsSheet`, `isMyEvent`, `event` (isBusy, isImported, eventPhotoUrl, themeId, startTime, endTime, id, title, emoji), `locationDisplay`, `isBusyBlock`, `myRsvpStatus`, `effectiveGoingCount`, `liveActivityActive`, `liveActivitySupported`, `currentColorOverride`, `isDark`, `colors`, `themeColor`, `id`
- **Callbacks:** `setShowEventActionsSheet`, `shareEvent`, `handleReportEvent`, `handleDuplicateEvent`, `launchEventPhotoPicker`, `setShowDeleteEventConfirm`, `setShowRemoveImportedConfirm`, `setShowColorPicker`, `startLiveActivity`, `endLiveActivity`, `setLiveActivityActive`, `liveActivityManuallyDismissed` (ref)
- **Internal state:** None
- **Icons:** `Pencil`, `Copy`, `Camera`, `Share2`, `Bell`, `AlertTriangle`, `Palette`, `Trash2`
- **Risk:** Live Activity toggle logic is complex with async operations

### 5. Attendees Bottom Sheet (5112–5221)
- **Props:** `showAttendeesModal`, `isLoadingAttendees`, `attendeesError`, `attendeesPrivacyDenied`, `attendeesList`, `effectiveGoingCount`, `event` (user), `isDark`, `colors`, `themeColor`, `id`
- **Callbacks:** `setShowAttendeesModal`, `attendeesQuery.refetch`, `router.push`
- **Internal state:** None
- **Icons:** `UserCheck`, `X`, `AlertTriangle`, `Users`, `RefreshCw`
- **Imports:** `UserListRow`

### 6. Color Picker Bottom Sheet (5223–5320)
- **Props:** `showColorPicker`, `currentColorOverride`, `isBusyBlock`, `id`, `isDark`, `colors`, `themeColor`
- **Callbacks:** `setShowColorPicker`, `setOverrideColor`, `resetColor`
- **Internal state:** None
- **Imports:** `COLOR_PALETTE`

### 7. Photo Upload Sheet (5322–5368)
- **Props:** `showPhotoSheet`, `event` (eventPhotoUrl), `uploadingPhoto`, `isDark`, `colors`, `themeColor`, `id`
- **Callbacks:** `setShowPhotoSheet`, `launchEventPhotoPicker`, `api.put` (remove photo), `invalidateEventMedia`
- **Internal state:** None
- **Icons:** `Camera`, `Trash2`, `X`

### 8. Host Tools Row (3228–3317)
- **Props:** `isMyEvent`, `event` (isBusy, title, bringListEnabled, bringListItems, pitchInEnabled, pitchInHandle, pitchInMethod, location, startTime, endTime, id), `locationDisplay`, `isDark`, `colors`, `themeColor`, `id`
- **Callbacks:** `shareEvent`, `buildShareInput`, `buildEventReminderText`, `trackInviteShared`, `trackShareTriggered`, `router.push`
- **Internal state:** None
- **Icons:** `Share2`, `Copy`, `Pencil`, `HandCoins`, `ListChecks`

### 9. Post-Create Invite Nudge (2764–2856)
- **Props:** `showCreateNudge`, `isMyEvent`, `event` (id, emoji, title, startTime, endTime, location), `locationDisplay`, `isDark`, `colors`, `themeColor`, `session`
- **Callbacks:** `setShowCreateNudge`, `shareEvent`, `buildShareInput`, `buildEventSmsBody`, `trackShareTriggered`, `getEventUniversalLink`
- **Internal state:** None
- **Icons:** `X`, `Copy`, `MessageCircle`, `Share2`

### 10. Discussion Card (3855–4075)
- **Props:** `comments`, `isLoadingComments`, `commentText`, `commentImage`, `isUploadingImage`, `createCommentMutation.isPending`, `isMyEvent`, `event` (id, title, description, location, startTime, endTime, visibility, joinRequests), `session`, `isDark`, `colors`, `themeColor`
- **Callbacks:** `setCommentText`, `setCommentImage`, `handlePickImage`, `handlePostComment`, `handleDeleteComment`, `router.push`
- **Internal state:** None (comment text/image state in parent)
- **Icons:** `MessageCircle`, `ImagePlus`, `X`, `Trash2`
- **Imports:** `EntityAvatar`, `ExpoImage`, `getDiscussionPrompts`, `inferEventTags`
- **Risk:** Discussion prompts IIFE; comment list with per-item animations

### 11. About Card (3319–3619)
- **Props:** `event` (description, location, startTime, endTime, pitchInEnabled, pitchInHandle, pitchInMethod, pitchInAmount, pitchInNote, bringListEnabled, bringListItems, lat, lng, latitude, longitude), `locationDisplay`, `descriptionExpanded`, `isMyEvent`, `session`, `isDark`, `colors`, `themeColor`, `bringListClaimMutation`
- **Callbacks:** `setDescriptionExpanded`, `openEventLocation`, `bringListClaimMutation.mutate`
- **Internal state:** `descriptionExpanded` could move inside
- **Icons:** `MapPin`, `Clock`, `Compass`, `HandCoins`, `ListChecks`, `Copy`, `Check`
- **Risk:** Bring list claim mutation interaction; IIFE for bring list rendering

### 12. Who's Coming Card (3621–3853)
- **Props:** `attendeesList`, `effectiveGoingCount`, `attendeesPrivacyDenied`, `isMyEvent`, `event` (user, joinRequests), `session`, `isDark`, `colors`, `themeColor`, `addHostMutation`
- **Callbacks:** `setShowAttendeesModal`, `router.push`
- **Internal state:** None
- **Icons:** `Lock`, `Users`, `UserPlus`, `ArrowRight`
- **Imports:** `EntityAvatar`

### 13. Primary Action Bar (2857–3226)
- **Props:** `isMyEvent`, `event` (isBusy, id, emoji, title, startTime, endTime, location, visibility, circleId), `hasJoinRequest`, `myRsvpStatus`, `showRsvpOptions`, `rsvpMutation.isPending`, `effectiveGoingCount`, `attendeesList`, `totalGoing`, `showRsvpSuccessPrompt`, `showCreateNudge`, `findFriendsNudgeDismissed`, `rsvpButtonAnimStyle`, `rsvpSavedVisible`, `session`, `isDark`, `colors`, `themeColor`, `locationDisplay`, `id`
- **Callbacks:** `handleRsvp`, `setShowRsvpOptions`, `setShowRemoveRsvpConfirm`, `shareEvent`, `trackRsvpShareClicked`, `trackShareTriggered`, `trackRsvpSuccessPromptTap`, `trackInviteShared`, `setShowRsvpSuccessPrompt`, `setFindFriendsNudgeDismissed`, `router.push`
- **Internal state:** None (all state in parent)
- **Icons:** `Check`, `Heart`, `X`, `Share2`, `UserPlus`
- **Imports:** `EntityAvatar`
- **Risk:** Most complex section — multiple conditional blocks (hasJoinRequest, myRsvpStatus, showRsvpOptions, success prompt, find friends nudge). Consider splitting into sub-components after initial extraction.

### 14. Event Settings Accordion (4162–4329)
- **Props:** `settingsExpanded`, `event` (id, title, emoji, startTime, endTime, reflectionEnabled), `isSynced`, `isSyncing`, `isCheckingSync`, `selectedReminders`, `isEventMuted`, `isLoadingMute`, `muteMutation.isPending`, `isMyEvent`, `isBusyBlock`, `toggleReflectionMutation.isPending`, `isDark`, `colors`, `themeColor`, `startDate`, `myRsvpStatus`
- **Callbacks:** `setSettingsExpanded`, `handleSyncToCalendar`, `setShowSyncModal`, `setSelectedReminders`, `muteMutation.mutate`, `toggleReflectionMutation.mutate`
- **Internal state:** `settingsExpanded` could move inside
- **Imports:** `EventReminderPicker`

### 15. Host Reflection Card (4331–4425)
- **Props:** `isMyEvent`, `event` (isBusy, endTime, summary, summaryRating, reflectionEnabled), `startDate`, `isDark`, `colors`, `themeColor`, `toggleReflectionMutation.isPending`
- **Callbacks:** `setShowSummaryModal`, `toggleReflectionMutation.mutate`
- **Internal state:** None
- **Icons:** `NotebookPen`, `Star`, `Pencil`

### 16. Memories Row (4077–4160)
- **Props:** `event` (id, title), `isMyEvent`, `showMemoriesExpanded`, `startDate`, `isDark`, `colors`, `themeColor`, `queryClient` (for photos query)
- **Callbacks:** `setShowMemoriesExpanded`
- **Internal state:** `showMemoriesExpanded` could move inside
- **Imports:** `EventPhotoGallery`, `ExpoImage`
- **Icons:** `Camera`, `ChevronRight`

### 17. Atmospheric Zone (2544–2762)
- **Props:** `event` (eventPhotoUrl, isBusy, visibility, title, emoji, themeId, customThemeData, id, user, description, startTime, endTime, effectId, customEffectConfig, location), `eventBannerUri`, `canvasColor`, `pageTheme`, `isDark`, `colors`, `themeColor`, `insets`, `screenWidth`, `isMyEvent`, `eventMeta`, `effectiveGoingCount`, `attendeesList`, `countdownLabel`, `dateLabel`, `timeLabel`, `locationDisplay`, `photoNudgeDismissed`, `uploadingPhoto`, `heroTitleOpacity`, `heroTitleTranslateY`, `editScale`, `id`
- **Callbacks:** `router.back`, `router.replace`, `setShowEventActionsSheet`, `setShowPhotoSheet`, `launchEventPhotoPicker`, `setPhotoNudgeDismissed`
- **Internal state:** None
- **Imports:** `InviteFlipCard`, `ExpoImage`, `LinearGradient`, `BlurView`, `HeroBannerSurface`
- **Risk:** Highest complexity — nav bar, blurred backdrop, floating card, photo nudge. Many props. Consider this as a late extraction or split into nav + backdrop + card.

### 18. Privacy-Restricted Gate (2074–2234)
- **Props:** `fb` (restricted, hostId, hostName, hostImage, hostFirst, hostDisplayName, denyReason, circleId), `colors`, `isDark`, `addHostMutation`
- **Callbacks:** `router.push`, `router.back`
- **Internal state:** None
- **Imports:** `EntityAvatar`, `Button`
- **Icons:** `Lock`
- **Note:** This is an early return — extraction means the parent calls `if (condition) return <PrivacyGate ... />`

### 19. Busy Block Gate (2281–2318)
- **Props:** `colors`, `isDark`
- **Callbacks:** `router.back`, `router.replace`
- **Internal state:** None
- **Icons:** `Lock`
- **Note:** Early return. Simplest extraction — minimal props.

---

## C. Recommended Extraction Order

**Phase 1 — Modals & Sheets (low risk, high line savings, zero cross-deps)**
1. Sticky RSVP Bar (125 lines)
2. Report Modal (107 lines)
3. Calendar Sync Modal (87 lines)
4. Event Actions Bottom Sheet (271 lines)
5. Attendees Bottom Sheet (109 lines)
6. Color Picker Bottom Sheet (97 lines)
7. Photo Upload Sheet (46 lines)

**Phase 2 — Content Sections (medium risk, independent of each other)**
8. Host Tools Row (89 lines)
9. Post-Create Invite Nudge (92 lines)
10. Discussion Card (220 lines)
11. About Card (300 lines)
12. Who's Coming Card (232 lines)

**Phase 3 — Complex Sections (higher risk, more props)**
13. Primary Action Bar (369 lines)
14. Event Settings Accordion (167 lines)
15. Host Reflection Card (94 lines)
16. Memories Row (83 lines)

**Phase 4 — Early Returns & Hero (highest risk)**
17. Atmospheric Zone (218 lines)
18. Privacy-Restricted Gate (160 lines)
19. Busy Block Gate (37 lines)

**Rationale:** Modals/sheets are rendered outside the scroll content, have minimal prop surfaces, and can't affect layout. Content sections are independent of each other. Complex sections have many props and conditional rendering. Early returns require careful handling since they short-circuit the entire render.

---

## D. Parent Component Projection

After all 19 extractions:

| Section | Estimated Lines |
|---------|----------------|
| Imports | 100 |
| Module-level helpers (openEventLocation, formatDateForCalendar, openGoogleCalendar, addToDeviceCalendar, buildShareInput, shareEvent, EventDetailErrorState) | 200 |
| Component declaration + hooks + state | 350 |
| Queries + mutations | 350 |
| Effects + derived values | 200 |
| Early return gates (loading, error, session) | 60 |
| Composition return (JSX wiring) | 200 |
| **Total** | **~1460 lines** |

Reduction: 5371 → ~1460 (72% reduction).

Module-level helpers (openGoogleCalendar, addToDeviceCalendar, formatDateForCalendar) can be moved to utility files in a future pass but are not part of this spec.

---

## E. File Structure

**Recommendation:** `src/components/event/` (new directory)

```
src/components/event/
  StickyRsvpBar.tsx
  ReportModal.tsx
  CalendarSyncModal.tsx
  EventActionsSheet.tsx
  AttendeesSheet.tsx
  ColorPickerSheet.tsx
  PhotoUploadSheet.tsx
  HostToolsRow.tsx
  PostCreateNudge.tsx
  DiscussionCard.tsx
  AboutCard.tsx
  WhosComingCard.tsx
  PrimaryActionBar.tsx
  EventSettingsAccordion.tsx
  HostReflectionCard.tsx
  MemoriesRow.tsx
  AtmosphericZone.tsx
  PrivacyRestrictedGate.tsx
  BusyBlockGate.tsx
```

**Rationale:** These components are event-page-specific and not reused elsewhere. A dedicated directory prevents polluting the flat `src/components/` namespace. Co-location with `event/[id].tsx` is not possible in Expo Router (files in `src/app/event/` are treated as routes).

---

## F. Doctrine / Rules

1. **Props-only contract.** Extracted components must not import `useSession`, `useTheme`, `useQuery`, or any global hook. All data comes via props.
2. **Handlers as callbacks.** Parent defines all handlers; extracted components receive them as `onX` props. No duplicated business logic.
3. **One extraction = one commit.** Each extraction is independently shippable and testable. The parent still works if only some extractions are done.
4. **Composition readability.** After extraction, the parent JSX return should read like a table of contents: `<AtmosphericZone ... />`, `<PostCreateNudge ... />`, `<PrimaryActionBar ... />`, etc.
5. **No behavior changes.** Extractions are pure refactors — no user-visible behavior, layout, or timing changes.
6. **Internal state promotion.** Where a piece of state (e.g., `descriptionExpanded`, `settingsExpanded`, `showMemoriesExpanded`) is only used within one extracted section, it should move into the extracted component. This reduces parent state count.
7. **Type the props interface.** Each extracted component gets an explicit `Props` interface. No `any` types for callbacks.

---

## Risks / Invariants

- **Hook ordering.** All hooks must remain above early returns in the parent. Extractions don't move hooks — they only move JSX. No risk.
- **Animation refs.** `rsvpButtonScale`, `rsvpButtonAnimStyle`, `heroTitleOpacity`, `heroTitleTranslateY`, `editScale` are used in specific sections. These can be passed as props or the useSharedValue/useRef can be moved into the extracted component if only used there.
- **IIFE closures.** Several sections use `(() => { ... })()` patterns (bring list, who's coming, memories, host tools, reflection). These should be converted to normal component bodies during extraction.
- **Mutation objects as props.** Some sections need `rsvpMutation.isPending` or `bringListClaimMutation.mutate`. Pass the specific fields needed (e.g., `isPending: boolean`, `onClaim: (id) => void`), not the full mutation object.
- **Primary Action Bar complexity.** At 369 lines with 5+ conditional blocks, this is the riskiest single extraction. Consider splitting into sub-components (RsvpStatusDisplay, RsvpButtonGroup, RsvpSuccessPrompt, FindFriendsNudge, SocialProofRow) after the initial extraction.
- **Atmospheric Zone breadth.** 23+ props makes this extraction unwieldy. Consider splitting into NavBar + HeroSection after initial extraction, or extracting it last.
