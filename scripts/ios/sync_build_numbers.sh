#!/usr/bin/env bash
# sync_build_numbers.sh
# Reads expo.ios.buildNumber from app.json and updates
# CURRENT_PROJECT_VERSION in the Xcode project for both the
# main app and widget extension targets (Debug + Release).
# No dependencies beyond python3 (ships with macOS).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PBXPROJ="$REPO_ROOT/ios/OpenInvite.xcodeproj/project.pbxproj"
APP_JSON="$REPO_ROOT/app.json"

if [ ! -f "$APP_JSON" ]; then
  echo "ERROR: app.json not found at $APP_JSON"
  exit 1
fi

if [ ! -f "$PBXPROJ" ]; then
  echo "ERROR: project.pbxproj not found at $PBXPROJ"
  exit 1
fi

BUILD_NUM=$(python3 -c "
import json, sys
with open('$APP_JSON') as f:
    d = json.load(f)
bn = d.get('expo', {}).get('ios', {}).get('buildNumber')
if not bn:
    print('ERROR: expo.ios.buildNumber not set in app.json', file=sys.stderr)
    sys.exit(1)
print(bn)
")

echo "app.json buildNumber = $BUILD_NUM"

# Replace all CURRENT_PROJECT_VERSION = <number>; lines
MATCHES=$(grep -c "CURRENT_PROJECT_VERSION = " "$PBXPROJ" || true)
if [ "$MATCHES" -eq 0 ]; then
  echo "ERROR: no CURRENT_PROJECT_VERSION found in pbxproj"
  exit 1
fi

sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9][0-9]*/CURRENT_PROJECT_VERSION = $BUILD_NUM/g" "$PBXPROJ"

AFTER=$(grep -c "CURRENT_PROJECT_VERSION = $BUILD_NUM" "$PBXPROJ" || true)
echo "Updated $AFTER CURRENT_PROJECT_VERSION entries to $BUILD_NUM"

if [ "$AFTER" -ne "$MATCHES" ]; then
  echo "WARNING: expected $MATCHES replacements but got $AFTER"
  exit 1
fi

echo "Done. App + widget extension build numbers synced to $BUILD_NUM."
