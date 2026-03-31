/**
 * ThemeTray — Two-stage theme picker for the create page.
 *
 * Compact: Horizontal swatch rail of starter presets. Lightweight, visual-first.
 *
 * Expanded: Live Theme Studio — inline gradient/shader editor that applies
 * directly to the current draft. No preset names, no save flow.
 *
 * Material: BlurView frosted glass, soft shadow, rounded corners.
 * Mirrors EffectTray interaction model for consistency.
 */

import React, { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronUp, ChevronDown, Lock, X } from "@/ui/icons";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import {
  EVENT_THEMES,
  isPremiumTheme,
  THEME_DISPLAY_ORDER,
  type ThemeId,
  type ThemeVisualStack,
} from "@/lib/eventThemes";
import type { CustomTheme } from "@/lib/customThemeStorage";
import { useThemeBuilderStore } from "@/lib/themeBuilderStore";

// ─── Constants ───────────────────────────────────────────────

const TRAY_HEIGHT = 106;
const STUDIO_HEIGHT_PCT = 0.54;
const SWATCH_SIZE = 42;
const SWATCH_RADIUS = 21;
const SWATCH_GAP = 8;
const BORDER_RADIUS = 22;
const TIMING_CONFIG = { duration: 280, easing: Easing.out(Easing.cubic) };

// ─── Studio palette & options ────────────────────────────────

const CURATED_COLORS = [
  "#0A0A18", "#1C1C1E", "#3B82F6", "#1E40AF", "#6495ED",
  "#14B8A6", "#00ACC1", "#06B6D4", "#8B5CF6", "#A855F7",
  "#FF9800", "#D97706", "#FF6B4A", "#BE123C", "#EC4899",
  "#22C55E", "#43A047", "#FFD700", "#F5F5F5", "#D4AF37",
] as const;

const SHADER_OPTIONS: { key: string; label: string; color: string }[] = [
  { key: "", label: "None", color: "transparent" },
  { key: "aurora", label: "Aurora", color: "#1A9968" },
  { key: "shimmer", label: "Shimmer", color: "#FFF3CC" },
  { key: "plasma", label: "Plasma", color: "#CC3380" },
  { key: "bokeh", label: "Bokeh", color: "#FFD999" },
];

const MAX_GRADIENT_COLORS = 3;

// ─── Props ───────────────────────────────────────────────────

