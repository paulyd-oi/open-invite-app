<stack>
  Expo SDK 53, React Native 0.76.7, bun (not npm).
  React Query for server/async state.
  NativeWind + Tailwind v3 for styling.
  react-native-reanimated v3 for animations (preferred over Animated from react-native).
  react-native-gesture-handler for gestures.
  lucide-react-native for icons.
  All packages are pre-installed. DO NOT install new packages unless they are @expo-google-font packages or pure JavaScript helpers like lodash, dayjs, etc.
</stack>

<structure>
  src/app/          — Expo Router file-based routes (src/app/_layout.tsx is root). Add new screens to this folder.
  src/components/   — Reusable UI components. Add new components to this folder.
  src/lib/          — Utilities: cn.ts (className merge), example-context.ts (state pattern)
</structure>

<typescript>
  Explicit type annotations for useState: `useState<Type[]>([])` not `useState([])`
  Null/undefined handling: use optional chaining `?.` and nullish coalescing `??`
  Include ALL required properties when creating objects — TypeScript strict mode is enabled.
</typescript>

<environment>
  You are in Vibecode. The system manages git and the dev server (port 8081).
  DO NOT: manage git, touch the dev server, or check its state.
  The user views the app through Vibecode App.
  The user cannot see the code or interact with the terminal. Do not tell the user to do anything with the code or terminal.
  You can see logs in the expo.log file.
  The Vibecode App has tabs like ENV tab, API tab, LOGS tab. You can ask the user to use these tabs to view the logs, add enviroment variables, or give instructions for APIs like OpenAI, Nanobanana, Grok, Elevenlabs, etc. but first try to implement the functionality yourself.
  The user is likely non-technical, communicate with them in an easy to understand manner.
  If the user's request is vague or ambitious, scope down to specific functionality. Do everything for them.
  For images, use URLs from unsplash.com. You can also tell the user they can use the IMAGES tab to generate and uplooad images.
</environment>


<forbidden_files>
  Do not edit: patches/, babel.config.js, metro.config.js, app.json, tsconfig.json, nativewind-env.d.ts
</forbidden_files>

<routing>
  Expo Router for file-based routing. Every file in src/app/ becomes a route.
  Never delete or refactor RootLayoutNav from src/app/_layout.tsx.
  
  <stack_router>
    src/app/_layout.tsx (root layout), src/app/index.tsx (matches '/'), src/app/settings.tsx (matches '/settings')
    Use <Stack.Screen options={{ title, headerStyle, ... }} /> inside pages to customize headers.
  </stack_router>
  
  <tabs_router>
    Only files registered in src/app/(tabs)/_layout.tsx become actual tabs.
    Unregistered files in (tabs)/ are routes within tabs, not separate tabs.
    Nested stacks create double headers — remove header from tabs, add stack inside each tab.
    At least 2 tabs or don't use tabs at all — single tab looks bad.
  </tabs_router>
  
  <router_selection>
    Games should avoid tabs — use full-screen stacks instead.
    For full-screen overlays/modals outside tabs: create route in src/app/ (not src/app/(tabs)/), 
    then add `<Stack.Screen name="page" options={{ presentation: "modal" }} />` in src/app/_layout.tsx.
  </router_selection>
  
  <rules>
    Only ONE route can map to "/" — can't have both src/app/index.tsx and src/app/(tabs)/index.tsx.
    Dynamic params: use `const { id } = useLocalSearchParams()` from expo-router.
  </rules>
</routing>

<state>
  React Query for server/async state. Always use object API: `useQuery({ queryKey, queryFn })`.
  Never wrap RootLayoutNav directly.
  React Query provider must be outermost; nest other providers inside it.
  
  Use `useMutation` for async operations — no manual `setIsLoading` patterns.
  Wrap third-party lib calls (RevenueCat, etc.) in useQuery/useMutation for consistent loading states.
  Reuse query keys across components to share cached data — don't create duplicate providers.
  
  For local state, use Zustand. However, most state is server state, so use React Query for that.
  Always use a selector with Zustand to subscribe only to the specific slice of state you need (e.g., useStore(s => s.foo)) rather than the whole store to prevent unnecessary re-renders. Make sure that the value returned by the selector is a primitive. Do not execute store methods in selectors; select data/functions, then compute outside the selector.
  For persistence: use AsyncStorage inside context hook providers. Only persist necessary data.
  Split ephemeral from persisted state to avoid hydration bugs.
</state>

<safearea>
  Import from react-native-safe-area-context, NOT from react-native.
  Skip SafeAreaView inside tab stacks with navigation headers.
  Skip when using native headers from Stack/Tab navigator.
  Add when using custom/hidden headers.
  For games: use useSafeAreaInsets hook instead.
</safearea>

<data>
  Create realistic mock data when you lack access to real data.
  For image analysis: actually send to LLM don't mock.
</data>

<design>
  Don't hold back. This is mobile — design for touch, thumb zones, glanceability.
  Inspiration: iOS, Instagram, Airbnb, Coinbase, polished habit trackers.

  <avoid>
    Purple gradients on white, generic centered layouts, predictable patterns.
    Web-like designs on mobile. Overused fonts (Space Grotesk, Inter).
  </avoid>

  <do>
    Cohesive themes with dominant colors and sharp accents.
    High-impact animations: progress bars, button feedback, haptics.
    Depth via gradients and patterns, not flat solids.
    Install `@expo-google-fonts/{font-name}` for fonts (eg: `@expo-google-fonts/inter`)
    Use zeego for context menus and dropdowns (native feel). Lookup the documentation on zeego.dev to see how to use it.
  </do>
</design>

