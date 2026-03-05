# Open Invite — Hotspot Registry

A hotspot is any file that is risky to edit concurrently. This file is the
single source of truth for which agent owns which files during a work batch.

---

## How To Use

Before starting a task:
1. Add an entry under ACTIVE CLAIMS with your agent label and the files you will touch.
2. Check that no other agent has claimed the same files.
3. After your commit lands, remove your claim and add a note to RECENTLY_FREED.

Format for a claim:

  [AGENT_X] CLAIMED_BY: [AGENT_X]
  Files:
    path/to/file1.tsx
    path/to/file2.ts
  Reason: [one line description of the task]
  Started: [date or commit SHA]

---

## Permanently Hot Files (Always Single-Writer)

These files must NEVER be edited by two agents simultaneously. Always check
before touching. If another agent is active, wait or coordinate.

  package.json
  shared/contracts.ts
  backend/src/server.ts
  backend/src/index.ts
  scripts/doctor.mjs
  app.json
  ios/OpenInvite/Info.plist
  ios/OpenInviteTodayWidget/Info.plist

---

## Active Claims

[GROWTH_P3] CLAIMED_BY: [GROWTH_P3]
Files:
  src/lib/pendingRsvp.ts (NEW)
  src/hooks/useRsvpIntentClaim.ts (NEW)
  src/lib/deepLinks.ts
  src/analytics/analyticsEventsSSOT.ts
  src/app/_layout.tsx
Reason: Phase 3 — RSVP before signup funnel inversion
Started: 2026-03-04

---

## Recently Freed

(add entries here after your task commits, with the commit SHA)
  [AGENT_A] freed src/app/friends.tsx, src/lib/usePaginatedFriends.ts, src/lib/refreshAfterMutation.ts, src/components/friends/FriendsPeoplePane.tsx — 2026-03-04
  [AGENT_B] freed src/app/profile.tsx, src/components/InlineErrorCard.tsx — 2026-03-04
  [AGENT_C] freed src/lib/offlineQueue.ts, src/app/settings.tsx — 2026-03-04
  [AGENT_A] freed welcome.tsx, profile.tsx, settings.tsx, event/[id].tsx, EventPhotoGallery.tsx, DailyIdeasDeck.tsx — 2026-03-04
  [AGENT_B] freed mediaTransformSSOT.ts, EntityAvatar.tsx — 2026-03-04
  [AGENT_C] freed MonthlyRecap.tsx, SwipeableEventRequestCard.tsx — 2026-03-04
  [BATCH3] freed ActivityFeed.tsx, circle/[id].tsx, settings.tsx — 2026-03-04
  [LANE3] freed settings.tsx, analyticsEventsSSOT.ts — 2026-03-04 (8646b9d)
  [BATCH6] freed friends.tsx, ActivityFeed.tsx — 2026-03-04 (ef0d544)
  [BATCH7] freed usePaginatedNotifications.ts, analyticsEventsSSOT.ts, notifications.ts(BE), schema.prisma(BE), HARDENING_SSOT_100K.md(BE) — 2026-03-04 (70f5cbe)
  [BATCH8] freed ActivityFeed.tsx, analyticsEventsSSOT.ts, notifications.ts(BE), friends.ts(BE), HARDENING_SSOT_100K.md(BE) — 2026-03-04 (971e4c5)
  [AGENT_F] freed infiniteQuerySSOT.ts, social.tsx, usePaginatedFriends.ts, usePaginatedNotifications.ts — 2026-03-04
  [BATCH11] freed api.ts, analyticsEventsSSOT.ts, OfflineBanner.tsx(FE), events.ts, notifications.ts, rateLimit.ts, schema.prisma, HARDENING_SSOT_100K.md(BE) — 2026-03-04 (9d48bbd/7044f06)
  [BATCH9] freed events.ts(BE), social.tsx(FE), analyticsEventsSSOT.ts(FE) — 2026-03-04 (2621cca/647848e)
  [BATCH10] freed events.ts(BE), HARDENING_SSOT_100K.md(BE) — 2026-03-04 (3ded67c)
  [BATCH12] freed db.ts(BE), middleware/requestId.ts(BE), events.ts(BE), notifications.ts(BE), api.ts(FE), analyticsEventsSSOT.ts(FE) — 2026-03-04 (d9e1759/4aa9f85)
  [BATCH13] freed expoPush.ts(BE), notifications.ts(FE), useNotifications.ts(FE), analyticsEventsSSOT.ts(FE) — 2026-03-04 (7930589/d2e6def)
  [BATCH14] freed cache.ts(BE), events.ts(BE), notifications.ts(BE), HARDENING_SSOT_100K.md(BE) — 2026-03-04 (19ba7fc)
  [GROWTH_P1] freed welcome.tsx, analyticsEventsSSOT.ts — 2026-03-04
  [GROWTH_P2] freed welcome.tsx, analyticsEventsSSOT.ts — 2026-03-04

Example:
  [AGENT_A] freed src/app/friends.tsx after commit abc1234
  [AGENT_B] freed src/app/social.tsx after commit def5678

---

## Hotspot Severity Guide

HIGH — changes here can break the build or auth flow for all users:
  src/app/_layout.tsx
  src/app/index.tsx
  src/app/welcome.tsx
  src/lib/useSession.tsx
  src/lib/useResilientSession.ts
  src/lib/api.ts
  src/lib/authClient.ts
  backend/src/server.ts
  backend/src/index.ts
  shared/contracts.ts
  package.json
  app.json

MEDIUM — changes here affect a major feature or shared component:
  src/app/friends.tsx
  src/app/social.tsx
  src/app/calendar.tsx
  src/app/profile.tsx
  src/components/BottomNavigation.tsx
  src/components/AppHeader.tsx
  src/lib/useLiveRefreshContract.ts
  src/lib/eventQueryKeys.ts

LOW — scoped feature files, safe to parallelize with different agents:
  src/app/suggestions.tsx
  src/app/add-friends.tsx
  src/app/whos-free.tsx
  src/app/subscription.tsx
  src/app/settings.tsx
  src/components/CircleCard.tsx
  scripts/doctor.mjs
  docs/**
