import React from "react";
import { Pressable, View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { X } from "@/ui/icons";
import { STATUS } from "@/ui/tokens";
import { RADIUS } from "@/ui/layout";

interface RsvpSuccessPromptColors {
  textSecondary: string;
  textTertiary: string;
}

interface RsvpSuccessPromptProps {
  isDark: boolean;
  colors: RsvpSuccessPromptColors;
  onShare: () => void;
  onDismiss: () => void;
}

export function RsvpSuccessPrompt({
  isDark,
  colors,
  onShare,
  onDismiss,
}: RsvpSuccessPromptProps) {
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={{ marginBottom: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          borderRadius: RADIUS.lg,
          backgroundColor: isDark ? "#1C2520" : "#F0FDF4",
          borderWidth: 1,
          borderColor: STATUS.going.border,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: STATUS.going.fg }}>You're in!</Text>
          <Text style={{ fontSize: 12, marginTop: 2, color: colors.textSecondary }}>Let friends know — share this event</Text>
        </View>
        <Pressable
          onPress={onShare}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, marginLeft: 8, backgroundColor: STATUS.going.fg }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF" }}>Share</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          style={{ marginLeft: 8, padding: 4 }}
        >
          <X size={14} color={colors.textTertiary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
