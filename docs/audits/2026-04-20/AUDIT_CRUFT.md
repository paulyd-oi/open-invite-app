# Cruft Audit — Open Invite v1.0.9 → v1.2.2

**Date:** 2026-04-20
**Scope:** Dead code, abandoned experiments, copy/config drift
**Method:** Automated grep + manual verification of every claim

---

## Summary

| Category | Count |
|----------|-------|
| Dead items (orphan files, dead flags, dead code) | **46** |
| Copy drift items (wrong numbers, stale text, missing features) | **19** |
| "3 max" residue hits | **4** |
| **Total actionable items** | **69** |

---

## 1. Theme Sprawl

**Actual counts (verified):**
- Free themes (BASIC_THEME_IDS): **5** — `neutral`, `chill_hang`, `dinner_night`, `game_night`, `worship_night`
- Premium themes (PREMIUM_THEME_IDS): **36** — Waves A/B/C including 11 Lottie animated backgrounds
- Total: **41** (42 with `custom` sentinel in ALLOWED_THEME_IDS)
- Frontend and backend PREMIUM_THEME_IDS arrays are **in sync** (both 36)

### 1a. Theme Count Mismatches (every reference to theme counts is wrong)

| # | File | Line | Claims | Actual | Severity |
|---|------|------|--------|--------|----------|
| 1 | `src/lib/eventThemes.ts` | 4 | "5 free + 21 premium" (header comment) | 5 + 36 | LOW (comment) |
| 2 | `shared/contracts.ts` | 172 | "5 free + 25 premium" (comment) | 5 + 36 | LOW (comment) |
| 3 | `src/app/paywall.tsx` | 295 | proValue: "25 premium" | 36 premium | **CRITICAL** (user-facing) |
| 4 | `src/app/subscription.tsx` | 362 | proValue: "All 30" | All 41 | **CRITICAL** (user-facing) |
| 5 | `src/app/help-faq.tsx` | 592 | "Choose from 38 themes" | 41 themes | **CRITICAL** (user-facing) |
| 6 | `src/app/help-faq.tsx` | 595 | "33 premium themes" | 36 premium | **CRITICAL** (user-facing) |
| 7 | `src/app/help-faq.tsx` | 646 | "Pro: 33 premium themes" | 36 premium | **CRITICAL** (user-facing) |
| 8 | `src/components/paywall/PremiumUpsellSheet.tsx` | 34 | JSDoc: "Unlock all 25 premium themes" | 36 | LOW (comment) |
| 9 | `README.md` | 777 | "25 premium themes" | 36 premium | MEDIUM (docs) |
| 10 | `docs/CODEBASE_MAP.md` | 42 | "5 free + 25 premium" | 5 + 36 | MEDIUM (docs) |
| 11 | `docs/CODEBASE_MAP.md` | 313 | "5 free + 25 premium" | 5 + 36 | MEDIUM (docs) |
| 12 | `docs/FEATURES_REFERENCE.md` | 58 | "25 premium" | 36 | MEDIUM (docs) |
| 13 | `docs/SYSTEMS/theme-effects.md` | 10 | "30 total: 5 free + 25 premium" | 41 total | MEDIUM (docs) |
| 14 | `docs/SYSTEMS/polish-regressions-sprint.md` | 229 | "25 premium themes, 5 free" | 36 premium | MEDIUM (docs) |

### 1b. Themes Defined but Never Referenced

None found. All 41 themes are used via `EVENT_THEMES` map and rendered in ThemeTray/ThemePicker.

### 1c. Themes Referenced but Never Defined

None found. All theme IDs in ALLOWED_THEME_IDS have matching entries in EVENT_THEMES.

### 1d. Paywall Logic vs 5/25 Split

The paywall gates on `isPremiumTheme()` which checks `PREMIUM_THEME_IDS.includes(id)` — this is correct for the actual 5/36 split. The gating logic itself is sound; only the **copy** is wrong.

### 1e. Profile Surface Support Gap

