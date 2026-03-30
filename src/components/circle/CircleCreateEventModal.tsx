import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
} from "react-native";
import { Button } from "@/ui/Button";

interface CircleCreateEventModalProps {
  visible: boolean;
  colors: { surface: string; text: string; textSecondary: string };
  isDark: boolean;
  themeColor: string;
  onClose: () => void;
  onCreatePress: () => void;
}

export function CircleCreateEventModal({
  visible,
  colors,
  isDark,
  themeColor,
  onClose,
  onCreatePress,
}: CircleCreateEventModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: 20,
            width: "85%",
            maxWidth: 340,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 16 }}>
            Create Event
          </Text>

          {/* Circle Only indicator */}
          <View style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6", borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <Text style={{
              textAlign: "center",
              fontSize: 14,
              fontWeight: "600",
              color: themeColor,
            }}>
              Circle Only
            </Text>
          </View>

          {/* Description text */}
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: "center", marginBottom: 20 }}>
            Events created here are only visible to friends in this group.
          </Text>

          {/* Create Button */}
          <Button
            variant="primary"
            label="Create"
            onPress={onCreatePress}
            style={{ borderRadius: 12 }}
          />

          {/* Cancel Button */}
          <Pressable
            onPress={onClose}
            style={{ paddingVertical: 12, marginTop: 8 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: colors.textSecondary, textAlign: "center" }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
