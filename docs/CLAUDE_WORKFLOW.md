# Claude Workflow — Open Invite

> Process expectations for any Claude session working on this codebase.

---

## Before Writing Code

1. **Forensics first.** Read the relevant files. Understand current state before proposing changes.
2. **Scope contract.** List expected changed files before starting. Stick to the list unless you find something that must change.
3. **Root cause before fix.** Diagnose why something is broken, not just what is broken. Log the root cause explicitly.

---

## During Implementation

4. **Changed files list.** Maintain an explicit list of every file you modify. Report it at the end.
5. **Contract alignment.** If changing event fields:
   - Prisma schema (`my-app-backend/prisma/schema.prisma`)
   - Backend serializer (`my-app-backend/src/routes/events.ts`)
   - Backend contracts (`my-app-backend/src/shared/contracts.ts`)
   - Frontend contracts (`shared/contracts.ts`)
   - All four must stay in sync.
6. **Backend route parity.** If adding/changing backend routes, register in both `src/index.ts` and `src/server.ts`.
7. **Layout spacing.** Use constants from `src/lib/layoutSpacing.ts`. Do not introduce new magic numbers for bottom padding.
8. **TypeScript check.** Run `npx tsc --noEmit` after changes. Zero errors required.

---

## After Implementation

9. **Proof.** Show that the fix works:
   - TypeScript passes
   - Git diff is clean and minimal
   - Acceptance criteria are addressed
10. **Structured output.** Return:
    - SUMMARY
    - ROOT CAUSE
    - CHANGED FILES
    - IMPLEMENTATION NOTES
    - PROOF
    - RISKS / FOLLOW-UPS

---

## Guardrails

- Do not widen scope. If you find an unrelated bug, note it in RISKS, don't fix it now.
- Do not run `expo prebuild --clean`.
- Do not install new packages without explicit approval.
- Do not edit forbidden files (patches/, babel.config.js, metro.config.js, app.json, tsconfig.json).
- Do not store secrets in source files.
- Prefer editing existing files over creating new ones.
- If unsure about a change's blast radius, audit before committing.
