import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import type { LucideIcon } from "@/ui/icons";

const WarningIcon: LucideIcon = ({ color, size = 24, style }) => (
  <Ionicons name="warning-outline" size={size} color={color} style={style} />
);

interface CircleRemoveMemberModalProps {
  visible: boolean;
  memberName: string | null;
  isPending: boolean;
  colors: { background: string; text: string; textSecondary: string };
  isDark: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CircleRemoveMemberModal({
  visible,
  memberName,
  isPending,
  colors,
  isDark,
  onCancel,
  onConfirm,
}: CircleRemoveMemberModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable
        style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 20 }}
        onPress={onCancel}
      >
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340 }}>
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{
              backgroundColor: colors.background,
              borderRadius: 20,
              padding: 24,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#FF3B3020",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <WarningIcon size={32} color="#FF3B30" />
            </View>

            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 8 }}>
              Remove Member?
            </Text>

            <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
              {`Are you sure you want to remove ${memberName ?? "this member"} from the circle?`}
            </Text>

            <View style={{ flexDirection: "row", width: "100%" }}>
              <Pressable
                onPress={onCancel}
                style={{
                  flex: 1,
                  backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  marginRight: 8,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                disabled={isPending}
                style={{
                  flex: 1,
                  backgroundColor: "#FF3B30",
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: isPending ? 0.5 : 1,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>
                  {isPending ? "Removing..." : "Remove"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