17 premium themes have NO `surfaces` property (event-only by default). The remaining 19 premium themes explicitly declare `surfaces: ["event", "profile"]`. This is not a bug per se but should be explicitly annotated with `surfaces: ["event"]` if intentional.

Missing surfaces: `game_day`, `spring_brunch`, `easter`, `luau`, `fourth_of_july`, `new_years_eve`, `tropical_flower`, `autumn_vibes`, `midnight_wave`, `snowfall`, `floral_garden`, `neon_glow`, `sunset_glow`, `bubblegum`, `crimson_tide`, `magenta_night`, `purple_haze`

---

## 2. Effect Sprawl (MotifOverlay)

**Definition file:** `src/components/create/MotifOverlay.tsx`
**Total effects:** 18 (13 particle + 5 Lottie)

### 2a. Effects Defined vs Used

All 18 effects are referenced in MOTIF_CATEGORIES and rendered in EffectTray. No orphaned or undefined effects.

### 2b. Gating

ALL 18 effects show crown badge for free users (`EffectTray.tsx:352`). Backend gate-on-save enforces premium_required for all effects. No free effects exist.

### 2c. Issues

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| 15 | `src/components/create/MotifOverlay.tsx` | 354-362 | `balloons` defined as Lottie effect but NOT in ANIMATED_PRESETS tab; `scene_balloons` (line 463-470) reuses same animation file | LOW (UI confusion) |
| 16 | `src/components/create/EffectTray.tsx` | 123-125 | `onPremiumPreview` and `onStudioGate` callback props defined but never passed from create.tsx | MEDIUM (dead props) |

---

## 3. "3 Max" Residue

Product is now unlimited hosting for free users. Every reference to event limits is a bug.

| # | File | Line | Text | Severity |
|---|------|------|------|----------|
| 17 | `src/lib/freemiumLimits.ts` | 20 | `maxActiveEvents: 5` (DEPRECATED file, but stale constant still exported) | MEDIUM |
| 18 | `src/app/settings.tsx` | 1289 | `"3 events from friends this week"` (DEV-only fake notification body) | LOW |
| 19 | `docs/FINDINGS_LOG.md` | 908 | `"Host up to 3 events per month"` (stale historical log) | LOW (docs) |
| 20 | `docs/FINDINGS_LOG.md` | 912-913 | `"Free: Host up to 3 events per 30-day rolling window"` (stale log) | LOW (docs) |

**Note:** `src/lib/freemiumLimits.ts` is marked DEPRECATED (lines 5-11) but still exports `FREE_TIER_LIMITS.maxActiveEvents: 5` and `FREE_TIER_LIMITS.maxCircles: 2`. The actual SSOT (`useSubscription.ts:15`) correctly says `maxActiveEvents: Infinity`. The file still has 6 active import sites for `REFERRAL_TIERS` only, but the stale limit constants remain exported.

---

## 4. FAQ + Settings Copy Drift

### 4a. FAQ Outdated Items

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| 21 | `src/app/help-faq.tsx` | 561-569 | Phone Number feature still documented but removed from settings (`settings.tsx:992` says "REMOVED - feature deprecated") | MEDIUM |
| 22 | `src/app/help-faq.tsx` | 592 | "38 themes" → actual 41 | **CRITICAL** |
| 23 | `src/app/help-faq.tsx` | 595 | "33 premium" → actual 36 | **CRITICAL** |
| 24 | `src/app/help-faq.tsx` | 646 | "33 premium" → actual 36 | **CRITICAL** |

### 4b. Paywall / Subscription Copy Drift

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| 25 | `src/app/paywall.tsx` | 295 | "25 premium" → actual 36 | **CRITICAL** |
| 26 | `src/app/paywall.tsx` | 304 | Circles "2 max" shown but backend does NOT enforce limit | HIGH (misleading) |
| 27 | `src/app/paywall.tsx` | 310 | Who's Free "7 days / 90 days" shown but backend does NOT enforce | HIGH (misleading) |
| 28 | `src/app/paywall.tsx` | 285-313 | Missing: Profile Themes, Card Color not in feature comparison | HIGH (underselling) |
| 29 | `src/app/subscription.tsx` | 362 | "All 30" → actual 41 | **CRITICAL** |
| 30 | `src/components/settings/SettingsSubscriptionSection.tsx` | 54 | "5 basic themes" incomplete — no mention of card color, profile themes | MEDIUM |

