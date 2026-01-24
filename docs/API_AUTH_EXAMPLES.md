# API Auth Examples — Copy/Paste Ready

These curl examples demonstrate cookie-based authentication with Better Auth.

---

## 1. Login and Capture Cookie

```bash
# Login and capture session cookie
curl -v -X POST https://api.open-invite.com/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "yourpassword"
  }' \
  -c cookies.txt

# Extract cookie value
COOKIE=$(grep '__Secure-better-auth.session_token' cookies.txt | awk '{print $7}')
echo "Cookie: $COOKIE"
```

---

## 2. Fetch Authenticated Endpoint (Web)

```bash
# Use cookie file directly
curl -v https://api.open-invite.com/api/profile \
  -b cookies.txt

# Or use extracted cookie value
curl -v https://api.open-invite.com/api/profile \
  -H "Cookie: __Secure-better-auth.session_token=$COOKIE"
```

---

## 3. Fetch Authenticated Endpoint (Expo/React Native Format)

```bash
# React Native requires lowercase 'cookie' + leading '; '
curl -v https://api.open-invite.com/api/profile \
  -H "cookie: ; __Secure-better-auth.session_token=$COOKIE" \
  -H "expo-origin: expo-app" \
  -H "x-skip-oauth-proxy: true"
```

**Note:** The `; ` prefix (semicolon-space) before cookie name is required for Better Auth expo client compatibility.

---

## 4. Verify Session

```bash
# Check if session is valid
curl -v https://api.open-invite.com/api/auth/session \
  -H "cookie: ; __Secure-better-auth.session_token=$COOKIE"

# Expected response (200):
# {"user": {...}, "session": {...}}

# If 401: session expired or invalid
```

---

## 5. Logout

```bash
# Logout and invalidate session
curl -v -X POST https://api.open-invite.com/api/auth/sign-out \
  -H "cookie: ; __Secure-better-auth.session_token=$COOKIE"
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Uppercase `Cookie:` in RN | Use lowercase `cookie:` |
| Missing `; ` prefix | Add `; ` before cookie name |
| Using bearer token | Use cookie-based session instead |
| Gating on `!!session` | Gate on `bootStatus === 'authed'` |

---

## Environment Variables

```bash
# Development
API_BASE_URL=http://localhost:3000

# Production
API_BASE_URL=https://api.open-invite.com

# Replace in examples above:
# https://api.open-invite.com → $API_BASE_URL
```

---

## SecureStore Cookie Format (Expo)

```typescript
// Reading cookie from SecureStore
const cookie = await SecureStore.getItemAsync("open-invite_cookie");
// Format: "__Secure-better-auth.session_token=xyz123..."

// Extracting just the value
const match = cookie?.match(/=(.+)$/);
const sessionToken = match?.[1];
```

See also:
- [docs/AUTH_CONTRACT.md](AUTH_CONTRACT.md) — The 3 auth laws
- [src/lib/authClient.ts](../src/lib/authClient.ts) — Client implementation
