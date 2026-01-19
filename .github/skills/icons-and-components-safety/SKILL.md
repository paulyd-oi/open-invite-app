---
name: icon-system-consistency
description: Prevent icon-related runtime crashes and keep icons consistent with existing project patterns.
---

# Icon System Consistency

## Rule
Do NOT introduce new icon libraries. Use existing project icon exports/wrappers.

## Workflow
1) If an icon crashes (`type.displayName`), verify the import exists and matches export type (named vs default).
2) Prefer a single source of truth (project icon wrapper or `@expo/vector-icons` if already used in the repo).
3) If an icon is optional/dynamic, add a guard:
   - `Icon ? <Icon .../> : null`
4) If many files are broken, do a repo-wide sweep:
   - Find JSX tags for icons
   - Verify all are imported and defined

## Mandatory output
Always end with HANDOFF PACKET.
