# Circle Page Extraction Spec

> **STATUS: SPEC** — Extraction candidates identified. No extractions started.
> File: `src/app/circle/[id].tsx` — **4,331 lines**.
> Target: ~2,200 lines after all extractions (~49% reduction).

---

## Purpose

The circle detail screen is the largest file in the codebase. It combines chat messaging, member management, scheduling coordination (availability, polls, plan lock, lifecycle), and a full settings surface. Extractions will reduce cognitive load and token cost without changing behavior.

---

## Current State

**Total:** 4,331 lines.

| Section | Lines | Range |
|---------|------:|-------|
| Imports + icon components | 115 | 1–115 |
| Hooks, state, queries, mutations, effects, callbacks | ~1,521 | 116–1,636 |
| Loading gate (early returns) | 24 | 1,637–1,660 |
| DEV QA helpers (post-gate) | 106 | 1,662–1,766 |
| Derived values | 3 | 1,767–1,769 |
| JSX return (header, calendar, chat, modals, sheets, overlays) | ~2,562 | 1,770–4,331 |

High-level JSX structure:
- Floating BlurView header chrome
- KeyboardAvoidingView containing: calendar toggle, mini calendar, lifecycle chips, availability strip, poll strip, next-event anchor, FlatList (messages), floating indicators, reply bar, message input
- 8 modals/sheets (Add Members, Friend Suggestion, Availability Roster, Plan Lock, Poll Detail, Circle Settings, Notification Level, Members)
- 3 confirmation/action modals (Remove Member, Create Event, Paywall)
- 2 overlays (Edit Message, Reaction Picker)
- DEV QA panel

---

## Extraction Candidates

| # | Section | Line Range | Lines | Complexity | Order |
|---|---------|-----------|------:|:----------:|------:|
| 1 | Add Members Modal | 2748–2900 | 153 | Low | 1 |
| 2 | Friend Suggestion Modal | 2902–2962 | 61 | Low | 2 |
| 3 | Remove Member Confirm Modal | 3966–4060 | 95 | Low | 3 |
| 4 | Create Event Modal | 4062–4125 | 64 | Low | 4 |
| 5 | Edit Message Overlay | 4134–4203 | 70 | Low | 5 |
| 6 | Reaction Picker Overlay | 4205–4264 | 60 | Low | 6 |
| 7 | Availability Roster Sheet | 2964–3049 | 86 | Low | 7 |
| 8 | Plan Lock Sheet | 3051–3150 | 100 | Medium | 8 |
| 9 | Poll Detail Sheet | 3152–3266 | 115 | Medium | 9 |
| 10 | Notification Level Sheet | 3693–3752 | 60 | Low | 10 |
| 11 | Members Sheet | 3754–3964 | 211 | Medium | 11 |
| 12 | Circle Settings Sheet | 3292–3691 | 400 | High | 12 |
| 13 | Header Chrome | 1774–1879 | 106 | Medium | 13 |
| 14 | Next Event Anchor Card | 2113–2216 | 104 | Medium | 14 |
| 15 | Chat Floating Indicators | 2519–2652 | 134 | Medium | 15 |
| 16 | Lifecycle Chips | 1958–2019 | 62 | Low | 16 |

**Total extractable:** ~1,881 lines across 16 components.

---

### Candidate Details

#### 1. Add Members Modal (153 lines)
**Props:** `visible`, `availableFriends: Friendship[]`, `selectedFriends: string[]`, `isPending: boolean`, `colors`, `isDark`, `themeColor`
**Callbacks:** `onClose`, `onToggleFriend(id)`, `onAddMembers`
**Notes:** Self-contained. Uses `UserListRow`, `Button`, `Animated FadeInDown`.

#### 2. Friend Suggestion Modal (61 lines)
**Props:** `visible`, `suggestions: Array<{ newMemberName; newMemberId }>`, `colors`, `themeColor`
**Callbacks:** `onClose`
**Notes:** Pure display modal. No mutations.

#### 3. Remove Member Confirm Modal (95 lines)
**Props:** `visible`, `memberName: string | null`, `isPending: boolean`, `colors`, `isDark`
**Callbacks:** `onCancel`, `onConfirm`
**Notes:** Standard destructive confirmation. Uses `WarningIcon` (Ionicons).

