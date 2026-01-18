#!/usr/bin/env bash
set -euo pipefail

# -----------------------------
# Repo + Release Guardrails
# -----------------------------
echo "=== Repo + Release Guardrails ==="

# Must be run from repo root (where eas.json exists)
if [[ ! -f "eas.json" ]]; then
  echo "❌ eas.json not found. Run this from the repo root."
  echo "   Tip: cd to your repo root and try again."
  exit 1
fi

# Required files sanity check
for f in "package.json" "app.json"; do
  if [[ ! -f "$f" ]]; then
    echo "❌ Required file missing: $f"
    exit 1
  fi
done

echo "✅ Repo root detected: $(pwd)"

# Verify Git remote looks like the correct repo
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "$REMOTE_URL" ]]; then
  echo "❌ No 'origin' remote found. Is this a git repo?"
  exit 1
fi
echo "✅ origin: $REMOTE_URL"

# Must be on main
BRANCH="$(git branch --show-current)"
echo "✅ branch: $BRANCH"
if [[ "$BRANCH" != "main" ]]; then
  echo "❌ Refusing to ship: not on main."
  echo "   Run: git checkout main && git pull origin main"
  exit 1
fi

# Working tree must be clean
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree not clean. Commit or stash your changes first."
  git status --porcelain
  exit 1
fi
echo "✅ working tree clean"

# Must be pushed (no local commits not on origin/main)
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"
echo "✅ local HEAD:  $LOCAL_SHA"
echo "✅ origin/main: $REMOTE_SHA"
if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
  echo "❌ Local main differs from origin/main."
  echo "   Run: git push origin main"
  exit 1
fi
echo "✅ main is pushed and in sync"

# Show what we're shipping
echo "=== Shipping commit ==="
git log -1 --oneline

echo "=== Starting EAS build (iOS production, auto-submit) ==="
eas build --platform ios --profile production --auto-submit
