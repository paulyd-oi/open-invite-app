# Calendar Import

> Import device calendar events into Open Invite as personal (imported) events.
> Owner: `src/app/import-calendar.tsx`, `src/lib/calendarSync.ts`

---

## Entry Points

- Manual: Calendar screen → "Sync" / settings → `/import-calendar`
- Resync: pull-to-refresh on Calendar when new device events are detected → `/import-calendar?mode=resync`
- Help screen: `src/app/calendar-import-help.tsx` links into the flow

---

## Screen Layout

Stacked sections on `import-calendar.tsx`:

1. Header + status (permission / empty / results banner)
2. **Privacy (informational only)** — see below
3. Calendar selection (skipped in resync mode)
4. Event preview list grouped by date
5. "Sync N Events" primary button

---

## Privacy Contract (SSOT)

**All imported events are private by default and there is NO UI to change visibility during import.**

- The import screen shows a non-interactive `PRIVACY` section with the copy:
  > All imported events are private — only you can see them. You can change visibility anytime after import.
- No chevron, no selectable row, no modal/sheet to pick a default visibility.
- The mutation always sends `defaultVisibility: "private"` to `POST /api/events/import-calendar`.
- Users adjust visibility **per event, after import**, from the normal event edit surface.

### Why
Imports originate from a trust-sensitive system surface (the OS calendar). Offering a visibility picker in the import flow implied user-facing choice where there is none, and risked accidental exposure of personal calendar data. Locking to `private` at the UI layer matches the product intent and removes the misleading affordance.

### Invariants
- The screen MUST NOT render any interactive default-visibility control (no chevron, no pressable row, no picker modal, no segmented control).
- The mutation payload's `defaultVisibility` MUST be the literal `"private"` on this screen.
- Changing this behavior (e.g., allowing non-private imports from the device calendar) requires an explicit product decision and an update to this doc plus `docs/SYSTEMS/calendar.md`.
- Copy is fixed to the strings above; do not reintroduce the previous "DEFAULT VISIBILITY" header or "Private" row.

---

## Network Contract

- **Endpoint:** `POST /api/events/import-calendar`
- **Request shape:**
  ```ts
  {
    events: Array<{
      deviceEventId: string;
      title: string;
      startTime: string;      // ISO
      endTime: string | null; // ISO
      location: string | null;
      notes: string | null;
      calendarId: string;
      calendarName?: string;
    }>;
    defaultVisibility?: "all_friends" | "specific_groups" | "private"; // always "private" from import screen
  }
  ```
- **Response:** `{ success, imported, updated, skipped, events }`

The request interface keeps `defaultVisibility` optional to preserve the existing contract and future flexibility; the import screen itself hard-codes `"private"`.

---

## Dedup / Ownership

- `deviceCalendarId` + OID markers in device event notes prevent re-importing events that were themselves exported from Open Invite.
- `event.isImported = true` marks these rows as personal calendar artifacts — see Imported Event Boundary in `docs/SYSTEMS/calendar.md`.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/import-calendar.tsx` | Import screen (manual + resync) |
| `src/app/calendar-import-help.tsx` | Help/explainer screen |
| `src/lib/calendarSync.ts` | Device calendar read + dedup |
| `src/lib/eventQueryKeys.ts` | Query keys for imported-events queries |
