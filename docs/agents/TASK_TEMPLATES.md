# Open Invite — Agent Task Templates

Copy one template, fill in the bracketed fields, and paste into a Claude Code session.

---

## TEMPLATE 1: Single Issue Stabilization Task

TITLE
[Short title, e.g.: Fix null crash on FriendCard when friend.email is undefined]

REPO
open-invite-app. Verify with: pwd + git remote -v.

GOAL
[One sentence describing the exact bug or regression to fix.]

ROOT CAUSE (if known)
[Describe the root cause, or write "unknown — investigate first".]

FILE(S) TO CHANGE
[List the exact files expected to change. Claim these in HOTSPOTS.md before starting.]

CONSTRAINTS
- Minimal diff. No refactors beyond the fix.
- No new dependencies.
- Preserve existing navigation architecture.
- No app behavior changes beyond fixing the stated issue.
- Icon system: src/ui/icons.tsx (Ionicons via ion()). No lucide.
- No backend route changes unless explicitly stated.

REQUIRED VERIFICATION
Run and paste output of:
  npm run typecheck
  npm run lint (confirm 0 errors)
  npm run proofpack

DELIVERABLE
Plain text handoff in chat. Include:
- Root cause confirmed
- Files changed + why
- git show --stat HEAD
- git show --name-only HEAD
- proofpack output tail

COMMIT MESSAGE
fix: [short description]

---

## TEMPLATE 2: Blast-Radius Sweep Task

TITLE
[Short title, e.g.: Audit null safety across all friend-related screens]

REPO
open-invite-app. Verify with: pwd + git remote -v.

GOAL
[Describe the sweep: what to find, what to fix, what to leave alone.]

SCOPE (files in play)
[List the screens/components/hooks to audit. Claim all in HOTSPOTS.md.]

OUT OF SCOPE
[List what NOT to touch, e.g.: "do not refactor non-null-related code".]

SWEEP PATTERN
[Describe the grep/search to run first. Example:]
  grep -rn "\.email\b\|\.name\b\|\.id\b" src/app/friends.tsx src/components/FriendCard.tsx

CONSTRAINTS
- Minimal diff. Only add null guards where actually needed.
- No new dependencies.
- No refactors. No style cleanups.
- Each fix must be independently justifiable.

REQUIRED VERIFICATION
  npm run typecheck
  npm run lint (confirm 0 errors)
  npm run proofpack

DELIVERABLE
Plain text handoff. Include:
- List of every null guard added (file:line, before, after)
- Any issues found but intentionally skipped (with reason)
- git show --stat HEAD
- git show --name-only HEAD

COMMIT MESSAGE
fix: [short description of sweep scope]

---

## TEMPLATE 3: Doctor Improvement Task

TITLE
[Short title, e.g.: Doctor V2 — add PostHog env check]

REPO
open-invite-app. Verify with: pwd + git remote -v.

GOAL
Add a new check to scripts/doctor.mjs per the spec in docs/doctor/DOCTOR_V2_SPEC.md.
The check to implement: [paste the specific check from the spec].

SPEC REFERENCE
docs/doctor/DOCTOR_V2_SPEC.md, section: [section name]

CONSTRAINTS
- Only touch: scripts/doctor.mjs (and package.json if a new script is needed)
- Do not change app runtime code.
- New check must exit 0 on pass, exit 1 only if marked "required" in spec.
- Warnings must use the warn() helper; failures must use fail().
- New check must print a clear fix message when it fails.
- Do not add new npm dependencies.

REQUIRED VERIFICATION
  npm run typecheck
  npm run doctor
  npm run proofpack

EXPECTED DOCTOR OUTPUT
[Paste what the new check should print on success, e.g.:]
  Section G) PostHog config
    PASS  EXPO_PUBLIC_POSTHOG_KEY is set
    PASS  EXPO_PUBLIC_POSTHOG_HOST is set

DELIVERABLE
Plain text handoff. Include:
- The exact section added to doctor.mjs
- npm run doctor full output
- git show --stat HEAD

COMMIT MESSAGE
chore: doctor — add [check name] check
