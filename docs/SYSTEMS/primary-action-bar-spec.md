# Primary Action Bar — Extraction Mini-Spec

## Purpose

Renders the guest-facing RSVP controls, status display, social proof, post-RSVP share prompts, and friend-finding nudge — the main conversion surface for non-host viewers.

## Current Behavior

Renders only for **non-host, non-busy** events (`!isMyEvent && !event?.isBusy`).

Two top-level branches:

### Branch A: `hasJoinRequest` (user already RSVP'd "going")
- Social proof avatar stack + going count (if `effectiveGoingCount > 0`)
- Green "You're Attending" confirmation badge with "· on your calendar" text

### Branch B: No join request (all other states)
1. **DEV log IIFE** — renders nothing, logs RSVP state in `__DEV__`
2. **RSVP Status Display** (`myRsvpStatus` truthy) — shows current status (Going / Saved / Not Going) with icon, a "Change" button that toggles `showRsvpOptions`, and a "Share with friends" link (only when status is "going")
3. **RSVP Success Prompt** (`showRsvpSuccessPrompt && myRsvpStatus === "going"`) — "You're in!" banner with Share + dismiss buttons. Fires 3 analytics events on share tap.
4. **Find Friends Nudge** (`!isMyEvent && myRsvpStatus === "going" && !showRsvpSuccessPrompt && !findFriendsNudgeDismissed`) — blue card linking to `/find-friends` with dismiss that persists to AsyncStorage.
5. **Social Proof Row** (`!myRsvpStatus || showRsvpOptions`) — avatar stack + going count, or "Be the first to join" fallback.
6. **RSVP Button Group** (`!myRsvpStatus || showRsvpOptions`) — animated container (`rsvpButtonAnimStyle`) with:
   - Full indicator when `eventMeta.isFull && myRsvpStatus !== "going"`
   - Pending indicator when `rsvpMutation.isPending`
   - Two pill buttons: "I'm In" (green, primary) / "Save" (outlined, secondary using `pageTheme.backAccent`)
   - "Can't make it" tertiary link (only when user has existing status)
7. **Saved confirmation text** (`rsvpSavedVisible`) — brief ephemeral "Saved — you'll find this in your Saved tab"

## Codebase Map

**Line range:** `src/app/event/[id].tsx` lines 2684–3053 (370 lines)

### State read
| Variable | Type | Defined at |
|----------|------|-----------|
| `isMyEvent` | boolean | derived |
| `event.isBusy` | boolean \| undefined | query |
| `hasJoinRequest` | boolean | derived (~line 1266) |
| `myRsvpStatus` | string \| null | derived (~line 1258) |
| `showRsvpOptions` | boolean | `useState` (line 412) |
| `rsvpMutation.isPending` | boolean | `useMutation` |
| `effectiveGoingCount` | number | derived (~line 1208) |
| `attendeesList` | AttendeeInfo[] | derived (~line 1196) |
| `totalGoing` | number | derived |
| `showRsvpSuccessPrompt` | boolean | `useState` (line 469) |
| `findFriendsNudgeDismissed` | boolean | `useState` (line 484) |
| `rsvpButtonAnimStyle` | animated style | `useAnimatedStyle` (line 466) |
| `rsvpSavedVisible` | boolean | `useState` (line 463) |
| `eventMeta.isFull` | boolean | derived |
| `pageTheme.backAccent` | string | derived (line 2380) |
| `isDark`, `colors`, `themeColor` | theme values | hooks |
| `session?.user?.id` | string \| undefined | auth |
| `locationDisplay` | string \| null | derived |
| `id` | string | route param |

### Hooks consumed (in parent, not extractable)
- `rsvpMutation` (useMutation) — `handleRsvp` callback wraps this
- `rsvpButtonScale` (useSharedValue) — drives `rsvpButtonAnimStyle`

### Mutations/callbacks triggered
| Callback | What it does |
|----------|-------------|
| `handleRsvp("going" \| "interested" \| "not_going")` | RSVP mutation |
| `setShowRsvpOptions(bool)` | Toggle change-RSVP button row |
| `setShowRemoveRsvpConfirm(bool)` | (not directly used in this section, but referenced in spec) |
| `shareEvent(...)` | Native share sheet |
| `trackRsvpShareClicked(...)` | Analytics |
| `trackShareTriggered(...)` | Analytics |
| `trackRsvpSuccessPromptTap(...)` | Analytics |
| `trackInviteShared(...)` | Analytics |
| `setShowRsvpSuccessPrompt(false)` | Dismiss success prompt |
| `setFindFriendsNudgeDismissed(true)` | Dismiss + AsyncStorage persist |
| `router.push("/find-friends")` | Navigate |

### Conditional branches
1. **Role gate:** entire section hidden for hosts and busy events
2. **hasJoinRequest:** confirmed attendee vs. all other states
3. **myRsvpStatus:** icon/label/color vary by `"going"`, `"interested"`, `"not_going"`, or `null`
4. **showRsvpOptions:** toggles button group visibility when status already set
5. **eventMeta.isFull:** replaces Going button with disabled "Full" badge
6. **rsvpMutation.isPending:** disables buttons, shows spinner
7. **showRsvpSuccessPrompt:** post-RSVP share nudge
8. **findFriendsNudgeDismissed:** contacts import nudge
9. **rsvpSavedVisible:** ephemeral saved confirmation

