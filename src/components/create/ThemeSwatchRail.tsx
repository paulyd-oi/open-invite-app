import React from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { Lock, Sparkles, Crown, Pencil, Trash2 } from "@/ui/icons";
import { EVENT_THEMES, isPremiumTheme, getVisibleThemePacks, type ThemeId } from "@/lib/eventThemes";
import { MAX_CUSTOM_THEMES, type CustomTheme } from "@/lib/customThemeStorage";
import * as Haptics from "expo-haptics";

interface ThemeSwatchRailProps {
  selectedThemeId: ThemeId | null;
  selectedCustomTheme: CustomTheme | null;
  customThemes: CustomTheme[];
  userIsPro: boolean;
  isDark: boolean;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  onSelectTheme: (id: ThemeId | null) => void;
  onSelectCustomTheme: (ct: CustomTheme | null) => void;
  onDeleteCustomTheme: (id: string) => void;
  onOpenPaywall: (source: string) => void;
  onOpenThemeBuilder: (editId?: string) => void;
}

/** Mini gradient swatch — renders 2-3 color bands from the theme's gradient. */
function GradientSwatch({
  colors,
  size = 44,
  selected,
  accentColor,
  locked,
  opacity = 1,
}: {
  colors: string[];
  size?: number;
  selected: boolean;
  accentColor: string;
  locked?: boolean;
  opacity?: number;
}) {
  // Extract just the color values, strip alpha for swatch visibility
  const swatchColors = colors.slice(0, 4).map((c) => {
    // Bump up alpha for swatch readability — most theme gradients are low opacity
    const match = c.match(/rgba?\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(",").map((s) => s.trim());
      if (parts.length >= 3) {
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, 0.9)`;
      }
    }
    return c;
  });

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        borderWidth: selected ? 2.5 : 1,
        borderColor: selected ? accentColor : "rgba(255,255,255,0.12)",
        opacity: locked ? 0.5 : opacity,
      }}
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        {swatchColors.map((color, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: color }} />
        ))}
      </View>
      {locked && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.3)",
          }}
        >
          <Lock size={10} color="rgba(255,255,255,0.8)" />
        </View>
      )}
    </View>
  );
}

/** Fallback swatch using backBgDark + backAccent when no gradient. */
function SolidSwatch({
  bgColor,
  accentColor,
  size = 44,
  selected,
  locked,
}: {
  bgColor: string;
  accentColor: string;
  size?: number;
  selected: boolean;
  locked?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        borderWidth: selected ? 2.5 : 1,
        borderColor: selected ? accentColor : "rgba(255,255,255,0.12)",
        opacity: locked ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ flex: 1, backgroundColor: bgColor }} />
        <View style={{ flex: 1, backgroundColor: accentColor }} />
      </View>
      {locked && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.3)",
          }}
        >
          <Lock size={10} color="rgba(255,255,255,0.8)" />
        </View>
      )}
    </View>
  );
}

export function ThemeSwatchRail({
  selectedThemeId,
  selectedCustomTheme,
  customThemes,
  userIsPro,
  isDark,
  glassText,
  glassSecondary,
  glassTertiary,
  onSelectTheme,
  onSelectCustomTheme,
  onDeleteCustomTheme,
  onOpenPaywall,
  onOpenThemeBuilder,
}: ThemeSwatchRailProps) {
  // Resolve selected label
  const selectedLabel = selectedThemeId
    ? EVENT_THEMES[selectedThemeId]?.label
    : selectedCustomTheme
      ? selectedCustomTheme.name
      : null;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
    >
      {/* Selected theme label */}
      <Text style={{ fontSize: 15, fontWeight: "600", color: glassText, marginBottom: 14 }}>
        {selectedLabel ?? "Choose a theme"}
      </Text>

      {/* ── My Themes (Pro only) ── */}
      {userIsPro && (
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: glassTertiary }}>My Themes</Text>
            {customThemes.length > 0 && (
              <Text style={{ fontSize: 10, color: glassTertiary }}>{customThemes.length}/{MAX_CUSTOM_THEMES}</Text>
            )}
          </View>

          {customThemes.length === 0 ? (
            <Pressable
              onPress={() => onOpenThemeBuilder()}
              style={{
                alignItems: "center",
                paddingVertical: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              }}
            >
              <Sparkles size={16} color={glassTertiary} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: glassSecondary, marginTop: 4 }}>
                Create your first theme
              </Text>
            </Pressable>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {customThemes.map((ct) => {
                  const isSelected = selectedCustomTheme?.id === ct.id;
                  const gradColors = ct.visualStack.gradient?.colors ?? ["#333", "#555"];
                  return (
                    <View key={ct.id} style={{ alignItems: "center" }}>
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          onSelectCustomTheme(isSelected ? null : ct);
                        }}
                      >
                        <GradientSwatch
                          colors={gradColors}
                          selected={isSelected}
                          accentColor={gradColors[0] ?? "#8B5CF6"}
                        />
                      </Pressable>
                      {/* Edit/Delete when selected */}
                      {isSelected && (
                        <View style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
                          <Pressable
                            onPress={() => onOpenThemeBuilder(ct.id)}
                            hitSlop={6}
                            style={{ padding: 3, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.35)" }}
                          >
                            <Pencil size={10} color="#FFFFFF" />
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              Alert.alert(
                                "Delete Theme",
                                `Delete "${ct.name}"? This can't be undone.`,
                                [
                                  { text: "Cancel", style: "cancel" },
                                  { text: "Delete", style: "destructive", onPress: () => onDeleteCustomTheme(ct.id) },
                                ],
                              );
                            }}
                            hitSlop={6}
                            style={{ padding: 3, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.35)" }}
                          >
                            <Trash2 size={10} color="#EF4444" />
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Theme packs ── */}
      {getVisibleThemePacks().map((pack, packIdx, packs) => {
        const isFirstPremium = pack.premium && (packIdx === 0 || !packs[packIdx - 1].premium);

        return (
          <View key={pack.label} style={{ marginBottom: 12 }}>
            {/* Premium divider */}
            {isFirstPremium && (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }} />
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }}>
                  <Crown size={10} color={glassTertiary} />
                  <Text style={{ fontSize: 10, fontWeight: "600", color: glassTertiary, marginLeft: 3, letterSpacing: 0.5 }}>PRO</Text>
                </View>
                <View style={{ flex: 1, height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }} />
              </View>
            )}

            {/* Pack label */}
            <Text style={{ fontSize: 11, fontWeight: "600", color: glassTertiary, marginBottom: 8, paddingLeft: 2 }}>
              {pack.label}
            </Text>

            {/* Swatch rail */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {pack.ids.map((tid) => {
                  const t = EVENT_THEMES[tid];
                  const selected = selectedThemeId === tid;
                  const premium = isPremiumTheme(tid);
                  const locked = premium && !userIsPro;
                  const gradColors = t.visualStack?.gradient?.colors;

                  return (
                    <Pressable
                      key={tid}
                      onPress={() => {
                        if (locked) {
                          onOpenPaywall("theme_picker");
                          return;
                        }
                        Haptics.selectionAsync();
                        onSelectTheme(selected ? null : tid);
                      }}
                    >
                      {gradColors ? (
                        <GradientSwatch
                          colors={gradColors}
                          selected={selected}
                          accentColor={t.backAccent}
                          locked={locked}
                        />
                      ) : (
                        <SolidSwatch
                          bgColor={t.backBgDark}
                          accentColor={t.backAccent}
                          selected={selected}
                          locked={locked}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        );
      })}

      {/* Create My Theme CTA */}
      {(() => {
        const atCap = userIsPro && customThemes.length >= MAX_CUSTOM_THEMES;
        return (
          <Pressable
            onPress={() => {
              if (!userIsPro) {
                onOpenPaywall("custom_theme_builder");
                return;
              }
              if (atCap) return;
              Haptics.selectionAsync();
              onOpenThemeBuilder();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
              backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              opacity: atCap ? 0.4 : 1,
              marginTop: 4,
            }}
          >
            <Sparkles size={14} color={glassTertiary} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: glassSecondary }}>
              {atCap ? `${MAX_CUSTOM_THEMES} themes max` : "Create My Theme"}
            </Text>
            {!userIsPro && <Lock size={10} color={glassTertiary} />}
          </Pressable>
        );
      })()}
    </ScrollView>
  );
}
