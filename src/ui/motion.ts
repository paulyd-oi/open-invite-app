/**
 * motion.ts – SSOT micro-interaction, animation timing & haptics tokens.
 *
 * All press-feedback constants, transition durations, and haptic helpers
 * live here. Primitives (Button, Chip, IconButton) import from this file
 * so the "feel" of the app can be tuned in one place.
 *
 * ## Press-feedback contract
 *   • Button     → bg colour shift (ThemeContext tokens). NO opacity.
 *   • Chip       → opacity dim via PRESS_OPACITY when tappable.
 *   • IconButton → bg colour shift (ThemeContext tokens). NO opacity.
 *   • Tile       → View-based, not interactive — no press state.
 *
 * ## Haptics contract
 *   Light  → navigation taps, toggles, selections
 *   Medium → primary CTA confirmations, copy/share, create
 *   Heavy  → destructive confirmations only
 *   Success/Error → notificationAsync for outcomes
 *
 * ## Animation timing
 *   Keep durations short and consistent. Screens MAY use Reanimated
 *   entering/exiting presets (FadeIn, SlideIn) freely — those are
 *   layout-driven and outside this contract.
 */
import * as Haptics from "expo-haptics";

// ─── Press Feedback ────────────────────────────────────
/** Pressed-state opacity for Chip (tappable pills). */
export const PRESS_OPACITY = 0.7;

// ─── Transition Durations (ms) ─────────────────────────
/** Quick element fade (opacity in/out). */
export const FADE_MS = 180;
/** Slide-in panel / drawer transition. */
export const SLIDE_MS = 220;
/** Bottom-sheet present / dismiss. */
export const SHEET_MS = 240;

// ─── Spring Presets ────────────────────────────────────
/** Snappy spring for press-scale effects (reactions, CTAs). */
export const SPRING_PRESS = { damping: 15, stiffness: 400 } as const;
/** Gentle spring for layout shifts. */
export const SPRING_LAYOUT = { damping: 20, stiffness: 300 } as const;

// ─── Haptics Helpers ───────────────────────────────────
/** Light tap – navigation, toggles, selections. */
export function hapticTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium tap – primary CTA confirmations, copy/share, create. */
export function hapticConfirm() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Success outcome feedback. */
export function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Error / destructive outcome feedback. */
export function hapticError() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
