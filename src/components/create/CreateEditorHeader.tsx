import React from "react";
import { View, Text, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useTheme } from "@/lib/ThemeContext";

interface CreateEditorHeaderProps {
  onCancel: () => void;
  onSave: () => void;
  isPending: boolean;
  themed: boolean;
  glassText: string;
  glassSecondary: string;
  themeColor: string;
  title?: string;
  onLayout?: (height: number) => void;
}

export function CreateEditorHeader({
  onCancel,
  onSave,
  isPending,
  themed,
  glassText,
  glassSecondary,
  themeColor,
  title,
  onLayout,
}: CreateEditorHeaderProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= 768;
  const { isDark } = useTheme();

  return (
    <View
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
      onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.height) : undefined}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={88}
        tint={isDark ? "dark" : "light"}
        style={{ paddingTop: insets.top, overflow: "hidden" }}
      >
        <View
          style={{
            borderBottomWidth: 0.5,
            borderBottomColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          }}
        >
          <View
            style={{
              paddingTop: 4,
              paddingHorizontal: 16,
              paddingBottom: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              ...(isWide ? { maxWidth: 600, alignSelf: "center" as const, width: "100%" } : undefined),
            }}
          >
            {/* Cancel */}
            <Pressable
              onPress={onCancel}
              hitSlop={8}
              style={{ minWidth: 70 }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "500",
                  color: glassSecondary,
                }}
              >
                Cancel
              </Text>
            </Pressable>

            {/* Title */}
            <Text
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: glassText,
              }}
            >
              {title ?? "New Event"}
            </Text>

            {/* Save */}
            <Pressable
              onPress={onSave}
              disabled={isPending}
              style={{
                minWidth: 70,
                alignItems: "flex-end",
              }}
            >
              <View
                style={{
                  backgroundColor: isPending
                    ? (themed ? "rgba(255,255,255,0.15)" : "#E5E7EB")
                    : themeColor,
                  borderRadius: 18,
                  paddingHorizontal: 16,
                  paddingVertical: 7,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {isPending ? (
                  <ActivityIndicator size="small" color={themed ? "#FFFFFF" : "#6B7280"} />
                ) : (
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#FFFFFF",
                    }}
                  >
                    Save
                  </Text>
                )}
              </View>
            </Pressable>
          </View>
        </View>
      </BlurView>
    </View>
  );
}
