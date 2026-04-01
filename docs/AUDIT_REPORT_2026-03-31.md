# Open Invite Pre-Launch Audit Report

**Date:** 2026-03-31
**Scope:** All 3 repositories (open-invite-app, my-app-backend, openinvite-website)
**Auditor:** Claude Code
**Commit refs:** app `44e0863` | backend `9fd40d7` | website `17d2199`

---

## Executive Summary

Audited all three repositories across 9 subsystems. Found **2 launch blockers**, **12 high-risk issues**, **15 medium-risk items**, and **20+ low/cleanup items**. The codebase is broadly production-ready. The two blockers are a privacy enforcement gap (location shown to non-RSVP'd users in the app) and a co-host authorization gap on event deletion in the backend. Both are surgical fixes.

---

## 1. Launch Blockers

### LB-1: Location Privacy Not Enforced on App Event Detail Page
- **Repo:** open-invite-app
- **Files:** `src/app/event/[id].tsx` (~line 2510), `src/components/event/AboutCard.tsx` (~line 120)
- **Issue:** The `showLocationPreRsvp` privacy flag is saved during create/edit and sent to the backend, but the event detail page renders the full location unconditionally. A host who sets "Hide Location Before RSVP" expects the address hidden from non-RSVP'd viewers — the app shows it anyway.
- **Impact:** Privacy violation. Hosts share private addresses assuming the setting works.
- **Fix:** In AboutCard, gate location display on `showLocationPreRsvp` and `myRsvpStatus`. ~10 lines.

### LB-2: Co-Host Cannot Delete Events (Backend)
- **Repo:** my-app-backend
- **File:** `src/routes/events.ts` (~line 3724-3750)
- **Issue:** DELETE endpoint checks `userId === event.userId` only. The UPDATE endpoint correctly checks co-hosts via `hostIds`, but DELETE does not. Co-hosts get a 404 when trying to delete.
- **Impact:** Broken co-host workflow. Inconsistent authorization model.
- **Fix:** Add `hostIds` check to DELETE WHERE clause, matching UPDATE pattern. ~5 lines.

---

## 2. High-Risk Issues

### H-1: No Past-Date Validation on Event Creation (App)
- **File:** `src/app/create.tsx` (lines 103-128)
- **Issue:** Users can manually set event start date to the past. Only end-before-start is validated.
- **Fix:** Add `if (startDate < new Date())` guard before submit.

### H-2: Account Deletion Flow Missing State Reset (App)
- **File:** `src/app/account-settings.tsx` (lines 212-224)
- **Issue:** If DELETE succeeds but logout fails, user is in limbo. If DELETE fails, confirm modals aren't reset.
- **Fix:** Reset modal state in finally block; handle logout failure gracefully.

### H-3: Push Token Registration Throttle Ignores Account Switches (App)
- **File:** `src/hooks/useNotifications.ts` (lines 420-443)
- **Issue:** `lastRegisteredUserId` module var never updated on successful registration. Multi-user devices may fail to re-register.
- **Fix:** Set `lastRegisteredUserId` in `markTokenRegistered()`.

### H-4: Notification Master Toggle Doesn't Await Backend (App)
- **File:** `src/app/notification-settings.tsx` (lines 314-335)
- **Issue:** `handleMasterToggle()` calls `updatePreference()` without awaiting or error handling. Toggle shows success but backend may be out of sync.
- **Fix:** Await the call, show error toast on failure, roll back toggle.

### H-5: Missing Read Receipt Field in Push Handler (App)
- **File:** `src/lib/pushRouter.ts` (lines 455-472)
- **Issue:** Push handler patches `message.readBy` but field isn't defined in CircleMessage schema. Patch silently does nothing.
- **Fix:** Add `readBy?: string[]` to contracts; validate presence before patching.

### H-6: Guest RSVP Tokens Use Predictable CUIDs (Backend)
- **File:** `prisma/schema.prisma` (line 1247)
- **Issue:** `token @default(cuid())` is sequential/predictable. Not cryptographically secure for security-sensitive token that reveals location.
- **Fix:** Generate with `crypto.randomBytes(32).toString('hex')` in route handler.

### H-7: No Rate Limiting on Guest Token Verification (Backend)
- **File:** `src/routes/publicEvents.ts` (lines 102-112)
- **Issue:** RSVP submission is rate-limited (10/hr), but the GET with `x-guest-token` header that reveals location has no limit. Enables brute-force enumeration.
- **Fix:** Add rate limiter to token verification path.

### H-8: Incomplete Account Deletion Cleanup (Backend)
- **File:** `src/routes/privacy.ts` (lines 226-352)
- **Issue:** Missing deletions for: `event_reminder`, `event_notification_mute`, `user_stats`, `user_featured_badge`, `badge_grant`, `entitlement_override`, `user_cohort`, `work_schedule_block`.
- **Fix:** Add deletion queries for all user-referencing models.

### H-9: Hardcoded Timezone in Share Pages (Backend)
- **File:** `src/routes/sharePages.ts` (line 120)
- **Issue:** All event times in social previews rendered as "America/Los_Angeles". Non-US users see wrong times.
- **Fix:** Store timezone on event model or accept timezone query param.

### H-10: Missing Attribution Parameters in Deep Link (Website)
- **File:** `src/components/AppDownloadCta.tsx` (line 46)
- **Issue:** Deep link `open-invite://event/{id}` omits `src`, `ref`, `campaign` params that the app parses for attribution.
- **Fix:** Append query params to deep link URL.

### H-11: Subscription Page Hardcodes App Store URL Without Platform Check (App)
- **File:** `src/app/subscription.tsx` (line 744)
- **Issue:** "Manage in App Store" button calls `Linking.openURL("https://apps.apple.com/account/subscriptions")` with no Android fallback. Will fail on Android.
- **Fix:** Use `Platform.select` with Play Store subscription URL.

### H-12: Profile Banner URL Field Mismatch (App)
- **File:** `src/app/profile.tsx` (lines 285-289)
- **Issue:** Code checks both `bannerPhotoUrl` and `bannerUrl` with `as any` casts. Profile detail response only defines `bannerPhotoUrl`. Fallback to undefined field.
- **Fix:** Remove `bannerUrl` fallback; use only `bannerPhotoUrl`.

---

## 3. Medium-Risk / Cleanup

| # | Repo | File | Issue |
|---|------|------|-------|
| M-1 | app | `create.tsx:680` | `"custom" as any` theme type cast bypasses ThemeId validation |
| M-2 | app | `create.tsx:700` | `updateMutation.mutate(createPayload as any)` unsafe edit payload cast |
| M-3 | app | `circle/[id].tsx:640-669` | No visible "Retry" UI for failed chat messages |
| M-4 | app | `circle/[id].tsx:190-196` | Chat pagination doesn't guard concurrent prepend+append |
| M-5 | app | `revenuecatClient.ts:208-214` | Purchase error doesn't distinguish user-cancel from real failure |
| M-6 | app | `notification-settings.tsx:306-311` | OS permission grant not synced back to backend preference |
| M-7 | app | `edit-profile.tsx:116-117` | Theme ID cast after validation — should conditionally set |
| M-8 | app | `lib/api.ts:108,290` | Two `as any` casts on `authClient.$fetch()` options |
| M-9 | backend | `events.ts` (multiple) | Inconsistent error format: `c.json({error})` vs `respondError()` |
| M-10 | backend | `events.ts:1360` | `endTime` default (startTime+1h) is app-level, not DB-level |
| M-11 | backend | `events.ts:850-854` | Event report validation is manual, not Zod |
| M-12 | backend | `schema.prisma` (push_token) | No TTL/expiry on push tokens — accumulate indefinitely |
| M-13 | backend | `events.ts:5112-5145` | PUT /events/:id/color doesn't validate hex format |
| M-14 | website | `RsvpSection.tsx:21-46` | localStorage quota errors silently swallowed — user may double-RSVP |
| M-15 | website | `EventCard.tsx:87-142` | Empty string location still renders lock/reveal UI |

---

## 4. Post-Launch Cleanup

| # | Repo | File | Issue |
|---|------|------|-------|
| C-1 | app | `deepLinks.ts:89-108` | Deprecated functions still exported; consolidate to shareSSOT.ts |
| C-2 | app | `event/[id].tsx:1291` | RSVP status normalization uses final `as` cast without default |
| C-3 | app | `create.tsx:669` | Bring list item IDs use `Date.now()` — collision risk |
| C-4 | app | `create.tsx:108` | Default time (6 PM) hardcoded, not configurable |
| C-5 | app | `create.tsx:657` | `reflectionEnabled` always false, no UI toggle |
| C-6 | app | `create.tsx:84` | editEventId param not validated for empty string |
| C-7 | app | `event/[id].tsx:2546` | SMS share URI uses `sms:&body=` — should be `sms:?body=` |
| C-8 | app | `create.tsx:389-409` | Create vs update mutations have asymmetric error messages |
| C-9 | app | `profile.tsx:281-293` | Stale DEV banner render proof logging |
| C-10 | app | `circle/[id].tsx:155-156` | `prevMemberCountRef` initialized but never used |
| C-11 | app | `edit-profile.tsx:155-159` | Type guard + `as any` redundancy |
| C-12 | app | `edit-profile.tsx:103`, `profile.tsx:128` | Avatar source typed as `any` |
| C-13 | app | Router navigation (multiple) | `router.push(...route as any)` throughout |
| C-14 | backend | `schema.prisma` | Missing indexes: `guest_rsvp[eventId,status]`, `circle_member[userId]`, `account[userId]` |
| C-15 | backend | `notifications.ts` | Inconsistent success response format |
| C-16 | backend | `schema.prisma` (hangout_history) | `eventId` is plain string, not FK — orphans on event delete |
| C-17 | backend | `notifications.ts` | No default `notification_preferences` row on signup — race condition |
| C-18 | website | `RsvpSection.tsx:10` | `"error"` state declared but never used in render logic |
| C-19 | website | `app/event/[id]/loading.tsx:10` | Skeleton uses hardcoded dark color, not theme-aware |
| C-20 | website | App Store URLs | 4 different URL formats across components — should be one constant |
| C-21 | website | `support/page.tsx:2` | Google Play URL is placeholder `YOUR.PACKAGE.NAME` |

---

## 5. Cross-Repo Drift

| Area | Status | Notes |
|------|--------|-------|
| Privacy flags (4 booleans) | Consistent | App, backend, and website all handle the same flags |
| Theme IDs | Consistent | All 18 themes match across app and website |
| PublicEvent type | Mostly consistent | Website `visibility` typed as `string` (should be union) |
| Guest RSVP status values | Consistent | Both use `"going" | "not_going"` |
| Share URL format | Consistent | App generates `openinvite.app/event/{id}`, website routes handle it |
| Error response format | DRIFTED | Backend mixes two formats (see M-9) |
| Location privacy enforcement | DRIFTED | Backend + website enforce; app does NOT enforce (LB-1) |
| Co-host authorization | DRIFTED | UPDATE checks hostIds; DELETE does not (LB-2) |

---

## 6. Android Pre-Audit Flags

| # | File | Issue | Severity |
|---|------|-------|----------|
| A-1 | `subscription.tsx:744` | Hardcoded App Store URL, no Android fallback | HIGH (= H-11) |
| A-2 | `package.json:86,126,127` | Unused iOS packages: expo-live-photo, react-native-ios-context-menu, react-native-ios-utilities | LOW |
| A-3 | Platform guards | All iOS-only APIs (ActionSheetIOS, LiveActivity, Widget, AppleAuth) properly guarded | PASS |
| A-4 | Haptics | expo-haptics provides built-in Android fallback | PASS |
| A-5 | SafeArea | Consistent react-native-safe-area-context usage | PASS |
| A-6 | Keyboard | Proper `Platform.OS` behavior differentiation | PASS |
| A-7 | Calendar sync | Platform-aware implementation | PASS |

**Verdict:** App is Android-ready after fixing A-1 and optionally removing A-2 dead packages.

---

## 7. Top 10 File Hotspots

Files with the most issues found, most complexity, or highest change risk:

| # | File | Issues | Risk Factor |
|---|------|--------|-------------|
| 1 | `open-invite-app/src/app/event/[id].tsx` | LB-1, C-2, C-7, C-10 | ~3000 lines, privacy+RSVP+share logic |
| 2 | `open-invite-app/src/app/create.tsx` | H-1, M-1, M-2, C-3-C-8 | ~700 lines, create+edit SSOT |
| 3 | `my-app-backend/src/routes/events.ts` | LB-2, M-9-M-11, M-13 | ~5000+ lines, all event CRUD |
| 4 | `open-invite-app/src/lib/pushRouter.ts` | H-5 | Push message handling, field mismatches |
| 5 | `my-app-backend/src/routes/publicEvents.ts` | H-6, H-7 | Guest RSVP + token security |
| 6 | `my-app-backend/src/routes/privacy.ts` | H-8 | Account deletion, incomplete cleanup |
| 7 | `open-invite-app/src/app/circle/[id].tsx` | M-3, M-4, C-10 | Chat, pagination, retry |
| 8 | `open-invite-app/src/hooks/useNotifications.ts` | H-3 | Push token lifecycle |
| 9 | `open-invite-app/src/app/notification-settings.tsx` | H-4, M-6 | Preference sync gaps |
| 10 | `openinvite-website/src/components/RsvpSection.tsx` | M-14, C-18 | Client RSVP state machine |

---

## 8. Recommended Fix Order

### Pre-Launch (do now)
1. **LB-1** — App location privacy enforcement (~30 min)
2. **LB-2** — Backend co-host DELETE authorization (~15 min)
3. **H-1** — Past-date validation on event creation (~10 min)
4. **H-2** — Account deletion state reset (~15 min)
5. **H-11** — Subscription page Android URL (~10 min)

### Pre-Launch (security hardening)
6. **H-6** — Replace CUID guest tokens with crypto-random (~20 min)
7. **H-7** — Rate limit guest token verification (~15 min)
8. **H-8** — Complete account deletion cleanup (~30 min)

### Launch Week
9. **H-3** — Push token throttle fix (~10 min)
10. **H-4** — Notification toggle await + error handling (~15 min)
11. **H-5** — Read receipt field in contracts (~10 min)
12. **H-9** — Timezone in share pages (~20 min)
13. **H-10** — Attribution params in deep link (~10 min)
14. **H-12** — Banner URL field cleanup (~10 min)

### Post-Launch Sprint
15. All Medium items (M-1 through M-15)
16. All Cleanup items (C-1 through C-21)

---

## 9. Confidence & Unknowns

**High confidence:**
- Privacy enforcement gap (LB-1) — verified by reading AboutCard and event detail rendering
- Co-host DELETE gap (LB-2) — confirmed UPDATE has the check, DELETE does not
- Android readiness — comprehensive Platform.OS search confirms proper guards

**Medium confidence:**
- Push token throttle (H-3) — module variable lifecycle needs runtime verification
- Account deletion completeness (H-8) — Prisma schema has many models; may have missed some
- Chat pagination race (M-4) — theoretical; needs reproduction under load

**Unknowns / Not Audited:**
- Backend WebSocket/realtime implementation (not found in routes — may be separate service)
- EAS build configuration and OTA update setup
- App Store review compliance (screenshots, metadata, privacy policy)
- Production environment variable configuration (can't verify Render/Vercel env)
- Load testing / performance under concurrent users
- Accessibility (VoiceOver, TalkBack) not audited
