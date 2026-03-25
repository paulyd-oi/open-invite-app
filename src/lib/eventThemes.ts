/**
 * Event Themes V1 — SSOT for event card theme catalog.
 *
 * 5 free essentials + 21 premium (Pro) themes across themed packs.
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
  "fourth_of_july",
  // Wave A
  "new_years_eve",
  "awards_night",
  "date_night",
  "pool_party",
  // Wave B
  "anniversary",
  "beach_day",
  "cozy_night",
  "movie_night",
] as const;

export const ALL_THEME_IDS = [...BASIC_THEME_IDS, ...PREMIUM_THEME_IDS] as const;
export type ThemeId = (typeof ALL_THEME_IDS)[number];

// ─── Curated Theme Packs (picker merchandising) ──────────

export interface ThemePack {
  label: string;
  premium: boolean;
  ids: readonly ThemeId[];
}

export const THEME_PACKS: readonly ThemePack[] = [
  { label: "Essentials", premium: false, ids: BASIC_THEME_IDS },
  { label: "Celebration", premium: true, ids: ["birthday_bash", "celebration", "graduation", "fourth_of_july", "game_day", "new_years_eve", "awards_night"] },
  { label: "Romance", premium: true, ids: ["valentines", "romance_elegant", "date_night", "anniversary"] },
  { label: "Spring", premium: true, ids: ["spring_bloom", "garden_party", "spring_brunch", "easter"] },
  { label: "Summer", premium: true, ids: ["summer_splash", "bonfire_night", "luau", "pool_party", "beach_day"] },
  { label: "Seasonal & Mood", premium: true, ids: ["fall_harvest", "winter_glow", "party_night", "cozy_night", "movie_night"] },
] as const;

// ─── Visual Stack (composable layer schema) ─────────────

export interface ThemeVisualStack {
  gradient?: {
    colors: string[];
    speed?: number;      // 0 = static, default 3
    angle?: number;       // degrees, default 180
  };
  shader?: "aurora" | "shimmer" | "plasma" | "bokeh";
  particles?: string;    // effectPreset name from EFFECT_CONFIGS
  image?: {
    source: string;         // key into THEME_BACKGROUNDS registry
    opacity?: number;       // 0-1, default 0.25
    blendMode?: "normal" | "overlay" | "softLight";  // default "normal"
  };
  filter?: "film_grain" | "vignette" | "noise" | "color_shift";
  video?: {
    source: string;         // key into THEME_VIDEOS registry
    poster?: string;        // key into THEME_BACKGROUNDS for static fallback
    opacity?: number;       // 0-1, default 0.7
  };
}

// ─── Background Image Registry ──────────────────────────
// Keys match visualStack.image.source values. Actual require() calls live
// here so theme tokens stay serializable (plain strings, no require()).
// Replace placeholder PNGs with real atmospheric textures when available.

import type { ImageSourcePropType } from "react-native";

/* eslint-disable @typescript-eslint/no-var-requires */
export const THEME_BACKGROUNDS: Record<string, ImageSourcePropType> = {
  movie_night_bg: require("../../assets/theme-backgrounds/movie_night.png"),
  cozy_night_bg: require("../../assets/theme-backgrounds/cozy_night.png"),
  date_night_bg: require("../../assets/theme-backgrounds/date_night.png"),
  party_night_bg: require("../../assets/theme-backgrounds/party_night.png"),
  awards_night_bg: require("../../assets/theme-backgrounds/awards_night.png"),
  // Pass B: procedural textures
  birthday_bash_bg: require("../../assets/theme-backgrounds/birthday_bash.png"),
  celebration_bg: require("../../assets/theme-backgrounds/celebration.png"),
  game_day_bg: require("../../assets/theme-backgrounds/game_day.png"),
  garden_party_bg: require("../../assets/theme-backgrounds/garden_party.png"),
  fall_harvest_bg: require("../../assets/theme-backgrounds/fall_harvest.png"),
  bonfire_night_bg: require("../../assets/theme-backgrounds/bonfire_night.png"),
  pool_party_bg: require("../../assets/theme-backgrounds/pool_party.png"),
  valentines_bg: require("../../assets/theme-backgrounds/valentines.png"),
  winter_glow_bg: require("../../assets/theme-backgrounds/winter_glow.png"),
  new_years_eve_bg: require("../../assets/theme-backgrounds/new_years_eve.png"),
  graduation_bg: require("../../assets/theme-backgrounds/graduation.png"),
  worship_night_bg: require("../../assets/theme-backgrounds/worship_night.png"),
  spring_bloom_bg: require("../../assets/theme-backgrounds/spring_bloom.png"),
  luau_bg: require("../../assets/theme-backgrounds/luau.png"),
  movie_night_v2_bg: require("../../assets/theme-backgrounds/movie_night_v2.png"),
};

