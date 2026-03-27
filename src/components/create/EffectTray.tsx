/**
 * EffectTray — Two-stage effect picker for the create page.
 *
 * Compact: Drag handle + horizontal circle swatch rail of quick-start presets.
 *
 * Expanded: Dual-pane "Effect Studio" with two tabs:
 *   - Create: Live Skia particle editor (colors, shape, density, size, speed, direction)
 *   - Animated: Verified Lottie animation presets
 *
 * Material: BlurView frosted glass, soft shadow, rounded corners.
 * All layers use pointerEvents="box-none" so nothing blocks form inputs.
 */

import React, { memo, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import Slider from "@react-native-community/slider";
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
import { ChevronDown, X } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import {
  MOTIF_PRESETS,
  MOTIF_CATEGORIES,
  CUSTOM_EFFECT_ID,
} from "./MotifOverlay";
import type { ParticleMotifConfig, MotionMode } from "./MotifOverlay";

// ─── Constants ───────────────────────────────────────────────

const TRAY_HEIGHT = 106;
const LIBRARY_HEIGHT_PCT = 0.52;
const SWATCH_SIZE = 42;
const SWATCH_GAP = 10;
const BORDER_RADIUS = 22;
const TIMING_CONFIG = { duration: 280, easing: Easing.out(Easing.cubic) };

/** Flat ordered list of unique effect IDs across all categories */
const ALL_EFFECT_IDS: string[] = (() => {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const cat of MOTIF_CATEGORIES) {
    for (const id of cat.ids) {
      if (id in MOTIF_PRESETS && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
})();

// ─── Verified Lottie presets for the Animated tab ────────────

const ANIMATED_PRESETS: { id: string; label: string; emoji: string }[] = [
  { id: "scene_confetti", label: "Confetti", emoji: "🎊" },
  { id: "scene_hearts", label: "Hearts", emoji: "💕" },
  { id: "scene_balloons", label: "Balloons", emoji: "🎈" },
  { id: "fireworks", label: "Fireworks", emoji: "🎆" },
];

// ─── Create tab constants ────────────────────────────────────

const PARTICLE_COLORS = [
  "#EF4444", "#3B82F6", "#FACC15", "#22C55E", "#EC4899",
  "#F97316", "#8B5CF6", "#14B8A6", "#FFFFFF", "#FFD700",
  "#FF6B4A", "#06B6D4", "#A855F7", "#D97706", "#BE123C",
] as const;

const SHAPE_OPTIONS: { key: string; label: string; shapes: ParticleMotifConfig["shapes"] }[] = [
  { key: "circle", label: "Circle", shapes: ["circle"] },
  { key: "square", label: "Square", shapes: ["rect"] },
  { key: "star", label: "Star", shapes: ["star"] },
  { key: "heart", label: "Heart", shapes: ["heart"] },
  { key: "mixed", label: "Mixed", shapes: ["circle", "rect", "star"] },
  { key: "confetti", label: "Confetti", shapes: ["rect", "circle", "star"] },
];

const DIRECTION_OPTIONS: { key: string; label: string; dir: 1 | -1; sway: number; mode: MotionMode }[] = [
  { key: "falling", label: "Falling", dir: 1, sway: 25, mode: "falling" },
  { key: "rising", label: "Rising", dir: -1, sway: 20, mode: "rising" },
  { key: "floating", label: "Floating", dir: 1, sway: 15, mode: "floating" },
  { key: "swirl", label: "Swirl", dir: 1, sway: 10, mode: "swirl" },
];

const MAX_EFFECT_COLORS = 5;

// ─── Props ───────────────────────────────────────────────────

interface EffectTrayProps {
  visible: boolean;
  selectedEffectId: string | null;
  themeColor: string;
  isDark: boolean;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  onSelectEffect: (key: string | null) => void;
  onCustomEffect: (config: ParticleMotifConfig | null) => void;
  /** Dismiss the tray (called on outside-tap) */
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────

export const EffectTray = memo(function EffectTray({
  visible,
  selectedEffectId,
  themeColor,
  isDark,
  glassText,
  glassSecondary,
  glassTertiary,
  onSelectEffect,
  onCustomEffect,
  onClose,
}: EffectTrayProps) {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("window").height;
  const libraryHeight = Math.round(screenH * LIBRARY_HEIGHT_PCT);

  const [expanded, setExpanded] = useState(false);
  const animHeight = useSharedValue(TRAY_HEIGHT);

  // ── Expand / Collapse ──
  const expand = useCallback(() => {
    setExpanded(true);
    animHeight.value = withTiming(libraryHeight, TIMING_CONFIG);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [animHeight, libraryHeight]);

  const collapse = useCallback(() => {
    setExpanded(false);
    animHeight.value = withTiming(TRAY_HEIGHT, TIMING_CONFIG);
  }, [animHeight]);

  const handleSelect = useCallback((key: string | null) => {
    Haptics.selectionAsync();
    onSelectEffect(key);
    // Collapse to tray after selecting in library mode
    if (expanded) {
      collapse();
    }
  }, [onSelectEffect, expanded, collapse]);

  // ── Drag gesture on handle ──
  const dragStartY = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = animHeight.value;
    })
    .onUpdate((e) => {
      const newH = dragStartY.value - e.translationY;
      animHeight.value = Math.max(TRAY_HEIGHT, Math.min(libraryHeight, newH));
    })
    .onEnd((e) => {
      const midpoint = (TRAY_HEIGHT + libraryHeight) / 2;
      if (e.velocityY < -300 || (e.velocityY >= -300 && animHeight.value > midpoint)) {
        animHeight.value = withTiming(libraryHeight, TIMING_CONFIG);
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
      <Pressable
        style={[styles.backdrop, { bottom: backdropBottom }]}
        onPress={onClose}
      />
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(180)}
        style={[styles.outerContainer, { bottom: trayBottom }]}
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

        {/* ── Drag Handle ── */}
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
            </Pressable>
          </Animated.View>
        </GestureDetector>

        {/* ── Content ── */}
        {expanded ? (
          <EffectStudio
            selectedEffectId={selectedEffectId}
            themeColor={themeColor}
            isDark={isDark}
            glassText={glassText}
            glassSecondary={glassSecondary}
            glassTertiary={glassTertiary}
            onSelectEffect={handleSelect}
            onCustomEffect={onCustomEffect}
            onCollapse={collapse}
          />
        ) : (
          <TrayContent
            selectedEffectId={selectedEffectId}
            themeColor={themeColor}
            isDark={isDark}
            glassTertiary={glassTertiary}
            onSelectEffect={handleSelect}
          />
        )}
      </Animated.View>
    </Animated.View>
    </>
  );
});

// ─── Tray Content (Compact Mode) ────────────────────────────

interface TrayContentProps {
  selectedEffectId: string | null;
  themeColor: string;
  isDark: boolean;
  glassTertiary: string;
  onSelectEffect: (key: string | null) => void;
}

function TrayContent({
  selectedEffectId,
  themeColor,
  isDark,
  glassTertiary,
  onSelectEffect,
}: TrayContentProps) {
  return (
    <View style={styles.trayBody}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.compactRailContent}
        style={styles.compactRail}
      >
        <CompactSwatch
          effectId={null}
          isSelected={!selectedEffectId}
          themeColor={themeColor}
          isDark={isDark}
          glassTertiary={glassTertiary}
          onSelect={onSelectEffect}
        />
        {ALL_EFFECT_IDS.map((id) => (
          <CompactSwatch
            key={id}
            effectId={id}
            isSelected={selectedEffectId === id}
            themeColor={themeColor}
            isDark={isDark}
            glassTertiary={glassTertiary}
            onSelect={onSelectEffect}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Compact Swatch ─────────────────────────────────────────

interface CompactSwatchProps {
  effectId: string | null;
  isSelected: boolean;
  themeColor: string;
  isDark: boolean;
  glassTertiary: string;
  onSelect: (key: string | null) => void;
}

function CompactSwatch({
  effectId,
  isSelected,
  themeColor,
  isDark,
  glassTertiary,
  onSelect,
}: CompactSwatchProps) {
  const preset = effectId ? MOTIF_PRESETS[effectId] : null;

  return (
    <Pressable onPress={() => onSelect(effectId)}>
      <View
        style={[
          styles.compactSwatchCircle,
          {
            borderWidth: isSelected ? 2.5 : 0.5,
            borderColor: isSelected
              ? themeColor
              : (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"),
            backgroundColor: isSelected
              ? (themeColor + "18")
              : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)"),
          },
        ]}
      >
        {preset ? (
          "swatchImage" in preset && preset.swatchImage != null ? (
            <Image
              source={preset.swatchImage}
              style={{ width: 30, height: 30, borderRadius: 15 }}
              contentFit="cover"
            />
          ) : (
            <Text style={{ fontSize: 17 }}>{preset.swatchIcon}</Text>
          )
        ) : (
          <Text style={{ fontSize: 14, color: glassTertiary }}>∅</Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── Effect Studio (Expanded Mode) ──────────────────────────

type StudioTab = "create" | "animated";

interface EffectStudioProps {
  selectedEffectId: string | null;
  themeColor: string;
  isDark: boolean;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  onSelectEffect: (key: string | null) => void;
  onCustomEffect: (config: ParticleMotifConfig | null) => void;
  onCollapse: () => void;
}

function EffectStudio({
  selectedEffectId,
  themeColor,
  isDark,
  glassText,
  glassSecondary,
  glassTertiary,
  onSelectEffect,
  onCustomEffect,
  onCollapse,
}: EffectStudioProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("create");
  const glassBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  return (
    <View style={styles.studioBody}>
      {/* Header row */}
      <View style={styles.studioHeader}>
        <View style={styles.tabRow}>
          <TabButton
            label="Create"
            active={activeTab === "create"}
            themeColor={themeColor}
            isDark={isDark}
            glassSecondary={glassSecondary}
            glassBorder={glassBorder}
            onPress={() => setActiveTab("create")}
          />
          <TabButton
            label="Animated"
            active={activeTab === "animated"}
            themeColor={themeColor}
            isDark={isDark}
            glassSecondary={glassSecondary}
            glassBorder={glassBorder}
            onPress={() => setActiveTab("animated")}
          />
        </View>
        <Pressable onPress={onCollapse} hitSlop={8} style={styles.collapseBtn}>
          <ChevronDown size={12} color={themeColor} />
        </Pressable>
      </View>

      {activeTab === "create" ? (
        <CreateTab
          isDark={isDark}
          themeColor={themeColor}
          glassText={glassText}
          glassSecondary={glassSecondary}
          glassTertiary={glassTertiary}
          glassBorder={glassBorder}
          onCustomEffect={onCustomEffect}
        />
      ) : (
        <AnimatedTab
          selectedEffectId={selectedEffectId}
          themeColor={themeColor}
          isDark={isDark}
          glassSecondary={glassSecondary}
          glassTertiary={glassTertiary}
          onSelectEffect={onSelectEffect}
        />
      )}
    </View>
  );
}

// ─── Tab Button ─────────────────────────────────────────────

function TabButton({
  label,
  active,
  themeColor,
  isDark,
  glassSecondary,
  glassBorder,
  onPress,
}: {
  label: string;
  active: boolean;
  themeColor: string;
  isDark: boolean;
  glassSecondary: string;
  glassBorder: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: active ? 1.5 : 1,
        borderColor: active ? themeColor : glassBorder,
        backgroundColor: active
          ? (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)")
          : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: active ? "700" : "500",
          color: active ? themeColor : glassSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Create Tab (Live Skia Particle Editor) ─────────────────

interface CreateTabProps {
  isDark: boolean;
  themeColor: string;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  glassBorder: string;
  onCustomEffect: (config: ParticleMotifConfig | null) => void;
}

function CreateTab({
  isDark,
  themeColor,
  glassText,
  glassSecondary,
  glassTertiary,
  glassBorder,
  onCustomEffect,
}: CreateTabProps) {
  // Editor state
  const [colors, setColors] = useState<string[]>(["#EF4444", "#3B82F6"]);
  const [shapeKey, setShapeKey] = useState("confetti");
  const [density, setDensity] = useState(0.35); // 0-1 maps to 4-30 particles
  const [size, setSize] = useState(0.4);         // 0-1 maps to minSize 3-12, maxSize 8-28
  const [speed, setSpeed] = useState(0.4);       // 0-1 maps to minSpeed 5-40, maxSpeed 12-70
  const [dirKey, setDirKey] = useState("falling");

  const pushConfig = useCallback((
    c: string[], sk: string, d: number, sz: number, sp: number, dk: string,
  ) => {
    if (c.length === 0) {
      onCustomEffect(null);
      return;
    }
    const shape = SHAPE_OPTIONS.find((s) => s.key === sk) ?? SHAPE_OPTIONS[0];
    const dir = DIRECTION_OPTIONS.find((o) => o.key === dk) ?? DIRECTION_OPTIONS[0];
    const particleCount = Math.round(4 + d * 26);
    const minSize = Math.round(3 + sz * 9);
    const maxSize = Math.round(8 + sz * 20);
    const minSpeed = Math.round(5 + sp * 35);
    const maxSpeed = Math.round(12 + sp * 58);

    const config: ParticleMotifConfig = {
      label: "Custom",
      swatchIcon: "✨",
      particleCount,
      minSize,
      maxSize,
      minOpacity: 0.4,
      maxOpacity: 0.85,
      minSpeed,
      maxSpeed,
      swayAmplitude: dir.sway,
      minSwayPeriod: 2,
      maxSwayPeriod: 6,
      direction: dir.dir,
      motionMode: dir.mode,
      blurSigma: 0.5,
      colors: c.map((hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, 1)`;
      }),
      shapes: shape.shapes,
      minRotationSpeed: 1.0,
      maxRotationSpeed: 3.5,
      rectAspect: 0.4,
    };
    onCustomEffect(config);
  }, [onCustomEffect]);

  // Push initial config on mount
  const mountedRef = useRef(false);
  if (!mountedRef.current) {
    mountedRef.current = true;
    // Defer to avoid calling setState during render
    setTimeout(() => pushConfig(colors, shapeKey, density, size, speed, dirKey), 0);
  }

  const handleToggleColor = useCallback((color: string) => {
    Haptics.selectionAsync();
    setColors((prev) => {
      const idx = prev.indexOf(color);
      let next: string[];
      if (idx >= 0) {
        next = prev.filter((_, i) => i !== idx);
      } else {
        if (prev.length >= MAX_EFFECT_COLORS) return prev;
        next = [...prev, color];
      }
      pushConfig(next, shapeKey, density, size, speed, dirKey);
      return next;
    });
  }, [shapeKey, density, size, speed, dirKey, pushConfig]);

  const handleRemoveColor = useCallback((idx: number) => {
    Haptics.selectionAsync();
    setColors((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      pushConfig(next, shapeKey, density, size, speed, dirKey);
      return next;
    });
  }, [shapeKey, density, size, speed, dirKey, pushConfig]);

  const handleResetColors = useCallback(() => {
    Haptics.selectionAsync();
    setColors([]);
    onCustomEffect(null);
  }, [onCustomEffect]);

  const handleShapeChange = useCallback((key: string) => {
    Haptics.selectionAsync();
    setShapeKey(key);
    pushConfig(colors, key, density, size, speed, dirKey);
  }, [colors, density, size, speed, dirKey, pushConfig]);

  const handleDensityChange = useCallback((val: number) => {
    setDensity(val);
    pushConfig(colors, shapeKey, val, size, speed, dirKey);
  }, [colors, shapeKey, size, speed, dirKey, pushConfig]);

  const handleSizeChange = useCallback((val: number) => {
    setSize(val);
    pushConfig(colors, shapeKey, density, val, speed, dirKey);
  }, [colors, shapeKey, density, speed, dirKey, pushConfig]);

  const handleSpeedChange = useCallback((val: number) => {
    setSpeed(val);
    pushConfig(colors, shapeKey, density, size, val, dirKey);
  }, [colors, shapeKey, density, size, dirKey, pushConfig]);

  const handleDirChange = useCallback((key: string) => {
    Haptics.selectionAsync();
    setDirKey(key);
    pushConfig(colors, shapeKey, density, size, speed, key);
  }, [colors, shapeKey, density, size, speed, pushConfig]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
    >
      {/* ── Colors ── */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Text style={{ color: glassSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.4 }}>
          COLORS
        </Text>
        <Pressable onPress={handleResetColors} hitSlop={8}>
          <Text style={{ color: glassTertiary, fontSize: 10, fontWeight: "500" }}>
            Reset
          </Text>
        </Pressable>
      </View>

      {colors.length === 0 && (
        <Text style={{ color: glassTertiary, fontSize: 11, fontStyle: "italic", marginBottom: 8 }}>
          Tap colors to start
        </Text>
      )}
      {colors.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {colors.map((c, i) => (
            <View
              key={`${c}-${i}`}
              style={{
                flexDirection: "row", alignItems: "center",
                backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                borderRadius: 14, paddingLeft: 3, paddingRight: 6, paddingVertical: 2,
              }}
            >
              <View style={{
                width: 16, height: 16, borderRadius: 8,
                backgroundColor: c, marginRight: 4,
                borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
              }} />
              <Text style={{ color: glassSecondary, fontSize: 9, fontWeight: "500", fontFamily: "monospace" }}>
                {c}
              </Text>
              <Pressable onPress={() => handleRemoveColor(i)} style={{ marginLeft: 3, padding: 2 }}>
                <X size={9} color={glassTertiary} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
        {PARTICLE_COLORS.map((color) => {
          const selected = colors.includes(color);
          const disabled = !selected && colors.length >= MAX_EFFECT_COLORS;
          return (
            <Pressable
              key={color}
              onPress={() => handleToggleColor(color)}
              style={{
                width: 30, height: 30, borderRadius: 8,
                backgroundColor: color,
                borderWidth: selected ? 2.5 : 1,
                borderColor: selected ? "#FFFFFF" : "rgba(255,255,255,0.12)",
                opacity: disabled ? 0.35 : 1,
                justifyContent: "center", alignItems: "center",
              }}
            >
              {selected && (
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#FFFFFF" }} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ── Shape ── */}
      <Text style={{ color: glassSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, marginBottom: 6 }}>
        SHAPE
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {SHAPE_OPTIONS.map((opt) => {
          const active = shapeKey === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => handleShapeChange(opt.key)}
              style={{
                paddingHorizontal: 12, paddingVertical: 5,
                borderRadius: 14,
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? themeColor : glassBorder,
                backgroundColor: active
                  ? (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)")
                  : "transparent",
              }}
            >
              <Text style={{
                fontSize: 11, fontWeight: active ? "600" : "400",
                color: active ? themeColor : glassSecondary,
              }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Density ── */}
      <Text style={{ color: glassSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, marginBottom: 4 }}>
        DENSITY
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <Text style={{ color: glassTertiary, fontSize: 9 }}>Sparse</Text>
        <View style={{ flex: 1 }}>
          <Slider
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={density}
            onValueChange={handleDensityChange}
            minimumTrackTintColor={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)"}
            maximumTrackTintColor={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}
            thumbTintColor="#FFFFFF"
          />
        </View>
        <Text style={{ color: glassTertiary, fontSize: 9 }}>Dense</Text>
      </View>

      {/* ── Size ── */}
      <Text style={{ color: glassSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, marginBottom: 4 }}>
        SIZE
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <Text style={{ color: glassTertiary, fontSize: 9 }}>Small</Text>
        <View style={{ flex: 1 }}>
          <Slider
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={size}
            onValueChange={handleSizeChange}
            minimumTrackTintColor={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)"}
            maximumTrackTintColor={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}
            thumbTintColor="#FFFFFF"
          />
        </View>
        <Text style={{ color: glassTertiary, fontSize: 9 }}>Large</Text>
      </View>

      {/* ── Speed ── */}
      <Text style={{ color: glassSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, marginBottom: 4 }}>
        SPEED
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <Text style={{ color: glassTertiary, fontSize: 9 }}>Slow</Text>
        <View style={{ flex: 1 }}>
          <Slider
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={speed}
            onValueChange={handleSpeedChange}
            minimumTrackTintColor={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)"}
            maximumTrackTintColor={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}
            thumbTintColor="#FFFFFF"
          />
        </View>
        <Text style={{ color: glassTertiary, fontSize: 9 }}>Fast</Text>
      </View>

      {/* ── Direction ── */}
      <Text style={{ color: glassSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, marginBottom: 6 }}>
        DIRECTION
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {DIRECTION_OPTIONS.map((opt) => {
          const active = dirKey === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => handleDirChange(opt.key)}
              style={{
                paddingHorizontal: 12, paddingVertical: 5,
                borderRadius: 14,
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? themeColor : glassBorder,
                backgroundColor: active
                  ? (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)")
                  : "transparent",
              }}
            >
              <Text style={{
                fontSize: 11, fontWeight: active ? "600" : "400",
                color: active ? themeColor : glassSecondary,
              }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Animated Tab (Verified Lottie Presets) ─────────────────

interface AnimatedTabProps {
  selectedEffectId: string | null;
  themeColor: string;
  isDark: boolean;
  glassSecondary: string;
  glassTertiary: string;
  onSelectEffect: (key: string | null) => void;
}

function AnimatedTab({
  selectedEffectId,
  themeColor,
  isDark,
  glassSecondary,
  glassTertiary,
  onSelectEffect,
}: AnimatedTabProps) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
    >
      {/* "None" option */}
      <Pressable
        onPress={() => onSelectEffect(null)}
        style={[
          styles.noneRow,
          !selectedEffectId && {
            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          },
        ]}
      >
        <View
          style={[
            styles.libSwatchCircle,
            {
              borderWidth: !selectedEffectId ? 2 : 0.5,
              borderColor: !selectedEffectId ? themeColor : (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"),
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
            },
          ]}
        >
          <Text style={{ fontSize: 14, color: glassTertiary }}>∅</Text>
        </View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: !selectedEffectId ? "600" : "400",
            color: !selectedEffectId ? themeColor : glassSecondary,
          }}
        >
          None
        </Text>
      </Pressable>

      {/* Lottie presets grid */}
      <View style={styles.libGrid}>
        {ANIMATED_PRESETS.map(({ id, label, emoji }) => {
          const isSelected = selectedEffectId === id;
          return (
            <Pressable
              key={id}
              onPress={() => onSelectEffect(id)}
              style={styles.libSwatchItem}
            >
              <View
                style={[
                  styles.libSwatchCircle,
                  {
                    borderWidth: isSelected ? 2.5 : 0.5,
                    borderColor: isSelected ? themeColor : (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"),
                    backgroundColor: isSelected
                      ? (themeColor + "18")
                      : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)"),
                  },
                ]}
              >
                <Text style={{ fontSize: 18 }}>{emoji}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 10,
                  fontWeight: isSelected ? "600" : "400",
                  color: isSelected ? themeColor : glassSecondary,
                  marginTop: 3,
                  textAlign: "center",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={{
          color: glassTertiary,
          fontSize: 10,
          fontStyle: "italic",
          textAlign: "center",
          marginTop: 16,
        }}
      >
        More coming soon
      </Text>
    </ScrollView>
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

  // Tray body
  trayBody: {
    flex: 1,
    paddingHorizontal: 14,
  },

  // Compact rail
  compactRail: {
    flexGrow: 0,
  },
  compactRailContent: {
    gap: SWATCH_GAP,
    paddingRight: 8,
  },
  compactSwatchCircle: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
    marginBottom: 10,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
  },
  collapseBtn: {
    padding: 6,
  },

  // Shared library styles (Animated tab)
  noneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  libGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  libSwatchItem: {
    alignItems: "center",
    width: 56,
  },
  libSwatchCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
