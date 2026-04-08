# Open Invite — App Brain

<!-- GENERATED: 2026-04-07. Re-run the brain-scan prompt to refresh. -->
<!-- Scanned: open-invite-app, my-app-backend, openinvite-website, production DB -->

---

## PRODUCT

### What Open Invite Is

Open Invite is a social calendar app for coordinating real-life plans with friends. Users create events, RSVP, discover what friends are doing, chat in circles (group conversations), and build a friend graph. The app prioritizes spontaneous, low-friction planning over formal event management. Available on iOS (App Store ID: 6757429210, Bundle ID: com.vibecode.openinvite.0qi5wk).

### Core User Flows

**Create Event:** Home/Calendar tab > Create button > Title, date, time, location, emoji, visibility, theme > Optional: cover photo, description, co-hosts, capacity, RSVP deadline, Pitch In, Bring List > Publish. Events can be open_invite (public), all_friends, specific_groups, circle_only, or private.

**RSVP:** Discover/Calendar/Friend feed > Tap event > Going / Interested / Maybe / Not Going. Join requests for capacity-limited events. RSVP deadline enforcement. Sticky RSVP bar on scroll.

**Discover:** Discover tab shows events from friends, friends-of-friends (2nd degree), and open_invite events. Tabs: For You, Friends (events friends RSVPed to), Nearby. Social proof (X friends going).

**Chat (Circles):** Circles are group chats or DMs. Create circle > Add members > Chat. Features: replies, reactions, polls, plan locks, typing indicators, event sharing, read receipts, notification levels. DMs are get-or-create with deterministic key.

**Friend Graph:** Add friends via contacts, search, or referral links. Friend requests with accept/decline. Friend groups for event visibility segmentation. Friend notes, mutual friends, reconnection suggestions, hangout history.

### Monetization Model

**Free tier:** 5 events/month, 2 circles, 15 circle members, 5 friend notes, 7-day Who's Free, 7-day birthdays, 5 basic themes.
**Founder Pro (premium):** Unlimited events, circles, members, notes. 90-day Who's Free & birthdays. 21 premium themes, custom Theme Studio, effects, recurring events, analytics, priority sync. Pricing: $10/year (early adopter), $25-40/year (future), $60 lifetime. Via RevenueCat (App Store IAP). Offering ID: "default", Entitlement: "premium".

### Current State

- **Users:** 46 registered, ~47 with guests
- **Events:** 172 created
- **Messages:** 584 circle messages
- **Friendships:** 192
- **Sessions:** 427
- **Deployment:** Backend on Render (auto-deploy from main), Website on Vercel, App via App Store + OTA
- **App Store ID:** 6757429210
- **Bundle ID:** com.vibecode.openinvite.0qi5wk
- **Android Package:** com.vibecode.openinvite.x0qi5wk

---

## ARCHITECTURE

### Frontend: React Native / Expo

- **Framework:** React Native 0.79.6 + Expo 53.0.27
- **Language:** TypeScript (strict)
- **Routing:** Expo Router 5.1.10 (file-based, typed routes)
- **State:** React Query 5.90.2 (server state), Zustand 5.0.9 (2 stores), SecureStore (auth tokens)
- **Styling:** NativeWind 4.1.23 (Tailwind for RN)
- **Animation:** React Native Reanimated 3.17.4, Skia, Lottie
- **Auth:** Better Auth 1.4.7 + expo plugin + Apple Sign-In
- **Monetization:** RevenueCat 9.6.7
- **Analytics:** PostHog 4.35.1
- **Error Tracking:** Sentry 6.14.0
- **Navigation:** 5-tab bottom bar: Discover | Calendar | Social (center) | Friends | Profile
- **Key libs:** expo-notifications, expo-calendar, expo-location, expo-image-picker, @gorhom/bottom-sheet

### Backend: Hono on Render

- **Framework:** Hono (TypeScript)
- **Runtime:** Node.js on Render
- **Database:** PostgreSQL (Prisma 6.19.1 ORM)
- **Auth:** Better Auth (Prisma adapter, sessions, Apple Sign-In, phone OTP via Twilio)
- **Email:** Resend (verification, password reset, RSVP confirmation)
- **Images:** Cloudinary (signed uploads, server-side transforms)
- **Push:** Expo Push Notifications (with async job worker fanout)
- **Realtime:** WebSocket server with optional Redis fanout
- **Cron:** 8 scheduled jobs with lease-based distributed locking
- **Rate Limiting:** In-memory, per-user/per-IP, 6 presets (auth/write/hotpath/heavy/global/email)

### Website: Next.js on Vercel

- **Framework:** Next.js 16.1.6 (App Router)
- **Styling:** Tailwind CSS v4
- **Font:** DM Sans (via next/font)
- **Analytics:** Vercel Analytics, PostHog
- **Pages:** Landing, public event page (ISR, 30s revalidation), privacy, terms, support, presskit, delete-account, reset-password
- **Domain:** openinvite.cloud (www redirect), go.openinvite.cloud (share links)

### How They Connect

- **API:** Frontend → https://open-invite-api.onrender.com/api/*
- **Website → Backend:** Server-side fetch for public events, client-side for guest RSVP
- **Shared Types:** `shared/contracts.ts` synced between frontend and backend (Zod schemas)
- **Auth:** Better Auth cookies (web) + x-oi-session-token header (mobile)
- **Deep Links:** open-invite:// scheme, Universal Links via openinvite.cloud/.well-known/apple-app-site-association
- **Push:** Backend → Expo Push Service → APNs/FCM → Device

### Infrastructure

- **paulsmbp:** Primary development machine (macOS). All three repos here.
- **paulyd-mini:** Mac mini running PM2 services (OpenClaw operator, attribution engine). Receives BRAIN.md for content generation context.
- **Render:** Backend hosting. Auto-deploys from main branch. PostgreSQL database.
- **Vercel:** Website hosting. Auto-deploys.
- **Cloudinary:** Image CDN. Signed uploads, server-side transforms (webp, resize).
- **RevenueCat:** Subscription management. Webhook to backend for purchase events.
- **Expo:** OTA updates, push notification service, build service (EAS).

