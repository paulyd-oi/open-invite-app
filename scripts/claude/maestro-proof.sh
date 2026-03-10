#!/usr/bin/env bash
set -euo pipefail

FLOW_NAME="${1:-smoke-launch}"
ROOT_DIR="${ROOT_DIR:-$PWD}"
FLOW_DIR="$ROOT_DIR/.maestro/openinvite"
ARTIFACT_DIR="$ROOT_DIR/.claude_artifacts/maestro"
REPORT_DIR="$ARTIFACT_DIR/reports"
SCREENSHOT_DIR="$ARTIFACT_DIR/screenshots/$FLOW_NAME"
RUNS_DIR="$ARTIFACT_DIR/runs"
mkdir -p "$REPORT_DIR" "$SCREENSHOT_DIR" "$RUNS_DIR"

FLOW_PATH="$FLOW_DIR/${FLOW_NAME}.yaml"

if [ ! -f "$FLOW_PATH" ]; then
  echo "Flow not found: $FLOW_PATH"
  echo "Available flows:"
  ls -1 "$FLOW_DIR" | sed 's/\.yaml$//'
  exit 1
fi

echo "Running Maestro flow: $FLOW_PATH"
maestro test "$FLOW_PATH" --test-output-dir "$ARTIFACT_DIR" --format junit --output "$REPORT_DIR/${FLOW_NAME}.xml"

LATEST_RUN="$(find "$ARTIFACT_DIR" -maxdepth 1 -type d -name '20*' | sort | tail -n 1 || true)"
if [ -n "${LATEST_RUN:-}" ] && [ -d "$LATEST_RUN" ]; then
  if [ -d "$LATEST_RUN/screenshots" ]; then
    find "$LATEST_RUN/screenshots" -maxdepth 1 -type f -name '*.png' -exec cp {} "$SCREENSHOT_DIR/" \;
  fi
  mv "$LATEST_RUN" "$RUNS_DIR/" 2>/dev/null || true
fi

echo "Report:"
echo "$REPORT_DIR/${FLOW_NAME}.xml"
echo "Screenshots:"
find "$SCREENSHOT_DIR" -maxdepth 1 -type f -name '*.png' | sort || true
