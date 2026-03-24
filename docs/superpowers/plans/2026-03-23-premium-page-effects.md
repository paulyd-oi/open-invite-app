# Premium Page Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 17 new particle/visual effects to ThemeEffectLayer.tsx and wire them to existing + new event themes.

**Architecture:** Each effect is a config object in the `EFFECT_CONFIGS` dictionary inside ThemeEffectLayer.tsx. The existing Skia Canvas + Reanimated pipeline handles rendering — no engine changes needed for particle-based effects. One effect (disco_pulse) requires a new non-particle rendering mode. Several effects reuse rendering logic with different color palettes and tuning (easter_confetti reuses confetti_rain, patriot_stars reuses firework_burst). New themes get `EventThemeTokens` entries in eventThemes.ts. Theme → effect wiring is via the `effectPreset` field.

**Tech Stack:** @shopify/react-native-skia (Canvas, Circle, RRect, Group, BlurMask), react-native-reanimated (useFrameCallback, useSharedValue, useDerivedValue), existing ThemeEffectLayer particle pipeline.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/ThemeEffectLayer.tsx` | Modify | Add 17 new effect preset configs to `EFFECT_CONFIGS`. Add `RRect` Skia import for rectangle particles. Add `Rect` import for disco_pulse color wash. Add rotation support to particle seed + rendering for confetti/leaves/hearts/petals/caps. Add fade-only mode for glitter_shimmer and fireflies. Add color-wash overlay mode for disco_pulse. |
| `src/lib/eventThemes.ts` | Modify | Add 12 new premium themes (celebration, valentines, party_night, spring_bloom, romance_elegant, garden_party, spring_brunch, easter, graduation, bonfire_night, luau, fourth_of_july). Wire effectPreset on 5 existing themes (birthday_bash, fall_harvest, summer_splash, worship_night, game_day). Update `PREMIUM_THEME_IDS` array. |

---

## Architecture Notes

### Current particle system capabilities
- Particles: circles only, with vertical drift + horizontal sway + optional opacity pulse
- Config fields: particleCount, size range, opacity range, speed range, sway, direction, blur, colors, pulse
- Rendering: `SkiaParticle` component renders each particle via `Circle` + `BlurMask`

### New capabilities needed

1. **Rotation** (confetti, leaves, hearts, petals): Add `rotation` field to `ParticleSeed`. Wrap `Circle`/`RRect` in a Skia `Group` with rotation transform. Update `seedParticles` and frame callback to advance rotation per frame.

2. **Shape variety** (confetti rectangles, leaf/heart/petal shapes): Add a `shape` field to `EffectConfig`: `"circle" | "rect" | "mixed"`. For `"rect"`, render `RRect` instead of `Circle`. For shaped particles (leaves, hearts, petals), use small ellipses with rotation — the blur mask makes them look organic without needing actual path shapes.

3. **Fade-only mode** (glitter_shimmer): Particles don't move. Speed = 0, direction irrelevant. Rely entirely on pulse for fade in/out effect. Set `swayAmplitude: 0` and use randomized spawn across the full screen.

4. **Color wash overlay** (disco_pulse): Not a particle effect. Render a full-screen `Rect` with animated color cycling via `hue` rotation. Separate rendering branch in `ThemeEffectLayer` that checks for a `colorWash` config type.

5. **Firework-style rising sparks** (firework_burst): Uses the existing continuous particle system with upward direction, fast speed, and aggressive opacity pulsing to simulate burst trails. True staggered burst spawning (wave-based with lifespan) is deferred — the continuous approach is visually convincing and avoids engine complexity.

### Performance constraints
- All effects start with conservative particle counts (15-30)
- iPhone 12+ target = 60fps budget
- Skia Canvas is GPU-accelerated, so particle overhead is primarily JS frame callback
- `useReducedMotion()` → return null (all effects disabled)

---

### Task 1: Engine Extensions — Rotation + Shape Support

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx:50-73` (EffectConfig interface)
- Modify: `src/components/ThemeEffectLayer.tsx:166-215` (ParticleSeed + seedParticles)
- Modify: `src/components/ThemeEffectLayer.tsx:219-265` (SkiaParticle rendering)
- Modify: `src/components/ThemeEffectLayer.tsx:31-46` (Skia imports)

- [ ] **Step 1: Add RRect and Paint to Skia imports**

In the try/catch block at the top, add `RRect` to the destructured imports:

```typescript
let RRect: any = null;
// ... in the try block:
RRect = Skia.RRect;
// Update _skiaAvailable check: no change needed — RRect is optional, only Circle/Group/BlurMask are required
```

- [ ] **Step 2: Extend EffectConfig interface with rotation + shape fields**

Add to the `EffectConfig` interface:

```typescript
interface EffectConfig {
  // ... existing fields ...
  /** Particle shape: circle (default), rect, or mixed */
  shape?: "circle" | "rect" | "mixed";
  /** Rotation speed range in radians/sec (0 = no rotation) */
  minRotationSpeed?: number;
  maxRotationSpeed?: number;
  /** Aspect ratio for rect particles (width/height, default 1) */
  rectAspect?: number;
  /** If true, particles don't move vertically — static with fade only */
  staticPosition?: boolean;
}
```

- [ ] **Step 3: Extend ParticleSeed with rotation state**

Add to the `ParticleSeed` interface:

```typescript
interface ParticleSeed {
  // ... existing fields ...
  /** Current rotation angle in radians */
  rotation: number;
  /** Rotation speed in radians/sec */
  rotationSpeed: number;
  /** Particle shape */
  shape: "circle" | "rect";
  /** Width for rect particles */
  width: number;
  /** Height for rect particles */
  height: number;
}
```

- [ ] **Step 4: Update seedParticles to populate new fields**

In the `seedParticles` function, add shape and rotation seeding:

```typescript
// After existing field seeding, before particles.push:
const shapeType = config.shape === "mixed"
  ? (r() > 0.5 ? "circle" : "rect")
  : (config.shape ?? "circle");
const radius = config.minSize + r() * (config.maxSize - config.minSize);
const aspect = config.rectAspect ?? 1;
const rotSpeed = (config.minRotationSpeed ?? 0) + r() * ((config.maxRotationSpeed ?? 0) - (config.minRotationSpeed ?? 0));

particles.push({
  // ... existing fields ...
  rotation: r() * Math.PI * 2,
  rotationSpeed: (r() > 0.5 ? 1 : -1) * rotSpeed,
  shape: shapeType,
  width: shapeType === "rect" ? radius * 2 * aspect : radius * 2,
  height: shapeType === "rect" ? radius * 2 : radius * 2,
});
```

- [ ] **Step 5: Update frame callback to advance rotation**

In the `useFrameCallback` inside `ParticleField`, add rotation update:

```typescript
return {
  ...p,
  y: newY,
  rotation: p.rotation + p.rotationSpeed * dt,
};
```

- [ ] **Step 6: Update SkiaParticle to render shapes with rotation**

**CRITICAL:** Skia Group `transform` must receive a derived value (not `.value` dereferences in JSX) to animate on the UI thread. Wrap the full transform array in `useDerivedValue`.

Replace the `SkiaParticle` render body to handle both circle and rect:

```typescript
const rotation = useDerivedValue(() => {
  return particles.value[index]?.rotation ?? 0;
});

// IMPORTANT: Full transform must be a derived value for Skia to animate it.
// Dereferencing .value in JSX evaluates once at render, not per-frame.
const rectTransform = useDerivedValue(() => [
  { translateX: cx.value },
  { translateY: cy.value },
  { rotate: rotation.value },
  { translateX: -seed.width / 2 },
  { translateY: -seed.height / 2 },
]);

const circleTransform = useDerivedValue(() => [
  { translateX: cx.value },
  { translateY: cy.value },
  { rotate: rotation.value },
]);

// For circle particles — existing Circle render
// For rect particles — render RRect with rotation transform via Group
return seed.shape === "rect" && RRect ? (
  <Group transform={rectTransform} opacity={opacity}>
    <RRect
      x={0} y={0}
      width={seed.width} height={seed.height}
      r={seed.width * 0.15}
      color={seed.color}
    >
      <BlurMask blur={blurSigma} />
    </RRect>
  </Group>
) : (
  <Group transform={circleTransform} opacity={opacity}>
    <Circle cx={0} cy={0} r={seed.radius} color={seed.color}>
      <BlurMask blur={blurSigma} />
    </Circle>
  </Group>
);
```

Note: The existing Circle rendering without rotation still works because `rotation` defaults to 0. Backward compatible.

- [ ] **Step 7: Handle staticPosition in frame callback**

In the frame callback, skip vertical movement when `staticPosition` is true:

```typescript
const updated = particles.value.map((p) => {
  let newY = p.y;
  if (!config.staticPosition) {
    newY = p.y + p.speed * config.direction * dt;
    // Respawn logic...
  }
  return { ...p, y: newY, rotation: p.rotation + p.rotationSpeed * dt };
});
```

- [ ] **Step 8: Verify existing effects still render**

Open the app, navigate to an event with `worship_night` theme (ambient_dust), `winter_glow` (snowfall), `chill_hang` (coastal_haze), or `game_night` (arcade_sparkle). Confirm particles still render correctly — the engine changes are backward-compatible because new fields default to undefined/0.

- [ ] **Step 9: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx'
git commit -m "feat: extend particle engine with rotation, rect shapes, and static position support"
```

---

### Task 2: confetti_rain Effect

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset to EFFECT_CONFIGS)
- Modify: `src/lib/eventThemes.ts` (wire birthday_bash → confetti_rain)

- [ ] **Step 1: Add confetti_rain preset**

Add to `EFFECT_CONFIGS`:

```typescript
confetti_rain: {
  particleCount: 30,
  minSize: 3,
  maxSize: 7,
  minOpacity: 0.7,
  maxOpacity: 0.95,
  minSpeed: 50,
  maxSpeed: 90,
  swayAmplitude: 25,
  minSwayPeriod: 2,
  maxSwayPeriod: 4,
  direction: 1,
  blurSigma: 0.5,
  colors: [
    "rgba(239, 68, 68, 1)",   // red
    "rgba(59, 130, 246, 1)",  // blue
    "rgba(250, 204, 21, 1)",  // yellow
    "rgba(34, 197, 94, 1)",   // green
    "rgba(236, 72, 153, 1)",  // pink
    "rgba(249, 115, 22, 1)",  // orange
  ],
  shape: "mixed",
  minRotationSpeed: 1.5,
  maxRotationSpeed: 4.0,
  rectAspect: 0.5,
},
```

- [ ] **Step 2: Wire birthday_bash to confetti_rain**

In `eventThemes.ts`, add `effectPreset: "confetti_rain"` to the `birthday_bash` theme:

```typescript
birthday_bash: {
  // ... existing tokens ...
  effectPreset: "confetti_rain",
},
```

- [ ] **Step 3: Verify render**

Open an event with the `birthday_bash` theme. Confirm colorful confetti rectangles and circles tumble downward with rotation and slight horizontal drift.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add confetti_rain effect for birthday_bash theme"
```

---

### Task 3: falling_leaves Effect

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (wire fall_harvest → falling_leaves)

- [ ] **Step 1: Add falling_leaves preset**

