import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { UserCheck } from "@/ui/icons";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";

interface CircleFriendSuggestionModalProps {
  visible: boolean;
  suggestions: Array<{ newMemberName: string; newMemberId: string }>;
  colors: { background: string; text: string; textSecondary: string };
  themeColor: string;
  onClose: () => void;
}

export function CircleFriendSuggestionModal({
  visible,
  suggestions,
  colors,
  themeColor,
  onClose,
}: CircleFriendSuggestionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 20 }}
        onPress={onClose}
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
                backgroundColor: `${themeColor}20`,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <UserCheck size={32} color={themeColor} />
            </View>

            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 8 }}>
              Members Added!
            </Text>

            <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
              {suggestions.length === 1
                ? `${suggestions[0]?.newMemberName} has been added to the circle.`
                : `${suggestions.length} new members have been added to the circle.`}
              {"\n\n"}
              <Text style={{ color: colors.text, fontWeight: "500" }}>
                Tip: Make sure everyone in the circle is friends with each other to see all events!
              </Text>
            </Text>

            <View style={{ flexDirection: "row", width: "100%" }}>
              <Button
                variant="primary"
                label="Got it!"
                onPress={onClose}
                style={{ flex: 1, borderRadius: RADIUS.md }}
              />
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
