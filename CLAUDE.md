# Claude Runtime Index — Open Invite

**App:** Social coordination iOS app (Expo + React Native)

---

## Read These First (by Task Type)

| Task Type | Required Reading |
|-----------|------------------|
| **Debugging/Issues** | `docs/DEBUGGING_GUIDE.md`, `docs/KNOWN_ISSUES.md`, `docs/KNOWN_GOOD_LOG_LINES.md` |
| **UI/UX Changes** | `docs/UX_CONTRACTS.md`, `docs/CLAUDE_UI_REGRESSION_PROTOCOL.md` |
| **Backend/API Work** | `docs/BACKEND_ARCHITECTURE.md`, `docs/API_AUTH_EXAMPLES.md` |
| **Feature Implementation** | `docs/FEATURES_REFERENCE.md`, `docs/AI_CONTEXT.md` |
| **Deployment/Production** | `docs/PRODUCTION_DEPLOYMENT.md`, `docs/AI_CONTEXT.md` |

---

## Tech Stack (Immutable)

```xml
<stack>
  Expo SDK 53, React Native 0.76.7, bun (not npm).
  React Query for server/async state.
  NativeWind + Tailwind v3 for styling.
  react-native-reanimated v3 for animations (preferred over Animated).
  react-native-gesture-handler for gestures.
  lucide-react-native for icons.
  All packages pre-installed. DO NOT install new packages unless @expo-google-font or pure JS helpers.
</stack>
```

---

## Repository Structure

```xml
<structure>
  src/app/          — Expo Router file-based routes (src/app/_layout.tsx is root)
  src/components/   — Reusable UI components
  src/lib/          — Utilities: cn.ts (className merge), api.ts, authClient.ts
  docs/             — Documentation (debugging, architecture, features)
  backend/          — Backend server (separate concerns from frontend)
</structure>
```

---

## Critical Guardrails (Non-Negotiable)

### Security
- **NEVER** store API keys, secrets, or credentials in source files
- **ALL** secrets via environment variables (EAS/Expo env vars only)
- Use placeholders in docs: "YOUR_API_KEY_HERE"
- .env files are gitignored and MUST NOT be committed

### TypeScript
- Explicit type annotations: `useState<Type[]>([])` not `useState([])`
- Optional chaining `?.` and nullish coalescing `??` for null safety
- Include ALL required properties when creating objects (strict mode enabled)

### Forbidden Files
- **DO NOT edit:** patches/, babel.config.js, metro.config.js, app.json, tsconfig.json, nativewind-env.d.ts

---

## Vibecode Environment Context

```xml
<environment>
  You are in Vibecode. System manages git and dev server (port 8081).
  DO NOT: manage git, touch dev server, or check its state.
  User views app through Vibecode App.
  User cannot see code or interact with terminal.
  Backend server auto-runs on port 3000 - DO NOT start manually.
  Use env vars: EXPO_PUBLIC_API_URL, BACKEND_URL (auto-proxied).
  User is likely non-technical - communicate simply.
</environment>
```

---

## Routing (Expo Router)

### Stack Router
- `src/app/_layout.tsx` (root), `src/app/index.tsx` (home), `src/app/settings.tsx`
- Use `<Stack.Screen options={{ title, headerStyle }} />` for headers
- Never delete or refactor RootLayoutNav from `_layout.tsx`

### Tabs Router
- Only files registered in `src/app/(tabs)/_layout.tsx` become actual tabs
- Unregistered files in `(tabs)/` are routes within tabs, not separate tabs
- At least 2 tabs or don't use tabs at all

### Critical Rules
- Only ONE route can map to "/" - can't have both `src/app/index.tsx` and `src/app/(tabs)/index.tsx`
- Dynamic params: `const { id } = useLocalSearchParams()` from expo-router
- Modals: Add `<Stack.Screen name="page" options={{ presentation: "modal" }} />` in root layout

---

## State Management

### React Query (Server State)
- Always use object API: `useQuery({ queryKey, queryFn })`
- Use `useMutation` for async operations - no manual `setIsLoading`
- Reuse query keys across components to share cached data
- React Query provider must be outermost

