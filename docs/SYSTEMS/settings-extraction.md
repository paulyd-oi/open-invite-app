# Settings Page Extraction Spec

> **STATUS: COMPLETE** — 10 of 10 extractions shipped.
> File: `src/app/settings.tsx` — **1,814 lines** (was 3,237).
>
> Commits: `feb77a0` EditProfile, `73f28ee` Theme, `653e7e7` Birthday, `3df9c1b` WorkSchedule, `966786f` Subscription, `35a827b` NotificationsDevTools, `e6167d4` PushDiagModal, `361180e` PasscodeModal, `620a539` ReferralCounter, `d57c335` ProfileCard.

---

## Purpose

The settings screen is the second-largest file in the codebase. It combines profile editing, theme selection, birthday management, work schedule editing, subscription management, referral tracking, push diagnostics (DEV), and admin unlock logic. Extractions will reduce cognitive load and token cost without changing behavior.

---

## Current State

| Section | Lines | Notes |
|---------|------:|-------|
| Imports | 1\u2013103 | 60+ imports, PUSH_DIAG_ALLOWLIST constant |
| SettingItem component | 112\u2013148 | Generic reusable row (~37 lines) |
| ReplayQueueButton (DEV) | 150\u2013193 | Own useState, DEV-only |
| DeadLetterDebugRow (DEV) | 195\u2013218 | Own useState/useEffect, DEV-only |
| ReferralCounterSection | 220\u2013497 | ~278 lines, own hooks (useSession, useBootAuthority, useQuery, usePremiumStatusContract) |
| SettingsScreen function | 499\u20133221 | Main component |
| \u2003\u2003Push diagnostics state + handlers | 507\u2013700 | ~194 lines of state, formatDiagReport, doRunPushDiagnostics, handleClearTokens |
| \u2003\u2003Admin unlock mechanism | 709\u2013858 | ~150 lines: 7-tap detection, passcode modal state, AsyncStorage persistence |
| \u2003\u2003Profile editing state | 860\u2013898 | ~39 lines of useState declarations |
| \u2003\u2003Queries + mutations | 908\u20131222 | ~315 lines: workSchedule, profile, adminStatus, entitlements, updateProfile, updateBirthday, updateWorkSchedule |
| \u2003\u2003Image picker handlers | 1252\u20131421 | ~170 lines: avatar, banner, handleSaveProfile |
| \u2003\u2003Helper functions | 1423\u20131551 | ~129 lines: logout, birthday, work schedule formatTime/parseTime/toggleBlock2 |
| \u2003\u2003Unauthed gate | 1553\u20131585 | ~33 lines early return |
| \u2003\u2003Profile section JSX | 1589\u20131875 | ~287 lines: view mode + edit mode (avatar, banner, name, username, bio) |
| \u2003\u2003Theme section JSX | 1876\u20131977 | ~102 lines: mode picker + color picker |
| \u2003\u2003Account section JSX | 1979\u20131994 | ~16 lines: single SettingItem |
| \u2003\u2003Notifications section JSX | 1998\u20132157 | ~160 lines: prefs link + ~8 DEV debug tools |
| \u2003\u2003Invite Friends section JSX | 2230\u20132259 | ~30 lines: ReferralCounterSection + invite button |
| \u2003\u2003Subscription section JSX | 2261\u20132372 | ~112 lines: status, upgrade CTA, restore, refresh |
| \u2003\u2003Birthdays section JSX | 2374\u20132489 | ~116 lines: date picker, 3 toggles |
| \u2003\u2003Work Schedule section JSX | 2491\u20132686 | ~196 lines: per-day toggle/time pickers, block2 support |
| \u2003\u2003Calendar/Privacy/Support/Admin/Legal sections | 2688\u20132846 | ~159 lines: SettingItem rows |
| \u2003\u2003Sign Out | 2848\u20132864 | ~17 lines |
| \u2003\u2003Modals (SignOut, UsernameInfo, Passcode, PushDiag) | 2866\u20133218 | ~353 lines |
| DiagRow helper | 3223\u20133237 | ~15 lines |

