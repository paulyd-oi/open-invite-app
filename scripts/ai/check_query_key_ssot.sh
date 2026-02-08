#!/usr/bin/env bash
# Query Key SSOT Guardrail Check
# Prevents hand-typed query keys from being reintroduced for events/circles
# Exit 1 if violations found

set -euo pipefail

VIOLATIONS_FOUND=0

echo "Checking: Query key SSOT compliance..."

# Pattern 1: queryKey: ["events" (excludes registry)
EVENTS_KEYS=$(rg -n 'queryKey:\s*\["events"' src/ \
  --glob '!**/eventQueryKeys.ts' \
  --type ts --type tsx 2>/dev/null || true)

if [ -n "$EVENTS_KEYS" ]; then
  echo "  ✗ FAIL: Hand-typed event query keys found (use eventKeys.* builders)"
  echo "$EVENTS_KEYS" | while IFS= read -r line; do
    echo "    $line"
  done
  VIOLATIONS_FOUND=1
fi

# Pattern 2: queryKey: ["circles" (excludes registry)
CIRCLES_KEYS=$(rg -n 'queryKey:\s*\["circles"' src/ \
  --glob '!**/circleQueryKeys.ts' \
  --type ts --type tsx 2>/dev/null || true)

if [ -n "$CIRCLES_KEYS" ]; then
  echo "  ✗ FAIL: Hand-typed circles query keys found (use circleKeys.* builders)"
  echo "$CIRCLES_KEYS" | while IFS= read -r line; do
    echo "    $line"
  done
  VIOLATIONS_FOUND=1
fi

# Pattern 3: invalidateQueries({ queryKey: ["events"] (wildcard invalidation)
EVENTS_WILDCARD=$(rg -n 'invalidateQueries\(\{\s*queryKey:\s*\["events"\]' src/ \
  --glob '!**/eventQueryKeys.ts' \
  --type ts --type tsx 2>/dev/null || true)

if [ -n "$EVENTS_WILDCARD" ]; then
  echo "  ✗ FAIL: Wildcard event invalidation found (use eventKeys.feed/calendar/etc)"
  echo "$EVENTS_WILDCARD" | while IFS= read -r line; do
    echo "    $line"
  done
  VIOLATIONS_FOUND=1
fi

# Pattern 4: ["circle", (not ["circles"]) anywhere in query operations
# This catches the old prefix-landmine ["circle", id] pattern
CIRCLE_SINGULAR=$(rg -n '\["circle",\s*' src/ \
  --glob '!**/circleQueryKeys.ts' \
  --type ts --type tsx 2>/dev/null || true)

if [ -n "$CIRCLE_SINGULAR" ]; then
  echo "  ✗ FAIL: Prefix-landmine [\"circle\", id] pattern found (use circleKeys.single)"
  echo "$CIRCLE_SINGULAR" | while IFS= read -r line; do
    echo "    $line"
  done
  VIOLATIONS_FOUND=1
fi

if [ $VIOLATIONS_FOUND -eq 0 ]; then
  echo "  ✓ Query key SSOT compliance OK"
else
  echo ""
  echo "REMEDY:"
  echo "  - Use eventKeys.* builders from src/lib/eventQueryKeys.ts"
  echo "  - Use circleKeys.* builders from src/lib/circleQueryKeys.ts"
  echo "  - Never hand-type [\"events\", ...] or [\"circles\", ...] query keys"
  exit 1
fi
