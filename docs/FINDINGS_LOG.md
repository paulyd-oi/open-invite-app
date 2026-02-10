# Findings Log — Frontend

## P8 CTA + Navigation Hierarchy Audit

### Audit Scope
- Swept all ~77 Button usages across screens and components for variant/intent alignment.
- Checked every screen for dual-primary CTA conflicts and destructive-as-non-destructive violations.

### Fixes Applied (7 total)
- SEVERITY 1 (destructive intent as ghost):
  - event-request/[id].tsx "Cancel Proposed Event": ghost -> destructive (irreversible cancel)
  - event-request/[id].tsx "Decline" (response buttons): ghost -> destructive (risk action)
  - event-request/[id].tsx "Decline" (modal): ghost -> destructive (risk action)
- SEVERITY 2 (navigation as primary):
  - event-request/[id].tsx "Go Back": primary -> secondary (navigation intent)
  - notification-settings.tsx "Go Back": primary -> secondary (navigation intent)
  - admin-reports.tsx "Go Back": primary -> secondary (navigation intent)
  - notification-settings.tsx "Enable in Settings": ghost -> secondary (P0 invariant: "clear CTA")

### Intentional Exceptions (documented, no fix)
- social.tsx "Create an Invite" ghost: 3-tier hierarchy below primary "Invite a friend" (guidance-conditional)
- calendar.tsx "Create an Invite" ghost: side-by-side explorer pair with "Who's Free?" ghost
- calendar.tsx "Who's Free?" ghost: exploration/browse action
- event-request/[id].tsx "Cancel" ghost in decline modal: dismiss action (closes modal)
- profile.tsx "Start something" / "View calendar" ghost: low-emphasis nudge inside card
- circle/[id].tsx "Dismiss" secondary: intentional affordance in compact banner beside primary
- settings.tsx "Got it" primary in info modal: single-CTA modal affordance, unmistakable tap target
- user/[id].tsx "Decline" secondary for friend requests: reversible action, softer than destructive

### Dual-Primary Check
- Zero screens have competing primary CTAs. All primary pairs are either mutually exclusive states or proper primary+secondary pairings.

## P2 Button/Chip SSOT Sweep (full-codebase)

