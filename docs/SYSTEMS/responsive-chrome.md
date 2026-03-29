# Responsive Chrome & Layout Spec

> Layout system for headers, navigation, floating trays, content cards, and sheets.
> Covers phone, large phone, and iPad/wide layouts.
> Owner: `src/lib/layoutSpacing.ts`, `src/ui/layout.ts`, `src/components/BottomNavigation.tsx`

---

## A. Width Classes

| Class | Threshold | Context | When it matters |
|-------|-----------|---------|-----------------|
| **compact** | width < 430 | iPhone SE → iPhone 15 Pro | Current behavior — no changes needed |
| **regular** | 430 ≤ width < 768 | iPhone 15 Pro Max, small multitasking | Minor: content stays readable, trays don't over-stretch |
| **wide** | width ≥ 768 | iPad portrait, iPad landscape, large multitasking | Content and chrome need max-width caps to avoid edge-to-edge stretch |

**Implementation:** Single `useLayoutClass()` hook reading `useWindowDimensions().width`. Returns `"compact" | "regular" | "wide"`. No device-model detection.

**Thresholds rationale:**
- 430: iPhone 15 Pro Max logical width (largest phone). Everything below is phone-normal.
- 768: iPad Mini portrait logical width. First context where full-bleed content looks wrong.

---

## B. Top Header Spec

**Current state:** `AppHeader` component (SSOT) with `HEADER_PX = 20`, `HEADER_TITLE_SIZE = 28`. Full-width, no max-width. Event detail uses custom 14px padding header. Create uses 16px padding header.

| Property | compact | regular | wide |
|----------|---------|---------|------|
| Horizontal padding | 20px (unchanged) | 20px | 20px |
| Max content width | none | none | **600px**, centered |
| Title size | 28 | 28 | 28 |
| Action spacing | flex space-between | flex space-between | flex space-between |
| BlurView | full-width | full-width | full-width (background extends, content capped) |

**Rule:** On wide, the BlurView bar remains full-width (looks wrong if floating). Only the inner content row gets `maxWidth: 600` + `alignSelf: "center"`.

**Event detail header:** Same rule — back/options buttons capped within 600px content zone.

**Create header:** Same rule — Cancel/Save capped within 600px content zone.

---

## C. Bottom Nav Spec

**Current state:** Floating island pill. `ISLAND_HEIGHT = 56`, `ISLAND_HORIZONTAL = 16`, `ISLAND_BOTTOM = 8 + insets.bottom`. Position absolute, `left: 16, right: 16`. No max-width.

| Property | compact | regular | wide |
|----------|---------|---------|------|
| Height | 56px | 56px | 56px |
| Side margins | 16px | 16px | 16px |
| Max width | none (unchanged) | none | **400px**, centered |
| Bottom offset | `insets.bottom + 8` | `insets.bottom + 8` | `insets.bottom + 8` |
| Icon/label spacing | current | current | current |

**Wide implementation:** Replace `left: 16, right: 16` with `maxWidth: 400, alignSelf: "center"` (wrap in centering container, or use `left/right: auto` + `width` + `marginHorizontal: "auto"`).

**Rationale:** A 400px-wide pill on iPad looks intentional (like a dock). A 1024px-wide pill looks broken.

---

## D. Sticky/Floating Tray Spec

**Current state:** Sticky RSVP bar: `position: absolute, bottom: 0, left: 0, right: 0`, `paddingHorizontal: 16`, `paddingBottom: insets.bottom + 8`. Full-width. No max-width.

| Property | compact | regular | wide |
|----------|---------|---------|------|
| Side margins | 0 (full-bleed) | 0 | **16px** |
| Max width | none | none | **600px**, centered |
| Bottom offset | `insets.bottom + 8` | `insets.bottom + 8` | `insets.bottom + 12` |
| Button layout | row, flex | row, flex | row, flex (unchanged) |
| Background | full-width blur | full-width blur | **capped-width rounded bar** (borderRadius: 20) |

**Wide behavior:** On wide layouts, the sticky bar becomes a floating rounded bar (similar to the bottom nav island) instead of a full-bleed strip. This matches the nav island visual language.