```typescript
falling_leaves: {
  particleCount: 18,
  minSize: 5,
  maxSize: 12,
  minOpacity: 0.5,
  maxOpacity: 0.85,
  minSpeed: 20,
  maxSpeed: 40,
  swayAmplitude: 45,
  minSwayPeriod: 3,
  maxSwayPeriod: 7,
  direction: 1,
  blurSigma: 1.0,
  colors: [
    "rgba(217, 119, 6, 1)",   // amber
    "rgba(194, 65, 12, 1)",   // burnt orange
    "rgba(185, 28, 28, 1)",   // deep red
    "rgba(234, 179, 8, 1)",   // golden yellow
  ],
  shape: "circle",
  minRotationSpeed: 0.8,
  maxRotationSpeed: 2.5,
},
```

Uses circles with large blur for an organic leaf feel. Wide sway amplitude for flutter effect.

- [ ] **Step 2: Wire fall_harvest to falling_leaves**

```typescript
fall_harvest: {
  // ... existing tokens ...
  effectPreset: "falling_leaves",
},
```

- [ ] **Step 3: Verify render**

Open an event with `fall_harvest` theme. Confirm warm-colored particles drift down with gentle rotation and wide horizontal flutter.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add falling_leaves effect for fall_harvest theme"
```

---

### Task 4: firework_burst Effect + celebration Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add celebration theme with tokens, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add firework_burst preset**

This uses the existing particle system with upward direction and fast speed to simulate burst trails. Particles rise quickly and fade via pulse.

```typescript
firework_burst: {
  particleCount: 25,
  minSize: 2,
  maxSize: 5,
  minOpacity: 0.4,
  maxOpacity: 0.9,
  minSpeed: 60,
  maxSpeed: 120,
  swayAmplitude: 40,
  minSwayPeriod: 1.5,
  maxSwayPeriod: 3,
  direction: -1,
  blurSigma: 1.2,
  colors: [
    "rgba(255, 215, 0, 1)",   // gold
    "rgba(239, 68, 68, 1)",   // red
    "rgba(59, 130, 246, 1)",  // blue
    "rgba(255, 255, 255, 1)", // white
  ],
  shape: "circle",
  minRotationSpeed: 0,
  maxRotationSpeed: 0,
  pulseRange: [0.3, 1.0],
  pulsePeriodRange: [1.5, 3.0],
},
```

- [ ] **Step 2: Add celebration theme to eventThemes.ts**

Add `"celebration"` to `PREMIUM_THEME_IDS`:

```typescript
export const PREMIUM_THEME_IDS = [
  "summer_splash",
  "fall_harvest",
  "winter_glow",
  "game_day",
  "birthday_bash",
  "celebration",
] as const;
```

Add `celebration` to `EVENT_THEMES`:

```typescript
celebration: {
  label: "Celebration",
  swatch: "🎆",
  gradientTint: "rgba(255, 215, 0, 0.25)",
  vibeLabel: "Let's Celebrate",
  backAccent: "#FFD700",
  backBgDark: "#0A0E2A",
  backBgLight: "#FFF8E1",
  pageTintDark: "rgba(255, 215, 0, 0.20)",
  pageTintLight: "rgba(255, 215, 0, 0.10)",
  chipAccent: "#FFD700",
  effectPreset: "firework_burst",
},
```

- [ ] **Step 3: Verify render**

Create or view an event with `celebration` theme. Confirm gold/red/blue/white particles rise upward with pulsing opacity.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add firework_burst effect and celebration theme"
```

---

### Task 5: floating_hearts Effect + valentines Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add valentines theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add floating_hearts preset**

```typescript
floating_hearts: {
  particleCount: 16,
  minSize: 4,
  maxSize: 10,
  minOpacity: 0.35,
  maxOpacity: 0.7,
  minSpeed: 15,
  maxSpeed: 30,
  swayAmplitude: 20,
  minSwayPeriod: 3,
  maxSwayPeriod: 6,
  direction: -1,
  blurSigma: 1.5,
  colors: [
    "rgba(236, 72, 153, 1)",  // pink
    "rgba(239, 68, 68, 1)",   // red
    "rgba(251, 207, 232, 1)", // soft rose
  ],
  shape: "circle",
  minRotationSpeed: 0.3,
  maxRotationSpeed: 1.0,
  pulseRange: [0.8, 1.1],
  pulsePeriodRange: [2.5, 4.5],
},
```

- [ ] **Step 2: Add valentines theme**

Add `"valentines"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
valentines: {
  label: "Valentine's",
  swatch: "💕",
  gradientTint: "rgba(236, 72, 153, 0.25)",
  vibeLabel: "You're Invited",
  backAccent: "#EC4899",
  backBgDark: "#2A0A1E",
  backBgLight: "#FFF0F5",
  pageTintDark: "rgba(236, 72, 153, 0.22)",
  pageTintLight: "rgba(236, 72, 153, 0.12)",
  chipAccent: "#EC4899",
  effectPreset: "floating_hearts",
},
```

- [ ] **Step 3: Verify render**

View event with `valentines` theme. Confirm pink/red circles gently rise upward with subtle sway and pulse.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add floating_hearts effect and valentines theme"
```

---

### Task 6: rising_bubbles Effect

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (wire summer_splash → rising_bubbles)

- [ ] **Step 1: Add rising_bubbles preset**

```typescript
rising_bubbles: {
  particleCount: 20,
  minSize: 4,
  maxSize: 14,
  minOpacity: 0.12,
  maxOpacity: 0.30,
  minSpeed: 10,
  maxSpeed: 25,
  swayAmplitude: 18,
  minSwayPeriod: 3,
  maxSwayPeriod: 7,
  direction: -1,
  blurSigma: 2.5,
  colors: [
    "rgba(255, 255, 255, 1)", // white
    "rgba(186, 230, 253, 1)", // light blue
    "rgba(147, 197, 253, 1)", // blue tint
  ],
  shape: "circle",
  minRotationSpeed: 0,
  maxRotationSpeed: 0,
},
```

- [ ] **Step 2: Wire summer_splash to rising_bubbles**

```typescript
summer_splash: {
  // ... existing tokens ...
  effectPreset: "rising_bubbles",
},
```

- [ ] **Step 3: Verify render**

View event with `summer_splash` theme. Confirm translucent white/blue circles float upward with subtle wobble.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add rising_bubbles effect for summer_splash theme"
```