<mistakes>
  <styling>
    Use Nativewind for styling. Use cn() helper from src/lib/cn.ts to merge classNames when conditionally applying classNames or passing classNames via props.
    CameraView, LinearGradient, and Animated components DO NOT support className. Use inline style prop.
    Horizontal ScrollViews will expand vertically to fill flex containers. Add `style={{ flexGrow: 0 }}` to constrain height to content.
  </styling>

  <camera>
    Use CameraView from expo-camera, NOT the deprecated Camera import.
    import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
    Use style={{ flex: 1 }}, not className.
    Overlay UI must be absolute positioned inside CameraView.
  </camera>

  <react_native>
    No Node.js buffer in React Native — don't import from 'buffer'.
  </react_native>

  <ux>
    Use Pressable over TouchableOpacity.
    Use custom modals, not Alert.alert().
    Ensure keyboard is dismissable and doesn't obscure inputs. This is much harder to implement than it seems. You can use the react-native-keyboard-controller package to help with this. But, make sure to look up the documentation before implementing.
  </ux>

  <outdated_knowledge>
    Your react-native-reanimated and react-native-gesture-handler training may be outdated. Look up current docs before implementing.
  </outdated_knowledge>
</mistakes>

<appstore>
  Cannot assist with App Store or Google Play submission processes (app.json, eas.json, EAS CLI commands).
  For submission help, click "Share" on the top right corner on the Vibecode App and select "Submit to App Store".
</appstore> 

<vibecode_cloud>
- The backend, database, and authentication features are called Vibecode Cloud collectively.
- Not all apps will have cloud enabled, but if they do, the backend server is in the "/home/user/workspace/backend" directory. 
- The backend is a TypeScript + Bun backend powered by a simple Hono server, Prisma ORM with SQLite database, and Better Auth authentication. If you are unaware of any packages or libraries, feel free to look up their documentation. 
- Just like the frontend Expo server, the dev backend server for this backend is automatically running on port 3000. DO NOT attempt to run it manually.
- Since the Expo frontend app is technically running on the user's phone even though it is bundled and served through a VM, we have created a reverse proxy that replaced the BACKEND_URL and EXPO_PUBLIC_VIBECODE_BACKEND_URL enviroment variables with the actual backend server URL. You can run "env" using bash to view the actual backend server URL. The backend URL looks something like https://[UNIQUE_ID].share.sandbox.dev/
- IMPORTANT: Since both the backend and frontend servers are running automatically, DO NOT run "bun start" or "bunx expo start" like that. Just ask the user to refresh the app on the Vibecode app if they do not see the changes.
- Not all apps will have a database, but if they do, when you update the DB, make sure to create a migration file using "bunx prisma migrate dev --create-only --name <migration-name>" and then run "bunx prisma migrate deploy" to apply the migrations to the database. This will push changes to the database and generate a new typesafe Prisma client that will automatically be consumed by the "server/src/db.ts" file that instantiates the Prisma DB client
- Unlike the frontend which comes pre-bundled with native code, the backend is pure JavaScript and only runs in the sandbox, so you may install any packages in the "/home/user/workspace/backend" directory.
- You can read the backend logs by reading the "/home/user/workspace/backend/server.log" file. The user cannot read these logs. These can be very helpful when debugging runtime issues.
- All routes in the backend are defined in the "/home/user/workspace/backend/src/routes" directory.
- Use `import { type AppType } from "./types";` for context access for all new routers.
- Whenever you create a new route, add the types for the request and response to the "/home/user/workspace/shared/contracts.ts" using zod schemas, and then infer the types from the schemas. You can use the zod schema to validate the request in the backend, and you can use the types in the frontend. This makes sure the types are shared between the backend and frontend.
- Use the API client at src/lib/api.ts for all backend requests from the frontend.
</vibecode_cloud>

<skills>
You have access to a few skills in the `.claude/skills` folder. Use them to your advantage.
- ai-apis-like-chatgpt: Use this skill when the user asks you to make an app that requires an AI API.
- expo-docs: Use this skill when the user asks you to use an Expo SDK module or package that you might not know much about.
- frontend-app-design: Use this skill when the user asks you to design a frontend app component or screen.
</skills>

<project_notes>
## App Name: Open Invite
A social calendar app where users can see what friends are up to and share plans.

## Production Deployment

### GitHub Repository (Backend Only)
- URL: https://github.com/paulyd-oi/my-app-backend
- Token: [REDACTED - See secure notes]
- IMPORTANT: Only push the /backend folder to this repo, NOT the full Vibecode workspace
- Render auto-deploys from this repo when you push to main

### How to Deploy Backend to Production (One-liner)
```bash
rm -rf /tmp/backend-push && mkdir -p /tmp/backend-push && cp -r /home/user/workspace/backend/. /tmp/backend-push/ && cd /tmp/backend-push && rm -rf .git && git init && git add -A && git commit -m "Your message" && git remote add origin https://[TOKEN]@github.com/paulyd-oi/my-app-backend.git && git branch -M main && git push -f origin main
```
Wait 2-5 minutes for Render to redeploy.

### Production URLs
- Backend API: https://open-invite-api.onrender.com
- App Store: https://apps.apple.com/app/open-invite/id6740083226

## App Icon Locations

The app icon is used in multiple locations:

1. **Main App Icon**: `/icon.png`
   - Referenced in `app.json` line 39: `"icon": "./icon.png"`
   - Used by Expo for the app icon on home screens
   - Current icon: Updated to new design (1.5MB PNG)

2. **Public Folder Icon**: `/public/open-invite-app-icon.png`
   - Used for web sharing, universal links, and backend static serving
   - Accessible at: `https://open-invite-api.onrender.com/uploads/open-invite-app-icon.png`
   - Current icon: Updated to new design (1.5MB PNG)

3. **Original Source**: `/assets/icon-1767499672323.png`
   - Latest uploaded icon from user (timestamp-based filename)
   - Source file for copying to other locations

**When updating the app icon:**
1. User uploads new icon via IMAGES tab → saved to `/assets/icon-{timestamp}.png`
2. Copy to `/icon.png` for Expo builds
3. Copy to `/public/open-invite-app-icon.png` for web/backend
4. Commit changes and redeploy backend using one-liner command above
5. Republish app via Vibecode to update frontend
6. For App Store icon update: Submit new build via EAS/App Store Connect

## CRITICAL: Backend Architecture

### Auth Bootstrap & Session Sync (v3.3)
**Problem**: After onboarding, profile showed "User" instead of entered name, and uploaded avatars disappeared.

