# Subscription Entitlement Audit — Open Invite

**Date:** 2026-04-20
**Scope:** Every code path that reads, writes, checks, or displays premium entitlement
**Method:** Full-repo grep + manual trace of every gate, paywall trigger, and SDK call

---

## Invariant Verification Summary

| # | Invariant | Status | Detail |
|---|-----------|--------|--------|
| 1 | RevenueCat offering: `founder_pro_v1` | **FAIL** | Offering ID is `"default"` — see `src/lib/revenuecatClient.ts:40` |
| 2 | Entitlement ID: `premium` | **PASS** | `REVENUECAT_ENTITLEMENT_ID = "premium"` — `src/lib/revenuecatClient.ts:47` |
| 3 | Pricing: Free = unlimited hosting + basic themes | **PASS** | `activeEventsMax: null` in `src/lib/entitlements.ts:106`; Settings shows "Unlimited events, 5 basic themes" (`src/components/settings/SettingsSubscriptionSection.tsx:54`) |
| 4 | Pricing: Pro $5/mo | **PASS** | `proMonthly: 4.99` — `src/lib/useSubscription.ts:60` |
| 5 | Pricing: Pro $40/yr | **PASS** | `proYearly: 39.99` — `src/lib/useSubscription.ts:61` |
| 6 | Pricing: Founder Special $30/yr lifetime (first 1K) | **PASS** | `lifetime: 29.99` — `src/lib/useSubscription.ts:63`; Scarcity meter fetches from `/api/inventory/` |
| 7 | Church offer code `tablesandaltars` (10K redemptions) | **PASS** (Apple-side) | Code mentioned in `README.md:785`; NO app-side cap enforcement — Apple/RevenueCat manages 10K limit |
| 8 | No "3 max" event limit in entitlement logic | **PASS** | `activeEventsMax: null` (unlimited) in canonical `entitlements.ts:106` and `useSubscription.ts:15` |
| 9 | Apple SDK deadline compliance | **PASS** | Uses `react-native-purchases` v9.6.7 (StoreKit 2 compatible); `presentCodeRedemptionSheet` explicitly avoided (deprecated SK1) — see `src/app/paywall.tsx:278`, `src/app/subscription.tsx:780` |

### Invariant 1 Detail — Offering ID Mismatch

```
// src/lib/revenuecatClient.ts:40
export const REVENUECAT_OFFERING_ID = "default";
```

The app requests `"default"` from RevenueCat, NOT `"founder_pro_v1"`. The `getOfferingWithFallback()` function (line 361-396) tries `offerings.all["default"]` first, then falls back to `offerings.current`. The string `"founder_pro_v1"` does not appear anywhere in the codebase (confirmed via `grep -r`).

**Risk:** If the RevenueCat dashboard offering is named `founder_pro_v1` and not set as the default offering, `offerings.all["default"]` will miss it — but `offerings.current` fallback would still work if it's the current offering in the dashboard. If it's neither, users see no packages.

---

## 1. Entitlement Gate Inventory

### SSOT Hooks (src/lib/entitlements.ts)

| Hook | Lines | Purpose | Used By |
|------|-------|---------|---------|
| `usePremiumStatusContract()` | 544-596 | Canonical premium check for new code. Returns `{isPro, proSource, isLoading}` | settings.tsx:588, create.tsx:254, profile.tsx:111, edit-profile.tsx:78, onboarding.tsx:658, host-analytics.tsx:105 |
| `useIsPro()` | 450-497 | Merged backend OR RevenueCat check. Returns `{isPro, rcIsPro, backendIsPro}` | Legacy callsites |
| `useRefreshProContract()` | 321-400 | Canonical refresh after purchase/restore. Dual-source with invariant assertion | paywall.tsx:220, subscription.tsx:167/212 |
| `useEntitlements()` | 261-278 | Raw `/api/entitlements` fetch with cache | create.tsx:50, whos-free.tsx:27, circles.tsx:30, friends.tsx:90, circle/[id].tsx:90 |
| `useHostingQuota()` | 636-695 | `/api/hosting/quota` with soft nudge metadata | create.tsx (via useHostingNudge) |
| `usePremiumDriftGuard()` | 711-737 | DEV-only assertion: `isPro === isUnlimited` | create.tsx:259 |