// ─── Video Background Registry ───────────────────────────
// Keys match visualStack.video.source values. Actual require() calls live
// here so theme tokens stay serializable (plain strings, no require()).

export const THEME_VIDEOS: Record<string, number> = {
  pool_party_loop: require("../../assets/theme-videos/pool_party_loop.mp4"),
};
/* eslint-enable @typescript-eslint/no-var-requires */

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
  /** Composable visual layer stack */
  visualStack?: ThemeVisualStack;
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
    visualStack: { gradient: { colors: ["rgba(40,40,45,0.3)", "rgba(55,55,60,0.18)", "rgba(45,45,50,0.25)", "rgba(40,40,45,0.3)"], speed: 2 } },
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
    visualStack: { gradient: { colors: ["rgba(13,59,62,0.3)", "rgba(20,184,166,0.2)", "rgba(110,220,200,0.12)", "rgba(13,59,62,0.3)"], speed: 3 }, shader: "aurora", particles: "coastal_haze" },
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
    visualStack: { gradient: { colors: ["rgba(38,28,16,0.3)", "rgba(255,200,120,0.12)", "rgba(180,83,9,0.10)", "rgba(38,28,16,0.3)"], speed: 2 }, particles: "candlelight", filter: "vignette" },
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
    visualStack: { gradient: { colors: ["rgba(26,26,62,0.3)", "rgba(139,92,246,0.18)", "rgba(100,60,200,0.12)", "rgba(26,26,62,0.3)"], speed: 3 }, particles: "arcade_sparkle", shader: "plasma" },
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
    visualStack: { gradient: { colors: ["rgba(34,28,22,0.3)", "rgba(156,124,99,0.15)", "rgba(255,215,0,0.06)", "rgba(34,28,22,0.3)"], speed: 2 }, shader: "shimmer", particles: "light_rays", image: { source: "worship_night_bg", opacity: 0.15 } },
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
    visualStack: { gradient: { colors: ["rgba(10,42,56,0.3)", "rgba(0,172,193,0.18)", "rgba(245,158,11,0.08)", "rgba(10,42,56,0.3)"], speed: 3 }, particles: "rising_bubbles", shader: "aurora" },
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
    visualStack: { gradient: { colors: ["rgba(40,24,12,0.3)", "rgba(217,119,6,0.15)", "rgba(185,28,28,0.10)", "rgba(40,24,12,0.3)"], speed: 2 }, particles: "falling_leaves", shader: "bokeh", filter: "vignette", image: { source: "fall_harvest_bg", opacity: 0.2 } },
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
    visualStack: { gradient: { colors: ["rgba(17,27,58,0.3)", "rgba(100,149,237,0.15)", "rgba(200,215,255,0.08)", "rgba(17,27,58,0.3)"], speed: 2 }, particles: "snowfall", shader: "shimmer", filter: "noise", image: { source: "winter_glow_bg", opacity: 0.2 } },
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
    visualStack: { gradient: { colors: ["rgba(15,46,22,0.3)", "rgba(67,160,71,0.18)", "rgba(255,215,0,0.06)", "rgba(15,46,22,0.3)"], speed: 3 }, particles: "stadium_glitter", image: { source: "game_day_bg", opacity: 0.25 }, filter: "noise" },
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
    visualStack: { gradient: { colors: ["rgba(40,18,14,0.3)", "rgba(236,72,153,0.15)", "rgba(249,115,22,0.12)", "rgba(40,18,14,0.3)"], speed: 3 }, particles: "party_confetti", image: { source: "birthday_bash_bg", opacity: 0.25 } },
  },
  party_night: {
    label: "Party Night",
    swatch: "🪩",
    gradientTint: "rgba(139, 92, 246, 0.32)",
    vibeLabel: "Let's Party",
    backAccent: "#A855F7",
    backBgDark: "#0D0322",
    backBgLight: "#F3E8FF",
    pageTintDark: "rgba(139, 92, 246, 0.30)",
    pageTintLight: "rgba(139, 92, 246, 0.14)",
    chipAccent: "#A855F7",
    visualStack: { gradient: { colors: ["rgba(13,3,34,0.3)", "rgba(139,92,246,0.18)", "rgba(236,72,153,0.10)", "rgba(13,3,34,0.3)"], speed: 3 }, shader: "plasma", particles: "disco_pulse", image: { source: "party_night_bg", opacity: 0.15 }, filter: "color_shift" },
  },
  spring_bloom: {
    label: "Spring Bloom",
    swatch: "🌸",
    gradientTint: "rgba(34, 197, 94, 0.22)",
    vibeLabel: "You're Invited",
    backAccent: "#22C55E",
    backBgDark: "#0A1F10",
    backBgLight: "#EDFCF2",
    pageTintDark: "rgba(34, 197, 94, 0.20)",
    pageTintLight: "rgba(34, 197, 94, 0.14)",
    chipAccent: "#22C55E",
    visualStack: { gradient: { colors: ["rgba(10,31,16,0.3)", "rgba(34,197,94,0.14)", "rgba(244,163,188,0.10)", "rgba(10,31,16,0.3)"], speed: 3 }, particles: "cherry_blossom", filter: "noise", image: { source: "spring_bloom_bg", opacity: 0.2 } },
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
    visualStack: { gradient: { colors: ["rgba(26,10,16,0.3)", "rgba(190,18,60,0.14)", "rgba(212,175,55,0.06)", "rgba(26,10,16,0.3)"], speed: 2 }, particles: "rose_petals", shader: "bokeh", filter: "vignette" },
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
    visualStack: { gradient: { colors: ["rgba(10,14,42,0.3)", "rgba(255,215,0,0.12)", "rgba(239,68,68,0.08)", "rgba(10,14,42,0.3)"], speed: 3 }, particles: "firework_burst", shader: "shimmer", filter: "noise", image: { source: "celebration_bg", opacity: 0.2 } },
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
    visualStack: { gradient: { colors: ["rgba(42,10,30,0.3)", "rgba(236,72,153,0.16)", "rgba(190,18,60,0.10)", "rgba(42,10,30,0.3)"], speed: 3 }, particles: "floating_hearts", shader: "bokeh", filter: "vignette", image: { source: "valentines_bg", opacity: 0.2 } },
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
    visualStack: { gradient: { colors: ["rgba(15,31,10,0.3)", "rgba(132,204,22,0.14)", "rgba(250,204,21,0.08)", "rgba(15,31,10,0.3)"], speed: 3 }, particles: "dandelion_seeds", shader: "aurora", filter: "noise", image: { source: "garden_party_bg", opacity: 0.2 } },
  },
  spring_brunch: {
    label: "Spring Brunch",
    swatch: "🦋",
    gradientTint: "rgba(250, 204, 21, 0.20)",
    vibeLabel: "You're Invited",
    backAccent: "#A78BFA",
    backBgDark: "#1A1530",
    backBgLight: "#FEFAE0",
    pageTintDark: "rgba(167, 139, 250, 0.22)",
    pageTintLight: "rgba(167, 139, 250, 0.13)",
    chipAccent: "#A78BFA",
    visualStack: { gradient: { colors: ["rgba(26,21,48,0.3)", "rgba(255,248,235,0.12)", "rgba(167,139,250,0.10)", "rgba(26,21,48,0.3)"], speed: 3 }, particles: "butterfly_flutter", shader: "shimmer" },
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
    visualStack: { gradient: { colors: ["rgba(26,21,48,0.3)", "rgba(196,181,253,0.14)", "rgba(167,243,208,0.08)", "rgba(26,21,48,0.3)"], speed: 3 }, particles: "easter_confetti" },
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
    visualStack: { gradient: { colors: ["rgba(10,14,42,0.3)", "rgba(30,58,138,0.16)", "rgba(255,215,0,0.08)", "rgba(10,14,42,0.3)"], speed: 2 }, particles: "graduation_toss", shader: "shimmer", image: { source: "graduation_bg", opacity: 0.15 } },
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
    visualStack: { gradient: { colors: ["rgba(26,18,10,0.3)", "rgba(217,119,6,0.14)", "rgba(185,28,28,0.08)", "rgba(26,18,10,0.3)"], speed: 2 }, shader: "bokeh", particles: "fireflies", filter: "film_grain", image: { source: "bonfire_night_bg", opacity: 0.2 } },
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
    visualStack: { gradient: { colors: ["rgba(26,16,21,0.3)", "rgba(251,113,133,0.15)", "rgba(20,184,166,0.08)", "rgba(26,16,21,0.3)"], speed: 3 }, particles: "tropical_drift", shader: "aurora", image: { source: "luau_bg", opacity: 0.25 } },
  },
  fourth_of_july: {
    label: "4th of July",
    swatch: "🇺🇸",
    gradientTint: "rgba(60, 59, 110, 0.28)",
    vibeLabel: "Happy 4th!",
    backAccent: "#B22234",
    backBgDark: "#0A0A1E",
    backBgLight: "#EEF0FF",
    pageTintDark: "rgba(60, 59, 110, 0.24)",
    pageTintLight: "rgba(60, 59, 110, 0.12)",
    chipAccent: "#B22234",
    visualStack: { gradient: { colors: ["rgba(10,10,30,0.3)", "rgba(178,34,52,0.14)", "rgba(60,59,110,0.12)", "rgba(10,10,30,0.3)"], speed: 3 }, particles: "patriot_stars", filter: "noise" },
  },

  // ── Wave A Premium ──
  new_years_eve: {
    label: "New Year's Eve",
    swatch: "🥂",
    gradientTint: "rgba(255, 215, 0, 0.22)",
    vibeLabel: "Happy New Year!",
    backAccent: "#FFD700",
    backBgDark: "#0A0A18",
    backBgLight: "#FFF9E6",
    pageTintDark: "rgba(255, 215, 0, 0.18)",
    pageTintLight: "rgba(255, 215, 0, 0.08)",
    chipAccent: "#FFD700",
    visualStack: { gradient: { colors: ["rgba(10,10,24,0.3)", "rgba(255,215,0,0.10)", "rgba(168,85,247,0.06)", "rgba(10,10,24,0.3)"], speed: 3 }, particles: "nye_burst", filter: "vignette", image: { source: "new_years_eve_bg", opacity: 0.2 } },
  },
  awards_night: {
    label: "Awards Night",
    swatch: "🏆",
    gradientTint: "rgba(212, 175, 55, 0.20)",
    vibeLabel: "You're Invited",
    backAccent: "#D4AF37",
    backBgDark: "#0E0C08",
    backBgLight: "#FBF6EA",
    pageTintDark: "rgba(212, 175, 55, 0.16)",
    pageTintLight: "rgba(212, 175, 55, 0.08)",
    chipAccent: "#D4AF37",
    visualStack: { gradient: { colors: ["rgba(14,12,8,0.3)", "rgba(212,175,55,0.12)", "rgba(255,235,180,0.06)", "rgba(14,12,8,0.3)"], speed: 2 }, shader: "shimmer", particles: "golden_sparkle", image: { source: "awards_night_bg", opacity: 0.18 }, filter: "vignette" },
  },
  date_night: {
    label: "Date Night",
    swatch: "🕯️",
    gradientTint: "rgba(180, 83, 9, 0.22)",
    vibeLabel: "You're Invited",
    backAccent: "#B45309",
    backBgDark: "#1A120A",
    backBgLight: "#FDF4E8",
    pageTintDark: "rgba(180, 83, 9, 0.18)",
    pageTintLight: "rgba(180, 83, 9, 0.08)",
    chipAccent: "#B45309",
    visualStack: { gradient: { colors: ["rgba(26,18,10,0.3)", "rgba(136,19,55,0.14)", "rgba(180,83,9,0.10)", "rgba(26,18,10,0.3)"], speed: 2 }, shader: "bokeh", particles: "date_night_glow", image: { source: "date_night_bg", opacity: 0.18 }, filter: "vignette" },
  },
  pool_party: {
    label: "Pool Party",
    swatch: "🏊",
    gradientTint: "rgba(6, 182, 212, 0.28)",
    vibeLabel: "Dive In!",
    backAccent: "#06B6D4",
    backBgDark: "#0A2530",
    backBgLight: "#ECFEFF",
    pageTintDark: "rgba(6, 182, 212, 0.26)",
    pageTintLight: "rgba(6, 182, 212, 0.14)",
    chipAccent: "#06B6D4",
    visualStack: { gradient: { colors: ["rgba(10,37,48,0.3)", "rgba(6,182,212,0.18)", "rgba(147,197,253,0.08)", "rgba(10,37,48,0.3)"], speed: 3 }, particles: "pool_shimmer", image: { source: "pool_party_bg", opacity: 0.25 }, video: { source: "pool_party_loop", poster: "pool_party_bg", opacity: 0.7 } },
  },

  // ── Wave B Premium ──
  anniversary: {
    label: "Anniversary",
    swatch: "💍",
    gradientTint: "rgba(212, 175, 55, 0.18)",
    vibeLabel: "Cheers to Us",
    backAccent: "#C9A84C",
    backBgDark: "#141008",
    backBgLight: "#FDF8EE",
    pageTintDark: "rgba(201, 168, 76, 0.16)",
    pageTintLight: "rgba(201, 168, 76, 0.08)",
    chipAccent: "#C9A84C",
    visualStack: { gradient: { colors: ["rgba(20,16,8,0.3)", "rgba(201,168,76,0.12)", "rgba(190,18,60,0.06)", "rgba(20,16,8,0.3)"], speed: 2 }, particles: "heart_float", shader: "shimmer", filter: "vignette" },
  },
  beach_day: {
    label: "Beach Day",
    swatch: "🌊",
    gradientTint: "rgba(245, 158, 11, 0.22)",
    vibeLabel: "You're Invited",
    backAccent: "#F59E0B",
    backBgDark: "#1A1408",
    backBgLight: "#FFFBEB",
    pageTintDark: "rgba(245, 158, 11, 0.18)",
    pageTintLight: "rgba(245, 158, 11, 0.10)",
    chipAccent: "#F59E0B",
    visualStack: { gradient: { colors: ["rgba(26,20,8,0.3)", "rgba(245,158,11,0.14)", "rgba(0,172,193,0.08)", "rgba(26,20,8,0.3)"], speed: 3 }, shader: "aurora", particles: "coastal_haze" },
  },
  cozy_night: {
    label: "Cozy Night",
    swatch: "🫖",
    gradientTint: "rgba(180, 120, 60, 0.22)",
    vibeLabel: "Come Hang",
    backAccent: "#B4783C",
    backBgDark: "#1A1008",
    backBgLight: "#FBF3E8",
    pageTintDark: "rgba(180, 120, 60, 0.18)",
    pageTintLight: "rgba(180, 120, 60, 0.10)",
    chipAccent: "#B4783C",
    visualStack: { gradient: { colors: ["rgba(26,16,8,0.3)", "rgba(180,120,60,0.14)", "rgba(100,60,20,0.10)", "rgba(26,16,8,0.3)"], speed: 2 }, shader: "bokeh", particles: "candlelight", image: { source: "cozy_night_bg", opacity: 0.2 }, filter: "vignette" },
  },
  movie_night: {
    label: "Movie Night",
    swatch: "🎬",
    gradientTint: "rgba(100, 110, 130, 0.24)",
    vibeLabel: "Showtime",
    backAccent: "#64748B",
    backBgDark: "#0F1218",
    backBgLight: "#F1F5F9",
    pageTintDark: "rgba(100, 116, 139, 0.22)",
    pageTintLight: "rgba(100, 116, 139, 0.10)",
    chipAccent: "#64748B",
    visualStack: { gradient: { colors: ["rgba(15,18,24,0.3)", "rgba(50,55,70,0.15)", "rgba(100,116,139,0.08)", "rgba(15,18,24,0.3)"], speed: 2 }, shader: "shimmer", particles: "projector_dust", image: { source: "movie_night_v2_bg", opacity: 0.15 }, filter: "film_grain" },
  },
};

