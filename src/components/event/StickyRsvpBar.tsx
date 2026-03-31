import React from "react";
import { Pressable, View, Text, ActivityIndicator } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Check, Heart, Users, RefreshCw } from "@/ui/icons";

interface StickyRsvpBarColors {
  text: string;
  textTertiary: string;
}

interface StickyRsvpBarProps {
  effectiveGoingCount: number;
  isFull: boolean;
  myRsvpStatus: string | null;
  isPending: boolean;
  isDark: boolean;
  screenWidth: number;
  bottomInset: number;
  colors: StickyRsvpBarColors;
  themeColor?: string;
  onRsvpGoing: () => void;
  onRsvpInterested: () => void;
  onChangeRsvp?: () => void;
}

// Glass surface tokens
const GLASS = {
  imIn: {
    bg: "#22C55E",
    border: "rgba(255,255,255,0.25)",
    shadow: { color: "#22C55E", opacity: 0.35, radius: 8, offset: { width: 0, height: 3 } },
  },
  save: {
    dark: { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.15)" },
    light: { bg: "rgba(255,255,255,0.60)", border: "rgba(0,0,0,0.08)" },
  },
  full: {
    dark: { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.10)" },
    light: { bg: "rgba(0,0,0,0.04)", border: "rgba(0,0,0,0.06)" },
  },
} as const;

export function StickyRsvpBar({
  effectiveGoingCount,
  isFull,
  myRsvpStatus,
  isPending,
  isDark,
  screenWidth,
  bottomInset,
  colors,
  onRsvpGoing,
  onRsvpInterested,
  onChangeRsvp,
}: StickyRsvpBarProps) {
  const saveGlass = isDark ? GLASS.save.dark : GLASS.save.light;
  const fullGlass = isDark ? GLASS.full.dark : GLASS.full.light;
  const isConfirmed = myRsvpStatus === "going";

  return (
    <Animated.View
      entering={FadeInDown.duration(300).springify()}
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: bottomInset + 8,
        paddingTop: 10,
        paddingHorizontal: 16,
        // Transparent container — buttons carry the visual weight
      }}
    >
      {effectiveGoingCount > 0 && (
        <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textTertiary, textAlign: "center", marginBottom: 6 }}>
          {effectiveGoingCount} going
        </Text>
      )}
      {isConfirmed ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <View style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 14,
            borderRadius: 16,
            backgroundColor: GLASS.imIn.bg,
            borderWidth: 1,
            borderColor: GLASS.imIn.border,
          }}>
            <Check size={16} color="#FFFFFF" />
            <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.2 }}>You're In</Text>
          </View>
          {onChangeRsvp && (
            <Pressable
              onPress={onChangeRsvp}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 14,
                paddingHorizontal: 20,
                borderRadius: 16,
                backgroundColor: saveGlass.bg,
                borderWidth: 1,
                borderColor: saveGlass.border,
              }}
            >
              <RefreshCw size={14} color={colors.text} />
              <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: colors.text }}>Change</Text>
            </Pressable>
          )}
        </View>
      ) : isFull ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <View style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 13,
            borderRadius: 16,
            backgroundColor: fullGlass.bg,
            borderWidth: 1,
            borderColor: fullGlass.border,
            opacity: 0.6,
          }}>
            <Users size={16} color={colors.textTertiary} />
            <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: colors.textTertiary }}>Full</Text>
          </View>
          <Pressable
            onPress={onRsvpInterested}
            disabled={isPending}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 13,
              paddingHorizontal: 20,
              borderRadius: 16,
              backgroundColor: saveGlass.bg,
              borderWidth: 1,
              borderColor: saveGlass.border,
            }}
          >
            <Heart size={16} color={colors.text} />
            <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: colors.text }}>
              {myRsvpStatus === "interested" ? "Saved \u2713" : "Save"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          opacity: isPending ? 0.6 : 1,
        }}>
          {/* I'm In — green glass, primary weight */}
          <Pressable
            onPress={onRsvpGoing}
            disabled={isPending}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 16,
              backgroundColor: GLASS.imIn.bg,
              borderWidth: 1,
              borderColor: GLASS.imIn.border,
              shadowColor: GLASS.imIn.shadow.color,
              shadowOffset: GLASS.imIn.shadow.offset,
              shadowOpacity: GLASS.imIn.shadow.opacity,
              shadowRadius: GLASS.imIn.shadow.radius,
            }}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Check size={16} color="#FFFFFF" />
                <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.2 }}>I'm In</Text>
              </>
            )}
          </Pressable>
          {/* Save — glass secondary */}
          <Pressable
            onPress={onRsvpInterested}
            disabled={isPending}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              paddingHorizontal: 20,
              borderRadius: 16,
              backgroundColor: saveGlass.bg,
              borderWidth: 1,
              borderColor: saveGlass.border,
            }}
          >
            <Heart size={16} color={colors.text} />
            <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: colors.text }}>
              {myRsvpStatus === "interested" ? "Saved \u2713" : "Save"}
            </Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}