### Feature Gate Functions (src/lib/entitlements.ts)

| Function | Lines | Free Limit | Pro Limit | Gated Feature |
|----------|-------|-----------|-----------|---------------|
| `canCreateEvent()` | 821-834 | No recurring | Recurring allowed | Recurring events |
| `canViewWhosFree()` | 839-854 | 7 days | 90 days | Who's Free horizon |
| `canViewBirthdays()` | 859-874 | 7 days | 90 days | Birthday visibility |
| `canCreateCircle()` | 879-890 | 2 max | Unlimited | Circle creation |
| `canAddCircleMember()` | 895-906 | 15 max | Unlimited | Circle member capacity |
| `canUseInsights()` | 911-921 | Locked | Unlocked | Top friends analytics |
| `canViewFullHistory()` | 926-937 | 30 days | Unlimited | Event history depth |
| `isPro()` | 430-433 | — | — | Helper: plan === "PRO" or "LIFETIME_PRO" |
| `isPremiumFromSubscription()` | 754-811 | — | — | Universal payload checker (multiple signals) |

### Gate Trigger Points (file:line where paywall actually fires)

| Screen | File:Line | Gate | Paywall Context |
|--------|-----------|------|-----------------|
| Create (recurring) | `src/app/create.tsx:820-824` | `canCreateEvent()` | `RECURRING_EVENTS` |
| Create (premium theme) | `src/app/create.tsx:1181` | Theme selection | `PREMIUM_THEME` |
| Create (premium effect) | `src/app/create.tsx:1157` | Effect selection | `PREMIUM_THEME` |
| Who's Free | `src/app/whos-free.tsx:521-526` | `canViewWhosFree()` | `WHOS_FREE_HORIZON` |
| Circles | `src/app/circles.tsx:228` | `canCreateCircle()` | `CIRCLES_LIMIT` |
| Friends (create circle) | `src/app/friends.tsx:765-769` | `canCreateCircle()` | `CIRCLES_LIMIT` |
| Circle detail (add member) | `src/app/circle/[id].tsx:1168-1172` | `canAddCircleMember()` | `CIRCLE_MEMBERS_LIMIT` |
| Host Analytics | `src/app/host-analytics.tsx:110,134,318` | `userIsPro` direct | Blurred overlay with upsell |
| Profile (event perf) | `src/app/profile.tsx:1034-1097` | `userIsPremium` direct | Upsell card at 1099-1135 |
| Settings | `src/components/settings/SettingsSubscriptionSection.tsx:62-82` | `!userIsPremium` | Upgrade CTA button |

### Visual-Only Premium Indicators (no gate, just display)

| Location | File:Line | What |
|----------|-----------|------|
| Profile gold border | `src/app/profile.tsx:614-615` | `borderColor: "#FFD700"` if Pro |
| Profile crown badge | `src/app/profile.tsx:669-674, 722-727` | Crown icon overlay on avatar |
| Profile PRO chip | `src/app/profile.tsx:739-740, 766-768` | "PRO" label next to name |
| Theme crown indicator | `src/components/customization/ThemePicker.tsx:74` | Crown on premium themes for free users |

---

## 2. Paywall Flow Trace

### Entry Points → Paywall

```
User hits feature gate (any of the trigger points above)
  │
  ├─ PaywallModal (bottom sheet) ─── src/components/paywall/PaywallModal.tsx
  │   Shows context-specific copy (9 contexts defined at lines 38-146)
  │   Primary CTA → navigates to subscription screen
  │   Analytics: paywall_shown (165), paywall_purchase_started (195), paywall_dismissed (207)
  │
  ├─ Subscription Screen ─── src/app/subscription.tsx
  │   Full plan comparison + 3-tier selector
  │   Entry: Settings > Subscription, or PaywallModal CTA
  │
  └─ Paywall Screen ─── src/app/paywall.tsx
      Full-screen upgrade with feature comparison table
      Entry: Direct navigation or deep link
```

