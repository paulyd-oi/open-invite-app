# Launch Metrics Checklist — First 72 Hours

**Context:** ~10K member church network launch. Monitor these 8 signals.

---

## 1. Crash-Free Rate
- **Where:** App Store Connect → App Analytics → Crashes
- **Target:** >99% crash-free sessions
- **Action if breached:** Check Sentry for stack traces, consider force-update if critical

## 2. Deep Link Tap → Event Page Load
- **Where:** PostHog → event `share_link_opened` → `event_page_viewed`
- **Funnel:** share link tap → app open → event detail rendered
- **Gap:** Verify `share_link_opened` is instrumented in deep link handler. If missing, check `src/lib/deepLinks.ts` for PostHog capture call.

## 3. Event Page View → RSVP Conversion
- **Where:** PostHog → `event_page_viewed` → `rsvp_submitted` (or `guest_rsvp_submitted`)
- **Target:** >20% conversion on shared event links
- **Gap:** Verify `rsvp_submitted` event fires in both authenticated and guest RSVP flows

## 4. Notification Tap → Correct Screen Routed
- **Where:** PostHog → `notification_tapped` event with `routed_to` property
- **What to watch:** High `fallback_used: true` rate indicates broken notification payloads
- **Gap:** Check if `notification_tapped` is instrumented in `src/hooks/useNotifications.ts`

## 5. Create Event → Share
- **Where:** PostHog → `event_created` → `event_shared`
- **Target:** >30% of created events are shared within 1 hour
- **Gap:** Verify `event_shared` fires in share sheet handler

## 6. Promo Code Redemptions
- **Where:** RevenueCat Dashboard → Transactions → filter by offer code "tablesandaltars"
- **Also:** App Store Connect → Offer Codes → redemption count
- **Target:** Track total redemptions vs 10K cap
- **Action if approaching cap:** Request more codes from Apple

## 7. Backend Error Rate
- **Where:** Sentry dashboard (new — Phase 6A) + Render dashboard → Metrics
- **Target:** <1% 5xx error rate
- **Key routes to watch:**
  - `POST /api/events/:id/rsvp/guest` (guest RSVP under load)
  - `GET /api/events/:id/public` (public event page)
  - `POST /api/auth/*` (sign up/sign in surge)
- **Action if elevated:** Check Sentry for error grouping, review rate limit deny logs (`[P0_RATELIMIT] DENY`)

## 8. Slowest API Routes
- **Where:** PostHog → `api_request` events → sort by `durationMs`
- **Also:** Render dashboard → Metrics → Response Time
- **Key routes to watch:**
  - `GET /api/profile/stats` (heavy aggregation — 2min stale time)
  - `GET /api/events/calendar` (multi-query calendar fetch)
  - `GET /api/notifications` (paginated with friend request filter)
- **Gap:** Verify `api_request` PostHog event includes `durationMs` property. If not instrumented on backend, use Render's built-in response time metrics.

---

## Instrumentation Gaps (Do NOT fix during launch — document only)

| Signal | Instrumented? | Gap |
|--------|--------------|-----|
| `share_link_opened` | Needs verification | Check deepLinks.ts |
| `rsvp_submitted` | Needs verification | Check RSVP handlers |
| `notification_tapped` | Likely instrumented | Verify routed_to property |
| `event_shared` | Needs verification | Check share handler |
| `api_request` with durationMs | Backend may not emit | Use Render metrics as fallback |

---

## Quick Reference: Dashboard URLs

- **App Store Connect:** https://appstoreconnect.apple.com
- **RevenueCat:** https://app.revenuecat.com
- **Sentry:** (set SENTRY_DSN in Render, then check org dashboard)
- **Render:** https://dashboard.render.com
- **PostHog:** (check EXPO_PUBLIC_POSTHOG_KEY for project)