---

## SCREENS & FEATURES (Frontend)

### Tab Bar (5 Tabs — INVARIANT order)

| Index | Key | Icon | Route | Description |
|-------|-----|------|-------|-------------|
| 0 | discover | Sparkles | /discover | Discover events feed (For You, Friends, Nearby) |
| 1 | calendar | Calendar | /calendar | Personal calendar with day/list views, work schedule overlay |
| 2 | social | List | /social | Social feed (CENTER tab, emphasized) |
| 3 | friends | Users | /friends | Friends list with People/Chats/Activity panes |
| 4 | profile | User | /profile | User profile, settings, subscription |

### All Screen Files

| Screen | File Path | Description |
|--------|-----------|-------------|
| Home/Entry | `app/index.tsx` | App entry point |
| Login | `app/login.tsx` | Email/password + Apple Sign-In |
| Welcome | `app/welcome.tsx` | Post-signup welcome |
| Onboarding | `app/onboarding.tsx` | Guided onboarding flow |
| Discover | `app/discover.tsx` | Event discovery feed |
| Calendar | `app/calendar.tsx` | Personal calendar |
| Social | `app/social.tsx` | Social feed |
| Friends | `app/friends.tsx` | Friends management |
| Profile | `app/profile.tsx` | User profile |
| Event Detail | `app/event/[id].tsx` | Event view/RSVP/comments/photos |
| Event Request | `app/event-request/[id].tsx` | Group event request detail |
| Circle Detail | `app/circle/[id].tsx` | Circle chat/members/events |
| Friend Profile | `app/friend/[id].tsx` | Friend detail view |
| User Profile | `app/user/[id].tsx` | Public user profile |
| Create Event | `app/create.tsx` | Event creation form (SSOT for authoring) |
| Create Settings | `app/create-settings.tsx` | Advanced event settings |
| Create Request | `app/create-event-request.tsx` | Event request creation |
| Settings | `app/settings.tsx` | Main settings |
| Account Settings | `app/account-settings.tsx` | Account management |
| Account Center | `app/account-center.tsx` | Account center |
| Edit Profile | `app/edit-profile.tsx` | Profile editor |
| Privacy Settings | `app/privacy-settings.tsx` | Privacy controls |
| Notification Settings | `app/notification-settings.tsx` | Push notification preferences |
| Circles | `app/circles.tsx` | Circles management |
| Add Friends | `app/add-friends.tsx` | Friend discovery/search |
| Activity | `app/activity.tsx` | Activity feed |
| Suggestions | `app/suggestions.tsx` | Event suggestions |
| Who's Free | `app/whos-free.tsx` | Friend availability view |
| Import Calendar | `app/import-calendar.tsx` | Device calendar import |
| Calendar Import Help | `app/calendar-import-help.tsx` | Import instructions |
| Subscription | `app/subscription.tsx` | Subscription management |
| Paywall | `app/paywall.tsx` | Premium paywall |
| Referrals | `app/referrals.tsx` | Referral program |
| Redeem Code | `app/redeem-code.tsx` | Promo code redemption |
| Help/FAQ | `app/help-faq.tsx` | Help & FAQ |
| Public Profile | `app/public-profile.tsx` | Shareable public profile |
| Verify Email | `app/verify-email.tsx` | Email verification |
| Theme Builder | `app/theme-builder.tsx` | Custom theme creator (Theme Studio) |
| Admin | `app/admin.tsx` | Admin panel |
| Admin Reports | `app/admin-reports.tsx` | Admin reports list |
| Admin Report Detail | `app/admin-report-detail.tsx` | Report detail |
| Blocked Contacts | `app/blocked-contacts.tsx` | Blocked contacts list |

---

## COMPONENT INVENTORY (Frontend)

### 169 Total Components across 14+ groups

### Core Shared Components

| Component | File | Key Props |
|-----------|------|-----------|
| BottomSheet | `src/components/BottomSheet.tsx` | visible, onClose, title, heightPct, maxHeightPct, backdropOpacity, enableBackdropClose, keyboardMode, headerRight, children |
| InviteFlipCard | `src/components/InviteFlipCard.tsx` | title, imageUri, emoji, countdownLabel, dateLabel, timeLabel, locationDisplay, hostedBy, heroImage, theme, isFlipped, onFlip, attendees |
| ThemePicker | `src/components/customization/ThemePicker.tsx` | themeIds, packs, selectedThemeId, userIsPro, themeColor, isDark, onThemeSelect, onPremiumUpsell, layout |
| EffectTray | `src/components/create/EffectTray.tsx` | Premium effect filtering, visual effects selection |
| ShareApp | `src/components/ShareApp.tsx` | variant (icon/compact/full) |
| ShareToFriendsSheet | `src/components/event/ShareToFriendsSheet.tsx` | Share event with friends overlay |
| BottomNavigation | `src/components/BottomNavigation.tsx` | Floating island design, 56px height |
| AppHeader | `src/components/AppHeader.tsx` | Header chrome |
| ConfirmModal | `src/components/ConfirmModal.tsx` | Generic confirmation dialog |
| EmptyState | `src/components/EmptyState.tsx` | Empty state placeholder |
| EntityAvatar | `src/components/EntityAvatar.tsx` | Avatar for users/circles |
| Toast | `src/components/Toast.tsx` | Toast notifications |
| Skeleton | `src/components/Skeleton.tsx` | Loading skeletons |

### Calendar Components (`src/components/calendar/`)

- CalendarBirthdaysSection.tsx
- CalendarBusyBlockModal.tsx
- CalendarDayCells.tsx
- CalendarEventListItem.tsx
- CalendarFirstLoginGuideModal.tsx
- CalendarHeaderChrome.tsx
- CalendarListView.tsx

### Circle/Chat Components (`src/components/circle/`)