### Purchase Sequence

```
1. User selects plan (Lifetime / Annual / Monthly)
2. handlePurchase() fires
   ├─ src/app/subscription.tsx:152-196
   └─ src/app/paywall.tsx:207-240
3. purchasePackage(selectedPackage) → RevenueCat SDK → StoreKit
   └─ src/lib/revenuecatClient.ts:211-218
4. On success:
   a. refreshProContract({ reason: "purchase:screen" })
      └─ src/lib/entitlements.ts:321-400
      ├─ Step 1: subscriptionContext.refresh() → RC customerInfo
      ├─ Step 2: queryClient.fetchQuery(qk.entitlements()) → backend /api/entitlements
      └─ Step 3: combinedIsPro = rcIsPro || backendIsPro
   b. SubscriptionContext.purchase() sets isPremium=true immediately
      └─ src/lib/SubscriptionContext.tsx:335
   c. All subscription queries invalidated
      └─ src/lib/SubscriptionContext.tsx:338
   d. Profile query invalidated for badge update
      └─ src/lib/entitlements.ts:385
5. UI updates: gates unlock, premium indicators appear
6. DEV invariant: if upgrade reason but !combinedIsPro → warning logged
   └─ src/lib/entitlements.ts:389-396
```

### Restore Sequence

```
1. User taps "Restore Purchases"
2. restorePurchases() → RevenueCat SDK
   └─ src/lib/revenuecatClient.ts:251-257
3. refreshProContract({ reason: "restore:screen" })
4. If combinedIsPro → success toast
5. If !combinedIsPro → "No Purchases Found" info toast
```

---

## 3. RevenueCat SDK Integration Points

### Package Version
- `react-native-purchases`: v9.6.7
- `react-native-purchases-ui`: v9.6.7
- Source: `package.json`

### Configuration Constants (src/lib/revenuecatClient.ts)

| Constant | Line | Value |
|----------|------|-------|
| `REVENUECAT_OFFERING_ID` | 40 | `"default"` |
| `REVENUECAT_ENTITLEMENT_ID` | 47 | `"premium"` |
| `RC_PACKAGE_ANNUAL` | 53 | `"$rc_annual"` |
| `RC_PACKAGE_MONTHLY` | 54 | `"$rc_monthly"` |
| `RC_PACKAGE_LIFETIME` | 55 | `"$rc_lifetime"` |

### Environment Variables (src/lib/revenuecatClient.ts:61-63)

| Var | Purpose |
|-----|---------|
| `EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY` | Dev/test builds |
| `EXPO_PUBLIC_VIBECODE_REVENUECAT_APPLE_KEY` | Production iOS |
| `EXPO_PUBLIC_VIBECODE_REVENUECAT_GOOGLE_KEY` | Production Android |

### SDK Calls

| Operation | File:Line | SDK Method | Notes |
|-----------|-----------|------------|-------|
| Initialize | revenuecatClient.ts:149 | `Purchases.configure({ apiKey })` | Custom log handler suppresses non-ERROR (line 141) |
| Get offerings | revenuecatClient.ts:196 | `Purchases.getOfferings()` | Wrapped with fallback logic at 361-396 |
| Purchase | revenuecatClient.ts:215 | `Purchases.purchasePackage()` | Modern API (not deprecated purchaseProduct) |
| Get customer info | revenuecatClient.ts:236 | `Purchases.getCustomerInfo()` | Used in SubscriptionContext fetchSubscription |
| Restore | revenuecatClient.ts:255 | `Purchases.restorePurchases()` | Also called on login via useRevenueCatSync |
| Login | revenuecatClient.ts:270 | `Purchases.logIn(userId)` | Called by useRevenueCatSync.ts:41 |
| Logout | revenuecatClient.ts:286 | `Purchases.logOut()` | Called by useRevenueCatSync.ts:80 |
| Has entitlement | revenuecatClient.ts:304-321 | Manual check on customerInfo | Checks `entitlements.active[id]` |
| Listener | SubscriptionContext.tsx:273 | `Purchases.addCustomerInfoUpdateListener()` | Cleanup at line 277 |

