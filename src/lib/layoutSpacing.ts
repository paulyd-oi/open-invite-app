/**
 * layoutSpacing.ts — SSOT for bottom spacing across Open Invite screens.
 *
 * WHY THIS EXISTS:
 * SafeAreaView's `edges={["bottom"]}` adds ~34px of internal padding for the
 * home indicator. Combined with the floating tab bar (which already sits above
 * the home indicator) or manual scroll paddingBottom, this double-pads and
 * clips content. The fix (commit 03ac16d) removed bottom edge from all screens,
 * but left scattered magic numbers for paddingBottom. This file centralizes them.
 *
 * RULE: screens use `edges={[]}` (or `edges={["top"]}` if no nav header),
 * then apply paddingBottom from this file via contentContainerStyle.
 *
 * SCREEN TYPES:
 *
 * "tab" — Main tab screens (calendar, friends, social, discover, profile).
 *   The floating BottomNavigation pill sits at `insets.bottom + 8` and is 56px
 *   tall. Content must clear the pill: FLOATING_TAB_INSET (84) handles this.
 *   These screens import FLOATING_TAB_INSET directly from BottomNavigation.tsx
 *   and typically use paddingBottom: 100 (84 + breathing room for FABs).
 *
 * "stack" — Pushed screens with a back button, no tab bar visible.
 *   Content only needs to clear the home indicator (~34px). We use 48px to
 *   add a small visual margin below the last element.
 *
 * "form" — Settings / edit / admin screens with a save button or dense fields.
 *   Same as stack but 40px is acceptable since these screens often end with
 *   a button that provides its own bottom margin.
 *
 * "chat" — Screens with a bottom input bar (circle chat, comments).
 *   The input bar itself handles safe area. Scroll content just needs minimal
 *   clearance above the composer. Typically 8-16px depending on layout.
 *   These are intentionally NOT centralized here because chat input bars
 *   calculate their own insets dynamically.
 */

// ─── Base constants ──────────────────────────────────────────

/** Home indicator height on notched iPhones (~34px). */
export const HOME_INDICATOR_HEIGHT = 34;

/**
 * Safe bottom padding for stack screens (no tab bar).
 * Clears the home indicator with visual breathing room.
 */
export const STACK_BOTTOM_PADDING = 48;

/**
 * Safe bottom padding for form/settings screens.
 * Slightly tighter than stack — these often end with a button.
 */
export const FORM_BOTTOM_PADDING = 40;

/**
 * Bottom padding for tab screens that show the floating nav bar.
 * Re-exported from BottomNavigation for convenience — the canonical
 * value lives there (ISLAND_HEIGHT + ISLAND_BOTTOM + 20 = 84).
 * Most tab screens use 100 (84 + extra for FABs/pull-up affordances).
 */
export { FLOATING_TAB_INSET } from "@/components/BottomNavigation";

/**
 * Recommended tab-screen paddingBottom that clears the floating nav
 * plus provides room for FABs and bottom-anchored elements.
 */
export const TAB_BOTTOM_PADDING = 100;
