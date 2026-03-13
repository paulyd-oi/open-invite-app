# Backend Architecture (Current State)

**Backend Version:** v2.9
**Last Updated:** 2026-03-12

---

## CRITICAL: Entry File Difference (VERY IMPORTANT)

- **Render production uses `src/server.ts`** (see logs: `Running 'node --import tsx src/server.ts'`)
- **Vibecode dev uses `src/index.ts`**
- **When adding new routers, you MUST add them to BOTH files!**

---

## All Routers (Both server.ts AND index.ts Required)

```typescript
// These 26 routers must be in both entry files:
uploadRouter, sampleRouter, eventsRouter, friendsRouter, groupsRouter,
notificationsRouter, profileRouter, placesRouter, blockedRouter, birthdaysRouter,
workScheduleRouter, friendNotesRouter, subscriptionRouter, onboardingRouter,
referralRouter, eventRequestsRouter, achievementsRouter, emailVerificationRouter,
discountRouter, circlesRouter, webhooksRouter, widgetRouter,
businessesRouter, businessEventsRouter, profilesRouter, privacyRouter,
entitlementsRouter, cronRouter, appleAuthRouter
```

---

## Key Features (Current server.ts)

- **All 26 routers** (including friendNotesRouter double-mounted on /api/friends)
- **HTML pages:** `/email-verified`
- **Universal links:** `/share/event/:id`, `/invite/:code` referral links
- **Public API:** `/api/events/public/:id`
- **Event endpoints:** `/api/events/:id`, `/api/events/calendar-events`
- **Privacy:** `/api/privacy` (settings, data export, account deletion)
- **Subscription:** `/api/subscription/details` (detailed info with discount history)
- **Birthdays:** `/api/birthdays` (user + friends' birthdays)
- **Profile stats:** `/api/profile/stats` (FINISHED events only)
- **Apple Sign In:** `/api/auth/apple` (JWKS verification)
- **Health check:** `/health`
- **Rate Limiting:** Global (200/min), Auth (50/15min)
- **Database Indexes:** Performance indexes on event, friendship, notification, session, friend_request
- **Session Duration:** 90 days
- **Persistent Disk:** Render disk mounted at `/opt/render/project/src/uploads` for image storage

---

## Auth Bootstrap & Session Sync (v3.3)

**CRITICAL PRINCIPLE:** Whenever you mutate user profile data (name, image, handle, bio), you MUST:
1. Save to backend via `POST /api/profile`
2. Immediately refetch session via `authClient.$fetch("/api/auth/get-session")` to update Better Auth cache
3. This ensures UI updates instantly without requiring app restart

**Files Changed for Session Bootstrap:**
- `src/app/welcome.tsx` - Added session refetch after name/avatar save
- `src/app/profile.tsx` - Improved display name fallback logic
- `src/lib/useResilientSession.ts` - Added `forceRefetchSession()` method

**Display Name Fallback Chain:**
`name → @handle → email local-part → "Account"`

---

## API Endpoints Reference

### User Search API (v3.2) - Instagram-style Friend Search
- **Endpoint:** GET `/api/profile/search?q={query}&limit={limit}`
- **Purpose:** Live, ranked user search for finding friends
- **Query Classification:**
  - `@username` → handle search
  - `email@domain.com` → email search
  - `1234567890` → phone search (4+ digits)
  - Otherwise → name + email prefix + handle search
- **Ranking Score:** Exact handle match (+1000), exact email (+900), handle starts with (+800), name starts with (+700), etc.
- **Security:** Excludes blocked users (both directions), requires auth
- **Frontend:** Live results in `src/app/friends.tsx` with 300ms debounce

### Calendar Events API (v3.1)
- **Endpoint:** GET `/api/events/calendar-events?start={ISO}&end={ISO}`
- **Purpose:** Calendar view events (both created + RSVP "Going")
- **Date Filtering:** Overlap query: `event.startTime < rangeEnd AND (event.endTime > rangeStart OR event.startTime >= rangeStart)`
- **Response:** `{ createdEvents: [Event], goingEvents: [Event] }`
- **Sources:** `event_interest` (RSVP) + `event_join_request` (legacy)
- **Sorting:** Both arrays by startTime ascending

### Birthdays Feature (v2.7)
- **Backend:** `/api/birthdays` returns user's birthday + friends' birthdays
- **Own birthday:** Marked with `isOwnBirthday: true`
- **Friends' birthdays:** Only if friend has `showBirthdayToFriends: true`
- **Frontend Calendar:** Pink events, "Upcoming Birthdays" section (30 days, max 5)

### Privacy Settings (v2.5)
- **Database fields:**
  - `allowFriendRequests`: "everyone" | "friends_of_friends" | "nobody"
  - `showInFriendSuggestions`: boolean (default true)
  - `shareCalendarAvailability`: boolean (default true)
- **Enforcement:** friend requests, suggestions, who's free all respect privacy
- **Data export:** GET `/api/privacy/export` - exports all user data as JSON
- **Account deletion:** DELETE `/api/privacy/account` - permanent deletion

### Friend Suggestions (People You May Know)
- **Endpoint:** GET `/api/friends/suggestions` - friends-of-friends
- **Privacy:** Users with `showInFriendSuggestions: false` excluded
- **Friend request:** POST `/api/friends/request` accepts `userId` + email/phone

---

## Render Persistent Disk (v2.8)

- **Mount Path:** `/opt/render/project/src/uploads`
- **Size:** 1 GB (expandable in dashboard)
- **Stores:** Profile pictures, business logos, event images
- **Code paths:**
  - Production: `/opt/render/project/src/uploads`
  - Development: `./uploads` (relative to cwd)
- **Static serving:** Files accessible at `https://api.openinvite.cloud/uploads/filename.jpg`

---

## Apple Sign In (v2.9)

### Configuration
- **Bundle ID:** `com.vibecode.openinvite.0qi5wk`
- **Apple Team ID:** `T3LP6XXS49` (env: APPLE_TEAM_ID)

### Backend Implementation
- **Route:** `POST /api/auth/apple`
- **File:** `backend/src/routes/appleAuth.ts`
- **Verification:** JWKS from `https://appleid.apple.com/auth/keys`
- **Dependencies:** `jose` package for JWT verification

### Email-Optional Users (v3.0)
- **Database:** `user.email` is nullable
- **Identity:** Keyed by `account(providerId="apple", accountId=sub)`, NOT email
- **Backend:** All routes use optional chaining on `user.email`
- **Frontend:** All `user.email` accesses use `?.` operators

---

## Performance & Scale (v2.4)

- **Rate Limiting:** `backend/src/middleware/rateLimit.ts`
- **Database Indexes:** Migration `20260114074927_add_performance_indexes`
- **Toast Notifications:** Replace Alert.alert() for better UX
- **Frontend:** No logout on 429 errors

---

## Shared Contracts Pattern

**Files:**
- Frontend: `/home/user/workspace/shared/contracts.ts`
- Backend: `/home/user/workspace/backend/src/shared/contracts.ts`

**CRITICAL:** These files must stay in sync!

**Pattern:**
```typescript
// Define Zod schemas in shared/contracts.ts
export const friendshipSchema = z.object({...});
export type Friendship = z.infer<typeof friendshipSchema>;

// Use schema for validation in backend
// Use type for TypeScript in frontend
```

---

## Email Verification Flow

1. User signs up via Better Auth
2. Backend sends 5-digit code via Resend API
3. User enters code in app
4. Code verified via `/api/email-verification/verify`
5. User signed in automatically after verification

---

## Key Backend Files

- `backend/src/server.ts` - **RENDER PRODUCTION ENTRY** (not index.ts!)
- `backend/src/index.ts` - Vibecode dev server entry
- `backend/src/routes/friends.ts` - Friends API with `serializeFriendship()`
- `backend/src/routes/emailVerification.ts` - Email verification endpoints
- `backend/src/routes/profile.ts` - Profile routes including admin delete
- `backend/src/routes/appleAuth.ts` - Apple Sign In with JWKS verification
- `shared/contracts.ts` - Zod schemas for API types