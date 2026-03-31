import React, { useState, useEffect, useRef } from "react";
import { Pressable, View, Text, ActivityIndicator } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Heart, Users, Share2 } from "@/ui/icons";

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
  onRsvpNotGoing?: () => void;
  onShare?: () => void;
}

// Glass surface tokens
const GLASS = {
  going: {
    bg: "#22C55E",
    border: "rgba(255,255,255,0.25)",
    shadow: { color: "#22C55E", opacity: 0.35, radius: 8, offset: { width: 0, height: 3 } },
  },
  cantGo: {
    bg: "#EF4444",
    border: "rgba(255,255,255,0.25)",
    shadow: { color: "#EF4444", opacity: 0.25, radius: 8, offset: { width: 0, height: 3 } },
  },
  muted: {
    dark: { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.15)" },
    light: { bg: "rgba(255,255,255,0.60)", border: "rgba(0,0,0,0.08)" },
  },
  full: {
    dark: { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.10)" },
    light: { bg: "rgba(0,0,0,0.04)", border: "rgba(0,0,0,0.06)" },
  },
} as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  onRsvpNotGoing,
  onShare,
}: StickyRsvpBarProps) {
  const mutedGlass = isDark ? GLASS.muted.dark : GLASS.muted.light;
  const fullGlass = isDark ? GLASS.full.dark : GLASS.full.light;
  const isConfirmed = myRsvpStatus === "going";
  const isDeclined = myRsvpStatus === "not_going";
  const [showOptions, setShowOptions] = useState(false);

  // Close floating options when RSVP status changes (mutation completed)
  const prevStatus = useRef(myRsvpStatus);
  useEffect(() => {
    if (prevStatus.current !== myRsvpStatus) {
      setShowOptions(false);
      prevStatus.current = myRsvpStatus;
    }
  }, [myRsvpStatus]);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: bottomInset + 8,
        paddingTop: 10,
        paddingHorizontal: 16,
      }}
    >
      {/* Tap-outside backdrop to dismiss floating options */}
      {showOptions && (
        <Pressable
          onPress={() => setShowOptions(false)}
          style={{
            position: "absolute",
            top: -2000,
            left: -100,
            right: -100,
            bottom: 0,
          }}
        />
      )}

      {effectiveGoingCount > 0 && (
        <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textTertiary, textAlign: "center", marginBottom: 6 }}>
          {effectiveGoingCount} going
        </Text>
      )}

      {/* ── Floating response options (fade in above bar) ── */}
      {showOptions && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          {isConfirmed ? (
            /* Post-RSVP options: "Change to Can't go" + "Never mind" */
            <>
              <AnimatedPressable
                onPress={() => { onRsvpNotGoing?.(); }}
                disabled={isPending}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 24,
                  backgroundColor: GLASS.cantGo.bg,
                  borderWidth: 1,
                  borderColor: GLASS.cantGo.border,
                  shadowColor: GLASS.cantGo.shadow.color,
                  shadowOffset: GLASS.cantGo.shadow.offset,
                  shadowOpacity: GLASS.cantGo.shadow.opacity,
                  shadowRadius: GLASS.cantGo.shadow.radius,
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>Can't go</Text>
                )}
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setShowOptions(false)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 24,
                  backgroundColor: mutedGlass.bg,
                  borderWidth: 1,
                  borderColor: mutedGlass.border,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>Never mind</Text>
              </AnimatedPressable>
            </>
          ) : isDeclined ? (
            /* Post-decline options: "Change to Going" + "Never mind" */
            <>
              <AnimatedPressable
                onPress={onRsvpGoing}
                disabled={isPending}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 24,
                  backgroundColor: GLASS.going.bg,
                  borderWidth: 1,
                  borderColor: GLASS.going.border,
                  shadowColor: GLASS.going.shadow.color,
                  shadowOffset: GLASS.going.shadow.offset,
                  shadowOpacity: GLASS.going.shadow.opacity,
                  shadowRadius: GLASS.going.shadow.radius,
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>I'm going</Text>
                )}
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setShowOptions(false)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 24,
                  backgroundColor: mutedGlass.bg,
                  borderWidth: 1,
                  borderColor: mutedGlass.border,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>Never mind</Text>
              </AnimatedPressable>
            </>
          ) : (
            /* Pre-RSVP options: "I'm going" + "Can't go" */
            <>
              <AnimatedPressable
                onPress={onRsvpGoing}
                disabled={isPending}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 24,
                  borderRadius: 24,
                  backgroundColor: GLASS.going.bg,
                  borderWidth: 1,
                  borderColor: GLASS.going.border,
                  shadowColor: GLASS.going.shadow.color,
                  shadowOffset: GLASS.going.shadow.offset,
                  shadowOpacity: GLASS.going.shadow.opacity,
                  shadowRadius: GLASS.going.shadow.radius,
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>I'm going</Text>
                )}
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => { onRsvpNotGoing?.(); }}
                disabled={isPending}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 24,
                  borderRadius: 24,
                  backgroundColor: GLASS.cantGo.bg,
                  borderWidth: 1,
                  borderColor: GLASS.cantGo.border,
                  shadowColor: GLASS.cantGo.shadow.color,
                  shadowOffset: GLASS.cantGo.shadow.offset,
                  shadowOpacity: GLASS.cantGo.shadow.opacity,
                  shadowRadius: GLASS.cantGo.shadow.radius,
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>Can't go</Text>
              </AnimatedPressable>
            </>
          )}
        </Animated.View>
      )}

      {/* ── Main bar buttons ── */}
      {isFull && !isConfirmed ? (
        /* Full event — disabled "Full" + Save */
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <View style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 14,
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
              paddingVertical: 14,
              paddingHorizontal: 20,
              borderRadius: 16,
              backgroundColor: mutedGlass.bg,
              borderWidth: 1,
              borderColor: mutedGlass.border,
            }}
          >
            <Heart size={16} color={colors.text} />
            <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: colors.text }}>
              {myRsvpStatus === "interested" ? "Saved \u2713" : "Save"}
            </Text>
          </Pressable>
        </View>
      ) : isConfirmed ? (
        /* Post-RSVP: "Going ✓" (green) + "Share" */
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Pressable
            onPress={() => setShowOptions(!showOptions)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 16,
              backgroundColor: GLASS.going.bg,
              borderWidth: 1,
              borderColor: GLASS.going.border,
              shadowColor: GLASS.going.shadow.color,
              shadowOffset: GLASS.going.shadow.offset,
              shadowOpacity: GLASS.going.shadow.opacity,
              shadowRadius: GLASS.going.shadow.radius,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.2 }}>Going ✓</Text>
          </Pressable>
          {onShare && (
            <Pressable
              onPress={onShare}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 14,
                paddingHorizontal: 20,
                borderRadius: 16,
                backgroundColor: mutedGlass.bg,
                borderWidth: 1,
                borderColor: mutedGlass.border,
              }}
            >
              <Share2 size={14} color={colors.text} />
              <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: colors.text }}>Share</Text>
            </Pressable>
          )}
        </View>
      ) : isDeclined ? (
        /* Post-decline: red "Can't go" + "Save" */
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Pressable
            onPress={() => setShowOptions(!showOptions)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 16,
              backgroundColor: GLASS.cantGo.bg,
              borderWidth: 1,
              borderColor: GLASS.cantGo.border,
              shadowColor: GLASS.cantGo.shadow.color,
              shadowOffset: GLASS.cantGo.shadow.offset,
              shadowOpacity: GLASS.cantGo.shadow.opacity,
              shadowRadius: GLASS.cantGo.shadow.radius,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.2 }}>Can't go</Text>
          </Pressable>
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
              backgroundColor: mutedGlass.bg,
              borderWidth: 1,
              borderColor: mutedGlass.border,
            }}
          >
            <Heart size={16} color={colors.text} />
            <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: colors.text }}>Save</Text>
          </Pressable>
        </View>
      ) : (
        /* Pre-RSVP: "Going?" (muted) + "Save" */
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          opacity: isPending ? 0.6 : 1,
        }}>
          <Pressable
            onPress={() => setShowOptions(!showOptions)}
            disabled={isPending}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 16,
              backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.07)",
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.10)",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, letterSpacing: 0.2 }}>Going?</Text>
          </Pressable>
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
              backgroundColor: mutedGlass.bg,
              borderWidth: 1,
              borderColor: mutedGlass.border,
            }}
          >
            <Heart size={16} color={colors.text} />
            <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: colors.text }}>
              {myRsvpStatus === "interested" ? "Saved \u2713" : "Save"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
