# Features Reference Guide

**App:** Open Invite - Social coordination iOS app
**Last Updated:** 2026-03-12

---

## Onboarding Flow (v2.2)

### Design Philosophy
- Complete in ≤60 seconds if skipping optional steps
- No OS permission prompts during onboarding
- No paywall or monetization messaging
- All steps skippable except account creation
- Tone: calm, social, human — never salesy

### Screens (7 total)
1. **Welcome** - "Your Social Calendar" with aurora glow icon
2. **Why Open Invite** - 3 glass-style value prop cards
3. **Create Account** - Apple Sign In (iOS) + Email/Password form
4. **Verify Email** - 5-digit code entry (can skip with "I'll do this later")
5. **Profile Name** - Display name input (skippable)
6. **Profile Photo** - Choose/take photo with dashed circle placeholder (skippable)
7. **Mission** - Inspirational quote in glass card, then → Feed screen

### State Persistence
- `onboarding_completed`: "true" when finished
- `onboarding_progress_v2`: In-progress state for resuming
- `verification_deferred`: "true" if user skipped email verification
- `verification_banner_dismissed`: "true" if user dismissed feed banner

---

## Freemium Model (v3.0)

### Product Principle
- **Participation must be free**
- Power, scale, insights, and hosting capabilities are paid
- **Virality Rule:** If Pro user hosts event/owns circle, all participants get Pro-level features

### FREE TIER Limits
| Feature | Limit |
|---------|-------|
| Active events | Unlimited |
| "Who's Free?" | 7 days ahead |
| Friend notes | 5 max |
| Circles | 2 max |
| Circle members | 15 max |
| Upcoming birthdays | 7 days |
| Event history | Last 30 days |
| Achievements | Basic badges only |

### PRO TIER Unlocks
| Feature | Pro Benefit |
|---------|-------------|
| Active events | Unlimited |
| "Who's Free?" | 90 days ahead |
| Friend notes | Unlimited |
| Circles | Unlimited |
| Circle members | Unlimited |
| Upcoming birthdays | 90 days |
| Event history | Full + analytics |
| Achievements | Full system |

### Referral Rewards
| Referrals | Reward |
|-----------|--------|
| 3 verified | 1 month Pro |
| 10 verified | 1 year Pro |
| 40 verified | Lifetime Pro |

### Pricing
| Plan | Price |
|------|-------|
| Free | $0 forever |
| Pro (Early Adopter) | $10/year + 2-week trial |
| Lifetime | $60 (limited quantity) |

---

## Calendar Event Import (.ics)

### Overview
Users import events from Apple Calendar/Google Calendar by sharing to Open Invite. **One-way, event-by-event import** with no calendar permissions.

### How It Works
1. User opens Apple/Google Calendar
2. Taps event → "Share" → "Open Invite"
3. .ics file parsed, event details pre-filled in create screen
4. User reviews, edits, creates as normal Open Invite event

### Implementation
- **File Handler:** `app.json` registers as `.ics` handler
- **Parser:** `src/lib/icsParser.ts` - Pure JS parser (no dependencies)
- **Deep Link:** `src/lib/deepLinks.ts` - Handles .ics URIs, stores pending import
- **Create Screen:** `src/app/create.tsx` - Checks for pending import, pre-fills
- **Help Screen:** `src/app/calendar-import-help.tsx` - User instructions
- **Settings:** "Add events from Apple or Google Calendar" → Help

### Key Principles
- **No calendar permissions:** App does NOT request `NSCalendarsFullAccessUsageDescription`
- **No background sync:** Events imported one-by-one when user explicitly shares
- **App Store safe:** Complies with Apple's calendar access guidelines

---

## Offline Mode MVP (v3.2)

### Overview
App supports offline usage with automatic sync:
- Users stay logged in when offline
- Key actions (create event, RSVP) work offline with optimistic UI
- Queued actions replayed when network returns

### Key Components
- `src/lib/networkStatus.ts` - Network monitoring, `useNetworkStatus()` hook
- `src/lib/useResilientSession.ts` - Session caching, handles offline gracefully
- `src/lib/offlineQueue.ts` - Persistent queue for offline actions
- `src/lib/offlineStore.ts` - Zustand store for local events
- `src/lib/offlineSync.ts` - Queue replay worker, offline mutation hooks
- `src/components/OfflineBanner.tsx` - Network status banner

