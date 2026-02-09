/**
 * Tile – SSOT floating surface primitive.
 *
 * Elevation tiers:
 *   • Tier 0: shadow={false}  → canvas, no shadow
 *   • Tier 1: variant="standard" (default) → subtle lift (shadow light, border dark)
 *   • Tier 2: variant="accent"  → slightly stronger, for featured/banner
 *
 * Dark mode: border is primary separation (no shadows).
 * Light mode: shadow is primary separation.
 *
 * Uses SSOT surface tokens from ThemeContext:
 *   • backgroundColor  → colors.surface
 *   • borderColor      → colors.border (dark) / colors.borderSubtle (light)
 *   • shadow           → TILE_SHADOW / TILE_SHADOW_ACCENT (light only)
 */
import React from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";
import { useTheme, TILE_SHADOW, TILE_SHADOW_ACCENT } from "@/lib/ThemeContext";

export interface TileProps extends ViewProps {
  /** Elevation tier. Default: "standard" (tier 1). */
  variant?: "standard" | "accent";
  /** Whether to apply shadow at all. Default: true in light mode. */
  shadow?: boolean;
  /** Override border radius. Default: 16 */
  radius?: number;
  children?: React.ReactNode;
}

export function Tile({
  variant = "standard",
  shadow = true,
  radius = 16,
  style,
  children,
  ...rest
}: TileProps) {
  const { isDark, colors } = useTheme();

  const elevationStyle =
    shadow && !isDark
      ? variant === "accent"
        ? TILE_SHADOW_ACCENT
        : TILE_SHADOW
      : {};

  const tileStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: isDark ? colors.border : colors.borderSubtle,
    borderRadius: radius,
    overflow: "hidden" as const,
    ...elevationStyle,
  };

  return (
    <View style={[tileStyle, style]} {...rest}>
      {children}
    </View>
  );
}

export default Tile;