---

### Task 7: light_rays Effect

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (wire worship_night → light_rays)

- [ ] **Step 1: Add light_rays preset**

Uses very large, very blurry, very low-opacity circles drifting slowly to create a warm glow beam effect:

```typescript
light_rays: {
  particleCount: 8,
  minSize: 30,
  maxSize: 60,
  minOpacity: 0.06,
  maxOpacity: 0.15,
  minSpeed: 2,
  maxSpeed: 5,
  swayAmplitude: 40,
  minSwayPeriod: 8,
  maxSwayPeriod: 16,
  direction: -1,
  blurSigma: 25,
  colors: [
    "rgba(255, 215, 0, 1)",   // warm gold
    "rgba(255, 191, 0, 1)",   // amber
    "rgba(255, 235, 180, 1)", // soft warm white
  ],
  shape: "circle",
  minRotationSpeed: 0,
  maxRotationSpeed: 0,
  pulseRange: [0.7, 1.2],
  pulsePeriodRange: [4, 8],
},
```

- [ ] **Step 2: Wire worship_night to light_rays (replacing ambient_dust)**

```typescript
worship_night: {
  // ... existing tokens ...
  effectPreset: "light_rays",
},
```

- [ ] **Step 3: Verify render**

View event with `worship_night` theme. Confirm warm golden glow orbs drift slowly with subtle pulsing — softer and more atmospheric than the previous ambient_dust.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add light_rays effect for worship_night theme"
```

---

### Task 8: glitter_shimmer Effect

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (wire game_day → glitter_shimmer)

- [ ] **Step 1: Add glitter_shimmer preset**

Static particles with fast pulse — sparkle flash at random positions:

```typescript
glitter_shimmer: {
  particleCount: 25,
  minSize: 1.5,
  maxSize: 3.5,
  minOpacity: 0.0,
  maxOpacity: 0.8,
  minSpeed: 0,
  maxSpeed: 0,
  swayAmplitude: 0,
  minSwayPeriod: 1,
  maxSwayPeriod: 2,
  direction: 1,
  blurSigma: 0.8,
  colors: [
    "rgba(255, 215, 0, 1)",   // gold
    "rgba(192, 192, 192, 1)", // silver
    "rgba(255, 255, 255, 1)", // white
  ],
  shape: "circle",
  minRotationSpeed: 0,
  maxRotationSpeed: 0,
  staticPosition: true,
  pulseRange: [0.0, 1.0],
  pulsePeriodRange: [0.8, 2.0],
},
```

- [ ] **Step 2: Wire game_day to glitter_shimmer**

```typescript
game_day: {
  // ... existing tokens ...
  effectPreset: "glitter_shimmer",
},
```

- [ ] **Step 3: Verify render**

View event with `game_day` theme. Confirm tiny gold/silver/white sparkles flash in/out at random positions across the page, no movement.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add glitter_shimmer effect for game_day theme"
```

---

### Task 9: disco_pulse Effect + party_night Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add color wash rendering branch + preset)
- Modify: `src/lib/eventThemes.ts` (add party_night theme, add to PREMIUM_THEME_IDS)

This is the one effect that is NOT particle-based. It's an animated color wash overlay.

- [ ] **Step 1: Add Rect to Skia imports**

In the try/catch Skia import block:

```typescript
let Rect: any = null;
// In try block:
Rect = Skia.Rect;
```

- [ ] **Step 2: Add disco_pulse config with a colorWash flag**

Extend `EffectConfig` interface with an optional `colorWash` field:

```typescript
interface EffectConfig {
  // ... existing fields ...
  /** If true, render as full-screen color wash instead of particles */
  colorWash?: boolean;
  /** Color wash: hue cycle speed in degrees/sec */
  hueCycleSpeed?: number;
  /** Color wash: base opacity */
  washOpacity?: number;
}
```

Add preset:

```typescript
disco_pulse: {
  particleCount: 0,
  minSize: 0,
  maxSize: 0,
  minOpacity: 0.10,
  maxOpacity: 0.15,
  minSpeed: 0,
  maxSpeed: 0,
  swayAmplitude: 0,
  minSwayPeriod: 1,
  maxSwayPeriod: 1,
  direction: 1,
  blurSigma: 0,
  colors: [
    "rgba(139, 92, 246, 1)",  // purple
    "rgba(236, 72, 153, 1)",  // pink
    "rgba(59, 130, 246, 1)",  // blue
    "rgba(16, 185, 129, 1)",  // teal
  ],
  colorWash: true,
  hueCycleSpeed: 20,
  washOpacity: 0.12,
},
```

- [ ] **Step 3: Add ColorWashField component**

New component inside ThemeEffectLayer.tsx, rendered instead of ParticleField when `config.colorWash` is true. Uses two overlapping Rects with crossfading opacity to smoothly transition between colors (avoids jarring discrete color steps):

