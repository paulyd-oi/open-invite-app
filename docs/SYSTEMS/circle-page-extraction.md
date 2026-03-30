# Circle Page Extraction Spec

> **STATUS: COMPLETE** — All 16 extractions shipped.
> File: `src/app/circle/[id].tsx` — **2,937 lines** (was 4,331; 32% reduction).
> Sprint: 16 commits, `db7f20e`..`d789c5a`.

---

## Purpose

The circle detail screen was the largest file in the codebase. It combined chat messaging, member management, scheduling coordination (availability, polls, plan lock, lifecycle), and a full settings surface. Extractions reduced cognitive load and token cost without changing behavior.

---

## Completed Extractions

| # | Component | File | Commit | Props | Phase |
|---|-----------|------|--------|------:|:-----:|
| 1 | CircleAddMembersModal | `src/components/circle/CircleAddMembersModal.tsx` | `db7f20e` | 11 | 1 |
| 2 | CircleFriendSuggestionModal | `src/components/circle/CircleFriendSuggestionModal.tsx` | `d95f881` | 5 | 1 |
| 3 | CircleRemoveMemberModal | `src/components/circle/CircleRemoveMemberModal.tsx` | `155646b` | 7 | 1 |
| 4 | CircleCreateEventModal | `src/components/circle/CircleCreateEventModal.tsx` | `2f9f5c8` | 6 | 1 |
| 5 | CircleEditMessageOverlay | `src/components/circle/CircleEditMessageOverlay.tsx` | `1f621ff` | 7 | 2 |
| 6 | CircleReactionPicker | `src/components/circle/CircleReactionPicker.tsx` | `ed50075` | 5 | 2 |
| 7 | CircleAvailabilitySheet | `src/components/circle/CircleAvailabilitySheet.tsx` | `4d7786f` | 8 | 2 |
| 8 | CirclePlanLockSheet | `src/components/circle/CirclePlanLockSheet.tsx` | `2e1f877` | 11 | 2 |
| 9 | CirclePollSheet | `src/components/circle/CirclePollSheet.tsx` | `aa2dd1b` | 11 | 3 |
| 10 | CircleNotifyLevelSheet | `src/components/circle/CircleNotifyLevelSheet.tsx` | `6fb7556` | 7 | 3 |
| 11 | CircleMembersSheet | `src/components/circle/CircleMembersSheet.tsx` | `0fbed53` | 16 | 3 |
| 12 | CircleSettingsSheet | `src/components/circle/CircleSettingsSheet.tsx` | `974bd09` | 31 | 3 |
| 13 | CircleHeaderChrome | `src/components/circle/CircleHeaderChrome.tsx` | `73477f0` | 12 | 4 |
| 14 | CircleNextEventCard | `src/components/circle/CircleNextEventCard.tsx` | `ed57835` | 7 | 4 |
| 15 | CircleChatOverlays | `src/components/circle/CircleChatOverlays.tsx` | `c248f81` | 11 | 4 |
| 16 | CircleLifecycleChips | `src/components/circle/CircleLifecycleChips.tsx` | `d789c5a` | 9 | 4 |

---

## Components Map

```
src/components/circle/
  CircleAddMembersModal.tsx       — Friend selection modal for adding circle members
  CircleAvailabilitySheet.tsx     — Tonight's availability roster (read-only display)
  CircleChatOverlays.tsx          — Scroll-to-bottom, new messages pill, failed banner, typing indicator
  CircleCreateEventModal.tsx      — Confirm modal for creating a circle-scoped event
  CircleEditMessageOverlay.tsx    — Fullscreen overlay for editing a sent message
  CircleFriendSuggestionModal.tsx — Post-add suggestion modal showing newly matched friends
  CircleHeaderChrome.tsx          — Floating BlurView header with avatar stack and create button
  CircleLifecycleChips.tsx        — Finalized chip and completion/run-it-back prompt
  CircleMembersSheet.tsx          — Full members list + add-members section (Modal-based)
  CircleNextEventCard.tsx         — Collapsible next-event anchor card with date formatting
  CircleNotifyLevelSheet.tsx      — Notification level radio picker (all/decisions/mentions/mute)
  CirclePlanLockSheet.tsx         — Plan lock toggle with note editing and host unlock
  CirclePollSheet.tsx             — Poll voting sheet with winner highlight and lock-plan bridge
  CircleReactionPicker.tsx        — Emoji reaction grid overlay with selection state
  CircleRemoveMemberModal.tsx     — Destructive confirmation modal for removing a member
  CircleSettingsSheet.tsx         — Two-view settings sheet (settings + photo management)
```

Pre-existing files (not part of this sprint):
```
  CircleAvailabilitySection.tsx   — Circle availability types, helpers, day-detail events
  CircleChatSection.tsx           — Chat bubbles, date separators, system event parsing
  CircleMembersSection.tsx        — Circle member events calendar grid
```

---

## What Remains in `[id].tsx` (2,937 lines)

| Section | ~Lines | Why Not Extracted |
|---------|-------:|-------------------|
| Imports | 130 | Structural — includes 16 new component imports |
| Hooks, state, queries, mutations, effects, callbacks | 1,521 | By design — parent owns all state and business logic |
| Loading gate (early returns) | 24 | Structural control flow |
| DEV QA helpers | 106 | DEV-only, references 10+ local state setters |
| Derived values | 15 | Thin derivations used across multiple sections |
| Calendar toggle + mini calendar | 71 | Trivial; mini calendar already delegates to `MiniCalendar` component |
| Availability summary strip | 30 | Thin pressable with emoji counts, more boilerplate to extract than inline |
| Thread cards (plan-lock/poll/event) | ~180 | IIFE blocks with deep state coupling |
| FlatList + renderItem | ~300 | `renderItem` closure references ~15 local state variables |
| Reply preview bar | 31 | Thin conditional row tightly coupled to `replyTarget` state |
| Message input + compose bar | ~60 | Deeply coupled to message state, typing, inputRef, draft variants |
| Poll strip | ~60 | Gated off (`POLLS_ENABLED = false`), dead code |
| Paywall modal usage | 6 | Already an extracted component, just a call site |
| DEV QA panel | 63 | DEV-only, references local state setters and queryClient |
| Component wiring JSX | ~340 | Composition of extracted components with prop passing |

---

## Type Fixes During Extraction

Three extractions required type widening to match the parent's data contracts:

| Extraction | Fix |
|------------|-----|
| 11 (CircleMembersSheet) | `user.name: string` → `string \| null` |
| 12 (CircleSettingsSheet) | `circleDescription: string \| undefined` → `string \| null \| undefined` |
| 13 (CircleHeaderChrome) | `circleName`, `circleEmoji`, `circlePhotoUrl` widened to accept `undefined` |

---

## Invariants (preserved throughout)

1. All hooks remain in parent above early returns — no hooks in extracted components
2. Props-only contract — no `useSession`, `useTheme`, `useQuery` in extracted components
3. All mutations, `Haptics.*`, analytics, `queryClient.setQueryData` stay in parent callbacks
4. `[P0_MODAL_GUARD]` `setTimeout(350ms)` patterns stay in parent
5. One extraction = one commit, independently shippable
6. `TrashIcon` moved with `CircleMembersSheet`, `WarningIcon` moved with `CircleRemoveMemberModal`
7. `REACTION_EMOJI` moved with `CircleReactionPicker`, `NOTIFY_OPTIONS` moved with `CircleNotifyLevelSheet`
8. Unicode escape sequences preserved (`\u2193`, `\u2022`, `\u2026`, `\u2019`, `\u00B7`, etc.)