- CircleAddMembersModal.tsx
- CircleAvailabilitySection.tsx / Sheet.tsx
- CircleChatOverlays.tsx / Section.tsx
- CircleCreateEventModal.tsx
- CircleEditMessageOverlay.tsx
- CircleFriendSuggestionModal.tsx
- CircleHeaderChrome.tsx
- CircleLifecycleChips.tsx
- CircleMembersSection.tsx / Sheet.tsx
- CircleNextEventCard.tsx
- CircleNotifyLevelSheet.tsx
- CirclePlanLockSheet.tsx
- CirclePollSheet.tsx
- CircleReactionPicker.tsx
- CircleRemoveMemberModal.tsx
- CircleSettingsSheet.tsx

### Create Event Components (`src/components/create/`)

- CardColorPicker.tsx
- CoverMediaPickerSheet.tsx
- CreateBottomDock.tsx
- CreateCoverRow.tsx
- CreateDateTimeSection.tsx
- CreateEditorHeader.tsx
- CreateFormFields.tsx
- CreateLocationSection.tsx
- CreatePreviewHero.tsx
- CreateSheets.tsx
- EffectTray.tsx
- MotifOverlay.tsx
- SettingsSheetContent.tsx
- ThemeTray.tsx

### Event Detail Components (`src/components/event/`)

- AboutCard.tsx — Event description/details
- AttendeesSheet.tsx — Full attendee list
- BusyBlockGate.tsx — Busy event access gate
- CalendarSyncModal.tsx — Add to device calendar
- ColorPickerSheet.tsx — Per-event color override
- ConfirmedAttendeeBanner.tsx — "You're going" banner
- DiscussionCard.tsx — Comments section
- EditPhotoButton.tsx — Photo editing
- EventActionsSheet.tsx — Action sheet (share, report, etc.)
- EventDetailErrorState.tsx — Error fallback
- EventFlyer.tsx — Shareable event flyer
- EventHeroBackdrop.tsx — Hero image backdrop
- EventHeroNav.tsx — Navigation over hero
- EventModals.tsx — Modal container
- EventSettingsAccordion.tsx — Host settings panel
- FindFriendsNudge.tsx — Friend discovery nudge
- HostActionCard.tsx — Host-specific actions
- HostReflectionCard.tsx — Post-event reflection
- HostToolsRow.tsx — Host tools (edit, delete, co-host)
- MemoriesRow.tsx — Event memory photos
- PhotoNudge.tsx — Photo upload prompt
- PhotoUploadSheet.tsx — Photo upload
- PostCreateNudge.tsx — After event creation
- PrivacyRestrictedGate.tsx — Privacy-restricted content
- ReportModal.tsx — Report event/user
- RsvpButtonGroup.tsx — RSVP buttons
- RsvpStatusDisplay.tsx — Current RSVP status
- RsvpSuccessPrompt.tsx — Post-RSVP prompt
- ShareFlyerSheet.tsx — Share flyer
- ShareToFriendsSheet.tsx — Share to friends
- SocialProofRow.tsx — "X friends going"
- StickyRsvpBar.tsx — Sticky RSVP on scroll
- ThemeBackgroundLayers.tsx — Theme visual layers
- WhosComingCard.tsx — Attendee preview

### Friends Components (`src/components/friends/`)

- FriendsActivityPane.tsx — Activity feed
- FriendsChatsPane.tsx — DM/circle chats
- FriendsPeoplePane.tsx — Friends list

### Settings Components (`src/components/settings/`)

- ReferralCounterSection.tsx
- SettingsAdminPasscodeModal.tsx
- SettingsBirthdaySection.tsx
- SettingsEditProfileSection.tsx
- SettingsNotificationsDevTools.tsx
- SettingsProfileAppearanceSection.tsx
- SettingsProfileCard.tsx
- SettingsPushDiagnosticsModal.tsx
- SettingsSubscriptionSection.tsx
- SettingsThemeSection.tsx
- SettingsWorkScheduleSection.tsx

### Paywall Components (`src/components/paywall/`)

- PaywallModal.tsx
- PremiumUpsellSheet.tsx

### Chat Components (`src/components/chat/`)

- EventShareCard.tsx — Rich event card in chat messages

### UI Primitives (`src/ui/`)

- Button.tsx, IconButton.tsx, Chip.tsx
- Tile.tsx
- icons.tsx (Lucide)
- tokens.ts, glassTokens.ts (design tokens)
- layout.ts, motion.ts
- SafeAreaScreen.tsx

---

## API SURFACE (Backend)

### Route Groups with File Paths

All routes mounted at `/api/` prefix. Auth required unless noted.

#### Admin (`src/routes/admin.ts`) — requireAdmin
| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/me | Current admin user |
| GET | /admin/users | List users (paginated) |
| GET | /admin/users/search | Search users |
| GET | /admin/users/:userId | User detail |
| POST | /admin/users/:userId/subscription | Set subscription |
| GET | /admin/users/:userId/badges | User badges |
| POST | /admin/users/:userId/badges/grant | Grant badge |
| POST | /admin/users/:userId/badges/revoke | Revoke badge |
| GET | /admin/users/:userId/entitlements | User entitlements |
| POST | /admin/entitlements/grant | Grant entitlement override |
| POST | /admin/entitlements/revoke | Revoke entitlement override |
| GET | /admin/badges | All badge definitions |
| POST | /admin/badges | Create badge definition |
| PATCH | /admin/badges/:key | Update badge |
| POST | /admin/badges/grant | Grant badge by key |
| POST | /admin/badges/revoke | Revoke badge by key |
| GET | /admin/reports | All reports |
| GET | /admin/reports/:reportId | Report detail |
| POST | /admin/reports/:reportId/resolve | Resolve report |
| POST | /admin/events/:id/clear-under-review | Clear review flag |
| GET | /admin/events/:id/goingcount-audit | Audit going count |
| GET | /admin/health/hotpath | Hotpath health |
| GET | /admin/ws-stats | WebSocket stats |
| GET | /admin/realtime-status | Realtime status |
| GET | /admin/analytics | Dashboard analytics |
| GET | /admin/analytics/users | User analytics |

