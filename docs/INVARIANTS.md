# Frontend Invariants (Non-Negotiable)

## Tech Immutables
- Expo + React Native + Expo Router only
- Icon system fixed to src/ui/icons.tsx using Ionicons via ion()
- No lucide
- No new dependencies unless explicitly authorized
- Minimal diffs
- Navigation architecture preserved

## Auth & Logout
- Cookie/session based (Better Auth). Do not assume Bearer tokens.
- Logout sequence must remain:
  cancelQueries -> clear cache -> resetSession -> router.replace('/login')
- After logout, app must not call authenticated endpoints.

## Guidance & Onboarding
- Guidance/onboarding helper overlays MUST be scoped per-user-id.
- Keys must be user-prefixed (e.g., `openinvite.guidance.dismissed.<userId>`, `guidance:completed:<userId>:action`).
- No time-since-install heuristics to suppress guides (time-based windows reset on reinstall).
- Account switching must not leak suppression state across users.
- Logging out must not erase guidance state (unless explicit reset action exists).
- Rationale: Senior users reinstalling app should not see new-user onboarding. Multi-account support requires per-user isolation.

## Release / Production Parity
- Always PUSH FRONTEND after committing changes.
- iOS production/TestFlight shipping uses scripts/ship-ios-prod.sh (shipios alias).

INVARIANT: “business” is banned from frontend runtime code. (No businessEvents, isBusinessEvent, type: "business", business profile mode, or ProfileSwitcher.)

INVARIANT: Badges are PILL-ONLY. No badge overlays on avatars. No trophy glyphs in UI.

## Network Gate SSOT

INVARIANT: All authenticated React Query calls MUST use `enabled: bootStatus === 'authed'`.

This is the canonical way to gate network requests on authentication state. Never use `enabled: !!session` or similar patterns.

**Rationale**: After logout, the session may persist momentarily in React Query cache. Using `!!session` causes queries to fire during logout/login transitions → 401 storm.

**See**: [AUTH_CONTRACT.md](AUTH_CONTRACT.md) Law 3 for complete documentation.

## Auth Expiry SSOT

INVARIANT: `authClient` emits a one-shot auth expiry event on 401/403 responses. The event fires exactly once per session expiry, preventing toast spam.

**Proof tag**: `[AUTH_EXPIRED]` in console logs when triggered.

**Behavior**: On 401/403 from authenticated endpoint, authClient fires expiry event. App shows single toast, clears session, redirects to welcome.

## UX Jitter Prevention

INVARIANT: Loading states MUST use `useStickyLoading(300ms)` minimum duration to prevent UI jitter from fast network responses.

**Proof tag**: `[P1_JITTER]` in component implementations.

**Rationale**: Sub-100ms loading state flashes cause visual jitter that degrades perceived polish. 300ms minimum ensures smooth transitions.

## Backend Rate Limiting

INVARIANT: Backend applies rate limiting to auth endpoints:
- Global: 200 requests/minute per IP
- Auth endpoints (`/api/custom-auth/*`): 50 requests/15 minutes per IP

**Proof tags**: `[RATE_LIMIT]` in backend logs when limits enforced.

## Support Contact SSOT

INVARIANT: Support email is `support@openinvite.cloud`. All support contact points use `src/lib/support.ts` helper.

**Proof tag**: `[P0_SUPPORT]` in support.ts implementation.

**Helper**: `openSupportEmail()` opens mailto with clipboard fallback for native apps without mailto handler.

## Password Reset Flow

INVARIANT: Password reset flow is:
1. User requests reset via email
2. Backend sends reset link to `https://openinvite.cloud/reset-password?token=...`
3. User clicks link → web page with password entry form
4. Web page calls backend `/api/auth/reset-password` with token + new password

**Proof tag**: `[P0_PW_RESET]` in auth.ts implementation.

