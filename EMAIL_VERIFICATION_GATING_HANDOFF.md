# HANDOFF PACKET — Email Verification Gating

## 1) Summary
- Created `src/lib/emailVerification.ts` with `guardEmailVerification()` helper
- Gates create event action in `create.tsx` — shows alert if email not verified
- Gates RSVP action in `event/[id].tsx` — blocks joining events without verification
- Gates friend request actions in `friends.tsx` (contacts + direct add) and `suggestions.tsx`
- Alert prompts user to verify email with "Verify Email" CTA that navigates to `/verify-email`
- Typecheck passes, changes pushed to `origin/main`

## 2) Files Changed
- `src/lib/emailVerification.ts` (NEW)
- `src/app/create.tsx`
- `src/app/event/[id].tsx`
- `src/app/friends.tsx`
- `src/app/suggestions.tsx`

## 3) Key Diffs

### src/lib/emailVerification.ts (new file)
```typescript
export function isEmailVerified(session: Session): boolean {
  return session?.user?.emailVerified === true;
}

export function guardEmailVerification(session: Session): boolean {
  if (isEmailVerified(session)) {
    return true;
  }
  showEmailVerificationRequired();
  return false;
}

function showEmailVerificationRequired(): void {
  Alert.alert(
    "Verify your email to continue",
    "You need to verify your email address before you can do this.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Verify Email", onPress: () => router.push("/verify-email") },
    ]
  );
}
```

### src/app/create.tsx
```diff
+ import { guardEmailVerification } from "@/lib/emailVerification";

  const handleCreate = () => {
+   // Guard: require email verification
+   if (!guardEmailVerification(session)) {
+     return;
+   }
    if (!title.trim()) {
```

### src/app/event/[id].tsx
```diff
+ import { guardEmailVerification } from "@/lib/emailVerification";

  const handleRsvp = (status: RsvpStatus) => {
    // Guard: only allow RSVP when authenticated
    if (bootStatus !== 'authed') { ... }
+   // Guard: require email verification
+   if (!guardEmailVerification(session)) {
+     return;
+   }
    // Show confirmation modal when removing RSVP
```

### src/app/friends.tsx
```diff
+ import { guardEmailVerification } from "@/lib/emailVerification";

  const handleInviteContact = (contact) => {
+   if (!guardEmailVerification(session)) {
+     return;
+   }
    ...
  };

+ const handleDirectFriendRequest = () => {
+   if (!guardEmailVerification(session)) {
+     return;
+   }
+   // phone/email detection logic
+ };
```

### src/app/suggestions.tsx
```diff
+ import { guardEmailVerification } from "@/lib/emailVerification";

  const handleAddFriend = (suggestion) => {
+   if (!guardEmailVerification(session)) {
+     return;
+   }
    sendRequestMutation.mutate(suggestion.user.id);
  };
```

## 4) Runtime Status

### Commands to Run
```bash
npm run typecheck   # ✅ Passes
npx expo start      # Run app to test verification gating
```

### Expected Behavior
- **Email verified user:** All actions work normally
- **Email NOT verified user:**
  - Tap "Create Event" → Alert appears with "Verify your email to continue"
  - Tap RSVP button → Same alert
  - Tap add friend (contacts, search, suggestions) → Same alert
  - Alert "Verify Email" button → Navigates to `/verify-email` screen

## 5) Assumptions / Uncertainties
- Assumes `session.user.emailVerified` is populated by Better Auth session
- Existing `/verify-email` screen already handles verification flow (6-digit code, resend, recheck)
- Alert UX is minimal; could be upgraded to a modal with better styling if needed
- Did NOT gate chat/messaging — only the requested actions (create event, RSVP, find friend)

## 6) Next Recommended Steps
1. Test on device: create event, RSVP, add friend with an unverified email account
2. Consider adding a banner on home/social screens for unverified users to prompt verification
