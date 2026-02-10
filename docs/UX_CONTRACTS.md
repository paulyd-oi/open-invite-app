OPEN INVITE — UX CONTRACTS (SSOT)
Version: 1.1
Purpose:

Centralize all UX truth rules that must not regress.

When a bug repeats, the missing contract goes here.

All contracts are phrased as observable user outcomes, not implementation details.

GENERAL RULES (NON-NEGOTIABLE)

Outcome > implementation. A fix is only “done” when acceptance checks pass in the UI (device when relevant).

No silent degradation. If something fails, UI must communicate clearly and recover safely.

Privacy is default-safe. If in doubt, mask rather than leak.

No “friend-only” visibility unless explicitly required. Open Invite is social; non-friends still exist in flows.

UI behavior must be deterministic. The same interaction must produce the same visible outcome across sessions.

DEVICE-ONLY REALITIES

Push registration, restore purchases, some deep links, and some entitlement refresh behaviors must be validated on a physical device.

Simulator passing is not proof for these categories.

Device-only flows must explicitly declare TestFlight validation steps.

THEME CONTRACTS

Dark mode must not rely on translucent or alpha backgrounds that reduce legibility.

Badge pills must remain readable in both themes; prefer solid fills in dark mode.

If theme tokens exist, use them. Otherwise define explicit dark-mode fallback constants.

Contrast failures are UX regressions.

USER ROW (PEOPLE LIST) CONTRACT — SSOT

All people list surfaces MUST use the shared UserRow component unless explicitly justified.

A people row is defined as any list item representing a user, member, or attendee.

Row layout invariants:

Always horizontal: avatar → text column → optional accessory

Avatar must not vertically stack above text

Layout must be enforced inside UserRow, not caller styles

Text contract:

Roster/navigation lists:
primary = display name

Picker/selection lists:
primary = @handle
secondary = bio (if present, single-line truncation)

Spacing contract:

Rows must appear compact and scannable — never card-like unless explicitly designed as cards.

Chevron/navigation affordances:

Push-navigation lists MAY show chevrons.

Bottom sheets MUST NOT show chevrons.

Sheets are modal contexts, not navigation surfaces.

Accessory contract:

Right accessories (trash, checkbox, host pill, etc.) must not break row alignment.

Accessory taps must not trigger the row’s primary press.

Pressed feedback must be visually consistent and not alter layout.

Any regression where rows stack vertically or change density is a P0 layout violation.

BOTTOM SHEET CONTRACT

Bottom sheet lists are modal interaction surfaces, not navigation lists.

Therefore:

No chevrons

No implied navigation affordances

Compact rows matching UserRow density

Avatar + text alignment must mirror main list surfaces

Sheets must feel like lightweight overlays, not full-screen list clones.

PRESSABLE / INTERACTION CONTRACT

Interactive rows must visibly respond to press state.

Press feedback must:

never shift layout

never stack content

remain legible in both themes

Any interaction feedback that alters structure instead of styling is a regression.

BADGES + ENTITLEMENTS CONTRACT

Lifetime Pro equals Pro privileges. Duration is metadata, not a tier distinction.

Pro gating must use the shared Pro entitlement source of truth.

If Pro is true and UI shows locked Pro content, this is a P0 entitlement/refresh regression.

Badge visibility must be consistent across themes and list surfaces.

ATTENDEE VISIBILITY CONTRACT

If a user can view an event, they can view the attendee list.

Friend status affects relationship UI, not presence visibility.

Only explicit privacy modes may restrict attendee information.

CIRCLES SWIPE + LIST UI CONTRACT

Swipe affordances must be visually consistent across all list types.

Destructive actions must show a clear visual affordance before triggering.

Notification pills must never be clipped or hidden by swipe motion.

HEADER + COPY CONTRACT

Headers and key labels must come from a single source of truth.

No hard-coded strings that can drift from reality.

User-facing copy must always reflect actual system state.

ADMIN UNLOCK CONTRACT

Hidden unlock gestures must provide immediate feedback:

haptic OR toast OR visual confirmation

If disabled in production, the instruction must not remain visible.

RESTORE PURCHASE CONTRACT

Restore flow must show:

loading state

success confirmation

categorized failure messaging

On success:

entitlements invalidate

subscription state refreshes

UI updates immediately

Any delay or stale UI is a regression.

ICON PICKER CONTRACT (EMOJI UX)

Emoji input must resolve to exactly one emoji.

No duplicate emoji artifacts.

UI must guide invalid input instead of surprising the user.

Placeholder emoji must never override intentional user input.

ADDING NEW CONTRACTS

If a bug repeats, the missing rule belongs here.

Contracts must describe observable user outcomes, not internal implementation.

This file defines UX law. Regressions are violations of contract, not stylistic preference.

END OF FILE