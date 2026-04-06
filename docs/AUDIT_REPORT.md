# Open Invite — Senior Engineer Audit Report

<!-- Audit date: 2026-04-06 | Auditor: Claude Code (Opus 4.6) | Commit: 46a3656 on main -->

## Summary

**Overall Grade: B-**

The codebase is a functional, shipped production app with ~47 users. TypeScript compiles clean with zero errors, auth tokens are stored securely (SecureStore), and the core user flows work. However, the codebase has accumulated significant technical debt: 248 `as any` casts, 4,796 lines of dead code, 57 files over 500 lines, no automated test suite, Sentry disabled, no Android EAS build profile, and ad-hoc query keys scattered across screens. None of these are ship-stoppers at current scale, but they will compound fast as the user base grows.

**What's done well:**
- Zero `@ts-ignore` / `@ts-nocheck` — type escape hatches are all `as any` (visible, greppable)
- Auth tokens in `expo-secure-store` (not AsyncStorage)
- No hardcoded API keys or secrets in source
- Network detection exists (`@react-native-community/netinfo`)
- Error boundary wraps the app root
- React Query used consistently across all major screens
- date-fns (tree-shakeable) instead of moment.js
- No lodash, no duplicate image libraries

**What needs work:**
- 248 `as any` casts (93 are router.push typed-routes workarounds)
- Sentry completely disabled (build incompatibility)
- No Android build profile in EAS
- No automated tests (zero test files outside one integration test)
- 26 dead components + 9 dead lib files = ~4,800 lines of dead code
- 57 files exceed 500 lines (circle/[id].tsx is 2,965 lines)
- Ad-hoc query keys bypass the key factory pattern

---

## Critical Issues

| # | File | Issue | Severity | Fix |
|---|------|-------|----------|-----|
| C1 | `_layout.tsx:54-55` | **Sentry disabled** — replaced with a no-op stub. Zero crash reporting in production. Any production crash is invisible. | P0 | Re-enable Sentry with `@sentry/react-native` SDK compatible with current Expo/Xcode. If build incompatibility persists, use Expo's built-in `expo-updates` error reporting or PostHog error capture as interim. |
| C2 | `eas.json` | **No Android build profile** — production/development profiles have no `android` key. Android builds will use defaults with no resource class, no auto-increment, no env vars. | P0 | Add `"android": { "buildType": "apk" }` (dev) and `"android": { "buildType": "app-bundle" }` (production) to each EAS profile. |
| C3 | `src/lib/mediaTransformSSOT.ts:88` | **Cloudinary `f_auto` served AVIF to clients without AVIF decoder** — AVIF codec patched out of expo-image (`scripts/patch-expo-image.sh`) but `f_auto` could still serve AVIF. Fixed to `f_webp` in this session but not yet committed. | P0 | Commit the `f_webp` fix. Verify images render on both iOS and Android after change. |
| C4 | Entire codebase | **No automated test suite** — zero unit tests, zero integration tests, zero E2E tests (Detox config exists but no test files). Regressions are caught only by manual QA. | P1 | Start with critical path tests: auth flow, RSVP mutation, event creation. Use `jest` + `@testing-library/react-native` for component tests. |
| C5 | `src/app/profile.tsx` | **0 `isLoading` checks** despite 8 React Query hooks. Screen may flash undefined data or render empty during cold start. | P1 | Add loading skeleton or `isPending` guards to profile data queries. |

---

## Warnings

