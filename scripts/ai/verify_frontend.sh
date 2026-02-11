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

# ── P0_MEDIA_IDENTITY_RAW_IMAGE_AUDIT ────────────────────────────────
# Every raw <Image in src/app/ must be either:
#   A) Identity avatar → EntityAvatar SSOT (already enforced above).
#   B) Hero/banner → CLOUDINARY_PRESETS.HERO_BANNER via toCloudinaryTransformedUrl
#      (annotated: INVARIANT_HERO_USES_TRANSFORM_SSOT).
#   C) Content media → annotated: INVARIANT_ALLOW_RAW_IMAGE_CONTENT
#      If URI is Cloudinary, must use toCloudinaryTransformedUrl.

RAW_AUDIT_FAIL=0

# Collect all raw <Image lines in src/app/ (exclude ImagePlus/ImageIcon/ImageBackground)
ALL_RAW=$(grep -rn '<Image\b' src/app/ --include='*.tsx' 2>/dev/null \
  | grep -v 'ImagePlus\|ImageIcon\|ImageBackground' || true)

if [ -n "$ALL_RAW" ]; then
  # Each line must have an annotation on or around it:
  #   INVARIANT_HERO_USES_TRANSFORM_SSOT  or  INVARIANT_ALLOW_RAW_IMAGE_CONTENT
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    LINENO_RAW=$(echo "$line" | cut -d: -f2)
    # Check 5 lines above for the annotation comment
    START_CHECK=$((LINENO_RAW - 5))
    if [ "$START_CHECK" -lt 1 ]; then START_CHECK=1; fi
    CONTEXT=$(sed -n "${START_CHECK},${LINENO_RAW}p" "$FILE" 2>/dev/null)
    if echo "$CONTEXT" | grep -q 'INVARIANT_HERO_USES_TRANSFORM_SSOT\|INVARIANT_ALLOW_RAW_IMAGE_CONTENT'; then
      : # annotated — ok
    else
      echo "  ❌ Un-annotated raw <Image at ${FILE}:${LINENO_RAW}"
      echo "     → Must have INVARIANT_HERO_USES_TRANSFORM_SSOT or INVARIANT_ALLOW_RAW_IMAGE_CONTENT"
      RAW_AUDIT_FAIL=1
    fi
  done <<< "$ALL_RAW"
fi

if [ "$RAW_AUDIT_FAIL" -eq 0 ]; then
  RAW_COUNT=0
  if [ -n "$ALL_RAW" ]; then
    RAW_COUNT=$(echo "$ALL_RAW" | wc -l | tr -d ' ')
  fi
  echo "  ✓ P0_MEDIA_IDENTITY_RAW_IMAGE_AUDIT: all ${RAW_COUNT} raw <Image in src/app/ are annotated"
else
  echo ""
  echo "FAIL: P0_MEDIA_IDENTITY_RAW_IMAGE_AUDIT — un-annotated raw <Image in src/app/"
  echo "Remediation: Add INVARIANT_HERO_USES_TRANSFORM_SSOT or INVARIANT_ALLOW_RAW_IMAGE_CONTENT annotation"
  exit 1
fi

echo ""
echo "P0_MEDIA_IDENTITY_AVATAR_SSOT checks PASS"

# ── P0 MOTION SSOT INVARIANT ────────────────────────────────────────
echo ""
echo "Running P0_MOTION_SSOT checks…"
echo "  Goal: all imperative Reanimated usage must go through MotionSurface/usePressMotion + motionSSOT tokens."

MOTION_FAIL=0

