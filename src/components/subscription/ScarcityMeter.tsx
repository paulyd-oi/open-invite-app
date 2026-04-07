/**
 * ScarcityMeter — Animated founder-spots progress bar.
 *
 * Shows claimed/remaining out of 1,000 Founder Lifetime spots with:
 *   - Warm gradient bar that fills on mount (1.5s ease-out)
 *   - Number counting animation (0 → actual, 1s)
 *   - Urgency states: <100 amber→coral, <50 adds pulse glow
 *   - Fallback text if data unavailable
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,

  useDerivedValue,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/ThemeContext";
import { Flame } from "@/ui/icons";

// ── Palette ────────────────────────────────────────────────
// Warm ember tones — not the app's theme color. This meter
// intentionally uses its own palette to stand out as a
// scarcity signal, separate from the plan-selection UI.

const COLORS = {
  // Normal state: warm amber → gold
  barStart: "#F59E0B",
  barEnd: "#FBBF24",
  // Urgency state (<100): amber → coral
  urgentStart: "#F97316",
  urgentEnd: "#EF4444",
  // Critical state (<50): deeper red
  criticalStart: "#EF4444",
  criticalEnd: "#DC2626",
  // Track
  trackDark: "rgba(255,255,255,0.06)",
  trackLight: "rgba(0,0,0,0.05)",
  // Glow
  glowOuter: "rgba(245,158,11,0.25)",
};

const BAR_HEIGHT = 10;
const BAR_RADIUS = 5;
const FILL_DURATION = 1500;
const COUNT_DURATION = 1000;

// ── Animated number display ────────────────────────────────

function AnimatedCounter({
  value,
  progress,
  style,
  bold,
}: {
  value: number;
  progress: Animated.SharedValue<number>;
  style?: any;
  bold?: boolean;
}) {
  const [display, setDisplay] = React.useState(0);

  useDerivedValue(() => {
    const current = Math.round(interpolate(progress.value, [0, 1], [0, value]));
    runOnJS(setDisplay)(current);
  });

  return (
    <Text
      style={[style, bold && styles.bold]}
      allowFontScaling={false}
    >
      {display.toLocaleString()}
    </Text>
  );
}

// ── Main component ─────────────────────────────────────────

interface ScarcityMeterProps {
  total: number;
  claimed: number;
  label?: string;
}

export function ScarcityMeter({ total, claimed, label }: ScarcityMeterProps) {
  const { isDark, colors } = useTheme();
  const remaining = Math.max(0, total - claimed);
  const fillRatio = Math.min(1, claimed / total);
  const remainPct = total > 0 ? remaining / total : 1;

  // Urgency tiers (percentage-based for any pool size)
  const isUrgent = remainPct < 0.10;
  const isCritical = remainPct < 0.05;

  // Animation drivers
  const barProgress = useSharedValue(0);
  const countProgress = useSharedValue(0);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    // Bar fills first
    barProgress.value = withTiming(fillRatio, {
      duration: FILL_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    // Numbers count up with a slight delay
    countProgress.value = withDelay(
      200,
      withTiming(1, {
        duration: COUNT_DURATION,
        easing: Easing.out(Easing.quad),
      }),
    );
    // Pulse glow when critical
    if (isCritical) {
      pulseOpacity.value = withDelay(
        FILL_DURATION,
        withRepeat(
          withSequence(
            withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
            withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          true,
        ),
      );
    }
  }, [fillRatio, isCritical]);

  // Bar width animation
  const barStyle = useAnimatedStyle(() => ({
    width: `${barProgress.value * 100}%` as any,
  }));

  // Glow pulse (critical only)
  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Choose gradient colors based on urgency
  const gradientColors: [string, string] = isCritical
    ? [COLORS.criticalStart, COLORS.criticalEnd]
    : isUrgent
      ? [COLORS.urgentStart, COLORS.urgentEnd]
      : [COLORS.barStart, COLORS.barEnd];

  const remainingColor = isCritical
    ? COLORS.criticalEnd
    : isUrgent
      ? COLORS.urgentStart
      : COLORS.barStart;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Flame size={15} color={COLORS.barStart} />
          <Text
            style={[styles.title, { color: colors.text }]}
            allowFontScaling={false}
          >
            {label ?? "Founder Pro"}
          </Text>
        </View>
        <Text
          style={[styles.capLabel, { color: colors.textTertiary }]}
          allowFontScaling={false}
        >
          First {total.toLocaleString()}
        </Text>
      </View>

      {/* Bar track */}
      <View
        style={[
          styles.track,
          {
            backgroundColor: isDark ? COLORS.trackDark : COLORS.trackLight,
          },
        ]}
      >
        {/* Animated fill */}
        <Animated.View style={[styles.fill, barStyle]}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.fillGradient}
          />
        </Animated.View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <AnimatedCounter
            value={claimed}
            progress={countProgress}
            style={[styles.statNumber, { color: colors.textSecondary }]}
          />
          <Text
            style={[styles.statLabel, { color: colors.textTertiary }]}
            allowFontScaling={false}
          >
            {" "}claimed
          </Text>
        </View>

        <View style={styles.statRight}>
          {/* Glow backdrop for critical state */}
          {isCritical && (
            <Animated.View
              style={[
                styles.glowDot,
                { backgroundColor: COLORS.glowOuter },
                glowStyle,
              ]}
            />
          )}
          <AnimatedCounter
            value={remaining}
            progress={countProgress}
            style={[styles.statNumber, styles.bold, { color: remainingColor }]}
            bold
          />
          <Text
            style={[styles.statLabel, { color: remainingColor }]}
            allowFontScaling={false}
          >
            {" "}left
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Compact inline variant for the Founder Lifetime plan card.
 * Shows "🔥 {remaining} of 1,000 spots left" with counting animation.
 */
export function ScarcityInline({
  remaining,
  total,
}: {
  remaining: number;
  total: number;
}) {
  const remainPct = total > 0 ? remaining / total : 1;
  const isCritical = remainPct < 0.05;
  const isUrgent = remainPct < 0.10;
  const countProgress = useSharedValue(0);

  useEffect(() => {
    countProgress.value = withDelay(
      400,
      withTiming(1, {
        duration: COUNT_DURATION,
        easing: Easing.out(Easing.quad),
      }),
    );
  }, []);

  const color = isCritical
    ? COLORS.criticalEnd
    : isUrgent
      ? COLORS.urgentStart
      : COLORS.barStart;

  return (
    <View style={styles.inlineRow}>
      <Flame size={11} color={color} />
      <AnimatedCounter
        value={remaining}
        progress={countProgress}
        style={[styles.inlineNumber, { color }]}
        bold
      />
      <Text style={[styles.inlineText, { color }]} allowFontScaling={false}>
        {" "}of {total.toLocaleString()} spots left
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  capLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  track: {
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: BAR_RADIUS,
    overflow: "hidden",
  },
  fillGradient: {
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  stat: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  statRight: {
    flexDirection: "row",
    alignItems: "baseline",
    position: "relative",
  },
  statNumber: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 12,
  },
  bold: {
    fontWeight: "700",
  },
  glowDot: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    right: -4,
    top: -10,
  },
  // Inline variant
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 2,
  },
  inlineNumber: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginLeft: 3,
  },
  inlineText: {
    fontSize: 11,
    fontWeight: "500",
  },
});
