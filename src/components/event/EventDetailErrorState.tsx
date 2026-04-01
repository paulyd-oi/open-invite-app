import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { AlertTriangle } from "@/ui/icons";
import { Button } from "@/ui/Button";

export interface EventDetailErrorStateProps {
  title: string;
  subtitle: string;
  onBack: () => void;
  onRetry?: () => void;
  testID?: string;
  themeColor: string;
  colors: any;
}

export const EventDetailErrorState: React.FC<EventDetailErrorStateProps> = ({
  title,
  subtitle,
  onBack,
  onRetry,
  testID = "event-detail-error",
  themeColor,
  colors,
}) => {
  return (
    <SafeAreaView testID={testID} className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Event", headerBackTitle: "Back" }} />
      <View className="flex-1 items-center justify-center px-8">
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-6"
          style={{ backgroundColor: colors.surfaceElevated }}
        >
          <AlertTriangle size={40} color={colors.textTertiary} />
        </View>
        <Text className="text-xl font-bold text-center mb-3" style={{ color: colors.text }}>
          {title}
        </Text>
        <Text className="text-center mb-8" style={{ color: colors.textSecondary }}>
          {subtitle}
        </Text>
        <View className="flex-row gap-3">
          <Button
            variant="secondary"
            label="Back"
            onPress={onBack}
            style={{ flex: 1 }}
          />
          {onRetry && (
            <Button
              variant="primary"
              label="Try Again"
              onPress={onRetry}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};