**Content padding:** `stickyBarHeight` calculation unchanged — still `64 + insets.bottom`.

---

## E. Content Card Spec (InviteFlipCard)

**Current state:** `width: "100%"` with `paddingHorizontal: 16` wrapper. Aspect ratio `3:4`. Photo zone 62% of height. No max-width — card scales to full container width.

| Property | compact | regular | wide |
|----------|---------|---------|------|
| Max card width | none (unchanged) | none | **480px** |
| Horizontal margins | 16px | 16px | auto (centered) |
| Aspect ratio | 3:4 | 3:4 | 3:4 |
| Photo hero | 62% of card height | 62% | 62% |
| Internal padding | fixed (20px plaque) | fixed | fixed |

**Wide behavior:** Card container gets `maxWidth: 480, alignSelf: "center"`. The card itself doesn't change — it just stops growing past 480px. At 480px wide, card height is 640px (3:4), which fits comfortably on iPad portrait.

**Event page scroll content:** On wide, the entire content column (below the header) should be capped at `maxWidth: 600` and centered. This automatically constrains the card, details, comments, etc.

---

## F. Sheet / Editor Surface Spec

**Current state:**
- `BottomSheet.tsx`: height = `screenH * maxHeightPct`, full-width, `paddingBottom: Math.max(insets.bottom, 20)`
- ThemeTray/EffectTray: `position: absolute, left: 12, right: 12`, height = `52-54% of screenH`
- CreateBottomDock: `position: absolute, left: 0, right: 0`, `paddingHorizontal: 40`

| Property | compact | regular | wide |
|----------|---------|---------|------|
| Phone sheets | bottom-attached | bottom-attached | **centered panel** |
| Max sheet width | none | none | **540px** |
| Max sheet height | `screenH * pct` | `screenH * pct` | **min(screenH * pct, 600px)** |
| ThemeTray/EffectTray | `left: 12, right: 12` | `left: 12, right: 12` | `maxWidth: 540, centered` |
| CreateBottomDock | full-width | full-width | `maxWidth: 400, centered` |
| Border radius | top corners only | top corners only | **all corners** (centered panel) |
| Interior padding | current | current | current |

