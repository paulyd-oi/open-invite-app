import React from "react";
import { Pressable, View, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { Check } from "@/ui/icons";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";
import { COLOR_PALETTE } from "@/lib/eventColorOverrides";
import BottomSheet from "@/components/BottomSheet";

interface ColorPickerSheetColors {
  text: string;
  textSecondary: string;
}

interface ColorPickerSheetProps {
  visible: boolean;
  currentColorOverride: string | null | undefined;
  colors: ColorPickerSheetColors;
  onClose: () => void;
  onSelectColor: (color: string) => void;
  onResetColor: () => void;
}

export function ColorPickerSheet({
  visible,
  currentColorOverride,
  colors,
  onClose,
  onSelectColor,
  onResetColor,
}: ColorPickerSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0}
      backdropOpacity={0.5}
      title="Block Color"
    >
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <Text style={{ fontSize: 14, color: colors.textSecondary }}>
          Customize how this event appears on your calendar
        </Text>
      </View>

      {/* Color Palette Grid */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {COLOR_PALETTE.map((color) => {
            const isSelected = currentColorOverride === color;
            return (
              <Pressable
                key={color}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelectColor(color);
                }}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: color,
                  borderWidth: isSelected ? 3 : 0,
                  borderColor: colors.text,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isSelected && (
                  <Check size={24} color="#FFFFFF" />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Reset to Default */}
      {currentColorOverride && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Button
            variant="secondary"
            label="Reset to Default"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onResetColor();
            }}
            style={{ borderRadius: RADIUS.md }}
          />
        </View>
      )}

      {/* Done Button */}
      <View style={{ paddingHorizontal: 20 }}>
        <Button
          variant="primary"
          label="Done"
          onPress={onClose}
          style={{ borderRadius: RADIUS.md, paddingVertical: 14 }}
        />
      </View>
    </BottomSheet>
  );
}
