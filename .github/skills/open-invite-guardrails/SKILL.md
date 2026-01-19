---
name: open-invite-guardrails
description: Guardrails + workflow for Open Invite (Expo frontend + Render backend). Use for all coding tasks in this repo.
---

# Open Invite Agent Guardrails

## Non-negotiables
- Work ONLY in the currently opened repository unless the user explicitly says to switch.
- Default scope: Expo frontend repo. Do NOT modify backend unless explicitly asked.
- Avoid EAS builds unless explicitly requested. Prefer local dev runs to validate fixes.

## Edit discipline
- Make minimal, surgical diffs.
- Prefer defensive runtime guards over whack-a-mole fixes when crashes repeat (e.g., undefined icon components).

## After EVERY task: produce a HANDOFF PACKET
HANDOFF PACKET
1) Summary (max 6 bullets)
2) Files changed (exact paths)
3) Key diffs (relevant hunks only)
4) Runtime status:
   - command(s) to run
   - expected behavior
5) Assumptions / uncertainties
