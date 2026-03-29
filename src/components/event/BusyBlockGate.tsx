import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { Lock } from "@/ui/icons";
import { Button } from "@/ui/Button";

interface BusyBlockGateColors {
  background: string;
  text: string;
  textSecondary: string;
  surface: string;
}

interface BusyBlockGateProps {
  colors: BusyBlockGateColors;
  onGoBack: () => void;
}

export function BusyBlockGate({ colors, onGoBack }: BusyBlockGateProps) {
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Busy", headerBackTitle: "Back" }} />
      <View className="flex-1 items-center justify-center px-6">
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-4"
          style={{ backgroundColor: colors.surface }}
        >
          <Lock size={28} color={colors.textSecondary} />
        </View>
        <Text
          className="text-xl font-semibold text-center mb-2"
          style={{ color: colors.text }}
        >
          Busy
        </Text>
        <Text
          className="text-center mb-6"
          style={{ color: colors.textSecondary, lineHeight: 22 }}
        >
          This time is blocked on the host's calendar.
        </Text>
        <Button
          variant="ghost"
          label="Go Back"
          onPress={onGoBack}
        />
      </View>
    </SafeAreaView>
  );
}
