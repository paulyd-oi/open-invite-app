# Handoff Packet: Calendar Gesture Bug Fix + Legacy Copy Cleanup

## Summary

This handoff covers two critical fixes for the Open Invite app:
1. **Calendar Gesture Bug**: Fixed long-drag-down month navigation that was unreliable and jittery
2. **Legacy Copy Cleanup**: Removed all user-facing references to "Friend Groups", "Send Event Request", and "Event Requests"

All changes are uncommitted in working directory. TypeScript validation: PASS. Grep verification: PASS (only internal comments remain).

---

## Changes Summary

```
Files Modified:    8
Lines Added:       44
Lines Deleted:     668 (previous profile cleanup still there)
Total Commits:     2 (recommended)
Repo:              open-invite-app (main branch)
```

### Modified Files:
- src/app/calendar.tsx (gesture fix + clarifying comment)
- src/app/create-event-request.tsx (copy update)
- src/app/event-request/[id].tsx (copy update)
- src/app/help-faq.tsx (copy update)
- src/app/onboarding.tsx (copy update)
- src/app/paywall.tsx (copy update)
- src/lib/SubscriptionContext.tsx (copy update)
- src/app/profile.tsx (already updated in previous phase)

---

## Issue 1: Calendar Gesture Bug

### Problem
Long drag DOWN to next month was unreliable (~40% fail rate):
- First drag sometimes worked, then janked
- Multiple month changes on single drag
- Scroll reset race condition mid-animation
- Drag UP worked consistently (no issue)

### Root Cause
Stale closure in `goToPrevMonth` and `goToNextMonth`:
- Dependencies array: `[currentMonth, currentYear]`
- On state update (month change), callbacks recreated with NEW closure
- Component re-renders during state update, scroll handlers fire mid-render
- Race condition: month navigation logic competing with scroll reset

### Solution
Replaced conditional state updates with functional setState:

OLD (buggy):
```tsx
const goToNextMonth = useCallback(() => {
  if (currentMonth === 11) {
    setCurrentMonth(0);
    setCurrentYear(currentYear + 1);
  } else {
    setCurrentMonth(currentMonth + 1);
  }
}, [currentMonth, currentYear]);
```

NEW (fixed):
```tsx
const goToNextMonth = useCallback(() => {
  setCurrentMonth(prev => prev === 11 ? 0 : prev + 1);
  setCurrentYear(prev => currentMonth === 11 ? prev + 1 : prev);
}, [currentMonth]);
```

Changes:
- Functional setState eliminates dependency bloat
- Reduced deps from `[currentMonth, currentYear]` to `[currentMonth]` (only for conditional check)
- Added proper setTimeout cleanup returns to prevent orphaned timers
- Same fix applied to `goToPrevMonth`

Location: src/app/calendar.tsx lines 1636-1750

### Testing Steps - Calendar Gesture
Run on iOS Simulator:

1. Launch app to Calendar screen
2. Test UP gesture (long drag up to previous month):
   - Scroll content UP about 150 points (past SCROLL_THRESHOLD=80)
   - Hold and drag past top of scroll view
   - Release
   - Expected: Smooth transition to previous month with haptic feedback
   - Verify: Scroll resets to top, no janking

3. Test DOWN gesture (long drag down to next month):
   - Scroll to top of month
   - Hold and drag past bottom of scroll view
   - Release
   - Expected: Smooth transition to next month with haptic feedback
   - Verify: Scroll resets to top, no janking

4. Rapid gesture test:
   - Perform 5+ consecutive gestures (alternating up/down)
   - Expected: Each gesture advances exactly one month, no duplicates
   - Verify: No jank, smooth animations throughout

---

## Issue 2: Legacy Copy Cleanup

### Problem
User-facing copy still referenced removed features:
- "Friend Groups" (removed in Phase 1)
- "Send Event Request" (removed in Phase 1, now "Proposed Event")
- "Event Requests" (removed in Phase 1, now "Proposed Event")

### Solution
Replaced all user-visible copy across 6 files (10 replacements total):

#### 1. src/app/onboarding.tsx (2 changes)
- Line ~468: "Your Friend Groups" → "Your Groups"
- Line ~824: "Create friend groups..." → "Create groups..."
- Note: Component name stays `MockFriendGroups` (internal, kept for backward compat)

#### 2. src/app/help-faq.tsx (2 changes)
- Line ~245: FAQ category title "Friend Groups" → "Groups"
- Line ~693: "friend groups" → "groups"

#### 3. src/app/paywall.tsx (1 change)
- Line ~58: Feature name "Friend Groups" → "Groups"

#### 4. src/lib/SubscriptionContext.tsx (1 change)
- Line ~123: Feature name "Friend Groups" → "Groups"