### 4c. Cross-Screen Inconsistencies

Three different theme counts across three user-facing screens:
- Paywall: "25 premium"
- Subscription: "All 30"
- FAQ: "33 premium" / "38 total"
- Actual: **36 premium** / **41 total**

---

## 5. Feature Flags

### 5a. Hardcoded-OFF Flags (Candidates for Deletion)

| # | File | Line | Flag | Status |
|---|------|------|------|--------|
| 31 | `src/app/circle/[id].tsx` | 2017 | `POLLS_ENABLED = false` | Dead code — poll UI strip never renders |
| 32 | `src/lib/devFlags.ts` | 18 | `DEV_PROBES_ENABLED = __DEV__ && false` | Always false even in dev |
| 33 | `src/lib/devFlags.ts` | 27 | `DEV_OVERLAYS_VISIBLE = __DEV__ && false` | Always false even in dev |
| 34 | `src/lib/features.ts` | 7 | `FEATURES = { reserved: false }` | Entire file unused (see orphans section) |

### 5b. Env-Gated Features (Active, Properly Gated)

All `__DEV__` branches are tree-shaken from production. Dual-gated features (`__DEV__ && env`) properly default OFF.

| Flag | File | Status |
|------|------|--------|
| `EXPO_PUBLIC_REALTIME_WS` | `src/lib/realtime/realtimeConfig.ts:14` | Default OFF — WebSocket not yet in prod |
| `EXPO_PUBLIC_DEV_STRESS_*` | `src/lib/devStress.ts` | Chaos testing harness, all OFF by default |
| `EXPO_PUBLIC_DEV_TOOLS` | `src/lib/devToolsGate.tsx:23` | Prod dev tools gate |
| `EXPO_PUBLIC_AUTH_DEBUG` | `src/lib/authClient.ts:69` | Dual-gated auth tracing |

### 5c. Hardcoded Developer Email

| # | File | Line | Issue |
|---|------|------|-------|
| 35 | `src/app/settings.tsx` | 425 | Admin bypass checks `pauljdal@gmail.com` directly in `__DEV__` block — not a prod risk but should use env var |

---

## 6. Orphan Files

Files imported by NOTHING in the codebase (verified via grep). Excludes route files (auto-routed by Expo Router) and `__DEV__`-gated dynamic requires.

### 6a. Orphan Components (22 files)

| # | File | Notes |
|---|------|-------|
| 36 | `src/components/AnimatedButton.tsx` | |
| 37 | `src/components/AnimatedCard.tsx` | |
| 38 | `src/components/DayInsightCard.tsx` | |
| 39 | `src/components/FriendCard.tsx` | |
| 40 | `src/components/HeroBannerSurface.tsx` | |
| 41 | `src/components/MiniCalendar.tsx` | |
| 42 | `src/components/MonthlyRecap.tsx` | |
| 43 | `src/components/MutualFriends.tsx` | |
| 44 | `src/components/Skeleton.tsx` | Superseded by SkeletonLoader.tsx |
| 45 | `src/components/Themed.tsx` | |
| 46 | `src/components/create/SettingsSheetContent.tsx` | |
| 47 | `src/components/event/EditPhotoButton.tsx` | |
| 48 | `src/components/event/EventHeroBackdrop.tsx` | |
| 49 | `src/components/event/FindFriendsNudge.tsx` | |
| 50 | `src/components/event/HostToolsRow.tsx` | |
| 51 | `src/components/event/PostCreateNudge.tsx` | |
| 52 | `src/components/event/RsvpButtonGroup.tsx` | |
| 53 | `src/components/event/RsvpStatusDisplay.tsx` | |
| 54 | `src/components/event/RsvpSuccessPrompt.tsx` | |
| 55 | `src/components/notifications/NotificationNudgeModal.tsx` | |
| 56 | `src/components/settings/SettingsEditProfileSection.tsx` | |
| 57 | `src/components/settings/SettingsProfileAppearanceSection.tsx` | |

