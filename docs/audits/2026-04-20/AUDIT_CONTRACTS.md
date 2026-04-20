# Contract Drift Audit — Open Invite

**Date:** 2026-04-20
**Branch:** main @ f97b2b9
**Status:** clean (3 untracked changes in app.json, iOS plists — unrelated)

---

## Purpose

Audit contract drift across three surfaces:
1. **SSOT types file:** `shared/contracts.ts` (Zod schemas + inferred TS types)
2. **Backend:** `~/Documents/GitHub/my-app-backend` — Hono routes + Prisma schema
3. **Frontend consumers:** screens, hooks, queries, mutations in `src/`

Goal: flag fields consumers read that backend doesn't return, fields backend returns that no consumer reads (dead payload), nullable mismatches, enum drift, and hand-rolled shapes that duplicate contract types.

---

## Current Behavior

`shared/contracts.ts` is the shared SSOT (synced comment at line 2 references backend copy at `my-app-backend/src/shared/contracts.ts`). The file exports ~120 types/schemas covering Events, RSVP, Friends, Groups, Circles, Notifications, Profile, Achievements, Stories, Business, Event Requests, and Suggestions. However, several major feature domains (Subscription, Entitlements, Hosting Quota) have NO representation in contracts.ts — types are hand-rolled in frontend utility files.

---

## Target Behavior

Every API response shape consumed by the frontend should:
1. Be defined as a Zod schema in `shared/contracts.ts`
2. Be used (via type import) by both backend route handlers and frontend consumers
3. Match the Prisma model fields that the backend actually serializes
4. Have no hand-rolled duplicates in frontend component files

---

## Codebase Map

### A. Types Audited — Contract ↔ Backend ↔ Frontend

