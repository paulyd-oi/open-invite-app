---
name: handoff-packet
description: Standardized task handoff format required after every agent run.
---

# HANDOFF PACKET (MANDATORY)

Output exactly this structure at the end of every task:

HANDOFF PACKET
1) Summary (max 6 bullets)
2) Files changed (exact paths)
3) Key diffs (only relevant hunks)
4) Runtime status:
   - Commands to run
   - Expected behavior
5) Assumptions / uncertainties
6) Next recommended step (1–2 bullets)
