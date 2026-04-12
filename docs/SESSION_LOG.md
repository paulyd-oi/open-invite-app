# Session Log — iOS Build Failure Forensic Audit

## 2026-04-04 — Forensic audit session

### Files read
- `936ff97:package.json` — build 266 dependencies (sentry ~6.14.0, lottie-react-native 7.2.2)
- `936ff97:eas.json` — build 266 production config (no image pin, no hooks, no AVIF env)
- `936ff97:ios/Podfile` — build 266 Podfile (no AVIF env, no wholemodule hack)
- `936ff97:ios/Podfile.lock` — build 266 pod graph (lottie-ios 4.5.0, Sentry 8.50.2, SDWebImageAVIFCoder 0.11.1)
- `936ff97:app.json` — build 266 config (@sentry/react-native in plugins)
- `936ff97:ios/OpenInvite.xcodeproj/project.pbxproj` — build 266 pbxproj (5 Sentry refs)
- `HEAD:package.json` — lottie-react-native 7.3.6, no sentry
- `HEAD:eas.json` — EXPO_IMAGE_NO_AVIF=1, no image pin
- `HEAD:ios/Podfile` — AVIF env + wholemodule lottie hack
- `HEAD:ios/Podfile.lock` — lottie-ios 4.6.0, no Sentry, no AVIF
- `HEAD:scripts/eas-build-post-install.sh` — AVIF podspec+Swift patching
- `HEAD:ios/OpenInvite.xcodeproj/project.pbxproj` — 0 Sentry refs
- `.gitignore` — ios/Pods/, ios/OpenInvite.xcworkspace/ gitignored
- `package-lock.json` — lottie-react-native locked to 7.3.6

### Files changed
- `docs/FORENSICS_CACHE.md` — created (investigation scratchpad)
- `docs/SESSION_LOG.md` — created (this file)

### Root causes discovered
1. **Three simultaneous pod graph changes** between build 266 and HEAD: Sentry removal,
   Lottie upgrade, AVIF removal. Each changes the CocoaPods dependency graph.
2. **Build 266 had no EAS hooks, no AVIF exclusion, no Xcode image pin.** It compiled
   lottie-ios 4.5.0 + Sentry 8.50.2 + SDWebImageAVIFCoder successfully on whatever
   EAS default image was current on March 27.
3. **The EAS default image likely rotated** between March 27 and subsequent builds,
   which broke Sentry (SentryDefines.h not found on newer Xcode) and possibly lottie-ios.
4. **The Podfile.lock is committed but may be overridden** if EAS runs `expo prebuild`
   which regenerates native config before pod install.

### Key decisions
- Sentry removal is clean and complete
- lottie-react-native pinned to exact 7.3.6
- wholemodule hack in Podfile post_install is the right location
- AVIF patching in eas-build-post-install.sh is correct approach

### Unfinished work
- Need to verify whether EAS actually runs `expo prebuild` for this project
- Need to verify the wholemodule hack actually resolves lottie-ios 4.6.0 compile on Xcode 16.4
- Haven't yet tested a build — need one more build attempt
- Option C (revert to build 266 exact state + remove Sentry only) not yet evaluated

---

## 2026-04-12 — Calendar import: remove misleading "DEFAULT VISIBILITY" control

### Context
`import-calendar.tsx` rendered a "DEFAULT VISIBILITY" section with a selectable Private row + chevron + full-screen picker modal. Imported events are behaviorally locked to private, so the control misrepresented user choice. Trust-sensitive surface.

### Files read
- `src/app/import-calendar.tsx` — confirmed interactive visibility row (lines 679–712) + picker modal (lines 1014–1097) + state + constants
- `docs/SYSTEMS/calendar.md` — had stale line referencing "visibility selector" in resync mode notes
- `docs/CODEBASE_MAP.md` — confirmed `import-calendar.tsx` is the only screen rendering this flow

### Files changed
- `src/app/import-calendar.tsx` — removed interactive control, picker modal, `VISIBILITY_OPTIONS`, `VisibilityOption`, `defaultVisibility` + `showVisibilityModal` state, `currentVisibilityOption`, and unused `Modal`/`Users`/`Compass`/`Lock` imports. Replaced the section with a non-interactive `PRIVACY` informational block. Mutation payload now always sends `defaultVisibility: "private"`.
- `docs/SYSTEMS/calendar.md` — updated resync-mode note to point to the new SSOT and remove the "visibility selector" reference.
- `docs/SYSTEMS/calendar-import.md` — NEW. SSOT for the import flow, including the Privacy Contract (imported events are private by default; no UI to change at import time).
- `docs/SESSION_LOG.md` — this entry.
- `docs/FORENSICS_CACHE.md` — added findings entry.