### Auth Resilience
- **Rule:** Only clear session on HTTP 401/403 from server
- **Never logout on:** Network errors, timeouts, 5xx, DNS failures
- Session cached in AsyncStorage (`session_cache_v1`)

### Offline Queue
- **Action types:** `CREATE_EVENT`, `UPDATE_EVENT`, `RSVP_CHANGE`, `DELETE_RSVP`
- **Status flow:** `pending` → `processing` → removed or `failed`
- **Replay:** FIFO order on network reconnect

---

## Push Notifications (Expo Push Service)

### Setup
- **Provider:** Expo Push Notification Service (free with Expo)
- **Registration:** `registerForPushNotificationsAsync()` in `src/lib/notifications.ts`
- **Hook:** `useNotifications` auto-registers tokens when user logs in
- **Channels:** Android channels (default, events, reminders, social)
- **Storage:** `push_token` table via POST `/api/notifications/register-token`
- **Sender:** `sendPushNotification(userId, notification)` helper
- **API:** Sends to `https://exp.host/--/api/v2/push/send`

### Notification Types
- Event reminders (local + remote)
- New events from friends
- Friend requests & acceptances
- Join requests & acceptances
- Event updates
- FOMO notifications (friend joined event)
- Event reflection reminders
- Test notifications (dev only)

### Testing
`/dev-smoke-tests` → "Push Notification Test" → Enter title/message → Send
**Requires physical device with notifications enabled**

---

## Subscription Management (v2.6)

### Frontend Implementation
- **Main screen:** `src/app/subscription.tsx`
- **Settings card:** Subscription section in Settings > Invite Friends
- **Features:**
  - View current status (Free, Trial, Yearly, Lifetime)
  - Trial end date and charge date display
  - Purchase plans ($10/year with trial, $60 lifetime)
  - Apply discount codes (single-use per user)
  - View discount history
  - Restore purchases
  - Link to App Store management

### Backend Integration
- **Endpoint:** GET `/api/subscription/details`
- **Returns:** Subscription tier, dates, discount history, eligibility
- **Discount rules:**
  - Each code usable once per user
  - Lifetime code blocks future discount usage
  - **Codes:** MONTH1FREE, YEAR1FREE, LIFETIME4U

---

## Dev Smoke Tests QA Harness

### Location & Purpose
- **File:** `src/app/dev-smoke-tests.tsx`
- **Purpose:** Comprehensive QA for paywalls, navigation, notifications

### Features
1. **Paywall CTA Audit** - Guided manual audit of all 10 PaywallContext types
2. **PaywallContext Coverage** - Single source of truth constant validation
3. **Navigation Tests** - Quick buttons for all major routes
4. **Notification Tests** - Permission modal + push test with custom messages
5. **Session State** - Real-time display of paywall/notification state
6. **Current Plan Info** - Entitlements data display

### PaywallContext Coverage
```typescript
const PAYWALL_CONTEXTS: PaywallContext[] = [
  "RECURRING_EVENTS", "WHOS_FREE_HORIZON",
  "UPCOMING_BIRTHDAYS_HORIZON", "CIRCLES_LIMIT", "CIRCLE_MEMBERS_LIMIT",
  "INSIGHTS_LOCKED", "HISTORY_LIMIT", "PRIORITY_SYNC_LOCKED", "PREMIUM_THEME"
];
```

---

## Privacy Features (v2.5)

### Privacy Settings
- **Friend requests:** "everyone" | "friends_of_friends" | "nobody"
- **Friend suggestions:** Show/hide in "People You May Know"
- **Calendar availability:** Share/hide in "Who's Free"

### Data Controls
- **Export:** GET `/api/privacy/export` - Full user data as JSON
- **Deletion:** DELETE `/api/privacy/account` - Permanent account deletion

### Implementation
- **Frontend:** `src/app/privacy-settings.tsx`
- **Backend enforcement:** All relevant endpoints respect privacy flags
- **Database fields:** `allowFriendRequests`, `showInFriendSuggestions`, `shareCalendarAvailability`

---

## See Also

- `docs/BACKEND_ARCHITECTURE.md` - Technical implementation details
- `docs/PRODUCTION_DEPLOYMENT.md` - Deployment processes
- `docs/UX_CONTRACTS.md` - UX behavior requirements
- `docs/KNOWN_ISSUES.md` - Troubleshooting guide