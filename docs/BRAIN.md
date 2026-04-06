# Open Invite — App Brain

<!-- GENERATED: 2026-04-06. Re-run the brain-scan prompt to refresh. -->

You are advising on **Open Invite**, a social calendar app for coordinating real-life plans with friends. This document is the single source of truth for what the product is, how it works, and the current state of the codebase and user base.

---

## 1. Product Identity

Open Invite is a friendly, calendar-native social planning app. The tagline is **"Your plans, finally social."** Users create events, invite friends, RSVP in seconds, chat in Circles, and keep their social life organized in one place. It is built for iOS (primary) and Android (confirmed target).

**Core thesis:** Existing tools (group chats, iCal, Eventbrite) fragment social coordination. Open Invite collapses event creation, invitations, RSVP, chat, and discovery into a single app optimized for small-group, real-life plans.

**Target audience:** Young adults (18–35) in tight friend groups, with early traction in faith-based / church communities. The distribution strategy leans on church networks — promo codes like `AWAKEN`, `SHEPHERD`, and `LOVEPEOPLE` reflect this, and the "Founder" / "Legacy Leader" discount tiers target community leaders.

**Monetization — Free vs Premium:**
- **Free tier:** Create up to 3 active events, 5 basic profile themes, standard event features.
- **Premium tier:** Unlimited events, 41 event themes (36 premium), custom theme builder, advanced event features (pitch-in, bring list, event hooks), premium badges.
- Revenue via RevenueCat (Apple IAP + Google Play). Promo codes and discount codes grant free months/years/lifetime.
- Current premium subscribers: 3 active (2 expiring 2027+, 1 expired).

**App Store IDs:**
- iOS: `id6757429210` (bundle: `com.vibecode.openinvite.0qi5wk`)
- Android: `com.vibecode.openinvite.x0qi5wk`

---

## 2. Feature Map — User-Facing

### Events
| Feature | Description |
|---------|-------------|
| **Create Event** (`create.tsx`) | Full event creation: title, emoji, date/time, location (Google Places), description, visibility, capacity, recurrence, theme, cover photo, event hook tagline, pitch-in/bring-list settings |
| **Create Settings** (`create-settings.tsx`) | Advanced event settings during creation: visibility controls, guest list display, location visibility |
| **Event Detail** (`event/[id].tsx`) | 3D flip card (InviteFlipCard) with hero image, countdown, social proof. Below: RSVP bar, about card, photo gallery, comments, attendees, co-hosts |
| **Event Edit** (`event/edit.tsx`) | Edit all event fields post-creation |
| **Event Photos** | Attendees can upload photos during/after events (Cloudinary). Gallery view with captions |
| **Event Comments** | Threaded comments on events |
| **Event Templates** | Save and reuse event configurations |
| **Event Requests** (`create-event-request.tsx`, `event-request/`) | Propose an event to a group, members vote, auto-creates event when accepted |
| **Calendar Import** (`import-calendar.tsx`) | Import device calendar events into Open Invite |
| **RSVP** | Three states: Going, Interested, Not Going. Join requests for private events |
| **Event Reminders** | Configurable per-event reminders |
| **Event Reporting** | Report inappropriate events/users |
| **Recurring Events** | Daily/weekly/monthly recurrence with series tracking |

### Discovery
| Feature | Description |
|---------|-------------|
| **Discover Feed** (`discover.tsx`) | Main feed with sort pills: Popular, Soon, Friends, Group. Cards show cover image, theme, countdown, social proof |
| **Saved Events** | Bookmark events as "Interested", view in dedicated saved tab |
| **Friend Suggestions** (`suggestions.tsx`) | Algorithmic friend suggestions based on mutual connections |
| **Who's Free** (`whos-free.tsx`) | See which friends are available based on work schedules |

### Social / Friends
| Feature | Description |
|---------|-------------|
| **Friends List** (`friends.tsx`) | View all friends, friend requests, mutual friends |
| **Add Friends** (`add-friends.tsx`) | Search by name/handle, contact matching, friend suggestions |
| **Friend Groups** | Organize friends into named groups with colors/icons. Used for event visibility targeting |
| **Friend Profile** (`friend/[id].tsx`) | View friend's profile, upcoming events, hangout history |
| **Friend Notes** | Private notes on friends (DB table exists, feature in FAQ) |
| **Pinned Friends** | Pin favorite friends to top of list |
| **Blocked Contacts** (`blocked-contacts.tsx`) | Block users, hide from suggestions |
| **Hangout History** | Track which friends you've attended events with |
| **Hangout Streaks** | Weekly streak tracking for consistent hangouts |

