# Activity Feed (Notifications)

> Friends → Activity tab. Renders the user's notification list.
> Owner: `src/components/activity/ActivityFeed.tsx`, `src/hooks/usePaginatedNotifications.ts`

---

## Data Source

- Endpoint: `GET /api/notifications/paginated?limit=30&cursor=<id>`
- Hook: `usePaginatedNotifications` (cursor-based `useInfiniteQuery`)
- Query key: `qk.notifications()` → `["notifications"]`

**Backend order note:** The endpoint currently returns notifications sorted by
`id` DESC (cuid, not strictly time-monotonic under backfill / server clock
skew). The client therefore sorts the flattened page list by `createdAt` DESC
before display. Do not rely on server-returned order for positioning.

---

## Freshness Contract — `[NOTIF_FRESHNESS_V1]`

These behaviors MUST be preserved:

1. **Sort by `createdAt` DESC** (not `id`, not `updatedAt`, not `eventDate`). Sort lives in `usePaginatedNotifications.ts`, applied AFTER dedupe.
2. **`staleTime: 0`** on the infinite query so focus/foreground refetch hits the network.
3. **`refetchOnMount: true`** so remounting the pane (e.g. tab flip) re-pulls.
4. **`useFocusEffect` MUST call `refetch()`** alongside `markAllSeen()`. Returning to the screen is the most common refresh trigger.
5. **AppState foreground listener MUST call `refetch()`** on `state === "active"`. React Query's `refetchOnWindowFocus` is globally disabled on mobile; manual AppState wiring is required.

Violating any of these reintroduces the "February-era items on top in April" bug that shipped pre-[NOTIF_FRESHNESS_V1].

---

## Downstream Pipeline

```
usePaginatedNotifications
  → flatten pages
  → dedupe by id
  → sort createdAt DESC   ← [NOTIF_FRESHNESS_V1]
  → ActivityFeed
      → contentDedup (type+eventId+day, collapse stacked reminders)
      → filter (all / events / friends / reminders)
      → render NotificationCard
```

`contentDedup` keeps the first-seen notification for each collision key — it relies on the upstream sort being newest-first so the most recent representative wins.

---

## Invariants

- Sort field is `createdAt`. Never sort by event `startTime`, notification `id`, or `updatedAt`.
- The feed refetches on screen focus AND app foreground.
- `staleTime` for the paginated notifications query is 0. Do not raise it; that re-introduces stale-cache-on-return.
- Content dedup trusts upstream newest-first ordering; any change to the sort order must re-validate dedup behavior.
