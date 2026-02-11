import type { ViewStyle } from "react-native";

/**
 * Hero / Banner SSOT helpers.
 *
 * Centralizes banner URI resolution and glass-panel styling so every
 * screen that renders a hero card shares a single source of truth.
 */

// ── Banner resolver ──────────────────────────────────────────────
/**
 * Resolve a banner URI from any profile-like object.
 * Priority: bannerPhotoUrl → bannerUrl → null.
 */
export function resolveBannerUri(profile?: Record<string, unknown> | null): string | null {
  if (!profile) return null;

  const uri = (profile.bannerPhotoUrl ?? profile.bannerUrl ?? null) as
    | string
    | null
    | undefined;

  return typeof uri === "string" && uri.length > 0 ? uri : null;
}

// ── Glass panel style ────────────────────────────────────────────
/**
 * Returns the "fake glass" panel style used behind text sitting on a
 * banner image.  Caller passes `isDark` — no theme dependency here.
 */
export function getHeroGlassStyle(isDark: boolean): ViewStyle {
  return {
    backgroundColor: isDark
      ? "rgba(0,0,0,0.38)"
      : "rgba(255,255,255,0.72)",
    borderColor: isDark
      ? "rgba(255,255,255,0.16)"
      : "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow: "hidden",
  };
}

// ── Glass legibility boost ───────────────────────────────────────
/**
 * Style for the absolute-positioned bottom overlay inside the glass
 * panel that deepens legibility without LinearGradient.
 */
export function getGlassBoostStyle(isDark: boolean): ViewStyle {
  return {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%" as unknown as number, // RN accepts percentage strings at runtime
    backgroundColor: isDark ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.18)",
  };
}

// ── Hero contrast text tokens ────────────────────────────────────
/**
 * High-contrast primary text color for hero glass panels.
 * Use ONLY inside banner-backed glass — not for general UI text.
 */
export function getHeroTextColor(isDark: boolean): string {
  return isDark ? "#FFFFFF" : "#111111";
}

/**
 * High-contrast secondary text color for hero glass panels.
 * Use ONLY inside banner-backed glass — not for general UI text.
 */
export function getHeroSubTextColor(isDark: boolean): string {
  return isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)";
}