### Chat (Circles)
| Feature | Description |
|---------|-------------|
| **Circles** (`circles.tsx`) | Group chat system. Each circle has name, emoji, photo, members |
| **Circle Chat** (`circle/[id].tsx`) | Real-time messaging via WebSocket. Supports text, images, replies, reactions |
| **Circle Polls** | Create polls within circles for group decisions |
| **Circle Events** | Link events to circles for coordinated planning |
| **DMs** | Direct messages via 2-person circles (dmMemberSetKey) |
| **Plan Lock** | Lock/unlock planning state in a circle |

### Profile
| Feature | Description |
|---------|-------------|
| **Profile** (`profile.tsx`) | View own profile: avatar, banner, bio, calendar bio, handle, birthday settings |
| **Edit Profile** (`edit-profile.tsx`) | Edit all profile fields, upload avatar/banner via Cloudinary |
| **Public Profile** (`public-profile.tsx`) | View another user's public profile |
| **Profile Themes** | 24 themes available for profile surface (5 free, 19 premium) |
| **Theme Builder** (`theme-builder.tsx`) | Custom theme creation (premium) |
| **Badges** | Achievement badges with tiers. Featured badge on profile |
| **Work Schedule** | Set weekly availability blocks, visible to friends |

### Subscriptions & Monetization
| Feature | Description |
|---------|-------------|
| **Paywall** (`paywall.tsx`) | Premium upgrade screen with feature comparison |
| **Subscription** (`subscription.tsx`) | Manage subscription, view tier details |
| **Redeem Code** (`redeem-code.tsx`) | Enter promo/discount codes for premium access |
| **Referrals** (`referrals.tsx`) | Invite friends via referral code, earn rewards |

### Notifications
| Feature | Description |
|---------|-------------|
| **Activity Feed** (`activity.tsx`) | In-app notification center |
| **Push Notifications** | Expo push notifications with 26 active tokens |
| **Notification Settings** (`notification-settings.tsx`) | Granular per-category toggles (30+ categories: events, friends, circles, FOMO, digest) |
| **Smart Notifications** | FOMO triggers (friend joined popular event), reconnect suggestions, daily digest |
| **Event Reminders** | Configurable reminder timing per event |

### Onboarding & Auth
| Feature | Description |
|---------|-------------|
| **Login** (`login.tsx`) | Email/password + Apple Sign-In |
| **Onboarding** (`onboarding.tsx`) | First-run flow with checklist |
| **Email Verification** (`verify-email.tsx`) | 6-digit code verification |
| **Welcome** (`welcome.tsx`) | Post-onboarding welcome screen |
| **Password Reset** | Via website reset-password page |

### Admin
| Feature | Description |
|---------|-------------|
| **Admin Dashboard** (`admin.tsx`) | User management, badge management, report review |
| **Admin Reports** (`admin-reports.tsx`, `admin-report-detail.tsx`) | Review user/event reports |

---

## 3. Feature Map — Backend

The backend is a **Hono** server running on **Render** (Node.js runtime). Database: **PostgreSQL on Render**. ORM: **Prisma 6.17**. Auth: **Better Auth** with email/password + Apple Sign-In.

Production URL: `https://open-invite-api.onrender.com`

### API Route Groups

