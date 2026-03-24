# Open Invite Design System — SSOT

> **Last updated:** 2026-03-23
> **Stack:** Expo SDK 53 / React Native 0.76.7 / NativeWind + Tailwind v3 / react-native-reanimated v3 / @shopify/react-native-skia
> **Style:** Glass Chrome + Plaque Cards — a cinematic, layered aesthetic with frosted-glass navigation, full-page themed canvases, and 3D flip invite cards.

---

## 1. Color System

### 1.1 Theme Colors (User-Selectable Accent)

These are the user's personal accent color. The active one is stored per-user and threaded through `ThemeContext.themeColor`.

| Name | Hex | Usage |
|------|-----|-------|
| Indigo | `#5B67CA` | Default accent |
| Blue | `#007AFF` | iOS system blue |
| Coral | `#FF6B4A` | Warm/energetic |
| Teal | `#4ECDC4` | Fresh/calm |
| Sky Blue | `#45B7D1` | Light/airy |
| Sage | `#96CEB4` | Organic/earthy |
| Purple | `#9B59B6` | Creative/bold |
| Rose | `#E84393` | Vibrant/feminine |
| Amber | `#F39C12` | Warm/inviting |

### 1.2 Semantic Status Colors

Defined in `src/ui/tokens.ts`. Each status has three tokens: `fg` (foreground), `bgSoft` (14% tinted background), `border` (28% tinted border).

| Status | fg | bgSoft | border | Usage |
|--------|-----|--------|--------|-------|
| going | `#22C55E` | `rgba(34,197,94,0.14)` | `rgba(34,197,94,0.28)` | RSVP going, success states |
| interested | `#EC4899` | `rgba(236,72,153,0.14)` | `rgba(236,72,153,0.28)` | RSVP saved/interested |
| soon | `#F97316` | `rgba(249,115,22,0.14)` | `rgba(249,115,22,0.28)` | Starting soon badges |
| info | `#6366F1` | `rgba(99,102,241,0.14)` | `rgba(99,102,241,0.28)` | Informational chips |
| destructive | `#EF4444` | `rgba(239,68,68,0.14)` | `rgba(239,68,68,0.28)` | Delete, errors, full |
| birthday | `#FF69B4` | `rgba(255,105,180,0.14)` | `rgba(255,105,180,0.28)` | Birthday badges |
| warning | `#F59E0B` | `rgba(245,158,11,0.14)` | `rgba(245,158,11,0.28)` | Caution states |
| premium | `#FFD700` | `rgba(255,215,0,0.14)` | `rgba(255,215,0,0.28)` | Pro/premium features |

### 1.3 Surface Palette — Light Mode

Defined in `src/lib/ThemeContext.tsx` as `LIGHT_COLORS`.

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#FFFFFF` | Root screen background |
| `surface` | `#FFFFFF` | Card/tile background |
| `surfaceElevated` | `#FFFFFF` | Elevated card background |
| `surfaceSubtle` | `#F6F7F9` | Subtle differentiation bg |
| `surface2` | `#F3F4F6` | Secondary surface |
| `text` | `#1F2937` | Primary text |
| `textSecondary` | `#6B7280` | Secondary text |
| `textTertiary` | `#9CA3AF` | Tertiary/muted text |
| `border` | `#E5E7EB` | Primary border |
| `borderSubtle` | `#F0F0F0` | Subtle border (tiles in light) |
| `separator` | `#F3F4F6` | List separators |
| `divider` | `#F3F4F6` | Section dividers |
| `pillBg` | `#F3F4F6` | Pill/chip neutral bg |
| `iconMuted` | `#9CA3AF` | Muted icon color |
| `avatarBg` | `#E5E7EB` | Avatar placeholder bg |
| `inputBg` | `#F9FAFB` | Input field background |
| `segmentBg` | `#F2F2F7` | Segmented control bg |
| `segmentActive` | `#FFFFFF` | Active segment bg |

### 1.4 Surface Palette — Dark Mode