### 6b. Orphan Hooks (3 files)

| # | File | Notes |
|---|------|-------|
| 58 | `src/hooks/usePressMotion.ts` | |
| 59 | `src/hooks/useSuggestionsFeed.ts` | |
| 60 | `src/hooks/useVerificationGate.ts` | |

### 6c. Orphan Library Utilities (10 files)

| # | File | Notes |
|---|------|-------|
| 61 | `src/lib/activeProfileContext.tsx` | |
| 62 | `src/lib/apiContractInvariant.ts` | |
| 63 | `src/lib/cn.ts` | Classic className merge utility — zero imports |
| 64 | `src/lib/devToastFilter.ts` | |
| 65 | `src/lib/devToolsGate.tsx` | Exports `isDevToolsEnabled()` but nothing imports it |
| 66 | `src/lib/features.ts` | Feature flag system with single `reserved: false` — zero imports |
| 67 | `src/lib/posthogClient.ts` | Superseded by `posthogSSOT.ts` |
| 68 | `src/lib/push/registerPush.ts` | |
| 69 | `src/lib/validation.ts` | |

### 6d. Orphan UI Primitives (2 files)

| # | File | Notes |
|---|------|-------|
| 70 | `src/ui/IconButton.tsx` | |
| 71 | `src/ui/Tile.tsx` | |

### 6e. NOT Orphans (False Positives Excluded)

- `src/dev/LiveRefreshProofOverlay.tsx` — dynamically required in `_layout.tsx` via `__DEV__` guard
- `src/dev/QueryDebugOverlay.tsx` — dynamically required in `_layout.tsx` via `__DEV__` guard

---

## 7. cardColor Type Audit

### 7a. Schema Definitions

| File | Line | Schema | Type |
|------|------|--------|------|
| `shared/contracts.ts` | 96 | `eventSchema.cardColor` | `z.string().nullable().optional()` — **NO** `.max(9)` |
| `shared/contracts.ts` | 374 | `createEventRequestSchema.cardColor` | `z.string().max(9).nullable().optional()` |
| `shared/contracts.ts` | 811 | `getProfileResponseSchema.profileCardColor` | `z.string().nullable().optional()` — comment says "max 9" but **NO** `.max(9)` |
| `shared/contracts.ts` | 868 | `updateProfileRequestSchema.profileCardColor` | `z.string().max(9).optional().nullable()` |
| `shared/contracts.ts` | 885 | `updateProfileResponseSchema.profileCardColor` | `z.string().nullable().optional()` — **NO** `.max(9)` |

### 7b. Issues

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| 72 | `shared/contracts.ts` | 96 | Event response schema missing `.max(9)` while request has it | MEDIUM |
| 73 | `shared/contracts.ts` | 811 | Comment says "max 9 chars" but schema lacks `.max(9)` | MEDIUM |
| 74 | `shared/contracts.ts` | 885 | Profile update response missing `.max(9)` | MEDIUM |

### 7c. Null Safety

All reads are properly guarded: `cardColor ?? undefined`, `cardColor ? ... : null`, `event?.cardColor ?? null`. No unguarded dereferences found. Default fallback is `#FFFDF5` in `CardColorPicker.tsx:16`.

---

## 8. RevenueCat Offering ID References

### 8a. Constants (SSOT)

| Constant | Value | File | Line |
|----------|-------|------|------|
| `REVENUECAT_OFFERING_ID` | `"default"` | `src/lib/revenuecatClient.ts` | 40 |
| `REVENUECAT_ENTITLEMENT_ID` | `"premium"` | `src/lib/revenuecatClient.ts` | 47 |
| `RC_PACKAGE_ANNUAL` | `"$rc_annual"` | `src/lib/revenuecatClient.ts` | 53 |
| `RC_PACKAGE_MONTHLY` | `"$rc_monthly"` | `src/lib/revenuecatClient.ts` | 54 |
| `RC_PACKAGE_LIFETIME` | `"$rc_lifetime"` | `src/lib/revenuecatClient.ts` | 55 |