**Root Causes**:
1. Onboarding saved name/avatar to backend but didn't update Better Auth session cache
2. Avatar upload returned URL but wasn't persisted to `user.image` field
3. Profile screen used stale `session.user.name` without proper fallback
4. No session refetch after mutations = stale UI until app restart

**Solution** (commit 7b20ad5):
- `welcome.tsx`: After saving name, immediately refetch session via `authClient.$fetch("/api/auth/get-session")`
- `welcome.tsx`: After uploading avatar, save URL to profile via `POST /api/profile { avatarUrl }` AND refetch session
- `profile.tsx`: Display name fallback chain: `name → @handle → email local-part → "Account"`
- `useResilientSession.ts`: Added `forceRefetchSession()` method for triggering cache updates after profile mutations

**Files Changed**:
- `src/app/welcome.tsx` - Added session refetch after name/avatar save with comprehensive logging
- `src/app/profile.tsx` - Improved display name fallback logic (no more "User" or "No name set")
- `src/lib/useResilientSession.ts` - Added `forceRefetchSession()` method

**Key Principle**: Whenever you mutate user profile data (name, image, handle, bio), you MUST:
1. Save to backend via `POST /api/profile`
2. Immediately refetch session via `authClient.$fetch("/api/auth/get-session")` to update Better Auth cache
3. This ensures UI updates instantly without requiring app restart

### Entry File Difference (VERY IMPORTANT)
- **Render production uses `src/server.ts`** (see logs: `Running 'node --import tsx src/server.ts'`)
- **Vibecode dev uses `src/index.ts`**
- **When adding new routers, you MUST add them to BOTH files!**

### All Routers (must be in BOTH server.ts AND index.ts)
```typescript
// These 26 routers must be in both entry files:
uploadRouter, sampleRouter, eventsRouter, friendsRouter, groupsRouter,
notificationsRouter, profileRouter, placesRouter, blockedRouter, birthdaysRouter,
workScheduleRouter, friendNotesRouter, subscriptionRouter, onboardingRouter,
referralRouter, eventRequestsRouter, achievementsRouter, emailVerificationRouter,
discountRouter, circlesRouter, webhooksRouter, widgetRouter,
businessesRouter, businessEventsRouter, profilesRouter, privacyRouter,
entitlementsRouter, cronRouter, appleAuthRouter
```

### Backend Version: v2.9
Current server.ts includes:
- All 26 routers (including friendNotesRouter double-mounted on /api/friends)
- `/email-verified` HTML page
- `/share/event/:id` universal link handler
- `/invite/:code` referral link handler
- `/api/events/public/:id` public API endpoint
- `/api/events/:id` - Single event endpoint (handles past events)
- `/api/events/calendar-events` - Calendar view endpoint (created + going events with date range)
- `/api/privacy` - Privacy settings, data export, account deletion
- `/api/subscription/details` - Detailed subscription info with discount code history
- `/api/birthdays` - Returns user's own birthday + friends' birthdays
- `/api/profile/stats` - Now counts only FINISHED events for hosted/attended
- `/api/auth/apple` - Apple Sign In endpoint (JWKS verification)
- Health check at `/health`
- **Rate Limiting**: Global (200/min), Auth (50/15min)
- **Database Indexes**: Performance indexes on event, friendship, notification, session, friend_request
- **Session Duration**: 90 days (updated from 30 days)
- **Persistent Disk**: Render disk mounted at `/opt/render/project/src/uploads` for image storage
- **Note**: `smartNotifications.ts` exists as helper functions but is NOT a router (not mounted)

### User Search API (v3.2) - Instagram-style Friend Search
- **Endpoint**: GET `/api/profile/search?q={query}&limit={limit}`
- **Purpose**: Live, ranked user search for finding friends
- **Query Params**:
  - `q`: Search query (required, min 1 char)
  - `limit`: Max results (optional, default 20, max 50)
- **Query Classification**:
  - `@username` → handle search
  - `email@domain.com` → email search
  - `1234567890` → phone search (4+ digits)
  - Otherwise → name + email prefix + handle search
- **Ranking Score** (higher = better):
  - Exact handle match: +1000
  - Exact email match: +900
  - Handle starts with query: +800
  - Name starts with query: +700
  - Email starts with query: +600
  - Name contains query: +400
  - Handle contains query: +300
  - Per mutual friend: +50
  - Is existing friend: +200
- **Response Shape**:
  ```json
  {
    "users": [
      {
        "id": "string",
        "name": "string | null",
        "email": "string | null",
        "image": "string | null",
        "handle": "string | null",
        "mutualCount": 3,
        "isFriend": false
      }
    ]
  }
  ```
- **Security**: Excludes blocked users (both directions), requires auth
- **Contract**: `SearchUsersRankedResponse` in `shared/contracts.ts`
- **Frontend**: Live results in `src/app/friends.tsx` with 300ms debounce

### Calendar Events API (v3.1)
- **Endpoint**: GET `/api/events/calendar-events?start={ISO}&end={ISO}`
- **Purpose**: Returns events for calendar view including both created events and RSVP "Going" events
- **Query Params**:
  - `start`: ISO date string (required) - range start
  - `end`: ISO date string (required) - range end
- **Date Filtering**: Uses overlap query: `event.startTime < rangeEnd AND (event.endTime > rangeStart OR event.startTime >= rangeStart)`
- **Response Shape**:
  ```json
  {
    "createdEvents": [Event, ...],  // Events user created
    "goingEvents": [Event, ...]     // Events user RSVP'd "going" to (not their own)
  }
  ```
- **Going Events Sources**:
  - `event_interest` table with `status = "going"` (RSVP system)
  - `event_join_request` table with `status = "accepted"` (legacy join system)
- **Sorting**: Both arrays sorted by startTime ascending
- **Contract**: `GetCalendarEventsResponse` in `shared/contracts.ts`

### Render Persistent Disk (v2.8)
- **Mount Path**: `/opt/render/project/src/uploads`
- **Size**: 1 GB (can increase in Render dashboard)
- **Stores**:
  - Profile pictures (uploaded during onboarding)
  - Business logos
  - Business event images
  - Any image uploaded via `/api/upload/image`
- **Code paths**:
  - Production: `/opt/render/project/src/uploads`
  - Development: `./uploads` (relative to cwd)