#### Auth (`src/routes/appleAuth.ts`, `src/routes/customAuth.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/apple | Apple Sign-In |
| GET | /auth/apple/status | Apple auth status |
| POST | /auth/sign-in/email | Email sign-in |
| POST | /auth/sign-up/email | Email sign-up |

#### Events — CRUD (`src/routes/events-crud.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /events | User's events |
| GET | /events/pending-summaries | Events needing summary |
| POST | /events | Create event (idempotent, rate-limited) |
| GET | /events/:id | Event detail |
| PUT | /events/:id | Update event |
| DELETE | /events/:id | Delete event |

#### Events — Feed (`src/routes/events-feed.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /events/feed | Discover feed (FoF visibility) |
| GET | /events/friends-hosted-feed | Friends-hosted events |
| GET | /events/attending | Events user is attending |
| GET | /events/calendar-events | Calendar view events |
| GET | /events/activity-feed | Activity feed |

#### Events — RSVP (`src/routes/events-rsvp.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /events/:id/join | Join event (capacity-gated) |
| POST | /events/:id/rsvp | Set RSVP status |
| GET | /events/:id/rsvp | Get viewer's RSVP |
| DELETE | /events/:id/rsvp | Remove RSVP |
| GET | /events/:id/rsvps | All RSVPs |
| GET | /events/:id/attendees | Attendee list |

#### Events — Social (`src/routes/events-social.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /events/suggestions | Friend reconnection suggestions |
| GET | /events/streaks | Hosting streaks |
| GET | /events/whos-free | Who's free availability |
| GET | /events/friends-availability | Friends' availability |
| POST | /events/shared-availability | Check shared availability |
| GET | /events/nearby | Nearby events |
| POST | /events/hangout | Record hangout |
| POST | /events/suggested-times | AI time suggestions |
| POST | /events/:eventId/share | Share event to DMs/circles |

#### Events — Settings (`src/routes/events-settings.ts`)
| Method | Path | Description |
|--------|------|-------------|
| PUT | /events/:id/summary | Set post-event summary |
| POST | /events/:id/summary/dismiss | Dismiss summary prompt |
| PUT | /events/:id/visibility | Change visibility |
| PUT | /events/:id/busy | Toggle busy status |
| PUT | /events/:id/color | Set card color |
| PUT | /events/:id/photo | Set/remove event photo |
| PUT | /events/:id/hosts | Set co-hosts |
| POST | /events/:id/bring-list/:itemId/claim | Claim bring-list item |
| POST | /events/:id/bring-list/:itemId/unclaim | Unclaim item |

#### Events — Interactions (`src/routes/events-interactions.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /events/:eventId/report | Report event |
| GET | /events/:id/photos | Event photos |
| POST | /events/:id/photos | Upload photo |
| DELETE | /events/:eventId/photos/:photoId | Delete photo |
| GET | /events/:id/comments | Event comments |
| POST | /events/:id/comments | Post comment |
| DELETE | /events/:eventId/comments/:commentId | Delete comment |

#### Events — Misc (`src/routes/events-misc.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /events/templates | User's event templates |
| POST | /events/templates | Create template |
| DELETE | /events/templates/:id | Delete template |
| POST | /events/import | Import device calendar (batch) |
| GET | /events/imported | List imported events |
| DELETE | /events/imported/clear | Clear all imports |

#### Event Requests (`src/routes/eventRequests.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /event-requests | User's event requests |
| GET | /event-requests/:id | Request detail |
| POST | /event-requests | Create request |
| PUT | /event-requests/:id/respond | Respond to request |
| DELETE | /event-requests/:id | Delete request |
| POST | /event-requests/:id/nudge | Nudge members |
| POST | /event-requests/:id/suggest-time | Suggest time |

#### Circles (`src/routes/circles.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /circles | User's circles |
| GET | /circles/:id | Circle detail |
| POST | /circles | Create circle |
| PUT | /circles/:id | Update circle |
| DELETE | /circles/:id | Delete circle |
| POST | /circles/:id/pin | Pin/unpin circle |
| POST | /circles/:id/mute | Mute/unmute circle |
| POST | /circles/:id/members | Add members |
| DELETE | /circles/:id/members/:userId | Remove member |
| GET | /circles/:id/messages | Get messages (paginated, cursor) |
| POST | /circles/:id/messages | Send message (idempotent) |
| POST | /circles/:id/messages/:messageId/reactions | Add reaction |
| GET | /circles/:id/availability-summary | Group availability |
| GET | /circles/:id/availability | Detailed availability |
| POST | /circles/:id/events | Create circle event |
| POST | /circles/:id/read | Mark read |
| POST | /circles/:id/read-horizon | Update read horizon |
| GET | /circles/unread/count | Unread count |
| POST | /circles/:id/typing | Send typing indicator |
| GET | /circles/:id/typing | Get typing users |
| GET | /circles/:id/plan-lock | Get plan lock |
| POST | /circles/:id/plan-lock | Set plan lock |
| POST | /circles/:id/polls | Create poll |
| POST | /circles/:id/polls/:pollId/vote | Vote on poll |
| GET | /circles/:id/polls | Get polls |
| GET | /circles/:id/notification-level | Get notification level |
| POST | /circles/:id/notification-level | Set notification level |
| GET | /circles/:id/lifecycle | Get lifecycle state |
| POST | /circles/:id/lifecycle | Set lifecycle state |
| POST | /circles/dm | Get-or-create DM |
| POST | /circles/friends/:friendshipId/pin | Pin friendship |
| GET | /circles/friends/pinned | Get pinned friendships |

#### Friends (`src/routes/friends.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /friends | All friends |
| GET | /friends/paginated | Paginated friends |
| GET | /friends/requests | Friend requests |
| POST | /friends/request | Send friend request |
| PUT | /friends/request/:id | Accept/decline |
| DELETE | /friends/:id | Unfriend |
| PUT | /friends/:id/block | Block friend |
| GET | /friends/:id/events | Friend's events |
| GET | /friends/suggestions | Friend suggestions |
| GET | /friends/:id/mutual | Mutual friends |
| GET | /friends/reconnect | Reconnection suggestions |

