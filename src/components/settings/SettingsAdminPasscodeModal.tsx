import React from "react";
import { View, Text, Modal, TextInput, Pressable } from "react-native";
import { Button } from "@/ui/Button";
import * as Haptics from "expo-haptics";

interface SettingsAdminPasscodeModalProps {
  visible: boolean;
  passcodeInput: string;
  passcodeError: boolean;
  colors: { text: string; textSecondary: string; textTertiary: string; separator: string; surface: string; background: string };
  isDark: boolean;
  onClose: () => void;
  onPasscodeChange: (text: string) => void;
  onSubmit: () => void;
}

export function SettingsAdminPasscodeModal({
  visible,
  passcodeInput,
  passcodeError,
  colors,
  isDark,
  onClose,
  onPasscodeChange,
  onSubmit,
}: SettingsAdminPasscodeModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-center items-center"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          className="mx-6 rounded-2xl p-6"
          style={{ backgroundColor: colors.surface, maxWidth: 320, width: "85%" }}
        >
          <Text className="text-lg font-bold text-center mb-3" style={{ color: colors.text }}>
            Enter Code
          </Text>
          <Text className="text-sm text-center mb-4" style={{ color: colors.textSecondary }}>
            Enter code to continue
          </Text>
          <TextInput
            value={passcodeInput}
            onChangeText={onPasscodeChange}
            placeholder="Passcode"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            keyboardType="number-pad"
            autoFocus
            className="rounded-xl px-4 py-3 text-center text-lg mb-3"
            style={{
              backgroundColor: colors.separator,
              color: colors.text,
              borderWidth: passcodeError ? 2 : 0,
              borderColor: passcodeError ? "#EF4444" : "transparent",
            }}
            onSubmitEditing={onSubmit}
          />
          {passcodeError && (
            <Text className="text-sm text-center mb-3" style={{ color: "#EF4444" }}>
              Incorrect passcode
            </Text>
          )}
          <View className="flex-row gap-3">
            <Button
              variant="secondary"
              label="Cancel"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              style={{ flex: 1, borderRadius: 12 }}
            />
            <Button
              variant="primary"
              label="Submit"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSubmit();
              }}
              style={{ flex: 1, borderRadius: 12 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
