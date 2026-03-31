# Effect Layer Render-Path Audit

Generated: 2026-03-30

---

## SCREEN MAP — EVENT DETAIL

### Active renderer

Branch at `src/app/event/[id].tsx:2428`:
```tsx
{event.effectId ? (
  <MotifOverlay ... />     // only if user explicitly selected an effect in create/edit
) : (
  <ThemeEffectLayer ... />  // default for standard theme events
)}
```

- **Standard themes (chill_hang, game_night, birthday_bash, worship_night):** `event.effectId` is `null` → **ThemeEffectLayer**
- **Custom effect events:** `event.effectId` is truthy → **MotifOverlay**

### Layer hierarchy (top = rendered last = visually on top)

```
SafeAreaView (flex-1, backgroundColor: transparent, edges: [])
│
├─ [1] AnimatedGradientLayer     (absoluteFill, pointerEvents: none)
├─ [2] ThemeVideoLayer           (absolute t/l/r/b: 0, pointerEvents: none)
├─ [3] ThemeEffectLayer          (absoluteFillObject via styles.container)
│      └─ Canvas                 (absoluteFill) — Skia surface
│         ├─ ShaderBackgroundField  (Rect 0,0 → width,height)
│         └─ ParticleField          (Circle elements across full canvas)
├─ [4] ThemeFilterLayer          (absoluteFill — Skia Canvas)
│
├─ [5] KeyboardAwareScrollView   (flex-1, scrollable content)
│      ├─ Hero zone (InviteFlipCard)
│      ├─ 16px spacer
│      ├─ Host action card / primary action bar
│      ├─ About card
│      ├─ Who's coming
│      └─ Event settings accordion
│
├─ [6] StickyRsvpBar             (position: absolute, bottom: 0)
└─ [7] CalendarSyncModal, ShareSheet, etc.
```

### Parent bounds for effect layer

- **Parent:** SafeAreaView with `flex: 1`, `backgroundColor: transparent`, `edges: []`
- **No overflow: hidden** on SafeAreaView
- **No borderRadius** on SafeAreaView
- **absoluteFill** binds to SafeAreaView → **full screen**
- ThemeEffectLayer's Canvas is `StyleSheet.absoluteFill` inside a `StyleSheet.absoluteFillObject` container → **full screen**

### Culprit: WHY sheets appear

1. **ShaderBackgroundField** renders a full-screen `<Rect x={0} y={0} width={width} height={height}>` with SkSL shader. This creates a colored fill at screen edges.
2. **ParticleField** renders particles that wrap around screen edges (lines 1256-1273). Particles at edges with high blur (`coastal_haze: blurSigma 11`, effective visual diameter ~50px per particle) merge into a collective translucent sheet.
3. The Skia Canvas is a **Metal GPU surface** that renders independently of React Native's view compositing. **RN View `opacity` does not affect Skia Canvas output** — this is why `opacity={0.35}` on the container had zero effect. The View opacity applies to the native UIView layer, but Skia renders directly to its own texture.
4. `disableShader` removed the shader Rect but particles alone still form visible haze on teal (12 particles × blur 3, reduced from 11) and purple (14 particles × blur 1.8, reduced from 28).

### Refactor drift: NO

The event detail page has not been split/extracted. The layer stack is the same monolithic structure. No wrapper drift.

### Current state

Particle presets were tuned (coastal_haze: blur 11→3, count 18→12; arcade_sparkle: count 28→14, maxOpacity 0.30→0.20). Effect layer is rendering. Whether the tuning is sufficient to eliminate the sheet artifact has not been visually confirmed yet.

---

## SCREEN MAP — CREATE

### Active renderer

Branch at `src/app/create.tsx:531`:
```tsx
{selectedEffectId ? (
  <MotifOverlay ... />       // user selected a motif effect
) : hasTheme ? (
  <ThemeEffectLayer ... />   // theme selected, no explicit effect
) : null}                    // no theme, no effect → nothing
```

### Layer hierarchy

```
Animated.View (flex-1, previewBgStyle)
│
├─ [1] AnimatedGradientLayer     (absoluteFill, pointerEvents: none)
├─ [2] MotifOverlay/ThemeEffectLayer  (absoluteFill) ← EFFECT LAYER
│      ├─ Canvas                 (absoluteFill) — Skia surface, full screen
│      ├─ safeZoneTop            (absolute, top: 0, h: 80, rgba(0,0,0,0.25))
│      └─ safeZoneBottom         (absolute, bottom: 0, h: 80, rgba(0,0,0,0.25))
│
├─ [3] KeyboardAvoidingView > ScrollView  (form content)
│      ├─ CreatePreviewHero      (h: 220, borderRadius: 20, overflow: hidden)
│      └─ form fields...
│
├─ [4] CreateEditorHeader        (floating top chrome)
├─ [5] CreateBottomDock          (bottom editing dock)
├─ [6] EffectTray                (bottom sheet)
├─ [7] ThemeTray                 (bottom sheet)
└─ [8] SettingsSheet             (bottom sheet)
```

