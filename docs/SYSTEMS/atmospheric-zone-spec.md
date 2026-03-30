# Atmospheric Zone — Extraction Mini-Spec

## Purpose

Renders the cinematic hero region at the top of the event detail scroll view: blurred photo backdrop (or gradient fallback), glass-effect navigation bar, and the floating `InviteFlipCard` with optional edit button and photo nudge.

## Current Behavior

Always renders inside the `KeyboardAwareScrollView` as the first child. Contains three visual layers stacked via absolute positioning:

### Layer 1: Blurred Backdrop (lines 2438–2487)
- **Photo path** (`eventBannerUri && event.eventPhotoUrl && !event.isBusy && visibility !== "private"`): blurred `ExpoImage` at 70px blur, then a layered scrim `LinearGradient` fading to `canvasColor`, then an optional theme tint wash gradient (IIFE).
- **No-photo path**: single `LinearGradient` using theme color tints, fading to `canvasColor`.

### Layer 2: Nav Bar (lines 2492–2556)
- Left: back button (blur-backed if photo, plain if no photo). Navigates `router.back()` or `router.replace("/calendar")`.
- Right: options button (blur-backed if photo, plain if no photo). Opens `EventActionsSheet` via `setShowEventActionsSheet(true)`. Includes DEV log for imported event tracking.
- Responsive: `maxWidth: 600` centered at `screenWidth >= 768`.

### Layer 3: Floating InviteFlipCard (lines 2558–2652)
- Renders `<InviteFlipCard>` with all event metadata props.
- `attendeeAvatars` prop computed via IIFE that reorders attendees with host first.
- `editButton` render prop: edit pencil with bounce animation (`editScale` RNAnimated.Value), only for host with existing photo.
- `photoNudge` render prop: dashed "Add a cover photo" pressable with dismiss (persists to AsyncStorage), only for host without photo.

## Codebase Map

**Line range:** `src/app/event/[id].tsx` lines 2436–2654 (219 lines)

### State read
| Variable | Type | Defined at |
|----------|------|-----------|
| `event.eventPhotoUrl` | string \| null | query |
| `event.isBusy` | boolean \| undefined | query |
| `event.visibility` | string \| null | query |
| `event.title` | string | query |
| `event.emoji` | string \| null | query |
| `event.description` | string \| null | query |
| `event.themeId` | string \| null | query |
| `event.customThemeData` | object \| null | query |
| `event.user` | `{ id, name, image }` | query |
| `event.effectId` | string \| null | query |
| `event.customEffectConfig` | object \| null | query |
| `eventBannerUri` | string \| null | derived (line 2374, `resolveBannerUri`) |
| `canvasColor` | string | derived from `pageTheme` |
| `pageTheme` | theme object | derived (line 2380) |
| `isDark` | boolean | hook |
| `colors` | theme colors object | hook |
| `themeColor` | string | derived |
| `insets` | SafeAreaInsets | hook |
| `screenWidth` | number | hook |
| `isMyEvent` | boolean | derived |
| `eventMeta` | `{ capacity, isFull, ... }` | derived |
| `effectiveGoingCount` | number | derived |
| `attendeesList` | AttendeeInfo[] | derived |
| `countdownLabel` | string | derived (line 2291) |
| `dateLabel` | string | derived (line 2277) |
| `timeLabel` | string | derived (line 2283) |
| `locationDisplay` | string \| null | derived |
| `photoNudgeDismissed` | boolean | `useState` (line 483) |
| `uploadingPhoto` | boolean | `useState` (referenced in parent) |
| `editScale` | RNAnimated.Value | `useRef` (line 533) |
| `id` | string | route param |

### Hooks consumed (in parent, not extractable)
- `editScale` — `useRef(new RNAnimated.Value(1))`, drives edit button bounce animation
- `photoNudgeDismissed` / `setPhotoNudgeDismissed` — `useState`

### Mutations/callbacks triggered
| Callback | What it does |
|----------|-------------|
| `router.back()` / `router.replace("/calendar")` | Back navigation |
| `setShowEventActionsSheet(true)` | Open options sheet |
| `setShowPhotoSheet(true)` | Open photo upload sheet (via edit button) |
| `launchEventPhotoPicker()` | Direct camera roll picker (via photo nudge) |
| `setPhotoNudgeDismissed(true)` + AsyncStorage persist | Dismiss photo nudge |

### Conditional branches
1. **Photo vs no-photo backdrop** — `eventBannerUri && event.eventPhotoUrl && !isBusy && visibility !== "private"`
2. **Theme tint wash** — `pageTheme.pageTintDark/Light !== "transparent"`
3. **Nav button style** — blur-backed vs plain, based on photo presence
4. **Edit button** — host + has photo + not busy + not private
5. **Photo nudge** — host + no photo + not busy + not private + not dismissed
6. **Responsive width** — `screenWidth >= 768` constrains nav bar

### Sub-sections identifiable as components
1. Lines 2438–2487: Blurred backdrop / gradient fallback (~50 lines)
2. Lines 2492–2556: Nav bar with back + options buttons (~65 lines)
3. Lines 2558–2652: InviteFlipCard wrapper with edit button + photo nudge render props (~95 lines)

## Proposed Sub-Components