### Local State (Zustand)
- Always use selector: `useStore(s => s.foo)` not `useStore()`
- Return primitives from selectors to prevent unnecessary re-renders
- Don't execute store methods in selectors

### Auth State
- Gate queries on `bootStatus === 'authed'` not `!!session`
- Session persistence via AsyncStorage inside context providers
- Split ephemeral from persisted state to avoid hydration bugs

---

## Design Guidelines

### Mobile-First
- Design for touch, thumb zones, glanceability
- Inspiration: iOS, Instagram, Airbnb, Coinbase
- **Avoid:** Purple gradients on white, generic centered layouts, web-like designs
- **Use:** Cohesive themes, high-impact animations, depth via gradients

### Styling
- NativeWind for styling, use `cn()` helper for conditional classes
- CameraView, LinearGradient, Animated DO NOT support className (use style prop)
- Horizontal ScrollViews need `style={{ flexGrow: 0 }}` to constrain height

### Safe Area
- Import from react-native-safe-area-context, NOT react-native
- Skip SafeAreaView inside tab stacks with navigation headers
- Add when using custom/hidden headers
- For games: use useSafeAreaInsets hook

---

## Common Mistakes to Avoid

### Camera
- Use CameraView from expo-camera, NOT deprecated Camera
- `import { CameraView, CameraType, useCameraPermissions } from 'expo-camera'`
- Use `style={{ flex: 1 }}`, not className
- Overlay UI must be absolute positioned inside CameraView

### UX
- Use Pressable over TouchableOpacity
- Use custom modals, not Alert.alert()
- Ensure keyboard dismissable and doesn't obscure inputs
- Consider react-native-keyboard-controller package

### React Native
- No Node.js buffer in React Native - don't import from 'buffer'
- react-native-reanimated and react-native-gesture-handler training may be outdated

---

## Backend Integration

### Local Backend (Vibecode Cloud)
- Backend server auto-runs on port 3000 in `/home/user/workspace/backend`
- TypeScript + Bun + Hono server + Prisma ORM + Better Auth
- BACKEND_URL replaced with actual server URL via reverse proxy
- **CRITICAL:** Production uses `src/server.ts`, dev uses `src/index.ts` - add routers to BOTH
- Use API client at `src/lib/api.ts` for all backend requests
- Create migrations: `bunx prisma migrate dev --create-only --name <name>`

### Shared Contracts
- Define Zod schemas in `shared/contracts.ts`
- Export schema + inferred type: `export type Foo = z.infer<typeof fooSchema>`
- Backend/frontend contracts must stay in sync

---

## Skills Available

Access via `.claude/skills` folder:
- **ai-apis-like-chatgpt:** AI API implementation
- **expo-docs:** Expo SDK modules and packages
- **frontend-app-design:** Mobile UI design

---

## Verification Commands

```bash
# TypeScript check
npm run typecheck

# Backend logs
cat /home/user/workspace/backend/server.log

# Environment check
env | grep BACKEND_URL
```

---

## Workflow Expectations

1. **Read relevant docs first** based on task type (see table above)
2. **Use dedicated tools:** Read/Edit/Write over bash commands for file operations
3. **Prefer editing existing files** over creating new ones
4. **Mobile-first design** - touch-optimized, thumb zones, glanceability
5. **Security-first** - no secrets in code, environment variables only
6. **Null safety** - optional chaining, filter before mapping
7. **Outcome over implementation** - working UI on device is the standard

---

## See Complete Documentation

- `docs/AI_CONTEXT.md` - Tech immutables and repo guardrails
- `docs/BACKEND_ARCHITECTURE.md` - Current backend system state
- `docs/DEBUGGING_GUIDE.md` - Comprehensive troubleshooting
- `docs/FEATURES_REFERENCE.md` - Feature implementation details
- `docs/KNOWN_ISSUES.md` - Historical fixes and patterns
- `docs/PRODUCTION_DEPLOYMENT.md` - Production deployment process
- `docs/UX_CONTRACTS.md` - UX behavior requirements