| # | File | Issue | Severity | Fix |
|---|------|-------|----------|-----|
| W1 | 93 files | **`router.push(path as any)`** — typed routes enabled but 93 navigation calls cast to `as any`. Expo Router's typed route validation is completely bypassed. | Medium | Generate route types with `npx expo customize` or define a typed `navigate()` wrapper. Eliminate `as any` one screen at a time. |
| W2 | `src/app/circle/[id].tsx` | **2,965 lines** — single component handling chat, events, members, polls, navigation, optimistic updates. Extremely difficult to maintain or review. | Medium | Extract into sub-components: `CircleChatView`, `CircleEventsList`, `CircleHeader`. Keep state in parent, pass down via props. |
| W3 | `src/app/event/[id].tsx` | **2,705 lines** — event detail screen with RSVP, comments, photos, flip card, summary, host controls all in one file. | Medium | Extract: `EventHeroSection`, `EventRsvpSection`, `EventCommentsSection`, `EventPhotosSection`. |
| W4 | Multiple screens | **Ad-hoc query keys bypass factory** — `["friends"]`, `["referralStats"]`, `["workSchedule"]`, etc. used directly instead of via `queryKeys.ts` / `eventQueryKeys.ts`. Risk: invalidation misses, stale data. | Medium | Move all ad-hoc keys into `queryKeys.ts`. Enforce via lint rule or code review. |
| W5 | `src/lib/authClient.ts` | **18 `as any` casts** in auth client — error objects, response parsing, and return types all cast. Auth is security-critical code where type safety matters most. | Medium | Define proper error types (`AuthError`, `ApiError`) with status/message fields. Replace `as any` with type guards. |
| W6 | `src/app/create-event-request.tsx:687-795` | **Date/time pickers iOS-only** — 4 pickers wrapped in `Platform.OS === "ios"` with no Android fallback. Android users see no pickers at all. | Medium | Use `@react-native-community/datetimepicker` which supports both platforms, or show `display="default"` on Android. |
| W7 | `src/app/paywall.tsx:274` | **Paywall early-returns on Android** — `if (Platform.OS !== "ios") return;`. Android users can't access the paywall at all. | Medium | RevenueCat supports Google Play. Enable Android paywall when Google Play billing is configured. |
| W8 | `src/components/ideas/DailyIdeasDeck.tsx` | **15 `as any` casts** — session, event, and circle data all cast to any. Type definitions don't match actual API response shape. | Low | Define proper types for idea card data. Add response type to API hooks. |
| W9 | `src/app/settings.tsx:359-473` | **Admin unlock stored in AsyncStorage** (not SecureStore). Anyone with device access can read the admin unlock flag. | Low | Move to SecureStore. Though impact is limited since the passcode itself comes from env var. |
| W10 | `src/app/help-faq.tsx:40-41` | **`UIManager.setLayoutAnimationEnabledExperimental`** — deprecated Android API. Should use `react-native-reanimated` layout animations instead. | Low | Replace `LayoutAnimation` with `Animated.Layout` from reanimated or `entering`/`exiting` props. |
| W11 | `package.json` | **7 `@react-navigation` packages** alongside `expo-router`. Only 1 is directly imported (`@react-navigation/native` in `_layout.tsx`). The rest are likely expo-router transitive deps, but should be verified. | Low | Audit: remove any not required by expo-router. Check with `npx depcheck`. |
| W12 | `package.json` | **`lottie-react-native@7.3.6`** — Expo expects 7.2.2. Version mismatch caused EAS build failures with Swift 6 toolchain. | Low | Downgrade: `npx expo install lottie-react-native` to get compatible version. |

---

## Improvements

