# Forensics Cache — iOS Build Failure Loop

> Active investigation scratchpad. Mark items RESOLVED when confirmed.

## Investigation: lottie-ios version drift on EAS
**Status:** OPEN

**Build 266 state (936ff97, 2026-03-27):**
- lottie-react-native 7.2.2 → lottie-ios 4.5.0
- @sentry/react-native ~6.14.0 → RNSentry 6.14.0 → Sentry/HybridSDK 8.50.2
- SDWebImageAVIFCoder 0.11.1 (present)
- EXPO_IMAGE_NO_AVIF NOT set
- No EAS image pin (used default)
- No EAS build hooks
- @sentry/react-native in app.json plugins
- Podfile.lock committed with full Sentry + AVIF + lottie 4.5.0 pod graph

**Current HEAD state (7e7f375):**
- lottie-react-native 7.3.6 → lottie-ios 4.6.0
- @sentry/react-native REMOVED entirely
- SDWebImageAVIFCoder REMOVED (EXPO_IMAGE_NO_AVIF=1)
- EAS build hook: eas-build-post-install.sh (AVIF podspec + Swift source patching)
- Sentry removed from: app.json plugins, package.json, pbxproj (build phases, bundle resources)
- Podfile has wholemodule hack for lottie-ios in post_install
- Podfile.lock committed with lottie 4.6.0, no Sentry, no AVIF

**Key delta analysis:**
The pod graph changed in three dimensions simultaneously:
1. Sentry removed (RNSentry + Sentry/HybridSDK + sentry.properties + build phases)
2. Lottie upgraded (7.2.2→7.3.6, lottie-ios 4.5.0→4.6.0)
3. AVIF removed (SDWebImageAVIFCoder excluded via env var + script patching)

**Hypothesis:** The lottie-ios 4.5.0 error on EAS may be from a build triggered
from a commit BEFORE the 7.3.6 upgrade was complete, OR from EAS running
`npx expo prebuild --no-install` which could regenerate some native files.

## Investigation: Sentry removal completeness
**Status:** RESOLVED
- @sentry/react-native removed from package.json ✓
- @sentry/react-native removed from app.json plugins ✓
- Sentry build phases removed from pbxproj ✓
- sentry-xcode.sh wrapper removed from Bundle RN phase ✓
- Sentry.bundle removed from CP Copy Pods Resources phase ✓
- ios/sentry.properties deleted (was untracked) ✓
- No Sentry pods in Podfile.lock ✓
- No @sentry imports in JS/TS source (only no-op stub in _layout.tsx) ✓

## Investigation: AVIF exclusion chain
**Status:** OPEN — needs EAS verification
- ENV['EXPO_IMAGE_NO_AVIF'] = '1' in Podfile ✓
- EXPO_IMAGE_NO_AVIF=1 in eas.json production env ✓
- eas-build-post-install.sh patches podspec + Swift source ✓
- Local pod install produces lockfile without SDWebImageAVIFCoder ✓
- **Risk:** On EAS, the post-install hook patches expo-image BEFORE pod install,
  which is correct. But if expo prebuild regenerates the podspec from node_modules
  AFTER the hook runs, the patch would be overwritten.

---

## Investigation: Calendar import "DEFAULT VISIBILITY" control removal (2026-04-12)
**Status:** RESOLVED

**Problem:** `src/app/import-calendar.tsx` rendered an interactive DEFAULT VISIBILITY section (chevron row → full-screen picker modal) that implied user choice where none existed. Imported events are treated as private by default; the control was misleading on a trust-sensitive privacy surface.

**Scope confirmed via freshness check:**
- Only `src/app/import-calendar.tsx` owns this UI. No other screen renders a default-visibility control for imports.
- `docs/SYSTEMS/calendar.md` had one stale line (resync-mode bullet: "Uses existing import mutation + visibility selector").
- No dedicated `docs/SYSTEMS/calendar-import.md` existed.

**Fix (UI/copy only, OTA-safe):**
- Replaced the chevron row with a non-interactive `PRIVACY` section:
  > All imported events are private — only you can see them. You can change visibility anytime after import.
- Deleted `VISIBILITY_OPTIONS`, `VisibilityOption`, `defaultVisibility`/`showVisibilityModal` state, `currentVisibilityOption`, and the picker `Modal`.
- Mutation payload now hard-codes `defaultVisibility: "private"` (request contract unchanged).
- Created `docs/SYSTEMS/calendar-import.md` as SSOT; fixed stale bullet in `calendar.md`.

**Guardrail:** The new SSOT doc declares that the import screen MUST NOT render any interactive default-visibility control. Reintroducing one requires an explicit product decision and an update to both `calendar-import.md` and `calendar.md`.

---

## Investigation: Event detail scroll jank with video-backed themes (2026-04-12)
**Status:** RESOLVED (pending device validation)

**Symptom:** Scroll on `src/app/event/[id].tsx` becomes janky when a theme video is active.

**Active render stack (before fix) when theme video is present:**
1. `AnimatedGradientLayer` — Reanimated opacity crossfade with `withRepeat(withTiming(...))` on 5–22s cycle.
2. `ThemeVideoLayer` — `expo-video` looping `VideoView` (decode + composite per frame).
3. Particle layer (either `MotifOverlay` for custom effects or `ThemeEffectLayer` for theme-bundled particles) — Skia `Canvas` driven by Reanimated `useFrameCallback` per-frame particle simulation.
4. `ThemeFilterLayer` — static Skia canvas (film grain / vignette / noise / color shift).

All four mount via `src/components/event/ThemeBackgroundLayers.tsx`, which is called exactly once from `event/[id].tsx:2060`. During `Animated.ScrollView` scroll, the layered absolute-positioned hierarchy re-composites with all four animated systems still live.

**Fix (proof tag `[PERF_VIDEO_CONTAINMENT_V1]`):**
- Added `hasActiveVideo = Boolean(visualStack?.video && THEME_VIDEOS[source])` in the orchestrator.
- Gated the gradient and particle blocks on `!hasActiveVideo`.
- Kept the video + static filter layer.
- Non-video themes unchanged — they keep the full stack because video isn't contributing motion there.

**Why this is surgical:**
- Single file (`ThemeBackgroundLayers.tsx`). No touching of `event/[id].tsx`, `ThemeVideoLayer.tsx`, `ThemeEffectLayer.tsx`, or `MotifOverlay.tsx` (those stay reusable by create/edit flows which still want the full stack).
- No entitlement changes, no catalog changes, no native changes.
- Reduced-motion / video-load-failure paths already render a poster inside `ThemeVideoLayer`, so suppressing the gradient is visually safe (the poster fills the same background real estate).

**Guardrail:** Re-enabling gradient or particles alongside a video in `ThemeBackgroundLayers.tsx` requires re-validating scroll perf on device first. The rule is encoded as an invariant in `docs/SYSTEMS/event-page.md`.

**Open follow-ups (out of scope for this fix):**
- Consider `shouldRasterizeIOS`/`renderToHardwareTextureAndroid` on the scroll content if further wins are needed.
- Audit whether the `InviteFlipCard` re-renders on every scroll frame (no evidence yet; would need profiler trace).
- Consider conditionally suppressing the scroll-contended inline discussion composer re-renders if they show up in traces.