#### Friend Notes (`src/routes/friendNotes.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /friend-notes/:friendshipId/notes | Get notes |
| POST | /friend-notes/:friendshipId/notes | Create note |
| PUT | /friend-notes/:friendshipId/notes/:noteId | Update note |
| DELETE | /friend-notes/:friendshipId/notes/:noteId | Delete note |

#### Friend Groups (`src/routes/groups.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /friend-groups | User's groups |
| POST | /friend-groups | Create group |
| PUT | /friend-groups/:id | Update group |
| DELETE | /friend-groups/:id | Delete group |
| POST | /friend-groups/:id/members | Add member |
| DELETE | /friend-groups/:id/members/:friendshipId | Remove member |

#### Profile (`src/routes/profile.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /profile | Current user profile |
| PUT | /profile | Update profile |
| GET | /profile/search | Search users (GET) |
| POST | /profile/search | Search users (POST) |
| GET | /profile/stats | Profile statistics |
| GET | /profile/:id/profile | Public profile |
| PUT | /profile/featured-badge | Set featured badge |
| DELETE | /profile/admin/delete-user/:email | Admin: delete user |

#### Notifications (`src/routes/notifications.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /notifications | All notifications |
| GET | /notifications/paginated | Paginated notifications |
| GET | /notifications/unseen-count | Unseen count |
| POST | /notifications/mark-all-seen | Mark all seen |
| GET | /notifications/event/:eventId | Event notifications |
| POST | /notifications/event/:eventId | Create event notification |
| GET | /notifications/preferences | Get preferences |
| PUT | /notifications/preferences | Update preferences |
| POST | /notifications/register-token | Register push token |
| POST | /notifications/status | Update push status |
| GET | /notifications/nudge-eligibility | Nudge eligibility |
| DELETE | /notifications/unregister-token | Unregister token |
| PUT | /notifications/:id/read | Mark read |
| PUT | /notifications/read-all | Mark all read |

#### Push (`src/routes/push.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /push/me | Current user's push tokens |
| POST | /push/deactivate | Deactivate token |
| POST | /push/clear-mine | Clear all tokens |
| POST | /push/register | Register push token |
| POST | /push/test-self | Test push (env-gated) |
| POST | /push/test | Test push (dev-only) |

#### Subscription (`src/routes/subscription.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /subscription | Current subscription |
| GET | /subscription/limits | Usage limits |
| POST | /subscription/upgrade | Upgrade (placeholder) |
| POST | /subscription/restore | Restore purchases |
| GET | /subscription/check-feature/:feature | Check feature access |
| GET | /subscription/details | Subscription details |
| GET | /subscription/pro-features | Pro features list |

#### Entitlements (`src/routes/entitlements.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /entitlements | User entitlements |
| POST | /entitlements/check | Check specific entitlement |
| GET | /entitlements/events/active/count | Active event count |
| GET | /entitlements/hosting/quota | Hosting quota |

#### Public Events (`src/routes/publicEvents.ts`) — No auth required
| Method | Path | Description |
|--------|------|-------------|
| GET | /public-events/:id/public | Public event page data |
| GET | /public-events/:id/calendar.ics | iCal download |
| POST | /public-events/:id/rsvp/guest | Guest RSVP (no auth) |

#### Webhooks (`src/routes/webhooks.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /webhooks/revenuecat | RevenueCat subscription webhook (HMAC verified) |
| GET | /webhooks/_debug | Debug info |

#### Cron (`src/routes/cron.ts`) — Requires CRON_SECRET
| Method | Path | Description |
|--------|------|-------------|
| POST | /cron/reminders/run | Event reminders (every 5min) |
| POST | /cron/digest/run | Daily digest (every 15min) |
| POST | /cron/weekly-digest/run | Weekly plan digest (Mon 2:00 UTC) |
| POST | /cron/cleanup/tokens | Stale push token cleanup (weekly) |
| POST | /cron/cleanup/dedupe | Old notification log cleanup (weekly) |
| POST | /cron/cleanup/sessions | Expired session cleanup (weekly) |
| POST | /cron/finalize-events | Mark events completed |
| GET | /cron/health | Health check |

#### Other Routes

| Route File | Prefix | Description |
|------------|--------|-------------|
| `appConfig.ts` | /app-config | App config (public, no auth) |
| `birthdays.ts` | /birthdays | Friend birthdays |
| `blocked.ts` | /blocked | Blocked contacts CRUD |
| `cloudinaryUploads.ts` | /cloudinary | Signed upload params |
| `contacts.ts` | /contacts | Contact matching |
| `dev.ts` | /dev | Dev-only endpoints |
| `emailVerification.ts` | /email-verification | Email verify flow |
| `health.ts` | /health | Health check |
| `inventory.ts` | /inventory | Founder/early spots |
| `operatorAttribution.ts` | /operator-attribution | Mac mini attribution |
| `places.ts` | /places | Place search proxy |
| `privacy.ts` | /privacy | Privacy settings + data export + delete |
| `profiles.ts` | /profiles | Multi-profile support |
| `proofs.ts` | /proofs | Friend boundary proofs |
| `referral.ts` | /referral | Referral program |
| `reports.ts` | /reports | User/event reporting |
| `sharePages.ts` | /share-pages | Share page rendering |
| `suggestions.ts` | /suggestions | Suggestion feed |
| `upload.ts` | /upload | Image upload |
| `widget.ts` | /widget | iOS widget data |
| `workSchedule.ts` | /work-schedule | Work schedule CRUD |

---

## DATA MODEL

### Production Database: 80 Tables, PostgreSQL

### Core Tables (with row counts from production)

#### user (46 rows)
- id, name, email (unique), emailVerified, image, phone (unique), createdAt, updatedAt
- referralCode (unique), pushPermissionStatus, pushPermissionUpdatedAt

