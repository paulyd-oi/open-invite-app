/**
 * tokens.ts – Semantic visual tokens for status colors, overlays & gradients.
 *
 * Theme-independent constants that don't belong in ThemeContext (which handles
 * light/dark surface palettes) or layout.ts (spacing/radius/hit-targets).
 *
 * Usage: import { STATUS, HERO_GRADIENT, SCRIM } from "@/ui/tokens";
 */

// ─── Semantic Status Colors ──────────────────────────────
// Each status has: fg (foreground), bgSoft (tinted background), border.

export const STATUS = {
  interested: {
    fg: "#EC4899",
    bgSoft: "rgba(236,72,153,0.14)",
    border: "rgba(236,72,153,0.28)",
  },
  going: {
    fg: "#22C55E",
    bgSoft: "rgba(34,197,94,0.14)",
    border: "rgba(34,197,94,0.28)",
  },
  soon: {
    fg: "#F97316",
    bgSoft: "rgba(249,115,22,0.14)",
    border: "rgba(249,115,22,0.28)",
  },
  info: {
    fg: "#6366F1",
    bgSoft: "rgba(99,102,241,0.14)",
    border: "rgba(99,102,241,0.28)",
  },
  destructive: {
    fg: "#EF4444",
    bgSoft: "rgba(239,68,68,0.14)",
    border: "rgba(239,68,68,0.28)",
  },
  birthday: {
    fg: "#FF69B4",
    bgSoft: "rgba(255,105,180,0.14)",
    border: "rgba(255,105,180,0.28)",
  },
  warning: {
    fg: "#F59E0B",
    bgSoft: "rgba(245,158,11,0.14)",
    border: "rgba(245,158,11,0.28)",
  },
  premium: {
    fg: "#FFD700",
    bgSoft: "rgba(255,215,0,0.14)",
    border: "rgba(255,215,0,0.28)",
  },
} as const;

// ─── Hero Overlay Gradient ───────────────────────────────
// Reusable text-protection overlay for image-backed surfaces.
// Use with LinearGradient: colors={HERO_GRADIENT.colors} locations={HERO_GRADIENT.locations}

export const HERO_GRADIENT = {
  colors: [
    "rgba(0,0,0,0.18)",
    "rgba(0,0,0,0.08)",
    "rgba(0,0,0,0.62)",
  ] as const,
  locations: [0, 0.4, 1] as const,
} as const;

// ─── No-Photo Hero Wash ─────────────────────────────────
// Atmospheric gradient for event heroes without a cover photo.
// Creates an invitation-poster feel instead of a flat fallback.

export const HERO_WASH = {
  light: {
    colors: ["rgba(245,240,255,0.9)", "rgba(255,255,255,0)"] as const,
    locations: [0, 1] as const,
  },
  dark: {
    colors: ["rgba(30,25,50,0.6)", "rgba(0,0,0,0)"] as const,
    locations: [0, 1] as const,
  },
} as const;

// ─── Overlay / Scrim ────────────────────────────────────
// Semi-transparent backdrops for modals, toasts, etc.

export const SCRIM = {
  medium: "rgba(15,23,42,0.34)",
} as const;
