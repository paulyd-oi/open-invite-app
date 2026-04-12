import React from "react";
import { View, Text, Pressable } from "react-native";
import { Camera, X } from "@/ui/icons";

interface CreateCoverRowProps {
  hasCover: boolean;
  glassSurface: string;
  glassBorder: string;
  glassSecondary: string;
  glassTertiary: string;
  onChangeCover: () => void;
  onRemoveCover: () => void;
}

export function CreateCoverRow({
  hasCover,
  glassSurface,
  glassBorder,
  glassSecondary,
  glassTertiary,
  onChangeCover,
  onRemoveCover,
}: CreateCoverRowProps) {
  const sectionLabel = (
    <Text style={{ color: glassTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" }} className="mb-1.5 ml-1">
      1. Cover photo
    </Text>
  );

  if (hasCover) {
    return (
      <>
        {sectionLabel}
        <View
          className="rounded-xl mb-1"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: glassSurface,
            borderWidth: 0.5,
            borderColor: glassBorder,
          }}
        >
          <Pressable
            onPress={onChangeCover}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
          >
            <Camera size={16} color={glassSecondary} />
            <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500" }}>Change cover</Text>
          </Pressable>
          <Pressable
            onPress={onRemoveCover}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <X size={14} color={glassTertiary} />
          </Pressable>
        </View>
        <Text style={{ color: glassTertiary, fontSize: 11 }} className="mb-4 ml-1">
          Recommended: 1280 × 960 px (4:3)
        </Text>
      </>
    );
  }

  return (
    <>
      {sectionLabel}
      <Pressable
        onPress={onChangeCover}
        className="rounded-xl mb-1"
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: glassSurface,
          borderWidth: 1,
          borderColor: glassBorder,
          borderStyle: "dashed",
          gap: 8,
        }}
      >
        <Camera size={16} color={glassTertiary} />
        <Text style={{ color: glassTertiary, fontSize: 13, fontWeight: "500" }}>Add cover photo</Text>
      </Pressable>
      <Text style={{ color: glassTertiary, fontSize: 11 }} className="mb-4 ml-1">
        Recommended: 1280 × 960 px (4:3)
      </Text>
    </>
  );
}
