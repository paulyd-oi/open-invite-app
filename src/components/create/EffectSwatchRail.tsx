import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { MOTIF_PRESETS, type MotifPresetId } from "./MotifOverlay";
import * as Haptics from "expo-haptics";

interface EffectSwatchRailProps {
  selectedEffectId: string | null;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  themeColor: string;
  isDark: boolean;
  onSelectEffect: (effectKey: string | null) => void;
}

const presetKeys = Object.keys(MOTIF_PRESETS) as MotifPresetId[];

export function EffectSwatchRail({
  selectedEffectId,
  glassText,
  glassSecondary,
  glassTertiary,
  themeColor,
  isDark,
  onSelectEffect,
}: EffectSwatchRailProps) {
  const selectedLabel = selectedEffectId
    ? MOTIF_PRESETS[selectedEffectId]?.label ?? null
    : null;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
    >
      {/* Header */}
      <Text style={{ fontSize: 15, fontWeight: "600", color: glassText, marginBottom: 12 }}>
        {selectedLabel ? `Effect: ${selectedLabel}` : "Choose an effect"}
      </Text>

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
          backgroundColor: !selectedEffectId
            ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)")
            : "transparent",
          marginBottom: 14,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            borderWidth: !selectedEffectId ? 2.5 : 1,
            borderColor: !selectedEffectId ? themeColor : (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
          }}
        >
          <Text style={{ fontSize: 16, color: glassTertiary }}>∅</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: "500", color: !selectedEffectId ? themeColor : glassSecondary }}>
          None
        </Text>
      </Pressable>

      {/* Motif preset grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {presetKeys.map((key) => {
          const preset = MOTIF_PRESETS[key];
          const isSelected = selectedEffectId === key;

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
              {/* Motif icon swatch */}
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  borderWidth: isSelected ? 2.5 : 1,
                  borderColor: isSelected ? themeColor : (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"),
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected
                    ? (themeColor + "18")
                    : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
                }}
              >
                <Text style={{ fontSize: 20 }}>{preset.swatchIcon}</Text>
              </View>
              {/* Label */}
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: isSelected ? "600" : "400",
                  color: isSelected ? themeColor : glassSecondary,
                  marginTop: 4,
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
