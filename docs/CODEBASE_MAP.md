# Codebase Map — Open Invite

> One-time structural reference. Every file in `src/app/`, `src/components/`, `src/hooks/`, `src/lib/`.
> Generated 2026-03-29.

---

## Key Architecture

### Routing (Expo Router)

Flat `Stack` in `src/app/_layout.tsx` — no `(tabs)` group directory. Tabs are implemented via a custom `BottomNavigation` component. `BootRouter` handles one-shot post-boot redirect (`authed → /calendar`, `loggedOut → /welcome`, `onboarding → /welcome`). Dynamic routes: `event/[id]`, `user/[id]`, `circle/[id]`, `event-request/[id]`, `event/edit/[id]`, `friend/[id]`. Modal screens: `paywall`, `import-calendar` (both `slide_from_bottom`).

### Navigation (5 Tabs)

1. **Discover** (`/discover`) — Sparkles icon, exploration surface
2. **Calendar** (`/calendar`) — Calendar icon, personal schedule, default landing
3. **Social** (`/social`) — List icon, center tab (elevated pill), social feed
4. **Friends** (`/friends`) — Users icon, connections + circles
5. **Profile** (`/profile`) — User icon, settings

Tab order enforced at runtime via `assertTabOrder()` in `src/constants/navigation.ts`.

### State Management

- **React Query** — primary server state. `staleTime: 30s`, `gcTime: 5min`. Centralized key registry at `src/lib/queryKeys.ts` (`qk` object re-exporting domain factories).
- **Zustand** — two stores: `themeBuilderStore.ts` (transient theme editor state), `offlineStore.ts` (local placeholder events + offline RSVPs).
- **Auth state** — gated on `bootStatus === 'authed'`, not `!!session`.

### API Layer

Single `fetchFn` in `src/lib/api.ts` delegates to `authClient.$fetch` with auto-attached auth headers. Exports `api.get/post/put/patch/delete/upload`. Network auth gate blocks calls during logout. `404` on GET returns `null` (empty state). `x-request-id` on every request.

### Auth System

Better Auth (`better-auth/react`) + `@better-auth/expo` plugin. Session persistence via `expo-secure-store`. Secondary `OI_SESSION_TOKEN_KEY` in SecureStore as header fallback (iOS cookie jar unreliable). `ensureCookieInitialized()` must be awaited at boot. 401 → logout via pub/sub emitter. 403 → ignored (permission, not session).

### Theme System

Two layers:
1. **App UI theme** (`src/lib/ThemeContext.tsx`) — accent color (9 options) + light/dark/auto mode, persisted in AsyncStorage. Full token palette (`DARK_COLORS`/`LIGHT_COLORS`).
2. **Event themes** (`src/lib/eventThemes.ts`) — 5 free + 25 premium themes. Each defines a `ThemeVisualStack` (gradient, shader, particles, filter, image). Rendered by `ThemeEffectLayer` (Skia GPU particles), `AnimatedGradientLayer`, `ThemeVideoLayer`, `ThemeFilterLayer`.

---

## src/app/ — Routes (47 files, ~43,530 lines)