---

## Extraction Candidates

| # | Component | Line Range | ~Lines | Props | Complexity | Phase |
|---|-----------|-----------|-------:|------:|:----------:|:-----:|
| 1 | SettingsEditProfileSection | 1672\u20131874 | 203 | ~12 | Medium | 1 |
| 2 | SettingsThemeSection | 1876\u20131977 | 102 | ~8 | Low | 1 |
| 3 | SettingsBirthdaySection | 2374\u20132489 | 116 | ~10 | Low | 1 |
| 4 | SettingsWorkScheduleSection | 2491\u20132686 | 196 | ~12 | High | 2 |
| 5 | SettingsSubscriptionSection | 2261\u20132372 | 112 | ~9 | Low | 2 |
| 6 | SettingsNotificationsDevTools | 2012\u20132157 | 146 | ~5 | Low | 2 |
| 7 | SettingsPushDiagnosticsModal | 3001\u20133218 | 218 | ~10 | Medium | 3 |
| 8 | SettingsAdminPasscodeModal | 2919\u20132999 | 81 | ~7 | Low | 3 |
| 9 | ReferralCounterSection (move) | 220\u2013497 | 278 | 3 | N/A | 3 |
| 10 | SettingsProfileCard (view mode) | 1619\u20131671 | 53 | ~8 | Low | 4 |

---

## Candidate Details

### 1. SettingsEditProfileSection (Phase 1)
**Lines:** 1672\u20131874 (edit profile form when `showEditProfile === true`)
**Props:** `editName`, `editImage`, `editBanner`, `editCalendarBio`, `editHandle`, `handleError`, `isUploading`, `profileData`, `session`, `colors`, `isDark`, `themeColor` + `onX` callbacks: `onPickImage`, `onPickBanner`, `onRemoveBanner`, `onSave`, `onCancel`, `onEditNameChange`, `onEditHandleChange`, `onEditCalendarBioChange`, `onShowUsernameInfo`, `updateProfileMutation`
**Notes:** Pure JSX. Avatar editing, banner editing, name/username/bio inputs, save/cancel buttons. All state setters and mutations stay in parent. EntityAvatar, ExpoImage, DateTimePicker used.

### 2. SettingsThemeSection (Phase 1)
**Lines:** 1876\u20131977 (theme mode picker + color picker)
**Props:** `themeMode`, `themeColor`, `themeColorName`, `showThemeModePicker`, `showThemePicker`, `colors`, `isDark` + `onSaveThemeMode`, `onSaveTheme`, `onToggleModePicker`, `onToggleColorPicker`
**Notes:** Self-contained UI section. References `THEME_COLORS` (imported from ThemeContext). `getThemeModeLabel` and `getThemeModeIcon` helpers move with this component.

### 3. SettingsBirthdaySection (Phase 1)
**Lines:** 2374\u20132489 (birthday date picker + 3 toggle switches)
**Props:** `showBirthdaySection`, `birthday`, `showDatePicker`, `showBirthdayToFriends`, `omitBirthdayYear`, `hideBirthdays`, `colors`, `isDark`, `themeColor` + `onToggleSection`, `onSetShowDatePicker`, `onDateChange`, `onBirthdayToggle`
**Notes:** `formatBirthdayDisplay` helper moves with component. DateTimePicker usage.

### 4. SettingsWorkScheduleSection (Phase 2)
**Lines:** 2491\u20132686 (work schedule editor)
**Props:** `showWorkScheduleSection`, `workSchedules`, `workSettings`, `showTimePicker`, `expandedBlock2Days`, `colors`, `isDark`, `themeColor` + `onToggleSection`, `onSetShowTimePicker`, `onWorkScheduleToggle`, `onWorkScheduleTimeChange`, `onToggleBlock2`, `onUpdateWorkSettings`
**Notes:** Most complex extraction. Per-day rows with time pickers, block2 split schedule support. `formatTimeDisplay` and `parseTimeToDate` helpers move with component. DateTimePicker for each day/block.