- **Static serving**: Files accessible at `https://open-invite-api.onrender.com/uploads/filename.jpg`

### Friend Request Serialization Fix (v2.8)
- Backend now properly transforms Prisma field names to API contract names
- `user_friend_request_senderIdTouser` → `sender`
- `user_friend_request_receiverIdTouser` → `receiver`
- Friend cards now show `calendarBio` (the bio users set in profile settings)

### Profile Stats - Finished Events Only (v2.7)
- **Hosted count**: Only counts events where endTime (or startTime if no endTime) has passed
- **Attended count**: Only counts events user joined where the event has ended
- **Achievements**: Progress based on finished events only
- **Top friends**: Based on finished events attended together
- **Streak calculation**: Still uses all events (past + future) for consistency tracking

### Birthdays Feature (v2.7)
- **Backend**: `/api/birthdays` returns both user's own birthday AND friends' birthdays
- **Own birthday**: Marked with `isOwnBirthday: true` flag
- **Friends' birthdays**: Only shown if friend has `showBirthdayToFriends: true`
- **Frontend Calendar**:
  - Birthdays appear as pink events on calendar dates
  - "Upcoming Birthdays" collapsible section shows next 30 days (max 5)
  - User's own birthday shows as "My Birthday"
  - Section is collapsible with tap on header

### Subscription Management (v2.6)
- **Frontend**: `src/app/subscription.tsx` - Full subscription management screen
- **Settings Card**: Subscription card in Settings > Invite Friends section
- **Features**:
  - View current subscription status (Free, Trial, Yearly, Lifetime)
  - Trial end date and charge date display
  - Purchase yearly ($10/year with 2-week trial) or lifetime ($60) plans
  - Apply discount codes (single-use per user, lifetime code = last code ever)
  - View previously used discount codes
  - Restore purchases
  - Link to App Store subscription management
- **Backend Endpoint**: GET `/api/subscription/details` returns:
  - Subscription tier, type, expiry date, purchase date
  - Trial end date calculation
  - Discount code redemption history
  - Whether user can use more discount codes
- **Discount Code Rules**:
  - Each user can use each code only once
  - Using a lifetime code blocks future discount code usage
  - Codes: MONTH1FREE, YEAR1FREE, LIFETIME4U

### Privacy Settings (v2.5)
- **Database fields added to `user` model**:
  - `allowFriendRequests`: "everyone" | "friends_of_friends" | "nobody"
  - `showInFriendSuggestions`: boolean (default true)
  - `shareCalendarAvailability`: boolean (default true)
- **Friend request privacy**: Enforced in `backend/src/routes/friends.ts` POST /request endpoint
- **Friend suggestions privacy**: `showInFriendSuggestions` enforced in GET /api/friends/suggestions
- **Who's Free privacy**: Enforced in `backend/src/routes/events.ts` GET /whos-free endpoint
- **Data export**: GET `/api/privacy/export` - exports all user data as JSON
- **Account deletion**: DELETE `/api/privacy/account` - permanently deletes account and all data
- **Frontend**: `src/app/privacy-settings.tsx` - full privacy settings screen

### Friend Suggestions (People You May Know)
- **Endpoint**: GET `/api/friends/suggestions` - Returns friends-of-friends as suggestions
- **Frontend**: `src/app/suggestions.tsx` - "People You May Know" screen
- **Friend request by userId**: POST `/api/friends/request` now accepts `userId` in addition to `email`/`phone`
- **User profile**: `src/app/user/[id].tsx` - View non-friend profiles and send friend requests
- **Privacy respected**: Users who disabled `showInFriendSuggestions` won't appear in suggestions

### Production Scale Features (v2.4)
- **Rate Limiting Middleware**: `backend/src/middleware/rateLimit.ts`
- **Database Indexes**: Applied via migration `20260114074927_add_performance_indexes`
- **Toast Notifications**: `src/components/Toast.tsx` - replaces Alert.alert() for better UX
- **Rate Limit Handling**: Frontend no longer logs out on 429 errors

## Known Issues & Fixes

### Context Menu + Navigation Conflict (FIXED)
- **Problem**: In calendar, hard pressing event cards to open context menu also triggered navigation to event details
- **Solution**: Track press duration using `onPressIn` timestamp; only navigate if press < 200ms
- **Implementation** in `src/app/calendar.tsx` `EventListItem` component:
  - `pressStartTimeRef` tracks when press started
  - `handlePress` checks duration before navigating
  - `handleContextMenuOpenChange` blocks navigation when menu opens/closes
- **Key code pattern**:
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
- **Problem**: Changing event color via context menu wasn't persisting
- **Root Cause**: Backend's `createEventRequestSchema` in `backend/src/shared/contracts.ts` was missing the `color` field
- **Solution**: Added `color: z.string().optional()` to backend schema
- **CRITICAL**: Frontend and backend have SEPARATE `contracts.ts` files that must stay in sync:
  - Frontend: `/home/user/workspace/shared/contracts.ts`
  - Backend: `/home/user/workspace/backend/src/shared/contracts.ts`
- **Color priority in `getEventColor()`**: Birthday (pink) → Custom color → Group color → Theme default

### Friendship Data Serialization (CRITICAL)
- **Problem**: Prisma returns `user_friendship_friendIdTouser` but frontend expects `friend`
- **Problem**: Prisma returns `friend_group_membership` with `friend_group` but frontend expects `groupMemberships` with `group`
- **Solution**: `serializeFriendship()` in `backend/src/routes/friends.ts` transforms field names
- **Solution**: Suggestions/streaks endpoints in `backend/src/routes/events.ts` return `friend` instead of `user_friendship_friendIdTouser`
- **Frontend safety**: Filter friendships where `friend` is null/undefined before rendering

