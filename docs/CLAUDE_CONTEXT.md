# Claude Context — Open Invite

> Read this first on any new session. Treat as repo SSOT unless code clearly contradicts it.
> Last updated: 2026-03-28.

---

## 1. Product Snapshot

Open Invite is **live on the App Store** (v1.1.1, build 266+).

**Core wedge:**
- "What are my friends doing this week?"
- "I'm doing something -- who's in?"

**Primary loop:** browse -> open -> RSVP -> share

Not pre-launch. Every change ships to real users. Treat accordingly.

---

## 2. Stack / Architecture

| Layer | Tech |
|-------|------|
| Frontend | Expo SDK 53 + React Native 0.76.7, Expo Router (file-based), NativeWind/Tailwind |
| Backend | Hono.js + Prisma ORM + PostgreSQL (Render) |
| Auth | Better Auth, cookie-based sessions, `bootStatus === 'authed'` gate |
| State | React Query (server), Zustand (local), AsyncStorage (persistence) |
| Media | Cloudinary (uploads + transforms) |
| Analytics | PostHog |
| Distribution | EAS + TestFlight (iOS), Render auto-deploy (backend) |
| Package manager | `bun` (not npm) |

**Repo structure:**
```
src/app/           Expo Router file-based routes
src/components/    Reusable UI components
src/lib/           Utilities, hooks, contracts
shared/            Shared types/contracts (frontend)
backend/           Separate repo: my-app-backend
docs/              Architecture, debugging, features
```

---

## 3. Critical Engineering Constraints

- **Backend route mount parity:** Routes must be registered in BOTH `src/index.ts` (dev) and `src/server.ts` (prod). Missing one = route works locally, 404 in production.
- **Forbidden files:** Do not edit `patches/`, `babel.config.js`, `metro.config.js`, `app.json`, `tsconfig.json`.
- **No new packages** unless `@expo-google-font` or pure JS helpers.
- **Secrets:** Never in source. Environment variables only (EAS/Render).
- **Share route:** `go.openinvite.cloud/share/event/:id` returns OG metadata. Critical growth surface -- do not break.
- **Contract alignment:** When modifying event fields, update: Prisma schema, backend serializer, backend contracts, frontend contracts (`shared/contracts.ts`). All four must stay in sync.

---

## 4. Theme / Effect System

### Catalog Themes
- 30 total: 5 free + 25 premium (Pro-gated)
- Stored as `themeId String?` on event model
- Resolved via `resolveEventTheme(themeId)` -> `EventThemeTokens`
- Each theme defines: colors, swatch, visualStack (gradient, particles, lottie, video, shader, filter)

### Custom Themes
- Stored as `customThemeData Json?` on event model
- Contains `{ visualStack, name }`
- Resolved via `buildCustomThemeTokens(customThemeData)` -> `EventThemeTokens`
- Created in ThemeTray's Theme Studio (create + edit flows)

### Effects (Event-Level)
- Stored as `effectId String?` + `customEffectConfig Json?` on event model
- Independent of theme -- user picks from EffectTray
- Preset effects use keys from `EFFECT_CONFIGS` (same engine as theme particles)
- Custom effects store full `ParticleMotifConfig` JSON
- `effectId === "__custom__"` signals custom config

### Event Page Render Precedence
```
1. SafeAreaView background (canvasColor from pageTheme)
2. AnimatedGradientLayer (if visualStack.gradient)
3. ThemeVideoLayer (if visualStack.video)
4. Particle layer (EXCLUSIVE — one or the other, never both):
   - IF effectId exists: MotifOverlay (user-selected effect)
   - ELSE: ThemeEffectLayer (theme-bundled particles/lottie)
5. ThemeFilterLayer (if visualStack.filter)
6. Content (scrollable card)
```

**Rule:** User-selected effects override theme particles. Theme gradient, video,
styling, and filters are NOT suppressed — only the particle layer is exclusive.

**Create preview follows the same rule:** effectId → MotifOverlay; else theme →
ThemeEffectLayer; else no particles. Preview matches event page behavior.