#### account (44 rows)
- id, accountId, providerId (credential/apple), userId, accessToken, refreshToken, idToken, scope, password, createdAt, updatedAt

#### session (427 rows)
- id, expiresAt, token (unique), createdAt, updatedAt, ipAddress, userAgent, userId
- Index on userId, expiresAt

#### Profile (32 rows)
- id, userId (unique), handle (unique), bio, calendarBio, avatarUrl, avatarPublicId, bannerUrl, bannerPublicId
- birthday, showBirthdayToFriends, hideBirthdays, omitBirthdayYear, usernameLastChangedAt
- profileThemeId, profileCardColor

#### event (172 rows)
- **Core:** id, title, description, location, emoji, color, startTime, endTime, userId
- **Recurrence:** isRecurring, recurrence, seriesId, seriesIndex
- **Visibility:** visibility (all_friends/specific_groups/circle_only/open_invite/private)
- **Capacity:** capacity, goingCount, isFull
- **Photos:** eventPhotoPublicId, eventPhotoUrl, eventMemoryPhotoPublicId, eventMemoryPhotoUrl
- **Co-hosting:** hostIds (String[])
- **Themes:** themeId, customThemeData, effectId, customEffectConfig, cardColor
- **Features:** pitchInEnabled, pitchInTone, pitchInAmount, pitchInMethod, pitchInHandle, pitchInNote, bringListEnabled, bringListItems (JSON)
- **Privacy:** hideDetailsUntilRsvp, showGuestList, showGuestCount, showLocationPreRsvp, hideWebLocation
- **Status:** isUnderReview, underReviewAt, underReviewReason, isBusy, isImported, importedAt, deviceCalendarId, deviceCalendarName
- **Summary:** summary, summaryNotifiedAt, summaryRating, reflectionEnabled
- **RSVP:** rsvpDeadline, costPerPerson, eventHook
- Indexes: userId, startTime, (userId, startTime), createdAt, (userId, deviceCalendarId), seriesId

#### event_interest (136 rows) — RSVP records
- eventId, userId, status (going/interested/maybe/not_going), createdAt
- Unique: (eventId, userId)

#### event_join_request (12 rows)
- eventId, userId, status (pending/approved/rejected), message, createdAt, updatedAt
- Unique: (eventId, userId)

#### event_comment (15 rows)
- eventId, userId, content, imageUrl, createdAt, updatedAt

#### event_photo (1 row)
- eventId, userId, imageUrl, publicId, bytes, width, height, caption, createdAt

#### friendship (192 rows)
- userId, friendId, status, isBlocked, createdAt, updatedAt
- Unique: (userId, friendId)

#### friend_request (96 rows)
- senderId, receiverId, status (pending/accepted/rejected), createdAt, updatedAt
- Unique: (senderId, receiverId)

#### friend_group (4 rows)
- id, name, color, icon, userId

#### friend_group_membership (5 rows)
- id, groupId, friendshipId

#### friend_note (0 rows)
- id, friendshipId, content, createdAt

#### circle (32 rows)
- id, name, description, emoji, type (group/dm), dmMemberSetKey (unique), photoUrl, photoPublicId, createdById, createdAt, updatedAt, lastMessageAt

#### circle_member (113 rows)
- id, circleId, userId, isPinned, isMuted, joinedAt, lastReadAt
- Unique: (circleId, userId)

#### circle_message (584 rows)
- id, circleId, userId, content, messageType (text/event_share/system), sharedEventId
- imageUrl, clientMessageId, replyToMessageId, replyToUserId, replyToUserName, replyToSnippet, createdAt
- Unique: (circleId, userId, clientMessageId)
- FK: sharedEventId → event.id (ON DELETE SET NULL)

#### circle_message_reaction (0 rows)
- circleId, messageId, userId, emoji, createdAt
- Unique: (messageId, userId, emoji)

#### circle_poll (111 rows) / circle_poll_option (171) / circle_poll_vote (104)
- Lightweight polling in circles

#### circle_plan_lock (2 rows)
- circleId (unique), locked, note, lifecycleState, updatedBy, updatedAt

#### circle_notification_pref (2 rows)
- circleId, userId, level (all/smart/mute), updatedAt
- Unique: (circleId, userId)

#### notification (1,026 rows)
- id, userId, type, title, body, entityId, entityType, read, seenAt, createdAt, data (JSON)
- Unique: (userId, type, entityId)

#### notification_preferences (41 rows)
- userId (unique), pushEnabled, quietHoursEnabled, quietHoursStart, quietHoursEnd
- 20+ type-specific boolean flags (all default false)

#### notification_delivery_log (557 rows)
- userId, dedupeKey (unique pair), notificationType, sentAt

#### push_token (27 rows)
- userId, token, platform, isActive, lastSeenAt, lastUsedAt, createdAt, updatedAt
- Unique: (userId, token)

#### work_schedule (278 rows)
- userId, dayOfWeek (0-6), isEnabled, startTime, endTime, block2StartTime, block2EndTime, label
- Unique: (userId, dayOfWeek)

#### work_schedule_settings (66 rows)
- userId (unique), showOnCalendar, timezone

#### work_schedule_block (83 rows)
- userId, startTime, endTime, label, createdAt

#### email_verification_code (9 rows)
- email, code, expiresAt, verified, attempts, createdAt

#### event_template (32 rows)
- id, name, emoji, duration, description, userId, isDefault

#### idempotency_record (111 rows)
- userId, key, route, status, responseJson, responseStatus, expiresAt
- Unique: (userId, key)

#### cron_job_lease (0 rows)
- jobName (unique), ownerId, lockedUntil, acquiredAt

#### guest_rsvp (~0 rows)
- eventId, guestEmail, guestName, status, guestToken, rsvpedAt, createdAt

#### referral (0 rows)
- referrerId, referredUserId, status, badgeCredited, createdAt

#### event_report (2 rows)
- eventId, reporterId, reason, details, status, createdAt

#### event_color_preference (0 rows)
- eventId, userId, color

#### event_notification_mute (0 rows)
- eventId, userId

