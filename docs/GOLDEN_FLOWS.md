OPEN INVITE — GOLDEN FLOWS (SSOT)
Version: 1.0
Purpose:

Define the “user truth” for critical behaviors.

Prevent code-only proofs from passing when UX outcome is wrong.

Every fix must reference (or add) a Golden Flow.

RULES

Golden flows are outcome specs, not implementation.

Each flow includes device acceptance checks (simulator is not sufficient for push/purchases/etc).

When a bug is fixed, update the relevant flow if it clarifies expected behavior.

One Claude task may touch ONE Golden Flow at a time.

────────────────────────────────────────────
TEMPLATE (COPY THIS FOR EACH NEW FLOW)
────────────────────────────────────────────
FLOW ID:
TITLE:
OWNER INTENT (why this exists):

SCOPE:

Screens:

Entry points:

Roles:

Data types:

GOLDEN PATH (happy path):
1)
2)
3)

EDGE CASES:

Case:
Expected:

Case:
Expected:

VISIBILITY RULES:

What is visible to whom:

What must be masked:

What must never be shown:

ACCEPTANCE CHECKS (MUST PASS ON DEVICE WHEN RELEVANT):
1)
2)
3)

REPRO NOTES (if known):

Device vs simulator differences:

Known timing/race conditions:

Related logs/tags:

RELATED FILES (if known, optional):

frontend:

backend:

────────────────────────────────────────────
P0 FLOWS (STARTER SET)
────────────────────────────────────────────

FLOW ID: P0-AUTH-BOOT-001
TITLE: BootRouter routes correctly without flicker or bad redirects
OWNER INTENT: No white loading screen, no loops, no network calls when logged out.

SCOPE:

Screens: app launch, login, authed shell

Entry points: cold start, warm start, account switch

Roles: loggedOut, authed, onboarding, degraded

GOLDEN PATH:

Cold start -> app shows splash -> resolves boot status.

If authed -> lands in authed shell (no redirect loops).

If loggedOut/error -> router.replace('/login') and no authed queries run.

EDGE CASES:

Network offline:
Expected: degraded path, no destructive logout, UI explains offline.

401 from session:
Expected: triggers SSOT logout, returns to /login using replace.

ACCEPTANCE CHECKS:

Cold start loggedOut: lands on /login, no authed API spam.

Cold start authed: lands on main tab, no flicker between routes.

Toggle airplane mode: app does not hard logout; shows offline UX.

RELATED LOG TAGS:

[AUTH_TRACE]

[PUSH_BOOTSTRAP]

[NET_GATE] (if present)

FLOW ID: P0-EVENT-VISIBILITY-001
TITLE: “Who’s Coming” and attendee visibility
OWNER INTENT: Users can see who is coming, regardless of friend status, unless event privacy forbids it.

SCOPE:

Screens: Event Details, Circle Event Details, Social feed event details

Entry points: open event, circle-only event, invited event

Roles: host, invited attendee, non-friend attendee, viewer

VISIBILITY RULES:

If viewer is allowed to view event details, they can see attendee list (including non-friends).

Friend-only restrictions should NOT hide attendees unless explicitly required by privacy policy.

Busy/private masking rules override attendee visibility only if the event itself is masked.

ACCEPTANCE CHECKS:

On device, open event with mixed friend + non-friend attendees: viewer sees full attendee list.

Host sees full list always (except if backend denies due to access).

Busy/private event: viewer sees masked UX (no attendee leakage) per busy/private rules.

FLOW ID: P0-BADGES-UI-001
TITLE: Badges render correctly in light/dark and reflect entitlement truth
OWNER INTENT: Badges look premium and match user’s Pro/Lifetime status (no false locks).

VISIBILITY RULES:

OG badge: readable in dark mode. No translucent/low-contrast background in dark.

Pro/Lifetime entitlements: Lifetime Pro == Pro privileges. UI must not lock Pro trio for valid Pro.

Locked state only when combinedIsPro is false for Pro-only badges.

ACCEPTANCE CHECKS:

Dark mode: OG badge background is solid, readable, no muddy translucency.

Pro lifetime account: Pro trio badges are unlocked (or “earned” if rules require).

Switching accounts: badges update without stale/incorrect lock state.

FLOW ID: P0-PUSH-PERMISSIONS-001
TITLE: Push registration does not crash and respects permission state
OWNER INTENT: No crashes; correct behavior for undetermined/denied/granted.

ACCEPTANCE CHECKS:

Permission undetermined: app does not crash; registration skips with clear log.

Permission granted: token registers once per user (throttled).

Account switch: token registration re-evaluates for new user.

FLOW ID: P0-PURCHASE-RESTORE-001
TITLE: Restore purchases succeeds for Lifetime Pro
OWNER INTENT: Lifetime customers can always recover access.

ACCEPTANCE CHECKS (DEVICE):

Restore purchases results in combinedIsPro=true for lifetime user.

UI updates immediately after restore (no stale lock).

Errors are actionable (network vs RC vs backend mismatch) and do not silently fail.

END OF FILE