Defined in `src/lib/ThemeContext.tsx` as `DARK_COLORS`.

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#080808` | Root screen background |
| `surface` | `#1C1C1E` | Card/tile background |
| `surfaceElevated` | `#2A2A2E` | Elevated card background |
| `surfaceSubtle` | `#141416` | Subtle differentiation bg |
| `surface2` | `#252528` | Secondary surface |
| `text` | `#FFFFFF` | Primary text |
| `textSecondary` | `#98989F` | Secondary text |
| `textTertiary` | `#6E6E73` | Tertiary/muted text |
| `border` | `#3C3C40` | Primary border |
| `borderSubtle` | `#2E2E32` | Subtle border |
| `separator` | `#252528` | List separators |
| `divider` | `#1A1A1C` | Section dividers |
| `pillBg` | `#2A2A2E` | Pill/chip neutral bg |
| `iconMuted` | `#6E6E73` | Muted icon color |
| `avatarBg` | `#2C2C2E` | Avatar placeholder bg |
| `inputBg` | `#1A1A1C` | Input field background |
| `segmentBg` | `#141416` | Segmented control bg |
| `segmentActive` | `#2C2C2E` | Active segment bg |

### 1.5 Button Color Tokens

Each button variant has 3 states: default, pressed, disabled. Defined in ThemeContext.

| Variant | Light bg | Light pressed | Dark bg | Dark pressed |
|---------|----------|--------------|---------|-------------|
| primary | `themeColor` | `themeColor + "CC"` | `themeColor` | `themeColor + "CC"` |
| secondary | `#FFFFFF` | `#F6F7F9` | `#2A2A2E` | `#252528` |
| ghost | `transparent` | `#F6F7F9` | `transparent` | `#141416` |
| destructive | `#EF4444` | `#DC2626` | `#DC2626` | `#B91C1C` |
| success | `#22C55E` | `#16A34A` | `#16A34A` | `#15803D` |

Disabled bg (all variants, light): `#E5E7EB` — dark: `#2C2C2E`
Disabled text (light): `#9CA3AF` — dark: `#6E6E73`

### 1.6 Overlay & Scrim

| Token | Value | Usage |
|-------|-------|-------|
| `SCRIM.medium` | `rgba(15,23,42,0.34)` | Modal/sheet backdrop |
| `HERO_GRADIENT.colors` | `["rgba(0,0,0,0.18)", "rgba(0,0,0,0.08)", "rgba(0,0,0,0.62)"]` | Image text protection |
| `HERO_GRADIENT.locations` | `[0, 0.4, 1]` | Gradient stops |
| `HERO_WASH.light` | `["rgba(245,240,255,0.9)", "rgba(255,255,255,0)"]` | No-photo hero (light) |
| `HERO_WASH.dark` | `["rgba(30,25,50,0.6)", "rgba(0,0,0,0)"]` | No-photo hero (dark) |

---

## 2. Event Theme System

10 themes (5 basic/free + 5 premium/Pro). Each defines a complete color palette for card front, card back, page chrome, and chip accents. Defined in `src/lib/eventThemes.ts`.

### 2.1 Basic Themes (Free)

| Theme ID | Label | Accent | Page Bg Light | Page Bg Dark | Effect |
|----------|-------|--------|---------------|-------------|--------|
| `neutral` | Classic | `#8E8E93` | `#FAF9F7` | `#1C1C1E` | none |
| `chill_hang` | Chill Hang | `#14B8A6` | `#CCFBF1` | `#0D3B3E` | `coastal_haze` |
| `dinner_night` | Dinner Night | `#FF9800` | `#FFF3E8` | `#261C10` | none |
| `game_night` | Game Night | `#8B5CF6` | `#CBC5FF` | `#1A1A3E` | `arcade_sparkle` |
| `worship_night` | Worship Night | `#9C7C63` | `#F5EDE5` | `#221C16` | `ambient_dust` |

### 2.2 Premium Themes (Pro)

