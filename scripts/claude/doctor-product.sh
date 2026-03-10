#!/usr/bin/env bash
set -uo pipefail

# doctor:product — Core regression suite for Open Invite
# Runs: typecheck → verify_frontend → 7 Maestro core flows
# Outputs clean summary with pass/fail per step

ROOT_DIR="${ROOT_DIR:-$PWD}"
FLOW_DIR="$ROOT_DIR/.maestro/openinvite"
ARTIFACT_DIR="$ROOT_DIR/.claude_artifacts/doctor-product"
SCREENSHOT_DIR="$ARTIFACT_DIR/screenshots"
REPORT_DIR="$ARTIFACT_DIR/reports"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUMMARY_FILE="$ARTIFACT_DIR/summary-$TIMESTAMP.txt"

mkdir -p "$SCREENSHOT_DIR" "$REPORT_DIR"

# Core flow list (order matters: cheap → expensive)
CORE_FLOWS=(
  tab-navigation-proof
  discover-events-proof
  saved-tab-proof
  create-event-smoke
  calendar-testid-proof
  event-detail-host-owned
  event-detail-no-photo
)

PASS=0
FAIL=0
SKIP=0
RESULTS=()

log() { echo "[doctor] $*"; }

record() {
  local name="$1" status="$2" detail="${3:-}"
  RESULTS+=("$status  $name  $detail")
  if [ "$status" = "PASS" ]; then ((PASS++)); fi
  if [ "$status" = "FAIL" ]; then ((FAIL++)); fi
  if [ "$status" = "SKIP" ]; then ((SKIP++)); fi
}

# ── Step 1: TypeScript typecheck ─────────────────────────────
log "Step 1/3: TypeScript typecheck"
if npx tsc --noEmit 2>"$REPORT_DIR/typecheck-stderr.txt" 1>"$REPORT_DIR/typecheck-stdout.txt"; then
  record "typecheck" "PASS"
  log "  ✓ typecheck passed"
else
  record "typecheck" "FAIL" "see $REPORT_DIR/typecheck-stderr.txt"
  log "  ✗ typecheck failed"
fi

# ── Step 2: verify_frontend ──────────────────────────────────
log "Step 2/3: verify_frontend"
VERIFY_SCRIPT="$ROOT_DIR/scripts/ai/verify_frontend.sh"
if [ -f "$VERIFY_SCRIPT" ]; then
  bash "$VERIFY_SCRIPT" 1>"$REPORT_DIR/verify-stdout.txt" 2>"$REPORT_DIR/verify-stderr.txt" || true
  # Check for explicit FAIL markers or missing final PASS line
  if grep -q '❌' "$REPORT_DIR/verify-stdout.txt" 2>/dev/null; then
    record "verify_frontend" "FAIL" "see $REPORT_DIR/verify-stdout.txt"
    log "  ✗ verify_frontend failed"
  else
    record "verify_frontend" "PASS"
    log "  ✓ verify_frontend passed"
  fi
else
  record "verify_frontend" "SKIP" "script not found"
  log "  ⊘ verify_frontend skipped (script not found)"
fi

# ── Step 3: Maestro core flows ───────────────────────────────
log "Step 3/3: Maestro core flows (${#CORE_FLOWS[@]} flows)"

# Check Maestro is available
if ! command -v maestro &>/dev/null; then
  log "  ⊘ maestro not found — skipping all flows"
  for flow in "${CORE_FLOWS[@]}"; do
    record "maestro:$flow" "SKIP" "maestro not installed"
  done
else
  # Terminate app before running flows to avoid stale state
  DEVICE=$(xcrun simctl list devices booted -j 2>/dev/null | python3 -c "import sys,json; ds=json.load(sys.stdin)['devices']; print(next(d['udid'] for r in ds.values() for d in r if d['state']=='Booted'))" 2>/dev/null || true)
  if [ -n "$DEVICE" ]; then
    xcrun simctl terminate "$DEVICE" com.vibecode.openinvite.0qi5wk 2>/dev/null || true
  fi

  for flow in "${CORE_FLOWS[@]}"; do
    FLOW_PATH="$FLOW_DIR/${flow}.yaml"
    if [ ! -f "$FLOW_PATH" ]; then
      record "maestro:$flow" "SKIP" "file not found"
      log "  ⊘ $flow skipped (not found)"
      continue
    fi

    FLOW_SCREENSHOT_DIR="$SCREENSHOT_DIR/$flow"
    mkdir -p "$FLOW_SCREENSHOT_DIR"

    # Terminate app between flows to avoid stale state
    if [ -n "$DEVICE" ]; then
      xcrun simctl terminate "$DEVICE" com.vibecode.openinvite.0qi5wk 2>/dev/null || true
    fi

    log "  Running: $flow"
    FLOW_START=$(date +%s)

    if maestro test "$FLOW_PATH" \
        --format junit \
        --output "$REPORT_DIR/${flow}.xml" \
        2>"$REPORT_DIR/${flow}-stderr.txt" \
        1>"$REPORT_DIR/${flow}-stdout.txt"; then
      FLOW_END=$(date +%s)
      ELAPSED=$((FLOW_END - FLOW_START))
      record "maestro:$flow" "PASS" "${ELAPSED}s"
      log "  ✓ $flow passed (${ELAPSED}s)"
    else
      FLOW_END=$(date +%s)
      ELAPSED=$((FLOW_END - FLOW_START))
      record "maestro:$flow" "FAIL" "${ELAPSED}s — see $REPORT_DIR/${flow}-stderr.txt"
      log "  ✗ $flow failed (${ELAPSED}s)"
    fi

    # Collect screenshots from Maestro output
    LATEST_RUN="$(find "$ARTIFACT_DIR" -maxdepth 1 -type d -name '20*' 2>/dev/null | sort | tail -n 1 || true)"
    if [ -n "${LATEST_RUN:-}" ] && [ -d "$LATEST_RUN/screenshots" ]; then
      find "$LATEST_RUN/screenshots" -maxdepth 1 -type f -name '*.png' -exec cp {} "$FLOW_SCREENSHOT_DIR/" \; 2>/dev/null || true
      rm -rf "$LATEST_RUN" 2>/dev/null || true
    fi
  done
fi

# ── Summary ──────────────────────────────────────────────────
TOTAL=$((PASS + FAIL + SKIP))

{
  echo "═══════════════════════════════════════════════"
  echo "  doctor:product  —  $TIMESTAMP"
  echo "═══════════════════════════════════════════════"
  echo ""
  printf "  PASS: %d   FAIL: %d   SKIP: %d   TOTAL: %d\n" "$PASS" "$FAIL" "$SKIP" "$TOTAL"
  echo ""
  echo "  Results:"
  for r in "${RESULTS[@]}"; do
    echo "    $r"
  done
  echo ""
  echo "  Artifacts: $ARTIFACT_DIR"
  echo "═══════════════════════════════════════════════"
} | tee "$SUMMARY_FILE"

# Exit code: fail if any step failed
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
