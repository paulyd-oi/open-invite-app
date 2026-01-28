#!/bin/bash
set -euo pipefail

# Frontend Invariant Checker
# Enforces auth contract rules in src/ code

FAIL=0

echo "== FRONTEND INVARIANT CHECK =="

# Invariant 1: AUTH_CONTRACT.md must exist
echo "Checking: docs/AUTH_CONTRACT.md exists..."
if [ ! -f "docs/AUTH_CONTRACT.md" ]; then
  echo "FAIL: docs/AUTH_CONTRACT.md does not exist"
  FAIL=1
else
  echo "  ✓ docs/AUTH_CONTRACT.md exists"
fi

# Invariant 2: No enabled gating using !!session / Boolean(session) / enabled: session
# Only check src/ (runtime code), exclude node_modules, docs, etc.
echo "Checking: No !!session gating in src/..."

# Pattern: enabled: !!session, enabled: Boolean(session), enabled: session (but not bootStatus)
BAD_SESSION_PATTERNS='enabled:\s*!!\s*session|enabled:\s*Boolean\s*\(\s*session\s*\)|enabled:\s*session[^A-Za-z]'

SESSION_VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" -E "$BAD_SESSION_PATTERNS" src/ 2>/dev/null || true)

if [ -n "$SESSION_VIOLATIONS" ]; then
  echo "FAIL: Found !!session / Boolean(session) / enabled: session gating in src/"
  echo "  These should use: enabled: bootStatus === 'authed'"
  echo ""
  echo "$SESSION_VIOLATIONS" | while read -r line; do
    echo "  $line"
  done
  FAIL=1
else
  echo "  ✓ No !!session gating found"
fi

# Invariant 3: No uppercase Cookie header keys in src/
# Pattern: "Cookie" or 'Cookie' as header key (case sensitive for Cookie, COOKIE)
echo "Checking: No uppercase Cookie headers in src/..."

# Look for "Cookie": or 'Cookie': patterns (header assignment)
# Also check for headers.Cookie or headers["Cookie"]
COOKIE_VIOLATIONS=$(grep -rn --include="*.ts" --include="*.tsx" -E '"Cookie"\s*:|'"'"'Cookie'"'"'\s*:|headers\.Cookie|headers\["Cookie"\]|"COOKIE"\s*:|headers\["COOKIE"\]' src/ 2>/dev/null || true)

if [ -n "$COOKIE_VIOLATIONS" ]; then
  echo "FAIL: Found uppercase 'Cookie' header keys in src/"
  echo "  These should use lowercase: 'cookie'"
  echo ""
  echo "$COOKIE_VIOLATIONS" | while read -r line; do
    echo "  $line"
  done
  FAIL=1
else
  echo "  ✓ No uppercase Cookie headers found"
fi

# Invariant 4: No global guidance keys without userId scoping
echo "Checking: Guidance keys are user-scoped..."

# Pattern: Look for FIRST_OPEN_KEY or GUIDANCE_PREFIX without userId context
# This is a lightweight check - we look for the old pattern names
GLOBAL_GUIDANCE=$(grep -rn --include="*.ts" --include="*.tsx" -E 'FIRST_OPEN_KEY|THIRTY_MINUTES_MS.*guidance|guidance.*THIRTY_MINUTES' src/ 2>/dev/null || true)

if [ -n "$GLOBAL_GUIDANCE" ]; then
  echo "FAIL: Found time-based or global guidance patterns in src/"
  echo "  Guidance must use per-user-id keys (see docs/INVARIANTS.md)"
  echo ""
  echo "$GLOBAL_GUIDANCE" | while read -r line; do
    echo "  $line"
  done
  FAIL=1
else
  echo "  ✓ No global guidance patterns found"
fi

# Summary
echo ""
if [ $FAIL -eq 0 ]; then
  echo "== INVARIANT CHECK PASSED =="
  exit 0
else
  echo "== INVARIANT CHECK FAILED =="
  echo "See docs/AUTH_CONTRACT.md for the correct patterns."
  exit 1
fi
