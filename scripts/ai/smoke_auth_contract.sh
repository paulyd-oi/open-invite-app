#!/bin/bash
#
# smoke_auth_contract.sh
# Smoke test to verify AUTH_CONTRACT compliance
#
# Usage:
#   SESSION_COOKIE_VALUE="abc123..." scripts/ai/smoke_auth_contract.sh
#   SESSION_COOKIE_VALUE="__Secure-better-auth.session_token=abc123..." scripts/ai/smoke_auth_contract.sh
#
# Tests:
#   Proof A: Unauthed endpoint returns 200 without cookie
#   Proof B: Authed endpoint returns 200 with cookie
#   Proof C: Authed endpoint returns 401 without cookie
#

set -e

API_BASE_URL="${API_BASE_URL:-https://api.open-invite.com}"

# Normalize SESSION_COOKIE_VALUE to extract raw token
if [[ -z "$SESSION_COOKIE_VALUE" ]]; then
  echo "❌ ERROR: SESSION_COOKIE_VALUE not set"
  echo ""
  echo "Usage:"
  echo "  SESSION_COOKIE_VALUE=\"abc123...\" $0"
  echo "  SESSION_COOKIE_VALUE=\"__Secure-better-auth.session_token=abc123...\" $0"
  exit 1
fi

# Extract raw token (handle both forms)
if [[ "$SESSION_COOKIE_VALUE" == *"__Secure-better-auth.session_token="* ]]; then
  # Full cookie pair: extract value after '='
  RAW_TOKEN="${SESSION_COOKIE_VALUE#*=}"
else
  # Raw token only
  RAW_TOKEN="$SESSION_COOKIE_VALUE"
fi

# Construct cookie header (React Native format with leading '; ')
COOKIE_HEADER="; __Secure-better-auth.session_token=${RAW_TOKEN}"

echo "=========================================="
echo "AUTH CONTRACT SMOKE TEST"
echo "=========================================="
echo "API: $API_BASE_URL"
echo "Token: ${RAW_TOKEN:0:20}..."
echo ""

# Proof A: Unauthed endpoint returns 200 without cookie
echo "🧪 Proof A: Unauthed endpoint (no cookie)"
RESPONSE_A=$(curl -s -w "\n__HTTP_CODE__:%{http_code}" "$API_BASE_URL/api/health" || echo "__HTTP_CODE__:000")
HTTP_CODE_A=$(printf '%s' "$RESPONSE_A" | awk -F: '/^__HTTP_CODE__:/ {print $2}')
BODY_A=$(printf '%s' "$RESPONSE_A" | sed '/^__HTTP_CODE__:/d')

if [[ "$HTTP_CODE_A" == "200" ]]; then
  echo "✅ PASS: /api/health returned 200"
else
  echo "❌ FAIL: /api/health returned $HTTP_CODE_A (expected 200)"
  echo "Response: $BODY_A"
  exit 1
fi
echo ""

# Proof B: Authed endpoint returns 200 with cookie
echo "🧪 Proof B: Authed endpoint (with cookie)"
RESPONSE_B=$(curl -s -w "\n__HTTP_CODE__:%{http_code}" \
  -H "cookie: $COOKIE_HEADER" \
  "$API_BASE_URL/api/badges/catalog" || echo "__HTTP_CODE__:000")
HTTP_CODE_B=$(printf '%s' "$RESPONSE_B" | awk -F: '/^__HTTP_CODE__:/ {print $2}')
BODY_B=$(printf '%s' "$RESPONSE_B" | sed '/^__HTTP_CODE__:/d')

if [[ "$HTTP_CODE_B" == "200" ]]; then
  # Extract count from JSON (expects {"badges": [...], "count": 9})
  COUNT=$(echo "$BODY_B" | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "0")
  if [[ "$COUNT" -ge 9 ]]; then
    echo "✅ PASS: /api/badges/catalog returned 200 with count=$COUNT"
  else
    echo "⚠️  WARN: /api/badges/catalog returned 200 but count=$COUNT (expected >=9)"
  fi
else
  echo "❌ FAIL: /api/badges/catalog returned $HTTP_CODE_B (expected 200)"
  echo "Response: $BODY_B"
  echo ""
  echo "Debug info:"
  echo "  Cookie header: cookie: ; __Secure-better-auth.session_token=${RAW_TOKEN:0:8}...[REDACTED]"
  echo "  Token length: ${#RAW_TOKEN}"
  exit 1
fi
echo ""

# Proof C: Authed endpoint returns 401 without cookie
echo "🧪 Proof C: Authed endpoint (no cookie)"
RESPONSE_C=$(curl -s -w "\n__HTTP_CODE__:%{http_code}" \
  "$API_BASE_URL/api/badges/catalog" || echo "__HTTP_CODE__:000")
HTTP_CODE_C=$(printf '%s' "$RESPONSE_C" | awk -F: '/^__HTTP_CODE__:/ {print $2}')
BODY_C=$(printf '%s' "$RESPONSE_C" | sed '/^__HTTP_CODE__:/d')

if [[ "$HTTP_CODE_C" == "401" ]]; then
  echo "✅ PASS: /api/badges/catalog returned 401 without cookie"
else
  echo "❌ FAIL: /api/badges/catalog returned $HTTP_CODE_C (expected 401)"
  echo "Response: $BODY_C"
  exit 1
fi
echo ""

echo "=========================================="
echo "✅ ALL TESTS PASSED"
echo "=========================================="
echo "AUTH_CONTRACT verified:"
echo "  ✓ Unauthed endpoints work without cookie"
echo "  ✓ Authed endpoints work with cookie"
echo "  ✓ Authed endpoints reject without cookie"