### Sweep Scope
- Migrated ad-hoc Pressable-based CTA buttons to `<Button>` across 21 files (9 new + 12 prior session).
- Post-sweep: 87 `<Button>` instances across 26 files, 14 `<Chip>` instances across 7 files.
- Intentional Pressable exceptions documented: icon-only, destructive red (#EF4444), green accept (#22C55E), AnimatedPressable, LinearGradient wrappers, modal backdrops, navigation rows, segmented controls, class components.

### Key Decisions
- **No testID on Button**: Button.tsx does not expose testID in its props. Onboarding Continue/Get Started and Retry buttons with testID were SKIPPED.
- **Date picker Done buttons**: Embedded flush in overflow-hidden containers — Button's border-radius mismatches. SKIPPED in create-event-request.tsx.
- **Destructive variant gap**: Button has no "destructive" variant. All red-bg buttons (Sign Out, Block Contact, Cancel Event, Decline) remain raw Pressable. Future: add `variant="destructive"` to Button.
- **Green accept gap**: Accept buttons use #22C55E (not themeColor). SKIPPED per audit rules.

## P1 Button + Chip SSOT System (2026-02-09)

### UI Primitive Consolidation

**PROBLEM**: Button and chip/pill styling was ad-hoc across screens — each "Create" button, "Busy"/"Free?" chip, status pill, and action indicator used inline hex colors and per-instance Pressable/View styling. This caused:
- Inconsistent padding, border-radius, font-weight across identical-purpose elements
- Hex color drift (e.g., #6B7280 for "Busy" chip, #EF4444/#22C55E for status pills)
- No single place to update button/chip visual language

**FIX**:
1. Added 24 semantic tokens to DARK_COLORS + LIGHT_COLORS: button{Primary,Secondary,Ghost}{Bg,Text,Pressed,Disabled} + chip{Neutral,Muted,Accent,Status}{Bg,Text} + chipBorder
2. Created `src/ui/Button.tsx` — SSOT button primitive (primary/secondary/ghost variants, Pressable-based, token-only colors)
3. Created `src/ui/Chip.tsx` — SSOT chip/pill primitive (neutral/muted/accent/status variants, optional onPress, `color` override for status)
4. Migrated 5 target screens (discover, calendar, friends, profile, social): 14 Button instances + 12 Chip instances replace ad-hoc Pressable/View elements
5. Remaining inline hex values are contextual (availability colors, stat card accent colors, birthday pink, modal shadows) — not button/chip styling

**DOCTRINE**: Screens must use Button/Chip/Tile primitives for interactive/indicator elements. No new inline hex for button backgrounds, chip backgrounds, or pill styling.

## P0.5 Repo Doctrine Sync (2026-02-04)

### Support + FAQ Truth Pass

**PROBLEM**: Contact Support button in help-faq.tsx was dead (no-op). FAQ contained multiple false claims.

**FIX**:
1. Created `src/lib/support.ts` as SSOT for support email with `openSupportEmail()` helper
2. Wired Contact Support button to open mailto with clipboard fallback
3. Audited FAQ against actual codebase:
   - Removed false encryption claim (not implemented)
   - Removed category filter claim (no filter UI exists)
   - Removed ratings/reviews claim (no rating system)
   - Removed badge claim (no badges for event attendance)
   - Fixed Premium gating language for Recurring Events
   - Fixed navigation path discrepancy
4. Added support SLA: "We typically respond within 24-48 hours"

**FILES**: `src/lib/support.ts` (NEW), `src/app/help-faq.tsx`

**Proof tag**: `[P0_SUPPORT]`

### Password Reset Backend Fix

**PROBLEM**: Forgot password flow appeared to succeed but emails never arrived.

**ROOT CAUSE**: Backend `sendResetPassword` in auth.ts checked for RESEND_API_KEY but returned success even when not configured.

**FIX**: Changed to throw `EMAIL_PROVIDER_NOT_CONFIGURED` error when RESEND_API_KEY is missing, enabling proper debugging.

**FILES**: Backend `src/auth.ts`

**Proof tag**: `[P0_PW_RESET]`

---

## P0 Push Tap Deep-Link Parity (2026-02-03)

### Root Cause: Missing Cold Start Notification Handling

**PROBLEM**: Push notification taps were inconsistent - some routed correctly, others just opened the app with no navigation. Root cause was that `addNotificationResponseReceivedListener` only catches taps when app is in background/foreground. When app is completely closed (cold start), the listener isn't registered in time.

**FIX**: Added `Notifications.getLastNotificationResponseAsync()` call on component mount to check for cold start notifications. Created centralized `resolveNotificationRoute()` function as SSOT for all notification tap routing.

**FILES**: `src/hooks/useNotifications.ts`

### Routing Table SSOT

**CHANGE**: Created `resolveNotificationRoute(data)` function that returns `{ route, fallbackUsed, reason }`:

| Type | Route | Fallback |
|------|-------|----------|
| new_event, event_update, event_reminder, reminder, event_join, new_attendee, event_comment, comment, join_request, join_accepted, event_interest, someones_interested | `/event/:eventId` | None |
| friend_request | `/user/:userId` | `/friends` |
| friend_accepted | `/user/:friendId` or `/user/:userId` | `/friends` |
| circle_message | `/circle/:circleId` | None |
| (fallback if eventId present) | `/event/:eventId` | Yes |
| (fallback if userId present) | `/user/:userId` | Yes |
| (fallback if circleId present) | `/circle/:circleId` | Yes |

### Key Format Compatibility

**CHANGE**: Routing now handles both camelCase and snake_case payload keys:
- `eventId` OR `event_id`
- `userId` OR `user_id` OR `actorId` OR `actor_id` OR `senderId` OR `sender_id`
- `friendId` OR `friend_id`
- `circleId` OR `circle_id`

### Cold Start vs Background Handling

**CHANGE**: 
- Cold start taps: Use `router.replace()` to avoid stacking on initial route
- Background taps: Use `router.push()` for normal navigation stack
- Module-level `coldStartNotificationProcessed` flag prevents double-handling

### DEV Proof Logging

**INVARIANT**: All push taps log with canonical tag `[P0_PUSH_TAP]`:
```
[P0_PUSH_TAP] {"source":"cold_start|listener","type":"event_comment","eventId":"abc123","userId":null,"circleId":null,"routeAttempted":"/event/abc123","fallbackUsed":false,"reason":"type_event_comment"}
```

---

## Admin Console: Badge Studio + Pro Override + Ban/Delete (2026-02-01)

### BadgeKey Validation Parity (Hyphens)

**PROBLEM**: Frontend badgeKey validation regex didn't match backend, which allows hyphens.

**FIX**: Updated validation regex from `/^[a-z][a-z0-9_]*$/` to `/^[a-z0-9_-]{2,32}$/` matching backend.

**FILES**: `src/app/admin.tsx`

### Admin: Manual Badge Grant/Revoke UX

**CHANGE**: Replaced the old "all badges with toggle" UI with a more usable workflow:
- "GRANTED BADGES" section shows user's current badges with Revoke button for each
- "GRANT A BADGE" section with horizontal scrollable badge picker (active badges only)
- Already-granted badges are dimmed with checkmark
- Optional note field for gift context
- Uses `grantBadgeByKey` and `revokeBadgeByKey` endpoints

**FILES**: `src/app/admin.tsx`, `src/lib/adminApi.ts`

### Admin: Pro Override Controls

**CHANGE**: Added Pro Status section in user detail panel showing:
- RevenueCat Pro: Yes/No/Unknown
- Admin Override: ON/OFF  
- Effective Pro: computed result
- Enable/Disable override buttons with optional reason note
- Confirmation text: "RevenueCat remains source of truth. Override is for gifts/testing only."

**ENDPOINTS**: `getUserAdminStatus(userId)` → GET `/api/admin/users/:userId`, `setProOverride(userId, enabled, note?)` → POST `/api/admin/users/:userId/pro-override`

**FILES**: `src/app/admin.tsx`, `src/lib/adminApi.ts`

### Admin: Ban/Delete Confirmations

**CHANGE**: Added "USER ACTIONS" section with:
- Ban: Modal requiring reason text AND typing "BAN" to confirm
- Unban: Direct button (only shown if user is banned)
- Delete: DANGER ZONE with modal requiring typing user's email exactly to confirm
- All actions show toast feedback and refresh user status

**ENDPOINTS**: 
- `banUser(userId, reason)` → POST `/api/admin/users/:userId/ban`
- `unbanUser(userId)` → POST `/api/admin/users/:userId/unban`
- `deleteUser(userId)` → DELETE `/api/admin/users/:userId`

**FILES**: `src/app/admin.tsx`, `src/lib/adminApi.ts`

### Badge Type Alignment (isExclusive)

**CHANGE**: Replaced `isPublic` with `isExclusive` to match backend badge doctrine:
- `isExclusive: true` = Gift/exclusive badge (hidden unless granted)
- `isExclusive: false` = Public badge (visible to all)
- Updated badge definitions list to show "Exclusive" or "Public" chip
- Updated create/edit modal toggle with correct labeling

**FILES**: `src/app/admin.tsx`, `src/lib/adminApi.ts`

---

## Trust + Polish Sweep: Static Onboarding + Import Calendar + Busy Blocks (2026-02-01)

### ITEM 1: Onboarding Animation Removal

**PROBLEM**: Welcome/onboarding screens had choppy bounce/spring animations that felt jarring.

**FIX**: Removed all entrance animations by:
- Changing `smoothFadeIn()` to return `undefined` (no Reanimated entering animation)
- Removed `SlideInRight`/`SlideOutLeft` from main slide wrapper - now instant transitions

**FILES**: `src/app/welcome.tsx`

### ITEM 2: Settings "Import Calendar" Navigation

**PROBLEM**: Settings → Calendar → "Import Calendar" button navigated to help screen (`/calendar-import-help`) instead of actual import screen.

**FIX**: Changed route from `/calendar-import-help` to `/import-calendar` and updated title/subtitle to be clearer.

**FILES**: `src/app/settings.tsx`

### ITEM 3: Imported Events → Busy Block Display (eventPalette)

**PROBLEM**: Imported events from Apple/Google Calendar could display as regular colored events instead of grey busy blocks.

**FIX**: Extended `eventPalette.ts` to treat `isImported === true` OR `deviceCalendarId` present as busy events:
- Added `isImported?: boolean` and `deviceCalendarId?: string | null` to type signatures
- Updated `isGreyPaletteEvent()`, `getEventPalette()`, `assertGreyPaletteInvariant()`, `getEventBarColor()`
- All imported events now render with GREY_PALETTE (#6B7280 bar, #6B728020 bg)

**FILES**: `src/lib/eventPalette.ts`

### Invariant Preserved
Grey palette invariant now covers: `isBusy`, `isWork`, `isImported`, `deviceCalendarId != null`, legacy title="Busy", legacy flags.

---

## Friends FlatList Virtualization Tuning (2026-02-01)

### Root Cause Analysis ✓
**PROBLEM**: Friends list with 50+ friends caused scroll jank due to rendering all items at once.

**ROOT CAUSE**: Friends list was using `.map()` inside a ScrollView instead of FlatList, which:
1. Renders all items immediately on mount
2. No virtualization (items outside viewport stay in memory)
3. No batching of render cycles

### Solution — FlatList Conversion + Virtualization

**BEFORE** (lines 1618-1639):
```tsx
viewMode === "list" ? (
  filteredFriends.map((friendship, index) => (
    <FriendListItem ... />
  ))
) : (
  filteredFriends.map((friendship, index) => (
    <FriendCard ... />
  ))
)
```

**AFTER**:
```tsx
<FlatList
  data={filteredFriends}
  keyExtractor={friendKeyExtractor}  // memoized
  renderItem={viewMode === "list" ? renderFriendListItem : renderFriendCard}  // memoized
  initialNumToRender={10}
  maxToRenderPerBatch={10}
  windowSize={9}
  updateCellsBatchingPeriod={50}
  removeClippedSubviews={Platform.OS === 'android'}
  nestedScrollEnabled
  scrollEnabled={false}  // Parent ScrollView handles scrolling
  extraData={pinnedFriendshipIds}
/>
```

### Virtualization Props Explained
| Prop | Value | Rationale |
|------|-------|-----------|
| `initialNumToRender` | 10 | Render ~1 viewport worth initially |
| `maxToRenderPerBatch` | 10 | Limit batch size to prevent frame drops |
| `windowSize` | 9 | ~4.5 viewports above/below (balance memory vs scroll responsiveness) |
| `updateCellsBatchingPeriod` | 50 | 50ms batching to reduce re-render frequency |
| `removeClippedSubviews` | Android only | iOS can have clipping bugs; Android is safe |
| `scrollEnabled` | false | Nested inside ScrollView; parent handles scroll |

### Why NO getItemLayout
Row heights are **variable** due to:
- `FriendCard`: Optional bio (numberOfLines={2}), optional badge, MiniCalendar
- `FriendListItem`: Collapsible calendar section, optional badge

`getItemLayout` requires fixed/predictable heights; cannot use here.

### Memoization Added
- `friendKeyExtractor`: `useCallback((item) => item.id, [])`
- `handlePinFriend`: `useCallback` wrapper for mutation
- `renderFriendListItem`: `useCallback` with deps
- `renderFriendCard`: `useCallback` with deps

### Contacts Modal Also Tuned
Same virtualization props applied to contacts FlatList (can have hundreds of contacts).

### DEV Instrumentation
```tsx
console.time("[PERF] Friends screen first render");
// ... on data load:
console.timeEnd("[PERF] Friends screen first render");
console.log(`[PERF] Friends list count: ${filteredFriends.length}`);
```

### Verification
```
$ npm run typecheck
(no errors)
$ bash scripts/ai/verify_frontend.sh
PASS
```

---

## Frontend Full Audit — Launch Readiness (2026-02-01)

### AUDIT SUMMARY
Full walkthrough audit of frontend for launch readiness. No P0 blockers found.

### ROUTING + NAVIGATION MAP ✓
**Key Screens Verified**:
| Route | File | Purpose |
|-------|------|---------|
| `/` → `/social` | `index.tsx` | Redirect to Social (default tab) |
| `/login` | `login.tsx` | Authentication |
| `/welcome` | `welcome.tsx` | Onboarding flow |
| `/verify-email` | `verify-email.tsx` | Email verification |
| `/calendar` | `calendar.tsx` | Personal calendar (center tab) |
| `/social` | `social.tsx` | Social feed |
| `/discover` | `discover.tsx` | Reconnect/Popular/Streaks |
| `/friends` | `friends.tsx` | Friends list |
| `/profile` | `profile.tsx` | User profile |
| `/settings` | `settings.tsx` | Account settings |

**Tab Navigation** (`constants/navigation.ts`):
- Order: Discover → Calendar → Social (center) → Friends → Profile
- Routing via `BOTTOM_NAV_TABS` - single source of truth ✓
- All hrefs match Expo Router file paths ✓

### DEEP LINKS ✓
**File**: `src/lib/deepLinks.ts`

**Verified Handlers**:
- `open-invite://event/{id}` → `/event/{id}` ✓
- `open-invite://friend/{id}` → `/friend/{id}` ✓
- `open-invite://invite/{code}` → stores referral, routes to `/calendar` ✓
- `open-invite://verify-email` → `/verify-email` ✓
- Universal links (`/verify-email`, `/auth/verify`) → token extraction ✓
- `.ics` file imports → `/create?fromImport=true` ✓

**Cold Start**: `Linking.getInitialURL()` handled in `_layout.tsx:660`

### ONBOARDING MODALS / GUIDES ✓
**No stacking issue** - both modals are properly gated:

1. **EmailVerificationGateModal** (`_layout.tsx`):
   - Shows 800ms after `bootStatus === 'authed'`
   - Key: `email_verification_gate_shown:{userId}` (user-scoped) ✓
   - Only shows if `emailVerified === false`

2. **WelcomeModal** (`calendar.tsx`):
   - Shows 500ms after `bootStatus === 'authed'`
   - Key: `openinvite.welcome_modal_shown.{userId}` (SecureStore, user-scoped) ✓
   - Marks shown immediately on visibility

Both use per-user keys and won't re-show after dismissal.

### AUTH + REQUEST CONTRACT ✓
**Auth Pattern**: Cookie-based via Better Auth

**Verified in `authClient.ts`**:
- `credentials: "include"` at line 285 ✓
- `x-oi-session-token` header injection ✓
- Cookie fallback for mobile reliability ✓

**No Bearer usage** for main app-auth (only for image requests via RN Image headers - acceptable).

**Error Handling** (after admin fix):
- `api.ts` line 85: 404 on GET returns `null` (acceptable for resource lookups)
- `adminApi.ts`: now throws errors instead of swallowing ✓

### LOADING INVARIANTS ✓
**placeholderData** used in:
- `social.tsx`: feed, mine, attending queries ✓
- `friends.tsx`: friends query ✓

**Auth Gating**:
- All main screens gate on `bootStatus` before showing login prompt
- Show skeleton during `bootStatus === 'loading'` to prevent flash ✓

### PERFORMANCE HOTSPOTS ✓
**Already addressed in previous sweep**:
- `MiniCalendar`: React.memo ✓
- `FriendCard`: React.memo + useCallback ✓
- Query staleTime tuning across all main tabs ✓

### DEV / DEBUG SCREENS (P2 - Acceptable)
| Route | Accessibility | Risk |
|-------|--------------|------|
| `/debug/health` | Long-press "Settings" title | Low - hidden |
| `/design-showcase` | No route links in app | Low - unreachable |

**Recommendation**: No action needed. Routes exist in `_layout.tsx` Stack but have no in-app navigation paths.

### Verification
```
$ npm run typecheck
(no errors)
$ bash scripts/ai/verify_frontend.sh
PASS: verify_frontend
```

---

## Performance Sweep: Friends, Social, Calendar (2026-02-01)

### Root Cause Analysis ✓
**PROBLEM**: Friends tab (and to lesser extent Social/Calendar) felt sluggish with 50+ friends due to:
1. Query overfetch on every navigation/focus
2. Animation overhead on every list item
3. Inline callbacks causing unnecessary re-renders
4. No memoization on expensive components

### Solution — Query Tuning

**friends.tsx**:
- `["friends"]`: staleTime=5min, gcTime=10min, refetchOnMount=false, refetchOnWindowFocus=false, placeholderData
- `["friendRequests"]`: staleTime=1min, refetchOnMount=false, refetchOnWindowFocus=false
- `["circles"]`: staleTime=5min, refetchOnMount=false, refetchOnWindowFocus=false
- `["pinnedFriendships"]`: staleTime=5min, refetchOnMount=false, refetchOnWindowFocus=false

**social.tsx**:
- `["events", "feed"]`: staleTime=30s, refetchInterval=60s (was 30s), placeholderData
- `["events", "mine"]`: staleTime=1min, placeholderData
- `["events", "attending"]`: staleTime=1min, placeholderData
- `["friends"]`: staleTime=5min

**calendar.tsx**:
- `["friends"]`: staleTime=5min, refetchOnMount=false, refetchOnWindowFocus=false

### Solution — Component Memoization

- `MiniCalendar`: Wrapped in `React.memo`
- `FriendCard`: Wrapped in `React.memo` + `useCallback` for handlers + conditional animation (only first 5 items animate)
- `FriendListItem`: Already `React.memo` (verified)

### DEV Instrumentation
- Added `console.time("[PERF] Friends query")` / `console.timeEnd()` around friends fetch
- Added `__renderCount` tracking on `FriendCard` for DEV builds

### Verification
```
$ npm run typecheck
(no errors)
$ bash scripts/ai/verify_frontend.sh
PASS
```

---

## Admin Console User Search — Error Surfacing Fix (2026-02-01)

### Root Cause Analysis ✓
**PROBLEM**: Admin Console "Manage User Badges" user search silently shows "No users found" when backend errors occur.

**ROOT CAUSE**: `searchUsers()` in `src/lib/adminApi.ts` was catching all non-401/403 errors and returning `{ users: [] }` instead of throwing. This made it impossible for the UI to distinguish between:
- Backend returned 0 results (legitimate empty search)
- Backend returned error (500, 502, network failure, etc.)

### Solution
**adminApi.ts**:
- Remove try/catch that silently swallowed errors
- Let all errors propagate to caller
- Added minimum 2-character query length requirement

**admin.tsx**:
- Added `searchError` state to track search failures
- Error UI displays in red when search fails
- "No users found" only shows when search succeeds with 0 results

### Auth Verification
- `credentials: "include"` is correctly set in `authClient.$fetch` (line 280)
- Cookie header is explicitly set as fallback
- x-oi-session-token header is injected for mobile reliability

### Endpoint Details
- Endpoint: `GET /api/admin/users/search?q=<query>`
- Method: GET
- Auth: Cookie-based via authClient (credentials: include)
- Response: `{ users: UserSearchResult[] }`

### Verification
```
$ npm run typecheck
(no errors)
$ bash scripts/ai/verify_frontend.sh
PASS
```

---

## P1: Event Details Visibility Row — Host-Only (2026-02-01)

### Root Cause Analysis ✓
**PROBLEM**: Non-host viewers of an event can see the "Visibility" row (All Friends / Specific Groups), which is only relevant to the event host.

**ROOT CAUSE**: The Visibility section in `src/app/event/[id].tsx` (lines 1017-1056) was unconditionally rendered for all viewers.

### Solution
Wrapped the Visibility section in an `isMyEvent` conditional:
```tsx
{/* Visibility - Host only */}
{isMyEvent && (
  <View className="py-3 border-t" style={{ borderColor: colors.border }}>
    {/* ... visibility row content ... */}
  </View>
)}
```

### Host Identification
- `isMyEvent = event?.userId === session?.user?.id` (line 471)
- This matches the existing pattern used for edit buttons, delete, etc.

### Layout Integrity
- Divider line (`border-t`) is inside the conditional, so no orphan lines
- Next section (Spots/Capacity) gets border-t from its own View

### Verification
```
$ npm run typecheck
(no errors)
$ bash scripts/ai/verify_frontend.sh
PASS
```

---

## P1-B: Founder Badge Visibility — Hide if Ineligible (2026-02-01)

### Root Cause Analysis ✓
**PROBLEM**: Founder badge appears in the "Locked" section for users who cannot earn it.

**ROOT CAUSE**: The badge catalog filter at line 114 of achievements.tsx did not exclude the Founder badge from `lockedBadges`. Founder badge is manually granted to early adopters and should not be visible to users who don't have it.

### Solution
**One-line change** in `src/app/achievements.tsx`:
```typescript
// Before:
const lockedBadges = badges.filter((b) => !b.unlocked);

// After:
const lockedBadges = badges.filter((b) => !b.unlocked && b.badgeKey !== "founder");
```

### Badge Identifier
- Key: `founder` (case-sensitive badgeKey match)
- The filter excludes Founder badge from locked section only
- If user HAS the badge unlocked, it shows in "Unlocked" section normally

### No Layout Break
- Empty state handles 0 badges gracefully (existing logic)
- Footer shows `{badges.length}` which reflects total catalog (unchanged)
- Locked section simply omits Founder if user lacks it

### Verification
```
$ npm run typecheck
(no errors)
$ bash scripts/ai/verify_frontend.sh
PASS
```

---

## P1-A: First-Login Welcome Modal (2026-02-01)

### Implementation ✓
**GOAL**: Add single first-login Welcome modal on Home Calendar that shows ONLY ONCE per user, adapts content based on email verification status, and never reappears.

### Solution

**Created new component**: `src/components/WelcomeModal.tsx`
- Uses SecureStore with user-scoped key: `openinvite.welcome_modal_shown.<userId>`
- Key is set immediately when modal becomes visible (ensures persistence even if user kills app)
- Adapts content based on `session?.user?.emailVerified`:
  - **Unverified**: Verify Email CTA, Resend Email secondary, Skip
  - **Verified**: Find Friends CTA, Create Your First Invite secondary, Skip

**Integration in calendar.tsx**:
- Added state: `showWelcomeModal`, `welcomeModalChecked`
- useEffect checks `hasWelcomeModalBeenShown()` once after `bootStatus === 'authed'`
- 500ms delay before showing to let screen settle
- Modal placed after Busy Modal in JSX

### Persistence Pattern
```typescript
// SecureStore key format (matches existing guidance pattern)
const WELCOME_MODAL_SHOWN_PREFIX = "openinvite.welcome_modal_shown.";
// Key sanitized for SecureStore: [A-Za-z0-9._-]+
```

### No Modal Stacking
- Welcome modal only checks on first authed load (`welcomeModalChecked` guard)
- Once shown, flag is immediately persisted
- Existing verification gating (social.tsx) is separate concern

### Verification
```
$ npm run typecheck
(no errors)
$ bash scripts/ai/verify_frontend.sh
PASS
```

---

## P1-C: Subscription UI Cleanup — No Trial + Simplified Features (2026-02-01)

### Root Cause Analysis ✓
**PROBLEM**: Subscription screens promised features not actually enforced and mentioned "free trial" which doesn't exist in current App Store config.

**ROOT CAUSE**:
1. UI copy mentioned "14-day free trial" and "2-week free trial" when no trial is configured
2. Feature comparison tables listed many features (circles, insights, analytics, etc.) that aren't actually enforced
3. Co-hosts listed as Pro feature but was removed from codebase

### FIX: Align UI with Reality

**UpgradeModal.tsx**: Removed "• 2-week free trial" from pricing info
**subscription.tsx**: 
- Changed "14-day free trial" to "Unlimited hosting" on yearly plan
- Changed CTA "Start Pro Trial" to "Subscribe Now"
- Simplified featureCategories from 4 groups (16 features) to 1 group (1 feature): Events per Month
- Removed unused icon imports
**paywall.tsx**:
- Removed "Add co-hosts" from FREE_FEATURES
- Removed "Unlimited co-hosts" from PREMIUM_FEATURES
- Updated copy to "Host up to 3 events per month"
**invite.tsx**: Removed "They get 1 week free trial" from referral rewards

### Current Enforced Reality
- Free: Host up to 3 events per 30-day rolling window
- Founder Pro: Unlimited hosting
- That's it. Everything else is aspirational.

### Apple StoreKit Note
If App Store purchase sheet shows old icon/description, that's App Store Connect metadata - cannot be fixed in app code. Only the in-app copy is corrected.

### Verification
```
$ npm run typecheck
(no errors)
$ bash scripts/ai/verify_frontend.sh
PASS
```

---

## P0: Apple Login Cookie Overwrite Bug (2026-01-31)

### Root Cause Analysis ✓
**PROBLEM**: Apple Sign-In succeeded but users got "Your session expired" during onboarding/profile setup.

**ROOT CAUSE**: Cookie capture code had a **substring fallback** that could match ANY key containing "session_token":
```typescript
// DANGEROUS FALLBACK (REMOVED):
const sessionKey = Object.keys(parsed).find(k => k.includes('session_token'));
```
This could capture UUID session IDs (like `abc123-def456-...`) instead of actual signed session tokens.

**SYMPTOM CHAIN**:
1. Apple auth backend returns mobileSessionToken (valid) but also stores session ID somewhere
2. Substring fallback picks up the wrong value
3. UUID stored as session token
4. /api/auth/session returns 401 missing_token
5. User sees "session expired" error

### FIX: Token Validation + Exact Key Matching

**New validator: `isValidBetterAuthToken(token)`** in authClient.ts:
- Rejects empty/non-string values
- Rejects tokens shorter than 20 chars
- Rejects UUID pattern (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`)
- Rejects strings without a dot (Better Auth tokens are signed like JWTs)

**captureAndStoreCookie()**: Removed substring fallback, uses EXACT key match only, validates before storing

**setExplicitCookieValueDirectly()**: Now validates and returns boolean (false = rejected)

**setExplicitCookiePair()**: Now validates and returns Promise<boolean> (false = rejected)

**welcome.tsx**: Validates tokenValue before any storage, shows user-friendly error on validation failure

### Verification
```
$ npm run typecheck
(no errors)
$ bash scripts/ai/verify_frontend.sh
PASS
```

### Test Plan
1. Apple Sign-In on physical device → complete profile → no "session expired"
2. Confirm /api/auth/session stays 200 during onboarding
3. Email/password login still works (regression check)

---

## P0: Legacy Onboarding Modal Still Showing (2026-01-31)

### Root Cause Analysis ✓
**PROBLEM**: Old "Welcome to Open Invite! / Get Started Guide / Maybe later" modal still appeared for new users.

**ROOT CAUSE**: calendar.tsx had a `checkFirstLogin` useEffect that showed the old modal for users with 0 friends AND 0 events, even though the new interactive onboarding (useOnboardingGuide) was supposed to be the only prompt.

### FIX: Disable Legacy Modal + Migration

**calendar.tsx**: 
- `checkFirstLogin` useEffect now returns early (disabled)
- Added one-time migration: sets `get_started_dismissed:userId` flag for all users
- Added DEV log explaining legacy guide is disabled

**Active onboarding**: `useOnboardingGuide` in src/hooks/useOnboardingGuide.ts remains the ONLY onboarding system

### Verification
- Old "Welcome to Open Invite" modal never shows
- New interactive onboarding ("Start with one action") still works

---

## P0: Business Legacy Complete Purge (2026-01-30)

### Scope
**INVARIANT**: `rg -n "businessEvents|isBusinessEvent|\bbusiness\b" src` must return ZERO matches.

### Files Purged
1. **src/lib/features.ts** — Replaced `businessAccounts` flag with neutral `reserved` placeholder
2. **src/lib/activeProfileContext.tsx** — Removed all business profile fields (`businessProfiles`, `isBusinessProfile`, `canManageActiveBusiness`, `isOwnerOfActiveBusiness`, `activeBusinessRole`) and hooks (`useIsBusinessProfile`, `useActiveBusinessRole`)
3. **src/components/ProfileSwitcher.tsx** — Removed `Building2` import, `businessProfiles` filtering, business UI section; simplified to personal-only
4. **src/app/account-center.tsx** — Removed `Building2` import, `businessProfiles`/`ownedBusinesses`/`memberBusinesses` variables, "Your Businesses" and "Team Access" sections
5. **src/app/notification-settings.tsx** — Removed `businessEvents` field from `NotificationPreferences` interface
6. **src/app/profile.tsx** — Changed comment from "business mode" to neutral wording
7. **src/app/create.tsx** — Changed comment from "business profile redirect" to neutral wording
8. **src/app/social.tsx** — Removed `businessEventsData` variable and comment
9. **src/components/MiniCalendar.tsx** — Removed "and business cards" from comment
10. **src/app/friends.tsx** — Removed unused `Building2` import
11. **src/ui/icons.tsx** — Removed duplicate `Building2` export (`ion("business-outline")`) at bottom of file

### Verification
```
$ rg -n "businessEvents|isBusinessEvent|\bbusiness\b" src
(exit code 1 - ZERO matches)

$ bun run typecheck
✓ No errors
```

### Invariant Enforcement
Business references are now permanently banned from `src/**`. Any future ripgrep match for the pattern above indicates a regression.

---

## P0: Busy/Work Grey Single Source of Truth (2026-01-30)

### Root Cause Analysis ✓
**PROBLEM**: Busy and Work events were rendering with orange/theme colors in some calendar views (month bars, dots) instead of grey.

**ROOT CAUSE**: Multiple divergent render paths for event colors:
1. `calendar.tsx` had `getEventColor()` that checked `isBusy` but NOT `isWork`
2. `FeedCalendar.tsx` had its own `getEventColor()` with different logic
3. `EventListItem` used a separate `getBusyColors()` function
4. Month view cells (CompactDayCell, StackedDayCell, DetailsDayCell) all used `getEventColor()` directly

**FIX**: Created single source of truth module:

### src/lib/eventPalette.ts (NEW)
- `GREY_PALETTE`: `{ bar: "#6B7280", bg: "#6B728020", icon: "#6B7280", text: "#6B7280" }`
- `BIRTHDAY_PALETTE`: `{ bar: "#FF69B4", bg: "#FF69B420", ... }`
- `isGreyPaletteEvent(event)`: Returns true if `isBusy === true OR isWork === true`
- `getEventPalette(event, themeColor)`: INVARIANT function - checks isBusy/isWork FIRST, returns grey palette
- `assertGreyPaletteInvariant(event, palette, source)`: DEV-only assertion logs `[BUSY_GREY_INVARIANT_FAIL]`
- `getEventBarColor(event, themeColor)`: Simplified helper delegates to `getEventPalette().bar`

### src/app/calendar.tsx
- Line 44: Import `getEventPalette, getEventBarColor, assertGreyPaletteInvariant` from `@/lib/eventPalette`
- Line 103-108: `getEventColor()` now delegates to `getEventBarColor()` (deprecation wrapper)
- Line 130-131: Removed old BUSY_PALETTE, getBusyColors, getEventPalette definitions
- Line 603-607: `EventListItem` now uses `getEventPalette({ ...event, isWork }, themeColor)` for palette
- Line 609-611: DEV assertion via `assertGreyPaletteInvariant()`

### src/components/FeedCalendar.tsx
- Line 10: Import `getEventBarColor` from `@/lib/eventPalette`
- Line 24-34: `getEventColor()` now checks isBusinessEvent first, then delegates to `getEventBarColor()`

### Busy Creation Payload (VERIFIED)
- Line 1299 in calendar.tsx: `createBusyMutation` sends `isBusy: true` in API payload
- Field is correctly persisted by backend and returned in event objects

### Badge Pill-Only Invariant
- **Trophy icon deprecated**: Line 114 in src/ui/icons.tsx has "DO NOT USE" comment
- **Badge overlays removed**: friend/[id].tsx and user/[id].tsx have INVARIANT comments, pill-only display
- **Premium overlay kept**: profile.tsx Crown overlay is for premium status (different from badge)

**VERIFICATION**: `bun run typecheck` passes, `verify_frontend.sh` passes, `rg -n "Trophy" src/app src/components src/ui` shows only comments/deprecation

## Apple Sign-In Cookie Storage Fix (2025-01-29)

### Root Cause Analysis ✓
**PROBLEM**: Apple Sign-In was not establishing a valid session cookie in production/TestFlight, causing authenticated API calls to fail after sign-in.

**ROOT CAUSE** (Two issues):
1. **Double-wrapped cookie value**: `setExplicitCookiePair()` was being called with already-formatted cookie pair (`__Secure-better-auth.session_token=TOKEN`), but the function internally formats the value again, resulting in malformed cookie: `__Secure-better-auth.session_token=__Secure-better-auth.session_token=TOKEN`
2. **Module cache not updated**: After storing to `SESSION_COOKIE_KEY` (open-invite_session_cookie), `refreshExplicitCookie()` only read from Better Auth's key (`open-invite_cookie`), leaving the module-level `explicitCookieValue` cache null.

**EXACT CODE PATHS**:

### src/lib/authClient.ts
- Line 358-420: `refreshExplicitCookie()` - NOW checks SESSION_COOKIE_KEY as fallback
  - Priority 1: Read from Better Auth's `open-invite_cookie` (JSON format)
  - Priority 2: Read from `SESSION_COOKIE_KEY` (open-invite_session_cookie) for Apple Sign-In path
  - Logs which source was used: "Better Auth storage" vs "SESSION_COOKIE_KEY (Apple Sign-In path)"
  
- Line 421-430: NEW `setExplicitCookieValueDirectly(cookiePair)` - Sets module cache directly
  - Avoids read-back delay from SecureStore
  - Takes full cookie pair format: `__Secure-better-auth.session_token=TOKEN`

### src/app/welcome.tsx (handleAppleSignIn)
- Line 520-590: Complete rewrite of cookie extraction and storage logic
  - **Token extraction priority**: 
    1. `data.mobileSessionToken` (canonical Better Auth format)
    2. `data.token` (legacy format)
    3. `data.session.token` (nested format)
    4. Extract from Set-Cookie header (RN fallback)
  - **Storage sequence**:
    1. `setExplicitCookiePair(tokenValue)` - Stores to SecureStore with proper formatting
    2. `setExplicitCookieValueDirectly(fullCookiePair)` - Sets module cache immediately
    3. `setAuthToken(tokenValue)` - Legacy token storage
    4. `refreshExplicitCookie()` - Verify cache is working
  - **Error handling**: If no token found in any location, throws user-friendly error

**KEY FIX DETAILS**:
- `setExplicitCookiePair(tokenValue)` now receives ONLY the token, not the full cookie pair
- Module cache is set directly after storage to avoid SecureStore read-back timing issues
- `refreshExplicitCookie()` now has SESSION_COOKIE_KEY as a fallback source

**AUTH_TRACE LOGS** (DEV only):
- `[AUTH_TRACE] Apple Sign-In: using mobileSessionToken from response`
- `[AUTH_TRACE] Apple Sign-In: Cookie stored in SecureStore`
- `[AUTH_TRACE] Apple Sign-In: Cookie cache set directly`
- `[AUTH_TRACE] Apple Sign-In: Cookie cache verified after refresh`
- `[refreshExplicitCookie] Cookie cached from SESSION_COOKIE_KEY (Apple Sign-In path)`

**VERIFICATION**: TypeScript passes, verify_frontend.sh passes

## Promo Code Redemption Feature (2025-01-29)

### Redeem Code Flow ✓
**FEATURE**: Users can redeem promo codes (like AWAKEN for church launch) to unlock premium subscription directly from the app.

**EXACT CODE PATHS**:
- src/app/account-center.tsx
  - Line 15-26: Added Gift icon import
  - Line 477-496: Added "Redeem Code" button below General Settings (haptics, Gift icon, routes to /redeem-code)
  
- src/app/redeem-code.tsx (NEW FILE, 216 lines)
  - Line 1-16: Imports (React, RN, router, icons, hooks, API client, toast)
  - Line 30-40: State (code input, isSubmitting, successData)
  - Line 42-95: handleRedeem function with POST /api/promo/redeem
    - Line 47: Normalizes code (trim + uppercase)
    - Line 49: DEV log `[DEV_DECISION] redeem_code_submit normalizedCode=...`
    - Line 55-60: POST to /api/promo/redeem with { code }
    - Line 63: DEV log `[DEV_DECISION] redeem_code_result success=true expiresAt=...`
    - Line 65-66: Success state + haptics + toast "Premium unlocked"
    - Line 68-69: Invalidate entitlements/subscription queries
    - Line 71-73: Auto-navigate back after 2 seconds
    - Line 75-95: Error handling with mom-safe messages
      - 401: "Please log in again and try"
      - 404: "That code isn't valid"
      - 400 (already used): "You've already used this code"
      - Fallback: "Something went wrong. Please try again"
    - Line 77: DEV log `[DEV_DECISION] redeem_code_error status=... message=...`
  - Line 102-110: formatExpiryDate helper (ISO to "January 29, 2027")
  - Line 112: Button disabled logic (empty, submitting, or not authed)
  - Line 114-210: UI (SafeAreaView, header with back button, scroll view, Tag icon, description, input, success banner, redeem button, auth gate message)
    - Line 138-146: Tag icon in colored circle
    - Line 148-154: Subtitle "Enter a code from your community to unlock premium"
    - Line 156-181: TextInput with autoCapitalize="characters", maxLength=32, editable only when authed
    - Line 183-197: Success banner with green background, expiry date
    - Line 199-210: Redeem button (theme color, disabled state, loading spinner)
    - Line 212-218: Auth gate message if bootStatus !== 'authed'

**BACKEND CONTRACT**:
- Endpoint: POST https://open-invite-api.onrender.com/api/promo/redeem
- Request: `{ code: "AWAKEN" }` (normalized: trim + uppercase)
- Success (200): `{ success: true, entitlement: "premium", expiresAt: "2027-01-29T..." }`
- Errors:
  - 401: User not authenticated
  - 404: Code not found/invalid
  - 400: Code already redeemed or invalid input

**UX DECISIONS**:
- Mom-safe language: No technical jargon like "entitlement" in UI
- Calm error messages: "That code isn't valid" instead of "404 Not Found"
- Input normalized: Trim whitespace, convert to uppercase automatically
- Success feedback: Toast + inline banner with formatted expiry date
- Auto-navigate: Returns to Account Center after 2 seconds on success
- Auth gating: Disabled state + message if user not logged in

**DEV LOGS**:
- `redeem_code_submit`: When user taps Redeem, logs normalized code
- `redeem_code_result`: On success, logs expiresAt timestamp
- `redeem_code_error`: On error, logs HTTP status and error message

**VERIFICATION**: `npm run typecheck && bash scripts/ai/verify_frontend.sh` PASSED

## Sprint Pack V2 Entitlement-Smart Subscription UI (2025-01-29)

### Subscription UI Entitlement Gating Pattern ✓
**ROOT CAUSE**: Settings subscription section could potentially flash "Free" label to Pro users during entitlement loading, and "Founder Pro" label was inconsistent with "Subscription" section header.

**EXACT CODE PATHS**:
- src/app/settings.tsx
  - Line 1538: Section header "SUBSCRIPTION" (already correct)
  - Line 1540-1545: Loading gate with spinner while entitlementsLoading=true
  - Line 1564: Row label showed "Founder Pro" for premium users (changed to "Subscription")
  - Line 1567: Subtitle shows "Thank you for your support!" for Pro, "Free" for free users
  - Line 1574: Upgrade CTA gated with {!userIsPremium && (

**WHY IT COULD FLASH**: Without loading gate, subscription section could render with userIsPremium=false briefly before entitlements hook resolves, showing "Free" label to Pro users.

**FIX APPLIED**:
1. **Loading State Gate** (already present): Entire subscription section wrapped in `{entitlementsLoading ? <Loading spinner> : <Actual content>}` to prevent any UI from rendering until entitlements resolved
2. **Consistent Labeling**: Changed "Founder Pro" label to "Subscription" for Pro users (line 1564) to match section header
3. **DEV Logs Added**:
   - Line 1543: `[DEV_DECISION] pro_ui_gate screen=settings state=loading reason=entitlements_fetching` (during load)
   - Line 1549: `[DEV_DECISION] pro_ui_gate screen=settings state=(pro|free) reason=entitlements_loaded_isPremium=...` (after load)
   - Line 1574: `[DEV_DECISION] pro_cta_hidden screen=settings hidden=(true|false)` (upgrade CTA visibility)

**FRIEND PIN POLISH**:
- src/app/friends.tsx line 396: Pin action background already green (#10B981) matching CircleCard pin
- Line 399: Added `[DEV_DECISION] friend_pin_style_ok ok=true color=#10B981 icon=Pin` log
- Pin icon is non-destructive green, matching group pin UX

**INVARIANTS VERIFIED**:
- Pro users see: "Subscription" label + "Thank you for your support!" subtitle + NO upgrade CTA
- Free users see: "Plan" label + "Free" subtitle + upgrade CTA shown
- Loading state shows: "Loading subscription status..." spinner, no premature labels
- Friend pin swipe action: green background, Pin icon, not red or destructive

**VERIFICATION**: `npm run typecheck && bash scripts/ai/verify_frontend.sh` PASSED

## Sprint Pack V2 Legacy Group Text Removal (2025-01-29)

### Legacy Group Name Display Filter Pattern ✓
**ROOT CAUSE**: Database records from older versions of the app contained group names like "LEGACY GROUP" which were displayed verbatim in UI, causing confusing user-facing text.

**EXACT CODE PATHS**:
- src/app/friends.tsx
  - Line 280: `{m.group.name}` in list view group badges
  - Line 463: `{m.group.name}` in detailed view group badges
  - Line 1636: `{selectedGroup.name}` in filter header
  - Line 2045: `{group.name}` in group list items
  - Line 2168: `{group.name}` in add-to-group modal
  - Line 2288: `{editingGroup.name}` in edit group modal header
- src/app/friend/[id].tsx
  - Line 719: `{membership.group.name}` in Groups Together section
  - Line 935: `{group.name}` in Add to Group modal

**WHY LEGACY TEXT APPEARED**: Backend `/api/groups` endpoint returns `FriendGroup` objects with `name` field directly from database. Old records had literal "LEGACY GROUP" text which frontend rendered without filtering.

**FIX APPLIED**:
1. Created `cleanGroupName()` helper in src/lib/displayHelpers.ts:
   - Removes "LEGACY GROUP", "Legacy Group", "legacy group" (case-insensitive)
   - Removes "(LEGACY)" and "[LEGACY]" patterns
   - Returns "Group" if cleaning removes entire name
   - Logs all cleanings with `[DEV_DECISION] legacy_group_text_removed` in DEV mode
2. Applied `cleanGroupName()` to all 8 group name render locations across friends.tsx and friend/[id].tsx
3. Groups Together data source verified: Uses `/api/groups` endpoint for friend groups (not circles), data comes from `friendship.groupMemberships` array

**INVARIANTS ADDED**:
- DEV log in cleanGroupName(): `[DEV_DECISION] legacy_group_text_removed count=1 original="..." cleaned="..."`
- DEV log in friend/[id].tsx: `[DEV_DECISION] groups_together_source kind=friend_groups reason=uses_/api/groups_endpoint_for_shared_memberships`
- DEV log for empty state: `[DEV_DECISION] groups_together_empty_state shown=true reason=no_shared_memberships`

**VERIFICATION**: `npm run typecheck && bash scripts/ai/verify_frontend.sh` PASSED

## Sprint Pack V2 Event Editing Consistency (2025-06)

### Edit Event UX Alignment Pattern ✓
**ROOT CAUSE**: Edit Event (src/app/event/edit/[id].tsx) had diverged from Create Event (src/app/create.tsx) UX patterns:
1. **Time UI inconsistency**: Edit used modal-based date/time pickers (separate modals triggered by buttons showing clock/calendar icons), Create used inline compact DateTimePicker
2. **Private visibility option**: Edit had 3 visibility options (All Friends, Groups, Private), Create only has 2 (All Friends, Groups)
3. **Co-hosts feature**: Edit had full co-hosts section (button, modal picker, mutations, state), Create has no co-hosts support

**FIX APPLIED**:
- **Time UI**: Replaced modal pickers with inline compact DateTimePicker matching Create pattern (lines 358-443)
  - Pattern: Single card with START row (date picker + time picker) and END row (date picker + time picker) side-by-side
  - Removed state: showDatePicker, showTimePicker
  - Removed modal components and handlers
- **Private button**: Removed entire Private Pressable from visibility options (lines 420-435)
  - TypeScript type narrowed from `"all_friends" | "specific_groups" | "private"` to `"all_friends" | "specific_groups"`
- **Co-hosts feature**: Complete removal (Option A - preferred minimal path)
  - Removed UI: Co-hosts section, Add Host button, host picker modal
  - Removed state: selectedHostIds, showHostPicker, showSoftLimitModal
  - Removed queries: friends query (GetFriendsResponse)
  - Removed mutations: updateHostsMutation
  - Removed functions: toggleHost, saveHosts, handleSoftLimitUpgrade, handleSoftLimitDismiss
  - Removed components: SoftLimitModal usage
  - Removed imports: Modal, Image, Clock, Calendar, Lock, UserPlus, X, CloudDownload

**INVARIANTS ADDED**:
- DEV decision log: [DEV_DECISION] edit_event_time_ui mode=inline_compact_matching_create
- DEV decision log: [DEV_DECISION] edit_event_private_removed (after visibility options)
- DEV decision log: [DEV_DECISION] edit_event_host_section mode=removed_for_consistency (after capacity section)

**CODE PATHS**:
- src/app/event/edit/[id].tsx (891 → ~554 lines)
  - Lines 1-30: Import cleanup
  - Lines 75-82: State variable cleanup
  - Lines 86: Removed useSubscription hook
  - Lines 110-125: Removed co-hosts loading from useEffect
  - Lines 130-135: Removed friends query
  - Lines 171-195: Removed updateHostsMutation
  - Lines 198-223: Removed handler functions
  - Lines 358-443: Time UI transformation
  - Lines 420-435: Private button removal
  - Lines 502: Co-hosts section removal point
  - Lines 550-end: Modal components removed

**VERIFICATION**: `npm run typecheck && bash scripts/ai/verify_frontend.sh` PASSED

## Sprint V1.1 UX Polish Patterns (2025-06)

### Home Calendar Pill Removal ✓
CHANGE: Removed event count pill from Calendar selected date header (was "{selectedDateEvents.length} event(s)")
NOTE: Social tab "X plans in 14 days" line was mistakenly removed - restored.
CODE PATH: 
- src/app/calendar.tsx (Selected Date Events header, lines ~2315-2340)
- src/app/social.tsx (plansIn14Days useMemo + Micro Social Proof Line render)

### Coachmark Permanent Dismissal Pattern
- **Migration**: AsyncStorage → SecureStore for cross-session persistence
- **Versioned keys**: `guide_friends_add_people_v1`, `guide_create_first_plan_v1` (version suffix allows reset)
- **loadedOnce gating**: shouldShowStep gates on loadedOnce to prevent flash
- **DEV decision logs**: All state changes logged with `[DEV_DECISION]` prefix
- **Implementation location**: `src/hooks/useOnboardingGuide.ts`

### Pin Friend Query Invalidation Pattern
- **Consistency**: invalidateQueries for `["pinnedFriendships"]` after pin mutation
- **DEV logs**: All pin operations logged for debugging
- **UI color**: Always #10B981 green (not conditional on pin state)
- **Implementation location**: `src/app/friends.tsx`, `src/components/FriendCard.tsx`

### Subscription Section Entitlement-Smart Pattern
- **Gate on loading**: Show "Loading subscription status..." while entitlementsLoading
- **Truthful display**: Show "Founder Pro" for userIsPremium, "Free" otherwise
- **No flash**: Entire section gated on entitlements being loaded
- **DEV decision log**: Logs state, entitlement on render
- **Implementation location**: `src/app/settings.tsx` SUBSCRIPTION section

### Work Schedule Block2 Persistence Pattern
- **Default values on add**: When adding block2, save default times (13:00-17:00) immediately
- **Prevents data loss**: User can navigate away without picking times and block2 persists
- **DEV logs**: Log block2 add/remove operations
- **Implementation location**: `src/app/settings.tsx` toggleBlock2 function

### Emoji Icon Validation Pattern
- **Reject non-emoji**: Clear input if no emoji graphemes detected
- **DEV log on reject**: Log rejected non-emoji input in DEV mode
- **Implementation location**: `src/app/create.tsx` customEmojiInput onChangeText

## Work Schedule Block2 Auto-Expand Pattern (Canonical)

- **First-load initialization**: useEffect with ref guard syncs expandedBlock2Days Set from loaded schedule data
- **Guard pattern**: `didSyncBlock2Ref.current` prevents overwriting user's manual expand/collapse after initial sync
- **Data-derived state**: `hasBlock2` computed as `expandedBlock2Days.has(day) || (block2StartTime && block2EndTime)`
- **Mutation contract**: toggleBlock2 collapse sends `{ block2StartTime: null, block2EndTime: null }` (no empty strings)
- **UI stability**: Expansion state derived from data on load, user-controlled thereafter (no flicker)
- **Implementation location**: `src/app/settings.tsx` (useEffect after workScheduleData query, toggleBlock2 handler)

## Social Feed Discovery Pattern (Canonical)

- **Discovery-first principle**: Social feed excludes events where user has taken action (going/interested RSVP) or is the host
- **Filtering logic**: Exclude if `viewerRsvpStatus === "going" | "interested"`, `userId === viewerUserId`, or `eventId in myEventIds/attendingEventIds`
- **Implementation location**: `src/app/social.tsx` allEvents useMemo, applied to feedEvents before deduplication
- **User benefit**: Feed shows only new discovery opportunities, reduces redundancy with Calendar/Attending views
- **Pattern**: Apply filter → deduplicate → render (preserves chronological order)

## Get Started Guide Persistence Pattern (Canonical)

- **Per-user dismissal**: AsyncStorage key format `get_started_dismissed:${userId}` (not global GUIDE_SEEN_KEY_PREFIX)
- **Usage signal gating**: Only show if `friendsCount === 0 AND totalEventsCount === 0` (true new users)
- **Persistence scope**: Survives logout/login for same user (authBootstrap.ts only clears SESSION_CACHE_KEY, not get_started keys)
- **Data loading check**: useEffect waits for `friendsData && calendarData` before deciding whether to show
- **Implementation location**: `src/app/calendar.tsx` checkFirstLogin useEffect (positioned after calendarData query definition)
- **User benefit**: Established users never see "Getting Started" again, prevents onboarding fatigue

## Social Calendar Date Modal Pattern (Canonical)

- **Bottom sheet presentation**: Use `presentationStyle="pageSheet"` for iOS native behavior (Android: standard modal)
- **Animation**: `animationType="slide"` (not "fade") for sheet sliding from bottom
- **Layout**: Parent View with `justify-end`, Pressable overlay for dismiss, Animated.View for content
- **Safe area**: `paddingBottom: 34` for home indicator clearance on iOS
- **User benefit**: Calendar tiles remain visible during date browsing, non-blocking UX
- **Implementation location**: `src/components/FeedCalendar.tsx` Day Events Modal (lines ~518-650)

## Friend Profile UX Pattern (Canonical)

- **Tab order principle**: Information hierarchy = Bio → Calendar → Groups → Notes → Open Invites
- **Calendar prominence**: Friend availability (calendar) shown early (position 2) for scheduling context
- **Notes as reference**: Personal notes demoted to position 4 (utility vs primary information)
- **Groups central**: Shared groups remain position 3 as key relationship context
- **Actions last**: Open Invites (action-oriented) stay last to separate discovery from reference
- **Animation flow**: Progressive delays (15ms → 25ms → 50ms) for smooth visual entrance

## Auth Contract (Canonical)

- Authenticated API calls must use the Better Auth session cookie: `__Secure-better-auth.session_token`.
- In React Native/Expo, the cookie header must be sent as lowercase `cookie` (uppercase `Cookie` can be dropped).
- Authed React Query calls must be gated on `bootStatus === 'authed'` (not `!!session`) to prevent 401 storms during transitions.
- **Subscription query gating**: `useSubscription` query must be gated with `enabled: bootStatus === 'authed'` to prevent post-logout 401s.
- **Email verification toast throttling**: `guardEmailVerification` throttles toasts to max 1 per 3 seconds to prevent spam.
- **API 401/403 logging**: Use `console.log` (not `console.error`) for expected auth failures to avoid red console overlays in DEV.
- **Session persistence on cold start**: `ensureCookieInitialized()` MUST be awaited before `bootstrapAuth()` to prevent race condition where API call fires before cookie is loaded from SecureStore.
- **Single authority for cookie init**: `ensureCookieInitialized()` is called ONLY from `authBootstrap.ts` Step 0/4. No fire-and-forget calls on module load. This prevents race conditions and ensures deterministic boot order.
- **Apple Sign-In cookie**: React Native doesn't auto-persist Set-Cookie headers; must manually extract from header or response body and store via `setExplicitCookiePair()`. Regex extracts cookie value only (up to semicolon), not Path/HttpOnly/etc attributes.
- **Cookie injection doctrine (smoke tests)**: When passing `SESSION_COOKIE_VALUE` to scripts, normalize both forms: (1) raw token `abc123...`, (2) full pair `__Secure-better-auth.session_token=abc123...`. Always send as `-H "cookie: ; __Secure-better-auth.session_token=<token>"` (lowercase, leading '; '). Never duplicate cookie name or header.

## RSVP Type Contract (Canonical)

- Frontend RSVP states: `"going" | "interested" | "not_going"` (no "maybe")
- Backend may return "maybe" for legacy data → normalize to "interested" at boundary
- Normalization location: `src/lib/offlineSync.ts` (normalizeRsvpStatus helper), `src/app/event/[id].tsx` (myRsvpStatus assignment)
- Offline infrastructure enforces type safety: offlineQueue, offlineStore, offlineSync all exclude "maybe"

## Ruthless Simplicity Pattern (Canonical)

- Phase 1C (2026-01-27): Removed Social feed filter pills (All/Friends/Circles/Hosting/Going) to reduce cognitive load
- Discovery feed shows all events without client-side filtering
- Collapsible sections (Today/Tomorrow/This Week/Upcoming) retained for scannable structure
- Principle: Remove features that add complexity without proportional user value
- Impact: Cleaner UI, simpler codebase, pure discovery experience

## Availability Indicator Contract (Canonical)

- **Never lie principle**: Unknown availability shows neutral (no outline), not false positive
- **Conflict detection**: `(eventStart < otherEnd) AND (eventEnd > otherStart)` — standard overlap formula
- **Self-exclusion**: Same event ID excluded from conflict check (event doesn't conflict with itself)
- **Data source**: User's calendar = created events (`myEventsData`) + attending events (`attendingData`)
- **Visual encoding**: GREEN border (#22C55E) = free, RED border (#EF4444) = busy, no border = unknown
- **Edge case**: Event with missing endTime treated as point event (1 minute duration)

## Activity Feed Avatar + Routing Contract (Canonical)

- **Avatar fallback chain**: `actorAvatarUrl || actorImage || senderAvatarUrl || userAvatarUrl || avatarUrl || image`
- **Initials fallback**: If no valid URL, derive displayName from `actorName || notification.title.split(' ')[0]`
- **Never blank**: Avatar shows either remote image, initials, or type icon — never empty circle
- **URL validation**: Check `avatarUrl.startsWith('http')` to ensure valid remote URL (Cloudinary compatible)
- **Tap routing priority**: Strict order: (1) eventId → /event/:id, (2) userId → /user/:id, (3) do nothing
- **Central resolver**: `resolveNotificationTarget()` helper centralizes navigation logic, returns null for invalid targets
- **Calm user feedback**: Invalid targets show info toast "This item is no longer available" (not dev errors)
- **DEV logging**: Invalid navigation targets log console.warn in DEV mode for debugging
- **userId extraction**: Check `data.userId || data.senderId || data.actorId` for user deep link

## Friends View Mode Persistence Pattern (Canonical)

- **Per-user persistence**: AsyncStorage key format `friends_view_mode:${userId}` (not global)
- **State restoration**: useEffect on mount reads saved preference, defaults to "detailed" if none found
- **Callback pattern**: handleViewModeChange async callback writes to AsyncStorage + updates local state
- **Toggle integration**: Pressable onPress calls `handleViewModeChange("list" | "detailed")` instead of direct setState
- **Implementation location**: `src/app/friends.tsx` (viewMode state, useEffect restoration, toggle handlers)
- **User benefit**: View preference (list vs grid) persists across sessions and app restarts

## Swipe Actions Contract (Canonical)

- **Threshold**: 60px horizontal swipe required to reveal action buttons
- **Snap behavior**: Past threshold snaps open (-120px), below snaps closed (0)
- **Actions**: Heart = "interested" RSVP, Check = "going" RSVP
- **Authed-only**: Swipe gesture disabled when `bootStatus !== "authed"`
- **Own events excluded**: User cannot swipe on their own events
- **Series excluded**: Recurring event series cannot be swiped (tap to detail instead)
- **Full event guard**: If event at capacity, "Going" shows toast "This invite is full" instead of RSVP
- **Vertical scroll safe**: `failOffsetY([-10, 10])` ensures scroll wins over swipe gesture
- **RSVP mapping**: Heart → POST `/api/events/{id}/rsvp` with status "interested", Check → status "going"

## Launch Sweep Findings (2026-01-28)

- **Broken route discovered**: `/event-requests` was pushed from calendar.tsx line 2526, but no such file exists (only `/event-request/[id].tsx`)
- **Fix applied**: Removed the "View all X requests" button since no list page exists; users tap individual requests
- **Route inventory**: 40 Expo Router screens verified (src/app/*.tsx + nested routes)
- **API inventory**: 50+ endpoints used from frontend, all match contracts.ts patterns
- **TypeScript**: Clean, no errors
- **Invariants**: All checks pass (auth contract, cookie header, bootStatus gating)

Purpose: Record proven discoveries, pitfalls, and rules learned during debugging.

---

### Date: 2026-01-27
### Finding: Post-logout 401 cascades causing red console error overlays
### Proof:
- After logout, authed queries (subscription, profile) continue firing while bootStatus transitions
- api.ts used `console.error()` for 401/403 → red React Native error overlay spam
- useSubscription query not gated, fired on every render regardless of auth state
### Impact: Disruptive UX after logout, console noise, false alarm error overlays
### Action Taken:
- Gated useSubscription query: `enabled: bootStatus === 'authed'`
- Changed api.ts 401/403 logging from `console.error()` to `console.log()` to prevent red overlays
- Added throttling to guardEmailVerification (3-second window) to prevent toast spam
### Related Files: `src/lib/useSubscription.ts`, `src/lib/api.ts`, `src/lib/emailVerificationGate.ts`

---

### Date: 2026-01-27
### Finding: Session lost on force-close (swipe-kill) due to race condition
### Proof:
- `refreshExplicitCookie()` called with `void` (fire-and-forget) on module load
- `bootstrapAuth()` calls `/api/auth/session` immediately
- Race: API call fires BEFORE SecureStore read completes → cookie not attached → 401 → logout
- User reopens app → treated as logged out despite valid cookie in storage
### Impact: Session lost every time user swipe-kills app
### Action Taken:
- Added `ensureCookieInitialized()` export that tracks initialization state with promise
- Bootstrap now awaits `ensureCookieInitialized()` before any API calls (Step 0/4)
- Cookie guaranteed loaded before session check
### Related Files: `src/lib/authClient.ts`, `src/lib/authBootstrap.ts`

---

### Date: 2026-01-27
### Finding: Fire-and-forget cookie init on module load causes unpredictable boot order
### Proof:
- `void ensureCookieInitialized()` called at bottom of authClient.ts module scope
- Module loads at indeterminate time during app startup
- Could race with bootstrap sequence or cause double initialization
### Impact: Non-deterministic auth boot, potential race conditions
### Action Taken:
- Removed `void ensureCookieInitialized()` from authClient.ts module scope
- Documented that authBootstrap.ts is the ONLY authority for cookie initialization
- Single source of truth: bootstrap Step 0/4 is the only caller
### Related Files: `src/lib/authClient.ts`, `src/lib/authBootstrap.ts`

---

### Date: 2026-01-27
### Finding: Apple Sign-In cookie not persisted in React Native
### Proof:
- Used `credentials: "include"` with native fetch() - doesn't work in RN
- Set-Cookie header from backend ignored by React Native fetch
- Session established on backend but never stored client-side → 401 on next request
### Impact: Apple Sign-In users immediately logged out after onboarding
### Action Taken:
- Changed to `credentials: "omit"` (explicit cookie handling)
- Extract Set-Cookie header via `response.headers.get("set-cookie")`
- Store cookie explicitly via `setExplicitCookiePair()`
- Fallback: use token from response body if Set-Cookie inaccessible
- Call `refreshExplicitCookie()` after storage to ensure cache is warm
### Related Files: `src/app/welcome.tsx` (handleAppleSignIn)

---

### Date: 2026-01-24
### Finding: React Native fetch silently drops uppercase 'Cookie' header
### Proof: 
- Better Auth expo client source (node_modules/@better-auth/expo/dist/client.mjs) shows:
  - Uses lowercase 'cookie' header
  - Sets credentials: 'omit' (not 'include')
  - Adds 'expo-origin' and 'x-skip-oauth-proxy' headers
  - Cookie format: "; name=value" (leading semicolon-space)
- curl with same cookie value worked (200) while app got 401
### Impact: All authenticated requests failed with 401 despite cookie being cached correctly
### Action Taken:
- Changed header from 'Cookie' to 'cookie' (lowercase)
- Changed credentials from 'include' to 'omit'
- Added expo-origin and x-skip-oauth-proxy headers
- Cookie format now matches Better Auth expo: "; name=value"


---

### Date: 2026-01-24
### Finding: Email signup in welcome.tsx bypassed cookie establishment
### Proof:
- welcome.tsx handleEmailAuth() used raw authClient.$fetch('/api/auth/sign-up/email')
- This bypassed captureAndStoreCookie(), refreshExplicitCookie(), verifySessionAfterAuth()
- authClient.signUp.email() method already has all this logic built in
- Signup returned 200 but next /api/auth/session returned 401 due to no cookie in SecureStore
### Impact: New account signup never established cookie session, onboarding bounced to login
### Action Taken:
- Changed welcome.tsx to use authClient.signUp.email() and authClient.signIn.email()
- Added session verification check before advancing to next onboarding step
- Error now shown to user if session fails (no auto-redirect to login)

---

### Date: 2026-01-24
### Finding: Authed queries firing during logout/loading cause 401 storm
### Proof:
- Queries in profile.tsx, settings.tsx, friends.tsx used `enabled: !!session`
- After logout, cached session still exists momentarily
- Queries fire with stale session while bootStatus is 'loading' or 'loggedOut'
- Backend returns 401 for each → 401 spam in logs
### Impact: Race conditions during logout/login transitions, poor UX, confusing logs
### Action Taken:
- Changed all authed queries to use `enabled: bootStatus === 'authed'`
- Files fixed: calendar.tsx, profile.tsx, settings.tsx, friends.tsx

---

### Date: 2026-01-24
### Finding: /uploads/ images blocked by legacy bearer token check
### Proof:
- imageSource.ts logged: "Protected URL requires token but none available: .../uploads/...jpg"
- Backend actually serves /uploads/ paths as 200 without authentication
- Frontend was unnecessarily blocking image render
### Impact: Avatar images failed to render after logout or when no token cached
### Action Taken:
- Modified requiresAuth() in imageSource.ts to return false for /uploads/ paths
- /uploads/ URLs now treated as public, rendered without Authorization header

---

### Date: 2026-01-24
### Finding: useEntitlements hook needs enabled gating to prevent 401 during logout/loading
### Proof:
- Hook called useQuery without `enabled` gating on bootStatus
- During logout, fetch fires while session is invalid → 401 error
### Impact: Spurious 401 errors in console, confusing debug output
### Action Taken:
- Added optional `{ enabled?: boolean }` parameter to useEntitlements hook
- Preserves placeholderData behavior so entitlements always have a value

---

### Date: 2026-01-24
### Finding: MiniCalendar gated on !!session instead of bootStatus === 'authed'
### Proof:
- MiniCalendar component used `enabled: !!session && !!friendshipId`
- After logout, session may still be in React Query cache momentarily
- Caused calendar data fetches to fire during logout transition
### Impact: Same 401 race condition as other queries
### Action Taken:
- Changed MiniCalendar to accept `bootStatus: string` prop
- Changed enabled to `bootStatus === 'authed' && !!friendshipId`
- Updated FriendCard and FriendListItem to pass bootStatus prop

---

### Date: 2026-01-24
### Finding: Logout key deletion had scattered logs, no audit trail
### Proof:
- Multiple console.log statements during logout
- No consolidated list of which keys were deleted/failed
- Difficult to verify clean logout in production logs
### Impact: Debugging account switch issues required reading many log lines
### Action Taken:
- Added SECURESTORE_AUTH_KEYS and ASYNCSTORAGE_AUTH_KEYS arrays
- Track deletion success/failure per key
- Emit single [LOGOUT_INVARIANT] JSON log with keysDeleted, keysFailed, verifyCleared, verifyRemaining, success

---

### Date: 2026-01-25
### Finding: Apple Sign-In "unknown reason" errors needed user-friendly decoding
### Proof:
- expo-apple-authentication returns cryptic error codes (1000, 1001, 1002, 1003, 1004)
- Raw error.message exposed to user in error banner
- User sees "authorization attempt failed for an unknown reason" - not actionable
### Impact: Users cannot understand what went wrong or how to fix it
### Action Taken:
- Added decodeAppleAuthError() function to src/lib/appleSignIn.ts
- Maps error codes to friendly messages ("Please try again", "Check your Apple ID settings")
- Cancellation (code 1001) returns null (no error shown)
- Added AUTH_TRACE logging for debugging without exposing internals to user

---

### Date: 2026-01-25
### Finding: Onboarding session check failures caused redirect loop to /login
### Proof:
- handleSlide3Continue() called router.replace("/login") on any session check error
- User completes signup (Slide 2) → Slide 3 → Continue → transient session error → back to login
- This is the "loop back to beginning" bug reported on TestFlight
### Impact: New users cannot complete onboarding if any network hiccup occurs
### Action Taken:
- Removed router.replace("/login") calls from session checks during onboarding
- Transient errors: show "Session check failed. Please tap Continue to retry."
- Expired session: show "Your session expired. Please go back and sign in again."
- Photo upload session failures: skip silently, user can add photo later

---

### Date: 2026-01-25
### Finding: Photo upload failures could destabilize onboarding flow
### Proof:
- uploadPhotoInBackground() session check returned early on error
- But if the error was treated as auth failure elsewhere, could cascade
- No explicit guarantee that upload failure doesn't trigger logout
### Impact: Risk of auth state corruption on transient upload errors
### Action Taken:
- Added AUTH_TRACE logging with explicit "DO NOT redirect" comments
- Upload errors are now explicitly non-fatal
- User shown toast: "Could not upload photo. You can add it later in Settings."

---

### Date: 2026-01-24
### Finding: First-session guidance needed time-gating to avoid permanent prompts
### Proof:
- Empty states showed guidance text unconditionally
- Long-time users would see "tutorial-like" text forever
- Need to differentiate new user onboarding from established user empty state
### Impact: Unnecessary friction for experienced users
### Action Taken:
- Created src/lib/firstSessionGuidance.ts with 30-minute time window
- Stores `openinvite.firstOpenAt` timestamp in SecureStore
- Tracks completion per action: `openinvite.guidance.completed.<key>`
- Inline guidance only shows when: empty state + <30min since first open + action not completed
- Action keys: create_invite, join_circle, view_feed

---

### Date: 2026-01-27
### Finding: Ruthless Simplicity Phase 1 - UI subtraction rationale
### Proof:
- "Weekly" pill on event cards redundant - series already shows "Next: date" and "+N more"
- "Maybe" RSVP state creates decision paralysis, low value vs Interested
- Circle Event Mode toggle unnecessary complexity - Open Invite behavior is default desired UX
- Frequency/Notification toggles in circle context add friction without value
- Bottom nav had Calendar in center, but Social feed is primary engagement surface
### Impact: Cleaner UI, reduced cognitive load, faster task completion
### Action Taken:
- Removed Weekly pill from EventCard (social.tsx)
- Removed Maybe RSVP option from UI, backend "maybe" mapped to "interested" (event/[id].tsx)
- Removed EventReactions "maybe" type (EventReactions.tsx)
- Simplified Circle Create Event: removed Event Mode, Frequency, Send Notification (create.tsx)
- Reordered bottom nav: Discover | Calendar | Social (CENTER) | Friends | Profile
- Default landing changed from /calendar to /social
- CTA copy simplified: "Create Open Invite" → "Create Invite"

---

### Date: 2025-01-28
### Finding: P0 - Profile photo upload uses wrong auth mechanism
### Proof:
- imageUpload.ts used getAuthToken() for Bearer header
- Better Auth uses cookie-based auth, not Bearer tokens
- getAuthToken() returns null because token doesn't exist in this auth flow
- Response parsing assumed JSON, crashed on HTML error pages
### Impact: Profile photo uploads fail silently, users cannot set profile pictures
### Action Taken:
- Replaced getAuthToken() import with getSessionCookie() from sessionCookie.ts
- Changed headers from `Authorization: Bearer <token>` to `cookie: <sessionCookie>`
- Added try-catch for JSON parsing with console.error logging for debugging
- File: src/lib/imageUpload.ts

---

### Date: 2025-01-28
### Finding: P0 - Pro/Lifetime users incorrectly throttled by free-tier upgrade modal
### Proof:
- create.tsx soft-limit check only used isPremium from useSubscription()
- useSubscription() can fail to load or return false for lifetime users
- Lifetime Pro users were seeing "Upgrade for unlimited events" modal
### Impact: Paying customers blocked from app functionality, trust erosion
### Action Taken:
- Added entitlements?.plan check as fallback: PRO or LIFETIME_PRO bypasses limit
- userIsPro now: `isPremium || entitlements?.plan === 'PRO' || entitlements?.plan === 'LIFETIME_PRO'`
- File: src/app/create.tsx, line ~625

---

### Date: 2025-01-28
### Finding: P0 - FeedCalendar date modal shows white block obscuring calendar
### Proof:
- Modal with presentationStyle="pageSheet" had outer View without transparent background
- NativeWind className="flex-1 justify-end" doesn't set backgroundColor
- Result: white fullscreen overlay instead of see-through backdrop
### Impact: Calendar not visible when viewing day events, poor UX
### Action Taken:
- Added style={{ backgroundColor: 'transparent' }} to outer View wrapping modal content
- File: src/components/FeedCalendar.tsx, modal day events section

---

### Date: 2025-01-28
### Finding: P1 - Guidance overlays showing for senior/founder accounts
### Proof:
- firstSessionGuidance.ts used time-based heuristic (30 min since firstOpenAt)
- firstOpenAt stored in SecureStore gets reset on reinstall or app data clear
- Senior users who reinstall would see guides intended for brand new users
- No per-user-id scoping - global timestamp, not tied to specific account
### Impact: Senior users confused by onboarding UI, trust erosion
### Action Taken:
- Replaced time-based heuristic with per-user-id completion tracking
- Keys now: `openinvite.guidance.dismissed.<userId>`, `openinvite.guidance.completed.<userId>.<actionKey>`
- Added setGuidanceUserId() to set current user for per-user scoping
- Added dismissAllGuidance() for bulk dismiss
- Auto-dismiss for senior users: social.tsx checks if user has friends OR events, dismisses all guidance
- Files: src/lib/firstSessionGuidance.ts, src/app/social.tsx, src/app/circles.tsx, src/app/calendar.tsx

---

### Date: 2025-01-28
### Finding: P1 - Discover Reconnect tab routes to non-existent /profile/:id
### Proof:
- discover.tsx used `router.push(\`/profile/\${friend.id}\`)` for reconnect friend cards
- No /profile/[id].tsx route exists in app structure
- Only /user/[id].tsx (user profile by userId) and /friend/[id].tsx (friend by friendshipId) exist
- Tapping reconnect card caused navigation error (route not found)
### Impact: Reconnect feature broken, users cannot view friend profiles from Discover
### Action Taken:
- Changed route from /profile/:id to /user/:id
- File: src/app/discover.tsx

---

### Date: 2025-01-28
### Finding: P1 - Image upload uses uppercase Cookie header which React Native drops
### Proof:
- imageUpload.ts used `headers: { Cookie: sessionCookie }`
- React Native drops uppercase 'Cookie' header silently (known React Native behavior)
- authClient.ts already documented this: "Better Auth expo uses LOWERCASE 'cookie' header"
- Upload requests sent without auth cookie
### Impact: Image uploads fail with auth errors
### Action Taken:
- Changed Cookie to cookie (lowercase) in FileSystem.uploadAsync headers
- File: src/lib/imageUpload.ts

---

### Date: 2025-01-28
### Finding: P1 - Activity feed doesn't deep link to user profile when eventId missing
### Proof:
- handleNotificationPress only routed to /event/:id if eventId present
- Friend notifications (friend_request, friend_accepted) routed to /friends list, not specific user
- No fallback for userId when eventId is absent
- Users couldn't tap to see who sent friend request
### Impact: Activity feed less useful, extra taps to find relevant user
### Action Taken:
- Added userId/senderId/actorId lookup from notification data
- Friend-related notifications now route to /user/:userId if userId present
- Added final fallback: any notification with userId but no other route goes to /user/:userId
- Added structured warn log for notifications with no valid navigation target
- File: src/app/activity.tsx

---

### Date: 2025-01-28
### Finding: Bug Class - Global onboarding flags break multi-account behavior
### Proof:
- Global guidance keys (not user-scoped) persist across account switches
- Time-based heuristics (e.g., "30 min since first open") reset on reinstall
- Senior accounts who reinstall see new-user onboarding inappropriately
- Multi-account users: dismissing guidance on one account affects all accounts
### Impact: Trust erosion for senior users, confusion from seeing onboarding twice
### Pattern to Avoid:
- ❌ `openinvite.firstOpenAt` (global timestamp, resets on reinstall)
- ❌ `GUIDANCE_SEEN_KEY` (no userId scoping)
- ❌ Time-since-install checks: `elapsed < THIRTY_MINUTES_MS`
### Correct Pattern:
- ✅ Per-user-id keys: `openinvite.guidance.dismissed.<userId>`
- ✅ Per-user completion: `openinvite.guidance.completed.<userId>.<actionKey>`
- ✅ Auto-dismiss for senior users: check friends/events count, call dismissAllGuidance()
- ✅ Set current user: `setGuidanceUserId(session?.user?.id)`
### References:
- src/lib/firstSessionGuidance.ts - Per-user-id implementation
- docs/INVARIANTS.md - Guidance & Onboarding section
## Cloudinary Direct Upload Pattern (Canonical)

- **Architecture**: Client uploads directly to Cloudinary (no backend byte handling), returns secure_url to backend for profile update
- **Unsigned preset**: Use unsigned upload preset (e.g., `openinvite_profile`) for public client uploads without API key
- **Env vars**: `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`, `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` (NO EXPO_PUBLIC_CLOUDINARY_FOLDER)
- **Upload endpoint**: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
- **FormData multipart**: Use React Native FormData with `{ uri, type: "image/jpeg", name: "upload.jpg" }`
- **CRITICAL: Client must NOT send folder param**: Preset controls folder + naming logic, client sends ONLY file + upload_preset
- **Response parsing**: Extract `secure_url` from JSON response, handle non-JSON errors defensively
- **Error handling**: Check `!res.ok` before parsing, throw error with Cloudinary message if available
- **Size guard**: Enforce MAX_UPLOAD_BYTES (5MB) before upload to prevent wasted bandwidth
- **Implementation location**: `src/lib/imageUpload.ts` (uploadImage function)
- **Profile flow**: Settings → Edit Profile → uploadImage(localUri) → backend PATCH /api/profile with avatarUrl
- **Onboarding flow**: welcome.tsx → uploadImage(localUri) → store URL → save with profile on Continue

## Interactive Onboarding Guide Pattern (Canonical)

- **User-scoped keys**: `onboarding_guide_step:${userId}`, `onboarding_guide_completed:${userId}` (not global)
- **Boot gating**: Guide only loads after `userId` present AND `bootStatus === "authed"` (prevents flash on load)
- **Default to completed**: State defaults to `isCompleted: true, isLoading: true` until userId+data loaded
- **shouldShowStep check**: Returns true only if `!isCompleted && !isLoading && currentStep === step` (no flash before data loads)
- **Three-step flow**: friends_tab → add_friend → create_event → completed
- **Step progression**: Triggered by user actions (visiting Friends, sending request, creating event)
- **All operations require userId**: completeStep, startGuide, dismissGuide, resetGuide check userId before mutating storage
- **Implementation location**: `src/hooks/useOnboardingGuide.ts` (hook), `src/components/OnboardingGuideOverlay.tsx` (UI)
- **Usage pattern**: `const guide = useOnboardingGuide(); guide.shouldShowStep("friends_tab")` returns true only if userId loaded + not completed + not loading