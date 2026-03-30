import React from "react";
import {
  View,
  Text,
  Pressable,
} from "react-native";

const REACTION_EMOJI = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDE4F"];

interface CircleReactionPickerProps {
  visible: boolean;
  selectedReactions: string[];
  isDark: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

export function CircleReactionPicker({
  visible,
  selectedReactions,
  isDark,
  onClose,
  onSelect,
}: CircleReactionPickerProps) {
  if (!visible) return null;

  return (
    <Pressable
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "center",
        alignItems: "center",
      }}
      onPress={onClose}
    >
      <View
        style={{
          flexDirection: "row",
          backgroundColor: isDark ? "#2c2c2e" : "#ffffff",
          borderRadius: 28,
          paddingHorizontal: 8,
          paddingVertical: 6,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        }}
      >
        {REACTION_EMOJI.map((emoji) => {
          const isSelected = selectedReactions.includes(emoji);
          return (
            <Pressable
              key={emoji}
              onPress={() => onSelect(emoji)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: isSelected
                  ? (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)")
                  : "transparent",
              }}
            >
              <Text style={{ fontSize: 26 }}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>
    </Pressable>
  );
}
