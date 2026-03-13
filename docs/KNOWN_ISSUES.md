# Known Issues & Fixes

**Last Updated:** 2026-03-12

---

## FIXED Issues (Historical Reference)

### Context Menu + Navigation Conflict (FIXED)
- **Problem:** Hard pressing event cards opened context menu AND triggered navigation
- **Solution:** Track press duration using `onPressIn` timestamp; only navigate if press < 200ms
- **Implementation:** `src/app/calendar.tsx` `EventListItem` component
- **Key pattern:**
  ```typescript
  const pressStartTimeRef = React.useRef(0);
  const handlePressIn = () => { pressStartTimeRef.current = Date.now(); };
  const handlePress = () => {
    const pressDuration = Date.now() - pressStartTimeRef.current;
    if (pressDuration > 200) return; // Long press, don't navigate
    router.push(route);
  };
  ```

### Event Color Change Not Saving (FIXED)
- **Problem:** Context menu color changes not persisting
- **Root Cause:** Backend `createEventRequestSchema` missing `color` field
- **Solution:** Added `color: z.string().optional()` to backend schema
- **CRITICAL:** Frontend/backend `contracts.ts` files must stay in sync:
  - Frontend: `/home/user/workspace/shared/contracts.ts`
  - Backend: `/home/user/workspace/backend/src/shared/contracts.ts`

### Double-Slash URL Bug (FIXED)
- **Problem:** URLs like `//api/email-verification/send` returning 404
- **Cause:** Backend URL with trailing slash + paths starting with `/`
- **Solution:** Strip trailing slashes: `const backendUrl = rawBackendUrl.replace(/\/+$/, "");`
- **Fixed in:** `src/lib/api.ts`, `src/lib/authClient.ts`, `src/app/welcome.tsx`

### Session Error Logout Fix (CRITICAL - v3 SIMPLIFIED)
- **Problem:** App logging users out due to complex validation with edge cases
- **Root Cause:** Validation useEffect had too many code paths, some didn't set flags properly
- **Solution v3:** Completely simplified session validation:
  1. Set `hasValidatedSession.current = true` IMMEDIATELY before async operations
  2. Simple logic: No session → welcome, Has session → stay logged in, Any error → stay logged in
  3. Removed ALL server-side session validation (was causing issues)
  4. Removed ALL complex error checking (401/403/etc)
- **New Logic:**
  - If `!session` → redirect to welcome (new user or explicitly logged out)
  - If `session` exists → user is logged in, check onboarding
  - For ANY error → keep user logged in, let API calls fail naturally
- **Key principle:** NEVER automatically sign out. Trust local session.
- **Fixed in:** `src/app/index.tsx` - checkOnboardingStatus function

---

## Critical Null Safety Patterns

### Friendship Data Serialization (CRITICAL)
- **Problem:** Prisma returns `user_friendship_friendIdTouser` but frontend expects `friend`
- **Solution:** `serializeFriendship()` in `backend/src/routes/friends.ts` transforms field names
- **Frontend safety:** Always filter: `friends.filter(f => f.friend != null)`
- **Always use optional chaining:** `friendship.friend?.email`, `friendship.friend?.name`

### Circle Members Safety (CRITICAL)
- **Pattern:** Always use `const members = circle.members ?? []` at component top
- **Files with guards:**
  - `src/app/friends.tsx` - FriendCard, FriendListItem, filteredFriends
  - `src/app/profile.tsx` - friends list in Add Members modal
  - `src/components/CircleCard.tsx` - members array safety
  - `src/app/circle/[id].tsx` - members array safety, availableFriends filter
  - `src/app/discover.tsx` - suggestions/streaks filter: `.filter(s => s.friend != null)`

---

## Error Handling Patterns

### API Error Handling
- **Pattern:** `src/lib/api.ts` checks content-type before parsing JSON
- **Prevents:** "JSON Parse error: Unexpected character: N" when server returns plain text

### Email Verification Error Detection
- **Pattern:** Check for `"verif"` (not `"verify"`) to catch "Email not verified" errors
- **Fixed in:** `src/app/welcome.tsx` line ~725

### Keyboard Fixes
- **Pattern:** Wrap subscription screens in KeyboardAvoidingView
- **Prevents:** Keyboard covering promo code inputs
- **Fixed in:** `src/app/welcome.tsx`

---

## Performance Fixes

### Friend Request Serialization (v2.8)
- **Fix:** Backend transforms Prisma field names to API contract names
- **Transform:** `user_friend_request_senderIdTouser` → `sender`
- **Transform:** `user_friend_request_receiverIdTouser` → `receiver`
- **Result:** Friend cards show `calendarBio` properly

### Profile Stats - Finished Events Only (v2.7)
- **Hosted count:** Only events where endTime (or startTime) has passed
- **Attended count:** Only events user joined where event has ended
- **Achievements:** Progress based on finished events only
- **Top friends:** Based on finished events attended together
- **Streak calculation:** Still uses all events for consistency tracking

---

## Development Debugging

### Rate Limit Handling
- **Pattern:** Frontend no longer logs out on 429 errors
- **Implementation:** `src/components/Toast.tsx` replaces Alert.alert()
- **Middleware:** `backend/src/middleware/rateLimit.ts`

### Database Indexes
- **Applied via:** Migration `20260114074927_add_performance_indexes`
- **Improves:** Query performance for events, friendships, notifications

---

## Troubleshooting Commands

### Backend Logs
```bash
# Read backend logs
cat /home/user/workspace/backend/server.log
```

### Database Migrations
```bash
# Create migration
cd /home/user/workspace/backend
bunx prisma migrate dev --create-only --name <migration-name>

# Apply migrations
bunx prisma migrate deploy
```

### Environment Check
```bash
# View backend URL
env | grep BACKEND_URL
```

---

## Anti-Patterns to Avoid

| Pattern | Problem | Solution |
|---------|---------|----------|
| `friends.map(f => f.friend.name)` | Crashes on null friend | `friends.filter(f => f.friend).map(f => f.friend!.name)` |
| Uppercase `Cookie:` in RN | Auth fails | Use lowercase `cookie:` |
| Missing `; ` prefix | Better Auth fails | Add `; ` before cookie name |
| `!!session` for auth gating | Complex edge cases | Gate on `bootStatus === 'authed'` |
| Auto logout on network errors | Strands users | Only logout on 401/403 from server |
| Hard-coded backend URLs | Environment issues | Use env variables with trailing slash stripped |

---

## See Also

- `docs/KNOWN_GOOD_LOG_LINES.md` - Expected success patterns
- `docs/API_AUTH_EXAMPLES.md` - Auth implementation examples
- `docs/CLAUDE_UI_REGRESSION_PROTOCOL.md` - Debugging methodology