### 1. EventHeroBackdrop
**Responsibility:** Renders the ambient blurred photo background or gradient fallback behind the hero zone.
**Props:** `eventBannerUri: string | null`, `hasPhoto: boolean`, `canvasColor: string`, `isDark: boolean`, `themeColor: string`, `pageTintDark: string | undefined`, `pageTintLight: string | undefined`
**Callbacks:** none (pure visual layer)
**Estimated lines:** ~55
**Dependencies:** `ExpoImage`, `LinearGradient`, `toCloudinaryTransformedUrl`

### 2. EventHeroNav
**Responsibility:** Glass-effect navigation bar with back button (left) and options/menu button (right).
**Props:** `hasPhoto: boolean`, `screenWidth: number`, `topInset: number`, `isDark: boolean`, `colors: { text: string }`
**Callbacks:** `onBack: () => void`, `onOpenOptions: () => void`
**Estimated lines:** ~70
**Dependencies:** `BlurView` (expo-blur). Two conditional branches (blur-backed vs plain) for both buttons.

### 3. EventHeroCardZone
**Responsibility:** Wraps `InviteFlipCard` with pre-computed attendee avatars and passes through edit button / photo nudge render props.
**Props:** all InviteFlipCard props (`title`, `imageUri`, `emoji`, `countdownLabel`, `dateLabel`, `timeLabel`, `locationDisplay`, `goingCount`, `attendeeAvatars`, `description`, `hostName`, `hostImageUrl`, `isMyEvent`, `capacity`, `currentGoing`, `themeColor`, `isDark`, `colors`, `themeId`), plus `editButton: ReactNode | undefined`, `photoNudge: ReactNode | undefined`
**Callbacks:** none (render props are pre-built by parent)
**Estimated lines:** ~30 (thin wrapper — most complexity is in InviteFlipCard itself)
**Dependencies:** `InviteFlipCard`

**Note:** This component is very thin. An alternative is to skip it and keep the `InviteFlipCard` call inline in the parent, only extracting the backdrop and nav. The attendee avatar IIFE (~10 lines) can be computed in the parent before the JSX return.

### 4. PhotoNudge
**Responsibility:** Dashed "Add a cover photo" pressable with dismiss button.
**Props:** `isDark: boolean`, `colors: { textSecondary, textTertiary }`
**Callbacks:** `onAddPhoto: () => void`, `onDismiss: () => void`
**Estimated lines:** ~30
**Dependencies:** None (pure RN primitives + icons)

### 5. EditPhotoButton
**Responsibility:** Pencil icon with bounce animation for changing event banner photo.
**Props:** `editScale: RNAnimated.Value`
**Callbacks:** `onPress: () => void`
**Estimated lines:** ~25
**Dependencies:** `RNAnimated` (react-native Animated, not Reanimated)

### Revised from prior review
- **EventHeroNav** — confirmed, matches code structure exactly.
- **EventHeroCardZone** — confirmed but very thin; could be skipped in favor of inlining. Recommended only if the parent composition benefit justifies it.
- **PhotoNudge** — confirmed, clean extraction target.
- **Added: EventHeroBackdrop** — the backdrop is 50 lines of conditional gradient/blur logic, worth extracting separately from the nav bar.
- **Added: EditPhotoButton** — the bounce animation logic is self-contained.

## Extraction Order

1. **PhotoNudge** — zero coupling, self-contained, currently a render prop value
2. **EditPhotoButton** — zero coupling, self-contained, currently a render prop value
3. **EventHeroNav** — depends only on `BlurView`, no sibling deps
4. **EventHeroBackdrop** — depends on `ExpoImage` + `LinearGradient`, no sibling deps
5. **EventHeroCardZone** (optional) — depends on `InviteFlipCard`; skip if parent composition is already clean after steps 1–4

After steps 1–4: the atmospheric zone section drops from ~219 lines to ~95 lines (InviteFlipCard call + composition wrapper). A final `AtmosphericZone` container component is optional — evaluate after the sub-extractions.

## Risks

1. **`editScale` is a `RNAnimated.Value` (classic Animated, not Reanimated).** Must be passed as a prop, not created inside the extracted component. The `useRef` stays in the parent.
2. **`LinearGradient` does not support `className`.** Must use `style` prop only. Already the case in current code.
3. **`BlurView` from expo-blur.** Platform-specific behavior (iOS blur, Android fallback). No change needed for extraction, but the component must import from `expo-blur` directly.
4. **Backdrop IIFE for theme tint.** Two IIFEs compute tint colors. These can become inline ternaries in the extracted component or pre-computed props.
5. **Attendee avatar IIFE in InviteFlipCard props.** This reorders the attendees list with host first. Must either move to a parent-side computation or stay as an IIFE inside the extracted component.
6. **AsyncStorage write in PhotoNudge dismiss.** Must stay in parent callback (`onDismiss`), not in the extracted component.
7. **`canvasColor` is derived from `pageTheme`.** The extracted backdrop needs this as a simple string prop, not the full theme object.
8. **`toCloudinaryTransformedUrl` import.** EventHeroBackdrop needs this utility — must import from `@/lib/mediaTransformSSOT`.
9. **Responsive nav constraint** (`screenWidth >= 768`). Passed as props, no issue.