| Route Group | Key Endpoints | Auth | Description |
|-------------|---------------|------|-------------|
| **Auth** `/api/auth/*` | POST apple, GET apple/status | No (public) | Apple Sign-In + Better Auth session management. Rate limited (20/min) |
| **Custom Auth** `/api/auth` | POST sign-in/email, POST sign-up/email | No | Email/password auth with verification |
| **Events CRUD** `/api/events` | GET /, POST /, GET /pending-summaries | Yes | List user events, create event (idempotent), pending summaries |
| **Events Feed** `/api/events` | GET /feed, GET /friends-hosted-feed, GET /attending | Yes | Discover feed (hot-path rate limited), friends feed, attending list |
| **Events RSVP** `/api/events/:id` | POST /join, POST /rsvp, GET /rsvp, DELETE /rsvp, GET /rsvps | Yes | RSVP management with idempotency |
| **Events Interactions** `/api/events/:id` | POST /report, GET /photos, POST /photos, DELETE /photos/:photoId, GET /comments, POST /comments | Yes | Photos, comments, reporting |
| **Events Settings** `/api/events/:id` | PUT /summary, PUT /visibility, PUT /busy, PUT /color, PUT /photo, PUT /hosts | Yes | Event configuration |
| **Events Misc** `/api/events` | GET /templates, POST /templates, DELETE /templates/:id, POST /import, GET /imported | Yes | Templates, calendar import |
| **Events Social** `/api/events` | GET /suggestions, GET /streaks, GET /whos-free, GET /friends-availability | Yes | Social features, hangout streaks, availability |
| **Event Requests** `/api/event-requests` | GET /, GET /:id, POST /, PUT /:id/respond, DELETE /:id, POST /:id/nudge, POST /:id/suggest-time | Yes | Group event proposals |
| **Friends** `/api/friends` | GET /, GET /paginated, GET /requests, POST /request, PUT /request/:id, DELETE /:id, PUT /:id/block, GET /:id/events, GET /suggestions, GET /:id/mutual | Yes | Full friend graph management |
| **Groups** `/api/groups` | GET /, POST /, PUT /:id, DELETE /:id, POST /:id/members, DELETE /:id/members/:friendshipId | Yes | Friend group CRUD |
| **Circles** `/api/circles` | GET /, GET /:id | Yes | Chat circles with messages, polls, events |
| **Profile** `/api/profile` | GET /, PUT /, GET /search, POST /search, GET /stats, GET /:id/profile, PUT /featured-badge | Yes | Profile management, user search |
| **Notifications** `/api/notifications` | GET /, GET /paginated, GET /unseen-count, POST /mark-all-seen, GET /preferences, PUT /preferences, POST /register-token, POST /status | Yes | Full notification system |
| **Push** `/api/push` | GET /me, POST /deactivate, POST /clear-mine, POST /test-self, POST /register, POST /test | Yes | Push token management |
| **Subscription** `/api/subscription` | GET /, GET /limits, POST /upgrade, POST /restore, GET /check-feature/:feature, GET /details, GET /pro-features | Yes | Subscription & entitlement checks |
| **Entitlements** `/api/entitlements` | GET /, POST /check, GET /events/active/count | Yes | Feature gating, active event limits |
| **Hosting** `/api/hosting` | GET /quota | Yes | Event hosting quota checks |
| **Discount Codes** `/api/discount` | GET /validate/:code, POST /redeem, POST /seed, POST /update-limits | Mixed | Discount code system |
| **Promo Codes** `/api/promo` | POST /redeem | Yes | Promo code redemption |
| **Referral** `/api/referral` | GET /me, POST /accept, GET /stats, GET /code, POST /track, POST /apply, GET /leaderboard, GET /validate/:code, POST /claim-reward, GET /pending-rewards | Yes | Full referral system with leaderboard |
| **Public Events** `/api/events/:id` | GET /public, GET /calendar.ics, POST /rsvp/guest | No (rate limited) | Public event page, iCal export, guest RSVP |
| **Webhooks** `/api/webhooks` | POST /revenuecat | Webhook auth | RevenueCat subscription events |
| **Achievements** `/api/achievements` | GET /, GET /:id, PUT /badge | Yes | Badge/achievement system |
| **Badges** `/api/badges` | GET /catalog | Yes | Badge catalog |
| **Birthdays** `/api/birthdays` | GET / | Yes | Friend birthday list |
| **Blocked** `/api/blocked` | GET /, POST /, DELETE /:id, POST /search | Yes | Block/unblock users |
| **Contacts** `/api/contacts` | POST /match | Yes | Contact book matching |
| **Privacy** `/api/privacy` | GET /, PUT /, GET /export, DELETE /account | Yes | Privacy settings, data export, account deletion |
| **Onboarding** `/api/onboarding` | GET /status, POST /complete, GET /checklist | Yes | Onboarding progress |
| **Work Schedule** `/api/work-schedule` | GET /, PUT /settings, PUT /:dayOfWeek, PUT /, GET /user/:userId, GET /check | Yes | Weekly availability |
| **Places** `/api/places` | GET /search | Yes | Google Places search proxy |
| **Reports** `/api/reports` | POST /user, POST /event | Yes | User/event reporting |
| **Widget** `/api/widget` | GET /today, GET /upcoming, GET /summary | Yes | iOS Today Widget data |
| **Upload** `/api/uploads` | Static file serving | No | Uploaded file delivery |
| **Cloudinary** `/api/cloudinary` | POST /upload (event photos, profile photos) | Yes | Direct Cloudinary upload with event-window and rate limits |
| **Share Pages** `/api/share` | GET /event/:id, GET /invite/:code | Rate limited | HTML share pages for link previews |
| **App Config** `/api/config` | GET / | No | Version gates, announcements, feature flags |
| **Cron** `/api/cron` | POST /reminders/run, POST /digest/run | Cron auth | Scheduled reminder and digest dispatch |
| **Admin** `/api/admin` | Multiple CRUD endpoints | Admin auth | User/badge/report management |
| **Health** `/api/health` | GET / | No | Health check |
| **Inventory** `/api/inventory` | GET /founder-spots, GET /early-member-spots | No | Scarcity counters |

