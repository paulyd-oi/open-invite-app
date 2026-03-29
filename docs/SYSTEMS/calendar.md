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
- Read: `getDeviceEvents()` fetches events from device calendars for a date range
- Calendar selection fallback: iOS default → iCloud → primary → any writable
- Sync logic: `src/lib/calendarSync.ts`
- Dedup: OID markers in notes prevent re-importing events exported from Open Invite
- Sync mapping: AsyncStorage `calendarSync:event:*` maps Open Invite event IDs → device event IDs

---

## Pull-to-Refresh Resync

Pull-to-refresh on the calendar screen triggers two parallel actions:

1. **Normal refresh:** Refetches backend calendar events + birthdays via `useLiveRefreshContract`
2. **Device calendar diff (async, non-blocking):**
   - Checks calendar permission (skips if not granted)
   - Fetches device events from writable calendars (next 30 days)
   - Filters out OID-marked events (already synced from Open Invite)
   - Fetches already-imported event IDs from `GET /api/events/imported`
   - Diffs to find new-only events
   - If new events found → navigates to `import-calendar?mode=resync`
   - If none found → silently completes (no UI noise)

**Resync mode on import screen (`mode=resync`):**
- Skips calendar selection (auto-selects writable calendars)
- Auto-loads and filters to only new events
- Header: "New Calendar Events" / "Found events not yet in Open Invite"
- Empty state: "Your calendar is up to date"
- Uses existing import mutation + visibility selector

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
| `src/app/import-calendar.tsx` | Import screen (manual + resync mode) |
| `src/lib/calendarSync.ts` | Device calendar sync (read/write/dedup) |
| `src/lib/eventQueryKeys.ts` | Calendar range query keys |

---

## Invariants

- Range-based fetching (start/end), not month-based pagination.
- Pinch gesture drives continuous height interpolation — no discrete mode switches.
- Native calendar writes are one-way (app → device), no sync back.
- Device calendar resync must never auto-import — always requires user confirmation via import screen.
- OID markers and `deviceCalendarId` matching prevent duplicate imports.
- Resync diff runs async and non-blocking — does not delay the normal refresh spinner.