### 5. SettingsSubscriptionSection (Phase 2)
**Lines:** 2261\u20132372 (subscription status, upgrade, restore, refresh)
**Props:** `userIsPremium`, `entitlementsLoading`, `isRestoringPurchases`, `isRefreshingEntitlements`, `colors`, `isDark`, `themeColor` + `onNavigateSubscription`, `onUpgrade`, `onRestorePurchases`, `onRefreshEntitlements`
**Notes:** DEV decision logs stay in parent (IIFE pattern). The commented-out old subscription block (2161\u20132228) can be deleted during extraction.

### 6. SettingsNotificationsDevTools (Phase 2)
**Lines:** 2012\u20132157 (DEV-only notification debug tools)
**Props:** `canShowPushDiagnostics`, `isPushDiagRunning`, `isDark` + `onPushDiagnostics`, `onForceReregister`, `onViewPushReceipts`, `onClearPushReceipts`, `onViewQueryReceipts`, `onCopyDiagnosticsBundle`
**Notes:** Entire section gated by `__DEV__`. Each row is a SettingItem with an async onPress. DeadLetterDebugRow and ReplayQueueButton are already separate components and move into this file. PUSH_DIAG_ALLOWLIST stays in parent (used for gate logic).

### 7. SettingsPushDiagnosticsModal (Phase 3)
**Lines:** 3001\u20133218 (push diagnostics modal)
**Props:** `visible`, `pushDiagResult`, `pushDiagReport`, `isPushDiagRunning`, `isClearingTokens`, `colors`, `isDark` + `onClose`, `onRunDiagnostics`, `onClearTokens`, `onCopyReport`
**Notes:** DEV-only modal. DiagRow helper component moves with it. Large but self-contained UI. `canShowPushDiagnostics` gate stays in parent.

### 8. SettingsAdminPasscodeModal (Phase 3)
**Lines:** 2919\u20132999 (passcode entry modal)
**Props:** `visible`, `passcodeInput`, `passcodeError`, `colors`, `isDark` + `onClose`, `onPasscodeChange`, `onSubmit`
**Notes:** Small modal. All passcode validation logic stays in parent's `handlePasscodeSubmit`.

### 9. ReferralCounterSection (Phase 3 \u2014 move to file)
**Lines:** 220\u2013497 (already a standalone component)
**Props:** `isDark`, `colors`, `themeColor` (unchanged)
**Notes:** Already a self-contained function component with own hooks. This is a **file move**, not a refactor. It has internal hooks (`useSession`, `useBootAuthority`, `useQuery`, `usePremiumStatusContract`) which break the "no hooks in extracted components" invariant used in the circle extraction. This is intentional \u2014 ReferralCounterSection is a standalone feature module, not a presentational extraction. `REFERRAL_TIERS` import stays where it is.

### 10. SettingsProfileCard (Phase 4)
**Lines:** 1619\u20131671 (profile view mode card)
**Props:** `avatarSource`, `profileData`, `session`, `colors`, `isDark`, `themeColor` + `onAdminUnlockTap`, `onEditProfile`
**Notes:** The non-editing profile card with avatar (admin tap target) and "Tap to edit" row. Small but cleanly separable. `getProfileDisplay`, `getProfileInitial`, `EntityAvatar` used.

---

## Recommended Extraction Order

| Phase | Components | Rationale |
|:-----:|-----------|-----------|
| 1 | EditProfile, Theme, Birthday | Largest JSX blocks, clean prop boundaries, no DEV gating |
| 2 | WorkSchedule, Subscription, NotificationsDevTools | Medium complexity, WorkSchedule is the hardest extraction |
| 3 | PushDiagModal, PasscodeModal, ReferralCounter (move) | Modals are self-contained; ReferralCounter is a file move |
| 4 | ProfileCard | Small, depends on Phase 1 (showEditProfile toggle) |