### Null Safety for Friend Data (CRITICAL)
- **Always filter** friendships before rendering: `friends.filter(f => f.friend != null)`
- **Always use optional chaining**: `friendship.friend?.email`, `friendship.friend?.name`
- **Circle members safety**: Always use `const members = circle.members ?? []` at component top
- Files with null guards:
  - `src/app/friends.tsx` - FriendCard, FriendListItem, filteredFriends, test friends section
  - `src/app/profile.tsx` - friends list in Add Members modal
  - `src/components/CircleCard.tsx` - members array safety: `const members = circle.members ?? []`
  - `src/app/circle/[id].tsx` - members array safety, availableFriends filter, checkFriendSuggestions guard
  - `src/app/discover.tsx` - suggestions/streaks filter: `.filter(s => s.friend != null)`, optional chaining on user/friend

### Double-Slash URL Bug (FIXED)
- Problem: URLs like `//api/email-verification/send` returning 404
- Cause: Backend URL env variable has trailing slash, combined with paths starting with `/`
- Solution: Strip trailing slashes from backend URLs in frontend
- Fixed in: `src/lib/api.ts`, `src/lib/authClient.ts`, `src/app/welcome.tsx`
- Code: `const backendUrl = rawBackendUrl.replace(/\/+$/, "");`

### Email Verification Error Detection
- Better Auth returns "Email not verified" error message
- Must check for `"verif"` (not `"verify"`) to catch this error
- Fixed in: `src/app/welcome.tsx` line ~725

### API Error Handling Fix
- `src/lib/api.ts` checks content-type before parsing JSON
- Prevents "JSON Parse error: Unexpected character: N" when server returns plain text errors

### Keyboard Fix for Subscription Screen
- `src/app/welcome.tsx` wraps subscription screen in KeyboardAvoidingView
- Prevents keyboard from covering promo code input

### Session Error Logout Fix (CRITICAL - v3 SIMPLIFIED)
- **Problem**: App was logging users out due to complex validation logic with many edge cases
- **Root Cause**: The validation useEffect had too many code paths, some didn't set `hasValidatedSession.current = true`, causing re-runs
- **Solution v3 (SIMPLIFIED)**: Completely rewrote session validation to be simple:
  1. Set `hasValidatedSession.current = true` IMMEDIATELY before any async operations
  2. Simple logic: No session → welcome, Has session → stay logged in, Any error → stay logged in
  3. Removed ALL server-side session validation (was causing issues)
  4. Removed ALL complex error checking (401/403/etc) - not needed anymore
- **New Logic**:
  - If `!session` → redirect to welcome (new user or explicitly logged out)
  - If `session` exists → user is logged in, check onboarding
  - For ANY error → keep user logged in, let API calls fail naturally
- **Key principle**: NEVER automatically sign out. Trust the local session. If it's truly invalid, individual API calls will fail and the user can manually logout.
- **Fixed in**: `src/app/index.tsx` - checkOnboardingStatus function

## Admin Endpoints (for testing)

### Delete User by Email
```bash
curl -X DELETE "https://open-invite-api.onrender.com/api/profile/admin/delete-user/EMAIL_HERE"
```
This deletes user and all related data (profile, sessions, verification codes, friendships, etc.)

### Discount Codes System
- ADMIN_API_KEY on Render: `openinvite-admin-2026`
- Seed discount codes (run in Render Shell after deploy):
```bash
curl -X POST "http://localhost:10000/api/discount/seed" -H "X-Admin-Api-Key: openinvite-admin-2026" -H "Content-Type: application/json"
```
- Update limits:
```bash
curl -X POST "http://localhost:10000/api/discount/update-limits" -H "X-Admin-Api-Key: openinvite-admin-2026" -H "Content-Type: application/json"
```
- Available codes: `MONTH1FREE` (500 uses), `YEAR1FREE` (200 uses), `LIFETIME4U` (100 uses)
- Health check: `curl http://localhost:10000/api/discount/health`

## Email Verification Flow
1. User signs up via Better Auth
2. Backend sends 5-digit code via Resend API
3. User enters code in app
4. Code verified via `/api/email-verification/verify`
5. User signed in automatically after verification

## Key Files

### Frontend
- `src/app/welcome.tsx` - Onboarding flow with email verification
- `src/app/friends.tsx` - Friends list with null safety guards
- `src/app/profile.tsx` - Profile screen with null safety guards
- `src/lib/api.ts` - API client for backend requests
- `src/lib/authClient.ts` - Better Auth client configuration

### Backend
- `backend/src/server.ts` - **RENDER PRODUCTION ENTRY FILE** (not index.ts!)
- `backend/src/index.ts` - Vibecode dev server entry file
- `backend/src/routes/friends.ts` - Friends API with serializeFriendship()
- `backend/src/routes/emailVerification.ts` - Email verification endpoints
- `backend/src/routes/profile.ts` - Profile routes including admin delete
- `backend/src/routes/discount.ts` - Discount code validation, redemption, seeding, update-limits
- `backend/src/routes/appleAuth.ts` - Apple Sign In with JWKS verification

### Shared
- `shared/contracts.ts` - Zod schemas for API request/response types (used by both frontend and backend)

## Apple Sign In (v2.9)

### Configuration
- **app.json**: `usesAppleSignIn: true` in ios section
- **Bundle ID**: `com.vibecode.openinvite.0qi5wk`
- **Apple Team ID**: `T3LP6XXS49` (env: APPLE_TEAM_ID on Render)

### Backend Endpoint
- **Route**: `POST /api/auth/apple`
- **File**: `backend/src/routes/appleAuth.ts`
- **Verification**: JWKS from `https://appleid.apple.com/auth/keys`
- **Dependencies**: `jose` package for JWT verification

### Flow
1. User taps "Continue with Apple" on iOS
2. `expo-apple-authentication` shows native Apple Sign In sheet
3. Client receives `identityToken` (JWT) from Apple
4. Client POSTs to `/api/auth/apple` with token
5. Backend verifies JWT signature using Apple's JWKS public keys
6. Backend validates: issuer (`https://appleid.apple.com`), audience (bundle ID), expiration
7. Backend finds/creates user by Apple `sub` claim
8. Backend creates session and returns token
9. Client stores session in SecureStore and proceeds to profile setup

### Account Linking
- Apple accounts stored in `account` table with `providerId: "apple"` and `accountId: <Apple sub>`
- If email exists, Apple account is linked to existing user
- If no email (hidden), placeholder email `apple_{sub}@apple.private` is used
- Apple users skip email verification (pre-verified by Apple)

