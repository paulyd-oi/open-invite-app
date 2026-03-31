import React, { useState, useCallback } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import ColorPicker, { HueCircular, Panel1 } from "reanimated-color-picker";
import { X } from "@/ui/icons";

interface CardColorPickerProps {
  cardColor: string | null;
  onColorChange: (color: string | null) => void;
  glassText: string;
  glassSecondary: string;
  glassSurface: string;
  glassBorder: string;
  isDark: boolean;
}

const DEFAULT_SWATCH = "#FFFDF5";

export function CardColorPicker({
  cardColor,
  onColorChange,
  glassText,
  glassSecondary,
  glassSurface,
  glassBorder,
  isDark,
}: CardColorPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const displayColor = cardColor ?? DEFAULT_SWATCH;

  const handleColorSelect = useCallback(
    ({ hex }: { hex: string }) => {
      onColorChange(hex);
    },
    [onColorChange],
  );

  const handleReset = useCallback(() => {
    onColorChange(null);
  }, [onColorChange]);

  return (
    <>
      {/* Inline trigger */}
      <Pressable
        onPress={() => setShowPicker(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: glassSurface,
          borderWidth: 1,
          borderColor: glassBorder,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: displayColor,
            borderWidth: 1.5,
            borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)",
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: glassText }}>
            Card Color
          </Text>
          <Text style={{ fontSize: 11, color: glassSecondary }}>
            {cardColor ? cardColor.toUpperCase() : "Theme default"}
          </Text>
        </View>
        {cardColor && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleReset();
            }}
            hitSlop={8}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: glassSecondary }}>
              Reset
            </Text>
          </Pressable>
        )}
      </Pressable>

      {/* Color picker modal */}
      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setShowPicker(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: 300,
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 20,
              padding: 20,
              alignItems: "center",
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: isDark ? "#FFFFFF" : "#000000" }}>
                Card Color
              </Text>
              <Pressable onPress={() => setShowPicker(false)} hitSlop={8}>
                <X size={20} color={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"} />
              </Pressable>
            </View>

            {/* Color wheel */}
            <ColorPicker
              value={displayColor}
              onComplete={handleColorSelect}
              style={{ width: 240, gap: 16 }}
            >
              <HueCircular
                containerStyle={{ justifyContent: "center", alignItems: "center" }}
                thumbShape="circle"
                thumbSize={24}
              >
                <Panel1
                  style={{ width: 120, height: 120, borderRadius: 12 }}
                  thumbSize={20}
                />
              </HueCircular>
            </ColorPicker>

            {/* Preview swatch + reset */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, width: "100%" }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: displayColor,
                  borderWidth: 1.5,
                  borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)",
                }}
              />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: isDark ? "#FFFFFF" : "#000000" }}>
                {cardColor?.toUpperCase() ?? "Default"}
              </Text>
              {cardColor && (
                <Pressable
                  onPress={handleReset}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)" }}>
                    Reset
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Done button */}
            <Pressable
              onPress={() => setShowPicker(false)}
              style={{
                marginTop: 16,
                backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)",
                borderRadius: 10,
                paddingVertical: 10,
                width: "100%",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: isDark ? "#FFFFFF" : "#000000" }}>
                Done
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
