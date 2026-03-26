/**
 * Theme Builder — Full-screen custom theme composer with live preview.
 *
 * Sections: Gradient Colors, Shader Background, Animation Speed, Save.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X, ChevronLeft } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeInUp,
  SlideInDown,
} from "react-native-reanimated";
import Slider from "@react-native-community/slider";

import { AnimatedGradientLayer } from "@/components/AnimatedGradientLayer";
import { BuilderEffectPreview } from "@/components/BuilderEffectPreview";
import { useThemeBuilderStore } from "@/lib/themeBuilderStore";
import { saveCustomTheme, loadCustomThemes, MAX_CUSTOM_THEMES } from "@/lib/customThemeStorage";
import { useTheme } from "@/lib/ThemeContext";

// ─── Curated palette (drawn from existing theme accents + dark bases) ──

const CURATED_COLORS = [
  "#0A0A18", "#0D0322", "#1A1A2E", "#16213E", "#1C1C1E",
  "#14B8A6", "#00ACC1", "#06B6D4", "#6495ED", "#8B5CF6",
  "#FF9800", "#D97706", "#FF6B4A", "#BE123C", "#EC4899",
  "#A855F7", "#22C55E", "#43A047", "#FFD700", "#D4AF37",
] as const;

const MAX_GRADIENT_COLORS = 3;
const MIN_GRADIENT_COLORS = 2;

// ─── Picker option data ──

const SHADER_OPTIONS: { key: string; label: string; color: string }[] = [
  { key: "", label: "None", color: "transparent" },
  { key: "aurora", label: "Aurora", color: "#1A9968" },
  { key: "shimmer", label: "Shimmer", color: "#FFF3CC" },
  { key: "plasma", label: "Plasma", color: "#CC3380" },
  { key: "bokeh", label: "Bokeh", color: "#FFD999" },
];

function generateId(): string {
  // crypto.randomUUID() not available in all RN runtimes — use fallback
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `custom_${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

export default function ThemeBuilderScreen() {
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { isDark } = useTheme();
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isEditMode = !!editId;

  // ─── Local UI state ──
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  // ─── Store ──
  const visualStack = useThemeBuilderStore((s) => s.visualStack);
  const setGradient = useThemeBuilderStore((s) => s.setGradient);
  const setShader = useThemeBuilderStore((s) => s.setShader);
  const hydrate = useThemeBuilderStore((s) => s.hydrate);
  const reset = useThemeBuilderStore((s) => s.reset);

  // Hydrate store when editing an existing theme
  useEffect(() => {
    if (!editId) return;
    const themes = loadCustomThemes();
    const existing = themes.find((t) => t.id === editId);
    if (existing) {
      hydrate(existing.name, existing.visualStack);
    }
  }, [editId, hydrate]);

  const gradientColors = visualStack.gradient?.colors ?? [];
  const gradientSpeed = visualStack.gradient?.speed ?? 3;
  const selectedShader = visualStack.shader ?? "";

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
        if (current.length <= MIN_GRADIENT_COLORS) return;
        current.splice(idx, 1);
      } else {
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
      const speed = Math.round(1 + (value - 0.5) * (5 / 1.5));
      setGradient(gradientColors, speed);
    },
    [gradientColors, setGradient],
  );

  const handleSelectShader = useCallback(
    (key: string) => {
      Haptics.selectionAsync();
      setShader((key || null) as any);
    },
    [setShader],
  );

  const handleSave = useCallback(() => {
    setSaveError("");
    if (gradientColors.length < MIN_GRADIENT_COLORS) {
      setSaveError("Select at least 2 gradient colors");
      return;
    }

    const themes = loadCustomThemes();

    // Theme cap: block new themes (edits are always allowed)
    if (!isEditMode && themes.length >= MAX_CUSTOM_THEMES) {
      setSaveError(`You can save up to ${MAX_CUSTOM_THEMES} themes. Delete one to make room.`);
      return;
    }

    // Auto-generate name (preserve existing name when editing)
    let themeName: string;
    if (isEditMode && editId) {
      const existing = themes.find((t) => t.id === editId);
      themeName = existing?.name || `Custom Theme ${themes.length + 1}`;
    } else {
      themeName = `Custom Theme ${themes.length + 1}`;
    }

    setSaving(true);
    const now = new Date().toISOString();

    if (isEditMode && editId) {
      const existing = themes.find((t) => t.id === editId);
      saveCustomTheme({
        id: editId,
        name: themeName,
        visualStack,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    } else {
      saveCustomTheme({
        id: generateId(),
        name: themeName,
        visualStack,
        createdAt: now,
        updatedAt: now,
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    reset();
    router.back();
  }, [gradientColors, visualStack, reset, router, isEditMode, editId]);

  const sliderValue = 0.5 + ((gradientSpeed - 1) / 5) * 1.5;

  // ─── Glass colors ──
  const glassBg = isDark ? "rgba(20,20,25,0.75)" : "rgba(255,255,255,0.82)";
  const glassBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const glassText = isDark ? "#FFFFFF" : "#1C1C1E";
  const glassSecondary = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)";
  const glassTertiary = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";

  const panelHeight = screenH * 0.62;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* ─── Live Preview Background ─── */}
      {/* Layer order: gradient → image → effects → filter */}
      {visualStack.gradient && visualStack.gradient.colors.length >= 2 && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 }} pointerEvents="none">
          <AnimatedGradientLayer config={visualStack.gradient} />
        </View>
      )}
      {selectedShader && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.45 }} pointerEvents="none">
          <BuilderEffectPreview shader={selectedShader || undefined} />
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
            {isEditMode ? "Edit Theme" : "Theme Builder"}
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
          style={{ flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
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
              {/* ─── Colors Section ─── */}
              <Animated.View entering={FadeInDown.delay(50).duration(300)}>
                <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 }}>
                  GRADIENT COLORS
                </Text>
                <Text style={{ color: glassTertiary, fontSize: 11, marginBottom: 10 }}>
                  Pick {MIN_GRADIENT_COLORS}–{MAX_GRADIENT_COLORS} colors for the background gradient
                </Text>

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
                            width: 22, height: 22, borderRadius: 11,
                            backgroundColor: c, marginRight: 6,
                            borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
                          }}
                        />
                        <Text style={{ color: glassSecondary, fontSize: 11, fontWeight: "500", fontFamily: "monospace" }}>
                          {c}
                        </Text>
                        {gradientColors.length > MIN_GRADIENT_COLORS && (
                          <Pressable onPress={() => handleRemoveColor(i)} style={{ marginLeft: 6, padding: 2 }}>
                            <X size={12} color={glassTertiary} />
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {CURATED_COLORS.map((color) => {
                    const selected = gradientColors.includes(color);
                    const disabled = !selected && gradientColors.length >= MAX_GRADIENT_COLORS;
                    return (
                      <Pressable
                        key={color}
                        onPress={() => handleToggleColor(color)}
                        style={{
                          width: 40, height: 40, borderRadius: 12,
                          backgroundColor: color,
                          borderWidth: selected ? 2.5 : 1,
                          borderColor: selected ? "#FFFFFF" : "rgba(255,255,255,0.12)",
                          opacity: disabled ? 0.35 : 1,
                          justifyContent: "center", alignItems: "center",
                        }}
                      >
                        {selected && (
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFFFFF" }} />
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

              {/* ─── Shader Section ─── */}
              <Animated.View entering={FadeInDown.delay(150).duration(300)} style={{ marginTop: 20 }}>
                <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 }}>
                  SHADER BACKGROUND
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {SHADER_OPTIONS.map((opt) => {
                    const active = selectedShader === opt.key;
                    return (
                      <Pressable
                        key={opt.key || "_none"}
                        onPress={() => handleSelectShader(opt.key)}
                        style={{
                          flexDirection: "row", alignItems: "center",
                          paddingHorizontal: 14, paddingVertical: 8,
                          borderRadius: 20,
                          borderWidth: active ? 1.5 : 1,
                          borderColor: active ? "#FFFFFF" : glassBorder,
                          backgroundColor: active
                            ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)")
                            : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
                        }}
                      >
                        {opt.color !== "transparent" && (
                          <View style={{
                            width: 14, height: 14, borderRadius: 7,
                            backgroundColor: opt.color, marginRight: 6,
                            borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
                          }} />
                        )}
                        <Text style={{
                          color: active ? glassText : glassSecondary,
                          fontSize: 12, fontWeight: active ? "600" : "400",
                        }}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>

              {/* ─── Save Button ─── */}
              <Animated.View entering={FadeInDown.delay(250).duration(300)} style={{ marginTop: 24 }}>
                {saveError !== "" && (
                  <Text style={{ color: "#EF4444", fontSize: 12, marginBottom: 8, textAlign: "center" }}>
                    {saveError}
                  </Text>
                )}
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={{
                    backgroundColor: "#8B5CF6",
                    borderRadius: 9999,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>
                    {saving ? "Saving…" : isEditMode ? "Update Theme" : "Save Theme"}
                  </Text>
                </Pressable>
              </Animated.View>

              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}
