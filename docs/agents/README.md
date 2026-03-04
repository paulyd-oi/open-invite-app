# Open Invite — Multi-Agent Dev System

## Overview

This document describes how we use Claude CLI to run parallel development tasks
on the Open Invite repo. It defines how work is split into agents, how file
ownership is tracked, and what "done" means before a task is considered complete.

---

## Running Tasks with Claude CLI

Each task is issued as a standalone prompt to Claude CLI. Tasks should be:

- Self-contained: all context and constraints stated in the prompt
- Minimal-diff: do not refactor beyond the stated goal
- Verifiable: every task ends with a required verification block

Example invocation pattern:

  claude --print "$(cat docs/agents/TASK_TEMPLATES.md | sed -n '/SINGLE ISSUE/,/END TEMPLATE/p')"

Or interactively: paste the filled template into the Claude Code session.

---

## How We Split Work Into Agents

### Parallelism Rule

Two agents MAY run in parallel only if their hotspot sets do not overlap.
See HOTSPOTS.md for the registry and claim procedure.

### Agent Labels

Use labels [AGENT_A], [AGENT_B], etc. One label per concurrent agent session.
Labels are ephemeral and scoped to the current work batch. Reset between batches.

### Recommended Split Patterns

1. Frontend + Backend split
   Agent A owns src/app/ and src/components/
   Agent B owns backend/src/routes/ and backend/src/

2. Screen split
   Agent A owns one tab screen (e.g., friends.tsx, add-friends.tsx)
   Agent B owns a different screen (e.g., social.tsx, calendar.tsx)

3. Docs + Code split
   Agent A writes code changes
   Agent B writes/updates docs and specs (safe: zero overlap with code)

### What Can Never Be Parallelized

- package.json (scripts section) — only one agent may touch at a time
- shared/contracts.ts — single writer at a time
- backend/src/server.ts and backend/src/index.ts — single writer (route mount parity)
- scripts/doctor.mjs — single writer
- app.json — single writer

---

## Hotspot Claim Procedure

Before starting a task, claim your hotspots:

1. Open docs/agents/HOTSPOTS.md
2. Add your agent label and the file paths you will touch
3. Confirm no other agent has claimed those paths

After the task is merged/committed:

1. Remove your claim from HOTSPOTS.md
2. Add the files to the RECENTLY_FREED section with the commit SHA

---

## Definition of "Done"

A task is done when ALL of the following are true:

1. npm run typecheck exits 0
2. npm run lint exits 0 (zero errors; warnings allowed)
3. npm run doctor sections A and B pass (iOS parity)
4. npm run proofpack output reviewed and looks clean
5. Commit message follows convention: "type: short description"
6. No new dependencies added (package.json devDeps and deps unchanged)
7. No app runtime behavior changed beyond the stated fix
8. Handoff packet produced in chat output (not committed to repo)
9. HOTSPOTS.md claim removed

---

## Commit Message Convention

  type: short description (50 chars max for subject)

Types: fix, feat, chore, docs, refactor, test, perf

Examples:
  fix: null-safe friend card on offline load
  feat: add friend streak milestone badges
  chore: bump ios to 1.0.6 (255)
  docs: add agent workflow README

---

## Escalation Path

If an agent produces a failing typecheck or lint error:
1. Do not commit
2. Fix in the same session
3. Re-run proofpack before committing

If an agent is uncertain about a file's ownership:
1. Check HOTSPOTS.md
2. If unclaimed, claim it before touching it
3. If claimed by another agent, halt and coordinate

---

## Tech Immutables (Never Violate)

- Expo SDK 53, React Native 0.76+, Expo Router — no architecture changes
- Icon system: src/ui/icons.tsx using Ionicons via ion(). No lucide-react-native in new code.
- No new npm dependencies without explicit approval
- All secrets via EAS env vars; never in source files
- Route mount parity: new backend routes go in BOTH server.ts and index.ts
