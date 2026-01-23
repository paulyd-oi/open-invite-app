import React from "react";
import { View, Text } from "react-native";

interface BadgePillProps {
  name: string;
  tierColor: string;
  variant?: "small" | "medium";
}

/**
 * Text-only badge pill component.
 * - NO emoji
 * - Shows badge name only
 * - Background uses tierColor with opacity
 * - Text uses tierColor
 * - Small variant for cards, medium for profile header
 */
export function BadgePill({ name, tierColor, variant = "small" }: BadgePillProps) {
  const isSmall = variant === "small";
  
  return (
    <View
      className={`rounded-full items-center justify-center ${isSmall ? "px-2 py-1" : "px-3 py-1.5"}`}
      style={{
        backgroundColor: tierColor + "20",
        borderWidth: 0.5,
        borderColor: tierColor,
      }}
    >
      <Text
        className={`font-semibold ${isSmall ? "text-xs" : "text-sm"}`}
        style={{ color: tierColor }}
      >
        {name}
      </Text>
    </View>
  );
}
