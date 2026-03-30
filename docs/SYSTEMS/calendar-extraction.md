# Calendar Page Extraction Spec

> **STATUS: COMPLETE** — 8 of 8 extractions shipped (spec originally listed 10 candidates; day cells shipped as 1 commit with 3 components).
> File: `src/app/calendar.tsx` — **1,632 lines** (was 3,205).
>
> Commits: `c6f51a2` DayCells, `cd9ee20` EventListItem, `56f0359` BirthdaysSection, `70df8fb` ListView, `9de35b4` BusyBlockModal, `7111811` FirstLoginGuideModal, `a1ff546` HeaderChrome, `0a1f7b7` calendarUtils.

---

## Purpose

The calendar screen is the third-largest file in the codebase. It combines a pinch-to-zoom calendar grid, event list rendering with context menus, birthday display, busy block creation, first-login guidance, calendar import nudging, and multiple view mode components. Extractions will reduce cognitive load and token cost without changing behavior.

---

## Current State

| Section | Lines | Notes |
|---------|------:|-------|
| Imports | 1\u201377 | ~77 lines, many component + utility imports |
| Constants + utility functions | 78\u2013191 | DAYS, MONTHS, VIEW_MODES, getDaysInMonth, getFirstDayOfMonth, getOrdinalSuffix, formatDateShort, isLightColor, getTextColorForBackground, formatDateForCalendar, shareEventFromCalendar, addEventToDeviceCalendar |
| EVENT_COLORS + height system constants | 265\u2013319 | BASE_HEIGHTS, UNIFIED heights, thresholds, getViewModeFromHeight, getHeightMultiplierForMode |
| CompactDayCell component | 322\u2013410 | ~89 lines, inline function component |
| StackedDayCell component | 413\u2013500 | ~88 lines, inline function component |
| DetailsDayCell component | 503\u2013611 | ~109 lines, inline function component |
| EventListItem component | 614\u20131020 | ~407 lines, own state + refs, zeego context menu, delete confirmation modal |
| UpcomingBirthdaysSection component | 1022\u20131183 | ~162 lines, own hooks (useRouter, useTheme, useState) |
| ListView component | 1186\u20131309 | ~124 lines, own hook (useRouter), useMemo |
| CalendarScreen function | 1311\u20133205 | Main component |
| \u2003\u2003State + guidance + modal state | 1311\u20131499 | ~189 lines: boot, color overrides, timeout, guidance, welcome/import nudge, busy modal state/mutation |
| \u2003\u2003Busy block helpers + guide handlers | 1500\u20131543 | ~44 lines |
| \u2003\u2003Calendar state + unified height system | 1545\u20131670 | ~126 lines: month/year, selectedDate, viewMode, pinch gesture, AsyncStorage persistence |
| \u2003\u2003View mode setter + date range + queries | 1672\u20131775 | ~104 lines: setViewModeManually, calendarRange query, birthdays query |
| \u2003\u2003Mutations + data extraction | 1776\u20132063 | ~288 lines: delete/color/busy mutations, work schedule, event requests, device calendar resync, pseudo-events |
| \u2003\u2003Event combining + helpers + grid generation | 2065\u20132260 | ~196 lines: allEvents, getEventsForCalendarDate, getEventsForDate, calendarDays, month nav, gestures |
| \u2003\u2003renderCell dispatch | 2263\u20132302 | ~40 lines |
| \u2003\u2003Loading/error early returns | 2304\u20132374 | ~71 lines |
| \u2003\u2003JSX: Floating header chrome | 2383\u20132514 | ~132 lines: BlurView + AppHeader + month nav + view mode selector |
| \u2003\u2003JSX: ScrollView + calendar grid | 2516\u20132650 | ~135 lines: day headers, week rows, pinch hint |
| \u2003\u2003JSX: Selected date events | 2652\u20132771 | ~120 lines: date header, empty state, event list |
| \u2003\u2003JSX: Proposed events section | 2773\u20132912 | ~140 lines: event request cards |
| \u2003\u2003JSX: Modals (FirstLoginGuide, BusyBlock, Welcome) | 2926\u20133203 | ~278 lines |

