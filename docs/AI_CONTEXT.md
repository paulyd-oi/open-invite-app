# AI_CONTEXT — Open Invite (open-invite-app)

## Purpose
This repository is the Expo + React Native app for Open Invite.

## Tech Immutables (non-negotiable)
- Expo + React Native + Expo Router only
- Do not change navigation architecture unless explicitly tasked
- No new dependencies unless explicitly instructed
- Minimal diffs: smallest change that solves the issue
- Icons are fixed to src/ui/icons.tsx using Ionicons via ion(); no lucide
- TypeScript must pass

## Operating rules
- Prefer resilient UX: avoid hard session gates that strand users on loading screens
- Avoid breaking production parity
- Keep logging informational, not noisy (avoid red error logs for optional endpoints)

## Repo + Release Guardrails
- Confirm you are in the correct repo before changes:
  - Mobile repo: open-invite-app
  - Backend repo: my-app-backend (separate; do not change unless explicitly tasked)
- Do not edit any other similarly named folders.
- Any change intended for production must preserve TestFlight + GitHub + Render parity.
- If you must reference backend routes, do not implement backend changes here; write "BACKEND NEEDED" clearly in the handoff.

## How to run checks
- Typecheck: npm run typecheck
- Lint/tests: only if present and fast; do not add tooling

## Output contract
- All progress and results must be written into docs/HANDOFF_PACKET.md
- A git commit is required at the end of every task
