import React from "react";
import { Pressable, View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { UserPlus, X } from "@/ui/icons";
import { RADIUS } from "@/ui/layout";

interface FindFriendsNudgeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
}

interface FindFriendsNudgeProps {
  isDark: boolean;
  colors: FindFriendsNudgeColors;
  onFind: () => void;
  onDismiss: () => void;
}

export function FindFriendsNudge({
  isDark,
  colors,
  onFind,
  onDismiss,
}: FindFriendsNudgeProps) {
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={{ marginBottom: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          borderRadius: RADIUS.lg,
          backgroundColor: isDark ? "rgba(59,130,246,0.10)" : "#EFF6FF",
          borderWidth: 1,
          borderColor: isDark ? "rgba(59,130,246,0.25)" : "#BFDBFE",
        }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? "rgba(59,130,246,0.20)" : "#DBEAFE", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
          <UserPlus size={16} color="#3B82F6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Find friends on Open Invite</Text>
          <Text style={{ fontSize: 12, marginTop: 2, color: colors.textSecondary }}>See who you know is already here</Text>
        </View>
        <Pressable
          onPress={onFind}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, marginLeft: 8, backgroundColor: "#3B82F6" }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF" }}>Find</Text>
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
