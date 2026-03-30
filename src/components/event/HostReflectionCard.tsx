import React from "react";
import { Pressable, View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { NotebookPen, Pencil, Star } from "@/ui/icons";

interface HostReflectionCardColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
}

interface HostReflectionCardProps {
  summary: string | null | undefined;
  summaryRating: number | null | undefined;
  isDark: boolean;
  themeColor: string;
  colors: HostReflectionCardColors;
  onEditReflection: () => void;
  onAddReflection: () => void;
  onDismissReflection: () => void;
  isDismissPending: boolean;
}

export function HostReflectionCard({
  summary,
  summaryRating,
  isDark,
  themeColor,
  colors,
  onEditReflection,
  onAddReflection,
  onDismissReflection,
  isDismissPending,
}: HostReflectionCardProps) {
  const hasSummary = !!summary && summary.length > 0;

  return (
    <Animated.View entering={FadeInDown.delay(150).springify()} style={{ marginHorizontal: 16, marginBottom: 0 }}>
      <View className="rounded-2xl p-5" style={{ backgroundColor: isDark ? "rgba(20,20,24,0.52)" : "rgba(255,255,255,0.76)", borderRadius: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <NotebookPen size={20} color={themeColor} />
            <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
              Your Reflection
            </Text>
          </View>
          <View className="px-2 py-1 rounded-full" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
            <Text className="text-xs" style={{ color: colors.textTertiary }}>Private</Text>
          </View>
        </View>

        {hasSummary ? (
          <View>
            {summaryRating && (
              <View className="flex-row items-center mb-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={18}
                    color={star <= summaryRating! ? "#F59E0B" : isDark ? "#3C3C3E" : "#E5E7EB"}
                  />
                ))}
              </View>
            )}
            <Text style={{ color: colors.text, lineHeight: 22 }}>
              {summary}
            </Text>
            <Pressable
              onPress={onEditReflection}
              className="mt-3 flex-row items-center"
            >
              <Pencil size={14} color={themeColor} />
              <Text className="ml-1 font-medium" style={{ color: themeColor }}>
                Edit reflection
              </Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Pressable
              onPress={onAddReflection}
              className="rounded-xl p-4 items-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}
            >
              <View className="flex-row items-center mb-2">
                <Star size={20} color="#F59E0B" />
                <Text className="ml-2 font-semibold" style={{ color: colors.text }}>
                  How did it go?
                </Text>
              </View>
              <Text className="text-sm text-center" style={{ color: colors.textSecondary }}>
                Take a moment to reflect on this event. Add notes and rate how it went!
              </Text>
              <View
                className="mt-3 px-4 py-2 rounded-full"
                style={{ backgroundColor: themeColor }}
              >
                <Text className="text-white font-medium">Add Reflection</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={onDismissReflection}
              disabled={isDismissPending}
              className="mt-3 items-center"
            >
              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                Don't ask for this event
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}
