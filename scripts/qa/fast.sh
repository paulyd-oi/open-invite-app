#!/usr/bin/env bash
# scripts/qa/fast.sh
# Fast dev gate: typecheck only (no lint, no tests)
# Usage: ./scripts/qa/fast.sh

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# REPO GUARDRAILS
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

if [[ ! -f "package.json" ]] || [[ ! -d "src" ]]; then
  echo "ERROR: Must run from open-invite-app root" >&2
  exit 1
fi

ORIGIN=$(git remote get-url origin 2>/dev/null || echo "")
if [[ "$ORIGIN" != *"open-invite-app"* ]]; then
  echo "ERROR: Wrong repo. Expected open-invite-app, got: $ORIGIN" >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# TYPECHECK
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo " TYPECHECK"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

npm run typecheck

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo " DONE"
echo "═══════════════════════════════════════════════════════════════════════════"