**Wide sheet behavior:** Sheets transition from bottom-attached to centered floating panels. This is a common iPad pattern (see Apple's own apps). The `BottomSheet` component gains `maxWidth` + `alignSelf: "center"` + full border radius when `layoutClass === "wide"`.

**When to remain bottom-attached:** Keyboard-attached sheets (e.g., comment input) stay bottom-attached on all sizes because they must track the keyboard.

---

## G. Doctrine / Rules

1. **Never detect exact device models for layout.** Use `useWindowDimensions().width` + `useSafeAreaInsets()` + `Platform.OS` only.
2. **Three width classes maximum.** compact / regular / wide. No sub-classes.
3. **Prefer local adaptation over global abstraction** until a pattern repeats ≥3 times. The `useLayoutClass()` hook is the only new shared primitive.
4. **Full-bleed backgrounds, capped content.** Headers, status bars, and background layers remain full-width. Only inner content gets max-width constraints.
5. **Don't break compact.** All changes must be no-ops on compact. Test phone first, wide second.
6. **Width caps are opt-in per surface.** No global wrapper that forces all content to a max-width. Each surface applies its own cap when it makes sense.
7. **Existing patterns are law.** `layoutSpacing.ts` constants, `SafeAreaScreen`, `SPACING`/`RADIUS` tokens — use these. Don't invent parallel systems.
8. **Percentage heights stay.** ThemeTray (54%), EffectTray (52%), BottomSheet (per-instance) — these work on all sizes because they're relative. Only add a max-height cap on wide to prevent absurdly tall sheets.
9. **No landscape mode.** App is portrait-locked on iPhone. iPad may rotate — wide class handles both orientations (768+ covers iPad portrait and landscape).

---

## H. Rollout Order

| Order | Surface | Rationale |
|-------|---------|-----------|
| **1** | `useLayoutClass()` hook | Foundation. Everything else depends on it. Tiny — one file, one hook, pure read. |
| **2** | Bottom nav | Affects entire app shell. Highest visibility. Single file change (`BottomNavigation.tsx`). |
| **3** | Sticky RSVP tray | Already started, single file (`event/[id].tsx`). Validates the pattern for floating trays. |
| **4** | Content cards / InviteFlipCard | High visual impact. Tests content-column capping. |
| **5** | Event page content column | Wraps card + details + comments in a max-width container. Builds on #4. |
| **6** | Top headers (AppHeader) | Lower urgency — headers look acceptable stretched. Single component change. |
| **7** | Theme/Effect trays + CreateBottomDock | Editor surfaces. Lower priority — create flow is less common than browsing. |
| **8** | BottomSheet (general) | Affects all modal sheets. Highest surface count but lowest individual urgency. Do last to benefit from patterns learned in #2–#7. |

**Why this order:** Start with the foundation hook, then tackle surfaces in order of user visibility × implementation simplicity. Bottom nav and sticky tray are single-file, high-visibility wins. Sheets are last because they're the most complex change with the most instances.

---

## Existing Infrastructure (Reference)

| Asset | File | Purpose |
|-------|------|---------|
| Bottom padding constants | `src/lib/layoutSpacing.ts` | `TAB_BOTTOM_PADDING (100)`, `STACK_BOTTOM_PADDING (48)`, `FORM_BOTTOM_PADDING (40)` |
| Spacing tokens | `src/ui/layout.ts` | `SPACING.*`, `RADIUS.*`, `MIN_TAP`, `hitSlop()` |
| Safe area wrapper | `src/ui/SafeAreaScreen.tsx` | `SafeAreaScreen` component with edge control |
| Nav constants | `src/components/BottomNavigation.tsx` | `FLOATING_TAB_INSET (84)`, island dimensions |
| AppHeader SSOT | `src/components/AppHeader.tsx` | `HEADER_PX (20)`, `HEADER_TITLE_SIZE (28)` |
| Modal maxWidth (ad-hoc) | Various | 320–400px on modals, 75% on chat bubbles |

---

## Current State Summary (Audited Surfaces)

| Surface | Width behavior | Safe area | Max-width | iPad-ready |
|---------|---------------|-----------|-----------|------------|
| Bottom nav | Stretches to screen - 32px | Yes (bottom) | None | No |
| Sticky RSVP bar | Full-bleed | Yes (bottom) | None | No |
| InviteFlipCard | 100% of parent - 32px | N/A | None | No |
| ThemeTray | Screen - 24px | Yes (bottom) | None | No |
| EffectTray | Screen - 24px | Yes (bottom) | None | No |
| CreateBottomDock | Screen - 80px | Yes (bottom) | None | No |
| AppHeader (tabs) | Full-width | Yes (top) | None | No |
| Event detail header | Full-width (14px padding) | Yes (top) | None | No |
| Create header | Full-width (16px padding) | Yes (top) | None | No |
| BottomSheet | Full-width | Yes (bottom) | None | No |
| Modals/dialogs | Centered | Varies | 320–400px | Partially |

---

## I. Codebase Map

Exact file locations, line numbers, and dimension values for every surface in this spec. Line numbers are current as of `d45ce17` on `main`.

### 1. Bottom Navigation

| Property | Value |
|----------|-------|
| **File** | `src/components/BottomNavigation.tsx` |
| **Component** | `BottomNavigation` (default export) |
| **Container lines** | 255–300 (outermost `<View accessibilityRole="tablist">`) |
| **Height** | `ISLAND_HEIGHT = 56` (line 32) |
| **Bottom offset** | `safeBottom + ISLAND_BOTTOM` where `safeBottom = Math.max(insets.bottom, 8)` (lines 249, 259) |
| **Side margins** | Compact: `left/right: ISLAND_HORIZONTAL (16)` (line 265). Wide (≥768): centered via symmetric `left/right = (screenWidth - 400) / 2` (lines 260–264) |
| **Border radius** | `ISLAND_RADIUS = 28` (line 35) |
| **Max width** | `WIDE_MAX_WIDTH = 400` on wide layouts (line 42) |
| **Safe-area** | `useSafeAreaInsets()` → `insets.bottom` → `Math.max(insets.bottom, 8)` (lines 188, 249) |
| **Responsive logic** | `useWindowDimensions().width >= WIDE_THRESHOLD (768)` → centered 400px pill (lines 251–264) |
| **Consumers** | `src/app/discover.tsx`, `src/app/calendar.tsx`, `src/app/social.tsx`, `src/app/friends.tsx`, `src/app/circles.tsx`, `src/app/profile.tsx`, `src/app/create.tsx`, `src/components/LoadingTimeoutUI.tsx` |

### 2. Sticky RSVP Tray

| Property | Value |
|----------|-------|
| **File** | `src/app/event/[id].tsx` |
| **Component** | Inline JSX block (not extracted) |
| **Visibility condition** | Line 2498: `!isMyEvent && !event?.isBusy && !!event && !hasJoinRequest && myRsvpStatus !== "going"` |
| **Container lines** | 4440–4562 (outer `Animated.View` + inner content) |
| **Position** | `position: "absolute", bottom: 0`. Compact: `left: 0, right: 0`. Wide (≥768): centered via symmetric `left/right = Math.max(16, (screenWidth - 600) / 2)` (lines 4446–4459) |
| **Padding** | Compact: `paddingBottom: insets.bottom + 8`. Wide: `paddingBottom: insets.bottom + 12`. Both: `paddingTop: 10, paddingHorizontal: 16` (lines 4451, 4456, 4460–4461) |
| **Background** | `isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.92)"` (line 4462) |
| **Bar height** | `stickyBarHeight = 64 + insets.bottom` (line 2499) |
| **Scroll padding** | `paddingBottom: showStickyRsvp ? stickyBarHeight + 16 : STACK_BOTTOM_PADDING` (line 2545) |
| **Max width** | 600px on wide layouts (via symmetric left/right centering) |
| **Safe-area** | `useSafeAreaInsets()` → `insets.bottom` applied to `paddingBottom` (lines 4451, 4456) |
| **Responsive logic** | `screenWidth >= 768` → centered 600px bar with `borderRadius: 20` (lines 4446–4459). Uses `useWindowDimensions()` (line 389) |
| **Consumers** | Inline in `event/[id].tsx` only |

### 3. ThemeTray

| Property | Value |
|----------|-------|
| **File** | `src/components/create/ThemeTray.tsx` |
| **Component** | `ThemeTray` (named export) |
| **Container style** | `styles.outerContainer` (lines 668–673): `position: "absolute", left: 12, right: 12, zIndex: 50`. Wide override at lines 194–197. |
| **Bottom offset** | `trayBottom = insets.bottom + 64` (line 178) |
| **Compact height** | `TRAY_HEIGHT = 106` (line 53) |
| **Expanded height** | `Math.round(screenH * STUDIO_HEIGHT_PCT)` where `STUDIO_HEIGHT_PCT = 0.54` (lines 54, 119) |
| **Border radius** | `BORDER_RADIUS = 22` (line 58) |
| **Max width** | 540px on wide layouts (lines 194–197) |
| **Safe-area** | `useSafeAreaInsets()` → `insets.bottom` in `trayBottom` calculation (line 178) |
| **Responsive logic** | Height: percentage-based (`0.54 * screenH`). Width: `screenWidth >= 768` → centered at 540px via symmetric `left/right` (lines 118, 194–197). Uses `useWindowDimensions()` |
| **Consumers** | `src/app/create.tsx`, `src/app/event/edit/[id].tsx` |

### 4. EffectTray

| Property | Value |
|----------|-------|
| **File** | `src/components/create/EffectTray.tsx` |
| **Component** | `EffectTray` (named export) |
| **Container style** | `styles.outerContainer` (lines 997–1001): `position: "absolute", left: 12, right: 12, zIndex: 50`. Wide override at lines 219–222. |
| **Bottom offset** | `trayBottom = insets.bottom + 64` (line 204) |
| **Compact height** | `TRAY_HEIGHT = 106` (line 51) |
| **Expanded height** | `Math.round(screenH * LIBRARY_HEIGHT_PCT)` where `LIBRARY_HEIGHT_PCT = 0.52` (lines 52, 143) |
| **Border radius** | `BORDER_RADIUS = 22` (line 55) |
| **Max width** | 540px on wide layouts (lines 219–222) |
| **Safe-area** | `useSafeAreaInsets()` → `insets.bottom` in `trayBottom` calculation (line 204) |
| **Responsive logic** | Height: percentage-based (`0.52 * screenH`). Width: `screenWidth >= 768` → centered at 540px via symmetric `left/right` (lines 141, 219–222). Uses `useWindowDimensions()` |
| **Consumers** | `src/app/create.tsx`, `src/app/event/edit/[id].tsx` |

### 5. CreateBottomDock

| Property | Value |
|----------|-------|
| **File** | `src/components/create/CreateBottomDock.tsx` |
| **Component** | `CreateBottomDock` (named export) |
| **Container lines** | 50–120 (outer `<View position="absolute">`) |
| **Position** | Compact: `left: 0, right: 0, paddingHorizontal: 40`. Wide (≥768): centered via symmetric `left/right = Math.max(40, (screenWidth - 400) / 2)` (lines 54–59) |
| **Bottom offset** | `bottom: insets.bottom + 8` (line 60) |
| **Inner pill** | `borderRadius: 28, paddingVertical: 6, paddingHorizontal: 8` (lines 70–71) |
| **Max width** | 400px on wide layouts (lines 54–59) |
| **Safe-area** | `useSafeAreaInsets()` → `insets.bottom` in `bottom` offset (line 34, 60) |
| **Responsive logic** | `screenWidth >= 768` → centered 400px dock (lines 36, 54–59). Hides on keyboard visible (lines 39–48). Uses `useWindowDimensions()` |
| **Consumers** | `src/app/create.tsx` |

### 6. AppHeader (Tab Screens)

| Property | Value |
|----------|-------|
| **File** | `src/components/AppHeader.tsx` |
| **Component** | `AppHeader` (named export) |
| **Container lines** | 76–134 (outer `<View>`) |
| **Padding** | `paddingHorizontal: HEADER_PX (20), paddingTop: HEADER_PT (8) or insets.top + 8, paddingBottom: HEADER_PB (16)` (lines 18–20, 60, 78–80) |
| **Title row** | `minHeight: HEADER_MIN_H (44)`, `flexDirection: "row", justifyContent: "space-between"` (lines 86–90) |
| **Right slot** | `minWidth: RIGHT_SLOT_MIN_W (48)` (line 25, 107) |
| **Title size** | `HEADER_TITLE_SIZE = 28` (line 23) |
| **Max width** | 600px on wide layouts — inner content wrapper at line 83 |
| **Safe-area** | `useSafeAreaInsets()` → `insets.top` applied when `includeSafeAreaTop=true` (lines 57–60) |
| **Responsive logic** | `screenWidth >= 768` → inner content wrapped in `maxWidth: 600, alignSelf: "center", width: "100%"` (lines 59, 83). Uses `useWindowDimensions()` |
| **Consumers** | `src/app/discover.tsx`, `src/app/calendar.tsx`, `src/app/social.tsx`, `src/app/friends.tsx`, `src/app/profile.tsx` |

### 7. Event Detail Header

| Property | Value |
|----------|-------|
| **File** | `src/app/event/[id].tsx` |
| **Component** | Inline JSX block (not extracted) |
| **Container lines** | 2604–2663 (nav bar `<View>`) |
| **Padding** | `paddingHorizontal: 14, paddingTop: insets.top + 6, paddingBottom: 6` (lines 2608–2610) |
| **Button size** | `width: 40, height: 40, borderRadius: 20` (lines 2616, 2625) |
| **Layout** | `flexDirection: "row", justifyContent: "space-between"` (lines 2605–2607) |
| **Max width** | 600px on wide layouts (line 2612) |
| **Safe-area** | `useSafeAreaInsets()` → `insets.top` in `paddingTop` (line 2609) |
| **Responsive logic** | `screenWidth >= 768` → `maxWidth: 600, alignSelf: "center", width: "100%"` (line 2612). Uses `screenWidth` from `useWindowDimensions()` (line 389) |
| **Consumers** | Inline in `event/[id].tsx` only |

### 8. CreateEditorHeader

| Property | Value |
|----------|-------|
| **File** | `src/components/create/CreateEditorHeader.tsx` |
| **Component** | `CreateEditorHeader` (named export) |
| **Container lines** | 34–131 (outer `<View position="absolute">`) |
| **Position** | `position: "absolute", top: 0, left: 0, right: 0, zIndex: 20` (line 35) |
| **BlurView** | `intensity: 88, paddingTop: insets.top` (lines 40–42) |
| **Action row** | `paddingTop: 4, paddingHorizontal: 16, paddingBottom: 10` (lines 52–53). Wide: adds `maxWidth: 600, alignSelf: "center", width: "100%"` (line 58) |
| **Button min-width** | `minWidth: 70` (lines 64, 93) |
| **Layout** | `flexDirection: "row", justifyContent: "space-between"` (lines 55–57) |
| **Max width** | 600px on wide layouts — action row (line 58) |
| **Safe-area** | `useSafeAreaInsets()` → `insets.top` in BlurView `paddingTop` (lines 28, 42) |
| **Responsive logic** | `screenWidth >= 768` → action row gets `maxWidth: 600, alignSelf: "center", width: "100%"` (lines 30, 58). Uses `useWindowDimensions()` |
| **Consumers** | `src/app/create.tsx` |

### 9. InviteFlipCard

| Property | Value |
|----------|-------|
| **File** | `src/components/InviteFlipCard.tsx` |
| **Component** | `InviteFlipCard` (named export) |
| **Container lines** | 194–779 (outer `<View paddingHorizontal: 16>`) |
| **Width** | `width: "100%"` on both faces (lines 200, 523) |
| **Wrapper padding** | `paddingHorizontal: 16` (line 194). Wide: adds `maxWidth: 480, alignSelf: "center", width: "100%"` |
| **Aspect ratio** | `aspectRatio: 3 / 4` on both faces (lines 204, 535) |
| **Photo zone** | `height: "62%"` (line 215) |
| **Card radius** | `CARD_RADIUS = 28` (line 86) |
| **Plaque padding** | Photo: `paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18` (lines 279–281). No-photo: `paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24` (lines 388–390) |
| **Back padding** | `padding: 24, paddingTop: 20` (line 556) |
| **Max width** | 480px on wide layouts (line 194) |
| **Safe-area** | None (not applicable — card is inside scroll content) |
| **Responsive logic** | `screenWidth >= 768` → `maxWidth: 480, alignSelf: "center"` (lines 129–130, 194). Uses `useWindowDimensions()` |
| **Consumers** | `src/app/event/[id].tsx` |

### 10. BottomSheet (General)

| Property | Value |
|----------|-------|
| **File** | `src/components/BottomSheet.tsx` |
| **Component** | `BottomSheet` (default export) |
| **Container lines** | 98–144 (inner `Animated.View` — the visible sheet panel) |
| **Height** | `Math.min(Math.round(screenH * heightPct), maxH)` where `heightPct` default `0.65`, `maxHeightPct` default `0.85` (lines 68–69, 84–86) |
| **Border radius** | `borderTopLeftRadius: 24, borderTopRightRadius: 24` (lines 102–103) |
| **Padding** | `paddingBottom: Math.max(insets.bottom, 20)` (line 105). Title row: `paddingHorizontal: 20` (line 126) |
| **Max width** | None |
| **Safe-area** | `useSafeAreaInsets()` → `insets.bottom` in `paddingBottom` (lines 78, 105) |
| **Responsive logic** | Height is percentage-based. No width logic. |
| **Consumers** | `src/app/event/[id].tsx`, `src/app/circle/[id].tsx`, `src/components/create/CreateSheets.tsx`, `src/components/create/CoverMediaPickerSheet.tsx`, `src/components/circle/CircleMembersSection.tsx`, `src/components/ideas/DailyIdeasDeck.tsx`, `src/components/HelpSheet.tsx`, `src/components/DayAgendaSheet.tsx` |