```typescript
// Helper: parse "rgba(r,g,b,a)" to [r,g,b] — called once at mount, not in worklet
function parseRgba(rgba: string): [number, number, number] {
  const m = rgba.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
}

const ColorWashField = memo(function ColorWashField({
  config,
  width,
  height,
}: {
  config: EffectConfig;
  width: number;
  height: number;
}) {
  const elapsed = useSharedValue(0);
  // Pre-parse colors to RGB arrays for worklet interpolation
  const parsedColors = useMemo(
    () => config.colors.map(parseRgba),
    [config.colors]
  );
  const cycleDuration = 360 / (config.hueCycleSpeed ?? 20); // seconds per full cycle

  useFrameCallback((frameInfo) => {
    "worklet";
    const dt = (frameInfo.timeSincePreviousFrame ?? 16) / 1000;
    elapsed.value += dt;
  });

  // Smoothly interpolate between adjacent colors
  const currentColor = useDerivedValue(() => {
    const n = parsedColors.length;
    if (n === 0) return "rgba(128,128,128,1)";
    const pos = ((elapsed.value % cycleDuration) / cycleDuration) * n;
    const idx = Math.floor(pos) % n;
    const nextIdx = (idx + 1) % n;
    const t = pos - Math.floor(pos); // 0..1 blend factor
    const [r1, g1, b1] = parsedColors[idx];
    const [r2, g2, b2] = parsedColors[nextIdx];
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgba(${r},${g},${b},1)`;
  });

  const washOpacity = config.washOpacity ?? 0.12;

  if (!Rect) return null;

  return (
    <Group opacity={washOpacity}>
      <Rect x={0} y={0} width={width} height={height} color={currentColor}>
        <BlurMask blur={40} />
      </Rect>
    </Group>
  );
});
```

- [ ] **Step 4: Branch rendering in ThemeEffectLayer**

In the main `ThemeEffectLayer` component, before the return, check for `colorWash`:

```typescript
if (!_skiaAvailable || !config || reducedMotion) return null;

const isColorWash = (config as any).colorWash === true;

return (
  <SkiaErrorBoundary>
    <Canvas style={styles.container} pointerEvents="none">
      {isColorWash ? (
        <ColorWashField config={config} width={width} height={height} />
      ) : (
        <ParticleField config={config} width={width} height={height} />
      )}
    </Canvas>
  </SkiaErrorBoundary>
);
```

- [ ] **Step 5: Add party_night theme**

Add `"party_night"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
party_night: {
  label: "Party Night",
  swatch: "🪩",
  gradientTint: "rgba(139, 92, 246, 0.30)",
  vibeLabel: "Let's Party",
  backAccent: "#A855F7",
  backBgDark: "#0F0520",
  backBgLight: "#F3E8FF",
  pageTintDark: "rgba(139, 92, 246, 0.25)",
  pageTintLight: "rgba(139, 92, 246, 0.12)",
  chipAccent: "#A855F7",
  effectPreset: "disco_pulse",
},
```

- [ ] **Step 6: Verify render**

View event with `party_night` theme. Confirm a subtle color wash overlay slowly shifts between purple/pink/blue/teal across the background at very low opacity.

- [ ] **Step 7: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add disco_pulse color wash effect and party_night theme"
```

---

### Task 10: cherry_blossom Effect + spring_bloom Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add spring_bloom theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add cherry_blossom preset**

```typescript
cherry_blossom: {
  particleCount: 16,
  minSize: 4,
  maxSize: 9,
  minOpacity: 0.35,
  maxOpacity: 0.65,
  minSpeed: 12,
  maxSpeed: 25,
  swayAmplitude: 35,
  minSwayPeriod: 4,
  maxSwayPeriod: 8,
  direction: 1,
  blurSigma: 1.8,
  colors: [
    "rgba(244, 163, 188, 1)", // light pink
    "rgba(251, 207, 232, 1)", // soft white-pink
    "rgba(236, 72, 153, 0.6)", // translucent pink
  ],
  shape: "circle",
  minRotationSpeed: 0.5,
  maxRotationSpeed: 1.5,
},
```

Slower and more delicate than falling_leaves — lower speed, gentler rotation.

- [ ] **Step 2: Add spring_bloom theme**

Add `"spring_bloom"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
spring_bloom: {
  label: "Spring Bloom",
  swatch: "🌸",
  gradientTint: "rgba(34, 197, 94, 0.20)",
  vibeLabel: "You're Invited",
  backAccent: "#22C55E",
  backBgDark: "#0A1F10",
  backBgLight: "#F0FFF4",
  pageTintDark: "rgba(34, 197, 94, 0.18)",
  pageTintLight: "rgba(34, 197, 94, 0.10)",
  chipAccent: "#22C55E",
  effectPreset: "cherry_blossom",
},
```

- [ ] **Step 3: Verify render**

View event with `spring_bloom` theme. Confirm delicate pink petals drift down slowly with gentle rotation and wide horizontal float.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add cherry_blossom effect and spring_bloom theme"
```

---

### Task 11: rose_petals Effect + romance_elegant Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add romance_elegant theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add rose_petals preset**

```typescript
rose_petals: {
  particleCount: 14,
  minSize: 6,
  maxSize: 13,
  minOpacity: 0.4,
  maxOpacity: 0.75,
  minSpeed: 10,
  maxSpeed: 20,
  swayAmplitude: 25,
  minSwayPeriod: 4,
  maxSwayPeriod: 9,
  direction: 1,
  blurSigma: 2.0,
  colors: [
    "rgba(190, 18, 60, 1)",   // deep rose
    "rgba(220, 38, 38, 1)",   // crimson
    "rgba(136, 19, 55, 1)",   // burgundy
  ],
  shape: "circle",
  minRotationSpeed: 0.3,
  maxRotationSpeed: 1.0,
},
```

Larger and more elegant than cherry blossoms — deeper colors, slightly larger particles, slower rotation.

- [ ] **Step 2: Add romance_elegant theme**

Add `"romance_elegant"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
romance_elegant: {
  label: "Romance",
  swatch: "🌹",
  gradientTint: "rgba(190, 18, 60, 0.22)",
  vibeLabel: "You're Invited",
  backAccent: "#BE123C",
  backBgDark: "#1A0A10",
  backBgLight: "#FFF1F2",
  pageTintDark: "rgba(190, 18, 60, 0.20)",
  pageTintLight: "rgba(190, 18, 60, 0.10)",
  chipAccent: "#BE123C",
  effectPreset: "rose_petals",
},
```

- [ ] **Step 3: Verify render**

View event with `romance_elegant` theme. Confirm deep rose/crimson/burgundy particles fall with slow, elegant rotation.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add rose_petals effect and romance_elegant theme"
```

