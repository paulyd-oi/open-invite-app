---
name: repo-release-guardrails
description: Protect against wrong-repo edits and enforce production parity assumptions.
---

# Repo + Release Guardrails

## Repo correctness
- Confirm current repo name and `git remote -v` at the start of any task that could touch deployment/build.

## Production parity
- Avoid changes that only work locally.
- Do not add routes/config only in one entry point if the project has multiple entry files (ensure parity).

## No silent build triggers
- Do not start EAS builds, submits, or Apple-related changes unless user explicitly requests.

## Mandatory output
Always end with HANDOFF PACKET.