---

## What Should NOT Be Extracted

| Section | ~Lines | Why Not |
|---------|-------:|---------|
| SettingItem component | 37 | Already a small reusable component at module level |
| Push diagnostics state + handlers | 194 | State + callbacks tightly coupled to modal + parent |
| Admin unlock mechanism | 150 | 7-tap detection, AsyncStorage, passcode validation \u2014 all business logic |
| Profile editing state declarations | 39 | useState declarations feed into multiple sections |
| Queries + mutations | 315 | Parent owns all server state and side effects |
| Image picker handlers | 170 | Upload logic with mutation calls, queryClient invalidation |
| Helper functions (logout, birthday, formatTime, parseTime) | 129 | Thin utilities referenced by multiple sections |
| Unauthed gate | 33 | Structural control flow (early return) |
| Account/Calendar/Privacy/Support/Legal sections | 159 | Each is 1\u20132 SettingItem rows \u2014 more boilerplate to extract than inline |
| Sign Out row | 17 | Single Pressable |
| UsernameInfoModal | 38 | Too small to justify a separate file |

---

## Risks / Invariants

1. **ReferralCounterSection has internal hooks** \u2014 unlike circle extractions, this component owns its own queries. This is a file move, not a props-only extraction. Document this exception.
2. **DEV gating must be preserved** \u2014 `__DEV__` guards on NotificationsDevTools, PushDiagModal, and various log statements must not leak into production.
3. **`canShowPushDiagnostics`** gate (`__DEV__ && isPushDiagnosticsAllowed`) stays in parent \u2014 extracted components receive the boolean result, not the gating logic.
4. **PUSH_DIAG_ALLOWLIST** stays in parent (or moves to a constants file) \u2014 it's a security-sensitive email list.
5. **Admin unlock tap detection** stays in parent \u2014 deeply coupled to `adminTapTimestampsRef`, `adminUnlocked` state, `showPasscodeModal` state.
6. **DateTimePicker platform branching** (`Platform.OS === "ios"`) must be preserved in Birthday and WorkSchedule extractions.
7. **One extraction = one commit, independently shippable.**
8. **All mutations, `Haptics.*`, analytics, `queryClient` calls stay in parent callbacks** (except ReferralCounterSection which is a self-contained module).

---

## Parent Projection

After all 10 extractions: **~1,800 lines** (from 3,237; ~44% reduction).

Remaining in parent:
- Imports (~120 lines, including 10 new component imports)
- SettingItem (~37 lines)
- SettingsScreen hooks, state, queries, mutations, effects, callbacks (~900 lines)
- Unauthed gate (~33 lines)
- Section composition JSX with prop passing (~400 lines)
- SignOutConfirmModal (~12 lines, uses ConfirmModal)
- Single-row sections (Account, Calendar, Privacy, Support, Legal, Admin, Sign Out) (~200 lines)

---

## File Structure

```
src/components/settings/
  SettingsEditProfileSection.tsx    — Profile editing form (avatar, banner, name, username, bio)
  SettingsThemeSection.tsx          — Theme mode picker + color picker grid
  SettingsBirthdaySection.tsx       — Birthday date picker + show/hide toggles
  SettingsWorkScheduleSection.tsx   — Per-day work hours editor with split schedule support
  SettingsSubscriptionSection.tsx   — Plan status, upgrade CTA, restore, refresh
  SettingsNotificationsDevTools.tsx — DEV-only push debug tools (diagnostics, receipts, queue)
  SettingsPushDiagnosticsModal.tsx  — DEV-only push diagnostics modal with DiagRow helper
  SettingsAdminPasscodeModal.tsx    — Admin unlock passcode entry modal
  SettingsProfileCard.tsx           — Profile view mode card (avatar + edit trigger)
  ReferralCounterSection.tsx        — Referral code display, progress, referrer input (standalone module)
```
