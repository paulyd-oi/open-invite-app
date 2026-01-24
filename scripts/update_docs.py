#!/usr/bin/env python3
import re
from pathlib import Path

STATE_FILE = Path("docs/STATE_OF_THE_APP.md")
FINDINGS_FILE = Path("docs/FINDINGS_LOG.md")
HANDOFF_FILE = Path("docs/HANDOFF_PACKET_LATEST.txt")
INVARIANTS_FILE = Path("docs/INVARIANTS.md")

COMMIT_HASH = "ef1b93c"
VERIFY_DATE = "2026-01-24"

# -------------------------
# 1) Update STATE_OF_THE_APP
# -------------------------
state = STATE_FILE.read_text(encoding="utf-8")

# Ensure Last Verified includes commit hash + pushed status
def upsert_last_verified(txt: str) -> str:
    pattern = r"(?m)^## Last Verified\s*\n(?:.*\n)*?(?=\n## |\Z)"
    block = (
        "## Last Verified\n"
        f"- {VERIFY_DATE}: Typecheck PASS, scripts/ai/verify_frontend.sh PASS\n"
        f"- Git: Pushed to main @ {COMMIT_HASH}\n"
    )
    if re.search(pattern, txt):
        return re.sub(pattern, block + "\n", txt)
    else:
        # Append near end if section missing
        return txt.rstrip() + "\n\n" + block + "\n"

state = upsert_last_verified(state)

# If there is any "deployed" language that implies pushed when not, normalize (best-effort)
state = state.replace("deployed", "pushed")

STATE_FILE.write_text(state, encoding="utf-8")
print("Updated STATE_OF_THE_APP.md")

# -------------------------
# 2) Canonicalize FINDINGS_LOG
#    - Add Auth Contract
#    - Remove duplicate cookie finding if present
# -------------------------
findings = FINDINGS_FILE.read_text(encoding="utf-8")

auth_contract = (
    "## Auth Contract (Canonical)\n\n"
    "- Authenticated API calls must use the Better Auth session cookie: `__Secure-better-auth.session_token`.\n"
    "- In React Native/Expo, the cookie header must be sent as lowercase `cookie` (uppercase `Cookie` can be dropped).\n"
    "- Authed React Query calls must be gated on `bootStatus === 'authed'` (not `!!session`) to prevent 401 storms during transitions.\n\n"
)

# Insert Auth Contract at top (after title line if present)
if "## Auth Contract (Canonical)" not in findings:
    # Try to insert after first H1 or first line
    lines = findings.splitlines(True)
    if lines:
        # Insert after first line if it looks like a title
        insert_at = 1
        findings = "".join(lines[:insert_at]) + "\n" + auth_contract + "".join(lines[insert_at:])
    else:
        findings = auth_contract

# Remove duplicate cookie entries: keep the first detailed one, remove later ones that repeat the same core point.
cookie_patterns = [
    r"(?s)### Date:\s*2026-01-24.*?Finding:\s*React Native fetch silently drops uppercase 'Cookie' header.*?(?=\n### Date:|\Z)",
    r"(?s)##\s*2026-01-24\s*\n\n### Finding:\s*React Native fetch drops uppercase `Cookie` headers.*?(?=\n---|\Z)"
]

matches = []
for pat in cookie_patterns:
    for m in re.finditer(pat, findings):
        matches.append((m.start(), m.end(), pat))

matches.sort()

# If we have both styles present, remove the later one(s)
if len(matches) > 1:
    # Keep earliest block; remove the rest from end to start
    to_remove = matches[1:]
    for start, end, _ in reversed(to_remove):
        findings = findings[:start] + "\n" + findings[end:]

# Optional: remove template section if it's still present
findings = re.sub(r"(?s)## Template\s*\n.*?---\s*\n", "", findings, count=1)

FINDINGS_FILE.write_text(findings.strip() + "\n", encoding="utf-8")
print("Updated FINDINGS_LOG.md")

# -------------------------
# 3) Update HANDOFF_PACKET_LATEST
# -------------------------
if HANDOFF_FILE.exists():
    handoff = HANDOFF_FILE.read_text(encoding="utf-8")

    # Ensure commit hash + pushed is correct
    handoff = re.sub(r"(?m)^Commit:\s*.*$", f"Commit: {COMMIT_HASH}", handoff)
    handoff = re.sub(r"(?m)^Push:\s*.*$", "Push: YES (main -> main)", handoff)

    # Remove INVARIANTS claim if invariants file doesn't exist
    if not INVARIANTS_FILE.exists():
        handoff = re.sub(r"(?m)^INVARIANTS changed:.*\n", "", handoff)

    HANDOFF_FILE.write_text(handoff, encoding="utf-8")
    print("Updated HANDOFF_PACKET_LATEST.txt")

print("Done!")