#### 4. Create Event Modal (64 lines)
**Props:** `visible`, `circleId: string`, `colors`, `isDark`, `themeColor`
**Callbacks:** `onClose`, `onCreatePress`
**Notes:** Simple modal with "Circle Only" indicator + Create button.

#### 5. Edit Message Overlay (70 lines)
**Props:** `visible`, `draftContent: string`, `colors`, `isDark`, `themeColor`
**Callbacks:** `onClose`, `onChangeText(text)`, `onSave`
**Notes:** Fullscreen overlay with TextInput. No external deps.

#### 6. Reaction Picker Overlay (60 lines)
**Props:** `visible`, `selectedReactions: string[]`, `colors`, `isDark`
**Callbacks:** `onClose`, `onSelect(emoji)`
**Notes:** Module-level `REACTION_EMOJI` array moves with component.

#### 7. Availability Roster Sheet (86 lines)
**Props:** `visible`, `availTonight: { free; busy; tentative?; unknown; total } | null`, `availMembers: Array<{ userId; name; status }> | null`, `circleMembers` (for avatar lookup), `colors`, `isDark`, `themeColor`
**Callbacks:** `onClose`
**Notes:** Read-only display. Uses `EntityAvatar`.

#### 8. Plan Lock Sheet (100 lines)
**Props:** `visible`, `planLock: { locked; note? } | null`, `draftNote: string`, `isHost: boolean`, `isPending: boolean`, `colors`, `isDark`, `themeColor`
**Callbacks:** `onClose`, `onDraftNoteChange(text)`, `onToggleLock(val)`, `onSave`, `onUnlock`
**Notes:** Switch + TextInput + host-only unlock button.

#### 9. Poll Detail Sheet (115 lines)
**Props:** `visible`, `poll: { id; question; options: Array<{ id; label; count; votedByMe }> } | null`, `planLock: { locked } | null`, `isHost: boolean`, `colors`, `isDark`, `themeColor`
**Callbacks:** `onClose`, `onVote(pollId, optionId)`, `onLockWithWinner(pollId, winnerLabel)`
**Notes:** Vote selection + poll-lock bridge button. Winner highlight logic stays inline.

#### 10. Notification Level Sheet (60 lines)
**Props:** `visible`, `currentLevel: "all" | "decisions" | "mentions" | "mute"`, `colors`, `isDark`, `themeColor`
**Callbacks:** `onClose`, `onSelect(level)`
**Notes:** Radio-style option list. Clean extraction.

#### 11. Members Sheet (211 lines)
**Props:** `visible`, `members`, `availableFriends: Friendship[]`, `selectedFriends: string[]`, `isHost: boolean`, `circleCreatedById: string`, `isPending: boolean`, `colors`, `isDark`, `themeColor`, `insets`
**Callbacks:** `onClose`, `onToggleFriend(id)`, `onAddMembers`, `onRemoveMember(userId)`, `onViewProfile(userId)`
**Notes:** Combined members list + add-members section. Uses `UserListRow`. `once()` DEV log moves with it.

#### 12. Circle Settings Sheet (400 lines)
**Props:** `visible`, `circle: { name; emoji; photoUrl; description; isMuted; createdById }`, `settingsView: "settings" | "photo"`, `isHost: boolean`, `editingDescription: boolean`, `descriptionText: string`, `uploadingPhoto: boolean`, `isMutePending: boolean`, `notifyLevel: string`, `colors`, `isDark`, `themeColor`
**Callbacks:** `onClose`, `onSetView(v)`, `onEditDescription`, `onCancelEditDescription`, `onDescriptionChange(text)`, `onSaveDescription`, `onMuteToggle(val)`, `onShareGroup`, `onOpenMembers`, `onOpenNotifyLevel`, `onLeaveGroup`, `onUploadPhoto`, `onRemovePhoto`
**Complexity:** Two-view sheet (settings + photo). Most props. Consider decomposing into `CircleSettingsSheet` + `CirclePhotoActions` sub-component if too wide.

