/**
 * SettingsProfileAppearanceSection — Profile theme + card color customization.
 *
 * Inline in settings scroll (NOT a bottom tray/studio).
 * Uses shared ThemePicker for theme swatches and CardColorPicker for card color.
 */

import React, { useCallback, useRef } from "react";
import { View, Text, Pressable, type LayoutChangeEvent } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Sparkles } from "@/ui/icons";
import { ThemePicker } from "@/components/customization/ThemePicker";
import { CardColorPicker } from "@/components/create/CardColorPicker";
import { getThemesForSurface, type ThemeId } from "@/lib/eventThemes";

const PROFILE_THEME_IDS = getThemesForSurface("profile");

interface SettingsProfileAppearanceSectionProps {
  profileThemeId: ThemeId | null;
  profileCardColor: string | null;
  userIsPro: boolean;
  themeColor: string;
  isDark: boolean;
  colors: {
    text: string;
    textSecondary: string;
    textTertiary: string;
    surface: string;
    border: string;
  };
  onThemeSelect: (themeId: ThemeId | null) => void;
  onPremiumUpsell: (themeId: ThemeId) => void;
  onCardColorChange: (color: string | null) => void;
  onSectionVisible?: () => void;
}

export function SettingsProfileAppearanceSection({
  profileThemeId,
  profileCardColor,
  userIsPro,
  themeColor,
  isDark,
  colors,
  onThemeSelect,
  onPremiumUpsell,
  onCardColorChange,
  onSectionVisible,
}: SettingsProfileAppearanceSectionProps) {
  const firedRef = useRef(false);
  const handleLayout = useCallback(() => {
    if (!firedRef.current && onSectionVisible) {
      firedRef.current = true;
      onSectionVisible();
    }
  }, [onSectionVisible]);

  return (
    <Animated.View entering={FadeInDown.delay(105).springify()} className="mx-4 mt-6" onLayout={handleLayout}>
      <Text
        style={{ color: colors.textSecondary }}
        className="text-sm font-medium mb-2 ml-2"
      >
        PROFILE STYLE
      </Text>
      <View
        style={{ backgroundColor: colors.surface }}
        className="rounded-2xl overflow-hidden p-4"
      >
        {/* Theme picker */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <Sparkles size={16} color={themeColor} />
            <Text
              style={{ color: colors.text, fontSize: 15, fontWeight: "600", marginLeft: 8 }}
            >
              Profile Theme
            </Text>
            {profileThemeId && (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  onThemeSelect(null);
                }}
                style={{ marginLeft: "auto" }}
              >
                <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
                  Reset
                </Text>
              </Pressable>
            )}
          </View>
          <ThemePicker
            themeIds={PROFILE_THEME_IDS}
            selectedThemeId={profileThemeId}
            userIsPro={userIsPro}
            themeColor={themeColor}
            isDark={isDark}
            onThemeSelect={onThemeSelect}
            onPremiumUpsell={onPremiumUpsell}
            layout="horizontal"
          />
        </View>

        {/* Divider */}
        <View
          style={{
            height: 1,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.04)",
            marginBottom: 16,
          }}
        />

        {/* Card color picker */}
        <CardColorPicker
          cardColor={profileCardColor}
          onColorChange={onCardColorChange}
          glassText={colors.text}
          glassSecondary={colors.textSecondary}
          glassSurface={colors.surface}
          glassBorder={colors.border}
          isDark={isDark}
        />
      </View>
    </Animated.View>
  );
}