| # | Area | Issue | Impact | Recommendation |
|---|------|-------|--------|----------------|
| I1 | Dead code | **4,796 lines of dead code** across 17 components and 9 lib files (see Dead Code section below). Increases bundle size and cognitive load. | Medium | Delete all dead files in a single cleanup PR. |
| I2 | File size | **57 files over 500 lines** (13 over 1,000 lines). Top offenders: `circle/[id].tsx` (2,965), `event/[id].tsx` (2,705), `social.tsx` (1,974), `calendar.tsx` (1,824). | Medium | Decompose the top 5 files. Target <500 lines per screen component. |
| I3 | Type safety | **248 `as any` total** — breakdown: 93 router.push, 18 authClient, 26 event field access, 15 DailyIdeasDeck, 7 query data casts, 89 misc. | Medium | Prioritize: (1) router type generation, (2) authClient types, (3) event interface completeness. |
| I4 | Query keys | **Mixed key patterns** — key factories in `eventQueryKeys.ts` and `circleQueryKeys.ts` coexist with ad-hoc `["friends"]`, `["referralStats"]` literals in 15+ locations. | Low | Consolidate all keys into factory files. |
| I5 | `(event as any).field` | **26 casts to access event fields** like `.cardColor`, `.groupVisibility`, `.isWork`, `.showGuestList`. These fields exist on the backend but aren't in the frontend `Event` type. | Medium | Extend the `Event` interface in the API contract to include all fields the backend actually returns. |
| I6 | Error types | **37 `(error as any)` casts** across error handling code. Errors from API calls have no typed structure. | Low | Define `ApiError { status: number; message: string; code?: string; requestId?: string }` and use in all API response handlers. |
| I7 | Zustand stores | **4 Zustand stores** found: `createSettingsStore`, `themeBuilderStore`, `offlineStore`, `example-state`. `example-state.ts` is dead code. `offlineStore` has an unbounded `pendingMutations` array. | Low | Delete `example-state.ts`. Add max-size guard or TTL cleanup to `offlineStore.pendingMutations`. |
| I8 | Platform.OS | **79 `Platform.OS` checks** across codebase. Most are legitimate (keyboard behavior, date pickers), but some gate features entirely (paywall, promo codes). | Low | Audit each iOS-only gate: is it a platform limitation or a "not yet implemented" stub? |

---

## Dead Code

### Dead Components (17 files, ~4,190 lines)

| File | Lines | Likely Purpose |
|------|-------|---------------|
| `LoginWithEmailPassword.tsx` | 695 | Replaced by inline login in `login.tsx` |
| `SuggestedTimesPicker.tsx` | 475 | Event request time suggestions (unused feature) |
| `EmptyStates.tsx` | 451 | Generic empty states (replaced by inline empty states) |
| `EventReactions.tsx` | 337 | Emoji reactions on events (never shipped) |
| `EventCategoryPicker.tsx` | 270 | Category picker for events (unused in create flow) |
| `SwipeableEventRequestCard.tsx` | 261 | Swipeable card for event requests |
| `MapPreview.tsx` | 257 | Map preview component (unused) |
| `SuggestionFeedCard.tsx` | 247 | Feed card for suggestions |
| `FirstTimeCalendarHint.tsx` | 188 | Calendar onboarding hint |
| `VerifyEmailModal.tsx` | 176 | Email verification modal (replaced) |
| `PremiumBanner.tsx` | 171 | Premium upgrade banner (replaced by PaywallModal) |
| `ReconnectReminder.tsx` | 165 | Friend reconnect nudge |
| `PostEventRepeatNudge.tsx` | 137 | Post-event repeat suggestion |
| `ProfilePreviewCard.tsx` | 128 | Profile preview card |
| `SoftLimitModal.tsx` | 110 | Soft limit warning modal |
| `SocialPulseRow.tsx` | 91 | Social activity row |
| `LoginButton.tsx` | 31 | Login button component |

### Dead Lib Files (9 files, ~606 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `suggestionsDeck.ts` | 299 | Card deck logic for suggestions |
| `widgetBridge.ts` | 83 | iOS Today Widget bridge |
| `activationFunnel.ts` | 72 | Activation tracking |
| `upgradeTriggers.ts` | 46 | Premium upgrade trigger logic |
| `devToastFilter.ts` | 38 | Dev toast filtering |
| `entitlementsApi.ts` | 28 | Entitlements API client (replaced) |
| `usePreloadImage.ts` | 20 | Image preloading hook |
| `useClientOnlyValue.web.ts` | 12 | Web-only value hook |
| `useColorScheme.web.ts` | 8 | Web-only color scheme |

---

## Build & Type Safety Summary

