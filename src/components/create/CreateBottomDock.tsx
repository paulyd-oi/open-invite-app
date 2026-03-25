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
        bottom: insets.bottom + 8,
        paddingHorizontal: 40,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
          backgroundColor: themed ? "rgba(0,0,0,0.5)" : "rgba(30,30,30,0.85)",
          borderRadius: 22,
          paddingVertical: 6,
          paddingHorizontal: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 8,
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        {DOCK_ITEMS.map(({ mode, label, Icon }) => {
          const isActive = activeMode === mode;
          const color = isActive ? themeColor : "rgba(255,255,255,0.5)";

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
                backgroundColor: isActive ? "rgba(255,255,255,0.12)" : "transparent",
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