### 8b. Consistency

All references use exported constants. No hardcoded `"founder_pro_v1"` or `"premium"` (as offering ID) found. No mismatches between files. RevenueCat implementation is **clean**.

---

## Codebase Map — All Dead/Drifted Items

### Dead Items (N = 46)

| # | Type | File:Line | Description |
|---|------|-----------|-------------|
| 1 | Dead flag | `src/app/circle/[id].tsx:2017` | `POLLS_ENABLED = false` — dead poll UI |
| 2 | Dead flag | `src/lib/devFlags.ts:18` | `DEV_PROBES_ENABLED = __DEV__ && false` |
| 3 | Dead flag | `src/lib/devFlags.ts:27` | `DEV_OVERLAYS_VISIBLE = __DEV__ && false` |
| 4 | Dead props | `src/components/create/EffectTray.tsx:123-125` | `onPremiumPreview`, `onStudioGate` never passed |
| 5 | Orphan | `src/components/AnimatedButton.tsx` | No imports |
| 6 | Orphan | `src/components/AnimatedCard.tsx` | No imports |
| 7 | Orphan | `src/components/DayInsightCard.tsx` | No imports |
| 8 | Orphan | `src/components/FriendCard.tsx` | No imports |
| 9 | Orphan | `src/components/HeroBannerSurface.tsx` | No imports |
| 10 | Orphan | `src/components/MiniCalendar.tsx` | No imports |
| 11 | Orphan | `src/components/MonthlyRecap.tsx` | No imports |
| 12 | Orphan | `src/components/MutualFriends.tsx` | No imports |
| 13 | Orphan | `src/components/Skeleton.tsx` | Superseded by SkeletonLoader.tsx |
| 14 | Orphan | `src/components/Themed.tsx` | No imports |
| 15 | Orphan | `src/components/create/SettingsSheetContent.tsx` | No imports |
| 16 | Orphan | `src/components/event/EditPhotoButton.tsx` | No imports |
| 17 | Orphan | `src/components/event/EventHeroBackdrop.tsx` | No imports |
| 18 | Orphan | `src/components/event/FindFriendsNudge.tsx` | No imports |
| 19 | Orphan | `src/components/event/HostToolsRow.tsx` | No imports |
| 20 | Orphan | `src/components/event/PostCreateNudge.tsx` | No imports |
| 21 | Orphan | `src/components/event/RsvpButtonGroup.tsx` | No imports |
| 22 | Orphan | `src/components/event/RsvpStatusDisplay.tsx` | No imports |
| 23 | Orphan | `src/components/event/RsvpSuccessPrompt.tsx` | No imports |
| 24 | Orphan | `src/components/notifications/NotificationNudgeModal.tsx` | No imports |
| 25 | Orphan | `src/components/settings/SettingsEditProfileSection.tsx` | No imports |
| 26 | Orphan | `src/components/settings/SettingsProfileAppearanceSection.tsx` | No imports |
| 27 | Orphan | `src/hooks/usePressMotion.ts` | No imports |
| 28 | Orphan | `src/hooks/useSuggestionsFeed.ts` | No imports |
| 29 | Orphan | `src/hooks/useVerificationGate.ts` | No imports |
| 30 | Orphan | `src/lib/activeProfileContext.tsx` | No imports |
| 31 | Orphan | `src/lib/apiContractInvariant.ts` | No imports |
| 32 | Orphan | `src/lib/cn.ts` | No imports |
| 33 | Orphan | `src/lib/devToastFilter.ts` | No imports |
| 34 | Orphan | `src/lib/devToolsGate.tsx` | No imports |
| 35 | Orphan | `src/lib/features.ts` | No imports (entire feature flag system unused) |
| 36 | Orphan | `src/lib/posthogClient.ts` | Superseded by posthogSSOT.ts |
| 37 | Orphan | `src/lib/push/registerPush.ts` | No imports |
| 38 | Orphan | `src/lib/validation.ts` | No imports |
| 39 | Orphan | `src/ui/IconButton.tsx` | No imports |
| 40 | Orphan | `src/ui/Tile.tsx` | No imports |
| 41 | Stale const | `src/lib/freemiumLimits.ts:20` | `maxActiveEvents: 5` exported but deprecated |
| 42 | Stale const | `src/lib/freemiumLimits.ts:28` | `maxCircles: 2` exported but deprecated |
| 43 | Stale copy | `src/app/settings.tsx:1289` | DEV-only "3 events" text |
| 44 | Stale docs | `docs/FINDINGS_LOG.md:908` | "Host up to 3 events per month" |
| 45 | Stale docs | `docs/FINDINGS_LOG.md:912-913` | "3 events per 30-day rolling window" |
| 46 | Duplicate effect | `src/components/create/MotifOverlay.tsx:354-362` | `balloons` uses same .json as `scene_balloons`, not in Animated tab |