#### 13. Header Chrome (106 lines)
**Props:** `circle: { name; emoji; photoUrl }`, `members`, `chromeHeight: number`, `topInset: number`, `colors`, `isDark`, `themeColor`
**Callbacks:** `onBack`, `onOpenSettings`, `onCreateEvent`, `onChromeLayout(height)`
**Notes:** BlurView header with avatar stack. `HelpSheet` renders inline.

#### 14. Next Event Anchor Card (104 lines)
**Props:** `event: { id; title; startTime; endTime?; emoji?; location?; color?; eventPhotoUrl?; description? }`, `expanded: boolean`, `colors`, `isDark`, `themeColor`
**Callbacks:** `onToggleExpand`, `onViewEvent(id)`
**Notes:** Collapsible card with date/time derivation. Date formatting logic moves with component.

#### 15. Chat Floating Indicators (134 lines)
**Props:** `showScrollToBottom: boolean`, `unseenCount: number`, `hasFailed: boolean`, `latestFailed: { id; content; clientMessageId } | null`, `typingUserIds: string[]`, `members` (for name lookup), `colors`, `isDark`, `themeColor`
**Callbacks:** `onScrollToBottom`, `onClearUnseenAndScroll`, `onRetryFailed`
**Notes:** Groups: scroll-to-bottom button, new messages pill, failed banner, typing indicator. All positionally `absolute`. Could extract as a single `ChatOverlays` component or individual pieces; single component recommended since they share positioning context.

#### 16. Lifecycle Chips (62 lines)
**Props:** `lifecycleState: string | null`, `lifecycleNote: string | null`, `planLockNote: string | null`, `completionDismissed: boolean`, `colors`, `isDark`
**Callbacks:** `onOpenPlanLock`, `onRunItBack`, `onDismissCompletion`
**Notes:** Finalized chip + completion prompt. Two small conditional blocks.

---

## Recommended Extraction Order

### Phase 1 — Modals & Overlays (6 extractions, ~503 lines)
Low risk, self-contained, no dependencies between them.

1. **Add Members Modal** → `CircleAddMembersModal.tsx`
2. **Friend Suggestion Modal** → `CircleFriendSuggestionModal.tsx`
3. **Remove Member Confirm Modal** → `CircleRemoveMemberModal.tsx`
4. **Create Event Modal** → `CircleCreateEventModal.tsx`
5. **Edit Message Overlay** → `CircleEditMessageOverlay.tsx`
6. **Reaction Picker Overlay** → `CircleReactionPicker.tsx`

### Phase 2 — Bottom Sheets (5 extractions, ~472 lines)
Each uses `BottomSheet` primitive. Independent.

7. **Availability Roster Sheet** → `CircleAvailabilitySheet.tsx`
8. **Plan Lock Sheet** → `CirclePlanLockSheet.tsx`
9. **Poll Detail Sheet** → `CirclePollSheet.tsx`
10. **Notification Level Sheet** → `CircleNotifyLevelSheet.tsx`
11. **Members Sheet** → `CircleMembersSheet.tsx`

### Phase 3 — Content Sections (4 extractions, ~406 lines)
Integrated into the main scroll. Medium coupling.

12. **Circle Settings Sheet** → `CircleSettingsSheet.tsx`
13. **Header Chrome** → `CircleHeaderChrome.tsx`
14. **Next Event Anchor Card** → `CircleNextEventCard.tsx`
15. **Chat Floating Indicators** → `CircleChatOverlays.tsx`

### Phase 4 — Small Content (1 extraction, ~62 lines)
16. **Lifecycle Chips** → `CircleLifecycleChips.tsx`

---

## What Should NOT Be Extracted