### Realtime
- **WebSocket server** (`src/realtime/`) for circle chat: Redis pub/sub for cross-instance broadcast, auth via session token, rate limiting, presence
- **Redis** (ioredis) for WS broadcast and optional caching

### Middleware
- `requireAuth` — session-based auth enforcement
- `requireVerifiedEmail` — email verification gate
- `rateLimit` — global, hot-path, write, heavy, auth-specific rate limiters
- `idempotency` — deduplication for write endpoints
- `requestId` — UUID tracking per request
- `requestLogger` — structured logging
- `adminAuth` / `cronAuth` / `bearerAuth` — specialized auth for admin/cron/API

---

## 4. Feature Map — Website

The website is a **Next.js 16** app hosted on **Vercel** at `https://openinvite.cloud` and `https://www.openinvite.cloud`.

| Route | Description |
|-------|-------------|
| `/` | Landing page: hero with tagline, app store links, feature pills (Circles, Calendar-native, Public + private events, RSVP in seconds), demo embed, contact form |
| `/event/[id]` | Public event page: server-rendered with dynamic OG metadata (title, date, location, cover image). Theme-aware backgrounds. Guest RSVP form. Deep link to app (`open-invite://event/:id`) |
| `/support` | Help/support page with demo video, FAQ, contact info, app store links |
| `/privacy` | Privacy policy (effective Feb 2, 2026) |
| `/terms` | Terms of service (effective Feb 2, 2026) |
| `/delete-account` | Account deletion instructions |
| `/presskit` | Press kit with logos, screenshots, product details |
| `/reset-password` | Password reset flow (calls backend API) |
| `/sitemap.ts` | Dynamic sitemap generation |
| `/robots.ts` | Robots.txt |

### Guest RSVP Flow
1. User shares event link → `openinvite.cloud/event/:id`
2. Website fetches public event data from backend (`GET /api/events/:id/public`)
3. Guest enters name + email/phone → `POST /api/events/:id/rsvp/guest`
4. Backend creates `guest_rsvp` record with token
5. Page shows "Get the App" CTA with app store links

### OG Metadata
Dynamic per-event: title, date + location line, host name, cover image (falls back to default OG banner). Apple Smart App Banner meta tag for deep linking (`app-id=6757429210, app-argument=open-invite://event/:id`).

### Deep Linking
- `/.well-known/apple-app-site-association` — AASA for iOS universal links on `/event/*` paths
- URL rewrite: `/share/event/:id` → `/event/:id` (canonicalization for OG metadata)
- Attribution tracking: URL params (`?src=`, `?ref=`, `?campaign=`) captured and sent to PostHog

---

## 5. Database Schema

80 tables in PostgreSQL on Render. Key tables:

