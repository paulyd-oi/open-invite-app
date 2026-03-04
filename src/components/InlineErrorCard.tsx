import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useTheme } from "@/lib/ThemeContext";
import { AlertTriangle } from "@/ui/icons";

interface InlineErrorCardProps {
  cardName: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

/**
 * Compact inline error card that replaces a section when its query fails
 * and no cached data is available. Shows an error message with a retry button.
 */
export function InlineErrorCard({ cardName, onRetry, isRetrying = false }: InlineErrorCardProps) {
  const { colors } = useTheme();

  return (
    <View
      className="rounded-xl p-4 border flex-row items-center justify-between"
      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
    >
      <View className="flex-row items-center flex-1 mr-3">
        <AlertTriangle size={16} color={colors.textTertiary} />
        <Text
          className="text-sm ml-2"
          style={{ color: colors.textSecondary }}
          numberOfLines={1}
        >
          Couldn't load {cardName}
        </Text>
      </View>

      <Pressable
        onPress={onRetry}
        disabled={isRetrying}
        className="rounded-lg px-3 py-1.5"
        style={({ pressed }) => ({
          backgroundColor: pressed ? `${colors.textTertiary}20` : `${colors.textTertiary}10`,
          opacity: isRetrying ? 0.6 : 1,
        })}
      >
        {isRetrying ? (
          <View className="flex-row items-center">
            <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginRight: 4 }} />
            <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
              Retrying…
            </Text>
          </View>
        ) : (
          <Text className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
            Retry
          </Text>
        )}
      </Pressable>
    </View>
  );
}
