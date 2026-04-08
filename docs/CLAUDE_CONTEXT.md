# Claude Context — Open Invite

> Read this first on any new session. Treat as repo SSOT unless code clearly contradicts it.
> Last updated: 2026-04-07. See `docs/BRAIN.md` for comprehensive reference.

---

## 1. Product Snapshot

Open Invite is **live on the App Store** (v1.2.2, build 319). App Store ID: 6757429210.

**Core wedge:**
- "What are my friends doing this week?"
- "I'm doing something -- who's in?"

**Primary loop:** browse -> open -> RSVP -> share

Not pre-launch. Every change ships to real users. Treat accordingly.

**Stats (production):** 46 users, 172 events, 584 circle messages, 192 friendships, 1026 notifications, 427 sessions.

**Monetization:** Founder Pro via RevenueCat (App Store IAP). Offering: "default", Entitlement: "premium". $10/yr early adopter, $60 lifetime. Free tier: 5 events/month, 2 circles, 15 members, 5 themes.

---

## 2. Stack / Architecture

| Layer | Tech |
|-------|------|
| Frontend | Expo SDK 53 + React Native 0.79.6, Expo Router 5.1.10 (file-based, typed routes), NativeWind 4.1.23 |
| Backend | Hono.js + Prisma 6.19.1 + PostgreSQL (Render, auto-deploy from main) |
| Auth | Better Auth 1.4.7, session tokens, Apple Sign-In, phone OTP (Twilio) |
| State | React Query 5.90.2 (server), Zustand 5.0.9 (2 stores), SecureStore (auth tokens) |
| Media | Cloudinary (signed uploads + server-side transforms) |
| Realtime | WebSocket server + optional Redis fanout |
| Push | Expo Push Notifications, 31 types, async fanout worker |
| Analytics | PostHog |
| Errors | Sentry 6.14.0 |
| Distribution | EAS + App Store (iOS), Render auto-deploy (backend), Vercel (website) |
| Package manager | `bun` (frontend), `npm` (backend) |

**Repo structure (frontend — open-invite-app):**
```
src/app/           44 screen files (Expo Router)
src/components/    169 components in 14+ subdirectories
src/hooks/         23 custom hooks
src/lib/           133 utility/business logic files
src/ui/            Design system primitives
shared/            contracts.ts (synced with backend)
docs/              Architecture docs, BRAIN.md, this file
```

**Repo structure (backend — my-app-backend):**
```
src/routes/        44 route files, 250+ endpoints
src/middleware/     9 middleware files
src/lib/           23+ library files
src/realtime/      WebSocket server + Redis fanout
src/shared/        contracts.ts (synced with frontend)
prisma/            schema.prisma (80 models), 99 migrations
```

**Repo structure (website — openinvite-website):**
```
app/               10 pages (Next.js 16.1.6 App Router)
src/components/    8 components
src/lib/           API client
```

---

## 3. Critical Engineering Constraints

- **Backend route mount parity:** Routes must be registered in BOTH `src/index.ts` (dev) and `src/server.ts` (prod). Missing one = route works locally, 404 in production.
- **Forbidden files:** Do not edit `patches/`, `babel.config.js`, `metro.config.js`, `app.json`, `tsconfig.json`.
- **No new packages** unless `@expo-google-font` or pure JS helpers.
- **Secrets:** Never in source. Environment variables only (EAS/Render).
- **Contract alignment:** When modifying event fields, update: Prisma schema, backend serializer (`src/routes/events-shared.ts`), backend contracts, frontend contracts (`shared/contracts.ts`). All four must stay in sync.
- **CSRF:** Disabled (documented in `src/auth.ts`) — mobile Expo clients don't reliably send Origin headers. Mitigated by: session tokens, rate limiting, input validation, admin token auth.
- **Migration drift:** Local `prisma migrate dev` may fail due to drift from production. Use manual SQL migration files + `prisma generate` for client types when needed.

---

## 4. Theme / Effect System

### Catalog Themes
- 5 free + 21 premium (Pro-gated). SSOT: `src/lib/eventThemes.ts`
- Gate-on-save model: free users can preview, save requires Pro
- Stored as `themeId String?` on event model
- Custom themes: `customThemeData Json?` with visualStack