| Table | Purpose | Key Columns | Rows |
|-------|---------|-------------|------|
| `user` | App users | id, email, phone, name, image, referralCode, premiumExpiresAt, onboardingCompleted | 47 |
| `account` | Auth provider links | userId, providerId (credential/apple), accessToken | 44 |
| `session` | Active sessions | userId, token, expiresAt | 371 |
| `Profile` | Extended user profile | userId, handle, bio, avatarUrl, bannerUrl, profileThemeId, profileCardColor, birthday | 1 |
| `event` | Events | title, description, location, emoji, startTime, endTime, visibility, capacity, eventPhotoUrl, themeId, cardColor, hostIds[], isRecurring, pitchIn*, bringList*, eventHook (56 cols) | 167 |
| `event_interest` | RSVPs | eventId, userId, status (going/interested/not_going) | 151 |
| `event_photo` | Event gallery photos | eventId, userId, imageUrl, caption, publicId | 11 |
| `event_comment` | Event comments | eventId, userId, content | 15 |
| `event_group_visibility` | Event → friend group targeting | eventId, groupId | varies |
| `event_join_request` | Private event join requests | eventId, userId, status, message | 0 |
| `event_reminder` | Per-user event reminders | userId, eventId, minutesBefore, isEnabled | 0 |
| `event_template` | Saved event templates | name, emoji, duration, description, userId | 0 |
| `event_request` | Group event proposals | title, description, creatorId, status | 0 |
| `event_request_member` | Proposal responses | eventRequestId, userId, status | 0 |
| `friendship` | Bidirectional friendships | userId, friendId, isBlocked | 192 |
| `friend_request` | Pending friend requests | senderId, receiverId, status | 96 |
| `friend_group` | Named friend groups | name, color, icon, userId | 5 |
| `friend_group_membership` | Friend → group assignments | friendshipId, groupId | varies |
| `friend_note` | Private notes on friends | (exists in schema, minimal use) | 0 |
| `pinned_friendship` | Pinned/favorite friends | userId, friendshipId | 0 |
| `circle` | Chat circles/groups | name, emoji, createdById, type, dmMemberSetKey, lastMessageAt | 33 |
| `circle_member` | Circle membership | circleId, userId, isPinned, isMuted, lastReadAt | varies |
| `circle_message` | Chat messages | circleId, userId, content, imageUrl, replyTo* | 582 |
| `circle_message_reaction` | Message reactions | messageId, userId, emoji | 0 |
| `circle_poll` | In-circle polls | circleId, question | 0 |
| `circle_event` | Circle ↔ event links | circleId, eventId | 0 |
| `notification` | In-app notifications | userId, type, title, body, data, read, actorId | 1,060 |
| `notification_preferences` | Per-user notification toggles | 30+ boolean columns covering every notification type | 2 |
| `notification_delivery_log` | Push deduplication | userId, dedupeKey, sentAt | 4 |
| `push_token` | Expo push tokens | userId, token, platform, isActive, deviceId | 26 |
| `subscription` | Premium subscriptions | userId, tier (free/premium), expiresAt, transactionId | 4 |
| `promo_code` | Redeemable promo codes | code, maxRedemptions, usedCount, durationDays | 1 |
| `promo_redemption` | Promo code usage log | userId, promoCodeId, redeemedAt | 0 |
| `discount_code` | Discount codes (separate system) | code, type (month_free/year_free/lifetime), maxUses, isActive | 7 |
| `referral` | User referrals | referrerId, referredUserId, status, rewardClaimed | 2 |
| `referral_reward` | Referral rewards | userId, rewardType, referralCount | 0 |
| `entitlement_override` | Manual premium grants | userId, entitlementKey, expiresAt, grantedBy, reason | 0 |
| `purchase_event` | RevenueCat webhook events | transactionId, userId, productId, eventType | 0 |
| `story` | User stories (photos/text) | userId, type, content, imageUrl, eventId, visibility, expiresAt | 0 |
| `story_view` | Story view tracking | storyId, userId, viewedAt | 0 |
| `hangout_history` | Friend hangout records | userId, friendId, eventId, hangoutDate | 0 |
| `work_schedule` | Weekly work blocks | userId, dayOfWeek, startTime, endTime, label | 278 |
| `badge_definition` | Achievement badge catalog | key, name, emoji, tierColor, tier, isExclusive | 0 |
| `badge_grant` | Admin-granted badges | userId, badgeKey, grantedBy, reason | 0 |
| `user_badge` | User achievement progress | userId, achievementId | 0 |
| `user_stats` | Aggregate user stats | hostedCompleted, attendedCompleted, referralsVerifiedCount | 0 |
| `business` | Business profiles (planned) | name, handle, category, location, isVerified | 0 |
| `business_event` | Business-hosted events | businessId, title, maxAttendees | 0 |
| `guest_rsvp` | Website guest RSVPs | eventId, name, email, phone, status, token | 3 |
| `blocked_contact` | User blocks | userId, blockedUserId, reason | 0 |
| `event_report` | Event content reports | eventId, reporterId, reason, status, action | 2 |
| `user_report` | User behavior reports | (standard report fields) | 1 |
| `admin_audit_log` | Admin action log | adminUserId, action, targetUserId, payload | 0 |
| `job` | Background job queue | type, payload, status, attempts, maxAttempts | 0 |
| `cron_job_lease` | Distributed cron locks | jobName, ownerId, lockedUntil | 0 |
| `idempotency_record` | Request deduplication | userId, key, route, status, responseJson | varies |

