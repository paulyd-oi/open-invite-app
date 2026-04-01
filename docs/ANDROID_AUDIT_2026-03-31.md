# Android Readiness Audit

**Date:** 2026-03-31
**Commit:** `dc8ed19` on main
**Scope:** open-invite-app (primary), openinvite-website + my-app-backend (secondary)

---

## Executive Summary

**Is Android ready today? MOSTLY — but not for Play Store submission yet.**

The app code is architecturally Android-ready. All iOS-only APIs (Live Activities, Apple Sign-In, Widget Bridge) are properly guarded with Platform.OS checks. Notification channels are correctly configured. Gesture handling, keyboard behavior, and safe area usage are all cross-platform. However, **3 blocking issues** prevent a successful Play Store submission: wrong Android package names in store URLs (users land on wrong app), missing app.json Android config (adaptive icon, permissions, versionCode), and the website event page sends ALL mobile users — including Android — to the iOS App Store instead of Play Store. Additionally, the SMS share URI uses iOS-only format and will silently fail on Android.

---

## Android Blockers

### AB-1: Website AppDownloadCta Sends Android Users to iOS App Store
- **Severity:** BLOCKER
- **Files:** `openinvite-website/src/components/AppDownloadCta.tsx:55,70`
- **Issue:** The primary conversion component on every shared event page (`/event/:id`) falls back to `APP_STORE_URL` (iOS App Store) for ALL mobile users. Lines 55 and 70: `window.location.href = APP_STORE_URL`. The `detectPlatform()` function distinguishes iOS/Android/desktop but the store fallback ignores it.
- **User impact:** An Android user who taps a shared event link, views the web page, and taps "Open in Open Invite" or "Download on the App Store" will be sent to Apple's App Store — a complete dead end.
- **Fix:** Use `detectPlatform()` to select between `APP_STORE_URL` and a Play Store URL for the fallback. ~5 lines.

### AB-2: Wrong Android Package Name in Store URLs (2 files)
- **Severity:** BLOCKER
- **Files:**
  - `src/components/UpdateBanner.tsx:75` — uses `com.openinvite.app`
  - `src/lib/rateApp.ts:91` — uses `com.vibecode.openinvite`
- **Correct package:** `com.vibecode.openinvite.x0qi5wk` (from app.json:70)
- **User impact:** "Update Available" banner links to wrong/nonexistent app. "Rate this app" opens wrong Play Store listing. Both are dead ends.
- **Fix:** Replace both with the correct package name. 2 line changes.

### AB-3: Website Support + Homepage Have Placeholder/Empty Play Store URLs
- **Severity:** BLOCKER
- **Files:**
  - `openinvite-website/app/support/page.tsx:2` — `"https://play.google.com/store/apps/details?id=YOUR.PACKAGE.NAME"`
  - `openinvite-website/app/page.tsx:5` — `""` (empty string, shows "Google Play link coming soon")
- **User impact:** Support page sends Android users to a nonexistent Play Store listing. Homepage shows a dead "coming soon" button.
- **Fix:** Replace with correct Play Store URL once published. Must be done before Android launch.

### AB-4: Missing Android App Configuration (app.json)
- **Severity:** BLOCKER (for Play Store submission)
- **File:** `app.json` (android section, lines 68-93)
- **Missing items:**
  - `versionCode` — Play Store requires integer version code
  - `adaptiveIcon` — Android 8+ renders broken icon without foreground/background
  - `permissions` — camera, location, contacts, calendar, notifications not declared
  - `jsEngine: "hermes"` — set for iOS but not Android (performance gap)
  - `splash` — no Android splash screen configured
  - `googleServicesFile` — not required (Expo handles FCM) but recommended
- **User impact:** Play Store will reject the build. Even if accepted, missing adaptive icon renders poorly, missing permissions cause runtime crashes on Android 13+.
- **Fix:** Add Android config block with all required fields. ~30 min including asset creation.

---

## High-Risk Android Issues

### AH-1: SMS Share URI Uses iOS-Only Format
- **Severity:** HIGH
- **Files:**
  - `src/app/event/[id].tsx:2557` — `sms:&body=...` (no recipient, iOS format)
  - `src/app/add-friends.tsx:123` — `sms:${phone}&body=...` (has recipient, works on both)