---

### Task 12: dandelion_seeds Effect + garden_party Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add garden_party theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add dandelion_seeds preset**

Tiny white wisps floating upward with gentle drift and optional slow spin:

```typescript
dandelion_seeds: {
  particleCount: 14,
  minSize: 2,
  maxSize: 5,
  minOpacity: 0.25,
  maxOpacity: 0.45,
  minSpeed: 6,
  maxSpeed: 14,
  swayAmplitude: 30,
  minSwayPeriod: 4,
  maxSwayPeriod: 9,
  direction: -1,
  blurSigma: 1.5,
  colors: [
    "rgba(255, 255, 255, 1)",   // white
    "rgba(255, 253, 240, 1)",   // soft cream
    "rgba(245, 245, 230, 1)",   // pale cream
  ],
  shape: "circle",
  minRotationSpeed: 0.2,
  maxRotationSpeed: 0.8,
},
```

- [ ] **Step 2: Add garden_party theme**

Add `"garden_party"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
garden_party: {
  label: "Garden Party",
  swatch: "🌼",
  gradientTint: "rgba(132, 204, 22, 0.20)",
  vibeLabel: "You're Invited",
  backAccent: "#84CC16",
  backBgDark: "#0F1F0A",
  backBgLight: "#F7FEE7",
  pageTintDark: "rgba(132, 204, 22, 0.18)",
  pageTintLight: "rgba(132, 204, 22, 0.10)",
  chipAccent: "#84CC16",
  effectPreset: "dandelion_seeds",
},
```

- [ ] **Step 3: Verify render**

View event with `garden_party` theme. Confirm tiny white wisps float gently upward with subtle drift and slow spin on a sage green background.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add dandelion_seeds effect and garden_party theme"
```

---

### Task 13: butterfly_flutter Effect + spring_brunch Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add spring_brunch theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add butterfly_flutter preset**

Small colored silhouettes with erratic gentle flight — wide sway, varied speed, appearing at edges and drifting across. Uses mixed shapes for wing-like variety:

```typescript
butterfly_flutter: {
  particleCount: 12,
  minSize: 4,
  maxSize: 8,
  minOpacity: 0.4,
  maxOpacity: 0.7,
  minSpeed: 8,
  maxSpeed: 18,
  swayAmplitude: 50,
  minSwayPeriod: 2,
  maxSwayPeriod: 5,
  direction: -1,
  blurSigma: 1.2,
  colors: [
    "rgba(192, 132, 252, 1)",  // pastel purple
    "rgba(251, 146, 60, 1)",   // soft orange
    "rgba(147, 197, 253, 1)",  // light blue
  ],
  shape: "mixed",
  minRotationSpeed: 0.5,
  maxRotationSpeed: 2.0,
  rectAspect: 0.6,
  pulseRange: [0.7, 1.1],
  pulsePeriodRange: [1.5, 3.0],
},
```

Wide sway + pulse creates the illusion of erratic flutter paths.

- [ ] **Step 2: Add spring_brunch theme**

Add `"spring_brunch"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
spring_brunch: {
  label: "Spring Brunch",
  swatch: "🦋",
  gradientTint: "rgba(250, 204, 21, 0.18)",
  vibeLabel: "You're Invited",
  backAccent: "#A78BFA",
  backBgDark: "#1A1530",
  backBgLight: "#FEFCE8",
  pageTintDark: "rgba(167, 139, 250, 0.20)",
  pageTintLight: "rgba(250, 204, 21, 0.10)",
  chipAccent: "#A78BFA",
  effectPreset: "butterfly_flutter",
},
```

- [ ] **Step 3: Verify render**

View event with `spring_brunch` theme. Confirm pastel purple/orange/blue shapes flutter upward with erratic sway and rotation on a light yellow/lavender background.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add butterfly_flutter effect and spring_brunch theme"
```

---

### Task 14: easter_confetti Effect + easter Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add easter theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add easter_confetti preset**

Reuses confetti_rain rendering (mixed shapes, rotation) but with pastel colors, reduced speed, and lower density:

```typescript
easter_confetti: {
  particleCount: 20,
  minSize: 3,
  maxSize: 6,
  minOpacity: 0.5,
  maxOpacity: 0.8,
  minSpeed: 25,
  maxSpeed: 50,
  swayAmplitude: 20,
  minSwayPeriod: 3,
  maxSwayPeriod: 5,
  direction: 1,
  blurSigma: 0.5,
  colors: [
    "rgba(244, 163, 188, 1)",  // pastel pink
    "rgba(196, 181, 253, 1)",  // pastel lavender
    "rgba(167, 243, 208, 1)",  // pastel mint
    "rgba(253, 230, 138, 1)",  // pastel yellow
  ],
  shape: "mixed",
  minRotationSpeed: 1.0,
  maxRotationSpeed: 3.0,
  rectAspect: 0.5,
},
```

- [ ] **Step 2: Add easter theme**

Add `"easter"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
easter: {
  label: "Easter",
  swatch: "🐣",
  gradientTint: "rgba(196, 181, 253, 0.22)",
  vibeLabel: "You're Invited",
  backAccent: "#A78BFA",
  backBgDark: "#1A1530",
  backBgLight: "#F5F3FF",
  pageTintDark: "rgba(196, 181, 253, 0.20)",
  pageTintLight: "rgba(196, 181, 253, 0.10)",
  chipAccent: "#A78BFA",
  effectPreset: "easter_confetti",
},
```

- [ ] **Step 3: Verify render**