interface ThemeTrayProps {
  visible: boolean;
  selectedThemeId: ThemeId | null;
  selectedCustomTheme: CustomTheme | null;
  userIsPro: boolean;
  isDark: boolean;
  themeColor: string;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  onSelectTheme: (id: ThemeId | null) => void;
  onSelectCustomTheme: (ct: CustomTheme | null) => void;
  onOpenPaywall: (source: string) => void;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────

export const ThemeTray = memo(function ThemeTray({
  visible,
  selectedThemeId,
  selectedCustomTheme,
  userIsPro,
  isDark,
  themeColor,
  glassText,
  glassSecondary,
  glassTertiary,
  onSelectTheme,
  onSelectCustomTheme,
  onOpenPaywall,
  onClose,
}: ThemeTrayProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= 768;
  const screenH = Dimensions.get("window").height;
  const studioHeight = Math.round(screenH * STUDIO_HEIGHT_PCT);

  const [expanded, setExpanded] = useState(false);
  const animHeight = useSharedValue(TRAY_HEIGHT);

  // ── Expand / Collapse ──
  const expand = useCallback(() => {
    setExpanded(true);
    animHeight.value = withTiming(studioHeight, TIMING_CONFIG);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [animHeight, studioHeight]);

  const collapse = useCallback(() => {
    setExpanded(false);
    animHeight.value = withTiming(TRAY_HEIGHT, TIMING_CONFIG);
  }, [animHeight]);

  const handleSelectTheme = useCallback((id: ThemeId | null) => {
    Haptics.selectionAsync();
    onSelectTheme(id);
    if (expanded) collapse();
  }, [onSelectTheme, expanded, collapse]);

  // ── Drag gesture on handle ──
  const dragStartY = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = animHeight.value;
    })
    .onUpdate((e) => {
      const newH = dragStartY.value - e.translationY;
      animHeight.value = Math.max(TRAY_HEIGHT, Math.min(studioHeight, newH));
    })
    .onEnd((e) => {
      const midpoint = (TRAY_HEIGHT + studioHeight) / 2;
      if (e.velocityY < -300 || (e.velocityY >= -300 && animHeight.value > midpoint)) {
        animHeight.value = withTiming(studioHeight, TIMING_CONFIG);
        runOnJS(setExpanded)(true);
      } else {
        animHeight.value = withTiming(TRAY_HEIGHT, TIMING_CONFIG);
        runOnJS(setExpanded)(false);
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    height: animHeight.value,
  }));

  // Reset expanded state when tray is hidden
  const prevVisible = useRef(visible);
  if (!visible && prevVisible.current) {
    if (expanded) setExpanded(false);
    animHeight.value = TRAY_HEIGHT;
  }
  prevVisible.current = visible;

  if (!visible) return null;

  const trayBottom = insets.bottom + 64;
  const backdropBottom = insets.bottom + 56;

  return (
    <>
      {/* Transparent backdrop — tap outside to dismiss */}
      <Pressable
        style={[styles.backdrop, { bottom: backdropBottom }]}
        onPress={onClose}
      />
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(180)}
        style={[
          styles.outerContainer,
          { bottom: trayBottom },
          isWide && {
            left: Math.max(12, (screenWidth - 540) / 2),
            right: Math.max(12, (screenWidth - 540) / 2),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.trayShell,
            animStyle,
            {
              borderWidth: 0.5,
              borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
            },
          ]}
        >
          <BlurView
            intensity={isDark ? 60 : 50}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? "rgba(28, 28, 30, 0.72)"
                  : "rgba(255, 255, 255, 0.78)",
                borderRadius: BORDER_RADIUS,
              },
            ]}
          />

          {/* ── Drag Handle + expand hint ── */}
          <GestureDetector gesture={panGesture}>
            <Animated.View style={styles.handleArea}>
              <Pressable
                onPress={expanded ? collapse : expand}
                hitSlop={12}
                style={styles.handlePressable}
              >
                <View
                  style={[
                    styles.handleBar,
                    { backgroundColor: isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.12)" },
                  ]}
                />
                {!expanded && (
                  <ChevronUp
                    size={10}
                    color={isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)"}
                    style={{ position: "absolute", right: -18, top: 3 }}
                  />
                )}
              </Pressable>
            </Animated.View>
          </GestureDetector>

          {/* ── Content ── */}
          {expanded ? (
            <ThemeStudio
              selectedThemeId={selectedThemeId}
              selectedCustomTheme={selectedCustomTheme}
              isDark={isDark}
              themeColor={themeColor}
              glassText={glassText}
              glassSecondary={glassSecondary}
              glassTertiary={glassTertiary}
              onSelectCustomTheme={onSelectCustomTheme}
              onCollapse={collapse}
            />
          ) : (
            <ThemeTrayContent
              selectedThemeId={selectedThemeId}
              themeColor={themeColor}
              isDark={isDark}
              userIsPro={userIsPro}
              onSelectTheme={handleSelectTheme}
              onOpenPaywall={onOpenPaywall}
            />
          )}
        </Animated.View>
      </Animated.View>
    </>
  );
});

// ─── Tray Content (Compact Mode) ────────────────────────────

interface ThemeTrayContentProps {
  selectedThemeId: ThemeId | null;
  themeColor: string;
  isDark: boolean;
  userIsPro: boolean;
  onSelectTheme: (id: ThemeId | null) => void;
  onOpenPaywall: (source: string) => void;
}

