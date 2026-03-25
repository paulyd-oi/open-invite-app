import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette, Sparkles, Settings } from "@/ui/icons";
import * as Haptics from "expo-haptics";

export type DockMode = "theme" | "effect" | "settings";

interface CreateBottomDockProps {
  activeMode: DockMode | null;
  onModeChange: (mode: DockMode) => void;
  themed: boolean;
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
  glassText,
  glassTertiary,
  themeColor,
}: CreateBottomDockProps) {
  const insets = useSafeAreaInsets();
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
        left: 0,
        right: 0,
        bottom: 56 + insets.bottom, // sits above BottomNavigation
        paddingHorizontal: 24,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
          backgroundColor: themed ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.92)",
          borderRadius: 28,
          paddingVertical: 8,
          paddingHorizontal: 12,
          // Subtle shadow
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: themed ? 0.3 : 0.1,
          shadowRadius: 8,
          elevation: 6,
          borderWidth: 1,
          borderColor: themed ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
        }}
      >
        {DOCK_ITEMS.map(({ mode, label, Icon }) => {
          const isActive = activeMode === mode;
          const color = isActive ? themeColor : (themed ? glassTertiary : "#9CA3AF");

          return (
            <Pressable
              key={mode}
              onPress={() => {
                Haptics.selectionAsync();
                onModeChange(mode);
              }}
              style={{
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: isActive
                  ? (themed ? "rgba(255,255,255,0.12)" : `${themeColor}12`)
                  : "transparent",
              }}
            >
              <Icon size={20} color={color} />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: isActive ? "600" : "500",
                  color,
                  marginTop: 2,
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
