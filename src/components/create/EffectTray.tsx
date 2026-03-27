/**
 * EffectTray — Two-stage effect picker for the create page.
 *
 * State B (tray): Compact floating panel (~144px) with selected summary +
 *   horizontal swatch rail. Keeps the live preview visible.
 *
 * State C (library): Expanded panel (~45% screen) with categorized grid,
 *   labels, and full browsing. Triggered by drag-up or "Browse all".
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
import { ChevronDown } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { MOTIF_PRESETS, MOTIF_CATEGORIES } from "./MotifOverlay";

// ─── Constants ───────────────────────────────────────────────

const TRAY_HEIGHT = 106;
const LIBRARY_HEIGHT_PCT = 0.46;
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
      // Snap based on velocity or position
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
    // Was just hidden — reset expanded state for next open
    if (expanded) setExpanded(false);
    animHeight.value = TRAY_HEIGHT;
  }
  prevVisible.current = visible;

  if (!visible) return null;

  // Dock layout: pill (~41px) at bottom: insets.bottom + 8.
  // Tray floats 15px above dock top. Backdrop stops above dock so the
  // dock's own toggle button remains tappable.
  const trayBottom = insets.bottom + 64;
  const backdropBottom = insets.bottom + 56;

  return (
    <>
      {/* Transparent backdrop — tap outside tray to dismiss */}
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
        {/* Material surface overlay */}
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
          <EffectLibrary
            selectedEffectId={selectedEffectId}
            themeColor={themeColor}
            isDark={isDark}
            glassText={glassText}
            glassSecondary={glassSecondary}
            glassTertiary={glassTertiary}
            onSelectEffect={handleSelect}
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
        {/* "None" swatch */}
        <CompactSwatch
          effectId={null}
          isSelected={!selectedEffectId}
          themeColor={themeColor}
          isDark={isDark}
          glassTertiary={glassTertiary}
          onSelect={onSelectEffect}
        />
        {/* All effects */}
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

// ─── Compact Swatch (no label) ──────────────────────────────

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

// ─── Library Content (Expanded Mode) ────────────────────────

interface EffectLibraryProps {
  selectedEffectId: string | null;
  themeColor: string;
  isDark: boolean;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  onSelectEffect: (key: string | null) => void;
  onCollapse: () => void;
}

function EffectLibrary({
  selectedEffectId,
  themeColor,
  isDark,
  glassText,
  glassSecondary,
  glassTertiary,
  onSelectEffect,
  onCollapse,
}: EffectLibraryProps) {
  return (
    <View style={styles.libraryBody}>
      {/* Header row */}
      <View style={styles.libraryHeader}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: glassText }}>
          Effects
        </Text>
        <Pressable onPress={onCollapse} hitSlop={8} style={styles.browseBtn}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: themeColor }}>
            Collapse
          </Text>
          <ChevronDown size={12} color={themeColor} />
        </Pressable>
      </View>

      {/* Scrollable categorized grid */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
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

        {/* Categories */}
        {MOTIF_CATEGORIES.map((category) => {
          const validIds = category.ids.filter((id) => id in MOTIF_PRESETS);
          if (validIds.length === 0) return null;

          return (
            <View key={category.label} style={styles.libCategory}>
              <Text
                style={[
                  styles.libCategoryLabel,
                  { color: glassSecondary },
                ]}
              >
                {category.label}
              </Text>
              <View style={styles.libGrid}>
                {validIds.map((key) => {
                  const preset = MOTIF_PRESETS[key];
                  if (!preset) return null;
                  const isSelected = selectedEffectId === key;

                  return (
                    <Pressable
                      key={key}
                      onPress={() => onSelectEffect(key)}
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
                        {"swatchImage" in preset && preset.swatchImage != null ? (
                          <Image
                            source={preset.swatchImage}
                            style={{ width: 32, height: 32, borderRadius: 16 }}
                            contentFit="cover"
                          />
                        ) : (
                          <Text style={{ fontSize: 18 }}>{preset.swatchIcon}</Text>
                        )}
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
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
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
    // bottom set dynamically to clear the dock
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
    // Soft shadow
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
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
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

  // Library
  libraryBody: {
    flex: 1,
  },
  libraryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  noneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  libCategory: {
    marginBottom: 14,
  },
  libCategoryLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
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
