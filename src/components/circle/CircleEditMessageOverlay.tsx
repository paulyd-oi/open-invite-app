import React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
} from "react-native";

interface CircleEditMessageOverlayProps {
  visible: boolean;
  draftContent: string;
  colors: { text: string; textSecondary: string };
  isDark: boolean;
  themeColor: string;
  onClose: () => void;
  onChangeText: (text: string) => void;
  onSave: () => void;
}

export function CircleEditMessageOverlay({
  visible,
  draftContent,
  colors,
  isDark,
  themeColor,
  onClose,
  onChangeText,
  onSave,
}: CircleEditMessageOverlayProps) {
  if (!visible) return null;

  return (
    <Pressable
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "center",
        alignItems: "center",
      }}
      onPress={onClose}
    >
      <Pressable
        style={{
          width: "85%",
          backgroundColor: isDark ? "#2c2c2e" : "#ffffff",
          borderRadius: 16,
          padding: 20,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        }}
        onPress={() => {}}
      >
        <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text, marginBottom: 12 }}>Edit message</Text>
        <TextInput
          value={draftContent}
          onChangeText={onChangeText}
          multiline
          style={{
            color: colors.text,
            fontSize: 16,
            backgroundColor: isDark ? "#1c1c1e" : "#f3f4f6",
            borderRadius: 10,
            padding: 12,
            minHeight: 60,
            maxHeight: 160,
            textAlignVertical: "top",
          }}
          autoFocus
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 12 }}>
          <Pressable
            onPress={onClose}
            style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "500" }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onSave}
            style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: themeColor }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Save</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}