#### blocked_contact (0 rows)
- userId, blockedUserId, blockedEmail, blockedPhone, reason, createdAt

### Inactive/Future Tables (marked @ignore or empty)
- business, business_event, business_event_attendee, business_event_comment, business_event_interest, business_follow, business_team_member
- subscription, discount_code, discount_code_redemption, promo_code, promo_redemption
- story, story_view, story_group_visibility
- badge_definition, badge_grant, user_badge, user_featured_badge, unlocked_achievement
- user_stats, user_sequence, user_cohort
- event_finalize_marker, event_reminder, event_report_snapshot
- pinned_friendship, hangout_history
- entitlement_override, admin_audit_log
- job, purchase_event

---

## SYSTEMS & SSOT

### Theme System
- **SSOT:** `src/lib/eventThemes.ts` (frontend)
- 5 free themes (neutral, chill_hang, dinner_night, game_night, worship_night)
- 21 premium themes (birthday_bash, summer_splash, winter_glow, etc.)
- Surface mapping: each theme defines gradient, text colors, card opacity
- Custom Theme Studio: users build themes with gradient + shader + particles + filter + image layers
- Premium gating: gate-on-save model (free users can preview, save requires Pro)
- Backend stores: themeId, customThemeData (JSON), effectId, customEffectConfig (JSON)

### Share System
- **SSOT:** `src/lib/shareSSOT.ts` + `src/lib/config.ts` (frontend)
- Deep links: open-invite://event/<id>, open-invite://circle/<id>, open-invite://user/<id>, open-invite://invite/<code>
- Universal links: https://www.openinvite.cloud/event/<id>
- Share domain: go.openinvite.cloud
- App Store URL: https://apps.apple.com/app/id6757429210
- Builders: buildEventSharePayload, buildEventSmsBody, buildReferralSharePayload, buildAppSharePayload, buildProfileSharePayload, buildCircleSharePayload

### Subscription/Premium
- **Frontend SSOT:** `src/lib/revenuecatClient.ts`
- **Backend SSOT:** `src/routes/entitlements.ts` + `src/utils/subscriptionHelpers.ts`
- RevenueCat offering: "default"
- Entitlement: "premium"
- Packages: $rc_annual, $rc_monthly, $rc_lifetime
- Feature gates checked via `/api/entitlements` endpoint

### Notification System
- **SSOT:** `src/lib/expoPush.ts` (backend)
- 31 notification types with per-type preference mapping
- Push governance: OS permission > global pushEnabled > type-specific pref > quiet hours > dedupe
- Async fanout: PUSH_ASYNC=1 enables job queue (push_fanout → push_send)
- Delivery logging: notification_delivery_log with (userId, dedupeKey) uniqueness

### Image Transform
- **SSOT:** `src/lib/mediaTransformSSOT.ts` (frontend)
- Cloudinary presets: HERO_BANNER, HERO_DETAIL, THUMBNAIL_SQUARE, AVATAR_THUMB
- Default format: f_webp
- Transform function: toCloudinaryTransformedUrl()

### Location Search
- **SSOT:** `src/components/create/placeSearch.ts` (frontend)
- Cascade: Google Places → Apple Maps → proxy → custom
- Backend proxy: GET /api/places/search

### Premium Gating
- Gate-on-save model: users can preview premium themes/effects, saving requires Pro
- isPremiumTheme() checks PREMIUM_THEME_IDS
- Entitlements API returns plan, limits, features

---

## STATE MANAGEMENT (Frontend)

### React Query (Primary Server State)
- QueryClient configured in app/_layout.tsx
- Query key conventions defined in infiniteQuerySSOT.ts
- Mutations with optimistic updates for RSVP, friend requests
- Invalidation patterns: key-based, entity-scoped

### Zustand Stores (2)
1. **useCreateSettingsStore** (`src/lib/createSettingsStore.ts`) — Event creation form state: visibility, selectedGroupIds, notification flag, capacity, RSVP deadline, cost, Pitch In, bring list, privacy toggles
2. **useThemeBuilderStore** (`src/lib/themeBuilderStore.ts`) — Theme Studio: name, gradient, shader, particles, filter, image layers

### Storage
- **expo-secure-store:** Auth tokens, sensitive user-scoped data, onboarding guide state
- **AsyncStorage:** Session throttling, push token timestamps, notification preferences
- **MMKV:** Not used
- **React Query cache:** Server state (events, friends, circles, notifications)

### Context Providers (app/_layout.tsx)
1. ThemeProvider (AppThemeProvider)
2. SubscriptionProvider
3. SafeAreaProvider
4. GestureHandlerRootView
5. KeyboardProvider
6. QueryClientProvider
7. PostHogProvider
8. ErrorBoundary

---

## THIRD-PARTY INTEGRATIONS

### RevenueCat (Subscriptions)
- **Package:** react-native-purchases 9.6.7
- **Offering ID:** "default"
- **Entitlement ID:** "premium"
- **Packages:** $rc_annual, $rc_monthly, $rc_lifetime
- **Webhook:** POST /api/webhooks/revenuecat (HMAC-SHA256 verified)
- **Backend env:** REVENUECAT_WEBHOOK_AUTH, REVENUECAT_WEBHOOK_SECRET

### Cloudinary (Images)
- **Upload flow:** Client gets signed params from backend → direct upload to Cloudinary → backend records URL
- **Backend endpoints:** POST /api/cloudinary/sign-avatar, POST /api/cloudinary/sign-event-photo
- **Transforms:** Server-side resize/optimize on upload completion (w_X,h_X,c_limit/q_auto/f_webp)
- **Size limits:** avatar 5MB/512px, banner 5MB/1200px, event_photo 10MB/1600px, event_cover 5MB/1200px
- **Frontend transform:** toCloudinaryTransformedUrl() for display-time optimization

### PostHog (Analytics)
- **Frontend:** posthog-react-native, initialized in _layout.tsx
- **Website:** posthog-js
- **Events tracked:** push notification opens, errors, key user actions

