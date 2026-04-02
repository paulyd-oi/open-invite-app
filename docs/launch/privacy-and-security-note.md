# Privacy & Security Audit — Launch Readiness

**Date:** 2026-04-02
**Scope:** Pre-launch audit for ~10K church network rollout

---

## Analytics SDKs in Use

| SDK | Purpose | Config Source |
|-----|---------|--------------|
| PostHog (`posthog-react-native`) | Product analytics, funnels | `EXPO_PUBLIC_POSTHOG_KEY` env var |
| Sentry (`@sentry/react-native`) | Crash reporting, error tracking | Env-configured, source maps via EAS |
| RevenueCat (`react-native-purchases`) | Subscription management, revenue analytics | `EXPO_PUBLIC_VIBECODE_REVENUECAT_*_KEY` |

All SDKs have graceful fallbacks when keys are missing — app functions without them.

**Backend Sentry** (`@sentry/node`): Added in Phase 6A. DSN via `SENTRY_DSN` env var. Error capture only (no performance tracing).

---

## User Data in Notification Payloads (Phase 5A additions)

Notification `data` JSON now includes:
- `actorId`, `actorName`, `actorAvatarUrl` — the user who triggered the notification
- `eventTitle`, `eventEmoji`, `eventCoverUrl` — event metadata for rich previews

**Privacy impact:** These fields are only sent to users who already have permission to see the event (friends, attendees, group members). No new data exposure to unauthorized users.

---

## Profile Analytics Endpoint (Phase 5D)

`GET /api/profile/stats` now returns `eventPerformance`:
- `totalRsvpsReceived` — aggregate count (no PII)
- `avgRsvpsPerEvent` — computed average (no PII)
- `topEvents` — event title, emoji, start time, attendee count (user's own events only)

**Privacy impact:** Only returns data about the authenticated user's own hosted events. No cross-user data leakage.

---

## App Store Connect Privacy Answers

**No updates required.** The new notification payload fields and analytics endpoint do not change the categories of data collected. They surface existing data in new presentation contexts.

**Privacy policy URL:** Verify it is current and accessible before launch.

---

## Security Findings

### Auth Token Storage: SECURE
- Stored in `expo-secure-store` (iOS Keychain / Android Keystore)
- NOT in AsyncStorage
- Safe wrapper (`safeSecureStore.ts`) prevents crashes on storage failures

### Dev Gates: PROPERLY GATED
- All dev overlays/panels behind `__DEV__` checks
- `prodGateSelfTest.ts` runs on dev boot to verify 10 dev gates
- Dev modules tree-shake out in production builds

### Force Update Mechanism: ACTIVE
- Backend-controlled via `/api/app-config` endpoint
- Two-tier: hard block (`minSupportedVersion`) + soft banner (`latestVersion`)
- Can force-update all users in emergency

### Klipy API Key: HARDCODED (LOW RISK)
- Location: `src/components/create/klipyApi.ts:16`
- This is a public client key (designed for client-side use)
- Risk: key rotation requires app update
- **Recommendation:** Move to `EXPO_PUBLIC_KLIPY_API_KEY` env var for easier rotation
- **Not a blocker for launch**

---

## Launch-Day Privacy Checklist

- [ ] Verify privacy policy URL is live and current
- [ ] Confirm App Store Connect privacy questionnaire is up to date
- [ ] Verify `SENTRY_DSN` is set in Render production env
- [ ] Verify PostHog project is receiving events from production builds
