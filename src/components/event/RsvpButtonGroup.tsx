import React from "react";
import { ActivityIndicator, Pressable, View, Text, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { Check, Heart, Users } from "@/ui/icons";
import { STATUS } from "@/ui/tokens";
import { RADIUS } from "@/ui/layout";

interface RsvpButtonGroupColors {
  textSecondary: string;
  textTertiary: string;
}

interface RsvpButtonGroupProps {
  myRsvpStatus: string | null;
  isFull: boolean;
  isPending: boolean;
  themeColor: string;
  accentColor: string;
  colors: RsvpButtonGroupColors;
  animStyle: ViewStyle;
  onRsvpGoing: () => void;
  onRsvpInterested: () => void;
  onRsvpNotGoing: () => void;
}

export function RsvpButtonGroup({
  myRsvpStatus,
  isFull,
  isPending,
  themeColor,
  accentColor,
  colors,
  animStyle,
  onRsvpGoing,
  onRsvpInterested,
  onRsvpNotGoing,
}: RsvpButtonGroupProps) {
  return (
    <Animated.View style={animStyle}>
      {/* Full indicator */}
      {isFull && myRsvpStatus !== "going" && (
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 10,
          marginBottom: 8,
          borderRadius: RADIUS.sm,
          backgroundColor: STATUS.destructive.bgSoft,
        }}>
          <Users size={14} color={STATUS.destructive.fg} />
          <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "500", color: STATUS.destructive.fg }}>This invite is full</Text>
        </View>
      )}
      {/* Pending indicator */}
      {isPending && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginBottom: 6 }}>
          <ActivityIndicator size="small" color={themeColor} />
          <Text style={{ marginLeft: 8, fontSize: 13, color: colors.textSecondary }}>Updating\u2026</Text>
        </View>
      )}
      {/* Two independent pill buttons — row wrapper has NO visual styling */}
      <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, opacity: isPending ? 0.6 : 1 }}>
        {/* Going — Primary pill (solid filled green) */}
        {isFull && myRsvpStatus !== "going" ? (
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 14,
            paddingHorizontal: 28,
            minHeight: 48,
            borderRadius: 999,
            backgroundColor: "#E5E7EB",
            opacity: 0.6,
          }}>
            <Users size={18} color={colors.textTertiary} />
            <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: "600", color: colors.textTertiary }}>Full</Text>
          </View>
        ) : (
          <Pressable
            testID="event-detail-action-going"
            onPress={onRsvpGoing}
            disabled={isPending}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              paddingHorizontal: 28,
              minHeight: 48,
              borderRadius: 999,
              backgroundColor: "#22C55E",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
            }}
          >
            <Check size={18} color="#FFFFFF" />
            <Text style={{
              marginLeft: 8,
              fontSize: 16,
              fontWeight: "700",
              color: "#FFFFFF",
              letterSpacing: 0.2,
            }}>
              {myRsvpStatus === "going" ? "Going \u2713" : "I'm In"}
            </Text>
          </Pressable>
        )}

        {/* Save — Secondary pill (outlined) */}
        <Pressable
          testID="event-detail-action-save"
          onPress={onRsvpInterested}
          disabled={isPending}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 14,
            paddingHorizontal: 28,
            minHeight: 48,
            borderRadius: 999,
            backgroundColor: "rgba(255, 255, 255, 0.42)",
            borderWidth: 1.5,
            borderColor: "rgba(255, 255, 255, 0.55)",
          }}
        >
          <Heart size={18} color={accentColor} />
          <Text style={{
            marginLeft: 8,
            fontSize: 15,
            fontWeight: "600",
            color: accentColor,
          }}>
            {myRsvpStatus === "interested" ? "Saved \u2713" : "Save"}
          </Text>
        </Pressable>
      </View>

      {/* Not Going — tertiary text link */}
      {myRsvpStatus && myRsvpStatus !== "not_going" && (
        <Pressable
          testID="event-detail-action-not-going"
          onPress={onRsvpNotGoing}
          disabled={isPending}
          style={{ alignSelf: "center", marginTop: 12, paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 13, color: colors.textTertiary }}>Can't make it</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