| Metric | Value | Assessment |
|--------|-------|------------|
| `npx tsc --noEmit` | 0 errors | Clean |
| `@ts-ignore` | 0 | Clean |
| `@ts-nocheck` | 0 | Clean |
| `as any` | 248 | Needs work |
| Expo version mismatches | 1 (lottie-react-native) | Minor |
| Total TS/TSX files | 431 | — |
| Total lines of code | 116,220 | — |
| Files > 500 lines | 57 | High (13% of files) |
| Files > 1,000 lines | 13 | Critical decomposition needed |
| Dead code | ~4,796 lines | 4.1% of codebase |

---

## Auth & Security Summary

| Check | Status | Notes |
|-------|--------|-------|
| Token storage | SecureStore | Correct — `expo-secure-store` for auth tokens |
| Session management | Better Auth cookies | 90-day sessions with 24h sliding expiry |
| Hardcoded secrets | None found | All secrets via `EXPO_PUBLIC_*` or `process.env.*` |
| Admin unlock | Env var | `EXPO_PUBLIC_ADMIN_UNLOCK_CODE` — not hardcoded, but `EXPO_PUBLIC_` prefix means it's bundled into the JS. Determined attacker could extract it from the app binary. |
| WebView/XSS | No WebView usage | Uses `expo-web-browser` for external links (safe) |
| Error boundary | Mounted at root | `_layout.tsx:1315` wraps entire app |
| Sentry | **Disabled** | No-op stub at `_layout.tsx:54-55` |
| Network detection | Active | `@react-native-community/netinfo` with global online status |

---

## Platform Parity Summary

| Feature | iOS | Android | Gap |
|---------|-----|---------|-----|
| Auth (email/password) | Yes | Yes | None |
| Apple Sign-In | Yes | No | Expected — dynamically loaded |
| EAS build profile | Complete | **Missing** | No android key in any profile |
| Paywall / IAP | Yes | **Blocked** | `paywall.tsx:274` returns early on non-iOS |
| Promo code redemption | App Store link | Functional | Uses `Linking.openURL` (cross-platform) |
| Date/time pickers | Native iOS | **Missing** | `create-event-request.tsx` gates 4 pickers to iOS only |
| Subscription management | App Store link | Generic link | Functional |
| LayoutAnimation | Reanimated | `UIManager.setLayout...` | Works but deprecated |
| Push notifications | Yes | Untested | Expo Push is cross-platform but no Android testing evidence |

---

## Recommended Fix Order

1. **Re-enable crash reporting** (C1) — Currently flying blind in production. Even a PostHog error capture is better than nothing. Immediate ROI for debugging.

2. **Commit the `f_webp` Cloudinary fix** (C3) — Blank images on Discover/event detail is a visible P0 bug affecting all users.

3. **Add Android EAS build profile** (C2) — Blocks any Android release. Copy the iOS profile and adjust for Android-specific settings.

4. **Delete dead code** (I1) — Quick win: remove 4,796 lines, reduce cognitive load and bundle size. Low risk, high clarity gain.

5. **Fix Android paywall gate** (W7) and **date picker gaps** (W6) — Unblocks Android as a viable platform.

6. **Generate typed routes** (W1) — Eliminates 93 `as any` casts in one shot. `npx expo customize` or maintain a route type file.

7. **Decompose the top 5 monster files** (I2) — `circle/[id].tsx`, `event/[id].tsx`, `social.tsx`, `calendar.tsx`, `welcome.tsx`. Extract sub-components.

8. **Consolidate query keys** (W4/I4) — Move all ad-hoc `["friends"]`, `["referralStats"]` etc. into key factories. Prevents stale data bugs.

9. **Type the Event interface completely** (I5) — Add `cardColor`, `groupVisibility`, `isWork`, `showGuestList`, `showGuestCount` to the frontend Event type. Eliminates 26 `as any` casts.

10. **Add critical path tests** (C4) — Auth flow, RSVP mutation, event creation. Start small, grow incrementally.

11. **Type the auth client** (W5) — Define `ApiError` type, replace 18 `as any` casts in security-critical code.

12. **Fix `profile.tsx` loading states** (C5) — Add `isPending` guards to prevent flash of undefined data.

---

<!-- END AUDIT_REPORT.md — Generated 2026-04-06 by Claude Code -->
