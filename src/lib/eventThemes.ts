/**
 * Event Themes V1 — SSOT for event card theme catalog.
 *
 * 10 themes: 5 basic (free) + 5 premium (Pro).
 * Each theme defines minimal styling tokens for flip card + page chrome.
 *
 * Priority: explicit event.themeId > inferred vibe fallback.
 * Proof tag: [EVENT_THEMES_V1_SSOT]
 */

// ─── Theme IDs (must match backend ALLOWED_THEME_IDS) ────

export const BASIC_THEME_IDS = [
  "neutral",
  "chill_hang",
  "dinner_night",
  "game_night",
  "worship_night",
] as const;

export const PREMIUM_THEME_IDS = [
  "summer_splash",
  "fall_harvest",
  "winter_glow",
  "game_day",
  "birthday_bash",
] as const;

export const ALL_THEME_IDS = [...BASIC_THEME_IDS, ...PREMIUM_THEME_IDS] as const;
export type ThemeId = (typeof ALL_THEME_IDS)[number];

// ─── Theme Tokens ────────────────────────────────────────

export interface EventThemeTokens {
  /** Display name in picker */
  label: string;
  /** Emoji shown in picker swatch */
  swatch: string;
  /** Front card: gradient tint mixed into photo scrim bottom */
  gradientTint: string;
  /** Front card: vibe label on no-photo cards */
  vibeLabel: string;
  /** Back card: accent color for strip, icon boxes, host ring */
  backAccent: string;
  /** Back card: dark mode background */
  backBgDark: string;
  /** Back card: light mode background */
  backBgLight: string;
  /** Page chrome: subtle wash tint behind card area (dark mode) */
  pageTintDark: string;
  /** Page chrome: subtle wash tint behind card area (light mode) */
  pageTintLight: string;
  /** Chip/badge accent */
  chipAccent: string;
}

// ─── Theme Catalog ───────────────────────────────────────

export const EVENT_THEMES: Record<ThemeId, EventThemeTokens> = {
  // ── Basic (free) ──
  neutral: {
    label: "Classic",
    swatch: "📅",
    gradientTint: "transparent",
    vibeLabel: "You're Invited",
    backAccent: "#8E8E93",
    backBgDark: "#1C1C1E",
    backBgLight: "#FAF9F7",
    pageTintDark: "transparent",
    pageTintLight: "transparent",
    chipAccent: "#8E8E93",
  },
  chill_hang: {
    label: "Chill Hang",
    swatch: "🌿",
    gradientTint: "rgba(156,39,176,0.25)",
    vibeLabel: "You're Invited",
    backAccent: "#AB47BC",
    backBgDark: "#1E1228",
    backBgLight: "#F5ECFA",
    pageTintDark: "rgba(171,71,188,0.14)",
    pageTintLight: "rgba(171,71,188,0.07)",
    chipAccent: "#AB47BC",
  },
  dinner_night: {
    label: "Dinner Night",
    swatch: "🍽️",
    gradientTint: "rgba(255,152,0,0.28)",
    vibeLabel: "You're Invited",
    backAccent: "#FF9800",
    backBgDark: "#261C10",
    backBgLight: "#FFF3E8",
    pageTintDark: "rgba(255,152,0,0.14)",
    pageTintLight: "rgba(255,152,0,0.07)",
    chipAccent: "#FF9800",
  },
  game_night: {
    label: "Game Night",
    swatch: "🎲",
    gradientTint: "rgba(99,102,241,0.28)",
    vibeLabel: "Game Night",
    backAccent: "#6366F1",
    backBgDark: "#121228",
    backBgLight: "#EDEDFF",
    pageTintDark: "rgba(99,102,241,0.14)",
    pageTintLight: "rgba(99,102,241,0.07)",
    chipAccent: "#6366F1",
  },
  worship_night: {
    label: "Worship Night",
    swatch: "🙏",
    gradientTint: "rgba(156,124,99,0.22)",
    vibeLabel: "You're Invited",
    backAccent: "#9C7C63",
    backBgDark: "#221C16",
    backBgLight: "#F5EDE5",
    pageTintDark: "rgba(156,124,99,0.12)",
    pageTintLight: "rgba(156,124,99,0.06)",
    chipAccent: "#9C7C63",
  },

  // ── Premium (Pro) ──
  summer_splash: {
    label: "Summer Splash",
    swatch: "🏖️",
    gradientTint: "rgba(0,188,212,0.30)",
    vibeLabel: "You're Invited",
    backAccent: "#00ACC1",
    backBgDark: "#0C1E24",
    backBgLight: "#E5F7FA",
    pageTintDark: "rgba(0,172,193,0.16)",
    pageTintLight: "rgba(0,172,193,0.08)",
    chipAccent: "#00ACC1",
  },
  fall_harvest: {
    label: "Fall Harvest",
    swatch: "🍂",
    gradientTint: "rgba(230,126,34,0.30)",
    vibeLabel: "You're Invited",
    backAccent: "#D4763B",
    backBgDark: "#28180C",
    backBgLight: "#FAEDE0",
    pageTintDark: "rgba(212,118,59,0.16)",
    pageTintLight: "rgba(212,118,59,0.08)",
    chipAccent: "#D4763B",
  },
  winter_glow: {
    label: "Winter Glow",
    swatch: "❄️",
    gradientTint: "rgba(100,149,237,0.30)",
    vibeLabel: "You're Invited",
    backAccent: "#6495ED",
    backBgDark: "#0E142A",
    backBgLight: "#E5EDFF",
    pageTintDark: "rgba(100,149,237,0.16)",
    pageTintLight: "rgba(100,149,237,0.08)",
    chipAccent: "#6495ED",
  },
  game_day: {
    label: "Game Day",
    swatch: "🏈",
    gradientTint: "rgba(76,175,80,0.28)",
    vibeLabel: "Game On",
    backAccent: "#43A047",
    backBgDark: "#0E2412",
    backBgLight: "#E5F5E5",
    pageTintDark: "rgba(67,160,71,0.16)",
    pageTintLight: "rgba(67,160,71,0.08)",
    chipAccent: "#43A047",
  },
  birthday_bash: {
    label: "Birthday Bash",
    swatch: "🎂",
    gradientTint: "rgba(255,80,60,0.32)",
    vibeLabel: "You're Invited",
    backAccent: "#FF6B4A",
    backBgDark: "#28120E",
    backBgLight: "#FFE8E4",
    pageTintDark: "rgba(255,107,74,0.16)",
    pageTintLight: "rgba(255,107,74,0.08)",
    chipAccent: "#FF6B4A",
  },
};

// ─── Helpers ─────────────────────────────────────────────

export function isValidThemeId(id: string | null | undefined): id is ThemeId {
  if (!id) return false;
  return (ALL_THEME_IDS as readonly string[]).includes(id);
}

export function isPremiumTheme(id: ThemeId): boolean {
  return (PREMIUM_THEME_IDS as readonly string[]).includes(id);
}

/**
 * Resolve theme tokens for an event.
 * Priority: explicit themeId > null (returns null for legacy fallback).
 */
export function resolveEventTheme(themeId: string | null | undefined): EventThemeTokens | null {
  if (isValidThemeId(themeId)) {
    return EVENT_THEMES[themeId];
  }
  return null;
}
