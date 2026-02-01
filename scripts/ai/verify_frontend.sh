set -euo pipefail

echo "== REPO CONFIRMATION =="
pwd
git remote -v
git branch --show-current
git status --porcelain

echo "== INVARIANTS PRESENT =="
test -f docs/INVARIANTS.md
test -f docs/STATE_OF_THE_APP.md
test -f docs/FINDINGS_LOG.md
test -f docs/HANDOFF_PACKET_LATEST.txt

echo "== FRONTEND INVARIANT CHECK =="
bash scripts/ai/check_invariants_frontend.sh

echo "== ROGUE FETCH PATTERN CHECK =="
# Check for direct fetch() calls to /api/* that should use authClient.$fetch
# Allowlist: /api/health, /api/email-verification/*, /api/auth/forget-password (pre-auth endpoints)

# Pattern: fetch( followed by template literal or string concat with /api/
# Exclude: /api/health, /api/email-verification, /api/auth/forget-password
ROGUE_FETCH=$(grep -rn --include="*.ts" --include="*.tsx" -E 'fetch\(`?\$\{.*\}\/api\/|fetch\(.*\+\s*["'"'"']\/api\/' src/ 2>/dev/null | grep -v -E '/api/health|/api/email-verification|/api/auth/forget-password|/api/auth/sign|/api/auth/apple|\.bak:' || true)

if [ -n "$ROGUE_FETCH" ]; then
  echo "WARN: Found potential rogue fetch patterns for /api/* endpoints:"
  echo "  (Should use authClient.\$fetch for authenticated endpoints)"
  echo ""
  echo "$ROGUE_FETCH" | while read -r line; do
    echo "  $line"
  done
  # Note: This is a warning, not a failure - some may be legitimate
  echo ""
  echo "  ^ Review above - if endpoint requires auth, migrate to authClient.\$fetch"
else
  echo "  ✓ No rogue fetch patterns found for authenticated endpoints"
fi

echo "== AUTH HEADER FALLBACK CHECK =="
# Verify x-oi-session-token header injection exists in authClient.ts
if grep -q 'x-oi-session-token' src/lib/authClient.ts 2>/dev/null; then
  echo "  ✓ x-oi-session-token header injection found in authClient.ts"
else
  echo "FAIL: x-oi-session-token header injection NOT found in authClient.ts"
  exit 1
fi

# Verify OI_SESSION_TOKEN_KEY constant exists
if grep -q 'OI_SESSION_TOKEN_KEY' src/lib/authClient.ts 2>/dev/null; then
  echo "  ✓ OI_SESSION_TOKEN_KEY constant found in authClient.ts"
else
  echo "FAIL: OI_SESSION_TOKEN_KEY constant NOT found in authClient.ts"
  exit 1
fi

echo "== TYPECHECK =="
npm run typecheck

echo "PASS: verify_frontend"
