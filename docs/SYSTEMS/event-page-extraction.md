# Event Page Extraction Spec

> **STATUS: COMPLETE** — All 27 components extracted from `src/app/event/[id].tsx`.
> Original: ~5,371 lines. Current: **3,244 lines** (40% reduction).
> Each extraction is one commit, independently shippable. No big-bang refactor.

---

## Purpose

The file was too large: every state change reconciled the entire tree, CLI tasks burned excessive tokens reading it, and the 4+ early returns constraint meant hooks piled up at the top indefinitely. Goal: reduce the parent to a manageable composition of hooks, state, effects, early returns, and component wiring.

## Result

Parent retains: route params, hooks, queries, mutations, state, effects, derived values, early returns, handler functions, and a clean composition return. Each extracted component is a pure presentational function that receives props + handler callbacks.

The 19 original extraction candidates were completed. The two most complex candidates (Primary Action Bar, Atmospheric Zone) were decomposed into sub-components rather than extracted as monolithic wrappers, yielding 8 additional focused components (27 total).

---

## A. Extraction Candidates — DONE

| # | Section | Commit | Component(s) |
|---|---------|--------|--------------|
| 1 | Sticky RSVP Bar | `829a219` | StickyRsvpBar |
| 2 | Report Modal | `94e1261` | ReportModal |
| 3 | Calendar Sync Modal | `7060e40` | CalendarSyncModal |
| 4 | Event Actions Bottom Sheet | `ac17bee` | EventActionsSheet |
| 5 | Attendees Bottom Sheet | `be3c50f` | AttendeesSheet |
| 6 | Color Picker Bottom Sheet | `4c0744c` | ColorPickerSheet |
| 7 | Photo Upload Sheet | `48b7b84` | PhotoUploadSheet |
| 8 | Host Tools Row | `fc87c8f` | HostToolsRow |
| 9 | Post-Create Invite Nudge | `07f009f` | PostCreateNudge |
| 10 | Discussion Card | `95aff84` | DiscussionCard |
| 11 | About Card | `a92ce4f` | AboutCard |
| 12 | Who's Coming Card | `bcd9288` | WhosComingCard |
| 13 | Primary Action Bar (decomposed) | `e209b4c` `f74641d` `7a08ca7` `47d1ebf` `3c9bfaa` `c24fe5a` | SocialProofRow, RsvpSuccessPrompt, FindFriendsNudge, RsvpStatusDisplay, RsvpButtonGroup, ConfirmedAttendeeBanner |
| 14 | Event Settings Accordion | `e28ea92` | EventSettingsAccordion |
| 15 | Host Reflection Card | `4296c06` | HostReflectionCard |
| 16 | Memories Row | `55e01b4` | MemoriesRow |
| 17 | Atmospheric Zone (decomposed) | `9e7274b` `6c53cec` `adc6492` `fa2f4d6` | PhotoNudge, EditPhotoButton, EventHeroNav, EventHeroBackdrop |
| 18 | Privacy-Restricted Gate | `f63151c` | PrivacyRestrictedGate |
| 19 | Busy Block Gate | `4cd4b2e` | BusyBlockGate |

---

## B. Components Map

All 27 extracted components in `src/components/event/`:

| File | Description |
|------|-------------|
| `AboutCard.tsx` | Description, directions, visibility, capacity, pitch-in, and bring list sections |
| `AttendeesSheet.tsx` | Bottom sheet showing full attendee list with avatar stack |
| `BusyBlockGate.tsx` | Early-return gate for busy/calendar-block events |
| `CalendarSyncModal.tsx` | Modal for syncing event to Google Calendar or device calendar |
| `ColorPickerSheet.tsx` | Bottom sheet for picking event color override |
| `ConfirmedAttendeeBanner.tsx` | Green "You're Attending" badge with social proof row |
| `DiscussionCard.tsx` | Comments section with input, image upload, and discussion prompts |
| `EditPhotoButton.tsx` | Pencil icon with bounce animation for changing event banner photo |
| `EventActionsSheet.tsx` | Bottom sheet with share, edit, report, duplicate, delete, live activity actions |
| `EventHeroBackdrop.tsx` | Blurred photo backdrop or gradient fallback behind the hero zone |
| `EventHeroNav.tsx` | Glass-effect navigation bar with back and options buttons |
| `EventSettingsAccordion.tsx` | Expandable settings: calendar sync, reminders, mute, reflection toggle |
| `FindFriendsNudge.tsx` | Blue card prompting user to find friends via contacts import |
| `HostReflectionCard.tsx` | Post-event reflection card with summary display or prompt |
| `HostToolsRow.tsx` | Host-only tools: share, copy reminder, edit, pitch-in, bring list shortcuts |
| `MemoriesRow.tsx` | Expandable memories/photos section with gallery |
| `PhotoNudge.tsx` | Dashed "Add a cover photo" pressable with dismiss |
| `PhotoUploadSheet.tsx` | Bottom sheet for uploading or removing event photo |
| `PostCreateNudge.tsx` | Post-creation share nudge with SMS, copy link, and share actions |
| `PrivacyRestrictedGate.tsx` | Early-return gate for privacy-restricted events with host info |
| `ReportModal.tsx` | Modal for reporting an event with reason selection |
| `RsvpButtonGroup.tsx` | "I'm In" + "Save" pill buttons, full indicator, pending spinner |
| `RsvpStatusDisplay.tsx` | Current RSVP status badge with Change toggle and Share link |
| `RsvpSuccessPrompt.tsx` | Post-RSVP "You're in!" banner with Share and dismiss actions |
| `SocialProofRow.tsx` | Overlapping avatar stack with going count or "Be the first" fallback |
| `StickyRsvpBar.tsx` | Floating bottom RSVP bar for non-host viewers |
| `WhosComingCard.tsx` | Avatar roster preview, interested users, and social proof |

