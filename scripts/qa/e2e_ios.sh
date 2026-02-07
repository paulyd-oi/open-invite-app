#!/usr/bin/env bash
# scripts/qa/e2e_ios.sh
# Manual Detox gate for iOS simulator tests
# Usage: ./scripts/qa/e2e_ios.sh [--build-only|--test-only]

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
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
export DETOX_CONFIGURATION="ios.sim.release"

BUILD_ONLY=false
TEST_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=true ;;
    --test-only)  TEST_ONLY=true ;;
    *)            echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# DETOX BUILD
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$TEST_ONLY" == "false" ]]; then
  echo ""
  echo "═══════════════════════════════════════════════════════════════════════════"
  echo " DETOX BUILD: $DETOX_CONFIGURATION"
  echo "═══════════════════════════════════════════════════════════════════════════"
  echo ""
  
  npx detox build --configuration "$DETOX_CONFIGURATION"
  
  echo ""
  echo "✓ Build complete"
fi

# ─────────────────────────────────────────────────────────────────────────────
# DETOX TEST
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$BUILD_ONLY" == "false" ]]; then
  echo ""
  echo "═══════════════════════════════════════════════════════════════════════════"
  echo " DETOX TEST: $DETOX_CONFIGURATION"
  echo "═══════════════════════════════════════════════════════════════════════════"
  echo ""
  
  npx detox test --configuration "$DETOX_CONFIGURATION"
  
  echo ""
  echo "✓ Tests complete"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo " DONE"
echo "═══════════════════════════════════════════════════════════════════════════"
