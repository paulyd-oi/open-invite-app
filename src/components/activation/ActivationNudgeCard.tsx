import React from "react";
import { View, Text, Pressable } from "react-native";
import { UserPlus, CalendarPlus, Heart, X } from "@/ui/icons";
import type { ActivationNudgeKey } from "@/hooks/useActivationNudge";

interface Props {
  nudgeKey: ActivationNudgeKey;
  themeColor: string;
  colors: { text: string; textSecondary: string; surface: string; border: string };
  onAction: () => void;
  onDismiss: () => void;
}

const COPY: Record<
  ActivationNudgeKey,
  { title: string; body: string; cta: string; Icon: React.ComponentType<{ size?: number; color?: string }> }
> = {
  add_friends: {
    title: "Find your people",
    body: "Add friends to start seeing plans.",
    cta: "Add",
    Icon: UserPlus,
  },
  create_event: {
    title: "Host your first plan",
    body: "Create an event — it takes 30 seconds.",
    cta: "Create",
    Icon: CalendarPlus,
  },
  rsvp_event: {
    title: "Jump into something",
    body: "RSVP to an event your friends are going to.",
    cta: "Browse",
    Icon: Heart,
  },
};

export function ActivationNudgeCard({ nudgeKey, themeColor, colors, onAction, onDismiss }: Props) {
  const copy = COPY[nudgeKey];
  const Icon = copy.Icon;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${themeColor}22`,
          marginRight: 12,
        }}
      >
        <Icon size={18} color={themeColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{copy.title}</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{copy.body}</Text>
      </View>
      <Pressable
        onPress={onAction}
        style={{
          paddingVertical: 7,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: themeColor,
          marginLeft: 8,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>{copy.cta}</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={10} style={{ paddingLeft: 8 }}>
        <X size={16} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}