---

## C. What Remains Unextracted

The following stay inline in `src/app/event/[id].tsx` by design:

| Section | Lines | Reason |
|---------|-------|--------|
| Primary Action Bar wrapper | ~20 | Thin composition: `hasJoinRequest` ternary, `Animated.View` entry wrapper. Just wires the 6 extracted sub-components. |
| Atmospheric Zone wrapper + InviteFlipCard call | ~70 | InviteFlipCard receives 20+ props deeply coupled to parent state (attendee avatars IIFE, all event metadata, render props). Extracting a wrapper would just be prop forwarding with no readability gain. |
| Saved confirmation text | 6 | Trivial inline `<Text>` with ephemeral visibility toggle. |
| DEV log IIFE | 10 | Dev-only debug logging, renders nothing. |
| All hooks, state, queries, mutations, effects | ~1500 | By design — parent owns all state and business logic. |
| Module-level helpers | ~200 | `openEventLocation`, `formatDateForCalendar`, `openGoogleCalendar`, `addToDeviceCalendar`, `buildShareInput`, `shareEvent`, `EventDetailErrorState`. Could be moved to utility files in a future pass. |
| Early return gates (loading, error, session) | ~60 | Structural control flow, not presentational. |
| Composition JSX (wiring extracted components) | ~200 | The "table of contents" that connects everything. |

---

## D. Extraction Order (as executed)

**Phase 1 — Modals & Sheets**
1. ReportModal → 2. CalendarSyncModal → 3. ColorPickerSheet → 4. PhotoUploadSheet → 5. AttendeesSheet → 6. EventActionsSheet → 7. HostToolsRow

**Phase 2 — Content Sections + Gates**
8. PostCreateNudge → 9. BusyBlockGate → 10. PrivacyRestrictedGate → 11. StickyRsvpBar → 12. HostReflectionCard → 13. MemoriesRow → 14. EventSettingsAccordion → 15. DiscussionCard → 16. WhosComingCard → 17. AboutCard

**Phase 3 — Primary Action Bar (decomposed into sub-components)**
18. SocialProofRow → 19. RsvpSuccessPrompt → 20. FindFriendsNudge → 21. RsvpStatusDisplay → 22. RsvpButtonGroup → 23. ConfirmedAttendeeBanner

**Phase 4 — Atmospheric Zone (decomposed into sub-components)**
24. PhotoNudge → 25. EditPhotoButton → 26. EventHeroNav → 27. EventHeroBackdrop

---

## E. File Structure

```
src/components/event/
  AboutCard.tsx
  AttendeesSheet.tsx
  BusyBlockGate.tsx
  CalendarSyncModal.tsx
  ColorPickerSheet.tsx
  ConfirmedAttendeeBanner.tsx
  DiscussionCard.tsx
  EditPhotoButton.tsx
  EventActionsSheet.tsx
  EventHeroBackdrop.tsx
  EventHeroNav.tsx
  EventSettingsAccordion.tsx
  FindFriendsNudge.tsx
  HostReflectionCard.tsx
  HostToolsRow.tsx
  MemoriesRow.tsx
  PhotoNudge.tsx
  PhotoUploadSheet.tsx
  PostCreateNudge.tsx
  PrivacyRestrictedGate.tsx
  ReportModal.tsx
  RsvpButtonGroup.tsx
  RsvpStatusDisplay.tsx
  RsvpSuccessPrompt.tsx
  SocialProofRow.tsx
  StickyRsvpBar.tsx
  WhosComingCard.tsx
```

---

## F. Doctrine / Rules

1. **Props-only contract.** Extracted components must not import `useSession`, `useTheme`, `useQuery`, or any global hook. All data comes via props.
2. **Handlers as callbacks.** Parent defines all handlers; extracted components receive them as `onX` props. No duplicated business logic.
3. **One extraction = one commit.** Each extraction is independently shippable and testable.
4. **Composition readability.** The parent JSX return reads like a table of contents.
5. **No behavior changes.** Extractions are pure refactors — no user-visible behavior, layout, or timing changes.
6. **Type the props interface.** Each extracted component gets an explicit `Props` interface. No `any` types.

---

## Risks / Invariants (resolved)

- **Hook ordering.** All hooks remain above early returns in the parent. No hooks were moved into extracted components.
- **Animation refs.** `rsvpButtonAnimStyle` (Reanimated) passed as `animStyle` prop to `RsvpButtonGroup`. `editScale` (classic RNAnimated.Value) passed as prop to `EditPhotoButton`. Both `useRef`/`useAnimatedStyle` stay in parent.
- **IIFE closures.** Converted to normal component bodies (HostReflectionCard, WhosComingCard) or parent-side pre-computation (MemoriesRow, AboutCard bring list).
- **Mutation objects as props.** Specific fields passed (e.g., `isPending: boolean`, `onClaim: (id) => void`), never full mutation objects.
- **AsyncStorage writes.** All persist operations stay in parent callbacks (`onDismiss`, etc.), not in extracted components.
- **Analytics tracking.** All analytics calls stay in parent callbacks to avoid coupling presentational components to the analytics SDK.
- **Unicode escape sequences.** Some source strings contain `\u2019`, `\u00B7`, `\u2014` — extracted components use matching escape sequences to avoid Edit tool failures.