### Parent bounds for effect layer

- **Parent:** `Animated.View` with `flex: 1`
- **No overflow: hidden**
- **absoluteFill** binds to root Animated.View → **full screen**
- Both MotifOverlay and ThemeEffectLayer render their Skia Canvas to full viewport dimensions via `useWindowDimensions()`

### Culprit: WHY sheets appear on create

**Same root cause as event detail.** The Skia Canvas covers the entire screen. Blurry particles accumulate at top/bottom edges creating visible colored sheets. The effect layer sits BELOW the scroll content, header, dock, and sheets in z-order (sibling [2] vs siblings [3]-[8]), so it does NOT paint on top of sheets.

However, the **sheets are visible** in the exposed areas:
- **Top:** between the status bar and the start of the header chrome (semi-transparent blur header lets effect bleed through)
- **Bottom:** between the last form content and the bottom dock (gap area where the effect shows through)
- **Sides:** the effect is full-screen so any area where form cards don't cover will show the effect, including the visible margin areas around cards

### Key difference from event detail

- **Create page effect is intentionally full-page** — it's the live preview of what the event atmosphere will look like
- **MotifOverlay already has safeZoneTop/Bottom** (80px dark overlays at edges) to darken edges — this helps but may not fully hide the particle haze on saturated themes
- **ThemeEffectLayer does NOT have safe zones** — when a theme (not an explicit effect) is selected, the theme's particles render full-screen with no edge darkening

### Refactor drift: NO

Create page structure is unchanged. No components were split or extracted. The effect layer mounting point has been stable.

---

## SHARED ROOT CAUSES

### 1. Skia Canvas ignores RN View opacity
React Native's `opacity` style on a parent View does NOT affect `@shopify/react-native-skia` Canvas rendering. Skia renders to its own Metal/GL surface. Any opacity-based fix must be applied INSIDE Skia (via `<Group opacity={...}>` or shader uniforms), not on the RN View wrapper.

### 2. Full-screen Skia particles with high blur create edge haze
When many blurry particles exist near screen edges, their combined translucency creates a visible "sheet." This is a density × blur × opacity problem:
- `coastal_haze` (teal): 12 particles, blur 3 (reduced), size 12-16 → might still haze at edges
- `arcade_sparkle` (purple): 14 particles, blur 1.8, opacity 0.18-0.20 → moderate density
- `party_confetti` (birthday): 32 particles, blur 0.4 → sharp dots, no haze
- `candlelight` (worship): 10 particles, blur 8, but only 10 → sparse, no collective haze

### 3. No edge fade on ThemeEffectLayer's Skia Canvas
MotifOverlay has `safeZoneTop/Bottom` (80px rgba(0,0,0,0.25) overlays). ThemeEffectLayer has nothing — particles render edge-to-edge with no attenuation.

---

## DIFFERENCES BETWEEN SCREENS

| Aspect | Event Detail | Create |
|--------|-------------|--------|
| Intended effect scope | Full-page atmosphere | Full-page preview |
| Default renderer | ThemeEffectLayer | ThemeEffectLayer (theme) or MotifOverlay (effect) |
| Has safe zone overlays | NO | Only via MotifOverlay (not ThemeEffectLayer) |
| Scroll content covers body | YES — cards fill most of viewport | YES — form fills most of viewport |
| Exposed top area | Status bar + nav (transparent) | Status bar + header chrome (blur) |
| Exposed bottom area | Below last card, above sticky RSVP | Below form, above bottom dock |
| Sheets sit above effect | YES (StickyRsvpBar, modals) | YES (BottomDock, trays, sheets) |
| Effect paints on sheets | NO (z-order correct) | NO (z-order correct) |

**Both screens have the same structural issue:** the Skia Canvas renders full-screen with no edge attenuation on ThemeEffectLayer, and the particle config density/blur determines whether edges look like sheets.

---

## RECOMMENDED FIX PLAN

### Strategy: Skia-level edge fade inside the Canvas

Since RN View opacity doesn't affect Skia, and we can't use simple View clipping (the effect is intentionally full-page), the fix must happen INSIDE the Skia Canvas.

**Approach: Add a vertical alpha gradient mask inside the Canvas using Skia primitives.**