### Key decisions
- Kept `defaultVisibility?` in `ImportCalendarEventsRequest` interface (request contract unchanged — only the client-side value is frozen to `"private"`).
- Did not touch the backend endpoint — UI/copy fix only.
- Created `calendar-import.md` rather than folding into `calendar.md` because the import flow is a distinct surface with its own privacy contract.

### Verification
- `npx tsc --noEmit` clean.
- Grep confirms `DEFAULT VISIBILITY`, `VISIBILITY_OPTIONS`, `showVisibilityModal`, `currentVisibilityOption`, `VisibilityOption` are no longer present in `import-calendar.tsx`.
- New copy `PRIVACY` / `All imported events are private — only you can see them. You can change visibility anytime after import.` is present at lines 647/659.
- OTA-safe: no native module or native config changes.

---

## 2026-04-12 — Event detail scroll jank with video themes

### Context
Report: "Event page scroll becomes sluggish/janky when a video theme is active." Core product surface; premium visuals must not degrade RSVP/detail experience.

### Files read
- `docs/SYSTEMS/event-page.md` — render layers list, particle exclusivity invariant
- `src/components/event/ThemeBackgroundLayers.tsx` — orchestrator mounting all background layers (called once from `event/[id].tsx:2060`)
- `src/components/ThemeVideoLayer.tsx` — `expo-video` looping player, handles its own reducedMotion + failure poster fallback, AppState pause/resume
- `src/components/ThemeEffectLayer.tsx` (first ~100 lines) — Skia Canvas + Reanimated useFrameCallback particle simulation
- `src/components/create/MotifOverlay.tsx` (first ~80 lines) — same Skia particle engine, used for user-selected `effectId`
- `src/components/ThemeFilterLayer.tsx` — single Skia canvas, static post-processing (no per-frame animation)
- `src/components/AnimatedGradientLayer.tsx` — two LinearGradients with Reanimated opacity crossfade (withRepeat, withTiming)
- `src/app/event/[id].tsx` (around line 2050) — confirmed `ThemeBackgroundLayers` is the single mount site; ScrollView is `Animated.ScrollView` with no `removeClippedSubviews`

### Root cause
When a theme video is active, four animated/composited systems run simultaneously behind content: (1) Reanimated gradient crossfade, (2) looping `expo-video` H.264 decode, (3) Skia Canvas with `useFrameCallback` driving particle positions every frame, (4) Skia filter canvas. During scroll the entire layered view hierarchy re-composites, amplifying the cost of the redundant animated layers.

### Fix
Containment rule added to `ThemeBackgroundLayers.tsx` (proof tag `[PERF_VIDEO_CONTAINMENT_V1]`):
- Compute `hasActiveVideo = Boolean(visualStack?.video && THEME_VIDEOS[source])`.
- When `hasActiveVideo`: skip `AnimatedGradientLayer` (video + poster fallback cover the atmosphere) and skip the particle layer (`MotifOverlay` / `ThemeEffectLayer`).
- Keep `ThemeVideoLayer` and `ThemeFilterLayer` (static filter, single Skia canvas, no per-frame work).
- Non-video themes: behavior unchanged.

### Files changed
- `src/components/event/ThemeBackgroundLayers.tsx` — containment rule + docblock.
- `docs/SYSTEMS/event-page.md` — updated render-layer list + added "Video Containment Rule" section + invariant.
- `docs/SESSION_LOG.md` — this entry.
- `docs/FORENSICS_CACHE.md` — forensic entry with guardrail.

### Scope deviation from expected file list
Expected list named `src/app/event/[id].tsx`, `ThemeVideoLayer.tsx`, `ThemeEffectLayer.tsx`, `MotifOverlay.tsx`. After freshness check, all layer mounting flows through the single orchestrator `src/components/event/ThemeBackgroundLayers.tsx`. Putting the rule there is the smallest, highest-visibility surgical change: the layer components stay pure/reusable (create page still mounts the full stack), and the decision is co-located with the render. No edits to `event/[id].tsx` (no call-site change needed), no edits to the layer components themselves.

### Verification
- `npx tsc --noEmit` clean.
- Layer gating visible in `ThemeBackgroundLayers.tsx` via `!hasActiveVideo` guards on gradient + particle blocks.
- Particle exclusivity (effect vs theme particles) still honored inside the particle branch.
- OTA-safe: pure JS/TS, no native module, native config, or package changes.
