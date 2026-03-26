# Effect Asset Spec — Sprite Overlays

Production art guide for Open Invite's sprite-based event effects.

---

## Sprite Assets (`assets/effects/sprites/<pack_name>/`)

| Property | Requirement |
|----------|------------|
| Format | PNG with transparency (RGBA) |
| Size | 128 x 128 px |
| Background | Fully transparent |
| Content area | Center the artwork within the 128px canvas. Leave ~8px padding on all sides so edges don't clip during rotation. |
| Color | Full color, pre-baked. No runtime tinting is applied — what you draw is what renders. |
| Style | Flat/semi-flat illustration. Avoid photorealism — these render at 22-48pt on screen and need to read clearly at small sizes. |
| Naming | `<descriptive_name>.png` — lowercase, underscores. Replace `placeholder_` prefix with final name (e.g. `cap.png`). |

### Per-Pack Sprite Requirements

| Pack | Sprites needed | Art direction |
|------|---------------|---------------|
| `graduation` | cap, diploma, tassel (3) | Navy cap with gold tassel, rolled diploma with ribbon, gold tassel accent. Recognizable silhouettes at 24-42pt. |
| `house_party` | cup, horn (2) | Red solo cup, gold/rainbow party horn. Fun, slightly stylized. |
| `balloons` | red, blue, yellow (3) | Classic oval balloons with tied string. Distinct hues, slight highlight/sheen for depth. |

### Variant Limits

Each sprite pack supports up to **5 variants** (MAX_SPRITE_VARIANTS). The engine always calls `useImage` 5 times with `null` for unused slots. To add a 4th or 5th variant, add the PNG and update the `sprites` array in the config.

---

## Swatch Assets (`assets/effects/swatches/`)

| Property | Requirement |
|----------|------------|
| Format | PNG (transparency optional — these render inside a circular clip) |
| Size | 88 x 88 px |
| Content | Mini preview of the effect — a tiny collage of the pack's sprites or a representative icon. Renders at 36x36pt in the picker. |
| Naming | `<pack_name>.png` (matches the effect config key) |

---

## Swapping Placeholders for Real Art

Zero code changes required:

1. Replace each `placeholder_*.png` with the final art at the same path and filename
2. Replace each swatch PNG at the same path
3. Rebuild the app (`npx expo prebuild && npx expo run:ios`)

The `require()` calls in MotifOverlay.tsx resolve at build time — same filename = same bundle path.

---

## Adding a New Sprite Pack

1. Create `assets/effects/sprites/<pack_name>/` with up to 5 PNGs (128x128)
2. Create `assets/effects/swatches/<pack_name>.png` (88x88)
3. Add a `SpriteMotifConfig` entry in `src/components/create/MotifOverlay.tsx`:
   ```ts
   new_pack: {
     label: "New Pack",
     swatchIcon: "🆕",  // fallback emoji
     swatchImage: require("../../../assets/effects/swatches/new_pack.png"),
     effectClass: "sprite_overlay",
     spriteConfig: {
       sprites: [
         require("../../../assets/effects/sprites/new_pack/sprite1.png"),
         require("../../../assets/effects/sprites/new_pack/sprite2.png"),
         null, null, null,
       ],
       particleCount: 8,
       // ... physics config
     },
   },
   ```
4. Add the pack ID to the appropriate category in `MOTIF_CATEGORIES`

---

## Performance Notes

- Sprite images are loaded once via Skia `useImage` and cached in GPU texture memory
- Each sprite renders as a single Skia `Image` draw call (no path tessellation)
- MAX_MOTIF_COUNT (14) caps total sprites on screen regardless of config
- All animation runs in Reanimated worklets on the UI thread — no JS bridge overhead
- Target: 60fps on iPhone 12+
