#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$PWD}"
MAESTRO_DIR="$ROOT_DIR/.maestro"
FLOW_DIR="$MAESTRO_DIR/openinvite"
ARTIFACT_DIR="$ROOT_DIR/.claude_artifacts/maestro"

mkdir -p "$FLOW_DIR"
mkdir -p "$ARTIFACT_DIR"
mkdir -p "$ROOT_DIR/scripts/claude"

echo "[1/6] Checking Java..."
if ! command -v java >/dev/null 2>&1; then
  echo "Java is not installed. Maestro CLI requires Java 17+."
  exit 1
fi

JAVA_VERSION_RAW="$(java -version 2>&1 | head -n 1)"
echo "Java: $JAVA_VERSION_RAW"

echo "[2/6] Checking Maestro CLI..."
if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro CLI not found."
  echo "Install with ONE of these:"
  echo '  curl -fsSL "https://get.maestro.mobile.dev" | bash'
  echo '  OR'
  echo '  brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro'
  exit 1
fi

echo "[3/6] Maestro version..."
maestro --version || true

echo "[4/6] Writing Maestro config + flows..."

cat > "$FLOW_DIR/_env.yaml" <<'YAML'
appId: com.vibecode.openinvite.0qi5wk
---
YAML

cat > "$FLOW_DIR/smoke-launch.yaml" <<'YAML'
appId: com.vibecode.openinvite.0qi5wk
---
- launchApp
- takeScreenshot: openinvite-smoke-launch
YAML

cat > "$FLOW_DIR/discover-events.yaml" <<'YAML'
appId: com.vibecode.openinvite.0qi5wk
---
- launchApp
- tapOn:
    text: "Events"
    optional: true
- takeScreenshot: openinvite-discover-events
YAML

cat > "$FLOW_DIR/saved-tab.yaml" <<'YAML'
appId: com.vibecode.openinvite.0qi5wk
---
- launchApp
- tapOn:
    text: "Saved"
    optional: true
- takeScreenshot: openinvite-saved-tab
YAML

cat > "$FLOW_DIR/event-detail-placeholder.yaml" <<'YAML'
appId: com.vibecode.openinvite.0qi5wk
---
- launchApp
- takeScreenshot: openinvite-event-detail-placeholder
YAML

echo "[5/6] Writing Claude wrapper..."
cat > "$ROOT_DIR/scripts/claude/maestro-proof.sh" <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

FLOW_NAME="${1:-smoke-launch}"
ROOT_DIR="${ROOT_DIR:-$PWD}"
FLOW_DIR="$ROOT_DIR/.maestro/openinvite"
ARTIFACT_DIR="$ROOT_DIR/.claude_artifacts/maestro"
mkdir -p "$ARTIFACT_DIR"

FLOW_PATH="$FLOW_DIR/${FLOW_NAME}.yaml"

if [ ! -f "$FLOW_PATH" ]; then
  echo "Flow not found: $FLOW_PATH"
  echo "Available flows:"
  ls -1 "$FLOW_DIR" | sed 's/\.yaml$//'
  exit 1
fi

echo "Running Maestro flow: $FLOW_PATH"
maestro test "$FLOW_PATH" --format junit --output "$ARTIFACT_DIR/${FLOW_NAME}.xml"

echo "Artifacts directory:"
echo "$ARTIFACT_DIR"
BASH

chmod +x "$ROOT_DIR/scripts/claude/maestro-proof.sh"

echo "[6/6] Done."
echo
echo "Next commands:"
echo "  maestro studio"
echo "  ./scripts/claude/maestro-proof.sh smoke-launch"
echo "  ./scripts/claude/maestro-proof.sh discover-events"
echo "  ./scripts/claude/maestro-proof.sh saved-tab"
