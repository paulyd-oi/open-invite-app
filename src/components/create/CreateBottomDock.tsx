import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Keyboard, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette, Sparkles, Settings } from "@/ui/icons";
import * as Haptics from "expo-haptics";

export type DockMode = "theme" | "effect" | "settings";

interface CreateBottomDockProps {
  activeMode: DockMode | null;
  onModeChange: (mode: DockMode) => void;
  themed: boolean;
  isDark: boolean;
  glassText: string;
  glassTertiary: string;
  themeColor: string;
}

const DOCK_ITEMS: { mode: DockMode; label: string; Icon: typeof Palette }[] = [
  { mode: "theme", label: "Theme", Icon: Palette },
  { mode: "effect", label: "Effect", Icon: Sparkles },
  { mode: "settings", label: "Settings", Icon: Settings },
];

export function CreateBottomDock({
  activeMode,
  onModeChange,
  themed,
  isDark,
  glassText,
  glassTertiary,
  themeColor,
}: CreateBottomDockProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= 768;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  return (
    <View
      style={{
        position: "absolute",
        ...(isWide
          ? {
              left: Math.max(40, (screenWidth - 400) / 2),
              right: Math.max(40, (screenWidth - 400) / 2),
            }
          : { left: 0, right: 0, paddingHorizontal: 40 }),
        bottom: insets.bottom + 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
          backgroundColor: isDark ? "rgba(28,28,30,0.92)" : "rgba(255,255,255,0.92)",
          borderRadius: 28,
          paddingVertical: 6,
          paddingHorizontal: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.35 : 0.12,
          shadowRadius: 16,
          elevation: 16,
          borderWidth: 0.5,
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        }}
      >
        {DOCK_ITEMS.map(({ mode, label, Icon }) => {
          const isActive = activeMode === mode;
          const inactiveColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)";
          const color = isActive ? themeColor : inactiveColor;

          return (
            <Pressable
              key={mode}
              onPress={() => {
                Haptics.selectionAsync();
                onModeChange(mode);
              }}
              style={{
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 5,
                borderRadius: 16,
                backgroundColor: isActive ? (themeColor + "18") : "transparent",
              }}
            >
              <Icon size={18} color={color} />
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: isActive ? "700" : "500",
                  color,
                  marginTop: 1,
                  letterSpacing: 0.2,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
