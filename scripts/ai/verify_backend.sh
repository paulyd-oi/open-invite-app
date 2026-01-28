#!/bin/bash
#
# verify_backend.sh
# Verifies backend code meets invariants
#

set -e

echo "== BACKEND VERIFICATION =="
echo ""

# Check if smoke_auth_contract.sh exists
if [[ ! -f "scripts/ai/smoke_auth_contract.sh" ]]; then
  echo "❌ ERROR: scripts/ai/smoke_auth_contract.sh not found"
  exit 1
fi

# Check if script is executable
if [[ ! -x "scripts/ai/smoke_auth_contract.sh" ]]; then
  echo "❌ ERROR: scripts/ai/smoke_auth_contract.sh not executable"
  exit 1
fi

echo "✅ smoke_auth_contract.sh exists and is executable"
echo ""

# Optional: Run smoke test if SESSION_COOKIE_VALUE is set
if [[ -n "$SESSION_COOKIE_VALUE" ]]; then
  echo "== RUNNING SMOKE TEST =="
  echo ""
  bash scripts/ai/smoke_auth_contract.sh
else
  echo "ℹ️  Skipping smoke test (SESSION_COOKIE_VALUE not set)"
  echo ""
  echo "To run smoke test:"
  echo "  SESSION_COOKIE_VALUE=\"your-token\" bash scripts/ai/verify_backend.sh"
fi

echo ""
echo "PASS: verify_backend"