- **Issue:** iOS uses `sms:&body=`, Android requires `sms:?body=`. The event share SMS button will silently fail or open SMS app without the message body on Android.
- **User impact:** Android users tap "Share via SMS" and get an empty message.
- **Fix:** `Platform.OS === "ios" ? "sms:&body=" : "sms:?body="` or use `sms:?body=` universally (works on both).

### AH-2: Android App Links Verification Incomplete
- **Severity:** HIGH
- **File:** `openinvite-website/public/.well-known/assetlinks.json`
- **Issue:** `sha256_cert_fingerprints` array is empty. Android will not auto-verify the app link association without the signing certificate fingerprint. Deep links from browser will show a disambiguation dialog instead of opening the app directly.
- **User impact:** Tapping `openinvite.cloud/event/...` on Android shows "Open with..." chooser instead of launching directly into app.
- **Fix:** Add the SHA256 fingerprint from the EAS Android signing key.

### AH-3: Intent Filters Only Cover /event Path
- **Severity:** HIGH
- **File:** `app.json:71-92`
- **Issue:** `pathPrefix: "/event"` is the only configured path. The app handles `open-invite://user/...`, `open-invite://circle/...`, `open-invite://invite/...` via custom scheme, but none of these work via `https://openinvite.cloud/user/...` universal links on Android.
- **User impact:** Only event links deep-link into the app. User/circle/invite universal links open in browser.
- **Fix:** Currently acceptable — only event links are shared externally. Flag for post-launch.

---

## Medium / Cleanup

| # | File | Issue | Impact |
|---|------|-------|--------|
| AM-1 | `package.json` | Unused iOS packages: `expo-live-photo`, `react-native-ios-context-menu`, `react-native-ios-utilities` | Build time bloat, no crash risk |
| AM-2 | `openinvite-website/src/components/RsvpSection.tsx:7-8` | App Store URL hardcoded, TODO for Play Store link | Post-RSVP download CTA only shows iOS link |
| AM-3 | `openinvite-website/app/presskit/page.tsx:41` | "iOS (Android coming soon)" text | Stale copy after Android launch |
| AM-4 | `app.json` | No Android notification icon configured | Uses default Expo icon, may look wrong |

---

## Deep Link Flow Trace

**Scenario: Android user receives shared event link**

```
1. User taps: https://www.openinvite.cloud/event/abc123
   → Opens in mobile browser (App Links NOT auto-verified due to empty fingerprints)
   STATUS: DEGRADED (shows in browser, not auto-open)

2. Web page loads event with RSVP form
   → Works correctly, server-rendered event page
   STATUS: OK

3. User taps "Open in Open Invite"
   → Attempts custom scheme: open-invite://event/abc123
   → If app installed: opens app, routes to event (Expo Router)
   STATUS: OK (if installed)

4. If app NOT installed, fallback fires after 1.5s
   → window.location.href = APP_STORE_URL (iOS App Store!)
   STATUS: BROKEN — sends to Apple App Store

5. User installs from... wrong store
   → DEAD END
   STATUS: BLOCKER (AB-1)
```

**After AB-1 fix:**
```
4. Fallback detects Android → opens Play Store listing
   STATUS: OK (after fix)

5. User installs, opens app
   → App opens to home screen (cold start, no deferred deep link)
   → User must re-tap the original link
   STATUS: ACCEPTABLE (standard mobile behavior)
```

---

## Config Validation

### app.json Android Section

| Field | Status | Value | Required for Play Store? |
|-------|--------|-------|--------------------------|
| `package` | SET | `com.vibecode.openinvite.x0qi5wk` | Yes |
| `versionCode` | MISSING | — | Yes (integer, auto-increment) |
| `adaptiveIcon` | MISSING | — | Yes (foreground + background) |
| `permissions` | MISSING | — | Yes (runtime permissions Android 13+) |
| `jsEngine` | MISSING | — | No (defaults to Hermes in SDK 53) |
| `splash` | MISSING | — | Recommended |
| `googleServicesFile` | MISSING | — | Not needed (Expo Push) |
| `edgeToEdgeEnabled` | SET | `true` | No (good practice) |
| `intentFilters` | SET | `/event` paths | Recommended |
| `icon` | INHERITED | `./icon.png` (root) | Adaptive preferred |

