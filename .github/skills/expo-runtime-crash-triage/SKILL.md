---
name: expo-runtime-crash-triage
description: Systematic loop for fixing Expo/React Native runtime crashes without dependency changes.
---

# Expo Runtime Crash Triage Playbook

## Goal
Stabilize the app by resolving runtime crashes with minimal diffs and no dependency changes.

## Standard workflow
1) Identify the crash source file + line from the stack trace.
2) Determine whether the crash is:
   - undefined component rendered in JSX (common: `type.displayName`)
   - missing import/export mismatch (default vs named)
   - undefined object property access
3) Prefer fixing at the lowest, most reusable layer:
   - If crash repeats from multiple callers, harden the shared component.

## `type.displayName` specific
This usually means React received `undefined` where it expected a component:
- `<Icon />` where Icon is undefined
- `<SomeComponent />` where import is wrong (named vs default)
Fix patterns:
- Correct import/export mismatch
- Add runtime guard: `Icon ? <Icon .../> : null`
- Provide safe fallback component
- Ensure callers don’t pass undefined

## Validation
- Ensure TypeScript compiles.
- Restart Metro with cache clear if needed.

## Mandatory output
Always end with HANDOFF PACKET (see guardrails skill).