| Theme ID | Label | Accent | Page Bg Light | Page Bg Dark | Effect |
|----------|-------|--------|---------------|-------------|--------|
| `summer_splash` | Summer Splash | `#00ACC1` | `#B8EBF5` | `#0A2A38` | none |
| `fall_harvest` | Fall Harvest | `#D4763B` | `#FAEDE0` | `#28180C` | none |
| `winter_glow` | Winter Glow | `#6495ED` | `#C7D7FF` | `#111B3A` | `snowfall` |
| `game_day` | Game Day | `#43A047` | `#C2EFC9` | `#0F2E16` | none |
| `birthday_bash` | Birthday Bash | `#FF6B4A` | `#FFE8E4` | `#28120E` | none |

### 2.3 Theme Token Interface

```typescript
interface EventThemeTokens {
  label: string;           // Display name in picker
  swatch: string;          // Emoji for picker swatch
  gradientTint: string;    // Front card gradient scrim tint
  vibeLabel: string;       // Front card label (no-photo)
  backAccent: string;      // Back card accent (strip, icon boxes, host ring)
  backBgDark: string;      // Back card dark mode bg
  backBgLight: string;     // Back card light mode bg
  pageTintDark: string;    // Page chrome tint (dark)
  pageTintLight: string;   // Page chrome tint (light)
  chipAccent: string;      // Chip/badge accent
  effectPreset?: string;   // Particle effect ID (null = none)
}
```

### 2.4 How to Add a New Theme

1. Add the ID to `BASIC_THEME_IDS` or `PREMIUM_THEME_IDS` in `eventThemes.ts`
2. Add the full token object to `EVENT_THEMES` record
3. Follow the palette pattern: accent color → derive `backBgLight` (pastel tint), `backBgDark` (deep tint), `pageTintLight` (12-18% rgba), `pageTintDark` (20-30% rgba)
4. `gradientTint`: use the accent at 22-32% opacity
5. If adding a particle effect, add the preset config to `ThemeEffectLayer.tsx` `EFFECT_CONFIGS`
6. Add the ID to `ALLOWED_THEME_IDS` on the backend

---

## 3. Typography

### 3.1 Font Family

| Weight | Font Name | CSS/RN Reference | Usage |
|--------|-----------|-----------------|-------|
| 300 | Sora Light | `Sora_300Light` | Decorative, large display text |
| 400 | Sora Regular | `Sora_400Regular` | Body text, descriptions |
| 500 | Sora Medium | `Sora_500Medium` | Labels, chips, secondary headings |
| 600 | Sora SemiBold | `Sora_600SemiBold` | Buttons, emphasized text |
| 700 | Sora Bold | `Sora_700Bold` | Headings, titles |

Loaded via `@expo-google-fonts/sora` in `src/lib/fonts.ts`. Root layout gates first paint on font load to prevent FOIT.

NativeWind class: `font-sora-bold` maps to `Sora_700Bold`.

### 3.2 Type Scale

| Role | Size (px) | Weight | Line Height | Usage |
|------|-----------|--------|-------------|-------|
| Page title | 28 | 700 Bold | 1.2 | AppHeader title, screen titles |
| Section heading | 18-20 | 700 Bold | 1.3 | Card headers, section labels |
| Body large | 16 | 600 SemiBold | 1.4 | CTA buttons, emphasized body |
| Body | 15 | 400-500 Regular/Medium | 1.5 | Primary body text, descriptions |
| Body small | 13 | 500 Medium | 1.4 | Chips, labels, metadata |
| Caption | 12 | 400-500 Regular/Medium | 1.3 | Timestamps, helper text, subtitles |
| Micro | 11 | 500 Medium | 1.2 | Small chips, badges |

### 3.3 AppHeader Subtitle

```
fontSize: 12
fontWeight: 400
letterSpacing: 0.6
marginTop: 1
opacity: 0.72
textTransform: lowercase
```

---

## 4. Spacing & Layout

### 4.1 Spacing Scale (Base-4)

Defined in `src/ui/layout.ts`.

