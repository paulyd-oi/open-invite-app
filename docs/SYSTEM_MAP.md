# System Map — Open Invite

> Architecture overview and pointers to detailed subsystem docs.
> Last updated: 2026-03-28.

---

## App Flow

```
Boot → Auth Gate (bootStatus === 'authed')
  ├── (tabs)
  │   ├── Discover (feed + saved + ideas)
  │   ├── Calendar (pinch-zoom 4-mode)
  │   ├── Friends (roster + circles/chats)
  │   └── Profile / Settings
  ├── create.tsx (event creation)
  ├── event/[id].tsx (event detail)
  ├── event/edit/[id].tsx (event editing)
  ├── circle/[id].tsx (circle chat)
  └── Modals (paywall, notifications, share)
```

---

## Subsystems

| System | Owner File(s) | Doc |
|--------|--------------|-----|
| **Create Flow** | `src/app/create.tsx`, `src/components/create/*` | [create-flow.md](SYSTEMS/create-flow.md) |
| **Event Page** | `src/app/event/[id].tsx`, `src/app/event/edit/[id].tsx` | [event-page.md](SYSTEMS/event-page.md) |
| **Theme & Effects** | `src/lib/eventThemes.ts`, `ThemeEffectLayer.tsx`, `MotifOverlay.tsx` | [theme-effects.md](SYSTEMS/theme-effects.md) |
| **Chat (Circles)** | `src/app/circle/[id].tsx`, `src/components/circle/*` | [chat.md](SYSTEMS/chat.md) |
| **Discover** | `src/app/discover.tsx`, `src/components/ideas/DailyIdeasDeck.tsx` | [discover.md](SYSTEMS/discover.md) |
| **Calendar** | `src/app/calendar.tsx`, `src/lib/calendarSync.ts` | [calendar.md](SYSTEMS/calendar.md) |
| **Location** | `src/hooks/useLocationSearch.ts`, `src/components/create/placeSearch.ts` | [location.md](SYSTEMS/location.md) |

---

## Shared Infrastructure

| Concern | File(s) | Notes |
|---------|---------|-------|
| Query keys | `src/lib/eventQueryKeys.ts` | SSOT for all cache keys + invalidation |
| API client | `src/lib/api.ts` | `postIdempotent()`, error normalization |
| Auth | `src/lib/authClient.ts` | Better Auth, cookie sessions |
| Layout spacing | `src/lib/layoutSpacing.ts` | Bottom padding constants |
| Share URLs | `src/lib/shareSSOT.ts` | Universal link builder |
| Contracts | `shared/contracts.ts` | Zod schemas (must sync with backend) |

---

## Cross-Cutting Rules

1. **Contract alignment:** Prisma schema ↔ backend serializer ↔ backend contracts ↔ frontend contracts. All four in sync.
2. **Route parity:** Backend routes registered in both `src/index.ts` (dev) and `src/server.ts` (prod).
3. **Particle exclusivity:** effectId → MotifOverlay; else theme → ThemeEffectLayer. Never both.
4. **Layout spacing:** Use constants from `layoutSpacing.ts`. No magic numbers for bottom padding.
5. **System doc updates:** Changes to a subsystem must update the corresponding `docs/SYSTEMS/*.md` file.

---

## Enforcement

> When modifying any subsystem listed above, update the corresponding `docs/SYSTEMS/*.md` file
> to reflect the change. This keeps the system map accurate across sessions.
