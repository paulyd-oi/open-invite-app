# Theme & Effects System

> Visual theming and particle effect engine.
> Owner: `src/lib/eventThemes.ts`, `ThemeEffectLayer.tsx`, `MotifOverlay.tsx`

---

## Theme Catalog

- **30 total:** 5 free (neutral, chill_hang, dinner_night, game_night, worship_night) + 25 premium (Pro-gated)
- Stored as `themeId String?` on event model
- Resolved via `resolveEventTheme(themeId)` → `EventThemeTokens`

### EventThemeTokens

```typescript
{
  label, swatch, gradientTint, vibeLabel,
  backAccent, backBgDark, backBgLight,
  pageTintDark, pageTintLight, chipAccent,
  visualStack?: ThemeVisualStack
}
```

### ThemeVisualStack

```typescript
{
  gradient?: { colors: string[]; speed?; angle? },
  shader?: "aurora" | "shimmer" | "plasma" | "bokeh",
  particles?: string,   // effectPreset name from EFFECT_CONFIGS
  lottie?: string,      // key into LOTTIE_EFFECTS
  image?: { source; opacity?; blendMode? },
  filter?: "film_grain" | "vignette" | "noise" | "color_shift",
  video?: { source; poster?; opacity? }
}
```

---

## Custom Themes

- Stored as `customThemeData Json?` on event model
- Shape: `{ visualStack: ThemeVisualStack, name: string }`
- Built via ThemeTray's "Theme Studio" (gradient colors + shader + speed)
- Resolved via `buildCustomThemeTokens(customThemeData)` → `EventThemeTokens`

---

## Effects (Independent of Theme)

- Stored as `effectId String?` + `customEffectConfig Json?` on event model
- `effectId` references a key in `EFFECT_CONFIGS` (or `"__custom__"` for custom)
- Custom effects store full `ParticleMotifConfig` JSON

### EFFECT_CONFIGS

- **33 presets** defined in `ThemeEffectLayer.tsx`
- Categories: ambient, celebration, nature, romance, sports, seasonal
- Each config: particleCount, size range, opacity range, speed range, sway, colors, shapes, motionMode

### MotifOverlay (src/components/create/MotifOverlay.tsx)

- Renders large sparse art-directed motifs (petals, hearts, footballs, etc.)
- Skia Canvas + Reanimated engine
- Content-safe zones: top/bottom 80px at 0.3× opacity
- Limits: MAX_MOTIF_RADIUS = 28px, MAX_MOTIF_COUNT = 14
- Lottie cycle: 10s play → 1s fade → 20s cooldown

### ParticleMotifConfig

```typescript
{
  particleCount, minSize, maxSize,
  minOpacity, maxOpacity, minSpeed, maxSpeed,
  swayAmplitude, minSwayPeriod, maxSwayPeriod,
  direction: 1 | -1, blurSigma, colors: string[],
  shapes?: ShapeType[], motionMode?: "falling" | "rising" | "floating" | "swirl"
}
```

---

## ThemeEffectLayer (src/components/ThemeEffectLayer.tsx)

- Skia Canvas GPU-accelerated particles (soft-edged circles with blur)
- SkSL shaders: aurora, shimmer, plasma, bokeh
- Performance guards: `useReducedMotion`, `_skiaAvailable` flag, `SkiaErrorBoundary`
- Lazy shader compilation via `_shaderCache`
- Returns `null` when no particles/effects configured

---

## Pickers

### ThemeTray (src/components/create/ThemeTray.tsx)

- **Compact:** Horizontal swatch rail (42×42px cards, lock icon for premium)
- **Expanded:** Theme Studio — gradient editor (3 colors max), shader selector, speed slider
- Material: BlurView frosted glass

### EffectTray (src/components/create/EffectTray.tsx)

- **Compact:** Horizontal circle swatch rail
- **Expanded:** Dual-pane studio
  - Create tab: Live Skia particle editor (shapes, density, colors, direction)
  - Animated tab: Lottie presets (confetti, hearts, balloons, fireworks)
- Material: BlurView frosted glass

---

## Render Precedence (Event Page + Create Preview)

```
IF effectId exists → MotifOverlay (user effect)
ELSE IF theme has particles/lottie → ThemeEffectLayer (theme particles)
ELSE → no particle layer
```

Theme gradient, video, shaders, and filters render regardless of effect selection.
Only the particle layer is exclusive.

---

## Persistence (DB Fields)

| Field | Type | Purpose |
|-------|------|---------|
| `themeId` | `String?` | Catalog theme key |
| `customThemeData` | `Json?` | `{ visualStack, name }` for custom themes |
| `effectId` | `String?` | Effect preset key or `"__custom__"` |
| `customEffectConfig` | `Json?` | Full ParticleMotifConfig for custom effects |

All four fields in contract alignment: Prisma ↔ serializer ↔ backend contracts ↔ frontend contracts.
