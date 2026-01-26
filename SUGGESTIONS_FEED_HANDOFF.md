# Suggestions Feed Feature - Handoff Packet

## Summary

Implemented a personalized suggestions feed backed by `/api/suggestions/feed` endpoint. The suggestions screen now has a segmented control with "For You" (personalized suggestions) and "People" (people you may know) tabs.

## Files Changed

### Backend (New)

- **[backend/src/routes/suggestions.ts](backend/src/routes/suggestions.ts)** - New suggestions router
  - `GET /api/suggestions/feed` - Returns personalized suggestions
  - Suggestion types: `JOIN_EVENT`, `NUDGE_CREATE`, `NUDGE_INVITE`, `RECONNECT_FRIEND`, `HOT_AREA`
  - Returns up to 5 suggestions, prioritized by type
  - Graceful error handling (returns empty array on error)

### Backend (Modified)

- **[backend/src/index.ts](backend/src/index.ts)** - Mounted suggestions router at `/api/suggestions`

- **[backend/src/shared/contracts.ts](backend/src/shared/contracts.ts)** - Added suggestion feed types

### Shared (Modified)

- **[shared/contracts.ts](shared/contracts.ts)** - Added suggestion feed types:
  - `SuggestionAction` enum: `JOIN_EVENT`, `NUDGE_CREATE`, `NUDGE_INVITE`, `RECONNECT_FRIEND`, `HOT_AREA`
  - `SuggestionFeedItem` schema with `id`, `type`, `title`, `subtitle`, `ctaLabel`, optional `eventId`, `userId`, `category`
  - `GetSuggestionsFeedResponse` type

### Frontend (New)

- **[src/hooks/useSuggestionsFeed.ts](src/hooks/useSuggestionsFeed.ts)** - React Query hook
  - Query key: `["suggestions", "feed"]`
  - 60s staleTime
  - Refetch on window focus
  - Graceful error handling

- **[src/components/SuggestionFeedCard.tsx](src/components/SuggestionFeedCard.tsx)** - UI components
  - `SuggestionFeedCard` - Card with icon, title, subtitle, CTA button
  - `SuggestionsFeedEmpty` - Empty state when no suggestions
  - Type-based icon and color styling

### Frontend (Modified)

- **[src/app/suggestions.tsx](src/app/suggestions.tsx)** - Updated screen
  - Added segmented control: "For You" | "People"
  - "For You" tab shows personalized suggestions feed
  - "People" tab shows existing friend suggestions
  - Both tabs share refresh control

## Key Implementation Details

### Suggestion Types and Actions

| Type | CTA Action | Description |
|------|------------|-------------|
| `JOIN_EVENT` | Navigate to `/event/[id]` | Upcoming events from friends |
| `NUDGE_CREATE` | Navigate to `/create` | Shown if no events created in 14+ days |
| `NUDGE_INVITE` | Navigate to `/friends` | Shown if user has < 5 friends |
| `RECONNECT_FRIEND` | Navigate to `/user/[id]` | Friends not interacted with in 30+ days |
| `HOT_AREA` | Navigate to `/discover` | Trending event categories |

### Backend Logic

```typescript
// Suggestion prioritization
const priorityOrder = [
  "JOIN_EVENT",      // Highest priority - actionable events
  "NUDGE_CREATE",    // Encourage content creation
  "RECONNECT_FRIEND", // Social reconnection
  "HOT_AREA",        // Discovery
  "NUDGE_INVITE",    // Network growth
];
```

### Frontend Integration

The Friends tab already has a "Suggestions" quick access button that links to `/suggestions`. The segmented control on the suggestions screen allows users to switch between:
- **For You**: Personalized action suggestions
- **People**: Friend suggestions (people you may know)

## Verify Output

```
== REPO CONFIRMATION ==
/Users/paulsmbp/Documents/GitHub/open-invite-app
origin  https://github.com/paulyd-oi/open-invite-app.git
main
== INVARIANT CHECK PASSED ==
== TYPECHECK ==
PASS: verify_frontend
```

## Commit

```
21516f2 feat(suggestions): add personalized suggestions feed with backend endpoint
```

## TestFlight Test Plan

### Backend Verification

1. **Endpoint Returns Valid JSON**:
   - Hit `GET /api/suggestions/feed` (authenticated)
   - Should return `{ suggestions: [...] }` with 0-5 items
   - Each item should have: `id`, `type`, `title`, `subtitle`, `ctaLabel`

2. **Suggestion Types Generated**:
   - `JOIN_EVENT`: Create an event with a friend, verify it appears for other friends
   - `NUDGE_CREATE`: Wait 14+ days without creating events (or use test user)
   - `NUDGE_INVITE`: Use account with < 5 friends
   - `RECONNECT_FRIEND`: Have dormant friendships (30+ days no interaction)
   - `HOT_AREA`: Verify popular categories show up

### Frontend Verification

1. **Suggestions Screen Navigation**:
   - Open app → Friends tab → Tap "Suggestions" button
   - Screen should show with "Suggestions" title

2. **Segmented Control**:
   - Default tab should be "For You"
   - Tap "People" to switch to friend suggestions
   - Tap "For You" to switch back
   - Both tabs should have pull-to-refresh

3. **Suggestion Cards**:
   - Each card should have icon, title, subtitle, CTA button
   - Icons should be color-coded by type:
     - `JOIN_EVENT`: Purple calendar icon
     - `NUDGE_CREATE`: Green plus icon
     - `NUDGE_INVITE`: Orange user-plus icon
     - `RECONNECT_FRIEND`: Pink users icon
     - `HOT_AREA`: Red trending icon

4. **CTA Actions**:
   - Tap "View Invite" on `JOIN_EVENT` → Should navigate to event detail
   - Tap "Create Invite" on `NUDGE_CREATE` → Should navigate to create screen
   - Tap "Invite Friends" on `NUDGE_INVITE` → Should navigate to friends screen
   - Tap "View Profile" on `RECONNECT_FRIEND` → Should navigate to user profile
   - Tap "Explore" on `HOT_AREA` → Should navigate to discover screen

5. **Empty State**:
   - When no suggestions available, shows "You're all caught up!" message
   - "Discover Events" button navigates to discover screen

6. **Error Handling**:
   - Disable network → Pull to refresh → Should show empty state (not crash)
   - Re-enable network → Pull to refresh → Should load suggestions

## Related Files

- `src/app/friends.tsx` - Contains "Suggestions" quick access button
- `src/lib/api.ts` - API client used for fetching
- `backend/src/db.ts` - Database connection used in backend

## Notes

- The existing "People you may know" functionality is preserved in the "People" tab
- Backend errors are gracefully handled - returns empty suggestions array
- Pre-existing backend TypeScript errors in other files are unrelated to this change
