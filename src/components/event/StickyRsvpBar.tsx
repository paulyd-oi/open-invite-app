import React from "react";
import { Pressable, View, Text, ActivityIndicator, StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Check, Heart, Users } from "@/ui/icons";

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
  onRsvpGoing: () => void;
  onRsvpInterested: () => void;
}

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
}: StickyRsvpBarProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(300).springify()}
      style={{
        position: "absolute",
        bottom: 0,
        ...(screenWidth >= 768
          ? {
              left: Math.max(16, (screenWidth - 600) / 2),
              right: Math.max(16, (screenWidth - 600) / 2),
              borderRadius: 20,
              paddingBottom: bottomInset + 12,
            }
          : {
              left: 0,
              right: 0,
              paddingBottom: bottomInset + 8,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
            }),
        paddingTop: 10,
        paddingHorizontal: 16,
        backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.92)",
      }}
    >
      {effectiveGoingCount > 0 && (
        <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textTertiary, textAlign: "center", marginBottom: 6 }}>
          {effectiveGoingCount} going
        </Text>
      )}
      {isFull ? (
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}>
          <View style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: "#E5E7EB",
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
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 999,
              backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
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
          <Pressable
            onPress={onRsvpGoing}
            disabled={isPending}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 13,
              borderRadius: 999,
              backgroundColor: "#22C55E",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
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
          <Pressable
            onPress={onRsvpInterested}
            disabled={isPending}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 13,
              paddingHorizontal: 20,
              borderRadius: 999,
              backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
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