# Allowlist: files permitted to use imperative reanimated primitives directly.
# SSOT core:
#   src/lib/motionSSOT.ts
#   src/components/MotionSurface.tsx
#   src/hooks/usePressMotion.ts
# Existing debt (to be migrated incrementally):
MOTION_ALLOWLIST="motionSSOT\.ts|MotionSurface\.tsx|usePressMotion\.ts"
MOTION_ALLOWLIST+="|AnimatedButton\.tsx|AnimatedCard\.tsx|BottomNavigation\.tsx"
MOTION_ALLOWLIST+="|CircleCard\.tsx|Confetti\.tsx|EmptyState\.tsx"
MOTION_ALLOWLIST+="|EventReactions\.tsx|EventSummaryModal\.tsx|FriendCard\.tsx"
MOTION_ALLOWLIST+="|MonthlyRecap\.tsx|QuickEventButton\.tsx|Skeleton\.tsx"
MOTION_ALLOWLIST+="|SkeletonLoader\.tsx|SplashScreen\.tsx|SwipeableEventRequestCard\.tsx"
MOTION_ALLOWLIST+="|UpgradeModal\.tsx|Button\.tsx|motion\.ts"
MOTION_ALLOWLIST+="|calendar\.tsx|friends\.tsx|login\.tsx|onboarding\.tsx"
MOTION_ALLOWLIST+="|profile\.tsx|social\.tsx|suggestions\.tsx"

# --- Check B: Block imperative reanimated primitives outside allowlist --------
MOTION_PRIMITIVES='useSharedValue(|useAnimatedStyle(|withTiming(|withSpring(|withDelay(|withRepeat(|Easing\.'

MOTION_HITS=$(grep -rn --include="*.ts" --include="*.tsx" -E "$MOTION_PRIMITIVES" src/ 2>/dev/null \
  | grep -v node_modules \
  | grep -v -E "$MOTION_ALLOWLIST" || true)

if [ -n "$MOTION_HITS" ]; then
  echo "❌ P0_MOTION_SSOT FAIL — imperative reanimated primitives outside allowlist:"
  echo "$MOTION_HITS"
  echo "  Remediation: Move animation into MotionSurface preset or motionSSOT token."
  MOTION_FAIL=1
else
  echo "  ✓ P0_MOTION_SSOT Part 1: No imperative reanimated primitives outside allowlist"
fi

# --- Check C: motionSSOT.ts must define MotionPresetConfig + MotionEasings ----
if ! grep -q 'MotionPresetConfig' src/lib/motionSSOT.ts 2>/dev/null; then
  echo "❌ P0_MOTION_SSOT FAIL — motionSSOT.ts missing MotionPresetConfig"
  MOTION_FAIL=1
else
  echo "  ✓ P0_MOTION_SSOT Part 2: motionSSOT.ts exports MotionPresetConfig"
fi

if ! grep -q 'MotionEasings' src/lib/motionSSOT.ts 2>/dev/null; then
  echo "❌ P0_MOTION_SSOT FAIL — motionSSOT.ts missing MotionEasings"
  MOTION_FAIL=1
else
  echo "  ✓ P0_MOTION_SSOT Part 3: motionSSOT.ts exports MotionEasings"
fi

# --- Check D: MotionSurface must consume config.easing ---------------------
if ! grep -q 'config\.easing' src/components/MotionSurface.tsx 2>/dev/null; then
  echo "❌ P0_MOTION_SSOT FAIL — MotionSurface.tsx does not consume config.easing"
  MOTION_FAIL=1
else
  echo "  ✓ P0_MOTION_SSOT Part 4: MotionSurface consumes config.easing from SSOT"
fi

if [ "$MOTION_FAIL" -ne 0 ]; then
  echo ""
  echo "FAIL: P0_MOTION_SSOT invariant violated"
  exit 1
fi

echo ""
echo "P0_MOTION_SSOT checks PASS"

# ── P0 PERF INVARIANT: NO .map() IN PRIMARY FEEDS ───────────────────
echo ""
echo "Running P0_PERF_INVAR_MAP_FEEDS checks…"
echo "  Goal: primary feed screens must not render large lists via .map()."
echo "  Small UI maps allowed only when previous non-empty line is exactly:"
echo "    // INVARIANT_ALLOW_SMALL_MAP"

MAP_FAIL=0
FEED_SCREENS="src/app/discover.tsx src/app/social.tsx src/app/friends.tsx src/app/calendar.tsx"