### Frontend Implementation
- `expo-apple-authentication` is dynamically imported (requires native build)
- Falls back to "Coming Soon" alert if module not available
- Session token stored in `expo-secure-store` (not AsyncStorage)
- On success, user skips to `profileName` step (bypasses email verification)

### Required for Production
1. Run new EAS build with `usesAppleSignIn: true`
2. Configure Sign in with Apple capability in Apple Developer Console
3. Set env vars on Render: `APPLE_TEAM_ID`, `APPLE_IOS_CLIENT_ID`

### Email-Optional Users (v3.0)
Apple Sign In users may NOT have an email address (if they choose to hide it). This is now fully supported:

**Database**:
- `user.email` is nullable (`String?` in Prisma)
- User identity is keyed by `account(providerId="apple", accountId=sub)`, NOT by email

**Backend**:
- `appleAuth.ts` creates users with `email: null` when Apple doesn't provide one
- All routes use optional chaining on `user.email`
- Friend requests use `userId` instead of `email` for email-less users

**Frontend**:
- All `user.email` and `friend.email` accesses use optional chaining: `user.email?.[0]`
- Avatar initials fallback: `name?.[0] ?? email?.[0]?.toUpperCase() ?? "?"`
- Suggestions screen sends friend requests by `userId` instead of `email`
- Friend search filters use optional chaining on email

**Contracts**:
- All `email` fields in user objects are `z.string().nullable()`
- Shared contracts (`shared/contracts.ts`) and backend contracts are in sync

## Shared Contracts Pattern
- Define Zod schemas in `shared/contracts.ts`
- Export both schema and inferred type: `export type Friendship = z.infer<typeof friendshipSchema>`
- Use schema for validation in backend
- Use type for TypeScript in frontend
- Key schemas: `friendshipSchema`, `friendUserSchema`, `eventSchema`, `getFriendsResponseSchema`

## Onboarding Flow (v2.2) - Finalized

### Design Philosophy
- Complete in ≤60 seconds if skipping optional steps
- No OS permission prompts during onboarding
- No paywall or monetization messaging
- All steps skippable except account creation (email verification can be deferred)
- Tone: calm, social, human — never salesy

### Screens (7 total)
1. **Welcome** - "Your Social Calendar" with aurora glow icon
2. **Why Open Invite** - 3 glass-style value prop cards
3. **Create Account** - Apple Sign In (iOS) + Email/Password form
4. **Verify Email** - 5-digit code entry (can skip with "I'll do this later")
5. **Profile Name** - Display name input (skippable)
6. **Profile Photo** - Choose/take photo with dashed circle placeholder (skippable)
7. **Mission** - Inspirational quote in glass card, then → Feed screen

### Visual Features
- **OnboardingLayout**: Shared component with gradient background, noise overlay, safe area
- **AuroraGlow**: Animated pulsing glow effect behind icons
- **GlassCard**: Translucent cards with subtle borders
- **Progress dots**: Shows current step (visible on screens 2-6)
- **Staggered animations**: Elements fade in sequentially

### Apple Sign In
- Shows native-style button on iOS
- Requires `expo-apple-authentication` package installation
- Currently shows "Coming Soon" alert (placeholder)
- Apple users skip email verification (emails pre-verified)

### Email Verification Deferral
- Users can tap "I'll do this later" to skip verification
- Sets `verification_deferred` flag in AsyncStorage
- **Gating**: Social actions blocked until verified:
  - Creating events
  - Inviting friends
  - Sending friend requests
- **Modal**: `VerifyEmailModal` component shows when blocked
- **Hook**: `useVerificationGate` provides easy gating logic
- **Banner**: Soft reminder banner shown in feed for unverified users

### State Persistence
- `onboarding_completed`: Set to "true" when onboarding finishes
- `onboarding_progress_v2`: In-progress state for resuming onboarding
- `verification_deferred`: "true" if user skipped email verification
- `verification_banner_dismissed`: "true" if user dismissed the feed banner

### Navigation
- On completion: Navigates to `/` (main feed)
- Feed checks `onboarding_completed` flag before showing content
- Users without completed flag are redirected to `/welcome`

### Files
- `src/app/welcome.tsx` - Full onboarding flow (state machine)
- `src/app/index.tsx` - Feed with verification banner
- `src/components/VerifyEmailModal.tsx` - Verification gating modal
- `src/hooks/useVerificationGate.ts` - Hook for checking/gating deferred verification

## Google Maps API
- **API Key**: `AIzaSyAvl_O6gmcbRpYKX4mIfS0EByFn9o1iMC0`
- **Environment Variable**: `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` (set in Expo account settings)
- **Status**: Already configured in Expo production environment
- Used for: Google Places API, Maps, location autocomplete

## Calendar Event Import (.ics) - App Store Safe

### Overview
Users can import events from Apple Calendar or Google Calendar by sharing them to Open Invite. This is a **one-way, event-by-event import** with no calendar permissions required.

### How it Works
1. User opens Apple Calendar or Google Calendar app
2. User taps on an event and selects "Share"
3. User selects "Open Invite" from share menu
4. .ics file is parsed and event details are pre-filled in create screen
5. User reviews, edits, and creates the event as a normal Open Invite event

### Implementation
- **File Handler Registration**: `app.json` registers Open Invite as handler for `.ics` files
- **Parser**: `src/lib/icsParser.ts` - Pure JavaScript .ics parser (no dependencies)
- **Deep Link Handler**: `src/lib/deepLinks.ts` - Handles .ics file URIs and stores pending import
- **Create Screen Integration**: `src/app/create.tsx` - Checks for pending import on mount and pre-fills form
- **Help Screen**: `src/app/calendar-import-help.tsx` - Instructions for users
- **Settings Entry**: `src/app/settings.tsx` - "Add events from Apple or Google Calendar" → Help screen

### Key Principles
- **No calendar permissions**: App does NOT request `NSCalendarsFullAccessUsageDescription`
- **No background sync**: Events are imported one at a time when user explicitly shares
- **No storage of calendar identifiers**: Imported events are first-class Open Invite events
- **App Store safe**: Complies with Apple's guidelines for calendar access

