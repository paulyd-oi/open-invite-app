/**
 * ThemePicker — Shared theme swatch grid with free/premium sections.
 *
 * Surface-agnostic: used by ThemeTray (event create) and profile editor.
 * Parent passes pre-filtered theme list and handles premium gating.
 * Supports optional pack-based grouping with section labels.
 *
 * Does NOT know about events, profiles, Theme Studio, or EffectTray.
 */

import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Crown } from "@/ui/icons";
import {
  EVENT_THEMES,
  isPremiumTheme,
  isVideoTheme,
  BASIC_THEME_IDS,
  THEME_DISPLAY_ORDER,
  type ThemeId,
  type ThemePack,
} from "@/lib/eventThemes";

// ─── Constants ───────────────────────────────────────────────

const SWATCH_SIZE = 42;
const SWATCH_RADIUS = 21;
const SWATCH_GAP = 8;

// ─── Props ───────────────────────────────────────────────────

export interface ThemePickerProps {
  /** Theme IDs to display (pre-filtered by parent for surface) */
  themeIds: ThemeId[];
  /** Optional pack grouping — when provided, themes render in labeled sections */
  packs?: readonly ThemePack[];
  selectedThemeId: ThemeId | null;
  userIsPro: boolean;
  themeColor: string;
  isDark: boolean;
  /** Called when user taps a free theme (or a premium theme if Pro) */
  onThemeSelect: (themeId: ThemeId | null) => void;
  /** Called when free user taps a premium theme */
  onPremiumUpsell: (themeId: ThemeId) => void;
  /** Horizontal scroll mode (compact rail) or vertical wrap grid */
  layout?: "horizontal" | "grid";
}

// ─── Component ───────────────────────────────────────────────