---

## Extraction Candidates

| # | Component | Line Range | ~Lines | Props | Complexity | Phase |
|---|-----------|-----------|-------:|------:|:----------:|:-----:|
| 1 | CompactDayCell (move) | 322\u2013410 | 89 | 10 | Low | 1 |
| 2 | StackedDayCell (move) | 413\u2013500 | 88 | 10 | Low | 1 |
| 3 | DetailsDayCell (move) | 503\u2013611 | 109 | 11 | Low | 1 |
| 4 | EventListItem (move) | 614\u20131020 | 407 | 13 | High | 1 |
| 5 | UpcomingBirthdaysSection (move) | 1022\u20131183 | 162 | 2 | Medium | 2 |
| 6 | ListView (move) | 1186\u20131309 | 124 | 12 | Medium | 2 |
| 7 | CalendarBusyBlockModal | 3014\u20133194 | 181 | ~10 | Medium | 2 |
| 8 | CalendarFirstLoginGuideModal | 2926\u20133012 | 87 | ~5 | Low | 3 |
| 9 | CalendarHeaderChrome | 2383\u20132514 | 132 | ~14 | Medium | 3 |
| 10 | calendarUtils.ts (utility extraction) | 78\u2013191, 265\u2013319 | ~167 | N/A | Low | 4 |

---

## Candidate Details

### 1\u20133. CompactDayCell, StackedDayCell, DetailsDayCell (Phase 1)
**Lines:** 322\u2013611 (three sibling components)
**Props (shared):** `day`, `isToday`, `isSelected`, `isWeekday`, `events`, `onPress`, `themeColor`, `colors`, `heightMultiplier`, `colorOverrides` (DetailsDayCell also takes `isDark`)
**Notes:** Already standalone function components defined above CalendarScreen. This is a **file move** \u2014 extract all three into a single `CalendarDayCells.tsx` file since they share the same prop shape and are always used together via `renderCell`. `getEventPalette` and `getTextColorForBackground` are imported from `@/lib/eventPalette` and local utility respectively. `BASE_HEIGHTS` constant moves with them. `INVARIANT_ALLOW_*` comment patterns must be preserved.

### 4. EventListItem (Phase 1)
**Lines:** 614\u20131020 (~407 lines)
**Props:** `event`, `isAttending`, `isBirthday`, `isWork`, `themeColor`, `colors`, `compact`, `isDark`, `onColorChange`, `onDelete`, `onToggleBusy`, `isOwner`, `colorOverride`
**Notes:** Most complex component. Has own state (`showDeleteConfirm`), own refs (`contextMenuOpenedRef`, `navigationBlockedUntilRef`, `pressStartTimeRef`), uses `useRouter` internally. Uses zeego `ContextMenu.Root` for long-press actions. Uses `ConfirmModal` for delete confirmation. `EVENT_COLORS` constant moves with it. `shareEventFromCalendar` and `addEventToDeviceCalendar` helper functions move with it (or to calendarUtils.ts). `getEventDisplayFields`, `getEventPalette`, `EventPhotoEmoji`, `EventVisibilityBadge` are imported dependencies.

### 5. UpcomingBirthdaysSection (Phase 2)
**Lines:** 1022\u20131183 (~162 lines)
**Props:** `upcomingBirthdays`, `colors`
**Notes:** Already a standalone component. Has internal hooks (`useRouter`, `useTheme`, `useState`). This is a **file move** like ReferralCounterSection in settings \u2014 it owns its own hooks rather than receiving callbacks. Uses `STATUS.birthday.*` tokens, `TILE_SHADOW`, `EntityAvatar` is not used (cake emoji instead).

### 6. ListView (Phase 2)
**Lines:** 1186\u20131309 (~124 lines)
**Props:** `events`, `currentMonth`, `currentYear`, `themeColor`, `colors`, `isDark`, `userId`, `onColorChange`, `onDelete`, `onToggleBusy`, `session`, `colorOverrides`
**Notes:** Has internal `useRouter` and `useMemo`. Renders `EventListItem` for each event. Empty state includes "Create Event" button with `guardEmailVerification`. This depends on EventListItem being extracted first (or importing from the same directory).