### Copy Drift Items (M = 19)

| # | File:Line | What's Wrong | Correct Value |
|---|-----------|-------------|---------------|
| 1 | `src/app/paywall.tsx:295` | "25 premium" themes | 36 premium |
| 2 | `src/app/subscription.tsx:362` | "All 30" themes | All 41 |
| 3 | `src/app/help-faq.tsx:592` | "38 themes" | 41 themes |
| 4 | `src/app/help-faq.tsx:595` | "33 premium" | 36 premium |
| 5 | `src/app/help-faq.tsx:646` | "33 premium" | 36 premium |
| 6 | `src/app/help-faq.tsx:561-569` | Phone Number feature documented | Feature removed from settings |
| 7 | `src/app/paywall.tsx:304` | Circles "2 max" displayed | Backend does NOT enforce |
| 8 | `src/app/paywall.tsx:310` | Who's Free "7/90 days" displayed | Backend does NOT enforce |
| 9 | `src/app/paywall.tsx:285-313` | Missing Profile Themes row | Should list free/pro split |
| 10 | `src/app/paywall.tsx:285-313` | Missing Card Color row | Should be listed |
| 11 | `src/lib/eventThemes.ts:4` | Header: "21 premium" | 36 premium |
| 12 | `shared/contracts.ts:172` | Comment: "5 free + 25 premium" | 5 + 36 |
| 13 | `src/components/paywall/PremiumUpsellSheet.tsx:34` | JSDoc: "25 premium" | 36 |
| 14 | `README.md:777` | "25 premium themes" | 36 |
| 15 | `docs/CODEBASE_MAP.md:42` | "5 free + 25 premium" | 5 + 36 |
| 16 | `docs/CODEBASE_MAP.md:313` | "5 free + 25 premium" | 5 + 36 |
| 17 | `docs/FEATURES_REFERENCE.md:58` | "25 premium" | 36 |
| 18 | `docs/SYSTEMS/theme-effects.md:10` | "30 total: 5 free + 25 premium" | 41 total |
| 19 | `docs/SYSTEMS/polish-regressions-sprint.md:229` | "25 premium themes, 5 free" | 36 premium |

### "3 Max" Residue (K = 4)

| # | File:Line | Text | Severity |
|---|-----------|------|----------|
| 1 | `src/lib/freemiumLimits.ts:20` | `maxActiveEvents: 5` (deprecated but exported) | MEDIUM |
| 2 | `src/app/settings.tsx:1289` | "3 events from friends this week" (DEV-only) | LOW |
| 3 | `docs/FINDINGS_LOG.md:908` | "Host up to 3 events per month" | LOW |
| 4 | `docs/FINDINGS_LOG.md:912-913` | "Free: Host up to 3 events per 30-day rolling window" | LOW |

---

## Proof

```
git diff --name-only
# Expected: only AUDIT_CRUFT.md (new file)
```

Final counts: **46 dead items, 19 copy drift items, 4 "3 max" residue hits = 69 total actionable items.**