### Sentry (Error Tracking)
- **Frontend:** @sentry/react-native 6.14.0
- **Config:** Native frames, screenshot attachment, 20% trace sample rate
- **Status:** Installed and configured

### Expo
- **Push Notifications:** expo-notifications → Expo Push Service → APNs/FCM
- **OTA Updates:** expo-updates (production branch, runtime 1.0.0)
- **Calendar:** expo-calendar (device calendar sync)
- **Location:** expo-location (geolocation)
- **Image Picker:** expo-image-picker
- **Build:** EAS Build (eas.json configured)

### Better Auth
- **Backend:** betterAuth() with Prisma adapter, PostgreSQL
- **Plugins:** expo(), phoneNumber() (Twilio)
- **Session:** 90-day TTL, 24h sliding window refresh
- **Cookies:** httpOnly, secure, partitioned (CHIPS), sameSite: none
- **Mobile:** x-oi-session-token header fallback
- **CSRF:** Disabled (documented — mobile apps don't send Origin headers reliably)

### Twilio (SMS)
- **Purpose:** Phone number OTP verification
- **Backend env:** TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

### Resend (Email)
- **Purpose:** Password reset, email verification, RSVP confirmation
- **From:** verify@mail.openinvite.cloud
- **Backend env:** RESEND_API_KEY

---

## INVARIANTS

- NEVER run `expo prebuild --clean` — destroys native customizations
- All hooks in `event/[id].tsx` must be above all early returns (React rules of hooks)
- Both `contracts.ts` files must stay in sync (frontend `shared/contracts.ts` + backend `src/shared/contracts.ts`)
- Create page (`app/create.tsx`) is SSOT for event authoring — all event creation flows through it
- Version bump requires syncing: app.json (version + buildNumber), 3 iOS plists (CFBundleShortVersionString + CFBundleVersion)
- Archive to `~/Library/Developer/Xcode/Archives/` for Organizer visibility
- Native module pbxproj entries: use `name = X; path = OpenInvite/X;` pattern
- Backend auto-deploys from main via Render — never restart PM2 for backend
- Tab bar order is a product-level invariant: Discover | Calendar | Social (center) | Friends | Profile
- zsh: use `>|` not `>` for file overwrites, quote bracketed paths
- Long-running CLI commands: pipe to `tee /tmp/<descriptive>.log`
- FLOATING_TAB_INSET = 84px for screen contentContainerStyle paddingBottom
- Deep link scheme: `open-invite://`
- Universal link domain: openinvite.cloud
- Frontend path aliases: `@/` = `src/`

---

## CURRENT STATE

### Version & Build
- **Version:** 1.2.2
- **iOS Build:** 319
- **Android Version Code:** 267

### App Store Status
- **Live:** 1.2.0 (build 315)
- **In Review:** 1.2.1 (build 318) waiting for review
- **Uploaded:** 1.2.2 (build 319)

### OTA Updates
- 3 updates pushed to production branch (runtime 1.0.0)

### Backend
- Deployed on Render, auto-deploy from main
- Last commit: `5b3b6e7` (feat: add event sharing via chat messages)
- Database: 80 tables, 46 users, 172 events

### Website
- Deployed on Vercel
- Last commit: `226e1c4` (feat: register favicon + icons)

### Known Issues
- None blocking

### Queued Work
- Admin dashboard V2 (OpenClaw operator upgrades)
- Podfile cleanup
- Re-add Sentry (installed, needs verification)
- EAS Build fix
- Android readiness
- event/[id].tsx extraction (file too large)

---

## FILE TREE SUMMARY

### Frontend (`open-invite-app`)
```
src/
  app/           (44 screen files — Expo Router)
  components/    (169 components in 14+ subdirectories)
  hooks/         (23 custom hooks)
  lib/           (133 utility/business logic files)
  ui/            (design system primitives)
  utils/         (helper utilities)
  constants/     (navigation constants)
  dev/           (development tools)
  analytics/     (analytics event tracking)
shared/
  contracts.ts   (shared Zod schemas — synced with backend)
```

### Backend (`my-app-backend`)
```
src/
  routes/        (44 route files — 250+ endpoints)
  middleware/    (9 middleware files)
  lib/           (23+ library files)
  services/      (1 service — operator ingest)
  realtime/      (WebSocket server + Redis fanout)
  shared/        (contracts.ts — synced with frontend)
  utils/         (helpers)
prisma/
  schema.prisma  (80 models)
  migrations/    (99 migrations)
```

### Website (`openinvite-website`)
```
app/
  page.tsx        (landing page)
  event/[id]/     (public event page + loading + not-found)
  privacy/        (privacy policy)
  terms/          (terms of service)
  support/        (support page)
  presskit/       (press kit)
  delete-account/ (account deletion)
  reset-password/ (password reset)
  .well-known/    (AASA for Universal Links)
src/
  components/     (8 components — EventPageClient, RsvpSection, etc.)
  lib/            (API client)
  data/           (theme definitions)
components/       (Nav, Footer, WaitlistForm)
```

### Most Recently Edited Files (across all repos)

**Frontend (open-invite-app):**
1. app.json (6 edits)
2. package.json (4 edits)
3. src/app/event/[id].tsx (4 edits)
4. ios/OpenInvite.xcodeproj/project.pbxproj (3 edits)
5. eas.json (3 edits)
6. src/lib/revenuecatClient.ts (2 edits)
7. src/components/create/placeSearch.ts (2 edits)
8. src/components/CircleCard.tsx (2 edits)

**Backend (my-app-backend):**
1. src/routes/events-social.ts
2. src/routes/circles.ts
3. src/shared/contracts.ts
4. prisma/schema.prisma
5. src/lib/expoPush.ts
6. src/routes/events-crud.ts
7. src/routes/admin.ts
8. src/auth.ts
9. src/routes/events-settings.ts
10. src/routes/events-misc.ts

**Website (openinvite-website):**
1. app/event/[id]/page.tsx
2. src/components/EventPageClient.tsx
3. src/components/RsvpSection.tsx
4. app/page.tsx