### Key Files
- `src/lib/eventThemes.ts` -- theme catalog, resolver, token types
- `src/components/ThemeEffectLayer.tsx` -- Skia particle/lottie engine
- `src/components/create/MotifOverlay.tsx` -- effect overlay engine
- `src/components/create/ThemeTray.tsx` -- theme picker (catalog + custom)
- `src/components/create/EffectTray.tsx` -- effect picker (presets + custom)

---

## 5. Layout / Safe-Area System

### Bug Class (Fixed)
`SafeAreaView edges={["bottom"]}` adds ~34px for the home indicator. Combined with the floating tab bar or manual scroll paddingBottom, this double-pads and clips content.

### Correct Pattern
- All screens use `edges={[]}` (or `edges={["top"]}` if custom header, no nav header)
- Bottom spacing comes from `src/lib/layoutSpacing.ts`:
  - `TAB_BOTTOM_PADDING` (100) -- tab screens with floating nav
  - `STACK_BOTTOM_PADDING` (48) -- pushed stack screens
  - `FORM_BOTTOM_PADDING` (40) -- settings/edit forms
- Chat screens handle bottom spacing dynamically via input bar + `insets.bottom`
- `FLOATING_TAB_INSET` (84) is the canonical constant from `BottomNavigation.tsx`

### Exceptions
- `paywall.tsx` -- bottom CTA bar legitimately needs `edges={["bottom"]}`
- `NotificationNudgeModal.tsx` -- modal, bottom safe area correct

---

## 6. Location Search

- Frontend collects user coords via `expo-location`
- Backend route: `GET /api/places/search?query=...&lat=...&lon=...`
- Uses `GOOGLE_PLACES_API_KEY` env var on Render
- Passes `location=${lat},${lon}&radius=50000` to Google Places API
- Fallback chain: Google Places -> Photon -> Nominatim -> smart suggestions
- No code changes needed if API key is set correctly

---

## 7. Recent Fixed / High-Risk Surfaces

| Surface | Status | Risk |
|---------|--------|------|
| Create -> event page routing | Fixed (replaces share modal) | Low |
| Custom theme persistence | Fixed (backend + frontend) | Low |
| Safe-area full-height bug | Fixed (repo-wide sweep) | Low -- use layoutSpacing.ts |
| Share route OG metadata | Fixed (was silently swallowing DB errors) | Medium -- deploy-dependent |
| Effect persistence | Fixed (effectId as event field) | Medium -- new, needs QA |
| Edit page theme/effect parity | Fixed (ThemeTray + EffectTray) | Medium -- new, needs QA |

---

## 8. System Map

A structured reference layer lives in `docs/SYSTEM_MAP.md` with detailed subsystem docs in `docs/SYSTEMS/`:

| System | Doc |
|--------|-----|
| Create Flow | `docs/SYSTEMS/create-flow.md` |
| Event Page | `docs/SYSTEMS/event-page.md` |
| Theme & Effects | `docs/SYSTEMS/theme-effects.md` |
| Chat (Circles) | `docs/SYSTEMS/chat.md` |
| Calendar | `docs/SYSTEMS/calendar.md` |
| Location | `docs/SYSTEMS/location.md` |

**Enforcement:** When modifying any subsystem, update the corresponding `docs/SYSTEMS/*.md` file.

---

## 9. Instructions for Future Claude Runs

1. **Read this file first.** It is the repo context SSOT.
2. **Read `docs/CLAUDE_WORKFLOW.md`** for process expectations.
3. **Read `docs/SYSTEM_MAP.md`** for architecture overview; read relevant `docs/SYSTEMS/*.md` for the subsystem you're modifying.
4. **Do not re-discover architecture** unless this doc is clearly wrong.
5. **Update this file** when major architectural truths change (new features, removed systems, changed patterns).
6. **Update `docs/SYSTEMS/*.md`** when changing subsystem behavior, components, or data flow.
7. **Check `CLAUDE.md`** (project root) for tool/routing/state management rules.
8. **Check `docs/DEBUGGING_GUIDE.md`** when investigating bugs.
9. **Check `docs/UX_CONTRACTS.md`** when modifying UI behavior.