### EAS Build Config

| Item | Status |
|------|--------|
| Android keystore | Not configured (EAS manages automatically for internal builds) |
| Production profile | Exists, no Android overrides |
| Build type | Default (APK for dev, AAB for store) |

### assetlinks.json

| Field | Status |
|-------|--------|
| `package_name` | Correct: `com.vibecode.openinvite.x0qi5wk` |
| `sha256_cert_fingerprints` | EMPTY — must be populated |
| Hosting location | Correct: `openinvite.cloud/.well-known/assetlinks.json` |

---

## Store / URL Validation

### All Store URLs in Codebase

| Location | URL | Correct? |
|----------|-----|----------|
| `src/lib/config.ts:18` | `apps.apple.com/app/id6757429210` | Yes (iOS SSOT) |
| `src/app/subscription.tsx:746` | `apps.apple.com/account/subscriptions` (iOS) / `play.google.com/store/account/subscriptions` (Android) | Yes |
| `src/components/UpdateBanner.tsx:75` | `play.google.com/store/apps/details?id=com.openinvite.app` | **WRONG** package |
| `src/lib/rateApp.ts:91` | `market://details?id=com.vibecode.openinvite` | **WRONG** package |
| `website/src/components/AppDownloadCta.tsx:14` | `apps.apple.com/app/id6757429210` | iOS only, **no Android** |
| `website/src/components/RsvpSection.tsx:7` | `apps.apple.com/app/id6757429210` | iOS only, **no Android** |
| `website/app/support/page.tsx:2` | `play.google.com/...?id=YOUR.PACKAGE.NAME` | **PLACEHOLDER** |
| `website/app/page.tsx:5` | `""` (empty) | **EMPTY** |

---

## Top 5 Android Risks Post-Launch

1. **Dead install funnel** — Android users hitting shared event links get sent to iOS App Store (AB-1)
2. **Wrong app on update/rate** — Package name mismatches send users to wrong Play Store listing (AB-2)
3. **Silent SMS share failure** — SMS body not populated on Android (AH-1)
4. **No auto-launch from links** — Empty assetlinks fingerprints mean disambiguation dialog (AH-2)
5. **Play Store rejection** — Missing versionCode, adaptiveIcon, permissions (AB-4)

---

## Recommended Fix Order

### Before Play Store submission (blocking)
1. **AB-4** — Add versionCode, adaptiveIcon, permissions to app.json (~30 min)
2. **AB-2** — Fix package names in UpdateBanner.tsx and rateApp.ts (~5 min)
3. **AH-2** — Populate SHA256 fingerprint in assetlinks.json (~15 min)

### Before Android users hit the funnel (blocking)
4. **AB-1** — Platform-aware store fallback in AppDownloadCta.tsx (~10 min)
5. **AB-3** — Replace placeholder Play Store URLs on website (~5 min)
6. **AH-1** — Fix SMS URI format for Android (~5 min)

### Post-launch cleanup
7. **AM-1** — Remove unused iOS packages
8. **AM-2/3** — Update website copy referencing iOS-only
9. **AH-3** — Expand intent filters to cover more paths

---

## Confidence / Unknowns

**High confidence (verified by code inspection):**
- All Platform.OS guards are correct and comprehensive
- Notification channels properly configured
- Gesture/keyboard/safe-area handling is cross-platform
- Package name mismatches are real and will cause broken links
- Website AppDownloadCta sends all mobile users to iOS App Store

**Cannot verify without real device:**
- Android deep link auto-verification behavior (depends on assetlinks + device)
- Notification delivery end-to-end (FCM token registration via Expo)
- Adaptive icon rendering quality
- Edge-to-edge behavior on various Android versions
- SMS app behavior with corrected URI format
- `react-native-keyboard-controller` behavior on Android
- RevenueCat purchase flow on Android (separate product setup)

**Needs manual QA before launch:**
- Full install → open → event flow on Android device
- Push notification receive + tap → deep link on Android
- SMS share from event detail on Android
- Calendar sync on Android
- Photo capture + upload on Android
- Contact import on Android
