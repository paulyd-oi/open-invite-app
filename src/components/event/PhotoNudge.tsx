import React from "react";
import { Pressable, Text } from "react-native";
import { Camera, X } from "@/ui/icons";
import { RADIUS } from "@/ui/layout";

interface PhotoNudgeColors {
  textSecondary: string;
  textTertiary: string;
}

interface PhotoNudgeProps {
  isDark: boolean;
  colors: PhotoNudgeColors;
  onAddPhoto: () => void;
  onDismiss: () => void;
}

export function PhotoNudge({
  isDark,
  colors,
  onAddPhoto,
  onDismiss,
}: PhotoNudgeProps) {
  return (
    <Pressable
      onPress={onAddPhoto}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        marginTop: 10,
        backgroundColor: isDark ? "rgba(28,28,30,0.8)" : "rgba(255,255,255,0.8)",
        borderWidth: 1,
        borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
        borderStyle: "dashed",
        borderRadius: RADIUS.lg,
      }}
    >
      <Camera size={18} color={isDark ? "#9CA3AF" : "#6B7280"} />
      <Text style={{ fontSize: 14, marginLeft: 8, color: isDark ? "#9CA3AF" : colors.textSecondary }}>Add a cover photo</Text>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        style={{ marginLeft: "auto", padding: 4 }}
        hitSlop={8}
      >
        <X size={14} color={colors.textTertiary} />
      </Pressable>
    </Pressable>
  );
}
