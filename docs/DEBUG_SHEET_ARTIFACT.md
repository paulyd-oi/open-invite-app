# Event Detail Page — Colored Sheet Artifact Debug Packet

## Problem

On the event detail page (`src/app/event/[id].tsx`), colored "sheets" (translucent colored bands) appear at the **top** (above the hero card, behind status bar) and **bottom** (below the last content card) of the screen on certain themes. Most visible on:

- **chill_hang** (teal) — aqua/teal sheet at top and bottom edges
- **game_night** (purple) — violet/purple sheet at top and bottom edges

These sheets do NOT appear on:
- **birthday_bash** — clean, polished, cards float over atmosphere
- **worship_night** — clean, no visible sheets

**Goal:** Make teal and purple look like birthday and worship — no sheets, cards floating cleanly.

---

## Architecture: Atmosphere Layer Stack

The event detail page renders 4 absolutely-positioned atmosphere layers behind scrollable content, inside a `SafeAreaView` with `backgroundColor: "transparent"` and `edges={[]}`:

```
┌─ SafeAreaView (transparent) ─────────────────────┐
│  1. AnimatedGradientLayer  (absoluteFill)          │ ← expo-linear-gradient crossfade
│  2. ThemeVideoLayer        (absoluteFill)          │ ← looping video (if configured)
│  3. ThemeEffectLayer       (absoluteFill)          │ ← Skia Canvas: SkSL shaders + particles + Lottie
│  4. ThemeFilterLayer       (absoluteFill)          │ ← Skia Canvas: film_grain/vignette post-process
│                                                    │
│  KeyboardAwareScrollView (content on top)          │
│    ├─ Hero zone (InviteFlipCard)                   │
│    ├─ Content cards (ABOUT, WHO'S COMING, etc.)    │
│    └─ Bottom padding                               │
└────────────────────────────────────────────────────┘
```

**File locations:**
- `src/app/event/[id].tsx` — Main page, lines ~2410-2450 render the layer stack
- `src/components/AnimatedGradientLayer.tsx` — Layer 1: expo-linear-gradient with animated crossfade
- `src/components/ThemeEffectLayer.tsx` — Layer 3: Skia Canvas with ShaderBackgroundField + ParticleField + Lottie
- `src/components/ThemeFilterLayer.tsx` — Layer 4: Skia Canvas with FractalNoise/vignette
- `src/lib/eventThemes.ts` — Theme configs including gradient colors and particle presets

---

## Confirmed Root Cause (via DEBUG_LAYERS toggle)

A `DEBUG_LAYERS` object in `[id].tsx` (~line 2403) allows independently disabling each layer:

```typescript
const DEBUG_LAYERS = {
  gradient: true,  // Layer 1
  video: true,     // Layer 2
  effect: true,    // Layer 3 (ThemeEffectLayer)
  filter: true,    // Layer 4
};
```