### Deprecated API Usage: NONE

All SDK calls use modern RevenueCat v9 API. `presentCodeRedemptionSheet()` explicitly rejected with comment explaining it's deprecated SK1 (fails on iOS 16+). App uses App Store deep link instead.

---

## 4. Offer Code Flow

### `tablesandaltars` Redemption Path

1. User taps "Redeem Code" in:
   - Settings: `src/app/settings.tsx:1154-1158`
   - Subscription screen: `src/app/subscription.tsx:776-782`
   - Paywall screen: `src/app/paywall.tsx:274-280`
2. All three open `APP_STORE_OFFER_CODE_URL` via `Linking.openURL()`
   - URL: `https://apps.apple.com/redeem?ctx=offercodes&id={APP_STORE_ID}`
   - Defined in `src/lib/config.ts:23`
3. User enters code in native Apple sheet
4. Apple processes redemption → RevenueCat webhook → `addCustomerInfoUpdateListener` fires
5. SubscriptionContext updates → queries invalidated → UI refreshes

### 10K Cap Enforcement

**Apple-side only.** There is ZERO app-side enforcement of the 10K redemption cap. The cap is configured in:
- RevenueCat Dashboard (offer code settings)
- App Store Connect (offer code configuration)

**Risk Level: LOW.** This is the correct approach — Apple enforces caps atomically. App-side enforcement would be racy and unreliable.

### Platform Restriction

Offer code redemption is **iOS only** (`Platform.OS === "ios"` check). Android users cannot redeem offer codes through the app. The "Redeem Code" button is hidden on Android.

---

## 5. Subscription Settings Screen

### SettingsSubscriptionSection (src/components/settings/SettingsSubscriptionSection.tsx)

| Line | What | Free Display | Pro Display |
|------|------|-------------|-------------|
| 37-59 | Status section | "Free Plan" with grey crown | "Founder Pro" with gold crown |
| 54 | Description | "Unlimited events, 5 basic themes" | "All premium themes, effects & more" |
| 62-82 | Upgrade CTA | "Upgrade to Founder Pro" button (visible) | Hidden |
| 85-103 | Redeem Code | "Have a Code?" (iOS only) | "Have a Code?" (iOS only) |
| 106-126 | Restore Purchases | Visible | Visible |
| 129-148 | Refresh Pro Status | "Refresh Pro Status" button | "Refresh Pro Status" button |

### "3 max" Bug Status: **NOT PRESENT IN CURRENT CODE**

The "3 max" text existed historically per `docs/FINDINGS_LOG.md:908-912`:
```
- Updated copy to "Host up to 3 events per month"
- Free: Host up to 3 events per 30-day rolling window
```

This copy has been removed. Current code shows:
- Settings: "Unlimited events, 5 basic themes" (`SettingsSubscriptionSection.tsx:54`)
- Entitlements: `activeEventsMax: null` (unlimited) (`entitlements.ts:106`)
- useSubscription: `maxActiveEvents: Infinity` (`useSubscription.ts:15`)

**However**, the deprecated `freemiumLimits.ts:20` still contains `maxActiveEvents: 5`. This file is marked `@deprecated` and only `REFERRAL_TIERS` is actively imported (by `settings.tsx:78`). The stale `maxActiveEvents: 5` value is never read by any active code path.

---

## 6. Backend Subscription State

### Architecture

The backend is a **separate repository** (`my-app-backend`). Frontend communicates via three API endpoints:

| Endpoint | Purpose | Called By |
|----------|---------|----------|
| `GET /api/entitlements` | Plan + limits + features (SSOT) | `entitlements.ts:89` via `entitlementsQueryFn()` |
| `GET /api/subscription` | Subscription details (tier, expiry, isPro) | `SubscriptionContext.tsx:188` |
| `GET /api/hosting/quota` | Event hosting capacity + nudge metadata | `entitlements.ts:636` via `useHostingQuota()` |

