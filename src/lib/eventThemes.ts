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
  "party_night",
  "spring_bloom",
  "romance_elegant",
  "celebration",
  "valentines",
  "garden_party",
  "spring_brunch",
  "easter",
  "graduation",
  "bonfire_night",
  "luau",
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
    effectPreset: "light_rays",
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
    effectPreset: "rising_bubbles",
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
    effectPreset: "falling_leaves",
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
    effectPreset: "glitter_shimmer",
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
    effectPreset: "confetti_rain",
  },
  party_night: {
    label: "Party Night",
    swatch: "🪩",
    gradientTint: "rgba(139, 92, 246, 0.30)",
    vibeLabel: "Let's Party",
    backAccent: "#A855F7",
    backBgDark: "#0F0520",
    backBgLight: "#F3E8FF",
    pageTintDark: "rgba(139, 92, 246, 0.25)",
    pageTintLight: "rgba(139, 92, 246, 0.12)",
    chipAccent: "#A855F7",
    effectPreset: "disco_pulse",
  },
  spring_bloom: {
    label: "Spring Bloom",
    swatch: "🌸",
    gradientTint: "rgba(34, 197, 94, 0.20)",
    vibeLabel: "You're Invited",
    backAccent: "#22C55E",
    backBgDark: "#0A1F10",
    backBgLight: "#F0FFF4",
    pageTintDark: "rgba(34, 197, 94, 0.18)",
    pageTintLight: "rgba(34, 197, 94, 0.10)",
    chipAccent: "#22C55E",
    effectPreset: "cherry_blossom",
  },
  romance_elegant: {
    label: "Romance",
    swatch: "🌹",
    gradientTint: "rgba(190, 18, 60, 0.22)",
    vibeLabel: "You're Invited",
    backAccent: "#BE123C",
    backBgDark: "#1A0A10",
    backBgLight: "#FFF1F2",
    pageTintDark: "rgba(190, 18, 60, 0.20)",
    pageTintLight: "rgba(190, 18, 60, 0.10)",
    chipAccent: "#BE123C",
    effectPreset: "rose_petals",
  },
  celebration: {
    label: "Celebration",
    swatch: "🎆",
    gradientTint: "rgba(255, 215, 0, 0.25)",
    vibeLabel: "Let's Celebrate",
    backAccent: "#FFD700",
    backBgDark: "#0A0E2A",
    backBgLight: "#FFF8E1",
    pageTintDark: "rgba(255, 215, 0, 0.20)",
    pageTintLight: "rgba(255, 215, 0, 0.10)",
    chipAccent: "#FFD700",
    effectPreset: "firework_burst",
  },
  valentines: {
    label: "Valentine's",
    swatch: "💕",
    gradientTint: "rgba(236, 72, 153, 0.25)",
    vibeLabel: "You're Invited",
    backAccent: "#EC4899",
    backBgDark: "#2A0A1E",
    backBgLight: "#FFF0F5",
    pageTintDark: "rgba(236, 72, 153, 0.22)",
    pageTintLight: "rgba(236, 72, 153, 0.12)",
    chipAccent: "#EC4899",
    effectPreset: "floating_hearts",
  },
  garden_party: {
    label: "Garden Party",
    swatch: "🌼",
    gradientTint: "rgba(132, 204, 22, 0.20)",
    vibeLabel: "You're Invited",
    backAccent: "#84CC16",
    backBgDark: "#0F1F0A",
    backBgLight: "#F7FEE7",
    pageTintDark: "rgba(132, 204, 22, 0.18)",
    pageTintLight: "rgba(132, 204, 22, 0.10)",
    chipAccent: "#84CC16",
    effectPreset: "dandelion_seeds",
  },
  spring_brunch: {
    label: "Spring Brunch",
    swatch: "🦋",
    gradientTint: "rgba(250, 204, 21, 0.18)",
    vibeLabel: "You're Invited",
    backAccent: "#A78BFA",
    backBgDark: "#1A1530",
    backBgLight: "#FEFCE8",
    pageTintDark: "rgba(167, 139, 250, 0.20)",
    pageTintLight: "rgba(250, 204, 21, 0.10)",
    chipAccent: "#A78BFA",
    effectPreset: "butterfly_flutter",
  },
  easter: {
    label: "Easter",
    swatch: "🐣",
    gradientTint: "rgba(196, 181, 253, 0.22)",
    vibeLabel: "You're Invited",
    backAccent: "#A78BFA",
    backBgDark: "#1A1530",
    backBgLight: "#F5F3FF",
    pageTintDark: "rgba(196, 181, 253, 0.20)",
    pageTintLight: "rgba(196, 181, 253, 0.10)",
    chipAccent: "#A78BFA",
    effectPreset: "easter_confetti",
  },
  graduation: {
    label: "Graduation",
    swatch: "🎓",
    gradientTint: "rgba(30, 58, 138, 0.25)",
    vibeLabel: "Congratulations",
    backAccent: "#FFD700",
    backBgDark: "#0A0E2A",
    backBgLight: "#EEF2FF",
    pageTintDark: "rgba(30, 58, 138, 0.22)",
    pageTintLight: "rgba(30, 58, 138, 0.12)",
    chipAccent: "#FFD700",
    effectPreset: "graduation_toss",
  },
  bonfire_night: {
    label: "Bonfire Night",
    swatch: "🔥",
    gradientTint: "rgba(217, 119, 6, 0.25)",
    vibeLabel: "You're Invited",
    backAccent: "#D97706",
    backBgDark: "#1A120A",
    backBgLight: "#FEF3C7",
    pageTintDark: "rgba(217, 119, 6, 0.22)",
    pageTintLight: "rgba(217, 119, 6, 0.12)",
    chipAccent: "#D97706",
    effectPreset: "fireflies",
  },
  luau: {
    label: "Luau",
    swatch: "🌺",
    gradientTint: "rgba(251, 113, 133, 0.22)",
    vibeLabel: "Aloha!",
    backAccent: "#FB7185",
    backBgDark: "#1A1015",
    backBgLight: "#FFF1F2",
    pageTintDark: "rgba(251, 113, 133, 0.20)",
    pageTintLight: "rgba(251, 113, 133, 0.10)",
    chipAccent: "#FB7185",
    effectPreset: "tropical_drift",
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