| Section | Lines | Reason |
|---------|------:|--------|
| Info Sheet | 23 | Too thin — 4 lines of text in a BottomSheet. |
| Availability Summary Strip | 30 | Thin pressable with emoji counts. More boilerplate to extract than inline. |
| Reply Preview Bar | 31 | Thin conditional row tightly coupled to `replyTarget` state. |
| Message Input + Draft Variants | 60 | Deeply coupled to `message` state, `setTyping`, `inputRef`, draft variant cycling. Extracting would be pure prop forwarding. |
| Poll Strip | 60 | Gated off (`POLLS_ENABLED = false`). Dead code — extract when re-enabled. |
| Calendar Toggle | 20 | Trivial pressable toggling `showCalendar`. |
| Mini Calendar section | 51 | Already delegates to extracted `MiniCalendar` component. Just wiring. |
| FlatList + renderItem | 300 | `renderItem` closure references ~15 local state variables (reactions, edits, deletions, reply, stableId, ActionSheetIOS). Extracting would require a massive props interface with no readability gain. |
| DEV QA Panel | 63 | DEV-only. References 10+ local state setters and queryClient. |
| All hooks, state, queries, mutations, effects | ~1,521 | By design — parent owns all state and business logic. |
| Loading gate | 24 | Structural control flow, not presentational. |
| Paywall Modal call | 6 | Single `<PaywallModal>` — already an extracted component. |

---

## Risks / Invariants

1. **Hook ordering.** All hooks remain above early returns in the parent. No hooks move into extracted components.
2. **Props-only contract.** Extracted components must not import `useSession`, `useTheme`, `useQuery`, or any global hook. All data comes via props.
3. **Handlers as callbacks.** Parent defines all handlers; extracted components receive them as `onX` props. No duplicated business logic.
4. **One extraction = one commit.** Each extraction is independently shippable and testable.
5. **No behavior changes.** Extractions are pure refactors — no user-visible behavior, layout, or timing changes.
6. **Type the props interface.** Each extracted component gets an explicit `Props` interface. No `any` types.
7. **Modal guard timing.** Several sheets use `[P0_MODAL_GUARD]` patterns with `setTimeout(350ms)` to prevent iOS touch freeze from concurrent modals. These timeouts stay in parent callbacks, not in extracted components.
8. **Optimistic update patterns.** All `queryClient.setQueryData` calls stay in parent mutation handlers. Extracted sheets receive `isPending` boolean, never the mutation object.
9. **Analytics/Haptics in parent.** All `Haptics.*` and analytics calls stay in parent callbacks.
10. **Icon components.** `TrashIcon` and `WarningIcon` (Ionicons wrappers, lines 108–114) move to the component that uses them (`CircleMembersSheet` and `CircleRemoveMemberModal` respectively).
11. **DEV logging.** `devLog` calls inside extracted JSX move with the component. `devLog` calls in parent callbacks stay in parent.
12. **Unicode escape sequences.** Source uses `\uD83D\uDFE2`, `\u2193`, `\u26AA`, `\u2019` etc. — extracted components must use matching escape sequences.

---

## Parent Projection

| Category | Current | After Extraction |
|----------|--------:|----------------:|
| Imports + icons | 115 | ~130 (add component imports) |
| Hooks/state/effects/callbacks | 1,521 | 1,521 (unchanged) |
| Loading gate | 24 | 24 |
| DEV QA helpers | 106 | 106 |
| Derived values | 3 | 3 |
| JSX return (wiring) | 2,562 | ~680 (composition of extracted components) |
| **Total** | **4,331** | **~2,464** |

Estimated **43% reduction** (4,331 → ~2,464 lines). The parent becomes a composition of hooks, state, effects, early returns, and component wiring — matching the event page pattern.

---

## File Structure (after all extractions)

```
src/components/circle/
  CircleAddMembersModal.tsx
  CircleAvailabilitySection.tsx    (existing)
  CircleAvailabilitySheet.tsx
  CircleChatOverlays.tsx
  CircleChatSection.tsx            (existing)
  CircleCreateEventModal.tsx
  CircleEditMessageOverlay.tsx
  CircleFriendSuggestionModal.tsx
  CircleHeaderChrome.tsx
  CircleLifecycleChips.tsx
  CircleMembersSection.tsx         (existing)
  CircleMembersSheet.tsx
  CircleNextEventCard.tsx
  CircleNotifyLevelSheet.tsx
  CirclePlanLockSheet.tsx
  CirclePollSheet.tsx
  CircleReactionPicker.tsx
  CircleRemoveMemberModal.tsx
  CircleSettingsSheet.tsx
```

16 new files + 3 existing = 19 total in `src/components/circle/`.