### Test results:
| Toggle | Result |
|--------|--------|
| `gradient: false` | Eliminates the thin strip BETWEEN hero card bottom and first content card |
| `effect: false` | **Eliminates the top and bottom sheets entirely** |
| `video: false` | No change (teal/purple don't use video) |
| `filter: false` | No change for this issue |

**Conclusion: The ThemeEffectLayer (Layer 3) causes the top/bottom sheets.**

### Further isolation within ThemeEffectLayer:
- Added `disableShader` prop to skip only the SkSL ShaderBackgroundField → **sheets still visible**
- This proves the **Skia particles themselves** (not just the shader) create the collective haze that appears as sheets

---

## Why Some Themes Have Sheets and Others Don't

### Themes WITH sheets (problematic):

**chill_hang (teal)** — `visualStack.particles: "coastal_haze"`, `visualStack.shader: "aurora"`
```
coastal_haze config:
  particleCount: 18
  minSize: 12, maxSize: 22        ← LARGE particles
  minOpacity: 0.09, maxOpacity: 0.17
  blurSigma: 11                   ← MASSIVE blur — each particle becomes a ~50px translucent blob
  colors: teal/seafoam/aqua/mint
  shaderPreset: "aurora"
```

**game_night (purple)** — `visualStack.particles: "arcade_sparkle"`, `visualStack.shader: "plasma"`
```
arcade_sparkle config:
  particleCount: 28               ← MANY particles
  minSize: 3, maxSize: 6
  minOpacity: 0.18, maxOpacity: 0.30  ← Higher opacity than coastal_haze
  blurSigma: 1.8
  colors: violet/lavender/pale violet/white
  pulseRange: [0.70, 1.15]
  (no shaderPreset in particle config — shader comes from theme's visualStack.shader: "plasma")
```

### Themes WITHOUT sheets (clean):

**birthday_bash** — `visualStack.particles: "party_confetti"`, `visualStack.lottie: "confetti_scene"`
```
party_confetti config:
  particleCount: 32
  minSize: 4, maxSize: 9
  minOpacity: 0.65, maxOpacity: 0.95  ← High opacity but SHARP
  blurSigma: 0.4                      ← Almost no blur — discrete dots, don't merge
  colors: red/gold/pink/blue/teal/purple
  NO shaderPreset
```
Also has Lottie overlay (confetti_burst.json at 0.5 opacity) — this renders fine.

**worship_night** — `visualStack.particles: "candlelight"` (mapped via "light_rays" key)
```
candlelight config:
  particleCount: 10               ← FEW particles
  minSize: 8, maxSize: 20
  minOpacity: 0.08, maxOpacity: 0.20
  blurSigma: 8                    ← High blur BUT only 10 particles — not enough to merge into sheet
  shaderPreset: "bokeh", shaderOpacity: 0.06
```

### Pattern:
- **Sheets appear** when many blurry particles at screen edges create a collective translucent haze
- `coastal_haze`: 18 particles × blur 11 × size 12-22 = massive coverage, merge into visible sheet
- `arcade_sparkle`: 28 particles × opacity 0.30 = enough collective brightness to see as sheet
- `party_confetti`: blur 0.4 = sharp dots that NEVER merge
- `candlelight`: only 10 particles = not enough to form a sheet

---

## Gradient Layer (Secondary Issue)

The gradient also contributes a thin strip between the hero card and content (not the top/bottom sheets).

**Teal gradient:** `["rgba(13,59,62,0.50)", "rgba(20,184,166,0.38)", "rgba(110,220,200,0.25)", "rgba(8,80,78,0.50)"]`
**Purple gradient:** `["rgba(26,26,62,0.50)", "rgba(139,92,246,0.40)", "rgba(100,60,200,0.28)", "rgba(20,20,55,0.50)"]`

First and last stops are dark colors at 0.50 opacity — visible at screen edges.

**Birthday gradient:** `["rgba(40,18,14,0.50)", "rgba(236,72,153,0.38)", "rgba(249,115,22,0.28)", "rgba(35,12,10,0.50)"]`

Birthday has similar structure but the warm dark tones blend better with the page background (less contrast = less visible).

---

## What Has Been Tried (All Failed)

### On the gradient:
1. Made first/last gradient colors `"transparent"` → exposed white page background (ugly)
2. Reduced gradient opacity to 0.45 globally → sheets still visible, just lighter
3. Changed gradient angle to 135° diagonal → created diagonal banding (terrible)
4. Inset gradient (top: 120, bottom: 120) → hard edges where gradient started
5. Reduced gradient edge opacity to 0.12 → still visible
6. Added LinearGradient "bridge" between card and content → visible as colored block

### On the effect layer:
7. Added `disableShader` prop to ThemeEffectLayer → sheets still visible (particles cause them too)
8. Added SkSL `smoothstep` top fade to all 4 shader programs → no visible improvement
9. Attempted Skia Group layer + dstIn blend mask with LinearGradient → did not work (possibly color format issue with "transparent"/"black" strings in Skia LinearGradient, or SaveLayer approach incompatible)
10. Added `opacity: 0.35` prop to ThemeEffectLayer container View → **no visible change** (this is suspicious — suggests the opacity prop may not be applying, or the sheet source is elsewhere)

### On the content area:
11. Added `colors.background` content well → killed frosted glass card aesthetic
12. Added `canvasColor` content well → looked "blocky and cheap"

---

## Key Observation: opacity={0.35} Had No Effect

The most recent attempt (setting the ThemeEffectLayer container View opacity to 0.35) should have dramatically reduced particle visibility, but the screenshots show **no visible change**. This suggests one of:

1. The `opacity` prop isn't being applied (code bug — need to verify)
2. The sheet artifact is NOT coming from ThemeEffectLayer at all in the current code state — possibly a different layer or element
3. The ThemeEffectLayer is being conditionally skipped (e.g., `event.effectId` exists, routing to `MotifOverlay` instead)

**Critical check:** In `[id].tsx` line 2436, the effect layer has a branch:
```tsx
{DEBUG_LAYERS.effect && (event.effectId ? (
  // MotifOverlay renders when effectId exists
  <MotifOverlay ... />
) : (
  // ThemeEffectLayer renders when NO effectId
  <ThemeEffectLayer ... />
))}
```
If these test events have an `effectId` set, they'd render via `MotifOverlay` (which has NO opacity/disableShader props), completely bypassing our ThemeEffectLayer fixes.

---

## Current File State

### `src/app/event/[id].tsx` (relevant section ~2436-2446):
```tsx
{DEBUG_LAYERS.effect && (event.effectId ? (
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <MotifOverlay
      presetId={event.effectId}
      customConfig={event.customEffectConfig ?? undefined}
      intensity={0.70}
    />
  </View>
) : (
  <ThemeEffectLayer themeId={event.themeId} overrideVisualStack={event.customThemeData?.visualStack} />
))}
```

### `src/components/ThemeEffectLayer.tsx` (current props):
```tsx
interface ThemeEffectLayerProps {
  themeId: string | null | undefined;
  overrideVisualStack?: import("@/lib/eventThemes").ThemeVisualStack;
  disableShader?: boolean;
  opacity?: number;  // Added but may not be working
}
```
Container renders as:
```tsx
<View style={[styles.container, opacity != null && { opacity }]} pointerEvents="none">
```

---

## Recommended Investigation Path

1. **First: Verify which branch renders.** Add a console.log before the ternary to check if `event.effectId` is truthy for teal/purple test events. If so, the fix needs to target `MotifOverlay`, not `ThemeEffectLayer`.

2. **If ThemeEffectLayer IS rendering:** Set `DEBUG_LAYERS.effect = false` and confirm sheets disappear on current code. If they do, the container opacity approach should work — debug why `opacity: 0.35` had no visible effect (check if the style is actually applied at runtime).

3. **If MotifOverlay IS rendering:** The sheet source is MotifOverlay, not ThemeEffectLayer. Apply the same opacity/disable approach to MotifOverlay instead.

4. **Nuclear option that is confirmed to work:** Set `DEBUG_LAYERS.effect = false` — this completely eliminates sheets. The gradient, video, and filter layers still render, providing atmospheric background. The trade-off is losing particles on the event detail page (they still render everywhere else in the app).

5. **Targeted particle config approach:** Instead of disabling the entire layer, reduce `blurSigma` and/or `particleCount` for `coastal_haze` and `arcade_sparkle` specifically. E.g., reducing coastal_haze blurSigma from 11 → 2 and arcade_sparkle particleCount from 28 → 12 would prevent the collective haze while keeping individual particles visible. This changes the effect globally though, not just on the event detail page.
