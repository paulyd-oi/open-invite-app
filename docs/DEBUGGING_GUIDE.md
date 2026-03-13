# Debugging Guide

**Last Updated:** 2026-03-12

---

## Quick Reference

### Essential Commands
```bash
# Check backend logs
cat /home/user/workspace/backend/server.log

# Check expo logs
cat expo.log

# View environment variables
env | grep BACKEND_URL

# TypeScript check
npm run typecheck
```

---

## Auth Debugging

### Session Validation Logs (Success)
```
[Bootstrap] Step 1/6: Checking for cached session
[Bootstrap] Step 2/6: Session exists, verifying with backend
[Bootstrap] ✅ Session valid
[Bootstrap] Step 4/6: Fetching user profile
[Bootstrap] Step 5/6: Setting bootStatus to 'authed'
[Bootstrap] ✅ Bootstrap complete: authed
```

### Cookie Capture Logs (Success)
```
[refreshExplicitCookie] SUCCESS
[refreshExplicitCookie] Cached cookie length: 120+
```

### Logout Verification (Success)
```json
[LOGOUT_INVARIANT] {
  "keysDeleted": ["ss:open-invite.session-token", "ss:open-invite_cookie", ...],
  "keysFailed": [],
  "verifyCleared": ["open-invite.session-token", "open-invite_cookie"],
  "explicitCookieCacheCleared": true,
  "hasAuthTokenAfter": false,
  "success": true
}
```

### Auth Anti-Patterns (BAD)
| Log Pattern | Problem | Fix |
|-------------|---------|-----|
| `401: /api/profile` after logout | Query not gated on bootStatus | Gate on `bootStatus === 'authed'` |
| `[Logout] ⚠️ Token still exists` | Key deletion failed | Check LOGOUT_INVARIANT for keysFailed |
| Multiple 401s during transition | Race condition | Ensure all queries gated properly |

---

## API Debugging

### Better Auth Cookie Format
```bash
# Web format (curl)
curl -H "Cookie: __Secure-better-auth.session_token=$COOKIE"

# React Native format (requires lowercase + '; ' prefix)
curl -H "cookie: ; __Secure-better-auth.session_token=$COOKIE"
```

### Common API Mistakes
| Mistake | Fix |
|---------|-----|
| Uppercase `Cookie:` in RN | Use lowercase `cookie:` |
| Missing `; ` prefix | Add `; ` before cookie name |
| Using bearer token | Use cookie-based session |
| Gating on `!!session` | Gate on `bootStatus === 'authed'` |

### API Error Patterns
```bash
# Login and capture cookie
curl -v -X POST https://api.openinvite.cloud/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "yourpassword"}' \
  -c cookies.txt

# Extract cookie
COOKIE=$(grep '__Secure-better-auth.session_token' cookies.txt | awk '{print $7}')

# Test authenticated endpoint
curl -v https://api.openinvite.cloud/api/profile \
  -H "cookie: ; __Secure-better-auth.session_token=$COOKIE"
```

---

## UI Regression Debugging Protocol

### Mandatory Requirements
1. **Exact Code Path Identification**
   - File path, component name, function name, trigger condition
   - Example: `src/app/calendar.tsx → checkFirstLogin() → useEffect → showGuide`

2. **DEV-Only Proof Logs**
   ```typescript
   if (__DEV__) {
     console.log("[GUIDE_DECISION]", {
       userId, dismissed, friendsFetched, eventsFetched,
       friendsCount, eventsCount, shouldShow
     });
   }
   ```

3. **Structural Loading Invariant**
   ```typescript
   if (!isFetched) return; // No rendering while loading

   // Or canonical gating:
   shouldShow = loadedOnce && count===0 && !dismissed;
   ```

4. **Cold-Start Proof Test**
   - Kill app completely
   - Relaunch cold
   - Spam navigation + actions immediately
   - Confirm no flash/guide/paywall appears

### Regression Categories
- Onboarding guides
- Subscription gates
- Modal overlays
- Activity notifications
- Feed flicker/read-state

---

## Database Debugging

### Migration Commands
```bash
cd /home/user/workspace/backend

# Create new migration
bunx prisma migrate dev --create-only --name <migration-name>

# Apply migrations
bunx prisma migrate deploy

# Check migration status
bunx prisma migrate status
```

### Performance Indexes
Applied via migration `20260114074927_add_performance_indexes`:
- Events (startTime, endTime, userId)
- Friendships (userId, friendId)
- Notifications (userId, createdAt)
- Sessions (userId, expiresAt)
- Friend requests (senderId, receiverId, status)