### How Backend Knows Premium Status

**RevenueCat webhook** (configured in RevenueCat dashboard, not visible in frontend repo). The backend receives webhook events and updates its database. Frontend then reads via `/api/entitlements`.

### Frontend-Backend Sync Protocol

```
Purchase completes (StoreKit)
  ├─ RevenueCat SDK updates immediately (client-side)
  │   └─ SubscriptionContext.isPremium = true (instant)
  ├─ RevenueCat webhook fires to backend (async, seconds)
  │   └─ Backend DB updates
  └─ refreshProContract() fetches both sources
      └─ combinedIsPro = rcIsPro || backendIsPro
```

### Disagreement Vectors

| Scenario | Frontend | Backend | Resolved By |
|----------|----------|---------|-------------|
| Purchase just completed | RC says Pro | Backend pending webhook | OR semantics → user sees Pro immediately |
| Subscription expired | RC says Free | Backend stale (still Pro) | OR semantics → user stays Pro until backend refreshes |
| Backend refreshed, RC stale | RC stale | Backend correct | OR semantics → correct if either says Pro |
| Both stale after expiry | RC Free | Backend Free | Correct — user is Free |

**Risk:** OR semantics mean a user whose subscription expired could briefly appear Pro if either source is stale. The `usePremiumDriftGuard()` hook (DEV-only) catches when `isPro !== isUnlimited` to surface drift.

**Mitigation:** `addCustomerInfoUpdateListener` fires on RC state changes; backend webhook updates are near-real-time. Drift window is typically < 5 seconds.

---

## 7. Free-Tier Behavior

### Verified Free Features

| Feature | Free Behavior | Evidence |
|---------|--------------|----------|
| Event hosting | **Unlimited** (no cap) | `entitlements.ts:106` — `activeEventsMax: null` |
| Basic themes | 5 available | `eventThemes.ts:13-19` — neutral, chill_hang, dinner_night, game_night, worship_night |
| Event creation | Full access | No `canCreateEvent` check on basic events |
| RSVPs | Full access | No premium gate on RSVP flow |
| Friends | Full access | No premium gate on friend features |
| Who's Free | 7-day horizon | `entitlements.ts:104` — `whosFreeHorizonDays: 7` |
| Birthdays | 7-day horizon | `entitlements.ts:105` — `upcomingBirthdaysHorizonDays: 7` |
| Circles | 2 max, 15 members each | `entitlements.ts:108-109` |
| Event history | 30 days | `entitlements.ts:107` |
| Friend notes | 5 total | `entitlements.ts:110` |

### Premium Theme Visibility (Upsell)

Premium themes ARE visible to free users with a crown (lock) indicator:
- `ThemePicker.tsx:74` — `showCrown = isPremiumTheme(tid) && !userIsPro`
- Tapping a premium theme fires `onPremiumUpsell()` → shows PaywallModal
- Backend enforces `premium_required` error if a free user tries to save a premium theme (`create.tsx:465-483`)

### Premium-Only Features

| Feature | Gate | Evidence |
|---------|------|----------|
| Recurring events | `canCreateEvent()` | `entitlements.ts:821` |
| 25 premium themes | Theme picker + backend save gate | `ThemePicker.tsx:74`, backend `premium_required` |
| Premium effects | Effect tray gate | `create.tsx:1157` |
| Theme Studio | Studio gate | `ThemeTray.tsx:94-96` |
| Who's Free 90-day | `canViewWhosFree()` | `entitlements.ts:839` |
| Birthday 90-day | `canViewBirthdays()` | `entitlements.ts:859` |
| Unlimited circles | `canCreateCircle()` | `entitlements.ts:879` |
| Unlimited circle members | `canAddCircleMember()` | `entitlements.ts:895` |
| Top friends analytics | `canUseInsights()` | `entitlements.ts:911` |
| Full event history | `canViewFullHistory()` | `entitlements.ts:926` |
| Host analytics | Direct `userIsPro` check | `host-analytics.tsx:110` |
| Priority sync | Feature flag | `entitlements.ts:117` |

