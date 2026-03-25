import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
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

/** Small circle showing the effect's first 2 colors. */
function EffectSwatch({
  colors,
  selected,
  accentColor,
  size = 40,
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
        borderColor: selected ? accentColor : "rgba(255,255,255,0.12)",
      }}
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        {displayColors.map((color, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: color }} />
        ))}
      </View>
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
      {/* Header with selected effect name */}
      <Text style={{ fontSize: 15, fontWeight: "600", color: glassText, marginBottom: 4 }}>
        {selectedLabel ?? "Choose an effect"}
      </Text>

      {!selectedThemeId && (
        <Text style={{ fontSize: 12, color: glassTertiary, marginBottom: 12 }}>
          Select a theme first to preview effects
        </Text>
      )}

      {/* "None" option */}
      <View style={{ marginBottom: 16 }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onSelectEffect(null);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: !currentEffect
              ? (isDark ? "rgba(255,255,255,0.08)" : `${themeColor}10`)
              : "transparent",
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: !currentEffect ? 2.5 : 1,
              borderColor: !currentEffect ? themeColor : "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
            }}
          >
            <Text style={{ fontSize: 16, color: glassTertiary }}>∅</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: "500", color: !currentEffect ? themeColor : glassSecondary }}>
            No Effect
          </Text>
        </Pressable>
      </View>

      {/* Effect grid — wrapped rows of swatches with labels */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
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
              style={{
                alignItems: "center",
                width: 64,
              }}
            >
              <EffectSwatch
                colors={config.colors}
                selected={isSelected}
                accentColor={themeColor}
              />
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: isSelected ? "600" : "400",
                  color: isSelected ? themeColor : glassTertiary,
                  textAlign: "center",
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {formatEffectName(key)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
