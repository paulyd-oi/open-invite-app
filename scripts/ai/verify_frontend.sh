set -euo pipefail

echo "== REPO CONFIRMATION =="
pwd
git remote -v
git branch --show-current
git status --porcelain

echo "== INVARIANTS PRESENT =="
test -f docs/INVARIANTS.md
test -f docs/STATE_OF_THE_APP.md
test -f docs/FINDINGS_LOG.md
test -f docs/HANDOFF_PACKET_LATEST.txt

echo "== FRONTEND INVARIANT CHECK =="
bash scripts/ai/check_invariants_frontend.sh

echo "== TYPECHECK =="
npm run typecheck

echo "PASS: verify_frontend"
