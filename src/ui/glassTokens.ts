/**
 * glassTokens — shared glass-morphism styling tokens.
 * Single source of truth for the glass chrome system used
 * across Who's Free, Circle Calendar, and future surfaces.
 */

export interface GlassTokens {
  card: {
    backgroundColor: string;
    borderWidth: number;
    borderColor: string;
    borderRadius: number;
  };
  label: {
    color: string;
    fontSize: number;
    fontWeight: "600";
    letterSpacing: number;
  };
  value: {
    color: string;
    fontSize: number;
    fontWeight: "500";
  };
}

/**
 * Build glass tokens from theme state.
 * @param isDark  – current theme mode
 * @param colors  – full color palette from useTheme()
 */
export function buildGlassTokens(
  isDark: boolean,
  colors: { surface: string; borderSubtle: string; textTertiary: string; text: string },
): GlassTokens {
  return {
    card: {
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : colors.surface,
      borderWidth: 0.5,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : colors.borderSubtle,
      borderRadius: 16,
    },
    label: {
      color: isDark ? "rgba(255,255,255,0.4)" : colors.textTertiary,
      fontSize: 11,
      fontWeight: "600" as const,
      letterSpacing: 0.5,
    },
    value: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "500" as const,
    },
  };
}
