/**
 * Event Themes V1 — SSOT for event card theme catalog.
 *
 * 10 themes: 5 basic (free) + 5 premium (Pro).
 * Each theme defines minimal styling tokens for flip card + page chrome.
 *
 * Priority: explicit event.themeId > neutral fallback.
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
  /** Ambient effect preset identifier (null = no effect) */
  effectPreset?: string | null;
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
    gradientTint: "rgba(20,184,166,0.22)",
    vibeLabel: "You're Invited",
    backAccent: "#14B8A6",
    backBgDark: "#0D3B3E",
    backBgLight: "#CCFBF1",
    pageTintDark: "rgba(20,184,166,0.24)",
    pageTintLight: "rgba(20,184,166,0.14)",
    chipAccent: "#14B8A6",
    effectPreset: "coastal_haze",
  },
  dinner_night: {
    label: "Dinner Night",
    swatch: "🍽️",
    gradientTint: "rgba(255,152,0,0.28)",
    vibeLabel: "You're Invited",
    backAccent: "#FF9800",
    backBgDark: "#261C10",
    backBgLight: "#FFF3E8",
    pageTintDark: "rgba(255,152,0,0.22)",
    pageTintLight: "rgba(255,152,0,0.12)",
    chipAccent: "#FF9800",
  },
  game_night: {
    label: "Game Night",
    swatch: "🎲",
    gradientTint: "rgba(139,92,246,0.30)",
    vibeLabel: "Game Night",
    backAccent: "#8B5CF6",
    backBgDark: "#1A1A3E",
    backBgLight: "#CBC5FF",
    pageTintDark: "rgba(139,92,246,0.28)",
    pageTintLight: "rgba(139,92,246,0.16)",
    chipAccent: "#8B5CF6",
    effectPreset: "arcade_sparkle",
  },
  worship_night: {
    label: "Worship Night",
    swatch: "🙏",
    gradientTint: "rgba(156,124,99,0.22)",
    vibeLabel: "You're Invited",
    backAccent: "#9C7C63",
    backBgDark: "#221C16",
    backBgLight: "#F5EDE5",
    pageTintDark: "rgba(156,124,99,0.20)",
    pageTintLight: "rgba(156,124,99,0.10)",
    chipAccent: "#9C7C63",
    effectPreset: "ambient_dust",
  },

  // ── Premium (Pro) ──
  summer_splash: {
    label: "Summer Splash",
    swatch: "🏖️",
    gradientTint: "rgba(0,188,212,0.30)",
    vibeLabel: "You're Invited",
    backAccent: "#00ACC1",
    backBgDark: "#0A2A38",
    backBgLight: "#B8EBF5",
    pageTintDark: "rgba(0,172,193,0.30)",
    pageTintLight: "rgba(0,172,193,0.16)",
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
    pageTintDark: "rgba(212,118,59,0.24)",
    pageTintLight: "rgba(212,118,59,0.12)",
    chipAccent: "#D4763B",
  },
  winter_glow: {
    label: "Winter Glow",
    swatch: "❄️",
    gradientTint: "rgba(100,149,237,0.30)",
    vibeLabel: "You're Invited",
    backAccent: "#6495ED",
    backBgDark: "#111B3A",
    backBgLight: "#C7D7FF",
    pageTintDark: "rgba(100,149,237,0.30)",
    pageTintLight: "rgba(100,149,237,0.18)",
    chipAccent: "#6495ED",
    effectPreset: "snowfall",
  },
  game_day: {
    label: "Game Day",
    swatch: "🏈",
    gradientTint: "rgba(76,175,80,0.28)",
    vibeLabel: "Game On",
    backAccent: "#43A047",
    backBgDark: "#0F2E16",
    backBgLight: "#C2EFC9",
    pageTintDark: "rgba(67,160,71,0.30)",
    pageTintLight: "rgba(67,160,71,0.18)",
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
    pageTintDark: "rgba(255,107,74,0.24)",
    pageTintLight: "rgba(255,107,74,0.12)",
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
 * Priority: explicit themeId > neutral fallback.
 */
export function resolveEventTheme(themeId: string | null | undefined): EventThemeTokens {
  if (isValidThemeId(themeId)) {
    return EVENT_THEMES[themeId];
  }
  return EVENT_THEMES.neutral;
}