| Token | Value (pt) | Usage |
|-------|------------|-------|
| `xxs` | 2 | Hairline gaps |
| `xs` | 4 | Tight internal padding |
| `sm` | 6 | Chip vertical padding, small gaps |
| `md` | 8 | Standard internal gap |
| `lg` | 10 | Button vertical padding (md size) |
| `xl` | 12 | Chip horizontal padding, button padding (sm) |
| `xxl` | 16 | Section padding, button horizontal padding |
| `xxxl` | 20 | Large section gaps |
| `xxxxl` | 24 | Page-level section spacing |

### 4.2 Border Radius Scale

Defined in `src/ui/layout.ts`.

| Token | Value (pt) | Usage |
|-------|------------|-------|
| `sm` | 8 | Small cards, inputs |
| `md` | 12 | Medium surfaces |
| `lg` | 16 | Tile default, standard cards |
| `xl` | 20 | Large cards, RSVP status bars |
| `xxl` | 24 | Hero cards, swipe surfaces |
| `pill` | 9999 | Pill buttons, chips, tags |

Special: InviteFlipCard uses `CARD_RADIUS: 28` — the largest non-pill radius in the system.

### 4.3 Hit Targets

| Token | Value | Standard |
|-------|-------|----------|
| `MIN_TAP` | 44pt | Apple HIG minimum tap target |

The `hitSlop()` utility computes symmetric padding to reach 44pt for undersized elements.

### 4.4 AppHeader Layout

```
paddingHorizontal: 20
paddingTop: 8
paddingBottom: 16
minHeight: 44
titleFontSize: 28
rightSlotMinWidth: 48
```

---

## 5. Elevation & Shadows

### 5.1 Tile Shadow Scale

Defined in `src/lib/ThemeContext.tsx` and `src/ui/Tile.tsx`.

| Tier | Name | shadowOpacity | shadowRadius | shadowOffset | elevation | Usage |
|------|------|--------------|-------------|-------------|-----------|-------|
| 0 | none | — | — | — | — | Canvas-level, no shadow |
| 1 | `TILE_SHADOW` | 0.06 | 8 | `{0, 2}` | 2 | Standard cards (light mode) |
| 2 | `TILE_SHADOW_ACCENT` | 0.10 | 12 | `{0, 4}` | 3 | Accent/elevated cards (light mode) |
| — | `DARK_ACCENT_SHADOW` | 0.35 | 6 | `{0, 2}` | 3 | Accent tiles (dark mode only) |

**Dark mode rule:** Borders are primary separation. Shadows are almost invisible against dark backgrounds, so dark mode uses `border: 1px colors.border` instead.

### 5.2 InviteFlipCard Shadow

```
iOS:
  shadowColor: "#000"
  shadowOffset: { width: 0, height: 12 }
  shadowOpacity: 0.22
  shadowRadius: 36

Android:
  elevation: 14
```

This is the deepest shadow in the app — the flip card floats dramatically above the page.

---

## 6. Component Inventory

### 6.1 Button (`src/ui/Button.tsx`)

| Variant | Background | Text Color | Border |
|---------|-----------|------------|--------|
| `primary` | `themeColor` | white | none |
| `secondary` | `surfaceElevated` | `themeColor` | 1px `buttonSecondaryBorder` |
| `ghost` | transparent | `themeColor` | none |
| `destructive` | `#EF4444` / `#DC2626` | white | none |
| `success` | `#22C55E` / `#16A34A` | white | none |

Sizes: `sm` (paddingH: 12, paddingV: 6, fontSize: 13) / `md` (paddingH: 16, paddingV: 10, fontSize: 15)
Press feedback: Reanimated spring scale (0.97) + bg color shift. No opacity dimming.
Shape: `borderRadius: RADIUS.pill (9999)`

### 6.2 Chip (`src/ui/Chip.tsx`)

| Variant | Background | Text Color |
|---------|-----------|------------|
| `neutral` | `pillBg` / `chipNeutralBg` | `textSecondary` / `chipNeutralText` |
| `muted` | `segmentBg` / `chipMutedBg` | `textTertiary` / `chipMutedText` |
| `accent` | `themeColor + "20"` | `themeColor` |
| `status` | `color + "20"` (or chipStatusBg) | `color` (or chipStatusText) |