View event with `easter` theme. Confirm soft pastel confetti (pink, lavender, mint, yellow) falls gently — slower and softer than birthday_bash confetti_rain.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add easter_confetti effect and easter theme"
```

---

### Task 15: graduation_toss Effect + graduation Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add graduation theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add graduation_toss preset**

Gold confetti + mortarboard cap silhouettes (small squares with tassel-like aspect) falling with tumble rotation. Uses mixed shapes — circles for confetti, rects for cap silhouettes:

```typescript
graduation_toss: {
  particleCount: 24,
  minSize: 3,
  maxSize: 7,
  minOpacity: 0.6,
  maxOpacity: 0.9,
  minSpeed: 35,
  maxSpeed: 70,
  swayAmplitude: 30,
  minSwayPeriod: 2,
  maxSwayPeriod: 4,
  direction: 1,
  blurSigma: 0.5,
  colors: [
    "rgba(255, 215, 0, 1)",   // gold
    "rgba(255, 215, 0, 1)",   // gold (weighted)
    "rgba(30, 58, 138, 1)",   // navy
    "rgba(255, 255, 255, 1)", // white
  ],
  shape: "mixed",
  minRotationSpeed: 1.5,
  maxRotationSpeed: 4.0,
  rectAspect: 0.8,
},
```

- [ ] **Step 2: Add graduation theme**

Add `"graduation"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
graduation: {
  label: "Graduation",
  swatch: "🎓",
  gradientTint: "rgba(30, 58, 138, 0.25)",
  vibeLabel: "Congratulations",
  backAccent: "#FFD700",
  backBgDark: "#0A0E2A",
  backBgLight: "#EEF2FF",
  pageTintDark: "rgba(30, 58, 138, 0.22)",
  pageTintLight: "rgba(30, 58, 138, 0.12)",
  chipAccent: "#FFD700",
  effectPreset: "graduation_toss",
},
```

- [ ] **Step 3: Verify render**

View event with `graduation` theme. Confirm gold/navy/white confetti pieces and square shapes tumble downward with rotation on a navy/gold themed page.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add graduation_toss effect and graduation theme"
```

---

### Task 16: fireflies Effect + bonfire_night Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add bonfire_night theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add fireflies preset**

Warm golden dots fading in/out at random positions with very slow drift. Similar to glitter_shimmer but with slow movement and warmer, larger particles:

```typescript
fireflies: {
  particleCount: 15,
  minSize: 2,
  maxSize: 5,
  minOpacity: 0.0,
  maxOpacity: 0.55,
  minSpeed: 2,
  maxSpeed: 6,
  swayAmplitude: 20,
  minSwayPeriod: 4,
  maxSwayPeriod: 10,
  direction: -1,
  blurSigma: 2.5,
  colors: [
    "rgba(251, 191, 36, 1)",   // warm amber
    "rgba(255, 215, 0, 1)",    // gold
    "rgba(253, 224, 71, 1)",   // light gold
  ],
  shape: "circle",
  minRotationSpeed: 0,
  maxRotationSpeed: 0,
  pulseRange: [0.0, 1.0],
  pulsePeriodRange: [2.0, 5.0],
},
```

Slow drift + large pulse range creates the appear/glow/fade firefly rhythm.

- [ ] **Step 2: Add bonfire_night theme**

Add `"bonfire_night"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
bonfire_night: {
  label: "Bonfire Night",
  swatch: "🔥",
  gradientTint: "rgba(217, 119, 6, 0.25)",
  vibeLabel: "You're Invited",
  backAccent: "#D97706",
  backBgDark: "#1A120A",
  backBgLight: "#FEF3C7",
  pageTintDark: "rgba(217, 119, 6, 0.22)",
  pageTintLight: "rgba(217, 119, 6, 0.12)",
  chipAccent: "#D97706",
  effectPreset: "fireflies",
},
```

- [ ] **Step 3: Verify render**

View event with `bonfire_night` theme. Confirm warm golden dots gently appear, glow, and fade across the page with very slow drift on a dark forest green/amber background.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add fireflies effect and bonfire_night theme"
```

---

### Task 17: tropical_drift Effect + luau Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add luau theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add tropical_drift preset**

Plumeria-like flower shapes (blurred circles) drifting down slowly with warm bokeh. Mix of sizes — some larger (bokeh) and some smaller (petals):

```typescript
tropical_drift: {
  particleCount: 18,
  minSize: 4,
  maxSize: 16,
  minOpacity: 0.15,
  maxOpacity: 0.5,
  minSpeed: 8,
  maxSpeed: 18,
  swayAmplitude: 25,
  minSwayPeriod: 4,
  maxSwayPeriod: 8,
  direction: 1,
  blurSigma: 3.0,
  colors: [
    "rgba(251, 113, 133, 1)",  // coral
    "rgba(20, 184, 166, 1)",   // teal
    "rgba(250, 204, 21, 1)",   // golden yellow
    "rgba(255, 255, 255, 1)",  // white
  ],
  shape: "circle",
  minRotationSpeed: 0.2,
  maxRotationSpeed: 0.8,
},
```

- [ ] **Step 2: Add luau theme**

Add `"luau"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
luau: {
  label: "Luau",
  swatch: "🌺",
  gradientTint: "rgba(251, 113, 133, 0.22)",
  vibeLabel: "Aloha!",
  backAccent: "#FB7185",
  backBgDark: "#1A1015",
  backBgLight: "#FFF1F2",
  pageTintDark: "rgba(251, 113, 133, 0.20)",
  pageTintLight: "rgba(251, 113, 133, 0.10)",
  chipAccent: "#FB7185",
  effectPreset: "tropical_drift",
},
```

- [ ] **Step 3: Verify render**

View event with `luau` theme. Confirm coral/teal/golden/white blurred circles drift down slowly — mix of small petals and larger bokeh orbs.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add tropical_drift effect and luau theme"
```

---

### Task 18: patriot_stars Effect + fourth_of_july Theme

**Files:**
- Modify: `src/components/ThemeEffectLayer.tsx` (add preset)
- Modify: `src/lib/eventThemes.ts` (add fourth_of_july theme, add to PREMIUM_THEME_IDS)

