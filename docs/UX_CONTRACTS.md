OPEN INVITE — UX CONTRACTS (SSOT)
Version: 1.0
Purpose:

Centralize all “truth rules” that must not regress.

When a bug repeats, the missing contract goes here.

GENERAL RULES (NON-NEGOTIABLE)

Outcome > implementation. A fix is only “done” when the acceptance checks pass in the UI (device when relevant).

No silent degradation. If something fails, UI must communicate clearly and recover safely.

Privacy is default-safe. If in doubt, mask rather than leak.

No “friend-only” visibility unless explicitly required. Open Invite is social; non-friends still exist in flows.

DEVICE-ONLY REALITIES

Push registration, restore purchases, some deep links, and some entitlement refresh behaviors must be validated on a physical device.

Simulator passing is not proof for these categories.

THEME CONTRACTS

Dark mode must not rely on translucent/alpha backgrounds that reduce legibility.

Badge pills must be readable in both themes; prefer solid colors in dark mode.

If theme tokens exist, use them; otherwise define explicit dark-mode fallback constants.

BADGES + ENTITLEMENTS CONTRACT

Lifetime Pro == Pro privileges. “Lifetime” is duration, not a separate tier.

Pro gating must use combinedIsPro (RevenueCat OR backend plan) via the Pro SSOT contract hook (no local computation per screen).

If Pro is true and a Pro badge shows locked, that is a P0 entitlement/refresh/SSOT bug.

ATTENDEE VISIBILITY CONTRACT

If a user can view an event, they can view “Who’s Coming” including non-friends.

Friend status should affect “relationship UI” (add friend button, profile access), not attendee presence.

Only privacy modes (busy/private) can restrict attendee visibility.

CIRCLES SWIPE + LIST UI CONTRACT

Swipe affordances must be visually consistent across list types (Friends list vs Circles list).

Swipe actions must provide an indicator (icon, color block, label) before destructive actions trigger.

Notification badge/pill must not be clipped at any swipe position.

HEADER/COPY CONTRACT

Headers must be generated from a single source of truth (no hard-coded stale strings).

Any on-screen copy that can become incorrect must be centralized and referenced.

ADMIN UNLOCK CONTRACT

If an unlock gesture exists (7 taps), it must provide immediate feedback:

haptic OR toast OR visual indicator

If production disables it, it must fail closed AND explain (or remove the instruction).

RESTORE PURCHASE CONTRACT

Restore action must show:

loading state

success confirmation

failure reason bucket (network vs RevenueCat vs backend mismatch)

On success: invalidate entitlements + subscription and update UI immediately.

ICON PICKER CONTRACT (EMOJI UX)

Emoji input must never create “double emoji” confusion.

If a typed character is replaced by a selected emoji, the input must become exactly one emoji.

Remove “hard-set placeholder emoji” behaviors that fight the user.

If invalid emoji is entered, the UI must guide rather than surprise-pop up.

ADDING NEW CONTRACTS

Whenever a bug repeats more than once, add a contract line here that would have prevented it.

The contract must be phrased as an observable user outcome.

END OF FILE