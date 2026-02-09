/**
 * Tile – SSOT floating surface primitive.
 *
 * Elevation tiers:
 *   • Tier 0: shadow={false}  → canvas, no shadow/border-only
 *   • Tier 1: variant="standard" (default) → subtle lift (shadow light, border dark)
 *   • Tier 2: variant="accent"  → slightly stronger presence
 *
 * Dark mode: border is primary separation; accent gets a subtle bottom shadow.
 * Light mode: shadow is primary separation.
 *
 * Uses SSOT surface tokens from ThemeContext:
 *   • backgroundColor  → colors.surface
 *   • borderColor      → colors.border (dark) / colors.borderSubtle (light)
 *   • shadow           → TILE_SHADOW / TILE_SHADOW_ACCENT (light only)
 *   • accent dark      → faint bottom shadow for depth cue
 */
import React from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";
import { useTheme, TILE_SHADOW, TILE_SHADOW_ACCENT } from "@/lib/ThemeContext";
import { RADIUS } from "./layout";

/** Faint dark-mode shadow for accent tiles only (depth cue without wash). */
const DARK_ACCENT_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
} as const;

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
  radius = RADIUS.lg,
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
      : shadow && isDark && variant === "accent"
        ? DARK_ACCENT_SHADOW
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