- [ ] **Step 1: Add patriot_stars preset**

Shares firework_burst rendering logic (upward direction, fast speed, aggressive pulse) but with patriotic color palette:

```typescript
patriot_stars: {
  particleCount: 22,
  minSize: 2,
  maxSize: 5,
  minOpacity: 0.4,
  maxOpacity: 0.9,
  minSpeed: 55,
  maxSpeed: 110,
  swayAmplitude: 35,
  minSwayPeriod: 1.5,
  maxSwayPeriod: 3,
  direction: -1,
  blurSigma: 1.0,
  colors: [
    "rgba(178, 34, 52, 1)",    // #B22234 red
    "rgba(255, 255, 255, 1)",  // white
    "rgba(60, 59, 110, 1)",    // #3C3B6E blue
  ],
  shape: "circle",
  minRotationSpeed: 0,
  maxRotationSpeed: 0,
  pulseRange: [0.3, 1.0],
  pulsePeriodRange: [1.5, 3.0],
},
```

- [ ] **Step 2: Add fourth_of_july theme**

Add `"fourth_of_july"` to `PREMIUM_THEME_IDS`. Add theme tokens:

```typescript
fourth_of_july: {
  label: "4th of July",
  swatch: "🇺🇸",
  gradientTint: "rgba(60, 59, 110, 0.28)",
  vibeLabel: "Happy 4th!",
  backAccent: "#B22234",
  backBgDark: "#0A0A1E",
  backBgLight: "#EEF0FF",
  pageTintDark: "rgba(60, 59, 110, 0.24)",
  pageTintLight: "rgba(60, 59, 110, 0.12)",
  chipAccent: "#B22234",
  effectPreset: "patriot_stars",
},
```

- [ ] **Step 3: Verify render**

View event with `fourth_of_july` theme. Confirm red/white/blue sparks rise upward with pulsing opacity — similar energy to firework_burst but with patriotic palette.

- [ ] **Step 4: Commit**

```bash
git add 'src/components/ThemeEffectLayer.tsx' 'src/lib/eventThemes.ts'
git commit -m "feat: add patriot_stars effect and fourth_of_july theme"
```

---

### Task 19: Premium Gate + Final Wiring

**Files:**
- Modify: `src/lib/eventThemes.ts` (verify PREMIUM_THEME_IDS is complete)

- [ ] **Step 1: Verify PREMIUM_THEME_IDS includes all 17 premium themes**

The final `PREMIUM_THEME_IDS` array should be:

```typescript
export const PREMIUM_THEME_IDS = [
  "summer_splash",
  "fall_harvest",
  "winter_glow",
  "game_day",
  "birthday_bash",
  "celebration",
  "valentines",
  "party_night",
  "spring_bloom",
  "romance_elegant",
  "garden_party",
  "spring_brunch",
  "easter",
  "graduation",
  "bonfire_night",
  "luau",
  "fourth_of_july",
] as const;
```

- [ ] **Step 2: Verify ALL_THEME_IDS and ThemeId type auto-update**

Since `ALL_THEME_IDS = [...BASIC_THEME_IDS, ...PREMIUM_THEME_IDS]` and `ThemeId` is derived from it, no manual changes needed. Verify with TypeScript check.

- [ ] **Step 3: Verify backend ALLOWED_THEME_IDS compatibility**

Search for `ALLOWED_THEME_IDS` in backend code. The new theme IDs need to be added there too. If found, add the 12 new IDs. If not found (backend accepts any string), no change needed.

**Known external dependency:** If the backend validates theme IDs server-side, events created with the 12 new theme IDs (celebration, valentines, party_night, spring_bloom, romance_elegant, garden_party, spring_brunch, easter, graduation, bonfire_night, luau, fourth_of_july) will be rejected until the backend allowlist is updated. The frontend changes are safe regardless — `resolveEventTheme()` falls back to neutral for unknown IDs.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 5: Final commit**

```bash
git add 'src/lib/eventThemes.ts'
git commit -m "feat: finalize premium theme IDs and verify type safety"
```

---

## Effect → Theme Mapping Summary

| Effect | Theme | Type | Season |
|--------|-------|------|--------|
| confetti_rain | birthday_bash | rewire existing | — |
| falling_leaves | fall_harvest | rewire existing | Fall |
| firework_burst | celebration | **new theme** | — |
| floating_hearts | valentines | **new theme** | — |
| rising_bubbles | summer_splash | rewire existing | Summer |
| light_rays | worship_night | rewire existing (replaces ambient_dust) | — |
| glitter_shimmer | game_day | rewire existing | — |
| disco_pulse | party_night | **new theme** | — |
| cherry_blossom | spring_bloom | **new theme** | Spring |
| rose_petals | romance_elegant | **new theme** | — |
| dandelion_seeds | garden_party | **new theme** | Spring |
| butterfly_flutter | spring_brunch | **new theme** | Spring |
| easter_confetti | easter | **new theme** | Spring |
| graduation_toss | graduation | **new theme** | Spring |
| fireflies | bonfire_night | **new theme** | Summer |
| tropical_drift | luau | **new theme** | Summer |
| patriot_stars | fourth_of_july | **new theme** | Summer |

## Preserved Effects (no changes)

| Effect | Theme | Status |
|--------|-------|--------|
| ambient_dust | *(no longer mapped — was worship_night)* | Config kept, no theme uses it |
| snowfall | winter_glow | Unchanged |
| coastal_haze | chill_hang | Unchanged |
| arcade_sparkle | game_night | Unchanged |

## Effect Reuse Patterns

| New Effect | Shares Logic With | Difference |
|------------|-------------------|------------|
| easter_confetti | confetti_rain | Pastel colors, slower speed, lower density |
| patriot_stars | firework_burst | Red/white/blue palette, similar energy |
| fireflies | glitter_shimmer | Slow drift instead of static, warmer/larger particles |