function ThemeTrayContent({
  selectedThemeId,
  themeColor,
  isDark,
  userIsPro,
  onSelectTheme,
  onOpenPaywall,
}: ThemeTrayContentProps) {
  return (
    <View style={styles.trayBody}>
      {/* Horizontal swatch rail */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.compactRailContent}
        style={styles.compactRail}
      >
        {THEME_DISPLAY_ORDER.map((tid) => {
          const t = EVENT_THEMES[tid];
          const selected = selectedThemeId === tid;
          const premium = isPremiumTheme(tid);
          const locked = premium && !userIsPro;

          return (
            <MiniCardSwatch
              key={tid}
              accentColor={t.backAccent}
              bodyColor={t.backBgLight}
              isSelected={selected}
              locked={locked}
              themeColor={themeColor}
              isDark={isDark}
              onPress={() => {
                if (locked) {
                  onOpenPaywall("theme_picker");
                  return;
                }
                onSelectTheme(selected ? null : tid);
              }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Mini Card Swatch ────────────────────────────────────────

function MiniCardSwatch({
  accentColor,
  bodyColor,
  isSelected,
  locked,
  themeColor,
  isDark,
  onPress,
}: {
  accentColor: string;
  bodyColor: string;
  isSelected: boolean;
  locked?: boolean;
  themeColor: string;
  isDark: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          width: SWATCH_SIZE,
          height: SWATCH_SIZE,
          borderRadius: SWATCH_RADIUS,
          overflow: "hidden",
          borderWidth: isSelected ? 2.5 : 0.5,
          borderColor: isSelected
            ? themeColor
            : (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"),
          opacity: locked ? 0.45 : 1,
        }}
      >
        <LinearGradient
          colors={[accentColor, bodyColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </View>
      {locked && (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.35)",
            borderRadius: SWATCH_RADIUS,
          }}
        >
          <Lock size={9} color="rgba(255,255,255,0.8)" />
        </View>
      )}
    </Pressable>
  );
}

// ─── Theme Studio (Expanded Mode) ───────────────────────────
// Live gradient/shader editor. Edits apply to current draft only.
// No save flow — transient CustomTheme pushed via onSelectCustomTheme.

interface ThemeStudioProps {
  selectedThemeId: ThemeId | null;
  selectedCustomTheme: CustomTheme | null;
  isDark: boolean;
  themeColor: string;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  onSelectCustomTheme: (ct: CustomTheme | null) => void;
  onCollapse: () => void;
}

function ThemeStudio({
  selectedThemeId,
  selectedCustomTheme,
  isDark,
  themeColor,
  glassText,
  glassSecondary,
  glassTertiary,
  onSelectCustomTheme,
  onCollapse,
}: ThemeStudioProps) {
  const visualStack = useThemeBuilderStore((s) => s.visualStack);
  const setGradient = useThemeBuilderStore((s) => s.setGradient);
  const setShader = useThemeBuilderStore((s) => s.setShader);
  const hydrate = useThemeBuilderStore((s) => s.hydrate);

  const glassBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  // Hydrate builder from current selection on mount
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    let initialStack: ThemeVisualStack | undefined;
    if (selectedCustomTheme) {
      initialStack = selectedCustomTheme.visualStack;
    } else if (selectedThemeId) {
      initialStack = EVENT_THEMES[selectedThemeId].visualStack;
    }

    if (initialStack) {
      hydrate("Draft", initialStack);
    }
  }, [selectedThemeId, selectedCustomTheme, hydrate]);

  const gradientColors = visualStack.gradient?.colors ?? [];
  const gradientSpeed = visualStack.gradient?.speed ?? 3;
  const selectedShader = visualStack.shader ?? "";
  const sliderValue = 0.5 + ((gradientSpeed - 1) / 5) * 1.5;

  // Push edits to create.tsx as a transient CustomTheme
  const pushDraft = useCallback((stack: ThemeVisualStack) => {
    onSelectCustomTheme({
      id: "__draft__",
      name: "Custom",
      visualStack: stack,
      createdAt: "",
      updatedAt: "",
    });
  }, [onSelectCustomTheme]);

  const handleToggleColor = useCallback((color: string) => {
    Haptics.selectionAsync();
    const current = [...gradientColors];
    const idx = current.indexOf(color);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      if (current.length >= MAX_GRADIENT_COLORS) return;
      current.push(color);
    }
    setGradient(current, gradientSpeed);
    pushDraft({ ...visualStack, gradient: { colors: current, speed: gradientSpeed } });
  }, [gradientColors, gradientSpeed, setGradient, pushDraft, visualStack]);

  const handleRemoveColor = useCallback((idx: number) => {
    Haptics.selectionAsync();
    const next = gradientColors.filter((_, i) => i !== idx);
    setGradient(next, gradientSpeed);
    pushDraft({ ...visualStack, gradient: { colors: next, speed: gradientSpeed } });
  }, [gradientColors, gradientSpeed, setGradient, pushDraft, visualStack]);

  const handleSpeedChange = useCallback((value: number) => {
    const speed = Math.round(1 + (value - 0.5) * (5 / 1.5));
    setGradient(gradientColors, speed);
    pushDraft({ ...visualStack, gradient: { colors: gradientColors, speed } });
  }, [gradientColors, setGradient, pushDraft, visualStack]);

  const handleResetGradient = useCallback(() => {
    Haptics.selectionAsync();
    setGradient([], 3);
    pushDraft({ ...visualStack, gradient: { colors: [], speed: 3 } });
  }, [setGradient, pushDraft, visualStack]);

  const handleSelectShader = useCallback((key: string) => {
    Haptics.selectionAsync();
    const shader = (key || undefined) as ThemeVisualStack["shader"];
    setShader(shader ?? null);
    pushDraft({ ...visualStack, shader });
  }, [setShader, pushDraft, visualStack]);

  return (
    <View style={styles.studioBody}>
      {/* Header row */}
      <View style={styles.studioHeader}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: glassText }}>
          Theme Studio
        </Text>
        <Pressable onPress={onCollapse} hitSlop={8} style={styles.collapseBtn}>
          <ChevronDown size={12} color={themeColor} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
      >
        {/* ── Gradient Colors ── */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: glassSecondary, fontSize: 12, fontWeight: "600", letterSpacing: 0.3 }}>
            GRADIENT COLORS
          </Text>
          <Pressable onPress={handleResetGradient} hitSlop={8}>
            <Text style={{ color: glassTertiary, fontSize: 11, fontWeight: "500" }}>
              Reset
            </Text>
          </Pressable>
        </View>

        {gradientColors.length === 0 && (
          <Text style={{ color: glassTertiary, fontSize: 11, fontStyle: "italic", marginBottom: 8 }}>
            Tap colors to start
          </Text>
        )}
        {gradientColors.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {gradientColors.map((c, i) => (
              <View
                key={`${c}-${i}`}
                style={{
                  flexDirection: "row", alignItems: "center",
                  backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                  borderRadius: 16, paddingLeft: 3, paddingRight: 6, paddingVertical: 3,
                }}
              >
                <View style={{
                  width: 18, height: 18, borderRadius: 9,
                  backgroundColor: c, marginRight: 4,
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
                }} />
                <Text style={{ color: glassSecondary, fontSize: 10, fontWeight: "500", fontFamily: "monospace" }}>
                  {c}
                </Text>
                <Pressable onPress={() => handleRemoveColor(i)} style={{ marginLeft: 4, padding: 2 }}>
                  <X size={10} color={glassTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CURATED_COLORS.map((color) => {
            const selected = gradientColors.includes(color);
            const disabled = !selected && gradientColors.length >= MAX_GRADIENT_COLORS;
            return (
              <Pressable
                key={color}
                onPress={() => handleToggleColor(color)}
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  backgroundColor: color,
                  borderWidth: selected ? 2.5 : 1,
                  borderColor: selected ? "#FFFFFF" : "rgba(255,255,255,0.12)",
                  opacity: disabled ? 0.35 : 1,
                  justifyContent: "center", alignItems: "center",
                }}
              >
                {selected && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" }} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* ── Animation Speed ── */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: glassSecondary, fontSize: 12, fontWeight: "600", marginBottom: 4, letterSpacing: 0.3 }}>
            SPEED
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: glassTertiary, fontSize: 10 }}>Slow</Text>
            <View style={{ flex: 1 }}>
              <Slider
                minimumValue={0.5}
                maximumValue={2}
                step={0.1}
                value={sliderValue}
                onValueChange={handleSpeedChange}
                minimumTrackTintColor={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)"}
                maximumTrackTintColor={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}
                thumbTintColor="#FFFFFF"
              />
            </View>
            <Text style={{ color: glassTertiary, fontSize: 10 }}>Fast</Text>
          </View>
        </View>

        {/* ── Shader ── */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: glassSecondary, fontSize: 12, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 }}>
            SHADER
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {SHADER_OPTIONS.map((opt) => {
              const active = selectedShader === opt.key;
              return (
                <Pressable
                  key={opt.key || "_none"}
                  onPress={() => handleSelectShader(opt.key)}
                  style={{
                    flexDirection: "row", alignItems: "center",
                    paddingHorizontal: 12, paddingVertical: 6,
                    borderRadius: 16,
                    borderWidth: active ? 1.5 : 1,
                    borderColor: active ? "#FFFFFF" : glassBorder,
                    backgroundColor: active
                      ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)")
                      : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
                  }}
                >
                  {opt.color !== "transparent" && (
                    <View style={{
                      width: 12, height: 12, borderRadius: 6,
                      backgroundColor: opt.color, marginRight: 5,
                      borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
                    }} />
                  )}
                  <Text style={{
                    color: active ? glassText : glassSecondary,
                    fontSize: 11, fontWeight: active ? "600" : "400",
                  }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  outerContainer: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 50,
  },
  trayShell: {
    borderRadius: BORDER_RADIUS,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 20,
  },

  // Handle
  handleArea: {
    paddingTop: 10,
    paddingBottom: 4,
    alignItems: "center",
  },
  handlePressable: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
    height: 16,
  },
  handleBar: {
    width: 32,
    height: 4,
    borderRadius: 2,
  },

  // Tray body (compact)
  trayBody: {
    flex: 1,
    paddingHorizontal: 14,
  },
  compactRail: {
    flexGrow: 0,
  },
  compactRailContent: {
    gap: SWATCH_GAP,
    paddingRight: 8,
  },

  // Studio (expanded)
  studioBody: {
    flex: 1,
  },
  studioHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  collapseBtn: {
    padding: 6,
  },
});
