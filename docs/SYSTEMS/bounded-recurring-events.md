# Bounded Recurring Events

> Migration from runtime recurrence interpretation to bounded generated occurrences.
> Status: DESIGN — not yet implemented.
> Created: 2026-03-30.

---

## Purpose

Replace the current "one row + runtime `nextOccurrence` computation" model for recurring events with concrete, bounded child event records. Every surface (Discover, Calendar, event detail) should operate on real event rows with real `startTime`/`endTime`, not derive timing from a recurrence pattern at read time.

---

## Current Behavior

### Storage

Each recurring event is stored as **one event row** in the `event` table with:
- `isRecurring: true`
- `recurrence: "weekly" | "biweekly" | "monthly"`
- `startTime` / `endTime` = the **original** (first) occurrence's times

### Partial Generation at Create Time

The backend **already creates extra rows** at event creation:
- Weekly: 4 total rows (original + 3 more weeks)
- Monthly: 3 total rows (original + 2 more months)
- Biweekly: **not handled** (no generation)

Each generated row is a completely independent `event` record — same `isRecurring`, same `recurrence`, same `title`/`userId`, but its own `id`, `startTime`, `endTime`. **No link between them** (no `seriesId`, no `parentEventId`).

### Runtime Interpretation

`serializeEvent()` computes `nextOccurrence` at read time:
```ts
function getNextOccurrence(startTime: Date, recurrence: string): Date {
  const next = new Date(startTime);
  while (next < now) next.setDate(next.getDate() + interval);
  return next;
}
```

This creates "phantom" future occurrences that extend indefinitely beyond the generated rows.

### Feed Endpoint (`/api/events/feed`)

- Passes ALL recurring events through the date filter (`{ isRecurring: true }` bypasses `endTime >= now`)
- `[ONE_RECURRING_PER_HOST]` deduplication picks the "best" recurring row per host
- Frontend Discover adds title+host dedup as a second pass

### Calendar Endpoint (`/api/events/calendar-events`)

- Filters by `startTime < rangeEnd AND (endTime > rangeStart OR startTime >= rangeStart)`
- This uses **raw DB startTime/endTime** — does NOT consider `nextOccurrence`
- Recurring events whose generated rows have all passed fall outside the range → **not returned**

### Event Detail

- Uses `nextOccurrence` for display date and countdown
- Uses raw `endTime` for reflection gate and live activity (fixed in commit 5778de3)

---

## Problems with Current Model

1. **Calendar omission**: After all generated rows pass, recurring events vanish from Calendar even though Discover still shows them via `nextOccurrence`. Root cause: Calendar queries by raw `startTime`/`endTime`, `nextOccurrence` is a serialization-time computation.

2. **Infinite phantom occurrences**: `getNextOccurrence()` computes future dates forever. A weekly event from January will show an "upcoming" occurrence in December — the host never explicitly created that.

3. **No series linkage**: Generated rows are independent. Cannot answer "show all occurrences of this event" or "edit all future occurrences."

4. **Inconsistent generation**: Weekly = 4, monthly = 3, biweekly = 0. No principled policy.

5. **Duplicate card risk**: Multiple rows per series + runtime `nextOccurrence` on each = frontend must deduplicate at every surface.

6. **State confusion across surfaces**: Discover, Calendar, detail, reflection gate, countdown, and live activity each derive timing differently. Some use `nextOccurrence`, some use raw `startTime`/`endTime`, some compute duration.

---

## Target Behavior

### Bounded Generation Policy

| Recurrence | Total Occurrences | Interval |
|-----------|-------------------|----------|
| weekly    | 8                 | 7 days   |
| biweekly  | 6                 | 14 days  |
| monthly   | 4                 | 1 month  |

When a user creates a recurring event, the backend materializes all occurrences immediately as concrete event rows.

### Storage / Contract Model

**New fields on `event` table:**

```prisma
model event {
  // ... existing fields ...
  seriesId        String?   // Links all occurrences in a series (null for non-recurring)
  seriesIndex     Int?      // 0-based index within series (0 = first occurrence)
}
```

**Series semantics:**
- `seriesId` = the `id` of the first (seed) event in the series
- Every occurrence in a series shares the same `seriesId`
- The seed event has `seriesId = its own id` and `seriesIndex = 0`
- Each occurrence is a full event with real `startTime`/`endTime`
- `isRecurring` and `recurrence` remain on each occurrence for display purposes

**Why not a separate `event_series` table?**
- Adds schema complexity for minimal gain
- `seriesId` pointing to the first event is sufficient
- Future "edit all future" can query `WHERE seriesId = X AND seriesIndex >= Y`

### Creation Flow

```
POST /api/events (isRecurring: true, recurrence: "weekly")
  1. Validate inputs, check Pro entitlement
  2. Create seed event (seriesIndex: 0)
  3. Set seriesId = seed event's id
  4. Generate remaining occurrences:
     - weekly: 7 more (8 total), each +7 days
     - biweekly: 5 more (6 total), each +14 days
     - monthly: 3 more (4 total), each +1 month
  5. Each occurrence: same title/description/location/emoji/theme/etc.
     - Own startTime/endTime (computed from seed + offset)
     - Own id (cuid)
     - seriesId = seed id
     - seriesIndex = 1, 2, 3...
     - isRecurring = true, recurrence = "weekly"/"biweekly"/"monthly"
  6. Return seed event (same as today)
  7. Notifications: send only for seed event (same as today)
```

### Read-Path Simplification

