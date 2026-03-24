/**
 * Theme Builder — Full-screen custom theme composer with live preview.
 *
 * Phase 5A: gradient/color picker, name input, live preview scaffold.
 * Future phases add shader/particle/filter pickers and save/load.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { X, ChevronLeft } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeInUp,
  SlideInDown,
} from "react-native-reanimated";
import Slider from "@react-native-community/slider";

import { AnimatedGradientLayer } from "@/components/AnimatedGradientLayer";
import { ThemeEffectLayer } from "@/components/ThemeEffectLayer";
import { ThemeFilterLayer } from "@/components/ThemeFilterLayer";
import { useThemeBuilderStore } from "@/lib/themeBuilderStore";
import { useTheme } from "@/lib/ThemeContext";

// ─── Curated palette (drawn from existing theme accents + dark bases) ──

const CURATED_COLORS = [
  // Darks / Bases
  "#0A0A18", "#0D0322", "#1A1A2E", "#16213E", "#1C1C1E",
  // Cool tones
  "#14B8A6", "#00ACC1", "#06B6D4", "#6495ED", "#8B5CF6",
  // Warm tones
  "#FF9800", "#D97706", "#FF6B4A", "#BE123C", "#EC4899",
  // Accent / vivid
  "#A855F7", "#22C55E", "#43A047", "#FFD700", "#D4AF37",
] as const;

const MAX_GRADIENT_COLORS = 3;
const MIN_GRADIENT_COLORS = 2;

export default function ThemeBuilderScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // ─── Store ──
  const name = useThemeBuilderStore((s) => s.name);
  const visualStack = useThemeBuilderStore((s) => s.visualStack);
  const setName = useThemeBuilderStore((s) => s.setName);
  const setGradient = useThemeBuilderStore((s) => s.setGradient);
  const reset = useThemeBuilderStore((s) => s.reset);

  const gradientColors = visualStack.gradient?.colors ?? [];
  const gradientSpeed = visualStack.gradient?.speed ?? 3;

  // ─── Handlers ──

  const handleBack = useCallback(() => {
    reset();
    router.back();
  }, [reset, router]);

  const handleToggleColor = useCallback(
    (color: string) => {
      Haptics.selectionAsync();
      const current = [...gradientColors];
      const idx = current.indexOf(color);

      if (idx >= 0) {
        // Remove — but enforce minimum 2
        if (current.length <= MIN_GRADIENT_COLORS) return;
        current.splice(idx, 1);
      } else {
        // Add — but enforce maximum 3
        if (current.length >= MAX_GRADIENT_COLORS) return;
        current.push(color);
      }
      setGradient(current, gradientSpeed);
    },
    [gradientColors, gradientSpeed, setGradient],
  );

  const handleRemoveColor = useCallback(
    (idx: number) => {
      if (gradientColors.length <= MIN_GRADIENT_COLORS) return;
      Haptics.selectionAsync();
      const next = gradientColors.filter((_, i) => i !== idx);
      setGradient(next, gradientSpeed);
    },
    [gradientColors, gradientSpeed, setGradient],
  );

  const handleSpeedChange = useCallback(
    (value: number) => {
      // Map slider 0.5–2.0 → speed 1–6
      const speed = Math.round(1 + (value - 0.5) * (5 / 1.5));
      setGradient(gradientColors, speed);
    },
    [gradientColors, setGradient],
  );

  // Map internal speed 1–6 → slider 0.5–2.0
  const sliderValue = 0.5 + ((gradientSpeed - 1) / 5) * 1.5;

  // ─── Glass colors ──
  const glassBg = isDark ? "rgba(20,20,25,0.75)" : "rgba(255,255,255,0.82)";
  const glassBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const glassText = isDark ? "#FFFFFF" : "#1C1C1E";
  const glassSecondary = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)";
  const glassTertiary = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";

  // Panel takes ~60% of screen
  const panelHeight = screenH * 0.6;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* ─── Live Preview Background ─── */}
      {visualStack.gradient && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 }} pointerEvents="none">
          <AnimatedGradientLayer config={visualStack.gradient} />
        </View>
      )}
      {visualStack.particles && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.45 }} pointerEvents="none">
          <ThemeEffectLayer themeId={null} />
        </View>
      )}
      {visualStack.filter && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
          <ThemeFilterLayer filter={visualStack.filter} />
        </View>
      )}

      {/* ─── Top Bar ─── */}
      <SafeAreaView edges={["top"]} style={{ zIndex: 10 }}>
        <Animated.View
          entering={FadeInUp.duration(300)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Pressable onPress={handleBack} style={{ padding: 6 }}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "700" }}>
            Theme Builder
          </Text>
          <Pressable onPress={handleBack} style={{ padding: 6 }}>
            <X size={20} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </Animated.View>
      </SafeAreaView>

      {/* ─── Glass Builder Panel ─── */}
      <Animated.View
        entering={SlideInDown.springify().damping(18)}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: panelHeight,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: "hidden",
        }}
      >
        <BlurView
          intensity={80}
          tint={isDark ? "dark" : "light"}
          style={{
            flex: 1,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: glassBg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: glassBorder,
            }}
          >
            {/* Drag indicator */}
            <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 6 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: glassTertiary }} />
            </View>

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* ─── Name Section ─── */}
              <Animated.View entering={FadeInDown.delay(50).duration(300)}>
                <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 }}>
                  NAME
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="My Custom Theme"
                  placeholderTextColor={glassTertiary}
                  maxLength={30}
                  style={{
                    color: glassText,
                    fontSize: 16,
                    fontWeight: "500",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: glassBorder,
                    backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                  }}
                />
                <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 4, textAlign: "right" }}>
                  {name.length}/30
                </Text>
              </Animated.View>

              {/* ─── Colors Section ─── */}
              <Animated.View entering={FadeInDown.delay(100).duration(300)} style={{ marginTop: 16 }}>
                <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 }}>
                  GRADIENT COLORS
                </Text>
                <Text style={{ color: glassTertiary, fontSize: 11, marginBottom: 10 }}>
                  Pick {MIN_GRADIENT_COLORS}–{MAX_GRADIENT_COLORS} colors for the background gradient
                </Text>

                {/* Selected color pills */}
                {gradientColors.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {gradientColors.map((c, i) => (
                      <View
                        key={`${c}-${i}`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                          borderRadius: 20,
                          paddingLeft: 4,
                          paddingRight: 8,
                          paddingVertical: 4,
                        }}
                      >
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: c,
                            marginRight: 6,
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.15)",
                          }}
                        />
                        <Text style={{ color: glassSecondary, fontSize: 11, fontWeight: "500", fontFamily: "monospace" }}>
                          {c}
                        </Text>
                        {gradientColors.length > MIN_GRADIENT_COLORS && (
                          <Pressable
                            onPress={() => handleRemoveColor(i)}
                            style={{ marginLeft: 6, padding: 2 }}
                          >
                            <X size={12} color={glassTertiary} />
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Color swatch grid */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {CURATED_COLORS.map((color) => {
                    const selected = gradientColors.includes(color);
                    const disabled = !selected && gradientColors.length >= MAX_GRADIENT_COLORS;
                    return (
                      <Pressable
                        key={color}
                        onPress={() => handleToggleColor(color)}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          backgroundColor: color,
                          borderWidth: selected ? 2.5 : 1,
                          borderColor: selected ? "#FFFFFF" : "rgba(255,255,255,0.12)",
                          opacity: disabled ? 0.35 : 1,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        {selected && (
                          <View
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              backgroundColor: "#FFFFFF",
                            }}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>

              {/* ─── Speed Section ─── */}
              <Animated.View entering={FadeInDown.delay(150).duration(300)} style={{ marginTop: 20 }}>
                <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 }}>
                  ANIMATION SPEED
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text style={{ color: glassTertiary, fontSize: 11 }}>Slow</Text>
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
                  <Text style={{ color: glassTertiary, fontSize: 11 }}>Fast</Text>
                </View>
              </Animated.View>

              {/* ─── Placeholder for future sections ─── */}
              <View style={{ marginTop: 24, paddingVertical: 16, alignItems: "center" }}>
                <Text style={{ color: glassTertiary, fontSize: 12, fontStyle: "italic" }}>
                  Shader, particle, and filter pickers coming in Phase 5B
                </Text>
              </View>
            </ScrollView>
          </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}
