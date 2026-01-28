# Auth Contract — Canonical

These are the three immutable laws for authentication in this app.

---

## Law 1: Cookie-Based Session Only

**Rule:** All authenticated API calls MUST use the Better Auth session cookie: `__Secure-better-auth.session_token`.

**Why:** Better Auth manages session state server-side. The cookie contains the session token. No bearer tokens, no manual JWT handling.

**Example:**
```typescript
// ✅ CORRECT: authClient handles cookie automatically
const profile = await authClient.$fetch("/api/profile");

// ❌ WRONG: Manual Authorization header
fetch(url, { headers: { "Authorization": "Bearer xyz" } });
```

---

## Law 2: Lowercase `cookie` Header in React Native

**Rule:** In React Native/Expo, the cookie header MUST be lowercase `cookie`. Uppercase `Cookie` is silently dropped.

**Why:** React Native fetch implementation drops uppercase `Cookie` headers without error. Better Auth expo client uses lowercase.

**Example:**
```typescript
// ✅ CORRECT: lowercase cookie header
headers: {
  "cookie": `; ${cookieName}=${cookieValue}`,
  "credentials": "omit"
}

// ❌ WRONG: uppercase Cookie (silently dropped)
headers: { "Cookie": "..." }
```

---

## Law 3: Gate Queries on `bootStatus === 'authed'`

**Rule:** All authenticated React Query calls MUST use `enabled: bootStatus === 'authed'` (NOT `!!session`).

**Why:** After logout, the session may persist in React Query cache momentarily. Using `!!session` causes queries to fire during logout/login transitions → 401 storm.

**Example:**
```typescript
// ✅ CORRECT: bootStatus gating
const { data } = useQuery({
  queryKey: ["profile"],
  queryFn: () => authClient.$fetch("/api/profile"),
  enabled: bootStatus === "authed",
});

// ❌ WRONG: session gating (race condition)
enabled: !!session
```

---

## Summary

| Law | Rule | Reason |
|-----|------|--------|
| 1 | Use Better Auth session cookie | Server-side session management |
| 2 | Lowercase `cookie` header in RN | React Native drops uppercase `Cookie` |
| 3 | Gate on `bootStatus === 'authed'` | Prevent 401 storms during transitions |

See also:
- [docs/API_AUTH_EXAMPLES.md](API_AUTH_EXAMPLES.md) — curl examples
- [docs/FINDINGS_LOG.md](FINDINGS_LOG.md) — detailed proof and history

type: "event_join"
deepLinkPath: `/event/${eventId}`