---

## 6. Live Metrics Snapshot

<!-- METRICS: Generated 2026-04-06. Re-run to refresh. -->

### Users
| Metric | Value |
|--------|-------|
| Total users | 47 |
| Auth: email/password | 40 |
| Auth: Apple Sign-In | 4 |
| Onboarding completed | (check `onboardingCompleted` col) |

**Signup trend (last 8 weeks):**
| Week | Signups |
|------|---------|
| Feb 16 | 1 |
| Feb 23 | 5 |
| Mar 2 | 5 |
| Mar 16 | 1 |
| Mar 30 | 4 |
| Apr 6 | 1 |

### Events
| Metric | Value |
|--------|-------|
| Total events | 167 |
| Active (future) | 26 |
| Past | 141 |
| This week | 9 |
| Recurring | 1 |
| With cover photos | 36 |
| With themes | 25 |

**Visibility breakdown:**
| Mode | Count |
|------|-------|
| All friends | 91 |
| Private | 67 |
| Circle only | 8 |
| Specific groups | 1 |

**Category breakdown:** Social (30), Entertainment (2), Food (2), Outdoors (1). 132 uncategorized.

### RSVPs
| Metric | Value |
|--------|-------|
| Total RSVPs | 151 |
| Going | 139 |
| Interested | 11 |
| Not going | 1 |
| Avg RSVPs/event | 0.90 |
| Guest RSVPs (website) | 3 |

### Social
| Metric | Value |
|--------|-------|
| Friendships | 192 |
| Friend requests | 96 |
| Friend groups | 5 |
| Circles | 33 |
| Circle messages | 582 |

### Premium & Codes
| Metric | Value |
|--------|-------|
| Subscriptions | 4 (2 premium active, 1 expired premium, 1 free) |
| Active premium | Alex Duarte (exp 2028-01), Andrew Navagonzalez (exp 2027-02) |

**Discount codes (7):**
| Code | Type | Active | Used/Max |
|------|------|--------|----------|
| AWAKEN | year_free | Yes | 2/10,000 |
| SHEPHERD | year_free | Yes | 0/1,000 |
| LEGACYLEADER | lifetime | Yes | 0/500 |
| LOVEPEOPLE | month_free | Yes | 2/10,000 |
| MONTH1FREE | month_free | No | 0/500 |
| YEAR1FREE | year_free | No | 0/200 |
| LIFETIME4U | lifetime | No | 4/100 |

**Promo codes (1):** AWAKEN — 365 days, 1 used, expires 2026-04-29

### Top Hosts
| Host | Events Created |
|------|---------------|
| Paul Dal | 65 |
| Alex Duarte | 28 |
| valhaus23 | 22 |
| Andrew Navagonzalez | 20 |
| Casey Martinez | 3 |

### Top Events (by RSVPs)
| Event | RSVPs | Date |
|-------|-------|------|
| [DEMO] Sunrise Yoga | 6 | Jan 28 |
| [DEMO] LAN Party | 6 | Feb 18 |
| [DEMO] Morning Coffee | 6 | Feb 25 |
| [DEMO] Gym Session | 5 | Feb 9 |
| [DEMO] Movie Marathon | 5 | Jan 9 |

*Note: Top RSVP'd events are all demo/seed data.*

### Notifications
| Type | Count |
|------|-------|
| EVENT_REMINDER | 304 |
| new_event | 267 |
| event_invite | 221 |
| friend_request | 106 |
| request_accepted | 89 |
| new_attendee | 35 |
| event_rsvp | 12 |
| event_comment | 12 |
| Total | 1,060 |

---

