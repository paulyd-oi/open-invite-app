import React from "react";
import { Pressable, View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Check, Heart, X, Share2 } from "@/ui/icons";
import { STATUS } from "@/ui/tokens";
import { RADIUS } from "@/ui/layout";

interface RsvpStatusDisplayColors {
  textSecondary: string;
  textTertiary: string;
}

interface RsvpStatusDisplayProps {
  myRsvpStatus: string;
  isPending: boolean;
  isDark: boolean;
  themeColor: string;
  colors: RsvpStatusDisplayColors;
  showRsvpOptions: boolean;
  onToggleOptions: () => void;
  onShareWithFriends: () => void;
}

export function RsvpStatusDisplay({
  myRsvpStatus,
  isPending,
  isDark,
  themeColor,
  colors,
  showRsvpOptions,
  onToggleOptions,
  onShareWithFriends,
}: RsvpStatusDisplayProps) {
  return (
    <Animated.View entering={FadeInDown.duration(250)} style={{ marginBottom: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: RADIUS.xl,
          backgroundColor: "rgba(255, 255, 255, 0.28)",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.42)",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {myRsvpStatus === "going" && <Check size={18} color="#16A34A" />}
          {myRsvpStatus === "interested" && <Heart size={18} color={STATUS.interested.fg} />}
          {myRsvpStatus === "not_going" && <X size={18} color={colors.textTertiary} />}
          <Text style={{
            marginLeft: 8,
            fontSize: 15,
            fontWeight: "600",
            color: myRsvpStatus === "going" ? "#15803D" :
                   myRsvpStatus === "interested" ? STATUS.interested.fg : colors.textSecondary,
          }}>
            {myRsvpStatus === "going" ? "You\u2019re In" :
             myRsvpStatus === "interested" ? "Saved" : "Not Going"}
          </Text>
        </View>
        <Pressable
          onPress={onToggleOptions}
          disabled={isPending}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: "rgba(255, 255, 255, 0.42)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.5)" }}
        >
          <Text style={{ fontSize: 13, fontWeight: "500", color: "#374151" }}>Change</Text>
        </Pressable>
      </View>
      {myRsvpStatus === "going" && (
        <Pressable
          onPress={onShareWithFriends}
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            marginTop: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 16,
            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          }}
        >
          <Share2 size={14} color={themeColor} />
          <Text style={{ fontSize: 13, fontWeight: "500", marginLeft: 6, color: themeColor }}>Share with friends</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