| File | Lines | Purpose |
|------|------:|---------|
| `circle/[id].tsx` | 2937 | Circle detail: members, messaging, events, sharing, settings |
| `event/[id].tsx` | 3244 | Event detail: RSVP, attendees, sharing, discussion, deep-link entry |
| `settings.tsx` | 1814 | Settings hub: profile, photo, theme, notifications, privacy, subscription |
| `calendar.tsx` | 1632 | Home/calendar: multi-view (list, grid, strip), friend availability, quick actions |
| `social.tsx` | 1971 | Social feed: infinite scroll, swipe gestures, quick RSVP, friend requests |
| `welcome.tsx` | 1739 | Pre-auth landing: Apple Sign-In, animated branding, onboarding entry |
| `friends.tsx` | 1594 | Friends: pending requests, friend list, circles, availability queries |
| `onboarding.tsx` | 1539 | 9-step onboarding: profile setup, photo, contacts, friend discovery |
| `_layout.tsx` | 1370 | Root layout: auth bootstrap, fonts, theme, nav stack, error boundaries, providers |
| `user/[id].tsx` | 1368 | Public user profile: events, friendship state, mutual circles, block actions |
| `discover.tsx` | 1152 | Discover: 3-pane (Ideas/Events/Saved), filtering, bookmarking |
| `notification-settings.tsx` | 1142 | Per-category push notification toggles, quiet hours, OS permission |
| `profile.tsx` | 1123 | Own profile: upcoming events, stats, streaks, settings navigation |
| `import-calendar.tsx` | 1066 | ICS calendar import: parse, preview conflicts, sync |
| `suggestions.tsx` | 994 | AI/algorithmic friend-activity suggestions |
| `event/edit/[id].tsx` | 962 | Edit event: mirrors create fields, delete option |
| `whos-free.tsx` | 916 | Friend availability computation with paywall gating |
| `create-event-request.tsx` | 911 | Scheduling poll creation: title, date options, location, audience |
| `event-request/[id].tsx` | 862 | Event request detail: time-slot voting, host confirmation |
| `help-faq.tsx` | 862 | FAQ accordion: features, privacy, billing, troubleshooting |
| `create.tsx` | 813 | Event creation: themed live-preview, form, location/date pickers |
| `paywall.tsx` | 777 | Premium paywall: RevenueCat packages, upgrade/restore |
| `subscription.tsx` | 759 | Subscription management: current plan, entitlements, upgrade |
| `login.tsx` | 708 | Auth: phone/email, Apple Sign-In, OTP verification |
| `admin.tsx` | 619 | Admin dashboard: user search, entitlements, announcements |
| `public-profile.tsx` | 605 | Read-only profile before auth: calendar preview, sign-up CTA |
| `blocked-contacts.tsx` | 581 | Blocked users management with unblock and search |
| `account-settings.tsx` | 554 | Email/password changes, data export, account deletion |
| `theme-builder.tsx` | 502 | Custom theme composer: gradients, shaders, particles, preview |
| `admin-report-detail.tsx` | 468 | Single abuse report review with moderation actions |
| `referrals.tsx` | 434 | Referral program: code, share, referred list, reward tiers |
| `invite.tsx` | 410 | Shareable invite deep-link target with accept/join CTA |
| `account-center.tsx` | 394 | Account hub: profile, settings, circles, subscription links |
| `circles.tsx` | 383 | Circles list: browse, create, leave/delete, paywall gating |
| `find-friends.tsx` | 380 | Contact matching: hash device contacts, find users, SMS invite |
| `admin-reports.tsx` | 285 | Abuse reports list with status filters and pagination |
| `privacy-settings.tsx` | 271 | Privacy toggles: visibility, discoverability, calendar sharing |
| `verify-email.tsx` | 249 | Email verification prompt with resend and session refresh |
| `calendar-import-help.tsx` | 177 | Calendar import explainer with CTA to import flow |
| `friend/[id].tsx` | 142 | Thin redirect: friendshipId → `/user/[id]` |
| `activity.tsx` | 138 | Activity/notification feed, push permission request |
| `_error.tsx` | 91 | Global error boundary UI with retry and go-home |
| `add-friends.tsx` | 62 | Wrapper rendering FriendDiscoverySurface |
| `redeem-code.tsx` | 49 | Placeholder: code redemption (not implemented) |
| `+html.tsx` | 38 | Web-only HTML shell for Expo web rendering |
| `index.tsx` | 35 | Boot redirect: unauthed → `/welcome`, authed → `/calendar` |
| `+not-found.tsx` | 19 | 404 catch-all with home link |

---

## src/components/ — Components (167 files, ~35,594 lines)