## 7. Technical Architecture

### Frontend (React Native / Expo)
- **Framework:** Expo SDK 53, React Native 0.76.7
- **Router:** expo-router (file-based, `src/app/`)
- **Styling:** NativeWind + Tailwind v3
- **State:** React Query (@tanstack/react-query) for server state, Zustand for local state
- **Auth:** Better Auth (@better-auth/expo) with Apple Sign-In
- **Payments:** RevenueCat (react-native-purchases + react-native-purchases-ui)
- **Analytics:** PostHog (posthog-react-native)
- **Images:** expo-image (ExpoImage) + Cloudinary transforms
- **Animations:** react-native-reanimated v3
- **Gestures:** react-native-gesture-handler
- **Chat UI:** react-native-gifted-chat
- **Graphics:** @shopify/react-native-skia (effects), expo-mesh-gradient
- **Icons:** lucide-react-native (via `@/ui/icons`)
- **Lists:** @shopify/flash-list
- **Calendar:** react-native-calendars
- **Bottom Sheet:** @gorhom/bottom-sheet
- **Package manager:** bun
- **Build:** EAS Build (eas.json)

### Backend (Hono)
- **Runtime:** Node.js (Bun for dev)
- **Framework:** Hono 4.6.0
- **ORM:** Prisma 6.17.1
- **Auth:** Better Auth 1.4.7
- **Database:** PostgreSQL on Render
- **Cache/PubSub:** Redis (ioredis 5.9.3)
- **Realtime:** WebSocket (ws 8.19.0) with Redis broadcast
- **Monitoring:** Sentry (@sentry/node 10.47.0)
- **Email:** Resend (transactional email for verification, password reset)
- **SMS:** Twilio (phone number OTP verification)
- **Push:** Expo Push Notifications (batch fanout, 100/request, deduplication)
- **Image hosting:** Cloudinary (signed uploads, public ID lifecycle tracking)
- **Location:** Google Places API
- **Hosting:** Render (web service, port 10000)
- **Deploy:** `npm install && prisma generate` → `prisma migrate deploy && npx tsx src/server.ts`
- **Cron:** Render cron → event reminders (5min), daily digest (15min), weekly digest (Mon 02:00 UTC), token/session cleanup (weekly)

### Website (Next.js)
- **Framework:** Next.js 16.1.6 with React 19
- **Hosting:** Vercel
- **Analytics:** @vercel/analytics, @vercel/speed-insights, PostHog
- **Font:** DM Sans (Google Fonts)
- **Styling:** Tailwind CSS v4

### Infrastructure Diagram
```
┌─────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Expo App   │────▶│  Render (Hono)   │────▶│  PostgreSQL    │
│  (iOS/Droid)│     │  + WebSocket     │     │  (Render)      │
└─────────────┘     │  + Redis PubSub  │     └────────────────┘
                    └──────────────────┘
┌─────────────┐            │
│  Next.js    │────────────┘
│  (Vercel)   │
└─────────────┘
                    ┌──────────────────┐
                    │  Cloudinary      │  (images)
                    │  RevenueCat      │  (payments)
                    │  Expo Push       │  (notifications)
                    │  Google Places   │  (location)
                    │  Sentry          │  (errors)
                    │  PostHog         │  (analytics)
                    └──────────────────┘
```

### Key Environment Variables

**Frontend:**
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_VIBECODE_REVENUECAT_APPLE_KEY`, `EXPO_PUBLIC_VIBECODE_REVENUECAT_GOOGLE_KEY`, `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, `EXPO_PUBLIC_REALTIME_WS`, `EXPO_PUBLIC_ADMIN_UNLOCK_CODE`

**Backend:**
`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GOOGLE_PLACES_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `SENTRY_DSN`, `CRON_API_KEY`, `CRON_SECRET`, `ADMIN_API_KEY`, `APPLE_IOS_CLIENT_ID`, `REALTIME_WS_ENABLED`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `OPERATOR_INGEST_URL`, `OPERATOR_INGEST_SECRET`

**Website:**
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_GA_ID` + Vercel auto-env

---

## 8. Content & Growth Context

### Brand Voice
Friendly, casual, action-oriented. "Your plans, finally social." Marketing emphasizes effortlessness, showing up, and real-life connection over digital. Pills on landing page: Circles, Calendar-native, Public + private events, RSVP in seconds.

