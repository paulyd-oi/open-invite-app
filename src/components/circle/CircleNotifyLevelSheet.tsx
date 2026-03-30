import React from "react";
import {
  View,
  Text,
  Pressable,
} from "react-native";
import BottomSheet from "@/components/BottomSheet";

type NotifyLevel = "all" | "decisions" | "mentions" | "mute";

const NOTIFY_OPTIONS: Array<{ key: NotifyLevel; label: string; desc: string }> = [
  { key: "all", label: "All activity", desc: "Messages, decisions, and events" },
  { key: "decisions", label: "Decisions only", desc: "Polls and plan lock updates" },
  { key: "mentions", label: "Mentions only", desc: "Only when you\u2019re mentioned" },
  { key: "mute", label: "Muted", desc: "No notifications from this circle" },
];

interface CircleNotifyLevelSheetProps {
  visible: boolean;
  currentLevel: string;
  colors: { text: string; textSecondary: string; textTertiary: string; border: string };
  isDark: boolean;
  themeColor: string;
  onClose: () => void;
  onSelect: (level: NotifyLevel) => void;
}

export function CircleNotifyLevelSheet({
  visible,
  currentLevel,
  colors,
  isDark,
  themeColor,
  onClose,
  onSelect,
}: CircleNotifyLevelSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0}
      maxHeightPct={0.45}
      backdropOpacity={0.5}
      title="Notifications"
    >
      <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>
          Choose what you want to hear from this circle.
        </Text>
        {NOTIFY_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
              paddingHorizontal: 14,
              marginBottom: 6,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: currentLevel === opt.key ? themeColor : colors.border,
              backgroundColor: currentLevel === opt.key ? (themeColor + "12") : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"),
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: currentLevel === opt.key ? "600" : "400", color: currentLevel === opt.key ? themeColor : colors.text }}>
                {opt.label}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{opt.desc}</Text>
            </View>
            <View style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 2,
              borderColor: currentLevel === opt.key ? themeColor : colors.textTertiary,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: currentLevel === opt.key ? themeColor : "transparent",
            }}>
              {currentLevel === opt.key && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
            </View>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}
