import { STATUS, HERO_WASH } from "@/ui/tokens";

export function getEventDetailTheme(isDark: boolean, colors: any) {
  return {
    default: {
      heroGradientColors: isDark
        ? (["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.6)", "rgba(0,0,0,0.88)"] as const)
        : (["transparent", "rgba(0,0,0,0.12)", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.78)"] as const),
      heroGradientLocations: [0, 0.25, 0.55, 1] as const,
      heroWashColors: isDark ? HERO_WASH.dark.colors : HERO_WASH.light.colors,
      heroWashLocations: isDark ? HERO_WASH.dark.locations : HERO_WASH.light.locations,
      heroFallbackBg: isDark ? colors.surface : "#FAFAFA",
      accentPrimary: STATUS.going.fg,
      accentSecondary: STATUS.interested.fg,
      chipTone: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
      sectionTint: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)",
    },
    warm: {
      heroGradientColors: isDark
        ? (["transparent", "rgba(30,15,0,0.35)", "rgba(30,15,0,0.6)", "rgba(20,10,0,0.88)"] as const)
        : (["transparent", "rgba(40,20,0,0.1)", "rgba(40,20,0,0.35)", "rgba(30,15,0,0.72)"] as const),
      heroGradientLocations: [0, 0.25, 0.55, 1] as const,
      heroWashColors: isDark
        ? (["rgba(40,25,15,0.6)", "rgba(0,0,0,0)"] as const)
        : (["rgba(255,245,230,0.9)", "rgba(255,255,255,0)"] as const),
      heroWashLocations: [0, 1] as const,
      heroFallbackBg: isDark ? "#1A1410" : "#FFF8F0",
      accentPrimary: "#F59E0B",
      accentSecondary: "#EC4899",
      chipTone: isDark ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.06)",
      sectionTint: isDark ? "rgba(245,158,11,0.04)" : "rgba(245,158,11,0.02)",
    },
    midnight: {
      heroGradientColors: isDark
        ? (["transparent", "rgba(10,10,30,0.4)", "rgba(10,10,30,0.65)", "rgba(5,5,20,0.92)"] as const)
        : (["transparent", "rgba(15,15,40,0.15)", "rgba(15,15,40,0.45)", "rgba(10,10,30,0.8)"] as const),
      heroGradientLocations: [0, 0.25, 0.55, 1] as const,
      heroWashColors: isDark
        ? (["rgba(15,15,45,0.7)", "rgba(0,0,0,0)"] as const)
        : (["rgba(230,230,255,0.9)", "rgba(255,255,255,0)"] as const),
      heroWashLocations: [0, 1] as const,
      heroFallbackBg: isDark ? "#0D0D1A" : "#F0F0FF",
      accentPrimary: "#818CF8",
      accentSecondary: "#A78BFA",
      chipTone: isDark ? "rgba(129,140,248,0.1)" : "rgba(129,140,248,0.06)",
      sectionTint: isDark ? "rgba(129,140,248,0.04)" : "rgba(129,140,248,0.02)",
    },
  } as const;
}
