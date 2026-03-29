# Calendar

> Pinch-to-zoom calendar with 4 view modes and device sync.
> Owner: `src/app/calendar.tsx`, `src/lib/calendarSync.ts`

---

## View Modes

| Mode | Height Range | Description |
|------|-------------|-------------|
| Compact | 40–64px | Grid dots |
| Stacked | 64–80px | Multi-row summary |
| Details | 80–160px | Expanded event cards |
| List | fallback | Full agenda view |

Pinch-to-zoom transitions between modes via unified height controller (`UNIFIED_MIN_HEIGHT: 40`, `UNIFIED_MAX_HEIGHT: 160`).

---

## Data Fetching

- **Query key:** `eventKeys.calendarRange(start, end)` — range-based, not month-based
- **Endpoint:** `GET /api/events/calendar-events?start=<ISO>&end=<ISO>`
- **Response:** `GetCalendarEventsResponse`
- **Refetch on mount:** true

---

## Device Calendar Integration

- Library: `expo-calendar`
- Permission: `ExpoCalendar.requestCalendarPermissionsAsync()`
- Write: `ExpoCalendar.createEventAsync()` (adds event to native calendar)
- Calendar selection fallback: iOS default → iCloud → primary → any writable
- Sync logic: `src/lib/calendarSync.ts`

---

## Event Display

- Color overrides via `useEventColorOverrides()` hook (per-event theme palette)
- Reads: created events + attending events
- Layout spacing: `TAB_BOTTOM_PADDING` from `layoutSpacing.ts`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/calendar.tsx` | Calendar screen |
| `src/lib/calendarSync.ts` | Device calendar sync |
| `src/lib/eventQueryKeys.ts` | Calendar range query keys |

---

## Invariants

- Range-based fetching (start/end), not month-based pagination.
- Pinch gesture drives continuous height interpolation — no discrete mode switches.
- Native calendar writes are one-way (app → device), no sync back.