### Files
- `src/lib/icsParser.ts` - .ics file parser
- `src/lib/deepLinks.ts` - Deep link handler with `getPendingIcsImport()` and `storePendingIcsImport()`
- `src/app/create.tsx` - Create event screen with import support
- `src/app/calendar-import-help.tsx` - User-facing instructions
- `src/app/settings.tsx` - Settings entry point

### app.json Configuration
```json
"NSCalendarsUsageDescription": "Open Invite uses your calendar to add events you choose to save.",
"CFBundleDocumentTypes": [
  {
    "CFBundleTypeName": "iCalendar Event",
    "LSHandlerRank": "Alternate",
    "LSItemContentTypes": ["com.apple.ical.ics"]
  }
],
"UTImportedTypeDeclarations": [
  {
    "UTTypeIdentifier": "com.apple.ical.ics",
    "UTTypeTagSpecification": {
      "public.filename-extension": ["ics"],
      "public.mime-type": ["text/calendar"]
    },
    "UTTypeConformsTo": ["public.data", "public.content"]
  }
]
```

### Testing
1. Open Apple Calendar app
2. Create or open an event
3. Tap "Share" button
4. Select "Open Invite"
5. Verify event details are pre-filled in create screen
6. Create event normally

## Offline Mode MVP (v3.2)