**Calendar endpoint (`/api/events/calendar-events`):**
- No change needed — each occurrence has real `startTime`/`endTime`
- The existing `dateRangeFilter` naturally finds concrete rows
- Remove the recurring-event-aware query added in the interim fix

**Feed endpoint (`/api/events/feed`):**
- Remove `{ isRecurring: true }` bypass in date filter
- Concrete rows with future `endTime` pass the normal `endTime >= now` filter
- `[ONE_RECURRING_PER_HOST]` remains for backward compat but can be simplified to `[ONE_PER_SERIES]` using `seriesId`

**Event detail:**
- Remove all `nextOccurrence` derivation
- Use `startTime`/`endTime` directly (they are now concrete)
- Reflection gate, countdown, live activity all use real times

**Discover:**
- Remove series-key collapse dedup (concrete rows + one-per-series backend filter handles this)
- Remove `nextOccurrence` usage for effective time

**Serializer:**
- Remove `getNextOccurrence()` runtime computation
- `nextOccurrence` field can be deprecated (set to `null`) for new events
- Legacy events: still compute `nextOccurrence` for backward compat until migrated

### Editing Semantics

**For initial implementation (keep simple):**
- "Edit this event" = edit single occurrence
- No "edit all future" yet
- Delete single occurrence = just delete that row
- Delete entire series = delete all events with matching `seriesId`

**Future support (not now, but design accommodates):**
- "Edit all future occurrences" = `UPDATE event SET ... WHERE seriesId = X AND seriesIndex >= Y`
- `seriesIndex` makes this query efficient
- No schema change needed

### Deprecating `nextOccurrence`

- New bounded events: `nextOccurrence` = `null` in serialization
- Legacy events (pre-migration): continue computing `nextOccurrence` at read time
- Frontend: all surfaces should prefer `startTime` directly; `nextOccurrence` only as legacy fallback
- Eventually remove `getNextOccurrence()` once all legacy recurring events expire or are migrated

---

## Rollout Order

### Phase 1: Interim Fix (current — already landed)
- Backend: calendar endpoint fetches recurring events + filters by `nextOccurrence` in range
- Frontend: calendar uses `nextOccurrence` for date assignment
- Frontend: Discover has title+host dedup
- Frontend: event detail uses occurrence-aware end time for reflection/live activity

### Phase 2: Schema Migration
- Add `seriesId String?` and `seriesIndex Int?` to event model
- Create Prisma migration
- Add DB index on `seriesId`
- Backfill: group existing recurring events by `userId + recurrence + title` → assign `seriesId` + `seriesIndex`

### Phase 3: New Event Creation (bounded generation)
- Modify `POST /api/events` to generate bounded occurrences with `seriesId`/`seriesIndex`
- Add biweekly generation (currently missing)
- Weekly: 8 total, biweekly: 6 total, monthly: 4 total
- Frontend create flow: add "biweekly" option if desired

### Phase 4: Read Path Cleanup
- Calendar endpoint: revert interim fix (no longer needed, concrete rows found by date filter)
- Feed endpoint: replace `{ isRecurring: true }` bypass with normal date filter
- Serializer: stop computing `nextOccurrence` for new events
- Frontend: remove all `nextOccurrence`-based derivation from Discover, Calendar, detail

### Phase 5: Legacy Migration
- Backfill concrete occurrences for existing recurring events that only have partial generation
- Once complete, remove `getNextOccurrence()` entirely

---

## Risks / Invariants

1. **Data migration blast radius**: Backfill must not create duplicate events. Use `seriesId IS NULL AND isRecurring = true` as the migration scope.

2. **Quota counting**: Generated occurrences should NOT count against the monthly event creation limit. Only the seed event counts. The quota check must be updated.

3. **Notification spam**: Only send notifications for the seed event, not for every generated occurrence.

4. **Circle events**: If the seed event is a circle event, all occurrences must also be linked to the circle. The `circle_event` + `event_join_request` (invited) creation must loop over all occurrences.

5. **RSVP per-occurrence**: Each occurrence is independent for RSVP. Going to one occurrence does NOT mean going to all. This is already the case with the current partial generation.

6. **Entitlement gate**: Recurring events require Pro. This check remains on the seed event creation — no change needed.

7. **Backward compatibility**: Legacy recurring events (pre-migration) continue to work via interim `nextOccurrence` logic until Phase 5 backfill completes.

---

## Codebase Map

### Backend (my-app-backend)

| File | Relevance |
|------|-----------|
| `src/routes/events.ts` | Event creation (lines 1139+), calendar endpoint (lines 991+), feed endpoint (lines 256+), `serializeEvent()`, `getNextOccurrence()` |
| `prisma/schema.prisma` | `event` model (lines 347+) — add `seriesId`, `seriesIndex` |
| `src/server.ts` | Production entry — no route changes needed (eventsRouter already mounted) |
| `src/index.ts` | Dev entry — no route changes needed |

### Frontend (open-invite-app)

| File | Relevance |
|------|-----------|
| `src/app/discover.tsx` | Series-key dedup, `nextOccurrence` usage for effective time |
| `src/app/calendar.tsx` | `getEffectiveStart()`, `getEventsForCalendarDate()`, `getEventsForDate()` |
| `src/app/event/[id].tsx` | `displayStartTime`, countdown, reflection gate, live activity |
| `src/app/create.tsx` | Recurrence frequency picker (weekly/monthly — add biweekly?) |
| `src/lib/recurringEventsGrouping.ts` | Series grouping utility (social feed) |
| `shared/contracts.ts` | Event schemas — add `seriesId?`, `seriesIndex?`, deprecate `nextOccurrence` |
