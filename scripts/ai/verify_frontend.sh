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

echo "== QUERY KEY SSOT CHECK =="
bash scripts/ai/check_query_key_ssot.sh

echo "== ROGUE FETCH PATTERN CHECK =="
# Check for direct fetch() calls to /api/* that should use authClient.$fetch
# Allowlist: /api/health, /api/email-verification/*, /api/auth/forget-password (pre-auth endpoints)

# Pattern: fetch( followed by template literal or string concat with /api/
# Exclude: /api/health, /api/email-verification, /api/auth/forget-password
ROGUE_FETCH=$(grep -rn --include="*.ts" --include="*.tsx" -E 'fetch\(`?\$\{.*\}\/api\/|fetch\(.*\+\s*["'"'"']\/api\/' src/ 2>/dev/null | grep -v -E '/api/health|/api/email-verification|/api/auth/forget-password|/api/auth/sign|/api/auth/apple|\.bak:' || true)

if [ -n "$ROGUE_FETCH" ]; then
  echo "WARN: Found potential rogue fetch patterns for /api/* endpoints:"
  echo "  (Should use authClient.\$fetch for authenticated endpoints)"
  echo ""
  echo "$ROGUE_FETCH" | while read -r line; do
    echo "  $line"
  done
  # Note: This is a warning, not a failure - some may be legitimate
  echo ""
  echo "  ^ Review above - if endpoint requires auth, migrate to authClient.\$fetch"
else
  echo "  ✓ No rogue fetch patterns found for authenticated endpoints"
fi

echo "== AUTH HEADER FALLBACK CHECK =="
# Verify x-oi-session-token header injection exists in authClient.ts
if grep -q 'x-oi-session-token' src/lib/authClient.ts 2>/dev/null; then
  echo "  ✓ x-oi-session-token header injection found in authClient.ts"
else
  echo "FAIL: x-oi-session-token header injection NOT found in authClient.ts"
  exit 1
fi

# Verify OI_SESSION_TOKEN_KEY constant exists
if grep -q 'OI_SESSION_TOKEN_KEY' src/lib/authClient.ts 2>/dev/null; then
  echo "  ✓ OI_SESSION_TOKEN_KEY constant found in authClient.ts"
else
  echo "FAIL: OI_SESSION_TOKEN_KEY constant NOT found in authClient.ts"
  exit 1
fi

echo "== TYPECHECK =="
npm run typecheck

# =========================================================================
# P14 — Invariant Enforcement (static scans, no deps, no ESLint)
# =========================================================================
echo "== P14 ENFORCEMENT =="

# --- Part 1: Network Gate — useQuery must include enabled: guard ----------
# Scan: grep 60 lines after each useQuery({ and flag blocks with no `enabled`.
# Allowlist: known pre-existing debt (admin.tsx legacy).
P14_QUERY_ALLOWLIST="src/app/admin\.tsx:56"