### Sub-sections identifiable as components
1. Lines 2688–2726: Confirmed attendee banner (social proof + badge)
2. Lines 2742–2808: Current RSVP status display + change + share
3. Lines 2812–2849: RSVP success share prompt
4. Lines 2853–2893: Find Friends nudge
5. Lines 2896–2922: Social proof row (avatar stack + count)
6. Lines 2926–3043: RSVP button group (full indicator, pending, pills, "can't make it")
7. Lines 3044–3049: Saved confirmation text

## Proposed Sub-Components

### 1. SocialProofRow
**Responsibility:** Renders overlapping avatar stack with going count or "Be the first" fallback.
**Props:** `attendees: AttendeeInfo[]`, `effectiveGoingCount: number`, `isDark: boolean`, `colors: { textSecondary: string }`
**Callbacks:** none (display only)
**Estimated lines:** ~35
**Dependencies:** `EntityAvatar`. Used in two places (confirmed banner + decision point), so extracting once and reusing reduces duplication.

### 2. RsvpStatusDisplay
**Responsibility:** Shows current RSVP status badge with icon, label, "Change" toggle, and optional "Share with friends" link.
**Props:** `myRsvpStatus: string`, `isPending: boolean`, `isDark: boolean`, `themeColor: string`, `colors: { textSecondary, textTertiary }`, `showRsvpOptions: boolean`
**Callbacks:** `onToggleOptions: () => void`, `onShareWithFriends: () => void`
**Estimated lines:** ~70
**Dependencies:** None (uses only RN primitives + icons)

### 3. RsvpSuccessPrompt
**Responsibility:** Post-RSVP "You're in!" banner with Share + dismiss actions.
**Props:** `isDark: boolean`, `colors: { textSecondary, textTertiary }`
**Callbacks:** `onShare: () => void`, `onDismiss: () => void`
**Estimated lines:** ~40
**Dependencies:** None

### 4. FindFriendsNudge
**Responsibility:** Blue card prompting user to find friends via contacts import.
**Props:** `isDark: boolean`, `colors: { text, textSecondary, textTertiary }`
**Callbacks:** `onFind: () => void`, `onDismiss: () => void`
**Estimated lines:** ~35
**Dependencies:** None

### 5. RsvpButtonGroup
**Responsibility:** Primary "I'm In" + secondary "Save" pill buttons, full indicator, pending spinner, and "Can't make it" link.
**Props:** `myRsvpStatus: string | null`, `isFull: boolean`, `isPending: boolean`, `isDark: boolean`, `themeColor: string`, `accentColor: string`, `colors: { textTertiary }`, `animStyle: object`
**Callbacks:** `onRsvpGoing: () => void`, `onRsvpInterested: () => void`, `onRsvpNotGoing: () => void`
**Estimated lines:** ~120
**Dependencies:** None (uses only RN primitives + icons)

### 6. ConfirmedAttendeeBanner
**Responsibility:** Green "You're Attending" badge shown when `hasJoinRequest` is true, with social proof above.
**Props:** `effectiveGoingCount: number`, `attendees: AttendeeInfo[]`, `isDark: boolean`, `colors: { textSecondary }`
**Callbacks:** none
**Estimated lines:** ~45
**Dependencies:** `SocialProofRow` (sibling)

### Not extracted separately
- **Saved confirmation text** (lines 3044–3049): 6 lines, not worth its own component. Stays inline.
- **DEV log IIFE** (lines 2730–2739): Dev-only, stays inline.

## Extraction Order

1. **SocialProofRow** — zero coupling, reused in two places, pure display
2. **RsvpSuccessPrompt** — self-contained banner, no sibling deps
3. **FindFriendsNudge** — self-contained banner, no sibling deps
4. **RsvpStatusDisplay** — reads status + fires callbacks, no sibling deps
5. **RsvpButtonGroup** — largest piece, most conditional logic, no sibling deps
6. **ConfirmedAttendeeBanner** — depends on `SocialProofRow` (extracted in step 1)

After all 6: wrap the composition in a single `PrimaryActionBar` container component that receives all props and wires sub-components. This is optional — the parent could compose them directly.

## Risks

1. **`rsvpButtonAnimStyle` is a Reanimated animated style.** Must be passed as a prop (object), not created inside the extracted component. The `useAnimatedStyle` hook stays in the parent.
2. **`pageTheme.backAccent` for Save button color.** This comes from the theme system. The extracted component should receive it as a simple `accentColor: string` prop rather than importing theme logic.
3. **Social proof avatar stack is duplicated.** Currently rendered in two places (confirmed banner + decision point). Extracting `SocialProofRow` first eliminates this duplication.
4. **AsyncStorage write in FindFriendsNudge dismiss.** Business logic — must stay in parent callback, not in the extracted component.
5. **Analytics tracking on share actions.** 3-4 analytics calls fire on share taps. These must remain in parent callbacks to avoid coupling presentational components to the analytics SDK.
6. **`eventMeta.isFull` disables the Going button but shows "Full" badge.** The conditional rendering is intricate — the full indicator is above the button row, while the button itself changes to a disabled View. Both must be in `RsvpButtonGroup` to keep the layout coherent.
7. **Hook ordering invariant.** All `useState`, `useAnimatedStyle`, etc. must remain above early returns in the parent. Extraction doesn't change this — just moves JSX, not hooks.