export function ThemePicker({
  themeIds,
  packs,
  selectedThemeId,
  userIsPro,
  themeColor,
  isDark,
  onThemeSelect,
  onPremiumUpsell,
  layout = "horizontal",
}: ThemePickerProps) {
  const handlePress = (tid: ThemeId) => {
    Haptics.selectionAsync();
    // Gate-on-save: let users preview any theme freely, premium gate at save time
    onThemeSelect(selectedThemeId === tid ? null : tid);
  };

  const renderSwatch = (tid: ThemeId) => {
    const t = EVENT_THEMES[tid];
    if (!t) return null;
    const selected = selectedThemeId === tid;
    const showCrown = isPremiumTheme(tid) && !userIsPro;

    return (
      <ThemeSwatch
        key={tid}
        accentColor={t.backAccent}
        bodyColor={t.backBgLight}
        isSelected={selected}
        isVideo={isVideoTheme(tid)}
        showCrown={showCrown}
        themeColor={themeColor}
        isDark={isDark}
        onPress={() => handlePress(tid)}
      />
    );
  };

  // ── Pack-based rendering ──────────────────────────────────
  if (packs && packs.length > 0) {
    const dividerColor = isDark
      ? "rgba(255,255,255,0.12)"
      : "rgba(0,0,0,0.08)";
    const labelColor = isDark
      ? "rgba(255,255,255,0.35)"
      : "rgba(0,0,0,0.28)";

    const sections = packs
      .map((pack, idx) => {
        const validIds = pack.ids.filter((id) =>
          (themeIds as readonly string[]).includes(id),
        ) as ThemeId[];
        if (validIds.length === 0) return null;

        return (
          <React.Fragment key={pack.label}>
            {/* Divider between sections */}
            {idx > 0 && (
              <View
                style={{
                  justifyContent: "center",
                  paddingHorizontal: layout === "horizontal" ? 2 : 0,
                  paddingVertical: layout === "grid" ? 4 : 0,
                }}
              >
                {layout === "horizontal" ? (
                  <View
                    style={{
                      width: 1,
                      height: 28,
                      backgroundColor: dividerColor,
                      borderRadius: 1,
                    }}
                  />
                ) : (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: dividerColor,
                      marginVertical: 4,
                    }}
                  />
                )}
              </View>
            )}

            {/* Section label */}
            <View
              style={{
                justifyContent: "center",
                paddingHorizontal: layout === "horizontal" ? 2 : 0,
                paddingVertical: layout === "grid" ? 2 : 0,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "700",
                  color: labelColor,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
                numberOfLines={1}
              >
                {pack.label}
              </Text>
            </View>

            {/* Swatches */}
            {validIds.map(renderSwatch)}
          </React.Fragment>
        );
      })
      .filter(Boolean);

    if (layout === "horizontal") {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: SWATCH_GAP,
            paddingRight: 8,
            alignItems: "center",
          }}
          style={{ flexGrow: 0 }}
        >
          {sections}
        </ScrollView>
      );
    }

    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SWATCH_GAP }}>
        {sections}
      </View>
    );
  }

  // ── Flat rendering (backward compatible) ──────────────────
  const displayOrder = themeIds.filter((id) =>
    THEME_DISPLAY_ORDER.includes(id),
  );
  // Sort by THEME_DISPLAY_ORDER position
  displayOrder.sort(
    (a, b) => THEME_DISPLAY_ORDER.indexOf(a) - THEME_DISPLAY_ORDER.indexOf(b),
  );

  const freeThemes = displayOrder.filter(
    (id) => (BASIC_THEME_IDS as readonly string[]).includes(id),
  );
  const premiumThemes = displayOrder.filter(
    (id) => !(BASIC_THEME_IDS as readonly string[]).includes(id),
  );

  const content = (
    <>
      {freeThemes.map(renderSwatch)}

      {/* Section divider between free and premium */}
      {premiumThemes.length > 0 && (
        <View
          style={{
            justifyContent: "center",
            paddingHorizontal: layout === "horizontal" ? 2 : 0,
            paddingVertical: layout === "grid" ? 4 : 0,
          }}
        >
          {layout === "horizontal" ? (
            <View
              style={{
                width: 1,
                height: 28,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.08)",
                borderRadius: 1,
              }}
            />
          ) : (
            <View
              style={{
                height: 1,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
                marginVertical: 4,
              }}
            />
          )}
        </View>
      )}

      {premiumThemes.map(renderSwatch)}
    </>
  );

  if (layout === "horizontal") {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SWATCH_GAP, paddingRight: 8 }}
        style={{ flexGrow: 0 }}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SWATCH_GAP }}>
      {content}
    </View>
  );
}

// ─── Theme Swatch ────────────────────────────────────────────

function ThemeSwatch({
  accentColor,
  bodyColor,
  isSelected,
  isVideo,
  showCrown,
  themeColor,
  isDark,
  onPress,
}: {
  accentColor: string;
  bodyColor: string;
  isSelected: boolean;
  isVideo?: boolean;
  showCrown?: boolean;
  themeColor: string;
  isDark: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          width: SWATCH_SIZE,
          height: SWATCH_SIZE,
          borderRadius: SWATCH_RADIUS,
          overflow: "hidden",
          borderWidth: isSelected ? 2.5 : 0.5,
          borderColor: isSelected
            ? themeColor
            : isDark
              ? "rgba(255,255,255,0.12)"
              : "rgba(0,0,0,0.08)",
        }}
      >
        <LinearGradient
          colors={[accentColor, bodyColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </View>
      {/* Crown badge for premium themes */}
      {showCrown && (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: "#FFD700",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.3,
            shadowRadius: 2,
            elevation: 3,
          }}
        >
          <Crown size={9} color="#000" />
        </View>
      )}
      {isVideo && !showCrown && (
        <View
          style={{
            position: "absolute",
            top: 1,
            right: 1,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 8, lineHeight: 12, marginLeft: 1 }}>
            ▶
          </Text>
        </View>
      )}
    </Pressable>
  );
}
