#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-shot}"
LABEL="${2:-screen}"
DEVICE_NAME="${DEVICE_NAMEz-iPhone 16 Pro}"
APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.vibecode.openinvite.0qi5wk}"
ROOT_DIR="${ROOT_DIR:-$PWD}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/.claude_artifacts/screens}"
mkdir -p "$OUT_DIR"

BOOTED_ID="$(xcrun simctl list devices | sed -n 's/.*(\([A-Fa-f0-9-]\{36\}\)) (Booted).*/\1/p' | head -n 1)"
TARGET_ID="${BOOTED_ID:-}"

if [ -z "$TARGET_ID" ]; then
  TARGET_ID="$(xcrun simctl list devices available | grep -m1 "${DEVICE_NAME} (" | sed -E 's/.*\(([A-Fa-f0-9-]{36})\).*/\1/')"
fi

if [ -z "${TARGET_ID:-}" ]; then
  echo "Could not find simulator: $DEVICE_NAME"
  exit 1
fi

boot_sim() {
  open -a Simulator >/dev/null 2>&1 || true
  xcrun simctl boot "$TARGET_ID" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$TARGET_ID" -b
}

launch_app() {
  xcrun simctl launch "$TARGET_ID" "$APP_BUNDLE_ID" >/dev/null
}

take_shot() {
  local ts path
  ts="$(date +%Y%m%d-%H%M%S)"
  path="$OUT_DIR/${ts}-${LABEL}.png"
  xcrun simctl io "$TARGET_ID" screenshot "$path" >/dev/null
  echo "$path"
}

case "$ACTION" in
  boot)
    boot_sim
    ;;
  launch)
    boot_sim
    launch_app
    ;;
  shot)
    boot_sim
    launch_app
    take_shot
    ;;
  screen-shot)
    boot_sim
    take_shot
    ;;
  relaunch-shot)
    boot_sim
    xcrun simctl terminate "$TARGET_ID" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true
    launch_app
    take_shot
    ;;
  *)
    echo "Usage: $0 [boot|launch|shot|screen-shot|relaunch-shot] [label]"
    exit 1
    ;;
esac