The previous attempt (Group layer + dstIn Rect with LinearGradient) failed, likely due to:
1. CSS color names `"transparent"` / `"black"` not recognized by Skia LinearGradient — need `["rgba(0,0,0,0)", "rgba(0,0,0,1)", "rgba(0,0,0,1)", "rgba(0,0,0,0)"]`
2. Possibly missing `SaveLayer` semantics

### Fix 1: ThemeEffectLayer — add Skia edge fade (PRIMARY FIX)

**File:** `src/components/ThemeEffectLayer.tsx`

Add a compositing mask INSIDE the Canvas that fades the top 12% and bottom 12% of the canvas to transparent. This prevents particle haze from being visible at screen edges on ALL themes, while keeping the middle 76% fully visible.

Implementation:
```tsx
// Inside Canvas, after ParticleField/ColorWashField, inside a Group with SaveLayer:
<Group layer={<Paint />}>
  {/* shader */}
  {/* particles */}
  {/* Edge fade mask */}
  <Rect x={0} y={0} width={width} height={height} blendMode="dstIn">
    <LinearGradient
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: height }}
      colors={["rgba(0,0,0,0)", "rgba(0,0,0,1)", "rgba(0,0,0,1)", "rgba(0,0,0,0)"]}
      positions={[0, 0.12, 0.88, 1]}
    />
  </Rect>
</Group>
```

Required Skia imports to add: `Paint`, `LinearGradient` (as `SkLinearGradient`).

**This fixes both event detail AND create pages** since both use ThemeEffectLayer.

### Fix 2: MotifOverlay — already has safeZones (VERIFY ONLY)

**File:** `src/components/create/MotifOverlay.tsx`

MotifOverlay already has 80px dark safe zones at top/bottom. If these are insufficient, apply the same Skia edge fade inside its Canvas. But verify first — the safeZones may already handle the sheet for MotifOverlay paths.

### Fix 3: Particle config tuning (ALREADY DONE, VERIFY)

**File:** `src/components/ThemeEffectLayer.tsx` (EFFECT_CONFIGS)

Already reduced:
- `coastal_haze`: blur 11→3, count 18→12, maxSize 22→16
- `arcade_sparkle`: count 28→14, maxOpacity 0.30→0.20

**Verify visually** whether these reductions + the Skia edge fade together eliminate the sheets.

### Fix 4: No changes needed for create page specifically

The create page's effect layer is already positioned correctly in z-order (behind all UI chrome). The sheet artifact is the same particle-edge-haze problem. Fix 1 (Skia edge fade in ThemeEffectLayer) will fix it for both screens.

---

### Exact files to change

| File | Change | Priority |
|------|--------|----------|
| `src/components/ThemeEffectLayer.tsx` | Add Skia LinearGradient + Paint imports, wrap Canvas content in Group layer with dstIn edge fade mask. Use `"rgba(0,0,0,0)"` not `"transparent"`. | P0 |
| `src/components/create/MotifOverlay.tsx` | Verify safeZones sufficient. If not, add same Skia edge fade. | P1 |
| `src/app/event/[id].tsx` | No changes needed (effect layer already restored) | — |
| `src/app/create.tsx` | No changes needed (effect layer already correct) | — |

---

## RISK / BLAST RADIUS

- **ThemeEffectLayer Skia edge fade:** Affects ALL screens using ThemeEffectLayer (event detail, create, theme-builder preview). LOW RISK — the fade only affects extreme edges, and all those screens want the same behavior.
- **Particle config changes:** Already applied globally. MEDIUM RISK — other screens (calendar cards, invite previews) may look slightly different. But these configs were previously untouched across the app so the change is consistent.
- **MotifOverlay safeZones:** Already exist, no change needed unless visually insufficient.

---

## OPTIONAL QUICK WIN

If the Skia `Group layer + dstIn` approach fails again (Skia API compatibility issue), the fallback quick win:

**Reduce particle spawn bounds** in the ParticleField's `seedParticles()` function. Instead of spawning across `y: 0 → height`, spawn across `y: height*0.1 → height*0.9`. Particles that wrap around would re-enter at the margin, not the edge. This keeps particles away from edges without any compositing tricks.

This is in `ThemeEffectLayer.tsx`, function `seedParticles()`. Change:
```tsx
y: Math.random() * height
```
to:
```tsx
y: height * 0.1 + Math.random() * height * 0.8
```

And adjust the wrap-around bounds in `ParticleField` from `height + radius*2` / `-radius*2` to `height * 0.9` / `height * 0.1`.

This is less elegant but guaranteed to work since it's pure JS math, not Skia compositing.
