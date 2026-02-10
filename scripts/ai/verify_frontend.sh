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

echo "== QUERY KEY SSOT CHECK =="
bash scripts/ai/check_query_key_ssot.sh

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

# =========================================================================
# P14 — Invariant Enforcement (static scans, no deps, no ESLint)
# =========================================================================
echo "== P14 ENFORCEMENT =="

# --- Part 1: Network Gate — useQuery must include enabled: guard ----------
# Scan: grep 60 lines after each useQuery({ and flag blocks with no `enabled`.
# Allowlist: known pre-existing debt (admin.tsx legacy).
P14_QUERY_ALLOWLIST="src/app/admin\.tsx:56"

P14_UNGATED=$(grep -rn --include="*.tsx" --include="*.ts" -A60 "useQuery({" src/ 2>/dev/null \
  | grep -v node_modules \
  | awk '
    /useQuery\(\{/ {
      if (block && !has_en) print saved_loc
      block = 1; has_en = 0; saved_loc = $0
    }
    block && /enabled/ { has_en = 1 }
    /^--$/ {
      if (block && !has_en) print saved_loc
      block = 0
    }
    END { if (block && !has_en) print saved_loc }
  ' \
  | grep -v -E "$P14_QUERY_ALLOWLIST" || true)

if [ -n "$P14_UNGATED" ]; then
  echo "❌ P14 FAIL — useQuery missing enabled auth/network gate"
  echo "$P14_UNGATED"
  exit 1
else
  echo "  ✓ P14 Part 1: All useQuery blocks have enabled: guard"
fi

# --- Part 2: Navigation Invariant — no router.push('/login') -------------
P14_PUSH_LOGIN=$(grep -rn --include="*.tsx" --include="*.ts" \
  "router\.push.*['\"/]login" src/ 2>/dev/null \
  | grep -v node_modules || true)

if [ -n "$P14_PUSH_LOGIN" ]; then
  echo "❌ P14 FAIL — router.push('/login') violates logout invariant"
  echo "$P14_PUSH_LOGIN"
  exit 1
else
  echo "  ✓ P14 Part 2: No router.push('/login') — replace-only invariant holds"
fi

# --- Part 3: UI Primitive Drift — Pressable + inline backgroundColor hex --
# Flag only when <Pressable and backgroundColor with hex literal appear within
# 5 lines of each other in the same file (signals inline CTA styling).
P14_CTA_DRIFT=$(find src/app/ src/components/ \( -name "*.tsx" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" -print0 2>/dev/null \
  | xargs -0 awk '
    FNR == 1 { delete pr; delete bg; pc = 0; bc = 0 }
    /<Pressable/  { pr[pc++] = FNR }
    /backgroundColor.*["'"'"']#[0-9A-Fa-f]/ { bg[bc++] = FNR }
    END {
      for (p = 0; p < pc; p++)
        for (b = 0; b < bc; b++) {
          d = bg[b] - pr[p]
          if (d >= 0 && d <= 5)
            printf "%s: Pressable@L%d + inline backgroundColor@L%d\n", FILENAME, pr[p], bg[b]
        }
    }
  ' 2>/dev/null || true)

if [ -n "$P14_CTA_DRIFT" ]; then
  echo "❌ P14 FAIL — inline CTA styling detected, use Button/Chip primitive"
  echo "$P14_CTA_DRIFT"
  exit 1
else
  echo "  ✓ P14 Part 3: No inline CTA styling drift detected"
fi

# --- Part 4: Motion Token — no literal pressed-opacity values -------------
# Detect: opacity in pressed callback using a literal decimal instead of
# PRESS_OPACITY token. Scope: only pressed-state contexts.
# Allowlist: ui/motion.ts (token definition) and ui/ primitives that import it.
P14_PRESSED_OPACITY=$(grep -rn --include="*.tsx" --include="*.ts" \
  'pressed.*opacity.*0\.\|\.pressed.*opacity.*0\.' src/ 2>/dev/null \
  | grep -v node_modules \
  | grep -v "motion\.ts" \
  | grep -v "PRESS_OPACITY" \
  | grep -v "src/ui/" || true)

if [ -n "$P14_PRESSED_OPACITY" ]; then
  echo "❌ P14 FAIL — animation literal detected, use motion.ts tokens"
  echo "$P14_PRESSED_OPACITY"
  exit 1
else
  echo "  ✓ P14 Part 4: No literal pressed-opacity values outside motion.ts"
fi

echo ""
echo "P14 enforcement checks PASS"

# ── P17 enforcement: dev route lockdown ──────────────────────────────
echo ""
echo "Running P17 enforcement checks…"

# Part 1: Banned dev/debug/demo filenames in src/app
P17_BANNED_FILES=$(find src/app -maxdepth 2 -type f \( \
  -name "design-showcase*" -o \
  -name "showcase*" -o \
  -name "dev-*" -o \
  -name "demo*" -o \
  -name "smoke*" -o \
  -name "test-harness*" \
\) 2>/dev/null || true)

if [ -n "$P17_BANNED_FILES" ]; then
  echo "❌ P17 FAIL — banned dev/demo route files found in src/app:"
  echo "$P17_BANNED_FILES"
  exit 1
else
  echo "  ✓ P17 Part 1: No banned dev/demo route files"
fi

# Part 2: Banned dev/debug/demo directories in src/app
P17_BANNED_DIRS=$(find src/app -maxdepth 2 -type d \( \
  -name "debug" -o \
  -name "demo" -o \
  -name "showcase" -o \
  -name "dev" \
\) 2>/dev/null || true)

if [ -n "$P17_BANNED_DIRS" ]; then
  echo "❌ P17 FAIL — banned dev/demo route directories found in src/app:"
  echo "$P17_BANNED_DIRS"
  exit 1
else
  echo "  ✓ P17 Part 2: No banned dev/demo route directories"
fi

echo ""
echo "P17 enforcement checks PASS"

echo "PASS: verify_frontend"
