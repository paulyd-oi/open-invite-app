import React from "react";
import { Animated as RNAnimated, Pressable } from "react-native";
import { Pencil } from "@/ui/icons";

interface EditPhotoButtonProps {
  editScale: RNAnimated.Value;
  onPress: () => void;
}

export function EditPhotoButton({
  editScale,
  onPress,
}: EditPhotoButtonProps) {
  return (
    <RNAnimated.View style={{ transform: [{ scale: editScale }] }}>
      <Pressable
        onPress={onPress}
        style={{
          borderRadius: 20,
          padding: 8,
          backgroundColor: "rgba(0,0,0,0.55)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.15)",
        }}
      >
        <Pencil size={16} color="#fff" />
      </Pressable>
    </RNAnimated.View>
  );
}