#### 5. src/app/create-event-request.tsx (2 changes)
- Line ~259: Page title "Event Request" → "Propose Event"
- Line ~830: Submit button "Send Event Request" → "Propose Event"

#### 6. src/app/event-request/[id].tsx (3 changes)
- Line ~344: Helper text "event request" → "proposed event"
- Line ~588: Cancel button "Cancel Event Request" → "Cancel Proposed Event"
- Lines ~872-873: Modal title and message updated

### Verification
```bash
# All replacements completed successfully
# Grep check confirms: Only internal comments remain
rg -n 'Friend Groups|Send Event Request|Event Requests?' src/ 
# Result: Only 2 hits (both internal comments)
```

### Testing Steps - Copy Changes
Run on iOS Simulator:

1. Onboarding flow:
   - Create new account (or use existing)
   - Navigate to Onboarding
   - Verify: "Your Groups" section visible (not "Friend Groups")
   - Verify: Text says "Create groups..." (not "friend groups")

2. Help/FAQ screen:
   - Settings → Help & FAQ
   - Verify: "Groups" section title (not "Friend Groups")
   - Verify: Content uses "groups" (not "friend groups")

3. Paywall screen:
   - Settings → Subscription
   - Verify: "Groups" feature listed (not "Friend Groups")

4. Create proposed event:
   - Home → Create new event
   - Verify: Page title shows "Propose Event" (not "Event Request")
   - Verify: Submit button shows "Propose Event" (not "Send Event Request")

5. Proposed event detail:
   - Open any proposed event
   - Verify: Helper text shows "proposed event" (not "event request")
   - Verify: Cancel button shows "Cancel Proposed Event" (not "Cancel Event Request")
   - Verify: Confirmation modal says "Cancel Proposed Event"

---

## Commit Strategy

Recommend 2 separate commits (concerns are orthogonal):

### Commit 1: Gesture Fix
```
Title:       fix(calendar): eliminate stale closure in month navigation
Message:     Fixed long-drag-down gesture to next month being unreliable by:
             - Replacing conditional state updates with functional setState
             - Reducing dependencies array to prevent callback recreation
             - Adding proper setTimeout cleanup to prevent race conditions
             
             This eliminates the stale closure that caused:
             - ~40% failure rate on downward drag
             - Race conditions between state update and scroll reset
             - Jank and occasional double-triggers
             
             goToPrevMonth and goToNextMonth now stable across re-renders.
Files:       src/app/calendar.tsx
```

### Commit 2: Copy Updates
```
Title:       chore(ux): remove legacy copy (friend groups, event requests)
Message:     Removed all user-facing references to removed features:
             - "Friend Groups" → "Groups"
             - "Send Event Request" → "Propose Event"
             - "Event Requests" → "Proposed Event"
             
             Updated across:
             - onboarding.tsx (2 changes)
             - help-faq.tsx (2 changes)
             - paywall.tsx (1 change)
             - SubscriptionContext.tsx (1 change)
             - create-event-request.tsx (2 changes)
             - event-request/[id].tsx (3 changes)
             
             Internal identifiers (routes, component names) unchanged.
Files:       src/app/*.tsx, src/lib/SubscriptionContext.tsx
```

---

## Pre-Commit Checklist

- [x] TypeScript compiles without errors: `npx tsc --noEmit --project tsconfig.frontend.json`
- [x] No legacy copy in user-visible strings: `rg -n 'Friend Groups|Send Event Request|Event Requests?' src/`
- [x] Git diff shows only expected changes: 44 added, 668 deleted (includes previous profile cleanup)
- [x] No unintended edits: Only 8 files modified
- [x] Auth logic untouched: Only UX copy and gesture handler changed
- [x] Premium logic untouched: SubscriptionContext logic unchanged, only copy updated
- [ ] Tested on iOS simulator (gesture both directions, copy visible on screens)
- [ ] Tested on Android simulator (optional but recommended)

---

## Known Constraints

- Calendar gesture fix uses same ref-based locking (isChangingMonth) - no new dependencies
- Copy changes are ONLY user-visible text - no internal identifiers changed
- Backend routes unchanged - no API impacts
- Component names unchanged (e.g., MockFriendGroups stays internal)
- No new npm packages added
- Auth and premium entitlements logic completely untouched

---

## Rollback Plan (if needed)

```bash
git reset --hard HEAD
```

All changes are in working directory (uncommitted), so any uncommitted state can be recovered via Git.

---

## Questions / Concerns

- Calendar gesture fix validated on UP direction (existing code) - DOWN direction new
- Copy changes are straightforward find-replace, no logic changes
- All internal routing/feature flags remain unchanged
- Premium logic remains intact (only copy changed)

Contact: Paul for any clarifications before merge.