### 7. CalendarBusyBlockModal (Phase 2)
**Lines:** 3014\u20133194 (~181 lines)
**Props:** `visible`, `busyLabel`, `busyStartTime`, `busyEndTime`, `selectedDate`, `isPending`, `colors`, `isDark` + `onClose`, `onLabelChange`, `onAdjustStart`, `onAdjustEnd`, `onCreateBusy`
**Notes:** Self-contained modal with label input and chevron-based time pickers. All mutation logic stays in parent. `adjustBusyStart`/`adjustBusyEnd` can stay in parent as callbacks or move to component (they're pure time manipulation).

### 8. CalendarFirstLoginGuideModal (Phase 3)
**Lines:** 2926\u20133012 (~87 lines)
**Props:** `visible`, `colors`, `isDark`, `themeColor` + `onOpenGuide`, `onDismiss`
**Notes:** Small welcome modal with feature list and two buttons. `handleOpenGuide`/`handleDismissGuide` callbacks stay in parent (AsyncStorage writes + router.push).

### 9. CalendarHeaderChrome (Phase 3)
**Lines:** 2383\u20132514 (~132 lines)
**Props:** `currentMonth`, `currentYear`, `viewMode`, `isListView`, `themeColor`, `colors`, `isDark`, `calendarInsets`, `monthNavDirRef`, `session` + `onGoToPrevMonth`, `onGoToNextMonth`, `onSetViewMode`, `onSetListView`, `onCreateEvent`, `onChromeLayout`
**Notes:** Floating BlurView header with AppHeader, animated month title, prev/next month buttons, view mode segmented control, list toggle. References `MONTHS`, `CALENDAR_VIEW_MODES`, `HEADER_TITLE_SIZE`. Uses `HelpSheet`, `Button`. `monthNavDirRef` drives enter/exit animations.

### 10. calendarUtils.ts (Phase 4 \u2014 utility extraction)
**Lines:** 78\u2013191 + 265\u2013319 (~167 lines)
**Contents:** `getDaysInMonth`, `getFirstDayOfMonth`, `getOrdinalSuffix`, `formatDateShort`, `isLightColor`, `getTextColorForBackground`, `formatDateForCalendar`, `shareEventFromCalendar`, `addEventToDeviceCalendar`, `EVENT_COLORS`, `BASE_HEIGHTS`, `UNIFIED_MIN_HEIGHT`, `UNIFIED_MAX_HEIGHT`, threshold constants, `getViewModeFromHeight`, `getHeightMultiplierForMode`, `ViewMode` type
**Notes:** Pure functions and constants with no React dependencies (except `shareEventFromCalendar` and `addEventToDeviceCalendar` which use `safeToast` and `ExpoCalendar`). Move to `src/lib/calendarUtils.ts`. This cleans the top of the file and makes utilities testable in isolation.

---

## Recommended Extraction Order

| Phase | Components | Rationale |
|:-----:|-----------|-----------|
| 1 | DayCells (3 components), EventListItem | Already standalone functions; largest single component (EventListItem) |
| 2 | UpcomingBirthdays, ListView, BusyBlockModal | ListView depends on EventListItem; BusyBlock is self-contained modal |
| 3 | FirstLoginGuideModal, HeaderChrome | Header is the most coupled to parent state |
| 4 | calendarUtils.ts | Pure utility move, can be done anytime but benefits from stable imports |

---

## What Should NOT Be Extracted

| Section | ~Lines | Why Not |
|---------|-------:|---------|
| CalendarScreen hooks/state/queries/mutations | ~700 | Parent owns all state and business logic |
| Pinch gesture + swipe gesture handlers | ~100 | Deeply coupled to shared values (unifiedHeight, baseUnifiedHeight) and calendar state |
| Event data derivation (allEvents, pseudo-events) | ~200 | References ~10 query results and local state variables |
| Calendar grid generation (calendarDays) | ~30 | Thin derivation from month/year state |
| renderCell dispatch | ~40 | Switch on viewMode, references component + shared props |
| Selected date events section JSX | ~120 | References selectedDateEvents, guidanceLoaded, empty state logic with multiple conditionals |
| Proposed events section JSX | ~140 | Inline event request cards with deep state coupling (session, eventRequests, pendingCount) |
| Calendar import nudge banner | ~40 | Too small; tightly coupled to nudge state |
| Loading/error early returns | ~71 | Structural control flow |
| WelcomeModal usage | ~4 | Already an extracted component, just a call site |
| Month navigation functions (goToPrevMonth, goToNextMonth, goToToday) | ~50 | Thin callbacks referencing monthYearRef + state setters |

---

## Risks / Invariants

1. **`INVARIANT_ALLOW_*` comment patterns** must be preserved in all moved components. These mark intentional inline handlers/props that would normally be flagged by linting.
2. **EventListItem has internal hooks** (`useRouter`, `useState`, `useRef`) \u2014 this is a self-contained interactive component, not a pure presentational extraction. Document this exception.
3. **UpcomingBirthdaysSection has internal hooks** (`useRouter`, `useTheme`, `useState`) \u2014 same exception as EventListItem.
4. **ListView has internal hooks** (`useRouter`, `useMemo`) \u2014 same pattern.
5. **Context menu (zeego)** in EventListItem requires careful import handling. `ContextMenu.Root`, `ContextMenu.Trigger`, `ContextMenu.Content`, `ContextMenu.Item`, `ContextMenu.Sub` must all be imported.
6. **`getTextColorForBackground` and `isLightColor`** are used by both DetailsDayCell and EventListItem \u2014 they should move to `calendarUtils.ts` in Phase 4, but Phase 1 extractions can import from `../calendar` temporarily or duplicate until Phase 4.
7. **`EVENT_COLORS`** is used only by EventListItem's context menu color picker. It moves with EventListItem.
8. **One extraction = one commit, independently shippable.**
9. **`shareEventFromCalendar` and `addEventToDeviceCalendar`** are module-level helpers used only by EventListItem \u2014 they move with EventListItem in Phase 1 (or to calendarUtils.ts in Phase 4).
10. **Pinch-to-zoom `heightMultiplier`** is computed in parent from `displayUnifiedHeight` and passed down to day cell components. The shared value system stays in parent.

---

## Parent Projection

After all 10 extractions: **~1,780 lines** (from 3,205; ~44% reduction).

Remaining in parent:
- Imports (~90 lines, including new component imports)
- CalendarScreen hooks, state, queries, mutations, effects, callbacks (~800 lines)
- Pinch gesture + swipe gesture composition (~100 lines)
- Event data derivation + pseudo-events (~200 lines)
- Calendar grid generation + renderCell dispatch (~70 lines)
- Loading/error early returns (~71 lines)
- Selected date events section JSX (~120 lines)
- Proposed events section JSX (~140 lines)
- Calendar import nudge banner (~40 lines)
- ScrollView + calendar grid JSX (~135 lines)
- WelcomeModal call site (~4 lines)

---

## File Structure

```
src/components/calendar/
  CalendarDayCells.tsx              — CompactDayCell, StackedDayCell, DetailsDayCell (3 view modes)
  CalendarEventListItem.tsx         — Event card with context menu, share/sync/color/busy/delete actions
  CalendarUpcomingBirthdays.tsx     — Collapsible upcoming birthdays section with navigation
  CalendarListView.tsx              — Full month list view grouped by date
  CalendarBusyBlockModal.tsx        — Quick busy block creation modal with time pickers
  CalendarFirstLoginGuideModal.tsx  — First-login welcome/tour modal
  CalendarHeaderChrome.tsx          — Floating BlurView header with month nav and view mode selector

src/lib/
  calendarUtils.ts                  — Date helpers, color utilities, height system constants, ViewMode type
```