### Effects (Event-Level)
- Stored as `effectId String?` + `customEffectConfig Json?`
- Independent of theme — user picks from EffectTray
- `effectId === "__custom__"` signals custom config

### Event Page Render Precedence
```
1. SafeAreaView background (canvasColor)
2. AnimatedGradientLayer (gradient)
3. ThemeVideoLayer (video)
4. Particle layer (EXCLUSIVE):
   - IF effectId: MotifOverlay (user effect)
   - ELSE: ThemeEffectLayer (theme particles)
5. ThemeFilterLayer (filter)
6. Content (scrollable card)
```

---

## 5. Navigation & Layout

**Tab bar (5 tabs — INVARIANT order):** Discover | Calendar | Social (center) | Friends | Profile

**Bottom spacing constants** (`src/lib/layoutSpacing.ts`):
- `TAB_BOTTOM_PADDING` (100) — tab screens with floating nav
- `STACK_BOTTOM_PADDING` (48) — pushed stack screens
- `FORM_BOTTOM_PADDING` (40) — settings/edit forms
- `FLOATING_TAB_INSET` (84) — canonical from `BottomNavigation.tsx`

**Safe area rule:** All screens use `edges={[]}` or `edges={["top"]}`. Never `edges={["bottom"]}` (causes double-padding with floating tab bar). Exceptions: paywall.tsx, NotificationNudgeModal.tsx.

---

## 6. Key SSOT Files

| System | File | Repo |
|--------|------|------|
| Themes | `src/lib/eventThemes.ts` | frontend |
| Sharing | `src/lib/shareSSOT.ts` + `src/lib/config.ts` | frontend |
| Subscriptions | `src/lib/revenuecatClient.ts` | frontend |
| Image Transforms | `src/lib/mediaTransformSSOT.ts` | frontend |
| Freemium Limits | `src/lib/freemiumLimits.ts` | frontend |
| Push Notifications | `src/lib/expoPush.ts` | backend |
| Entitlements | `src/routes/entitlements.ts` + `src/utils/subscriptionHelpers.ts` | backend |
| Contracts | `shared/contracts.ts` (FE) / `src/shared/contracts.ts` (BE) | both |
| Event Serializer | `src/routes/events-shared.ts` | backend |

---

## 7. Backend Key Systems

### Auth Flow
- Better Auth with Prisma adapter, 90-day session TTL, 24h sliding refresh
- Mobile: `x-oi-session-token` header. Web: httpOnly secure cookies.
- Admin: `x-admin-token` header for dashboard (skips session auth)

### Push Notification Governance
```
OS permission > global pushEnabled > type-specific pref > quiet hours > dedupe
```
31 notification types mapped to preference keys. Async fanout with `PUSH_ASYNC=1`.

### Cron Jobs (8)
Event reminders (5min), daily digest (15min), weekly digest (Mon), token cleanup, notification log cleanup, session cleanup, event finalization, health check. All use lease-based distributed locking.

### Rate Limiting
6 presets: auth, write, hotpath, heavy, global, email. In-memory, per-user/per-IP.

### Image Uploads
Cloudinary signed uploads. Size limits: avatar 5MB/512px, banner 5MB/1200px, event_photo 10MB/1600px. Server-side transforms on upload completion.

---

## 8. Data Model Highlights

**80 tables.** Key ones:
- `user` (46), `Profile` (32), `account` (44), `session` (427)
- `event` (172) — core with recurrence, visibility, capacity, themes, photos, privacy, summary
- `event_interest` (136) — RSVP records (going/interested/maybe/not_going)
- `friendship` (192), `friend_request` (96), `friend_group` (4)
- `circle` (32) — group/dm, `circle_member` (113), `circle_message` (584)
- `circle_message` — supports `messageType` (text/event_share/system), `sharedEventId` FK
- `notification` (1026), `notification_preferences` (41), `push_token` (27)
- `work_schedule` (278), `event_template` (32), `idempotency_record` (111)

**Event visibility:** all_friends, specific_groups, circle_only, open_invite, private

