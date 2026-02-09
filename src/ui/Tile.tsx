/**
 * Tile – SSOT floating surface primitive.
 *
 * Elevation tiers (light mode only; dark mode = flat):
 *   • Tier 0: shadow={false}  → canvas, no shadow
 *   • Tier 1: variant="standard" (default) → subtle lift
 *   • Tier 2: variant="accent"  → slightly stronger, for featured/banner
 *
 * Uses SSOT surface tokens from ThemeContext:
 *   • backgroundColor  → colors.surface
 *   • borderColor      → colors.borderSubtle
 *   • shadow           → TILE_SHADOW / TILE_SHADOW_ACCENT
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
    borderColor: colors.borderSubtle,
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