Shape: `borderRadius: RADIUS.pill`
Press feedback (when tappable): Opacity dim to `PRESS_OPACITY (0.7)`.

### 6.3 IconButton (`src/ui/IconButton.tsx`)

| Variant | Background | Shape |
|---------|-----------|-------|
| `ghost` | transparent (pressed: `buttonGhostPressedBg`) | Circle |
| `filled` | `surfaceElevated` (pressed: `buttonSecondaryPressedBg`) | Circle |

Sizes: `sm` (32pt) / `md` (40pt). `hitSlop` ensures 44pt minimum tap target.

### 6.4 Tile (`src/ui/Tile.tsx`)

Floating surface container.

| Variant | Shadow (light) | Shadow (dark) |
|---------|---------------|---------------|
| `standard` | Tier 1 (subtle) | border only |
| `accent` | Tier 2 (stronger) | faint bottom shadow |

Default radius: 16 (`RADIUS.lg`). Background: `colors.surface`. Border: `1px colors.border (dark) / colors.borderSubtle (light)`.

### 6.5 InviteFlipCard (`src/components/InviteFlipCard.tsx`)

The signature component. A 3D-flipping invitation card.

- **Aspect ratio:** 3:4
- **Border radius:** 28pt
- **Flip duration:** 480ms
- **Flip easing:** Bezier(0.32, 0.0, 0.14, 1)
- **Perspective:** 1200
- **Front face:** Photo zone (62% height), gradient scrim, title/host overlay, countdown chip, attendee avatars
- **Back face:** Theme-colored background, accent strip, detail sections (time, location, host), QR code area
- **Front border:** 2px, `backAccent + "40"`
- **Back border:** 0.5px, theme-contextual
- **Shadow:** Deepest in the system (see 5.2)
- **BlurView usage:** Countdown chip (intensity: 40, tint: dark), emoji badge (intensity: 30, tint: dark)

### 6.6 AppHeader (`src/components/AppHeader.tsx`)

Standard top navigation header. Not glass-blurred (uses solid background from theme).

- Title: 28px Sora Bold, left-aligned
- Subtitle: 12px, 72% opacity, lowercase, letter-spacing 0.6
- Right slot: min-width 48pt for action buttons
- Variants: `standard` / `calendar`
- Safe area: Optional via `includeSafeAreaTop` prop

### 6.7 ThemeEffectLayer (`src/components/ThemeEffectLayer.tsx`)

Full-page ambient particle system rendered via Skia Canvas.

- Renders behind all content (`pointerEvents: "none"`, `absoluteFill`)
- GPU-accelerated via `@shopify/react-native-skia`
- Respects `useReducedMotion()` — returns null when enabled
- Error boundary for graceful degradation

### 6.8 SafeAreaScreen (`src/ui/SafeAreaScreen.tsx`)

JS-based safe area wrapper using `useSafeAreaInsets()` hook (not native `SafeAreaView`). Prevents async measurement layout jumps on cold start.

Edges: `"both"` | `"top"` | `"bottom"` | `"none"`

---

## 7. Animation & Motion

### 7.1 Timing Tokens

Defined in `src/ui/motion.ts`.

| Token | Duration | Usage |
|-------|----------|-------|
| `FADE_MS` | 180ms | Quick element fade (opacity in/out) |
| `SLIDE_MS` | 220ms | Slide-in panel/drawer transition |
| `SHEET_MS` | 240ms | Bottom-sheet present/dismiss |
| Flip card | 480ms | InviteFlipCard 3D flip |

### 7.2 Spring Presets

| Preset | Damping | Stiffness | Usage |
|--------|---------|-----------|-------|
| `SPRING_PRESS` | 15 | 400 | Press-scale effects (reactions, CTAs) |
| `SPRING_LAYOUT` | 20 | 300 | Layout shifts, gentle transitions |

### 7.3 Press Feedback Contract

