/**
 * SafeAreaScreen — SSOT safe-area wrapper for full-screen content.
 *
 * Uses `useSafeAreaInsets()` (JS-side context) instead of `<SafeAreaView>`
 * (native component). This is critical because SafeAreaView re-measures
 * insets asynchronously even when SafeAreaProvider has initialWindowMetrics,
 * causing a visible layout reflow on cold start. The hook reads from the
 * JS context populated synchronously by initialWindowMetrics, so there is
 * no async native measurement and therefore no layout jump.
 *
 * Usage:
 *   <SafeAreaScreen edges="both" style={{ backgroundColor: '#fff' }}>
 *     {children}
 *   </SafeAreaScreen>
 *
 * DEV proof tag: [P0_SAFE_AREA_SSOT]
 */
import React from "react";
import { View, type ViewStyle, type StyleProp } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type SafeAreaEdges = "both" | "top" | "bottom" | "none";

interface SafeAreaScreenProps {
  children: React.ReactNode;
  /** Which edges to pad. Default: "both". */
  edges?: SafeAreaEdges;
  /** Extra style applied to the outer View (flex:1 is always set). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Optional onLayout handler forwarded to the outer View. */
  onLayout?: (e: any) => void;
}

export function SafeAreaScreen({
  children,
  edges = "both",
  style,
  testID,
  onLayout,
}: SafeAreaScreenProps) {
  const insets = useSafeAreaInsets();

  const paddingTop = edges === "both" || edges === "top" ? insets.top : 0;
  const paddingBottom = edges === "both" || edges === "bottom" ? insets.bottom : 0;

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={[{ flex: 1, paddingTop, paddingBottom }, style]}
    >
      {children}
    </View>
  );
}
