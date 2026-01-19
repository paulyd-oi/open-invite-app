---
applyTo: "src/**"
---

# Expo Frontend Instructions (src/**)

## Stack
- Expo + React Native + TypeScript
- Expo Router navigation
- Use existing utilities and patterns; minimal diffs preferred.

## Hard rules
- Do NOT change dependencies or add new libraries unless explicitly asked.
- Do NOT edit `ios/` or `android/` or run prebuild unless explicitly asked.
- If a component prop is a React component (icon/component), guard against undefined at runtime.

## Crash policy
For runtime crashes like `undefined is not an object (evaluating 'type.displayName')`:
- Treat as “React received undefined component”
- Fix import/export mismatch OR add a safe runtime guard in shared component
- Prefer central fixes over many call-site hacks.

## Output
After completing any task, output the HANDOFF PACKET.