| File | Lines | Purpose |
|------|------:|---------|
| `ThemeEffectLayer.tsx` | 1491 | GPU Skia particle engine (V2): snowfall, candlelight, arcade sparks |
| `ideas/DailyIdeasDeck.tsx` | 1259 | Swipeable ideas deck for Suggestions/Discover screen |
| `circle/CircleMembersSection.tsx` | 1257 | Circle member events calendar grid with availability computation |
| `create/EffectTray.tsx` | 1100 | Two-stage particle effect picker: swatch rail + live Skia editor |
| `InviteFlipCard.tsx` | 781 | Premium 3D tap-to-flip invite card for event detail |
| `create/ThemeTray.tsx` | 729 | Two-stage theme picker: gradient swatches + Theme Studio editor |
| `LoginWithEmailPassword.tsx` | 695 | Email/password auth: login, sign-up, forgot password, verification |
| `FriendDiscoverySurface.tsx` | 689 | SSOT friend discovery: contacts import, search, suggestions |
| `create/MotifOverlay.tsx` | 671 | Skia animated motif overlay: petals, hearts, decorative shapes |
| `EventPhotoGallery.tsx` | 665 | Photo gallery: upload, delete, lightbox, download |
| `activity/ActivityFeed.tsx` | 634 | Paginated notification feed: mark-read, infinite scroll, skeleton |
| `create/SettingsSheetContent.tsx` | 608 | Create settings: visibility, recurrence, capacity, circle, notifications |
| `create/CoverMediaPickerSheet.tsx` | 545 | Cover media picker: Featured, GIFs, My Uploads tabs |
| `FeedCalendar.tsx` | 524 | Monthly calendar grid for Social tab with day-agenda sheet |
| `CircleCard.tsx` | 506 | Swipeable circle card: pin, mute, leave actions |
| `circle/CircleAvailabilitySection.tsx` | 490 | Circle availability types, helpers, day-detail events |
| `circle/CircleSettingsSheet.tsx` | 389 | Two-view settings sheet (settings + photo management) |
| `SuggestedTimesPicker.tsx` | 475 | Smart scheduling modal querying friend busy windows |
| `notifications/NotificationNudgeModal.tsx` | 474 | Push notification enable prompt, evolving copy |
| `EmptyStates.tsx` | 451 | Library of themed empty-state configs (icons, copy, actions) |
| `MonthlyRecap.tsx` | 443 | Shareable monthly recap: stats, top friend, streak |
| `EventSummaryModal.tsx` | 436 | Post-event reflection/summary modal for hosts |
| `friends/FriendsPeoplePane.tsx` | 435 | Friends People pane: requests, friend list, add actions |
| `paywall/PaywallModal.tsx` | 405 | Feature-limit paywall modal with premium benefits |
| `event/AboutCard.tsx` | 371 | Event About: description, bring list, pitch-in, capacity |
| `circle/CircleChatSection.tsx` | 340 | Chat bubbles, date separators, system event parsing |
| `circle/CircleMembersSheet.tsx` | 251 | Full members list + add-members section |
| `circle/CircleAddMembersModal.tsx` | 187 | Friend selection modal for adding circle members |
| `circle/CircleHeaderChrome.tsx` | 142 | Floating BlurView header with avatar stack and create button |
| `circle/CirclePollSheet.tsx` | 138 | Poll voting sheet with winner highlight and lock-plan bridge |
| `circle/CircleAvailabilitySheet.tsx` | 136 | Tonight's availability roster display |
| `circle/CircleChatOverlays.tsx` | 134 | Scroll-to-bottom, new messages pill, failed banner, typing indicator |
| `circle/CircleNextEventCard.tsx` | 130 | Collapsible next-event anchor card with date formatting |
| `circle/CirclePlanLockSheet.tsx` | 126 | Plan lock toggle with note editing and host unlock |
| `circle/CircleRemoveMemberModal.tsx` | 117 | Destructive confirmation modal for removing a member |
| `circle/CircleEditMessageOverlay.tsx` | 91 | Fullscreen overlay for editing a sent message |
| `circle/CircleFriendSuggestionModal.tsx` | 90 | Post-add suggestion modal showing matched friends |
| `circle/CircleNotifyLevelSheet.tsx` | 89 | Notification level radio picker |
| `circle/CircleCreateEventModal.tsx` | 88 | Confirm modal for creating a circle-scoped event |
| `circle/CircleLifecycleChips.tsx` | 83 | Finalized chip and completion/run-it-back prompt |
| `circle/CircleReactionPicker.tsx` | 76 | Emoji reaction grid overlay with selection state |
| `calendar/CalendarEventListItem.tsx` | 554 | Event card with context menu, share/sync/color/busy/delete actions |
| `calendar/CalendarDayCells.tsx` | 326 | CompactDayCell, StackedDayCell, DetailsDayCell (3 pinch-zoom view modes) |
| `calendar/CalendarBusyBlockModal.tsx` | 219 | Quick busy block creation modal with time pickers |
| `calendar/CalendarHeaderChrome.tsx` | 190 | Floating BlurView header with month nav and view mode selector |
| `calendar/CalendarBirthdaysSection.tsx` | 172 | Collapsible upcoming birthdays section with navigation |
| `calendar/CalendarListView.tsx` | 136 | Full month list view grouped by date |
| `calendar/CalendarFirstLoginGuideModal.tsx` | 113 | First-login welcome/tour modal |
| `settings/ReferralCounterSection.tsx` | 294 | Referral code display, progress, referrer input (standalone module) |
| `settings/SettingsPushDiagnosticsModal.tsx` | 292 | DEV-only push diagnostics modal with DiagRow helper |
| `settings/SettingsNotificationsDevTools.tsx` | 284 | DEV-only push debug tools (diagnostics, receipts, queue) |
| `settings/SettingsWorkScheduleSection.tsx` | 266 | Per-day work hours editor with split schedule support |
| `settings/SettingsEditProfileSection.tsx` | 257 | Profile editing form (avatar, banner, name, username, bio) |
| `settings/SettingsBirthdaySection.tsx` | 156 | Birthday date picker + show/hide toggles |
| `settings/SettingsThemeSection.tsx` | 154 | Theme mode picker + color picker grid |
| `settings/SettingsSubscriptionSection.tsx` | 128 | Plan status, upgrade CTA, restore, refresh |
| `settings/SettingsAdminPasscodeModal.tsx` | 96 | Admin unlock passcode entry modal |
| `settings/SettingsProfileCard.tsx` | 70 | Profile view mode card (avatar + edit trigger) |
| `EventReactions.tsx` | 337 | Emoji reaction picker with spring animation |
| `EmptyState.tsx` | 326 | Animated empty state with pulsing icon and optional CTA |
| `event/DiscussionCard.tsx` | 313 | Event discussion: text posts, image attachments, prompts |
| `BottomNavigation.tsx` | 302 | Floating island tab bar: badges, avatar, spring press |
| `event/WhosComingCard.tsx` | 298 | Attendees preview: avatar stack, interested, full sheet trigger |
| `WelcomeModal.tsx` | 294 | First-login modal adapting to email verification status |
| `CreateCircleModal.tsx` | 294 | Circle creation: name, emoji, member selection |
| `event/EventActionsSheet.tsx` | 281 | Event actions: edit, duplicate, share, photo, report, delete |
| `AnimatedButton.tsx` | 278 | Reusable button: primary/secondary/outline/ghost + loading |
| `EventCategoryPicker.tsx` | 270 | Category picker modal: social, sports, food, etc. |
| `QuickEventButton.tsx` | 262 | Quick-create with pre-filled templates (coffee, lunch, etc.) |
| `SwipeableEventRequestCard.tsx` | 261 | Swipeable join-request card: accept/decline gestures |
| `EventReminderPicker.tsx` | 258 | Reminder picker: configurable notification intervals |
| `MapPreview.tsx` | 257 | Static map via Nominatim geocode + Google Static Maps |
| `FirstValueNudge.tsx` | 253 | First-session nudge: 0 friends/events → Find friends, Create event |
| `create/placeSearch.ts` | 249 | Place autocomplete proxied through backend |
| `SuggestionFeedCard.tsx` | 247 | AI suggestion card: friend invite, event CTA |
| `SocialProof.tsx` | 247 | Avatar-stack widget showing who's attending |
| `HelpSheet.tsx` | 241 | Contextual help bottom-sheet per screen |
| `event/EventSettingsAccordion.tsx` | 234 | Event settings: calendar sync, reminders, recurrence |
| `OfflineBanner.tsx` | 228 | Network status: offline, reconnecting, syncing |
| `Skeleton.tsx` | 227 | Animated shimmer skeleton primitive |
| `EmailVerificationGateModal.tsx` | 225 | Blocking modal for unverified email |
| `create/coverMedia.data.ts` | 214 | Featured cover image catalog and category chips |
| `SkeletonLoader.tsx` | 211 | Named skeleton layouts (ActivityFeed, FriendsList, etc.) |
| `ErrorBoundary.tsx` | 199 | React error boundary with analytics + retry |
| `EmailVerificationBanner.tsx` | 196 | Non-blocking email verification banner |
| `AnnouncementBanner.tsx` | 195 | Server-driven announcement with dismissal and CTA |
| `NotificationPrePromptModal.tsx` | 194 | Soft pre-permission modal with 14-day cooldown |
| `FriendCard.tsx` | 191 | Swipeable friend card: pin, unfriend gestures |
| `create/CreatePreviewHero.tsx` | 189 | Live preview hero for create screen |
| `FirstTimeCalendarHint.tsx` | 188 | Onboarding hint below day insight, auto-dismisses |
| `StreakCounter.tsx` | 187 | Hangout streak display with fire-themed scaling |
| `PostValueInvitePrompt.tsx` | 185 | Post-action share-the-app prompt with 7-day cooldown |
| `VerifyEmailModal.tsx` | 176 | Email verification modal blocking social actions |
| `PremiumBanner.tsx` | 171 | Upgrade-to-premium banner linking to paywall |
| `OnboardingGuideOverlay.tsx` | 171 | Step-by-step onboarding tooltip overlay |
| `DayInsightCard.tsx` | 170 | Contextual free-time card on empty calendar days |
| `UserListRow.tsx` | 169 | SSOT user list row: avatar, handle, bio, badge, action |
| `BottomSheet.tsx` | 169 | Shared bottom-sheet primitive |
| `Toast.tsx` | 168 | In-app toast: success, info, warning, error |
| `ReconnectReminder.tsx` | 165 | Reconnect-with-friends horizontal scroll |
| `EntityAvatar.tsx` | 165 | SSOT avatar: photo, emoji, initials, icon fallback |
| `event/AttendeesSheet.tsx` | 164 | Full attendee list bottom sheet |
| `ShareApp.tsx` | 163 | Share-the-app button/panel (icon, compact, full) |
| `event/StickyRsvpBar.tsx` | 161 | Sticky bottom RSVP bar for non-host viewers |
| `event/RsvpButtonGroup.tsx` | 156 | Going/Interested/Not Going pill buttons |
| `EventVisibilityBadge.tsx` | 153 | Visibility badge: circle-only, private, specific groups |
| `DayAgendaSheet.tsx` | 153 | Day agenda bottom-sheet for calendar tap |
| `event/ReportModal.tsx` | 151 | Report event: reason selection + detail text |
| `UpdateBanner.tsx` | 150 | Soft/hard app update banner via version comparison |
| `event/PrivacyRestrictedGate.tsx` | 149 | Private event gate: host profile, circle links |
| `onboarding/OnboardingBackground.tsx` | 145 | Animated ambient glow for onboarding screens |
| `create/CreateLocationSection.tsx` | 144 | Location input with autocomplete |
| `friends/FriendsChatsPane.tsx` | 140 | Friends Chats pane: circles list, create-circle CTA |
| `create/klipyApi.ts` | 139 | Klipy GIF search API client |
| `AnimatedGradientLayer.tsx` | 138 | Crossfade gradient backdrop for themed events |
| `PostEventRepeatNudge.tsx` | 137 | Post-event repeat/recreate nudge with cooldown |
| `HeroBannerSurface.tsx` | 137 | Reusable full-bleed hero banner with tint overlay |
| `Confetti.tsx` | 136 | Animated confetti burst with completion callback |
| `AppHeader.tsx` | 135 | SSOT tab screen header: title, safe-area, calendar slot |
| `LoadingTimeoutUI.tsx` | 133 | Timeout fallback: retry + home navigation |
| `create/CreateEditorHeader.tsx` | 131 | Create/edit header: Cancel + Save with glass styling |
| `ThemeFilterLayer.tsx` | 128 | Skia post-processing: grain, vignette, noise, color shift |
| `SecondOrderSocialNudge.tsx` | 128 | After-first-friend nudge: discover + create CTAs |
| `ProfilePreviewCard.tsx` | 128 | Profile preview: hero, avatar, handle, bio |
| `FirstRsvpNudge.tsx` | 128 | Post-first-RSVP nudge: invite friends, explore |
| `MutualFriends.tsx` | 124 | Mutual friends horizontal scroll via React Query |
| `MiniCalendar.tsx` | 123 | Compact month calendar with event-dot indicators |
| `create/CreateDateTimeSection.tsx` | 122 | Date/time pickers + "Find Best Time" shortcut |
| `create/CreateBottomDock.tsx` | 119 | Create bottom dock: Theme, Effect, Settings toggles |
| `ThemeVideoLayer.tsx` | 118 | Looping muted video for premium themes |
| `event/CalendarSyncModal.tsx` | 116 | Sync to Google/Apple Calendar modal |
| `event/HostReflectionCard.tsx` | 115 | Post-event host reflection card |
| `event/MemoriesRow.tsx` | 114 | Expandable photo memories row |
| `event/HostToolsRow.tsx` | 112 | Host quick actions: share, copy, edit, bring-list |
| `SoftLimitModal.tsx` | 110 | Soft free-tier limit prompt (Upgrade / Not now) |
| `event/PostCreateNudge.tsx` | 108 | Post-creation share nudge: SMS, copy, share |
| `SplashScreen.tsx` | 104 | Animated launch splash with fade-in/out |
| `event/ColorPickerSheet.tsx` | 104 | Calendar color override picker |
| `ConfirmModal.tsx` | 103 | Generic confirm/cancel with destructive option |
| `AuthErrorUI.tsx` | 102 | Auth failure screen: Retry + Reset Session |
| `create/CreateSheets.tsx` | 94 | Aggregator composing all create-screen sheets |
| `event/RsvpStatusDisplay.tsx` | 92 | RSVP status badge with change toggle |
| `BuilderEffectPreview.tsx` | 92 | Theme builder particle/shader preview |
| `SocialPulseRow.tsx` | 91 | Weekly social activity card strip |
| `create/CreateCoverRow.tsx` | 77 | Cover photo change/remove control |
| `AnimatedCard.tsx` | 77 | Pressable card with spring scale + haptic |
| `event/EventHeroNav.tsx` | 76 | Floating back + options nav over hero image |
| `event/EventHeroBackdrop.tsx` | 73 | Hero photo backdrop with gradient overlay |
| `SocialMemoryCard.tsx` | 72 | Social memory string card with dismiss |
| `EventPhotoEmoji.tsx` | 66 | Emoji + cover photo hybrid with fade-in |
| `event/PhotoUploadSheet.tsx` | 64 | Upload/remove event cover photo |
| `BootLoading.tsx` | 63 | Deterministic boot loading overlay |
| `event/SocialProofRow.tsx` | 61 | Avatar stack + going count, "Be the first" fallback |
| `event/FindFriendsNudge.tsx` | 61 | Inline invite-friends nudge with dismiss |
| `InlineErrorCard.tsx` | 59 | Compact inline error with retry |
| `event/ConfirmedAttendeeBanner.tsx` | 59 | "You're Attending" banner + social proof |
| `event/RsvpSuccessPrompt.tsx` | 58 | Post-RSVP success banner with share shortcut |
| `MotionSurface.tsx` | 54 | Reanimated motion preset wrapper |
| `event/PhotoNudge.tsx` | 54 | Host cover photo prompt with dismiss |
| `create/CreateFormFields.tsx` | 52 | Themed title + description TextInputs |
| `event/BusyBlockGate.tsx` | 51 | Busy/calendar-block event gate |
| `CirclePhotoEmoji.tsx` | 39 | Circle avatar adapter with group icon |
| `BackgroundImageLayer.tsx` | 38 | Static bundled background for themed events |
| `LoginButton.tsx` | 31 | Login/logout nav button |
| `event/EditPhotoButton.tsx` | 30 | Animated pencil icon for photo upload |
| `Themed.tsx` | 29 | Light/dark Text and View wrappers |
| `AutoSyncProvider.tsx` | 29 | Headless calendar auto-sync for Pro users |
| `create/coverMedia.types.ts` | 21 | CoverMediaItem and CoverCategory types |
| `friends/FriendsActivityPane.tsx` | 14 | Thin wrapper rendering ActivityFeed in Friends tab |

