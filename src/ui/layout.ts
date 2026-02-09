/**
 * layout.ts – SSOT spacing, radius & hit-target tokens.
 *
 * Every numeric padding / borderRadius / hitSlop in the UI
 * primitives (Button, Chip, IconButton, Tile) must reference
 * a named constant from this file.
 *
 * Token ladder (base-4):
 *   2 → xxs   4 → xs   6 → sm   8 → md
 *  10 → lg   12 → xl  16 → xxl  20 → xxxl  24 → xxxxl
 *
 * ## Press-feedback contract  (see also: motion.ts)
 *   • Button     → bg colour shift via ThemeContext tokens. NO opacity.
 *   • Chip       → opacity dim (PRESS_OPACITY from motion.ts) when tappable.
 *   • IconButton → bg colour shift via ThemeContext tokens. NO opacity.
 *   • Tile       → View-based, not interactive — no pressed state.
 *   • Screens    → MAY use Reanimated scale/translate for specialised
 *                   interactions (reactions, CTAs, context menus) but must
 *                   NOT duplicate the primitive pressed-bg pattern.
 *
 * ## Dead-code notice
 *   AnimatedButton.tsx and AnimatedCard.tsx have ZERO usages.
 *   Do not import them; prefer the SSOT primitives above.
 */

// ─── Spacing ───────────────────────────────────────────
export const SPACING = {
  /** 2 */  xxs: 2,
  /** 4 */  xs: 4,
  /** 6 */  sm: 6,
  /** 8 */  md: 8,
  /** 10 */ lg: 10,
  /** 12 */ xl: 12,
  /** 16 */ xxl: 16,
  /** 20 */ xxxl: 20,
  /** 24 */ xxxxl: 24,
} as const;

// ─── Radius ────────────────────────────────────────────
export const RADIUS = {
  /** 8  – small cards, inputs */  sm: 8,
  /** 12 – medium surfaces */      md: 12,
  /** 16 – Tile default */         lg: 16,
  /** 20 – large cards */          xl: 20,
  /** 9999 – pill / chip */        pill: 9999,
} as const;

// ─── Hit-target ────────────────────────────────────────
/** Minimum accessible tap dimension (pt). */
export const MIN_TAP = 44;

/**
 * Compute symmetric hitSlop so a view of `dim` still reaches MIN_TAP.
 * Returns 0 when already large enough.
 */
export function hitSlop(dim: number) {
  const pad = Math.max(0, (MIN_TAP - dim) / 2);
  return { top: pad, bottom: pad, left: pad, right: pad };
}
