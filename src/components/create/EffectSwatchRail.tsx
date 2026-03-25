import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { EFFECT_CONFIGS } from "@/components/ThemeEffectLayer";
import { EVENT_THEMES, type ThemeId } from "@/lib/eventThemes";
import * as Haptics from "expo-haptics";

interface EffectSwatchRailProps {
  selectedThemeId: ThemeId | null;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  themeColor: string;
  isDark: boolean;
  onSelectEffect: (effectKey: string | null) => void;
}

/** Smooth gradient circle for an effect preset. */
function EffectSwatch({
  colors,
  selected,
  accentColor,
  size = 38,
}: {
  colors: string[];
  selected: boolean;
  accentColor: string;
  size?: number;
}) {
  const displayColors = colors.slice(0, 3);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        borderWidth: selected ? 2.5 : 1,
        borderColor: selected ? accentColor : "rgba(255,255,255,0.10)",
      }}
    >
      <LinearGradient
        colors={displayColors as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

/** Pretty-print an effect key: "ambient_dust" → "Ambient Dust" */
function formatEffectName(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function EffectSwatchRail({
  selectedThemeId,
  glassText,
  glassSecondary,
  glassTertiary,
  themeColor,
  isDark,
  onSelectEffect,
}: EffectSwatchRailProps) {
  // Current effect from the selected theme
  const currentEffect = selectedThemeId
    ? EVENT_THEMES[selectedThemeId]?.visualStack?.particles ?? null
    : null;

  const effectKeys = Object.keys(EFFECT_CONFIGS) as (keyof typeof EFFECT_CONFIGS)[];
  const selectedLabel = currentEffect ? formatEffectName(currentEffect) : null;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
    >
      {/* Header — selected effect name shown here only */}
      <Text style={{ fontSize: 15, fontWeight: "600", color: glassText, marginBottom: 4 }}>
        {selectedLabel ?? "Choose an effect"}
      </Text>

      {!selectedThemeId && (
        <Text style={{ fontSize: 12, color: glassTertiary, marginBottom: 12 }}>
          Select a theme first to preview effects
        </Text>
      )}

      {/* "None" option */}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onSelectEffect(null);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 10,
          backgroundColor: !currentEffect
            ? "rgba(255,255,255,0.08)"
            : "transparent",
          marginBottom: 14,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: !currentEffect ? 2.5 : 1,
            borderColor: !currentEffect ? themeColor : "rgba(255,255,255,0.10)",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ fontSize: 14, color: glassTertiary }}>∅</Text>
        </View>
        <Text style={{ fontSize: 12, fontWeight: "500", color: !currentEffect ? themeColor : glassSecondary }}>
          None
        </Text>
      </Pressable>

      {/* Effect grid — swatches only, no per-swatch labels */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {effectKeys.map((key) => {
          const config = EFFECT_CONFIGS[key];
          const isSelected = currentEffect === key;

          return (
            <Pressable
              key={key}
              onPress={() => {
                Haptics.selectionAsync();
                onSelectEffect(key);
              }}
            >
              <EffectSwatch
                colors={config.colors}
                selected={isSelected}
                accentColor={themeColor}
              />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