for SCREEN in $FEED_SCREENS; do
  if [ ! -f "$SCREEN" ]; then
    echo "  ⚠ $SCREEN not found — skipping"
    continue
  fi

  # Use awk to find .map( lines, skip data transforms, check annotation.
  HITS=$(awk '
    BEGIN { fail = 0 }
    {
      if (/\.map\(/) {
        skip = 0

        # Skip data-transform patterns (not JSX rendering)
        if ($0 ~ /^[ \t]*(const |let |var )[a-zA-Z]/) skip = 1
        if ($0 ~ /new Set\(/) skip = 1
        if ($0 ~ /\.split\(.*\.map\(/) skip = 1
        if ($0 ~ /\.map\(.*\.join\(/) skip = 1
        if ($0 ~ /^[ \t]*\.\.\.[a-zA-Z]/) skip = 1
        if ($0 ~ /^[ \t]*\.map\(/) skip = 1
        if ($0 ~ /devLog|devWarn|devError|console\./) skip = 1
        if ($0 ~ /^[ \t]*\/\//) skip = 1
        if ($0 ~ /^[ \t]*return[ \t]/ && $0 !~ /</) skip = 1
        if ($0 ~ /sampleOmittedIds/) skip = 1

        if (!skip) {
          # Check previous non-empty line for annotation (// or {/* */} form)
          if (prev !~ /INVARIANT_ALLOW_SMALL_MAP/) {
            printf "  ❌ %s:%d: %s\n", FILENAME, NR, substr($0, 1, 120)
            fail = 1
          }
        }
      }

      # Track previous non-empty line (updated AFTER checking .map)
      if (/[^ \t]/) prev = $0
    }
    END { if (fail) exit 1 }
  ' "$SCREEN" 2>&1)

  if [ $? -ne 0 ]; then
    echo "$HITS"
    echo "  Remediation: Add '// INVARIANT_ALLOW_SMALL_MAP' on the line above,"
    echo "    or convert the list to FlatList."
    MAP_FAIL=1
  fi
done

if [ "$MAP_FAIL" -ne 0 ]; then
  echo ""
  echo "FAIL: P0_PERF_INVAR_MAP_FEEDS — unannotated .map() in primary feed screens"
  exit 1
else
  echo "  ✓ P0_PERF_INVAR_MAP_FEEDS: All JSX .map() calls in feed screens are annotated"
fi

echo ""
echo "P0_PERF_INVAR_MAP_FEEDS checks PASS"

# ── P0 PERF IMAGE DECODE HYGIENE ────────────────────────────────────
echo ""
echo "Running P0_PERF_IMAGE_DECODE_HYGIENE checks…"
echo "  Goal: hero/banner Image sources must use toCloudinaryTransformedUrl."

DECODE_FAIL=0
DECODE_SCOPE="src/components/HeroBannerSurface.tsx src/app/profile.tsx src/app/public-profile.tsx src/app/event/[id].tsx src/components/ProfilePreviewCard.tsx src/components/EventPhotoGallery.tsx"

for DFILE in $DECODE_SCOPE; do
  if [ ! -f "$DFILE" ]; then
    continue
  fi

  HAS_UPLOAD=$(grep -c '/image/upload/' "$DFILE" 2>/dev/null || true)
  HAS_SOURCE_URI=$(grep -cE 'source=\{\{[ ]*uri:' "$DFILE" 2>/dev/null || true)

  if [ "$HAS_UPLOAD" -gt 0 ] && [ "$HAS_SOURCE_URI" -gt 0 ]; then
    HAS_TRANSFORM=$(grep -c 'toCloudinaryTransformedUrl(' "$DFILE" 2>/dev/null || true)
    if [ "$HAS_TRANSFORM" -eq 0 ]; then
      echo "  ❌ $DFILE uses Cloudinary /image/upload/ in Image source without toCloudinaryTransformedUrl"
      echo "     Remediation: Use toCloudinaryTransformedUrl(url, { w, h, crop }) before passing to Image source."
      DECODE_FAIL=1
    fi
  fi
done

# Structural: mediaTransformSSOT.ts must export the helper
if ! grep -q 'toCloudinaryTransformedUrl' src/lib/mediaTransformSSOT.ts 2>/dev/null; then
  echo "  ❌ src/lib/mediaTransformSSOT.ts missing toCloudinaryTransformedUrl export"
  DECODE_FAIL=1
else
  echo "  ✓ Part 1: mediaTransformSSOT.ts exports toCloudinaryTransformedUrl"
fi

# HeroBannerSurface must import + use the helper
if ! grep -q 'toCloudinaryTransformedUrl' src/components/HeroBannerSurface.tsx 2>/dev/null; then
  echo "  ❌ HeroBannerSurface.tsx does not use toCloudinaryTransformedUrl"
  DECODE_FAIL=1
else
  echo "  ✓ Part 2: HeroBannerSurface uses toCloudinaryTransformedUrl"
fi

# EventPhotoGallery must import + use the helper for thumbnails
if ! grep -q 'toCloudinaryTransformedUrl' src/components/EventPhotoGallery.tsx 2>/dev/null; then
  echo "  ❌ EventPhotoGallery.tsx does not use toCloudinaryTransformedUrl for thumbnails"
  DECODE_FAIL=1
else
  echo "  ✓ Part 3: EventPhotoGallery uses toCloudinaryTransformedUrl for thumbnails"
fi

# CLOUDINARY_PRESETS must be exported with THUMBNAIL preset
if ! grep -q 'THUMBNAIL_SQUARE' src/lib/mediaTransformSSOT.ts 2>/dev/null; then
  echo "  ❌ mediaTransformSSOT.ts missing THUMBNAIL_SQUARE preset"
  DECODE_FAIL=1
else
  echo "  ✓ Part 4: mediaTransformSSOT.ts exports THUMBNAIL_SQUARE preset"
fi

if [ "$DECODE_FAIL" -ne 0 ]; then
  echo ""
  echo "FAIL: P0_PERF_IMAGE_DECODE_HYGIENE invariant violated"
  exit 1
fi

echo "  ✓ Part 5: All enforced files pass Cloudinary decode hygiene"
echo ""
echo "P0_PERF_IMAGE_DECODE_HYGIENE checks PASS"

# ── P0 PERF PRELOAD BOUNDED HEROES ─────────────────────────────────
echo ""
echo "Running P0_PERF_PRELOAD_BOUNDED_HEROES checks…"
echo "  Goal: bounded hero banner prefetch SSOT exists, enforces hard cap, and Image.prefetch is SSOT-only."

PRELOAD_FAIL=0

# Part 1: usePreloadHeroBanners.ts must exist and export the hook
if [ ! -f "src/lib/usePreloadHeroBanners.ts" ]; then
  echo "  ❌ src/lib/usePreloadHeroBanners.ts does not exist"
  PRELOAD_FAIL=1
elif ! grep -q 'export function usePreloadHeroBanners' src/lib/usePreloadHeroBanners.ts 2>/dev/null; then
  echo "  ❌ src/lib/usePreloadHeroBanners.ts missing usePreloadHeroBanners export"
  PRELOAD_FAIL=1
else
  echo "  ✓ Part 1: usePreloadHeroBanners.ts exists and exports hook"
fi

# Part 2: Hook must enforce hard cap (slice or break on max)
if [ -f "src/lib/usePreloadHeroBanners.ts" ]; then
  HAS_CAP=$(grep -cE '(\.slice\(0,\s*max\)|transformed\.length\s*>=\s*max)' src/lib/usePreloadHeroBanners.ts 2>/dev/null || true)
  if [ "$HAS_CAP" -eq 0 ]; then
    echo "  ❌ usePreloadHeroBanners.ts does not enforce hard cap (no slice(0,max) or length >= max guard)"
    PRELOAD_FAIL=1
  else
    echo "  ✓ Part 2: Hook enforces hard cap on prefetch count"
  fi
fi

# Part 3: Hook must use toCloudinaryTransformedUrl
if [ -f "src/lib/usePreloadHeroBanners.ts" ]; then
  if ! grep -q 'toCloudinaryTransformedUrl' src/lib/usePreloadHeroBanners.ts 2>/dev/null; then
    echo "  ❌ usePreloadHeroBanners.ts does not use toCloudinaryTransformedUrl"
    PRELOAD_FAIL=1
  else
    echo "  ✓ Part 3: Hook uses toCloudinaryTransformedUrl for render-path parity"
  fi
fi

# Part 4: Image.prefetch must only appear in SSOT files (usePreloadImage.ts + usePreloadHeroBanners.ts)
PREFETCH_LEAKS=$(grep -rn 'Image\.prefetch' src/ --include='*.ts' --include='*.tsx' \
  | grep -v 'usePreloadImage\.ts' \
  | grep -v 'usePreloadHeroBanners\.ts' \
  | grep -v '\.test\.' \
  | grep -v '__tests__' || true)

if [ -n "$PREFETCH_LEAKS" ]; then
  echo "  ❌ Image.prefetch used outside SSOT files:"
  echo "$PREFETCH_LEAKS" | head -5
  echo "     Remediation: Move all Image.prefetch calls into usePreloadImage.ts or usePreloadHeroBanners.ts"
  PRELOAD_FAIL=1
else
  echo "  ✓ Part 4: Image.prefetch confined to SSOT files only"
fi

# Part 5: user/[id].tsx must use usePreloadHeroBanners for public profile hero
if ! grep -q 'usePreloadHeroBanners' 'src/app/user/[id].tsx' 2>/dev/null; then
  echo "  ❌ user/[id].tsx does not use usePreloadHeroBanners for public profile hero"
  PRELOAD_FAIL=1
else
  echo "  ✓ Part 5: user/[id].tsx uses usePreloadHeroBanners for public profile hero"
fi

# Part 6: profile.tsx must use usePreloadHeroBanners for own profile hero
if ! grep -q 'usePreloadHeroBanners' src/app/profile.tsx 2>/dev/null; then
  echo "  ❌ profile.tsx does not use usePreloadHeroBanners for own profile hero"
  PRELOAD_FAIL=1
else
  echo "  ✓ Part 6: profile.tsx uses usePreloadHeroBanners for own profile hero"
fi

if [ "$PRELOAD_FAIL" -ne 0 ]; then
  echo ""
  echo "FAIL: P0_PERF_PRELOAD_BOUNDED_HEROES invariant violated"
  exit 1
fi

echo ""
echo "P0_PERF_PRELOAD_BOUNDED_HEROES checks PASS"

# ── P0 PERF THUMB AVATAR HYGIENE ───────────────────────────────────
echo ""
echo "Running P0_PERF_THUMB_AVATAR_HYGIENE checks…"
echo "  Goal: EntityAvatar SSOT transforms Cloudinary avatar URIs via THUMBNAIL_SQUARE."

AVATAR_FAIL=0

# Part 1: THUMBNAIL_SQUARE preset must exist in mediaTransformSSOT.ts
if ! grep -q 'THUMBNAIL_SQUARE' src/lib/mediaTransformSSOT.ts 2>/dev/null; then
  echo "  ❌ mediaTransformSSOT.ts missing THUMBNAIL_SQUARE preset"
  AVATAR_FAIL=1
else
  echo "  ✓ Part 1: THUMBNAIL_SQUARE preset exists in mediaTransformSSOT.ts"
fi

# Part 2: EntityAvatar must import toCloudinaryTransformedUrl
if ! grep -q 'toCloudinaryTransformedUrl' src/components/EntityAvatar.tsx 2>/dev/null; then
  echo "  ❌ EntityAvatar.tsx does not use toCloudinaryTransformedUrl"
  AVATAR_FAIL=1
else
  echo "  ✓ Part 2: EntityAvatar uses toCloudinaryTransformedUrl"
fi

# Part 3: EntityAvatar must reference THUMBNAIL_SQUARE
if ! grep -q 'THUMBNAIL_SQUARE' src/components/EntityAvatar.tsx 2>/dev/null; then
  echo "  ❌ EntityAvatar.tsx does not reference THUMBNAIL_SQUARE"
  AVATAR_FAIL=1
else
  echo "  ✓ Part 3: EntityAvatar uses THUMBNAIL_SQUARE preset"
fi

# Part 4: Scoped high-scroll screens must use EntityAvatar (not raw <Image for identity)
AVATAR_SCOPE="src/app/friends.tsx src/app/social.tsx src/app/event/[id].tsx src/app/circle/[id].tsx"
for AFILE in $AVATAR_SCOPE; do
  if [ ! -f "$AFILE" ]; then
    continue
  fi
  if ! grep -q 'EntityAvatar' "$AFILE" 2>/dev/null; then
    echo "  ❌ $AFILE does not use EntityAvatar for identity images"
    AVATAR_FAIL=1
  fi
done
if [ "$AVATAR_FAIL" -eq 0 ]; then
  echo "  ✓ Part 4: All scoped screens use EntityAvatar for identity images"
fi

if [ "$AVATAR_FAIL" -ne 0 ]; then
  echo ""
  echo "FAIL: P0_PERF_THUMB_AVATAR_HYGIENE invariant violated"
  exit 1
fi

echo ""
echo "P0_PERF_THUMB_AVATAR_HYGIENE checks PASS"

# ── P0 PERF QUERY RENDER STABILITY ─────────────────────────────────
echo ""
echo "Running P0_PERF_QUERY_RENDER_STABILITY checks…"
echo "  Goal: prevent unannotated inline JSX press handlers in primary feed screens."

HANDLER_FAIL=0
HANDLER_TOTAL=0

FEED_SCREENS=(
  src/app/discover.tsx
  src/app/social.tsx
  src/app/friends.tsx
  src/app/calendar.tsx
)

for FEED in "${FEED_SCREENS[@]}"; do
  if [ ! -f "$FEED" ]; then continue; fi
  VIOLATIONS=$(awk '
  {
    if (NF > 0) {
      if (match($0, /on(Press|LongPress|PressIn|PressOut)[[:space:]]*=[[:space:]]*\{/) && match($0, /=>/)) {
        gsub(/^[[:space:]]+/, "", prev_nonempty)
        gsub(/[[:space:]]+$/, "", prev_nonempty)
        if (prev_nonempty != "// INVARIANT_ALLOW_INLINE_HANDLER") {
          printf "%s:%d: %s\n", FILENAME, NR, $0
          count++
        }
      }
      prev_nonempty = $0
    }
  }
  END { exit (count > 0 ? 1 : 0) }
  ' "$FEED" 2>&1)
  VSTAT=$?
  if [ "$VSTAT" -ne 0 ]; then
    VCOUNT=$(echo "$VIOLATIONS" | wc -l | tr -d ' ')
    echo "  ❌ $FEED has $VCOUNT unannotated inline handler(s):"
    echo "$VIOLATIONS"
    HANDLER_FAIL=1
    HANDLER_TOTAL=$((HANDLER_TOTAL + VCOUNT))
  fi
done

if [ "$HANDLER_FAIL" -ne 0 ]; then
  echo ""
  echo "FAIL: P0_PERF_QUERY_RENDER_STABILITY — $HANDLER_TOTAL unannotated inline handler(s)"
  echo "Remediation: Add '// INVARIANT_ALLOW_INLINE_HANDLER' on the line immediately above each inline handler."
  exit 1
fi

echo "  ✓ P0_PERF_QUERY_RENDER_STABILITY: all inline press handlers in primary feeds are annotated"

echo ""
echo "P0_PERF_QUERY_RENDER_STABILITY checks PASS"

echo "PASS: verify_frontend"
