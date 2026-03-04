# Doctor V2 Spec — Open Invite

This document specifies every check that Doctor V2 should implement.
Checks are organized into lettered sections (continuing from Doctor V1 A-F).
Each check states whether it is REQUIRED (failure exits 1) or WARNING (prints
but does not fail). Each check includes the exact evidence/log doctor should
print on pass and on fail.

Doctor V1 covers sections A through F. Doctor V2 starts at section G.
Do not implement V2 checks until explicitly instructed. This file is a planning
document only.

---

## Phased Rollout Plan

Phase 1 (implement first): G, H
  These are fast, local, no-network checks. Safe to add immediately.
  They extend existing env-var and config validation.

Phase 2 (implement second): I, J
  These require spawning a child process or reading a compile artifact.
  Add after Phase 1 is stable in CI.

Phase 3 (implement third): K, L
  These require network access and a running dev server or staging URL.
  Add only when running doctor in a CI environment that has network.
  These must be WARNINGS in local dev mode, REQUIRED in CI mode.
  Doctor should accept a --ci flag to promote warnings to failures.

Each phase is a separate commit. Do not bundle phases.

---

## Section G: Expo Config Parity (REQUIRED)

Goal: confirm that key fields in app.json match what the native projects expect.

Already partially implemented in V1 (sections A, B). V2 adds:

G1. Check that expo.scheme in app.json matches CFBundleURLSchemes in
    ios/OpenInvite/Info.plist.
    Pass print:  "expo.scheme 'open-invite' matches CFBundleURLSchemes"
    Fail print:  "MISMATCH: app.json scheme=[x] vs Info.plist CFBundleURLSchemes=[y]"
                 "Fix: sync scheme in app.json expo.scheme with CFBundleURLSchemes"
    Exit on fail: 1

G2. Check that expo.ios.bundleIdentifier in app.json matches
    CFBundleIdentifier in ios/OpenInvite/Info.plist. Note: the plist
    may use $(PRODUCT_BUNDLE_IDENTIFIER) — if so, skip and print WARNING.
    Pass print:  "bundleIdentifier matches (or uses Xcode variable — skipped)"
    Fail print:  "MISMATCH: app.json bundleIdentifier=[x] vs plist literal=[y]"
    Exit on fail: 1

---

## Section H: Environment Variable Completeness (WARNING)

Goal: warn about missing env vars that are required for production features.
Never print values, only presence.

H1. Check for each of the following env vars (process.env OR .env file):
    EXPO_PUBLIC_SENTRY_DSN
    EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY
    EXPO_PUBLIC_API_URL
    EXPO_PUBLIC_BETTER_AUTH_URL

    Already checked in V1: EXPO_PUBLIC_POSTHOG_KEY, EXPO_PUBLIC_POSTHOG_HOST

    Pass print:  "[VAR_NAME] is set"
    Warn print:  "WARNING: [VAR_NAME] is NOT set (needed for [feature])"
    Exit on fail: 0 (warning only)

H2. Check that EXPO_PUBLIC_API_URL does NOT end with a trailing slash.
    Trailing slashes cause double-slash URL bugs (known issue).
    Pass print:  "EXPO_PUBLIC_API_URL has no trailing slash"
    Warn print:  "WARNING: EXPO_PUBLIC_API_URL ends with '/' — this causes double-slash API bugs"
    Exit on fail: 0 (warning only)

---

## Section I: TypeScript Strict Mode Check (REQUIRED)

Goal: confirm tsconfig.frontend.json has strict mode enabled (or equivalent).

I1. Read tsconfig.frontend.json (and any extended config it references).
    Confirm "strict": true OR all of:
      "strictNullChecks": true
      "noImplicitAny": true
    Pass print:  "TypeScript strict mode is enabled"
    Fail print:  "strict mode not found in tsconfig — add 'strict': true"
    Exit on fail: 1

Note: V1 already runs tsc --noEmit. This check is a static config read,
not a compile. It should run BEFORE the tsc invocation.

---

## Section J: iOS Version Bump Guard (REQUIRED)

Goal: refuse to proceed if ios.buildNumber in app.json has already been used
in a recent git commit (prevents accidental duplicate build numbers).

J1. Read ios.buildNumber from app.json.
    Run: git log --oneline -20 -- app.json
    Search commit messages for "bump ios" or "buildNumber" containing the
    same number.
    Pass print:  "buildNumber [N] not seen in last 20 commits — looks fresh"
    Warn print:  "WARNING: buildNumber [N] was used in commit [SHA] '[msg]'"
                 "If intentional (e.g. re-running after a failed build), ignore."
    Exit on fail: 0 (warning only — engineer must decide)

---

## Section K: Backend Health Check (WARNING in local, REQUIRED in CI)

Goal: verify that the backend API is reachable and healthy.

K1. Read EXPO_PUBLIC_API_URL (or BACKEND_URL) from env or .env.
    If not set, skip and warn.
    GET [url]/health with a 5-second timeout.
    Pass print:  "Backend health check passed: [url]/health -> 200"
    Fail print:  "WARNING: Backend at [url]/health returned [status] or timed out"
    Exit on fail: 0 in local mode, 1 with --ci flag

K2. GET [url]/api/events/public/[test_id] is NOT needed here — /health is enough.

---

## Section L: Auth Session Smoke Test (WARNING in local, REQUIRED in CI)

Goal: verify that a test session token can be minted by the backend.
This requires a CI_TEST_EMAIL and CI_TEST_PASSWORD env var.
If those are not set, skip entirely with INFO print.

L1. Check presence of CI_TEST_EMAIL and CI_TEST_PASSWORD.
    If absent: print "Auth smoke test skipped — CI_TEST_EMAIL/PASSWORD not set"
    If present:
      POST [url]/api/auth/sign-in/email with test credentials.
      Expect 200 and a session token in response.
      Pass print:  "Auth smoke test passed — session token received"
      Fail print:  "Auth smoke test FAILED — [status] [error body truncated to 100 chars]"
    Exit on fail: 0 in local mode, 1 with --ci flag

---

## Implementation Notes for Future Agent

1. Add each phase as a separate commit: "chore: doctor — add section G checks"
2. Use the existing helpers in doctor.mjs: pass(), warn(), fail(), run(), readFile(), plistValue()
3. Add a --ci flag parser at the top of doctor.mjs using process.argv
4. Phase 3 checks (K, L) must time out gracefully — never hang the script
5. Network checks must be wrapped in try/catch; any unexpected error is a WARNING not a FAIL
6. Do not change sections A-F behavior when adding G+
7. Each new section must print a clear divider line matching existing format

---

## Evidence Checklist (what doctor must print for each check)

For every check, doctor must print exactly:
  On pass:  "  PASS  [description]"  (two spaces, then PASS, then description)
  On warn:  "  WARN  [description]"  (two spaces, then WARN, then description)
  On fail:  "  FAIL  [description]"  (two spaces, then FAIL, then description)
            "         Fix: [one-line actionable fix message]"

This format is machine-parseable for future CI integration.
