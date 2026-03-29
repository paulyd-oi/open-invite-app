# Location

> Place search with backend proxy and local fallback.
> Owner: `src/hooks/useLocationSearch.ts`, `src/components/create/placeSearch.ts`

---

## Search Flow

```
1. Request foreground permission → expo-location
2. Fetch device coords → Location.getCurrentPositionAsync({ accuracy: Balanced })
3. Debounced search (300ms with coords, 800ms without)
4. Backend proxy → Google Places API
5. Fallback → local category matching
```

---

## API

- **Endpoint:** `GET /api/places/search?query=<query>&lat=<lat>&lon=<lon>`
- **Backend:** Proxies to Google Places API with `GOOGLE_PLACES_API_KEY` env var
- **Params:** `location=${lat},${lon}&radius=50000`
- **Timeout:** 8 seconds per request
- **Cancellation:** `AbortController` cancels in-flight requests on new query

---

## Fallback Chain

1. Backend returns results → use as-is
2. Backend error/empty → `searchPlacesLocal()` (smart category matching)
3. Fetch fails entirely → local fallback with category suggestions
4. Query < 2 chars → no suggestions

**Local fallback:** 60+ categories (coffee, gym, park, pizza, etc.) with smart matching. Always includes user's raw input as first option. Returns ≤8 suggestions with dedup.

---

## Location Normalization

- `normalizeLocationString()` — deduplicates repeated address segments
- `buildCleanLocation()` — prefers `place.address` over `place.fullAddress` to avoid duplication

---

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useLocationSearch.ts` | Main search hook |
| `src/components/create/placeSearch.ts` | Place search logic |
| `src/components/create/CreateLocationSection.tsx` | Location form UI |

---

## Invariants

- Foreground-only permission (no background tracking).
- One-time coord fetch on focus, not continuous listening.
- Backend proxy required — frontend never calls Google Places directly.
- `GOOGLE_PLACES_API_KEY` must be set on Render for production.