// ─── Seasonal Visibility (picker-only, does not remove from catalog) ──

/**
 * Month-based visibility windows for seasonal themes.
 * [startMonth, endMonth] inclusive, 1-indexed. Wraps across year boundary
 * when start > end (e.g. [11, 1] = Nov, Dec, Jan).
 * Themes absent from this map are evergreen (always visible).
 */
const THEME_SEASON: Partial<Record<ThemeId, [start: number, end: number]>> = {
  valentines:     [1, 2],
  spring_bloom:   [3, 5],
  garden_party:   [3, 5],
  spring_brunch:  [3, 5],
  easter:         [3, 5],
  graduation:     [4, 6],
  summer_splash:  [5, 8],
  luau:           [5, 8],
  bonfire_night:  [5, 8],
  pool_party:     [5, 8],
  beach_day:      [5, 8],
  fourth_of_july: [6, 7],
  fall_harvest:   [9, 11],
  winter_glow:    [11, 1],
  new_years_eve:  [12, 1],
};

/** True if `themeId` should appear in the picker for the given date. */
export function isThemeVisibleInPicker(themeId: ThemeId, now: Date = new Date()): boolean {
  const window = THEME_SEASON[themeId];
  if (!window) return true; // evergreen
  const m = now.getMonth() + 1; // 1-indexed
  const [s, e] = window;
  return s <= e ? m >= s && m <= e : m >= s || m <= e;
}

/**
 * Return THEME_PACKS filtered to only include seasonally-visible themes.
 * Packs whose visible list becomes empty are omitted entirely.
 * `preserve` injects an extra theme ID that must remain visible regardless
 * of season (used in edit flow for the event's current theme).
 */
export function getVisibleThemePacks(
  now: Date = new Date(),
  preserve?: ThemeId | null,
): ThemePack[] {
  const result: ThemePack[] = [];
  for (const pack of THEME_PACKS) {
    const visibleIds = pack.ids.filter(
      (tid) => isThemeVisibleInPicker(tid, now) || tid === preserve,
    ) as readonly ThemeId[];
    if (visibleIds.length > 0) {
      result.push({ ...pack, ids: visibleIds });
    }
  }
  return result;
}

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