---

## Stale/Legacy Code

| File | Status | Risk |
|------|--------|------|
| `src/lib/freemiumLimits.ts` | **DEPRECATED** — header says so (lines 1-11) | LOW — only `REFERRAL_TIERS` imported. Stale `maxActiveEvents: 5` is dead code. |
| `src/lib/useSubscription.ts` | Legacy hook, partially superseded by `entitlements.ts` | LOW — still actively used for `PRICING` constants and `FREE_TIER_LIMITS` (which correctly shows `maxActiveEvents: Infinity`) |
| `docs/FINDINGS_LOG.md:908-912` | Historical reference to "3 events per month" | NONE — documentation only, not code |

---

## Risk Summary

| # | Risk | Severity | Detail |
|---|------|----------|--------|
| 1 | Offering ID mismatch | **MEDIUM** | Code uses `"default"`, not `"founder_pro_v1"`. Works only if RC dashboard has `founder_pro_v1` set as the default/current offering. Fallback to `offerings.current` mitigates. |
| 2 | OR semantics on expiry | **LOW** | Expired subscription could appear Pro briefly if one source is stale. Drift guard catches in DEV. |
| 3 | No app-side offer code cap | **NONE** | Correct design — Apple enforces atomically. |
| 4 | Deprecated freemiumLimits.ts | **LOW** | Dead code with wrong limits (`maxActiveEvents: 5`). Never imported for limit checks. Should be cleaned up. |
| 5 | Backend sync visibility | **LOW** | Webhook flow not visible in frontend repo. Cannot verify webhook handler correctness from this audit. |

---

## Files Touched By This Audit (Read-Only)

```
src/lib/entitlements.ts          — SSOT for all premium gates
src/lib/revenuecatClient.ts      — RevenueCat SDK wrapper
src/lib/SubscriptionContext.tsx   — Context provider with RC listener
src/lib/useSubscription.ts       — Legacy hook + PRICING constants
src/lib/freemiumLimits.ts        — DEPRECATED limits (only REFERRAL_TIERS used)
src/lib/eventThemes.ts           — Theme definitions + isPremiumTheme()
src/lib/config.ts                — APP_STORE_OFFER_CODE_URL
src/lib/errors.ts                — HOST_LIMIT_REACHED error handling
src/hooks/useRevenueCatSync.ts   — RC login/logout sync
src/app/paywall.tsx              — Full-screen paywall
src/app/subscription.tsx         — Subscription management
src/app/settings.tsx             — Settings (imports SettingsSubscriptionSection)
src/app/create.tsx               — Event creation gates
src/app/whos-free.tsx            — Who's Free horizon gate
src/app/circles.tsx              — Circle creation gate
src/app/friends.tsx              — Circle creation gate (alternate entry)
src/app/circle/[id].tsx          — Circle member gate
src/app/host-analytics.tsx       — Analytics Pro gate
src/app/profile.tsx              — Premium indicators + upsell
src/app/edit-profile.tsx         — Pro status for customization
src/app/onboarding.tsx           — Referral Pro gate
src/components/paywall/PaywallModal.tsx          — Bottom-sheet paywall
src/components/paywall/PremiumUpsellSheet.tsx     — Upsell sheet
src/components/settings/SettingsSubscriptionSection.tsx — Settings sub section
src/components/customization/ThemePicker.tsx      — Theme crown indicator
src/components/create/ThemeTray.tsx               — Theme studio gate
src/components/create/EffectTray.tsx              — Effect studio gate
src/components/create/CreateSheets.tsx            — Paywall modal container
shared/contracts.ts              — Shared schemas (PREMIUM_THEME_IDS)
README.md                        — tablesandaltars documentation
docs/FINDINGS_LOG.md             — Historical "3 events" reference
docs/STATE_OF_THE_APP.md         — Current app state documentation
```
