/**
 * Tile – Reusable floating surface primitive.
 *
 * Usage:
 *   <Tile>…content…</Tile>
 *   <Tile shadow={false}>…flat tile…</Tile>
 *
 * Uses SSOT surface tokens from ThemeContext:
 *   • backgroundColor  → colors.surface
 *   • borderColor      → colors.borderSubtle
 *   • shadow           → TILE_SHADOW (light mode only)
 */
import React from "react";
import { View, type ViewProps, type ViewStyle, StyleSheet } from "react-native";
import { useTheme, TILE_SHADOW } from "@/lib/ThemeContext";

export interface TileProps extends ViewProps {
  /** Whether to apply the subtle shadow. Default: true in light mode. */
  shadow?: boolean;
  /** Override border radius. Default: 16 */
  radius?: number;
  children?: React.ReactNode;
}

export function Tile({ shadow = true, radius = 16, style, children, ...rest }: TileProps) {
  const { isDark, colors } = useTheme();

  const tileStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius,
    overflow: "hidden" as const,
    ...(shadow && !isDark ? TILE_SHADOW : {}),
  };

  return (
    <View style={[tileStyle, style]} {...rest}>
      {children}
    </View>
  );
}

export default Tile;
