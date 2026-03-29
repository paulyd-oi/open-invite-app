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
5. Fallback → Photon → Nominatim → smart suggestions
```

---

## API

- **Endpoint:** `GET /api/places/search?query=<query>&lat=<lat>&lon=<lon>`
- **Backend:** Proxies to Google Places Autocomplete with `GOOGLE_PLACES_API_KEY` env var
- **Timeout:** 8 seconds per request (frontend `AbortController`)
- **Cancellation:** `AbortController` cancels in-flight requests on new query

---

## Google Places Request

When `GOOGLE_PLACES_API_KEY` is set and user coords are available:

```
input=<query>
types=establishment|geocode
language=en
components=country:us
location=<lat>,<lon>
radius=80000          (80km / ~50 miles)
strictbounds           (forces results within radius)
```

**Strict-then-relaxed strategy:** First request uses `strictbounds` for strong local bias. If zero results, retries WITHOUT `strictbounds` so unique venue names outside the radius still resolve.

---

## Fallback Chain

1. Google Places (strict bounds) → results found → return
2. Google Places (relaxed, no strictbounds) → results found → return
3. Photon (OSM geocoder) → distance-filtered (≤160km) → return if results
4. Nominatim (OSM geocoder) → distance-filtered (≤160km) → return if results
5. Smart suggestions → category matching + user's raw input

**Distance filtering:** Photon and Nominatim results are filtered by haversine distance (≤160km / ~100 miles from user) when coords are available. Prevents far-away noise.

**Smart suggestions:** 60+ categories (coffee, gym, park, pizza, etc.) with smart matching. Always includes user's raw input as first option. Returns ≤8 suggestions with dedup.

---

## Location Normalization

- `normalizeLocationString()` — deduplicates repeated address segments
- `buildCleanLocation()` — prefers `place.address` over `place.fullAddress` to avoid duplication

---

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useLocationSearch.ts` | Main search hook (frontend) |
| `src/components/create/placeSearch.ts` | Place search + fallback logic (frontend) |
| `src/components/create/CreateLocationSection.tsx` | Location form UI |
| `my-app-backend/src/routes/places.ts` | Backend proxy + fallback chain |

---

## Invariants

- Foreground-only permission (no background tracking).
- One-time coord fetch on focus, not continuous listening.
- Backend proxy required — frontend never calls Google Places directly.
- `GOOGLE_PLACES_API_KEY` must be set on Render for production.
- Google Places uses `strictbounds` first, then relaxes — local results dominate but unique venues still resolve.
- Fallback providers (Photon, Nominatim) are distance-filtered when user coords are available.
- Edit page uses plain text input (no search) — location search only applies to create flow.