**Backend guard**: If RESEND_API_KEY not configured, throws `EMAIL_PROVIDER_NOT_CONFIGURED` instead of silent failure.

## Icon Update Pipeline

INVARIANT: To update app icon:
1. Replace `/icon.png` with new 1024x1024 PNG
2. Run `npx expo prebuild --clean` to regenerate native assets
3. Commit AppIcon assets in `ios/` and `android/`
4. Ship new binary via EAS Submit

**Note**: App Store icon updates require full binary submission. OTA updates cannot change the app icon.

## Deferred Post-Launch Items

The following are deferred for post-launch implementation:

- **Recurring Events Pro Gating**: Currently available to all users. Premium gating planned as Pro feature.
- **Push Delivery 2-Account Proof**: Multi-device notification delivery verification pending.
- **End-to-End Encryption**: Not currently implemented. FAQ updated to remove false claim.

## Scheduling SSOT — Circle Availability

INVARIANT: `SchedulingEngine` (`src/lib/scheduling/engine.ts`) is the single source of truth for circle availability computation.

**Rules:**
1. UI components must not compute availability or slot ranking. All availability pills and labels must render `SchedulingEngine` output only.
2. All availability pills and labels must render `SchedulingEngine` output only (INV-S1).
3. Scheduling output must be deterministic for identical inputs (INV-S2).
4. Engine must always return at least one viable slot for valid ranges (INV-S3).
5. Each slot exposes transparent participation fields: `availableCount`, `totalMembers`, `availableUserIds`, `unavailableUserIds` (INV-S4).

**Forbidden patterns:**
- Duplicate availability logic in UI (e.g., ad-hoc `freeSlots` useMemo computing overlaps).
- Ad-hoc slot sorting outside the engine.
- Rendering hardcoded availability labels without engine output.

**Proof tag:** `[SCHED_ENGINE_V1]` — logged once per compute in `engine.ts`.

---

## Motion SSOT

All imperative reanimated animation (useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay, withRepeat, Easing) must flow through the motion SSOT layer:

- **`src/lib/motionSSOT.ts`** — single source of truth for presets (hero, card, press, media), easing curves (`MotionEasings`), and duration tokens.
- **`src/components/MotionSurface.tsx`** — consumes SSOT presets; wraps any view with fade-in / slide / scale animation.
- **`src/hooks/usePressMotion.ts`** — press-scale hook backed by the `press` preset.

### Rules

1. **No screen-local easing.** Every `withTiming` / `withSpring` call must pull `easing` and `duration` from `MotionPresetConfig` or `MotionEasings`.
2. **New animations go through MotionSurface.** If a screen needs a new motion pattern, add a preset in `motionSSOT.ts` and consume it via `MotionSurface` or a dedicated hook.
3. **Entering/exiting layout presets are exempt.** `FadeInDown`, `FadeIn`, etc. from reanimated layout API do not require SSOT — they are declarative and self-contained.
4. **Allowlist is append-only.** Existing files using imperative reanimated are tracked in `verify_frontend.sh`. New files must not be added without a review rationale.

### Invariants

- `motionSSOT.ts` must export `MotionPresetConfig` (all presets) and `MotionEasings` (INV-M1).
- `MotionSurface.tsx` must consume `config.easing` from SSOT — no hardcoded easing (INV-M2).
- `usePressMotion.ts` must pull easing from `MotionPresetConfig.press.easing` (INV-M3).
- `verify_frontend.sh` must fail if any file outside the allowlist uses imperative reanimated primitives (INV-M4).

**Forbidden patterns:**
- `withTiming(value, { duration: 300 })` with an inline number outside `motionSSOT.ts`.
- `Easing.bezier(...)` or `Easing.out(...)` in a screen or component file (only in `motionSSOT.ts`).
- New files importing `useSharedValue` / `useAnimatedStyle` without being added to the motion allowlist.

**Proof tag:** `[MOTION_SSOT_V1]` — present in `motionSSOT.ts` exports.