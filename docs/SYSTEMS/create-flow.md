# Create Flow

> Event creation from form to backend persistence.
> Owner: `src/app/create.tsx` + `src/components/create/*`

---

## State Shape

| Category | Variables |
|----------|-----------|
| Core | `title`, `description`, `location`, `emoji`, `startDate`, `endDate` |
| Visibility | `visibility` (all_friends / specific_groups / circle_only), `selectedGroupIds`, `circleId` |
| Recurrence | `frequency` (once / weekly / monthly), `sendNotification` |
| Capacity | `hasCapacity`, `capacityInput` |
| Pitch-in | `pitchInEnabled`, `pitchInAmount`, `pitchInMethod`, `pitchInHandle`, `pitchInNote` |
| Bring list | `bringListEnabled`, `bringListItems` |
| Theme | `selectedThemeId`, `selectedCustomTheme` |
| Effect | `selectedEffectId`, `customEffectConfig` |
| UI | `activeDockMode` (theme / effect / settings), `showPaywallModal`, `chromeHeight` |

---

## Component Tree

```
create.tsx
├── AnimatedGradientLayer (theme background)
├── MotifOverlay | ThemeEffectLayer (exclusive particle layer)
├── CreateEditorHeader (cancel / save)
├── CreatePreviewHero (title + cover preview)
├── CreateCoverRow (upload cover photo)
├── CreateFormFields (title + description inputs)
├── CreateLocationSection (place search autocomplete)
├── CreateDateTimeSection (pickers + "Find Best Time")
├── CreateBottomDock (theme / effect / settings buttons)
├── ThemeTray (catalog + custom theme studio)
├── EffectTray (presets + custom particle editor)
└── CreateSheets (settings, cover picker, paywall, notification, share)
```

---

## API

**Endpoint:** `POST /api/events` via `postIdempotent()`

**Payload (condensed):**
```
title, description?, location?, emoji, startTime, endTime,
visibility, groupIds?, circleId?,
isRecurring, recurrence?, sendNotification,
capacity?, pitchInEnabled?, pitchIn*?, bringList*?,
eventPhotoUrl?, eventPhotoPublicId?,
themeId?, customThemeData?, effectId?, customEffectConfig?
```

**Response:** `CreateEventResponse` → `{ event: { id, ... } }`

---

## Post-Create

1. Navigate to `/event/{id}` via `router.replace()`
2. Invalidate: event keys, entitlements, circles
3. Optional: notification prompt modal

---

## Sub-Components (src/components/create/)

| File | Purpose |
|------|---------|
| `CreateEditorHeader.tsx` | Floating header: Cancel + Save |
| `CreatePreviewHero.tsx` | Title + cover image preview |
| `CreateCoverRow.tsx` | Cover photo add/remove |
| `CreateFormFields.tsx` | Title + description inputs |
| `CreateLocationSection.tsx` | Location search with autocomplete |
| `CreateDateTimeSection.tsx` | Date/time pickers |
| `CreateBottomDock.tsx` | 3-button dock (theme, effect, settings) |
| `ThemeTray.tsx` | Theme picker (catalog + custom studio) |
| `EffectTray.tsx` | Effect picker (presets + custom editor) |
| `MotifOverlay.tsx` | Particle effect renderer |
| `CreateSheets.tsx` | All bottom sheets manager |
| `SettingsSheetContent.tsx` | Visibility, frequency, capacity, etc. |
| `CoverMediaPickerSheet.tsx` | Cover photo picker |
| `PostCreateShareModal.tsx` | Post-success share modal |

---

## Invariants

- Theme and effect are independent selections. Theme controls visual styling; effect controls particle overlay.
- Particle precedence: effectId → MotifOverlay; hasTheme → ThemeEffectLayer; else null.
- Custom themes stored as transient `CustomTheme` objects until save.
- `postIdempotent()` prevents duplicate event creation on retry.
