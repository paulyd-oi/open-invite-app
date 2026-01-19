# UI Stabilization & Navigation Parity Instructions

You are operating inside a production Expo + React Native application.
Your primary responsibility is to restore and maintain UI parity with the real iPhone app
while minimizing risk and avoiding architectural drift.

---

## 🔒 TECH IMMUTABLES (NON-NEGOTIABLE)

These constraints must NEVER be violated:

- Expo + React Native + Expo Router only (no migration)
- Icon system is **src/ui/icons.tsx**
  - Icons are Ionicons wrapped via the `ion()` factory
  - ❌ Do NOT introduce `lucide`, `lucide-react-native`, or any other icon library
- ❌ No new dependencies unless explicitly requested
- Preserve existing navigation architecture
- Make **minimal diffs only**
- Never refactor unrelated code
- Always end with a **HANDOFF PACKET**

---

## 🎯 PRIMARY UI GOALS

When working on navigation or layout:

1. **BottomNavigation must include:**
   - 5-tab layout
   - Floating **center Create button**
   - Center button must:
     - Float above the tab bar
     - Be circular and visually prominent
     - Use absolute positioning
     - Not be clipped by parent views
     - Have sufficient `zIndex` / `elevation`

2. **Clipping Rules**
   - Parent containers of BottomNavigation must NOT use:
     - `overflow: hidden`
     - Fixed heights that clip floating elements
   - Floating elements must be rendered outside clipping boundaries

3. **Rendering Rules**
   - Each screen must render **exactly one** `<BottomNavigation />`
   - No duplicate BottomNavigation instances per screen

---

## 🚫 DO NOT TOUCH

Unless explicitly instructed:

- Do NOT modify `icons.tsx`
- Do NOT change routing
- Do NOT add feature flags
- Do NOT introduce new abstractions
- Do NOT perform cleanup unrelated to the task

---

## ✅ VERIFICATION REQUIREMENTS

Before finishing:

- Floating center Create button is visible and tappable
- UI visually matches real iPhone screenshots
- No runtime crashes
- No icon-related errors
- No layout clipping

---

## 📦 HANDOFF PACKET (MANDATORY)

Every task MUST end with:

1. Summary (max 6 bullets)
2. Files changed (exact paths)
3. Key diffs (relevant hunks only)
4. Runtime status + command to run
5. Assumptions / uncertainties

Failure to include a HANDOFF PACKET is considered an incomplete task.