---

## src/hooks/ — Hooks (22 files, ~3,543 lines)

| File | Lines | Purpose |
|------|------:|---------|
| `useNotifications.ts` | 1413 | Full push lifecycle: token registration, foreground/background handling, routing |
| `useOnboardingGuide.ts` | 337 | Per-user 3-step onboarding guide state (SecureStore) |
| `useBootAuthority.ts` | 295 | Singleton auth bootstrap state machine |
| `useLocationSearch.ts` | 187 | Place search + GPS permission for create form |
| `useEventColorOverrides.ts` | 172 | Per-user per-event calendar color overrides |
| `useHostingNudge.ts` | 127 | Hosting-limit upgrade nudge with dismiss persistence |
| `usePaginatedNotifications.ts` | 118 | Cursor-based infinite-scroll notifications |
| `useReferralClaim.ts` | 117 | One-shot post-auth referral code claimer |
| `useUnseenNotifications.ts` | 104 | Unseen notification count + markAllSeen |
| `useCoverMedia.ts` | 102 | Cover media state: URI, upload, progress, picker |
| `useAutoSync.ts` | 100 | Background calendar auto-sync (Pro, 24h cooldown) |
| `useRsvpIntentClaim.ts` | 83 | One-shot post-auth RSVP intent applier |
| `useVerificationGate.ts` | 81 | Email verification deferred-check + gate helpers |
| `useCircleInviteIntentClaim.ts` | 77 | One-shot post-auth circle-join intent claimer |
| `useLoadingTimeout.ts` | 71 | `isTimedOut` boolean for stalled loading states |
| `useBestTimePick.ts` | 61 | Pick up Who's Free time selection for create form |
| `useEntitlementsForegroundRefresh.ts` | 57 | Foreground entitlements refresh (10min throttle) |
| `useSuggestionsFeed.ts` | 51 | Personalized suggestions feed query (60s stale) |
| `useEntitlementsSync.ts` | 48 | One-shot entitlements prefetch on auth |
| `useFirstPaintStable.ts` | 46 | Delay `isStable` until post-layout for snap prevention |
| `useRevenueCatSync.ts` | 45 | RevenueCat user ID sync on login/logout |
| `usePressMotion.ts` | 30 | Reanimated press-scale animation preset |