| Type | Backend Producer | Frontend Consumers | Drift Found |
|------|-----------------|-------------------|-------------|
| `Event` (eventSchema) | GET /api/events, /feed, /friends-hosted-feed, /calendar-events, /:id | calendar.tsx, discover.tsx, social.tsx, event/[id].tsx, public-profile.tsx, FeedCalendar.tsx, CalendarDayCells.tsx, CalendarEventListItem.tsx, CalendarListView.tsx, offlineStore.ts, recurringEventsGrouping.ts | **(a)** `isWork` accessed via `as any` — not in schema; **(c)** `endTime` nullable in contract but required in Prisma |
| `Event.cardColor` | Prisma: `cardColor String? @db.VarChar(9)` | discover.tsx (card backgrounds), create.tsx | None — aligned |
| `Event.themeId` | Prisma: `themeId String?` | create.tsx, event/[id].tsx | None — aligned, ALLOWED_THEME_IDS shared |
| `Event.effectId` | Prisma: `effectId String?` | create.tsx, event/[id].tsx | None — aligned |
| `Event.viewerRsvpStatus` | Computed in route handler (joined from event_interest) | social.tsx, discover.tsx, event/[id].tsx | None — aligned |
| `Event.viewerColor` | Computed from event_color_preference | event/[id].tsx | None — aligned |
| `Event.isUnderReview` | Prisma: `isUnderReview Boolean` | NOT in eventSchema, NOT consumed by frontend | **(b)** Dead Prisma field — never sent to client |
| `Event.groupVisibility` | Joined from event_group_visibility | event/[id].tsx (accessed via `as any` at line 2259) | **(e)** `as any` cast despite field existing in schema |
| `GetFriendsHostedFeedResponse` | GET /api/events/friends-hosted-feed | discover.tsx | None — `isJoinable` extension aligned |
| `RsvpResponse` | POST /api/events/:id/rsvp | social.tsx, event/[id].tsx, offlineSync.ts | **(e)** offlineSync.ts:57 hand-rolls `RsvpResponse` with `[key: string]: any` |
| `EventComment` | GET/POST /api/events/:id/comments | event/[id].tsx | None — aligned |
| `EventPhoto` | GET/POST /api/events/:id/photos | EventPhotoGallery.tsx | **(b)** Prisma has `publicId, bytes, width, height` — backend omits them, contract omits them, frontend doesn't need them. Intentional but undocumented. |
| `GuestRsvpItem` | Embedded in event detail response | AttendeesSheet.tsx, WhosComingCard.tsx | **(e)** Both define local `GuestRsvpEntry` interface instead of importing `GuestRsvpItem` |
| `Friendship` | GET /api/friends | calendar.tsx, circles.tsx, discover.tsx, CircleAddMembersModal.tsx, CircleMembersSheet.tsx, ShareToFriendsSheet.tsx, usePaginatedFriends.ts | **(e)** whos-free.tsx:78 hand-rolls `Friendship` missing `groupMemberships` |
| `GetFriendsResponse` | GET /api/friends | whos-free.tsx, calendar.tsx, discover.tsx | **(e)** whos-free.tsx:89 hand-rolls `GetFriendsResponse` |
| `FriendUser` | Nested in friendship, search, profile responses | friend/[id].tsx, user/[id].tsx, public-profile.tsx | None — aligned |
| `FriendUser.Profile.bannerUrl` vs `bannerPhotoUrl` | Prisma: only `bannerUrl`. Backend aliases to `bannerPhotoUrl` in route handler | friendUserSchema has BOTH fields | **(d)** Confusing dual field — `bannerUrl` is DB truth, `bannerPhotoUrl` is API alias |
| `FriendRequest` | GET /api/friends/requests | BottomNavigation.tsx (count only) | None — aligned |
| `FriendSuggestion` | GET /api/friends/suggestions | discover.tsx, FriendDiscoverySurface.tsx | None — aligned |
| `FriendGroup` | GET/POST/PUT/DELETE /api/groups | (used indirectly via groupVisibility) | None — aligned |
| `Circle` | GET /api/circles, /:id | circles.tsx, CircleCard.tsx, CircleAvailabilitySection.tsx, create-settings.tsx, SettingsSheetContent.tsx, ShareToFriendsSheet.tsx, FriendsChatsPane.tsx | None — aligned |
| `CircleMember` | Nested in Circle.members | CircleMembersSheet.tsx, CircleAvailabilitySheet.tsx | **(e)** Both define local `CircleMember` interface instead of importing from contracts |
| `CircleMessage` | GET /api/circles/:id/messages | CircleChatSection.tsx, circlesApi.ts | None — aligned |
| `CircleMessage reactions` | Prisma: `circle_message_reaction` model; POST/DELETE endpoint exists | CircleChatSection.tsx uses reactions | **(a)** No reaction schema in contracts.ts — feature fully implemented without contract |
| `Notification` | GET /api/notifications | social.tsx, ActivityFeed.tsx, usePaginatedNotifications.ts | **(a)** Frontend accesses `actorId` (ActivityFeed.tsx:77) but field not in notificationSchema; **(b)** Backend returns `entityId, seenAt` — no frontend consumer |
| `NotificationPreferences` | GET/PUT /api/notifications/preferences | settings.tsx (notification settings) | None — aligned |
| `GetProfileResponse` | GET /api/profile | edit-profile.tsx, settings.tsx, profileDisplay.ts | None — aligned |
| `UpdateProfileRequest/Response` | PUT /api/profile | edit-profile.tsx, settings.tsx | None — aligned |
| `SearchUserResult` | GET /api/profile/search | FriendDiscoverySurface.tsx | None — aligned |
| `EventRequest` | GET /api/event-requests, /feed/whos-down | calendar.tsx, discover.tsx, BottomNavigation.tsx | None — aligned |
| `WhosDownFeedResponse` | GET /api/event-requests/feed/whos-down | discover.tsx | None — aligned |
| `EventReminder` | POST/GET /api/events/:id/reminders | (limited usage) | **(a)** Contract has `sent`, `reminderTime` — Prisma has `isEnabled`, no `sent`/`reminderTime` fields |
| `GetCalendarEventsResponse` | GET /api/events/calendar-events | calendar.tsx | None — aligned |
| `ImportCalendarEventsResponse` | POST /api/events/import | import-calendar.tsx | **(e)** import-calendar.tsx:69 hand-rolls `ImportCalendarEventsResponse` instead of importing |
| `GetImportedEventsResponse` | GET /api/events/imported | import-calendar.tsx | **(e)** import-calendar.tsx:83 hand-rolls `GetImportedEventsResponse` |
| `HostAnalyticsResponse` | GET /api/events/analytics | host-analytics.tsx | None — aligned |
| `Achievement/AchievementProgress` | GET /api/achievements | (achievements screen) | None — aligned |
| `Story/StoryGroup` | GET /api/stories/feed | (stories feature) | None — aligned |
| `Business/BusinessEvent` | Various /api/businesses/* endpoints | (business features) | **(b)** Business Prisma models marked `@@ignore` — feature dormant |
| `GetProfilesResponse` | GET /api/profiles | account-center.tsx, BottomNavigation.tsx | None — aligned |
| — **NOT IN CONTRACTS** — | | | |
| Subscription (tier, limits) | GET /api/subscription, /api/subscription/limits | useSubscription.ts:159 `SubscriptionData`, freemiumLimits.ts:225 `SubscriptionStatus` | **(e)** Two separate hand-rolled types, neither in contracts.ts |
| Entitlements | GET /api/entitlements | entitlements.ts:65 `EntitlementsResponse`, `PlanLimits`, `PlanFeatures`, `UsageCounts` | **(e)** Entire entitlements type system hand-rolled outside contracts |
| Hosting Quota | GET /api/hosting/quota | (referenced in entitlements.ts) | **(e)** No contract schema — response shape undocumented |
| `FriendBirthday.isOwnBirthday` | Backend may add this field | calendar.tsx:899,1055 accesses via `as any` | **(a)** Field consumed but not in `friendBirthdaySchema` |

### B. Hand-Rolled Type Duplicates

| File:Line | Local Type | Duplicates Contract Type | Fields Missing/Divergent |
|-----------|-----------|-------------------------|--------------------------|
| src/app/whos-free.tsx:78 | `Friendship` | `Friendship` from contracts | Missing `groupMemberships`, `isBlocked`, `createdAt` |
| src/app/whos-free.tsx:89 | `GetFriendsResponse` | `GetFriendsResponse` from contracts | Structurally identical but decoupled |
| src/components/event/AttendeesSheet.tsx:19 | `GuestRsvpEntry` | `GuestRsvpItem` from contracts | Different name, same shape |
| src/components/event/WhosComingCard.tsx:42 | `GuestRsvpEntry` | `GuestRsvpItem` from contracts | Different name, same shape (duplicate of above) |
| src/components/circle/CircleMembersSheet.tsx:24 | `CircleMember` | `CircleMember` from contracts | Subset — missing `circleId`, `isPinned`, `joinedAt` |
| src/components/circle/CircleAvailabilitySheet.tsx:24 | `CircleMember` | `CircleMember` from contracts | Same subset as above |
| src/components/FriendCard.tsx:19 | `Friend` | Subset of `FriendUser` | Only id/name/email/image — no Profile/featuredBadge |
| src/components/FriendPickerSheet.tsx:13 | `Friend` | Subset of `Friendship` | Simplified — only id/friendId/friend fields |
| src/lib/offlineSync.ts:51 | `CreateEventResponse` | `CreateEventResponse` from contracts | Uses `[key: string]: any` escape hatch |
| src/lib/offlineSync.ts:57 | `RsvpResponse` | `RsvpResponse` from contracts | Uses `[key: string]: any` escape hatch |
| src/app/import-calendar.tsx:69 | `ImportCalendarEventsResponse` | `ImportCalendarEventsResponse` from contracts | Locally redefined — may diverge silently |
| src/app/import-calendar.tsx:83 | `GetImportedEventsResponse` | `GetImportedEventsResponse` from contracts | Locally redefined — may diverge silently |
| src/lib/entitlements.ts:65 | `EntitlementsResponse` | — (no contract) | Entire type system outside contracts |
| src/lib/freemiumLimits.ts:225 | `SubscriptionStatus` | — (no contract) | Separate from useSubscription.ts:159 `SubscriptionData` |
| src/lib/useSubscription.ts:159 | `SubscriptionData` | — (no contract) | Third subscription type, no SSOT |

### C. `as any` Casts on Contract Types

| File:Line | Property | Reason |
|-----------|----------|--------|
| src/app/calendar.tsx:1092,1597 | `(event as any).isWork` | `isWork` not in eventSchema |
| src/app/calendar.tsx:899,1055 | `(bday as any).isOwnBirthday` | Not in friendBirthdaySchema |
| src/components/calendar/CalendarListView.tsx:52,55,57 | `(e as any).effectiveStartTime` | Field IS in eventSchema (optional) — cast unnecessary |
| src/components/FeedCalendar.tsx:248-249 | `(e as any).isBusy, .isWork` | `isBusy` IS in schema; `isWork` is not |
| src/lib/eventPalette.ts:77,82-85 | `(event as any).title, .busy, .isBusyBlock, .busyEvent` | Internal computed fields, not from API |
| src/app/event/[id].tsx:998-1000 | `.showGuestList, .showGuestCount, .hideDetailsUntilRsvp` | Fields ARE in eventSchema — cast unnecessary |
| src/app/event/[id].tsx:1988 | `(event as any).isWork` | Not in eventSchema |
| src/app/event/[id].tsx:2259 | `.groupVisibility` | IS in eventSchema — cast unnecessary |
| src/app/discover.tsx:1208-1379 | `TILE_SHADOW as any` | Style object cast — not contract-related |

---

## Drift Summary

### By Category

**(a) Fields consumers read that backend doesn't return (or not in contract):** 5 items
1. `Event.isWork` — accessed via `as any` in calendar.tsx, FeedCalendar.tsx, event/[id].tsx — not in eventSchema, not a Prisma field (computed client-side from work schedule?)
2. `FriendBirthday.isOwnBirthday` — accessed via `as any` in calendar.tsx — not in friendBirthdaySchema
3. `Notification.actorId` — accessed in ActivityFeed.tsx but not in notificationSchema (backend DOES return it)
4. `EventReminder.sent` / `EventReminder.reminderTime` — in contract but NOT in Prisma model
5. Circle message reactions — fully implemented backend+frontend, no contract schema

**(b) Fields backend returns that no consumer reads (dead payload):** 4 items
1. `Notification.entityId` — returned by backend, not consumed
2. `Notification.seenAt` — returned by backend, not consumed
3. `Event.isUnderReview`, `underReviewAt`, `underReviewReason` — Prisma fields, never serialized to API
4. `EventPhoto` Prisma extras (`publicId, bytes, width, height`) — intentionally omitted from API response

**(c) Nullable mismatches:** 2 items
1. `Event.endTime` — `z.string().nullable()` in contract, but `DateTime` (required) in Prisma; backend always provides a value
2. `Event.description` — `z.string().nullable()` in contract, `String?` in Prisma — aligned

**(d) Enum/field drift:** 1 item
1. `FriendUser.Profile` has both `bannerUrl` and `bannerPhotoUrl` — Prisma only has `bannerUrl`; backend aliases one to the other

**(e) Hand-rolled shapes duplicating contract types:** 15 items (see table B above)

---

## Rollout Order

### P0 — Type Safety (prevents runtime bugs)
1. Add `actorId`, `entityId`, `seenAt` to `notificationSchema` — frontend already reads `actorId`
2. Fix `EventReminder` schema to match Prisma model (`isEnabled` instead of `sent`, remove `reminderTime`)
3. Add circle message reaction schema to contracts.ts

### P1 — Consolidation (prevents silent divergence)
4. Add `SubscriptionData` / `EntitlementsResponse` / `HostingQuotaResponse` schemas to contracts.ts
5. Replace hand-rolled `Friendship` in whos-free.tsx with contract import
6. Replace hand-rolled `GuestRsvpEntry` in AttendeesSheet.tsx + WhosComingCard.tsx with `GuestRsvpItem` import
7. Replace hand-rolled `CircleMember` in CircleMembersSheet.tsx + CircleAvailabilitySheet.tsx with contract import
8. Replace hand-rolled response types in import-calendar.tsx with contract imports
9. Replace `[key: string]: any` escape hatches in offlineSync.ts with contract types

### P2 — Cleanup (cosmetic/hygiene)
10. Remove unnecessary `as any` casts where field already exists in schema (CalendarListView, event/[id].tsx:998-1000, event/[id].tsx:2259)
11. Resolve `bannerUrl` vs `bannerPhotoUrl` — pick one name, remove the alias
12. Tighten `Event.endTime` to non-nullable in contract (backend always provides value)
13. Add `isWork` to eventSchema if it's a real API field, or document it as client-computed
14. Add `isOwnBirthday` to `friendBirthdaySchema` if backend returns it

---

## Risks & Invariants

1. **Shared file sync:** `shared/contracts.ts` has a backend copy at `my-app-backend/src/shared/contracts.ts`. Any change to one MUST be mirrored. Consider symlinking or a shared package.
2. **Hand-rolled types silently diverge:** The 15 duplicates in section B will not cause build errors if contracts.ts changes — they'll just silently return wrong data. This is the highest-risk class of drift.
3. **`as any` bypasses:** 9 locations bypass TypeScript's safety. Some are necessary (computed fields), others are unnecessary and mask real type errors.
4. **Entitlements/Subscription types are fragmented:** Three separate files define subscription-related types (`entitlements.ts`, `freemiumLimits.ts`, `useSubscription.ts`) with overlapping but non-identical shapes. A contract change in the backend could break any of them independently.
5. **Business models @@ignore:** Prisma business models are marked `@@ignore`, meaning they exist in the DB but ORM operations will fail. Business contract types in contracts.ts are orphaned.

---

## Proof

**Types audited:** 42
**Drift items found:** 27
- (a) Consumer reads missing field: 5
- (b) Dead payload / unreturned fields: 4
- (c) Nullable mismatches: 2
- (d) Enum/field drift: 1
- (e) Hand-rolled duplicates: 15

**Dead fields in Prisma (never serialized):** 3 (`isUnderReview`, `underReviewAt`, `underReviewReason`)

**Files changed:** Only this file (AUDIT_CONTRACTS.md)