### Distribution Strategy
Church/faith community networks are the initial wedge:
- Promo codes: `AWAKEN` (year free, 10K max), `SHEPHERD` (year free, 1K), `LEGACYLEADER` (lifetime, 500), `LOVEPEOPLE` (month free, 10K)
- These codes target community leaders and congregations for viral adoption

### Growth Hooks
1. **Referral system** — unique referral codes per user, leaderboard, rewards at milestones
2. **Guest RSVP funnel** — non-users can RSVP via website → "Get the App" CTA
3. **Event sharing** — deep links to `openinvite.cloud/event/:id` with rich OG previews
4. **FOMO notifications** — "Friend joined a popular event" triggers
5. **Invite links** — `/invite/:code` for direct circle/event invites
6. **Social proof on cards** — friend avatars + "Sarah +2 friends going" on Discover cards
7. **Scarcity** — "Founder spots" and "Early member spots" inventory counters
8. **Smart notifications** — daily digest, reconnect suggestions, weekly summary

### Active Promo Codes
| Code | Grants | Max Uses | Status |
|------|--------|----------|--------|
| AWAKEN | 1 year premium | 10,000 | Active |
| SHEPHERD | 1 year premium | 1,000 | Active |
| LEGACYLEADER | Lifetime premium | 500 | Active |
| LOVEPEOPLE | 1 month premium | 10,000 | Active |

---

## 9. Known Limitations & TODOs

### From Codebase Scans
1. `src/lib/entitlements.ts:247` — `TODO: Connect to real analytics provider` (analytics tracking stub)
2. `admin-dashboard.html` — `TODO: Implement ban user endpoint`, `TODO: Implement delete user endpoint`
3. **Stories feature** — full schema exists (story, story_view, story_group_visibility) but 0 rows, likely not shipped to users
4. **Business features** — full schema exists (business, business_event, business_team_member, business_follow) but 0 rows, not launched
5. **Badge system** — badge_definition, badge_grant, user_badge tables exist with 0 rows, catalog endpoint exists but no badges defined
6. **Hangout history** — table and streak logic exist but 0 rows, not yet populating
7. **Circle polls** — schema and poll options exist but 0 usage
8. **Event requests** — full propose/vote/confirm flow built but 0 usage
9. **Friend notes** — table exists, route exists, but feature may not be prominent in UI
10. **AVIF decoder removed** — `scripts/patch-expo-image.sh` strips AVIF support from expo-image for build compatibility. Cloudinary `f_auto` was changed to `f_webp` to avoid serving undecodable AVIF
11. **Profile table** — only 1 row despite 47 users, suggesting most users haven't set up extended profiles
12. **Android untested in production** — iOS is primary, Android is "confirmed target" but Google Play link exists
13. **Push tokens** — only 26 active tokens for 47 users (55% coverage)
14. **No automated tests** — no test runner or test files found in frontend
15. **WebSocket scaling** — Redis pub/sub for cross-instance WS broadcast, but unknown if multiple Render instances are running

### Platform Gaps
- Android readiness: `edgeToEdgeEnabled` set, permissions declared, but primary testing is iOS
- `presentCodeRedemptionSheet` (iOS-only) replaced with universal App Store deep link
- iOS Today Widget data endpoints exist (`/api/widget/*`)

---

## 10. Active Goals

### Product State
- **Version:** 1.2.1 (build 317)
- **Stage:** Early/beta with ~47 users, primarily from founder's network
- **Growth channel:** Church community network (promo codes)

### Inferred Goals (from recent activity)
1. **Fix production bugs** — P0 promo code redemption fixed, P1 blank cover images (AVIF → WebP)
2. **Feature polish for v1.2.x** — Friends filter on Discover, group name display, theme expansion
3. **Grow user base** — referral system, guest RSVP funnel, church network codes
4. **Premium conversion** — 2/47 users are paying subscribers, most features are free
5. **Content** — help sheets, FAQ, info sheets actively maintained and audited
6. **Build reliability** — EAS build pipeline issues with lottie-ios, AVIF pods, Xcode compatibility

### Not Yet Launched Features (Built but unused)
- Stories, Business profiles, Badge system, Hangout streaks, Circle polls, Event requests

<!-- END BRAIN.md — Generated 2026-04-06 by Claude Code brain-scan -->