| Component | Feedback Type | Value |
|-----------|--------------|-------|
| Button | Scale spring + bg color shift | `PRESS_SCALE: 0.97` with `SPRING_PRESS` |
| Chip (tappable) | Opacity dim | `PRESS_OPACITY: 0.7` |
| IconButton | Bg color shift | `buttonGhostPressedBg` / `buttonSecondaryPressedBg` |
| Tile | None (not interactive) | — |
| Custom Pressable | May use Reanimated scale/translate | Must NOT duplicate primitive patterns |

### 7.4 Easing Curves

| Curve | Value | Usage |
|-------|-------|-------|
| Flip card | `Easing.bezier(0.32, 0.0, 0.14, 1)` | 3D card flip |
| General enter | `FadeInDown.springify()` | Section entrance |
| General transitions | Reanimated `withSpring` | Interactive animations |

### 7.5 Haptics Contract

Defined in `src/ui/motion.ts`.

| Function | Feedback | Usage |
|----------|----------|-------|
| `hapticTap()` | Impact Light | Navigation taps, toggles, selections |
| `hapticConfirm()` | Impact Medium | Primary CTA confirmations, copy/share, create |
| `hapticSuccess()` | Notification Success | Successful outcomes |
| `hapticError()` | Notification Error | Destructive confirmations, errors |

Heavy impact: Destructive confirmations only (not exposed as helper — use `Haptics.impactAsync(Heavy)` directly).

### 7.6 Animation Boundaries (Performance)

- Scroll-heavy lists: NO JS-thread `Animated.timing` / `LayoutAnimation`. Use Reanimated (`withTiming` / `withSpring`) which runs on UI thread.
- Gesture-driven animations MUST stay in Reanimated worklets.
- Avoid animating layout props (`width`, `height`, `flex`) during scroll — prefer `opacity` / `transform` (GPU-composited).
- New choreography requires explicit opt-in; default is minimal motion (fade + slide only).

---

## 8. Particle Effect System

### 8.1 Effect Presets

| Preset | Theme | Count | Size | Speed | Blur | Direction | Character |
|--------|-------|-------|------|-------|------|-----------|-----------|
| `ambient_dust` | worship_night | 20 | 2-6pt | 12-25 px/s | 1.5 | Rises | Warm candlelight motes |
| `snowfall` | winter_glow | 40 | 3-8pt | 18-40 px/s | 2.0 | Falls | Winter snow/frost |
| `coastal_haze` | chill_hang | 18 | 12-22pt | 4-7 px/s | 11.0 | Rises | Large soft aqua mist |
| `arcade_sparkle` | game_night | 28 | 3-6pt | 8-13 px/s | 1.8 | Rises | Pulsing violet sparkles |

### 8.2 Effect Color Palettes

**ambient_dust:** warm white `rgba(255,244,220)`, soft gold `rgba(255,223,170)`, amber glow `rgba(255,210,140)`, candlelight `rgba(240,200,150)`

**snowfall:** pure white, ice blue `rgba(230,240,255)`, cool periwinkle `rgba(210,225,250)`, cornflower frost `rgba(200,215,255)`

**coastal_haze:** teal `rgba(20,184,166)`, seafoam `rgba(110,220,200)`, light aqua `rgba(160,240,225)`, white-mint `rgba(220,255,245)`

**arcade_sparkle:** game_night violet `rgba(139,92,246)`, lavender `rgba(167,139,250)`, pale violet `rgba(196,181,253)`, soft white `rgba(240,240,255)`. Includes opacity pulse: range `[0.70, 1.15]`, period `2.2-4.5s`.

### 8.3 How to Add a New Effect

1. Add a new key to `EFFECT_CONFIGS` in `ThemeEffectLayer.tsx`
2. Define: `particleCount`, size range, opacity range, speed range, sway params, blur sigma, color palette, direction (+1 down / -1 up)
3. Optional: add `pulseRange` and `pulsePeriodRange` for opacity pulsing
4. Reference the preset ID in the theme's `effectPreset` field in `eventThemes.ts`

---

## 9. Glass Chrome Pattern

The app's signature navigation aesthetic: frosted-glass overlays with subtle borders.

### 9.1 Usage Points