P14_UNGATED=$(grep -rn --include="*.tsx" --include="*.ts" -A60 "useQuery({" src/ 2>/dev/null \
  | grep -v node_modules \
  | awk '
    /useQuery\(\{/ {
      if (block && !has_en) print saved_loc
      block = 1; has_en = 0; saved_loc = $0
    }
    block && /enabled/ { has_en = 1 }
    /^--$/ {
      if (block && !has_en) print saved_loc
      block = 0
    }
    END { if (block && !has_en) print saved_loc }
  ' \
  | grep -v -E "$P14_QUERY_ALLOWLIST" || true)

if [ -n "$P14_UNGATED" ]; then
  echo "❌ P14 FAIL — useQuery missing enabled auth/network gate"
  echo "$P14_UNGATED"
  exit 1
else
  echo "  ✓ P14 Part 1: All useQuery blocks have enabled: guard"
fi

# --- Part 2: Navigation Invariant — no router.push('/login') -------------
P14_PUSH_LOGIN=$(grep -rn --include="*.tsx" --include="*.ts" \
  "router\.push.*['\"/]login" src/ 2>/dev/null \
  | grep -v node_modules || true)

if [ -n "$P14_PUSH_LOGIN" ]; then
  echo "❌ P14 FAIL — router.push('/login') violates logout invariant"
  echo "$P14_PUSH_LOGIN"
  exit 1
else
  echo "  ✓ P14 Part 2: No router.push('/login') — replace-only invariant holds"
fi

# --- Part 3: UI Primitive Drift — Pressable + inline backgroundColor hex --
# Flag only when <Pressable and backgroundColor with hex literal appear within
# 5 lines of each other in the same file (signals inline CTA styling).
P14_CTA_DRIFT=$(find src/app/ src/components/ \( -name "*.tsx" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" -print0 2>/dev/null \
  | xargs -0 awk '
    FNR == 1 { delete pr; delete bg; pc = 0; bc = 0 }
    /<Pressable/  { pr[pc++] = FNR }
    /backgroundColor.*["'"'"']#[0-9A-Fa-f]/ { bg[bc++] = FNR }
    END {
      for (p = 0; p < pc; p++)
        for (b = 0; b < bc; b++) {
          d = bg[b] - pr[p]
          if (d >= 0 && d <= 5)
            printf "%s: Pressable@L%d + inline backgroundColor@L%d\n", FILENAME, pr[p], bg[b]
        }
    }
  ' 2>/dev/null || true)

if [ -n "$P14_CTA_DRIFT" ]; then
  echo "❌ P14 FAIL — inline CTA styling detected, use Button/Chip primitive"
  echo "$P14_CTA_DRIFT"
  exit 1
else
  echo "  ✓ P14 Part 3: No inline CTA styling drift detected"
fi

# --- Part 4: Motion Token — no literal pressed-opacity values -------------
# Detect: opacity in pressed callback using a literal decimal instead of
# PRESS_OPACITY token. Scope: only pressed-state contexts.
# Allowlist: ui/motion.ts (token definition) and ui/ primitives that import it.
P14_PRESSED_OPACITY=$(grep -rn --include="*.tsx" --include="*.ts" \
  'pressed.*opacity.*0\.\|\.pressed.*opacity.*0\.' src/ 2>/dev/null \
  | grep -v node_modules \
  | grep -v "motion\.ts" \
  | grep -v "PRESS_OPACITY" \
  | grep -v "src/ui/" || true)

if [ -n "$P14_PRESSED_OPACITY" ]; then
  echo "❌ P14 FAIL — animation literal detected, use motion.ts tokens"
  echo "$P14_PRESSED_OPACITY"
  exit 1
else
  echo "  ✓ P14 Part 4: No literal pressed-opacity values outside motion.ts"
fi

echo ""
echo "P14 enforcement checks PASS"

# ── P17 enforcement: dev route lockdown ──────────────────────────────
echo ""
echo "Running P17 enforcement checks…"

# Part 1: Banned dev/debug/demo filenames in src/app
P17_BANNED_FILES=$(find src/app -maxdepth 2 -type f \( \
  -name "design-showcase*" -o \
  -name "showcase*" -o \
  -name "dev-*" -o \
  -name "demo*" -o \
  -name "smoke*" -o \
  -name "test-harness*" \
\) 2>/dev/null || true)

if [ -n "$P17_BANNED_FILES" ]; then
  echo "❌ P17 FAIL — banned dev/demo route files found in src/app:"
  echo "$P17_BANNED_FILES"
  exit 1
else
  echo "  ✓ P17 Part 1: No banned dev/demo route files"
fi

# Part 2: Banned dev/debug/demo directories in src/app
P17_BANNED_DIRS=$(find src/app -maxdepth 2 -type d \( \
  -name "debug" -o \
  -name "demo" -o \
  -name "showcase" -o \
  -name "dev" \
\) 2>/dev/null || true)

if [ -n "$P17_BANNED_DIRS" ]; then
  echo "❌ P17 FAIL — banned dev/demo route directories found in src/app:"
  echo "$P17_BANNED_DIRS"
  exit 1
else
  echo "  ✓ P17 Part 2: No banned dev/demo route directories"
fi

echo ""
echo "P17 enforcement checks PASS"

# ── P0_MEDIA_IDENTITY_AVATAR_SSOT enforcement ───────────────────────
echo ""
echo "Running P0_MEDIA_IDENTITY_AVATAR_SSOT checks…"

P0_FAIL=0

# --- 4A) ZERO-TOLERANCE strict files: NO raw <Image allowed at all -----------
# These files should only render identity avatars via EntityAvatar.
STRICT_FILES=(
  src/components/UserListRow.tsx
  src/components/BottomNavigation.tsx
  src/components/FriendCard.tsx
  src/components/MutualFriends.tsx
  src/components/SocialProof.tsx
  src/components/CircleCard.tsx
  src/components/FeedCalendar.tsx
  src/app/friends.tsx
  src/app/discover.tsx
)

for sf in "${STRICT_FILES[@]}"; do
  if [ ! -f "$sf" ]; then continue; fi
  HITS=$(grep -n '<Image' "$sf" 2>/dev/null | grep -v 'ImagePlus\|ImageIcon\|ImageBackground' || true)
  if [ -n "$HITS" ]; then
    echo "❌ P0_MEDIA_IDENTITY FAIL — $sf contains raw <Image (use EntityAvatar):"
    echo "$HITS"
    P0_FAIL=1
  fi
done

if [ "$P0_FAIL" -eq 0 ]; then
  echo "  ✓ P0_MEDIA_IDENTITY Part 1: Zero-tolerance strict files have no raw <Image"
fi

# --- 4B-i) social.tsx — allow content (eventPhotoUrl) but fail on identity ----
SOCIAL_IDENTITY=$(grep -n '<Image' src/app/social.tsx 2>/dev/null \
  | grep -v 'ImagePlus\|ImageIcon\|ImageBackground' \
  | grep -iv 'eventPhoto\|coverPhoto\|bannerUri\|eventImage' \
  | grep -i 'user\.image\|avatar\|attendee\|member\|host\|profile' || true)
if [ -n "$SOCIAL_IDENTITY" ]; then
  echo "❌ P0_MEDIA_IDENTITY FAIL — social.tsx identity avatar uses raw <Image:"
  echo "$SOCIAL_IDENTITY"
  P0_FAIL=1
else
  echo "  ✓ P0_MEDIA_IDENTITY Part 2: social.tsx — no identity-avatar raw <Image"
fi

# --- 4B-ii) circle/[id].tsx — allow content but fail on identity avatars ------
CIRCLE_IDENTITY=$(grep -n '<Image' "src/app/circle/[id].tsx" 2>/dev/null \
  | grep -v 'ImagePlus\|ImageIcon\|ImageBackground' \
  | grep -i 'user\.image\|avatar\|attendee\|member\|host\|profile' || true)
if [ -n "$CIRCLE_IDENTITY" ]; then
  echo "❌ P0_MEDIA_IDENTITY FAIL — circle/[id].tsx identity avatar uses raw <Image:"
  echo "$CIRCLE_IDENTITY"
  P0_FAIL=1
else
  echo "  ✓ P0_MEDIA_IDENTITY Part 3: circle/[id].tsx — no identity-avatar raw <Image"
fi

# --- 4B-iii) event/[id].tsx — allow content but fail on identity avatars ------
EVENT_IDENTITY=$(grep -n '<Image' "src/app/event/[id].tsx" 2>/dev/null \
  | grep -v 'ImagePlus\|ImageIcon\|ImageBackground' \
  | grep -i 'user\.image\|avatar\|attendee\|member\|host\|profile\.image' || true)
if [ -n "$EVENT_IDENTITY" ]; then
  echo "❌ P0_MEDIA_IDENTITY FAIL — event/[id].tsx identity avatar uses raw <Image:"
  echo "$EVENT_IDENTITY"
  P0_FAIL=1
else
  echo "  ✓ P0_MEDIA_IDENTITY Part 4: event/[id].tsx — no identity-avatar raw <Image"
fi

# --- 4B-iv) EventPhotoGallery.tsx — allow gallery photos, fail on uploader avatars
EPG_IDENTITY=$(grep -n '<Image' src/components/EventPhotoGallery.tsx 2>/dev/null \
  | grep -v 'ImagePlus\|ImageIcon\|ImageBackground' \
  | grep -i 'uploader\|avatar\|user\.image' || true)
if [ -n "$EPG_IDENTITY" ]; then
  echo "❌ P0_MEDIA_IDENTITY FAIL — EventPhotoGallery.tsx uploader avatar uses raw <Image:"
  echo "$EPG_IDENTITY"
  P0_FAIL=1
else
  echo "  ✓ P0_MEDIA_IDENTITY Part 5: EventPhotoGallery.tsx — no uploader-avatar raw <Image"
fi

# --- 4B-v) Event Hero SSOT: when event has photo, HeroBannerSurface + resolveBannerUri required
#     EventPhotoEmoji is allowed ONLY in the no-photo fallback path.
EVENT_FILE="src/app/event/[id].tsx"
P6_FAIL=0

# 6a) HeroBannerSurface must be imported/used
if ! grep -q 'HeroBannerSurface' "$EVENT_FILE" 2>/dev/null; then
  echo "❌ P0_MEDIA_IDENTITY FAIL — event/[id].tsx missing HeroBannerSurface (required for event hero when photo exists)"
  P6_FAIL=1
else
  echo "  ✓ P0_MEDIA_IDENTITY Part 6a: event/[id].tsx imports/uses HeroBannerSurface"
fi

# 6b) resolveBannerUri called with bannerPhotoUrl mapping from event.eventPhotoUrl
if ! grep -q 'resolveBannerUri' "$EVENT_FILE" 2>/dev/null; then
  echo "❌ P0_MEDIA_IDENTITY FAIL — event/[id].tsx missing resolveBannerUri (required for event hero SSOT)"
  P6_FAIL=1
else
  echo "  ✓ P0_MEDIA_IDENTITY Part 6b: event/[id].tsx uses resolveBannerUri for banner URI"
fi

# 6c) No raw <Image eventPhotoUrl (must go through HeroBannerSurface, not inline)
HERO_RAW=$(grep -n '<Image' "$EVENT_FILE" 2>/dev/null \
  | grep 'eventPhotoUrl' || true)
if [ -n "$HERO_RAW" ]; then
  echo "❌ P0_MEDIA_IDENTITY FAIL — event/[id].tsx raw <Image using eventPhotoUrl detected — must use HeroBannerSurface:"
  echo "$HERO_RAW"
  P6_FAIL=1
else
  echo "  ✓ P0_MEDIA_IDENTITY Part 6c: event/[id].tsx — no raw <Image eventPhotoUrl (hero goes through HeroBannerSurface)"
fi

if [ "$P6_FAIL" -ne 0 ]; then
  P0_FAIL=1
fi

# --- Summary -----------------------------------------------------------------
if [ "$P0_FAIL" -ne 0 ]; then
  echo ""
  echo "FAIL: P0_MEDIA_IDENTITY avatar SSOT violated"
  echo "Remediation: Replace raw <Image> avatar with <EntityAvatar …>"
  exit 1
fi

# Informational: count remaining raw <Image in src/app (content images are expected)
OTHER_RAW=$(grep -rn '<Image' src/app/ --include='*.tsx' 2>/dev/null | grep -v 'ImagePlus\|ImageIcon\|ImageBackground' || true)
if [ -n "$OTHER_RAW" ]; then
  OTHER_COUNT=$(echo "$OTHER_RAW" | wc -l | tr -d ' ')
  echo "  ⚠ P0_MEDIA_IDENTITY Info: ${OTHER_COUNT} raw <Image in src/app/ (content — review if new avatar added)"
fi

echo ""
echo "P0_MEDIA_IDENTITY_AVATAR_SSOT checks PASS"

echo "PASS: verify_frontend"