### Overview
The app supports offline usage with automatic sync when network returns:
- Users stay logged in when offline (network errors don't trigger logout)
- Key actions (create event, RSVP) work offline with optimistic UI
- Queued actions are replayed when coming back online

### Key Files
- `src/lib/networkStatus.ts` - Network monitoring with NetInfo, `useNetworkStatus()` hook
- `src/lib/useResilientSession.ts` - Session hook that caches session and handles offline gracefully
- `src/lib/useSession.tsx` - Re-exports resilient session hook (drop-in replacement)
- `src/lib/offlineQueue.ts` - Persistent queue for offline actions
- `src/lib/offlineStore.ts` - Zustand store for local events and sync state
- `src/lib/offlineSync.ts` - Queue replay worker, offline mutation hooks
- `src/components/OfflineBanner.tsx` - Network status banner (offline/syncing)

### Auth Resilience
- **Rule**: Only clear session on HTTP 401/403 from server
- **Never logout on**: Network errors, timeouts, 5xx, DNS failures
- Session is cached in AsyncStorage (`session_cache_v1`)
- Offline users see cached session data

### Offline Queue
- **Storage key**: `offlineQueue:v1`
- **Action types**: `CREATE_EVENT`, `UPDATE_EVENT`, `RSVP_CHANGE`, `DELETE_RSVP`
- **Status**: `pending` → `processing` → (removed on success) or `failed`
- **Replay**: FIFO order on network reconnect

### UI Banners
- **Offline**: Amber banner "Offline — changes will sync when you're back"
- **Syncing**: Blue banner "Syncing... (X/Y)" with progress

### Local Events
- Offline-created events get `local_<uuid>` IDs
- Stored in `localEvents:v1` AsyncStorage key
- Merged into calendar display alongside server events
- Reconciled (removed) after successful sync creates real server event

### Hooks for Offline Mutations
```typescript
// Offline-aware event creation
const { createEvent, isOnline } = useOfflineCreateEvent();
const { id, isLocal } = await createEvent(payload, userId);

// Offline-aware RSVP
const { changeRsvp, deleteRsvp, isOnline } = useOfflineRsvp();
await changeRsvp(eventId, "going");
```

### Initialization
- `initNetworkMonitoring()` called in `_layout.tsx` on app start
- `OfflineSyncProvider` wraps app to handle queue replay
- `NetworkStatusBanner` renders at root level

## Freemium Model (v3.0) - FINALIZED

### Product Principle
- **Participation must be free**
- Power, scale, insights, and hosting capabilities are paid
- Friends should never hit a paywall to join, chat, or participate
- **Virality Rule**: If a Pro user hosts an event or owns a circle, all participants temporarily benefit from Pro-level planning features

### FREE TIER (Forever)

#### Social Calendar & Availability
| Feature | Limit |
|---------|-------|
| View friends' events | Unlimited |
| Join events | Unlimited |
| "Who's Free?" | 7 days ahead |
| Calendar widget | Read-only |

#### Event Hosting
| Feature | Limit |
|---------|-------|
| Active events | 3 max |
| Event details & Maps | Full |
| Share via links | Enabled |
| Event history | Last 30 days |

#### Friends & Social
| Feature | Limit |
|---------|-------|
| Add friends | Unlimited |
| Friend suggestions | Enabled |
| View profiles | Enabled |
| Friend streaks | View-only |
| Friend notes | 5 max |
| Top friends analytics | Disabled |

#### Circles
| Feature | Limit |
|---------|-------|
| Create circles | 2 max |
| Members per circle | 15 max |
| Circle insights | Disabled |

#### Birthdays
| Feature | Limit |
|---------|-------|
| Upcoming birthdays | 7 days |
| Show on calendar | Enabled |
| Show/hide toggle | Enabled |

#### Profile & Stats
| Feature | Limit |
|---------|-------|
| Profile photo/bio | Enabled |
| Basic stats | Enabled |
| Achievements | Basic badges only |
| Detailed analytics | Disabled |

#### Privacy, Work Schedule, Sharing
- All privacy controls: Enabled
- Work schedule: Enabled
- Share events: Enabled
- Referral code: Enabled

### PRO TIER (Organizer / Power User)

#### Unlocks
| Feature | Pro Benefit |
|---------|-------------|
| "Who's Free?" | 90 days ahead |
| Calendar widget | Full interactive |
| Active events | Unlimited |
| Recurring events | Unlimited |
| Event history | Full + analytics |
| Attendance trends | Enabled |
| Friend streaks | Full history + insights |
| Friend notes | Unlimited |
| Top friends analytics | Enabled |
| Circles | Unlimited |
| Circle members | Unlimited |
| Circle insights | Enabled |
| Upcoming birthdays | 90 days |
| Achievements | Full system |
| Detailed analytics | Enabled |
| Photo uploads | Unlimited |
| Event memory timeline | Enabled |
| Archive access | Enabled |
| Priority sync | Enabled |
| Early access | Enabled |

### Referral Rewards
| Referrals | Reward |
|-----------|--------|
| 3 verified | 1 month Pro |
| 10 verified | 1 year Pro |
| 40 verified | Lifetime Pro |

**Rules**: Referrals must be verified/active. Rewards = Pro time only. Pauses if subscription inactive.

### Pricing
| Plan | Price |
|------|-------|
| Free | $0 forever |
| Pro (Early Adopter) | $10/year + 2-week trial |
| Pro (Future) | $25-40/year |
| Lifetime | Remove or $199+ (limited qty) |

### Implementation Checklist
- [x] RevenueCat: Products configured (monthly, yearly, lifetime for Test/App/Play stores)
- [x] Backend: Add isPro checks to gated endpoints (`subscriptionHelpers.ts`)
- [x] Backend: Implement limit checks (events: 3 max, circles: 2 max, notes: 5 max)
- [x] Backend: Add "Pro host/owner bypass" for virality rule (`canAddCircleMember`, `getWhosFreeLimit`)
- [x] Frontend: Add useSubscription hook with limit helpers (`src/lib/useSubscription.ts`)
- [x] Frontend: Create upgrade modal/prompts (`src/components/UpgradeModal.tsx`)
- [x] Frontend: Add Pro badges to locked features (`ProBadge`, `UpgradePrompt`, `LimitIndicator`)
- [x] Database: Subscription model exists (tier, expiresAt, transactionId, purchasedAt)
- [x] Referral: Update reward tiers (3/10/40) in `freemiumLimits.ts`
- [x] App Store link: Updated to id6740083226 in referral router

## Push Notifications (Expo Push Service)

### Provider
**Expo Push Notification Service** - Free service included with Expo. Sends to both iOS (APNs) and Android (FCM).

### Setup Status
- [x] Frontend: `registerForPushNotificationsAsync()` in `src/lib/notifications.ts`
- [x] Frontend: `useNotifications` hook auto-registers tokens when user logs in
- [x] Frontend: Android notification channels configured (default, events, reminders, social)
- [x] Backend: Token storage in `push_token` table via POST `/api/notifications/register-token`
- [x] Backend: `sendPushNotification(userId, notification)` helper function
- [x] Backend: Sends to Expo API at `https://exp.host/--/api/v2/push/send`
- [x] App integration: `useNotifications()` called in `src/app/index.tsx`
- [x] Deep linking: Notification taps navigate to correct screens (event, friend, etc.)
- [x] Dev testing: Test push endpoint at POST `/api/notifications/test-push`
- [x] Dev UI: Push notification test in `/dev-smoke-tests` with custom title/message

### Usage Pattern
```typescript
// Backend - send to specific user
import { sendPushNotification } from "./routes/notifications";

await sendPushNotification(userId, {
  title: "Event Reminder",
  body: "Your event starts in 1 hour!",
  data: { eventId: "123", type: "event_reminder", screen: "event" },
});
```

### Notification Types Implemented
- Event reminders (local + remote)
- New events from friends
- Friend requests & acceptances
- Join requests & acceptances
- Event updates
- FOMO notifications (friend joined event)
- Event reflection reminders
- Test notifications (dev only)

### Testing
Go to `/dev-smoke-tests` → "Push Notification Test (Expo)" section → Enter title/message → Tap "Send Test Push". Requires physical device with notifications enabled.

## Dev Smoke Tests QA Harness

### Location
`src/app/dev-smoke-tests.tsx` - Comprehensive QA screen for testing paywalls, navigation, and notifications.

### Features

#### 1. Paywall CTA Audit
- **Run Paywall CTA Audit** button - Guided manual audit of all 10 PaywallContext types
- Tests that Primary CTA → `/subscription` for each context
- Tests that Secondary CTA → dismisses only (no navigation)
- Visual progress grid shows pass/fail/pending icons
- Console logs detailed PASS/FAIL for each context
- Prints summary with total counts when complete
- Can validate all 10 contexts in under 60 seconds

#### 2. PaywallContext Coverage
**Single source of truth constant:**
```typescript
const PAYWALL_CONTEXTS: PaywallContext[] = [
  "ACTIVE_EVENTS_LIMIT",
  "RECURRING_EVENTS",
  "WHOS_FREE_HORIZON",
  "UPCOMING_BIRTHDAYS_HORIZON",
  "CIRCLES_LIMIT",
  "CIRCLE_MEMBERS_LIMIT",
  "INSIGHTS_LOCKED",
  "HISTORY_LIMIT",
  "ACHIEVEMENTS_LOCKED",
  "PRIORITY_SYNC_LOCKED",
];
```
Console logs on mount verify all 10 contexts are present.

#### 3. Navigation Sanity Tests
Quick test buttons for all major routes:
- `/` (Home), `/calendar`, `/friends`, `/profile`, `/settings`, `/whos-free`, `/subscription`
- Each logs navigation to console

#### 4. Notification Tests
- **Notification Nudge** - Test permission modal with evolving copy
- **Push Notification Test** - Send test push with custom title/message

#### 5. Session State Visibility
Real-time display of:
- Paywall shown this session (yes/no)
- Can show automatic paywall (yes/no)
- Notification nudge state (none/nudged_once/nudged_twice/never_nudge)
- Last CTA pressed with context

#### 6. Current Plan Info
Displays entitlements data:
- Plan tier (Free/Pro)
- Active events count / max
- Circles count / max
- Who's Free horizon days

### PaywallModal Safety Check
Added dev warning in `src/components/paywall/PaywallModal.tsx`:
- Logs warning when `onPrimary` is not provided
- Falls back to `goToSubscription(router)` if missing
- Helps catch missing CTA handlers during development

### Navigation Helper
`src/lib/nav.ts` - Single source of truth for all app routes:
- `goToHome(router)`, `goToSubscription(router)`, etc.
- `ROUTES` constant with all route paths
- Type-safe navigation functions
- Used by PaywallModal, dev-smoke-tests, and throughout app

</project_notes>