| Location | Intensity | Tint | Border | Background |
|----------|-----------|------|--------|------------|
| InviteFlipCard countdown | 40 | dark | none | `rgba(0,0,0,0.15)` |
| InviteFlipCard emoji badge | 30 | dark | none | `rgba(0,0,0,0.15)` |
| Event detail nav chips | 30 | dark | none | `rgba(0,0,0,0.15)` |

### 9.2 Glass Rules

- Use `expo-blur` `BlurView` component (not CSS backdrop-filter)
- `tint: "dark"` for overlays on images/colored backgrounds
- `tint: "light"` for overlays on white/neutral backgrounds
- Always pair with a semi-transparent `backgroundColor` fallback (Android doesn't always support blur)
- Border: 0.5px `rgba(255,255,255,0.12)` for light glass edges on dark surfaces
- Never use glass on scrolling content (performance). Glass is for fixed/floating chrome only.

---

## 10. Icon System

Defined in `src/ui/icons.tsx`.

**Library:** Ionicons (via `@expo/vector-icons`) wrapped in a Lucide-compatible API (`LucideIcon` type).

**Style:** Outline icons only (`*-outline` Ionicons variants). Consistent stroke weight.

**SafeIcon wrapper:** Renders fallback `help-circle-outline` if an icon import is undefined — prevents crashes.

**Sizing convention:**
- Navigation icons: 24pt (default)
- Inline/chip icons: 14-18pt
- Large decorative: 28-32pt

**Color convention:** Icons inherit color from their context. Use `themeColor` for accent, `colors.textSecondary` for muted, `colors.textTertiary` for disabled.

---

## 11. Anti-Patterns — What NOT to Do

### Visual

- **No purple gradients on white.** The app uses themed page canvases, not arbitrary gradients.
- **No generic centered web layouts.** Design for thumb zones and glanceability.
- **No emoji as structural icons.** Use Ionicons/Lucide via `src/ui/icons.tsx`. Emojis are only for picker swatches and user content.
- **No inline hex colors.** All colors must come from ThemeContext tokens, STATUS tokens, or eventTheme tokens.
- **No opacity-based button styling.** Buttons use bg color shift for press feedback, not opacity (except Chip).
- **No `rgba` backgrounds on primary action buttons.** Primary CTAs must have solid, opaque backgrounds for visual weight.

### Motion

- **No JS-thread animations in scroll contexts.** Use Reanimated (UI thread) exclusively.
- **No animations > 500ms** for micro-interactions. Keep under 300ms; only the flip card (480ms) exceeds this.
- **No decorative-only animation.** Every animation must express cause-and-effect.
- **No animating layout props** (width, height, flex) during scroll. Use transform/opacity.

### Layout

- **No `SafeAreaView` component.** Use `SafeAreaScreen` or `useSafeAreaInsets()` hook instead (prevents layout reflow).
- **No fixed pixel widths for containers.** Use flex and percentage-based layouts.
- **No horizontal scroll on main content.** Horizontal scrolling only for carousels/galleries.

### Architecture

- **No new packages** unless `@expo-google-font` or pure JS helpers.
- **No editing** patches/, babel.config.js, metro.config.js, app.json, tsconfig.json, nativewind-env.d.ts.
- **No AnimatedButton.tsx or AnimatedCard.tsx imports.** These are dead code — use SSOT primitives in `src/ui/`.

---

## 12. Design Principles

1. **Plaque-first:** Events are physical invitations, not rows in a list. The InviteFlipCard is the hero surface.
2. **Themed canvases:** Every event has its own atmosphere — page background, particle effects, accent colors create immersion.
3. **Glass layering:** Navigation and overlays use frosted glass for depth without heaviness.
4. **Minimal chrome:** Reduce UI chrome so the event content (photos, titles, vibes) dominates.
5. **Motion with meaning:** Spring physics for interactivity, fade for state transitions, particles for atmosphere.
6. **Dark-mode-first elevation:** In dark mode, borders replace shadows. Never rely on shadows alone for depth.
7. **Accessible by default:** 44pt tap targets, 4.5:1 contrast, reduced-motion support, screen-reader labels.