---

## src/lib/ — Utilities (108 files, ~18,897 lines)

| File | Lines | Purpose |
|------|------:|---------|
| `authClient.ts` | 1090 | Better Auth client: SecureStore tokens, cookie injection, session fetch |
| `ideasEngine.ts` | 1042 | Deterministic idea-card generator from social context |
| `entitlements.ts` | 946 | SSOT plan-based feature gating: useEntitlements, useHostingQuota |
| `pushRouter.ts` | 847 | Push event → React Query invalidation router with dedup |
| `eventThemes.ts` | 700 | Theme catalog: 5 free + 25 premium, visual stacks |
| `authBootstrap.ts` | 681 | Auth state machine: loggedOut/onboarding/authed, 15s watchdog |
| `adminApi.ts` | 615 | Admin API: user search, badges, entitlements |
| `SubscriptionContext.tsx` | 541 | RevenueCat context: offerings, purchase, restore, feature flags |
| `calendarSync.ts` | 447 | Expo Calendar sync: device calendar, ICS import, dedup |
| `calendarUtils.ts` | 71 | Date helpers, color utilities, height system constants, ViewMode type |
| `deepLinks.ts` | 439 | Deep link router: event, user, invite, RSVP, circle, ICS |
| `revenuecatClient.ts` | 428 | RevenueCat SDK wrapper with graceful degradation |
| `offlineSync.ts` | 422 | Offline queue replay on network restore |
| `ideaScoring.ts` | 392 | Archetype-based idea scoring with seeded PRNG |
| `realtime/wsClient.ts` | 364 | WebSocket client: reconnect, rooms, heartbeat, send queue |
| `offlineQueue.ts` | 360 | Persistent offline action queue with dead-letter counting |
| `useSubscription.ts` | 358 | Subscription status + hosting quota query hooks |
| `imageUpload.ts` | 354 | Cloudinary upload pipeline: compress → sign → upload → confirm |
| `devLog.ts` | 338 | DEV logging SSOT, silent-by-default, no-op in production |
| `api.ts` | 326 | Centralized HTTP client: auth headers, error handling, kill-switch |
| `suggestionsDeck.ts` | 299 | Daily ideas deck generator with deterministic keying |
| `exactAppleAuthBootstrap.ts` | 293 | Apple auth post-backend bootstrap: token recovery, cookie, barrier |
| `smartMicrocopy.ts` | 291 | Deterministic daily microcopy SSOT for Ideas deck |
| `eventQueryKeys.ts` | 287 | Event React Query keys + effectiveAttendeeCount + invalidation |
| `shareSSOT.ts` | 285 | Share links/messages: custom scheme, branded domain, App Store URL |
| `sharedAppleAuth.ts` | 284 | Shared Apple Sign-In for welcome + login screens |
| `refreshAfterMutation.ts` | 279 | Post-mutation query invalidation contract |
| `notifications.ts` | 278 | Push registration, channel setup, token getter |
| `discussionPromptSSOT.ts` | 277 | Keyword-inferred discussion prompts with djb2 seeding |
| `sessionCache.ts` | 276 | Session fetch dedup, 60s TTL, 429 backoff |
| `appleSignIn.ts` | 273 | Apple Sign-In capability detection + error classification |
| `ThemeContext.tsx` | 270 | App theme context: accent color, dark/light/auto, token palettes |
| `devStress.ts` | 268 | DEV chaos harness: network modes, invariant signals, race injection |
| `authFlowClient.ts` | 268 | Auth flow helpers: resend verification, password reset, verify code |
| `networkStatus.ts` | 267 | NetInfo network state singleton + useNetworkStatus hook |
| `liveActivity.ts` | 256 | iOS Live Activity / Dynamic Island bridge |
| `useLiveRefreshContract.ts` | 252 | SSOT refresh: pull-to-refresh, foreground-resume, tab-focus |
| `push/registerPush.ts` | 252 | Push token registration with permission + validation |
| `permissions.ts` | 251 | Permission flows: camera, photos, notifications, calendar, contacts |
| `logout.ts` | 251 | SSOT 7-step logout sequence |
| `scheduling/engine.ts` | 249 | Scheduling engine: date range scan, slot ranking, participation |
| `errors.ts` | 245 | Error receipt builders for event-creation failures |
| `freemiumLimits.ts` | 234 | Shared freemium model constants (mirrors backend) |
| `quietHours.ts` | 230 | Suggested-hours filtering + social-slot scoring |
| `availabilitySignal.ts` | 230 | 5-state availability signal from calendar overlap |
| `rateApp.ts` | 216 | App Store review prompt: milestones, 30-day cooldown |
| `useResilientSession.ts` | 214 | Offline-resilient session hook with AsyncStorage cache |
| `offlineStore.ts` | 207 | Zustand offline store: placeholder events, local RSVPs |
| `authState.ts` | 207 | Pure-function auth state machine (6 states) |
| `autoSync.ts` | 203 | Background calendar auto-sync for Pro (24h throttle) |
| `liveRefreshProofStore.ts` | 187 | DEV-only refresh trigger history |
| `eventColorOverrides.ts` | 185 | Per-user per-event color override persistence |
| `contactsMatch.ts` | 185 | Privacy-preserving SHA-256 contact matching |
| `icsParser.ts` | 169 | Dependency-free ICS/iCalendar parser |
| `handleUtils.ts` | 168 | Handle formatting, validation, reserved list |
| `eventPalette.ts` | 166 | Event color palette: busy=grey invariant, theme derivation |
| `notificationPrompt.ts` | 164 | Soft notification pre-permission with 14-day cooldown |
| `realtime/typingRealtime.ts` | 163 | WebSocket typing indicators with 8s TTL |
| `nav.ts` | 163 | ROUTES constants + typed navigation functions |
| `realtime/circleRealtime.ts` | 161 | WebSocket circle chat: message cache patch, list sorting |
| `firstSessionGuidance.ts` | 154 | Per-user first-session action tracking (SecureStore) |
| `profileDisplay.ts` | 147 | Profile display name/avatar resolution chain |
| `scheduling/workScheduleAdapter.ts` | 143 | Work schedule → BusyWindow[] adapter |
| `authedGate.ts` | 143 | SSOT gate: bootStatus + userId required for network calls |
| `imageSource.ts` | 142 | RN Image source builder with auth headers |
| `sessionCookie.ts` | 139 | SecureStore cookie read/write/clear |
| `eventTime.ts` | 135 | Event time formatting utilities |
| `recurringEventsGrouping.ts` | 124 | Recurring event series grouping for list views |
| `push/pushReceiptStore.ts` | 121 | DEV-only push diagnostics store |
| `referral.ts` | 118 | Referral code capture from deep links (7-day expiry) |
| `mediaTransformSSOT.ts` | 118 | Cloudinary URL optimizer: sized transforms, no double-transform |
| `realtime/readRealtime.ts` | 117 | WebSocket read-horizon broadcast |
| `idempotencyKey.ts` | 114 | UUID-v4 idempotency key + postIdempotent helper |
| `validation.ts` | 113 | Input normalization: search, names, handles, bios, events |
| `eventVisibility.ts` | 113 | P0 privacy: shouldMaskEvent for busy/private events |
| `usePaginatedFriends.ts` | 112 | Cursor-based infinite-scroll friends list |
| `queryKeys.ts` | 112 | Central React Query key registry (qk object) |
| `workSkipDays.ts` | 106 | Day-off overrides suppressing work schedule blocks |
| `sessionSSoT.ts` | 105 | Canonical useSession result accessors |
| `activeProfileContext.tsx` | 102 | Active profile context with switchProfile mutation |
| `emailVerificationGate.ts` | 101 | Action-level gate for unverified users |
| `useStickyLoading.ts` | 93 | Sticky boolean hook preventing skeleton flicker |
| `referralsApi.ts` | 86 | Referral claim API with typed error codes |
| `rateLimitState.ts` | 85 | In-memory rate-limit tracker for auth bootstrap |
| `devDiagnosticsBundle.ts` | 85 | DEV diagnostics bundle builder |
| `widgetBridge.ts` | 83 | iOS Lock Screen widget bridge (App Group UserDefaults) |
| `themeBuilderStore.ts` | 82 | Zustand transient theme builder state |
| `heroSSOT.ts` | 82 | Hero aspect ratio + banner URI resolution |
| `authRouting.ts` | 82 | Post-auth routing SSOT for consistent next-route |
| `smartCopy.ts` | 81 | Availability/RSVP/scheduling human-friendly labels |
| `safeToast.ts` | 80 | Safe toast wrapper normalizing all input types |
| `realtime/realtimeConfig.ts` | 80 | WebSocket feature flag + URL derivation |
| `profileSync.ts` | 79 | Session + profile cache refresh after mutations |
| `pendingRsvp.ts` | 79 | SecureStore pending RSVP intent (7-day expiry) |
| `networkAuthGate.ts` | 78 | Module-level kill-switch blocking post-logout calls |
| `usePreloadHeroBanners.ts` | 77 | Batch prefetch hero banners through Cloudinary |
| `scheduling/adapters.ts` | 74 | Member events → BusyWindow[] adapter |
| `customThemeStorage.ts` | 74 | Custom theme AsyncStorage persistence |
| `pendingCircleInvite.ts` | 72 | SecureStore pending circle-join intent (7-day expiry) |
| `netGate.ts` | 72 | Thin shouldAllowAuthedFetch wrapper |
| `activationFunnel.ts` | 72 | First-time activation milestone tracker (PostHog) |
| `push/validatePushToken.ts` | 70 | Push token validator rejecting fakes |
| `motionSSOT.ts` | 70 | Animation preset SSOT: durations, easings, configs |
| `logoutIntent.ts` | 70 | Transient logout guard preventing post-logout side effects |
| `loadingInvariant.ts` | 69 | Monotonic loadedOnce: no skeleton regression on refetch |
| `mediaInvalidation.ts` | 68 | SSOT media mutation cache invalidation |
| `pushTokenManager.ts` | 67 | Best-effort push token deactivation on logout |
| `authExpiry.ts` | 67 | One-shot 401 auth-expiry pub/sub emitter |
| `support.ts` | 66 | Contact support via mailto with app context |
| `reconcileContract.ts` | 66 | DEV push reconciliation proof logging |
| `prodGateSelfTest.ts` | 66 | DEV boot self-test for dev overlay gating |
| `layoutSpacing.ts` | 66 | SSOT bottom-spacing constants |
| `imageUrl.ts` | 66 | Relative → absolute image URL resolver |
| `circleRefreshContract.ts` | 66 | SSOT circle-list invalidation entry point |
| `bumpCircleLastMessage.ts` | 66 | Optimistic lastMessageAt cache updater |
| `scheduling/types.ts` | 63 | Scheduling engine TypeScript types |
| `safeSecureStore.ts` | 63 | Safe expo-secure-store wrapper (no throws) |
| `apiContractInvariant.ts` | 62 | DEV API response shape drift detector |
| `circlesApi.ts` | 60 | Circle messages paginated fetch helper |
| `scheduling/format.ts` | 55 | Scheduling slot availability display formatter |
| `circleQueryKeys.ts` | 54 | Circle React Query key builders |
| `runtimeInvariants.ts` | 52 | DEV runtime invariant helpers with dedup |
| `devToolsGate.tsx` | 50 | Dev screen access control (production blocked) |
| `useInventory.ts` | 49 | Public inventory endpoints (pre-login paywall) |
| `authSessionToken.ts` | 49 | Session token validator + cookie name constant |
| `AuthContext.tsx` | 48 | Minimal auth context: state + isAuthenticated |
| `upgradeTriggers.ts` | 46 | Session-scoped upgrade prompt dedup |
| `softLimits.ts` | 45 | Active event counter (analytics display) |
| `useFirstPaintStable.ts` | 46 | Post-layout stable flag for snap prevention |
| `devConvergenceTimeline.ts` | 44 | DEV push → UI convergence timing |
| `devQueryReceipt.ts` | 41 | DEV query invalidate/refetch receipt trail |
| `devToastFilter.ts` | 38 | DEV LogBox ignore for PostHog warnings |
| `debugCookie.ts` | 38 | DEV cookie dump utility |
| `config.ts` | 38 | Environment config: BACKEND_URL, SHARE_DOMAIN, APP_STORE |
| `infiniteQuerySSOT.ts` | 36 | Infinite-scroll constants: max pages, debounce |
| `authKeys.ts` | 33 | SecureStore key names for auth |
| `useMinuteTick.ts` | 32 | 60s tick counter for time-sensitive UI |
| `fonts.ts` | 32 | SSOT font map for Sora weights |
| `entitlementsApi.ts` | 28 | GET /api/entitlements helper |
| `state/example-state.ts` | 27 | Template Zustand store with persist middleware |
| `devFlags.ts` | 27 | DEV feature flags: probes, overlays |
| `apiRoutes.ts` | 23 | Typed API route string constants |
| `features.ts` | 22 | Feature flag registry (placeholder) |
| `devAgentSession.ts` | 22 | DEV agent session ID for concurrent edits |
| `activeCircle.ts` | 21 | Module-level focused circle getter/setter |
| `usePreloadImage.ts` | 20 | Fire-and-forget single image prefetch |
| `useSession.tsx` | 18 | Re-export: useSession = useResilientSession |
| `useClientOnlyValue.web.ts` | 12 | Web: server→client value switch after hydration |
| `hostingQueryKeys.ts` | 11 | Hosting quota React Query key |
| `useColorScheme.web.ts` | 8 | Web stub: always returns 'light' |
| `cn.ts` | 6 | clsx + tailwind-merge utility |
| `useClientOnlyValue.ts` | 4 | Native no-op: always returns client value |
| `useColorScheme.ts` | 1 | Re-export useColorScheme from React Native |

---

## Totals

| Directory | Files | Lines |
|-----------|------:|------:|
| `src/app/` | 47 | ~43,530 |
| `src/components/` | 133 | ~33,127 |
| `src/hooks/` | 22 | ~3,543 |
| `src/lib/` | 107 | ~18,897 |
| **Total** | **309** | **~99,097** |
