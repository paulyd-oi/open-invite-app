import React from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button } from "@/ui/Button";

interface CircleLifecycleChipsProps {
  lifecycleState: string | null;
  lifecycleNote: string | null;
  planLockNote: string | null | undefined;
  completionDismissed: boolean;
  colors: { text: string };
  isDark: boolean;
  onFinalizedChipPress: () => void;
  onRunItBack: () => void;
  onDismissCompletion: () => void;
}

export function CircleLifecycleChips({
  lifecycleState,
  lifecycleNote,
  planLockNote,
  completionDismissed,
  colors,
  isDark,
  onFinalizedChipPress,
  onRunItBack,
  onDismissCompletion,
}: CircleLifecycleChipsProps) {
  return (
    <>
      {/* [P1_LIFECYCLE_UI] Finalized Chip */}
      {lifecycleState === "finalized" && (
        <Pressable
          onPress={onFinalizedChipPress}
          style={{
            alignSelf: "center",
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingVertical: 6,
            marginVertical: 6,
            borderRadius: 16,
            backgroundColor: isDark ? "rgba(52,199,89,0.10)" : "rgba(48,161,78,0.08)",
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: isDark ? "#34C759" : "#1A7F37" }}>
            {"\u2705"} Finalized{lifecycleNote ? ` \u2022 ${lifecycleNote}` : (planLockNote ? ` \u2022 ${planLockNote}` : "")}
          </Text>
        </Pressable>
      )}

      {/* [P1_LIFECYCLE_UI] Completion Prompt — ephemeral run-it-back */}
      {lifecycleState === "completed" && !completionDismissed && (
        <Animated.View entering={FadeIn.duration(300)} style={{
          alignItems: "center",
          paddingVertical: 10,
          paddingHorizontal: 16,
          marginVertical: 4,
          gap: 8,
        }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text, textAlign: "center" }}>
            {"\uD83C\uDF89"} Event done {"\u2014"} run it back?
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              variant="primary"
              size="sm"
              label="Start new plan"
              onPress={onRunItBack}
            />
            <Button
              variant="secondary"
              size="sm"
              label="Dismiss"
              onPress={onDismissCompletion}
            />
          </View>
        </Animated.View>
      )}
    </>
  );
}