**Privacy fields:** hideDetailsUntilRsvp, showGuestList, showGuestCount, showLocationPreRsvp, hideWebLocation

---

## 9. Sharing & Deep Links

- Deep links: `open-invite://event/<id>`, `open-invite://circle/<id>`, `open-invite://user/<id>`
- Universal links: `https://www.openinvite.cloud/event/<id>`
- Share domain: `go.openinvite.cloud`
- Event sharing via chat: `POST /api/events/:eventId/share` → creates messages in DMs/circles with `messageType: "event_share"`

---

## 10. Frontend State Management

### Zustand Stores (2)
1. **useCreateSettingsStore** — event creation form state
2. **useThemeBuilderStore** — Theme Studio layers

### Storage
- **expo-secure-store:** Auth tokens, sensitive data
- **AsyncStorage:** Throttling, timestamps, preferences
- **React Query cache:** All server state

### Context Providers (app/_layout.tsx)
ThemeProvider > SubscriptionProvider > SafeAreaProvider > GestureHandlerRootView > KeyboardProvider > QueryClientProvider > PostHogProvider > ErrorBoundary

---

## 11. Location Search

Backend proxy: `GET /api/places/search?query=...&lat=...&lon=...`
Fallback chain: Google Places (strict) -> Google Places (relaxed) -> Photon -> Nominatim -> smart suggestions

---

## 12. Invariants

- NEVER run `expo prebuild --clean` — destroys native customizations
- All hooks in `event/[id].tsx` must be above all early returns (React rules of hooks)
- Both `contracts.ts` files must stay in sync (frontend + backend)
- Create page (`app/create.tsx`) is SSOT for event authoring
- Version bump: sync app.json + 3 iOS plists
- Native module pbxproj entries: `name = X; path = OpenInvite/X;` pattern
- Backend auto-deploys from main via Render
- Tab bar order: Discover | Calendar | Social | Friends | Profile
- zsh: use `>|` not `>` for file overwrites, quote bracketed paths
- Long-running CLI commands: pipe to `tee /tmp/<descriptive>.log`
- Deep link scheme: `open-invite://`
- Frontend path aliases: `@/` = `src/`

---

## 13. Infrastructure

| Service | Purpose | Auto-deploy |
|---------|---------|-------------|
| Render | Backend API + PostgreSQL | main branch |
| Vercel | Website (Next.js) | main branch |
| App Store | iOS distribution | Manual via EAS |
| Cloudinary | Image CDN | N/A |
| RevenueCat | Subscriptions | Webhook |
| Expo | Push, OTA updates, builds | EAS |
| PostHog | Analytics | N/A |
| Sentry | Error tracking | N/A |
| Twilio | SMS OTP | N/A |
| Resend | Transactional email | N/A |

**Machines:**
- **paulsmbp:** Primary dev. All three repos.
- **paulyd-mini:** Mac mini running PM2 (OpenClaw operator, attribution engine). Receives BRAIN.md for context.

---

## 14. Current State & Queued Work

### Deployed
- Backend: Render, last commit `5b3b6e7` (event sharing via chat)
- Website: Vercel, commit `226e1c4`
- App: v1.2.2 (build 319) uploaded, v1.2.0 (build 315) live

### Recent Backend Changes
- N+1 calendar import fix (batch queries)
- Zod validation on 20+ endpoints
- CSRF decision documented
- hideDetailsUntilRsvp field
- Event sharing via chat messages
- RevenueCat webhook HMAC verification
- Cloudinary upload size/dimension limits
- Redis reconnection with exponential backoff

### Queued
- Admin dashboard V2 (OpenClaw operator)
- event/[id].tsx extraction (file too large)
- Android readiness
- EAS Build fix
- Podfile cleanup

---

## 15. Instructions for Future Sessions

1. **Read this file first.** It is the repo context SSOT.
2. **Read `docs/BRAIN.md`** for comprehensive reference (screens, routes, tables, components).
3. **Read `docs/SYSTEM_MAP.md`** for subsystem architecture.
4. **Do not re-discover architecture** unless this doc is clearly wrong.
5. **Update this file** when major architectural truths change.
6. **Check `CLAUDE.md`** (project root) for tool/routing/state management rules.