---

## Network & Offline Debugging

### Network Status Monitoring
```typescript
// Check network status
import { useNetworkStatus } from '@/lib/networkStatus';
const { isOnline, isInternetReachable } = useNetworkStatus();
```

### Offline Queue Inspection
- **Storage key:** `offlineQueue:v1`
- **Local events:** `localEvents:v1`
- **Session cache:** `session_cache_v1`

### Banner States
- **Offline:** Amber "Offline — changes will sync when you're back"
- **Syncing:** Blue "Syncing... (X/Y)" with progress

---

## Null Safety Debugging

### Critical Patterns
```typescript
// GOOD: Filter before mapping
friends.filter(f => f.friend != null).map(f => f.friend!.name)

// BAD: Will crash on null
friends.map(f => f.friend.name)

// GOOD: Optional chaining everywhere
friendship.friend?.email
friendship.friend?.name

// GOOD: Circle members safety
const members = circle.members ?? [];
```

### Serialization Issues
- **Backend:** `serializeFriendship()` transforms Prisma field names
- **Transform:** `user_friendship_friendIdTouser` → `friend`
- **Contracts:** Frontend/backend must stay in sync

---

## Environment Debugging

### Vibecode Context
- **System manages:** git, dev server (port 8081)
- **User views:** Vibecode App (no code/terminal access)
- **Backend server:** Auto-running on port 3000
- **DO NOT:** Run manual servers (`bun start`, `bunx expo start`)

### Environment Variables
```bash
# Check all environment variables
env

# Check specific backend URL
echo $EXPO_PUBLIC_API_URL

# Backend logs location
cat /home/user/workspace/backend/server.log
```

---

## Component-Specific Debugging

### UserRow Component Debugging
- **Layout invariant:** Always horizontal: avatar → text → accessory
- **Text contract:** Picker lists use @handle primary, roster lists use display name
- **Spacing:** Compact and scannable, never card-like
- **Anti-pattern:** Vertical stacking (P0 violation)

### Bottom Sheet Debugging
- **No chevrons** (modal context, not navigation)
- **Compact rows** matching UserRow density
- **Avatar + text alignment** mirrors main lists

### Paywall Context Debugging
```typescript
// Check all 10 contexts are covered
const PAYWALL_CONTEXTS: PaywallContext[] = [
  "ACTIVE_EVENTS_LIMIT", "RECURRING_EVENTS", "WHOS_FREE_HORIZON",
  "UPCOMING_BIRTHDAYS_HORIZON", "CIRCLES_LIMIT", "CIRCLE_MEMBERS_LIMIT",
  "INSIGHTS_LOCKED", "HISTORY_LIMIT", "ACHIEVEMENTS_LOCKED", "PRIORITY_SYNC_LOCKED"
];
```

---

## Log Prefixes Reference

| Prefix | Component | Purpose |
|--------|-----------|---------|
| `[Bootstrap]` | authBootstrap.ts | App launch auth flow |
| `[refreshExplicitCookie]` | authClient.ts | Cookie capture/storage |
| `[LOGOUT_INVARIANT]` | authBootstrap.ts | Logout key deletion audit |
| `[authTrace]` | authBootstrap.ts | Debug mode only |
| `[OnboardingPhoto]` | onboarding screens | Photo step |
| `[useWorkSchedule]` | calendar.tsx | Work schedule query |
| `[useEntitlements]` | entitlements.ts | Feature flags |
| `[GUIDE_DECISION]` | Various | UI decision logging |

---

## Production Debugging

### Rate Limiting
- **Global limit:** 200 requests/minute
- **Auth limit:** 50 requests/15 minutes
- **Middleware:** `backend/src/middleware/rateLimit.ts`
- **Frontend:** No logout on 429 errors (uses toast notifications)

### Backend Entry Files (CRITICAL)
- **Production:** Uses `src/server.ts`
- **Development:** Uses `src/index.ts`
- **Debugging:** Check Render logs for correct entry file
- **Router mounting:** All 26 routers must be in BOTH files

---

## See Also

- `docs/KNOWN_GOOD_LOG_LINES.md` - Expected success patterns
- `docs/API_AUTH_EXAMPLES.md` - Copy-paste auth examples
- `docs/CLAUDE_UI_REGRESSION_PROTOCOL.md` - Detailed regression methodology
- `docs/KNOWN_ISSUES.md` - Historical issues and solutions